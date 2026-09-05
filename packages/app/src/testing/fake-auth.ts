import type { AuthClient, AuthError, AuthSession, PushOutcome, RemoteDocument } from "@pna/auth";
import { accountId, err, instantOf, ok, type Account, type Result } from "@pna/core";

/**
 * An account server in memory: it keeps one document, numbers its revisions and
 * refuses stale writes, which is the only behaviour the sign-in and sync flows
 * actually depend on.
 */
export interface FakeAuthOptions {
  readonly account?: Partial<Account>;
  /** Makes the next call of that name fail with this error, once. */
  readonly failures?: Partial<Record<"register" | "login" | "pull" | "push", AuthError>>;
}

export interface FakeAuth {
  readonly client: AuthClient;
  readonly account: Account;
  document(): RemoteDocument;
  setDocument(body: unknown, revision?: number): void;
  /** Every call the service made, in order. */
  calls(): readonly string[];
  /** What each login was asked for — the silent probe is a flag on the input. */
  loginInputs(): readonly { readonly email?: string | null; readonly immediate?: boolean }[];
  session(): AuthSession;
}

export const fakeAuthClient = (options: FakeAuthOptions = {}): FakeAuth => {
  const account: Account = {
    id: accountId("acc-1"),
    email: "reader@example.com",
    emailVerified: false,
    displayName: "reader@example.com",
    createdAt: instantOf("2026-08-01T10:00:00.000Z"),
    ...options.account,
  };

  const session: AuthSession = {
    token: "tok",
    expiresAt: instantOf("2026-12-31T10:00:00.000Z"),
    account,
  };

  let document: RemoteDocument = { revision: 0, updatedAt: null, body: null };
  const calls: string[] = [];
  const logins: { email?: string | null; immediate?: boolean }[] = [];
  const pending = { ...options.failures };

  const take = (name: keyof NonNullable<FakeAuthOptions["failures"]>): AuthError | null => {
    const failure = pending[name];
    if (failure) delete pending[name];
    return failure ?? null;
  };

  const client: AuthClient = {
    isPasskeySupported: async () => true,

    async register(): Promise<Result<AuthSession, AuthError>> {
      calls.push("register");
      const failure = take("register");
      return failure ? err(failure) : ok(session);
    },

    async login(input: { email?: string | null; immediate?: boolean } = {}): Promise<
      Result<AuthSession, AuthError>
    > {
      calls.push("login");
      logins.push(input);
      const failure = take("login");
      return failure ? err(failure) : ok(session);
    },

    async me() {
      calls.push("me");
      return ok({ account, passkeys: [] });
    },

    async logout() {
      calls.push("logout");
      return ok(null);
    },

    async removePasskey() {
      calls.push("removePasskey");
      return ok(null);
    },

    async setEmail(_token: string, email: string) {
      calls.push(`setEmail:${email}`);
      return ok({ ...account, email, displayName: email });
    },

    async deviceInvite() {
      calls.push("deviceInvite");
      return ok({
        url: "https://api.test/enroll#t=invite",
        expiresAt: instantOf("2026-08-22T10:10:00.000Z"),
      });
    },

    async pull(): Promise<Result<RemoteDocument, AuthError>> {
      calls.push("pull");
      const failure = take("pull");
      return failure ? err(failure) : ok(document);
    },

    async push(_token: string, revision: number, body: unknown): Promise<Result<PushOutcome, AuthError>> {
      calls.push(`push:${revision}`);
      const failure = take("push");
      if (failure) return err(failure);

      if (revision !== document.revision) return ok({ kind: "conflict", remote: document });

      document = {
        revision: document.revision + 1,
        updatedAt: instantOf("2026-08-22T10:00:00.000Z"),
        body,
      };
      return ok({ kind: "saved", revision: document.revision, updatedAt: document.updatedAt });
    },
  };

  return {
    client,
    account,
    session: () => session,
    document: () => document,
    setDocument(body, revision = 1) {
      document = { revision, updatedAt: instantOf("2026-08-20T10:00:00.000Z"), body };
    },
    calls: () => calls,
    loginInputs: () => logins,
  };
};
