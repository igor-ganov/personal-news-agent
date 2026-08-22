import type { AuthClient, AuthError, AuthSession, SessionStore } from "@pna/auth";
import {
  accountOwner,
  claimState,
  clearedLocalState,
  emptyState,
  isEmptyState,
  LOCAL_OWNER,
  mergeStates,
  ok,
  summariseClaim,
  type AppState,
  type ClaimStrategy,
  type ClaimSummary,
  type Result,
} from "@pna/core";
import { decodeStateValue, type OwnedRepository } from "@pna/storage";
import type { Store } from "../store.js";

/**
 * The data the account holds right now, as this device sees it.
 *
 * Two sources have to agree: what the server has, and what this device saved
 * for that account last time it was signed in. The union of the two is what the
 * account "already has" — a device that synced and then went offline is not a
 * device whose data should vanish on the next sign-in.
 */
const accountStateOf = (remote: AppState | null, cached: AppState | null): AppState => {
  if (!remote) return cached ?? emptyState();
  if (!cached) return remote;
  return mergeStates(cached, remote);
};

/** A sign-in that stopped to ask what to do with the data already on the device. */
export interface PendingClaim {
  readonly session: AuthSession;
  readonly local: AppState;
  readonly account: AppState;
  readonly revision: number;
  readonly summary: ClaimSummary;
}

export type SignInOutcome =
  | { readonly kind: "signed-in"; readonly session: AuthSession }
  | { readonly kind: "needs-choice"; readonly pending: PendingClaim };

export type SyncOutcome =
  | { readonly kind: "synced"; readonly revision: number }
  /** Signed out — there is nothing to sync with, and that is not a failure. */
  | { readonly kind: "offline" };

export interface AccountDeps {
  readonly client: AuthClient;
  readonly sessions: SessionStore;
  readonly repository: OwnedRepository;
  readonly store: Store;
}

const remoteState = (body: unknown): AppState | null => {
  if (body === null || body === undefined) return null;
  const decoded = decodeStateValue(body);
  // A document this app cannot read is not evidence the account is empty, but
  // there is nothing useful to merge either; treating it as absent keeps the
  // sign-in working and the unreadable copy is overwritten on the next push.
  return decoded.ok ? decoded.value : null;
};

