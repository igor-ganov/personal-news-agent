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

/**
 * What the single door can answer.
 *
 * Signing in and signing up are the same act for the user: they press one
 * button. The account is the passkey, so nothing else is required — an address
 * is a label they may add, not a credential. The extra outcomes cover the two
 * cases the app cannot decide alone: proving this device belongs to an account
 * that already exists elsewhere, and a prompt that was dismissed.
 */
export type EntryOutcome =
  | SignInOutcome
  /** The account exists, but this device has no key for it. */
  | { readonly kind: "needs-device-link"; readonly email: string }
  /**
   * The prompt was dismissed with an address on screen.
   *
   * A browser cannot say "there was nothing to offer" — it reports a dismissal
   * either way — so the app asks instead of guessing: creating an account
   * behind a user who just cancelled would be worse than one more tap.
   */
  | { readonly kind: "offer-create"; readonly email: string };

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

    /** A one-time link that enrolls another device into this account. */
    deviceInvite: (token: string) => client.deviceInvite(token),

    /** Attaches an address to an account that started without one. */
    setEmail: (token: string, email: string) => client.setEmail(token, email),

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

    /**
     * The full system dialog, on purpose.
     *
     * This is the one place a sheet with "ключ с другого устройства" is the
     * point rather than an obstacle: the key lives on another phone and the
     * platform's own QR flow is what brings it here.
     */
    signInFromAnotherDevice: (input: { email?: string | null } = {}) =>
      finish(client.login({ ...input, immediate: false })),

    /**
     * One way in.
     *
     * The key already on the device is tried first — that covers every return
     * visit and needs no address at all. Only when the platform reports that
     * there is nothing to sign in with does the address matter, and then the
     * same press either creates the account or explains that this device has to
     * be linked from the one that already has a key.
     */
    async continueWith(
      input: { email?: string; label?: string; create?: boolean } = {},
    ): Promise<Result<EntryOutcome, AuthError>> {
      const email = (input.email ?? "").trim();
      const label = input.label ? { label: input.label } : {};

      const create = async (): Promise<Result<EntryOutcome, AuthError>> => {
        const registered = await finish(
          client.register({ ...(email ? { email } : {}), ...label }),
        );
        if (registered.ok || registered.error.kind !== "email_taken") return registered;
        return ok({ kind: "needs-device-link", email });
      };

      // A second press that already knows what it wants skips the key prompt.
      if (input.create) return create();

      // Silent: the platform answers from what it already holds. On a device
      // with no key that returns immediately, without the dead-end sheet, and
      // the next line turns the press into a fingerprint and an account.
      const signedIn = await finish(
        client.login({ ...(email ? { email } : {}), immediate: true }),
      );
      if (signedIn.ok) return signedIn;

      // Nothing usable here. Either the platform had no key at all, or it
      // offered one the server does not know — a leftover from an account that
      // no longer exists. For the person holding the phone these are the same
      // situation, and the answer to both is a new key.
      if (signedIn.error.kind === "no_credential" || signedIn.error.kind === "unknown_credential")
        return create();

      // Dismissed. On Android that is a real refusal; in a browser it is also
      // what "nothing to offer" looks like, so the offer to start an account is
      // made rather than an apology — but it is made, not acted on.
      if (signedIn.error.kind === "cancelled") return ok({ kind: "offer-create", email });

      return signedIn;
    },

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