export const createAccountService = (deps: AccountDeps) => {
  const { client, sessions, repository, store } = deps;
  let session: AuthSession | null = null;

  const adopt = async (state: AppState): Promise<void> => {
    repository.use(state.owner);
    await repository.save(state);
    store.dispatch({ type: "state/replace", state });
  };

  /** Reads both sides of the decision without changing anything. */
  const prepare = async (next: AuthSession): Promise<Result<PendingClaim, AuthError>> => {
    const localLoaded = await repository.of(LOCAL_OWNER).load();
    const local = localLoaded.ok && localLoaded.value ? localLoaded.value : emptyState();

    const owner = accountOwner(next.account.id);
    const cachedLoaded = await repository.of(owner).load();
    const cached = cachedLoaded.ok ? cachedLoaded.value : null;

    const pulled = await client.pull(next.token);
    if (!pulled.ok) return pulled;

    const account = accountStateOf(remoteState(pulled.value.body), cached);
    return ok({
      session: next,
      local,
      account,
      revision: pulled.value.revision,
      summary: summariseClaim(local, account),
    });
  };

  /**
   * Applies the decision: the account's document becomes the claimed state, the
   * device's local document is emptied so signing out later cannot resurrect
   * data that now belongs to the account, and the result is pushed.
   */
  const apply = async (
    pending: PendingClaim,
    strategy: ClaimStrategy,
  ): Promise<Result<AuthSession, AuthError>> => {
    const claimed = claimState({
      local: pending.local,
      account: pending.account,
      accountId: pending.session.account.id,
      strategy,
    });

    await repository.of(LOCAL_OWNER).save(clearedLocalState(pending.local));
    await adopt(claimed);
    await sessions.save(pending.session);
    session = pending.session;

    const pushed = await push(pending.session.token, pending.revision, claimed);
    // A push that failed leaves the app signed in and holding the right data;
    // the next sync sends it. Losing the sign-in over a flaky network would be
    // the worse outcome.
    return pushed.ok || pushed.error.kind !== "unauthorized" ? ok(pending.session) : pushed;
  };

  const push = async (
    token: string,
    revision: number,
    state: AppState,
  ): Promise<Result<number, AuthError>> => {
    const first = await client.push(token, revision, state);
    if (!first.ok) return first;
    if (first.value.kind === "saved") return ok(first.value.revision);

    // Someone wrote between the pull and the push. Merge their document under
    // ours — the local side is what the user just did — and push once more.
    const merged = mergeStates(remoteState(first.value.remote.body) ?? emptyState(), state);
    await adopt(merged);

    const second = await client.push(token, first.value.remote.revision, merged);
    if (!second.ok) return second;
    return ok(second.value.kind === "saved" ? second.value.revision : first.value.remote.revision);
  };

  /** The half both registration and sign-in share, once a session exists. */
  const finish = async (
    attempt: Promise<Result<AuthSession, AuthError>>,
  ): Promise<Result<SignInOutcome, AuthError>> => {
    const started = await attempt;
    if (!started.ok) return started;

    const pending = await prepare(started.value);
    if (!pending.ok) return pending;

    if (pending.value.summary.needsChoice) return ok({ kind: "needs-choice", pending: pending.value });

    const applied = await apply(pending.value, pending.value.summary.suggested);
    return applied.ok ? ok({ kind: "signed-in", session: applied.value }) : applied;
  };

  return {
    current: (): AuthSession | null => session,

    /** False on a device with no authenticator: the screen then explains why. */
    isPasskeySupported: () => client.isPasskeySupported(),

    /** The account and its registered keys, straight from the server. */
    details: (token: string) => client.me(token),

    removePasskey: (token: string, credentialId: string) => client.removePasskey(token, credentialId),

    /** Picks up a session saved on a previous run and loads that account's data. */
    async restore(): Promise<AuthSession | null> {
      const saved = await sessions.load();
      if (!saved) return null;

      const owner = accountOwner(saved.account.id);
      const loaded = await repository.of(owner).load();
      if (loaded.ok && loaded.value) {
        repository.use(owner);
        store.dispatch({ type: "state/replace", state: loaded.value });
      }

      session = saved;
      return saved;
    },

    register: (input: { email: string; label?: string }) => finish(client.register(input)),

    signIn: (input: { email?: string | null } = {}) => finish(client.login(input)),

    /** Answers the question `needs-choice` asked. */
    resolveClaim: (pending: PendingClaim, strategy: ClaimStrategy) => apply(pending, strategy),

    async signOut(): Promise<void> {
      const token = session?.token;
      session = null;
      await sessions.clear();

      repository.use(LOCAL_OWNER);
      const local = await repository.load();
      store.dispatch({
        type: "state/replace",
        state: local.ok && local.value ? local.value : emptyState(),
      });

      // Best effort: the local session is already gone, so a server that cannot
      // be reached only means one token stays valid until it expires.
      if (token) await client.logout(token);
    },

    async sync(): Promise<Result<SyncOutcome, AuthError>> {
      const active = session;
      if (!active) return ok({ kind: "offline" });

      const pulled = await client.pull(active.token);
      if (!pulled.ok) return pulled;

      const incoming = remoteState(pulled.value.body);
      const local = store.getState();
      // The device's own state wins on collisions: it is what the user just
      // did, and the remote copy is by definition older than this moment.
      const merged = incoming ? mergeStates(incoming, local) : local;
      if (incoming && !isEmptyState(incoming)) await adopt(merged);

      const pushed = await push(active.token, pulled.value.revision, merged);
      return pushed.ok ? ok({ kind: "synced", revision: pushed.value }) : pushed;
    },
  };
};

export type AccountService = ReturnType<typeof createAccountService>;
