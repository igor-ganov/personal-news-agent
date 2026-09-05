import {
  accountId,
  err,
  instantOf,
  isPlausibleEmail,
  normaliseEmail,
  ok,
  type Account,
  type Instant,
  type PasskeyRef,
  type Result,
} from "@pna/core";
import { authError, errorFromPasskeyFailure, type AuthError } from "./errors.js";
import type {
  AuthenticationResponseJson,
  PasskeyAgent,
  PasskeyCreationOptions,
  PasskeyRequestOptions,
  RegistrationResponseJson,
} from "./ports/passkeys.js";
import type { Transport } from "./transport.js";

export interface AuthSession {
  readonly token: string;
  readonly expiresAt: Instant;
  readonly account: Account;
}

/** A link that adds one more device to the account, and when it stops working. */
export interface DeviceInvite {
  readonly url: string;
  readonly expiresAt: Instant;
}

export interface AccountDetails {
  readonly account: Account;
  readonly passkeys: readonly PasskeyRef[];
}

export interface RemoteDocument {
  readonly revision: number;
  readonly updatedAt: Instant | null;
  readonly body: unknown;
}

export type PushOutcome =
  | { readonly kind: "saved"; readonly revision: number; readonly updatedAt: Instant | null }
  /** Someone else wrote first; their document comes back so it can be merged. */
  | { readonly kind: "conflict"; readonly remote: RemoteDocument };

interface AccountPayload {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayName: string;
  readonly createdAt: string;
}

const parseAccount = (raw: AccountPayload): Account => ({
  id: accountId(raw.id),
  email: raw.email,
  emailVerified: raw.emailVerified === true,
  displayName: raw.displayName || raw.email,
  createdAt: instantOf(raw.createdAt),
});

const parsePasskey = (raw: {
  credentialId: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}): PasskeyRef => ({
  credentialId: raw.credentialId,
  label: raw.label,
  createdAt: instantOf(raw.createdAt),
  lastUsedAt: raw.lastUsedAt ? instantOf(raw.lastUsedAt) : null,
});

const parseDocument = (raw: { revision?: number; updatedAt?: string | null; body?: unknown }): RemoteDocument => ({
  revision: typeof raw.revision === "number" ? raw.revision : 0,
  updatedAt: raw.updatedAt ? instantOf(raw.updatedAt) : null,
  body: raw.body ?? null,
});

export interface AuthClientOptions {
  readonly transport: Transport;
  readonly passkeys: PasskeyAgent;
}

/**
 * Registration and sign-in, as the app sees them.
 *
 * Each flow is two round-trips with a passkey prompt in between, and the
 * middle step is the one that can be refused by the user — so a cancelled
 * prompt is reported as its own kind of failure rather than as a server error.
 */
export const createAuthClient = (options: AuthClientOptions) => {
  const { transport, passkeys } = options;

  const usePasskey = async <T>(action: () => Promise<T>): Promise<Result<T, AuthError>> => {
    try {
      return ok(await action());
    } catch (error) {
      return err(errorFromPasskeyFailure(error));
    }
  };

  return {
    isPasskeySupported: () => passkeys.isAvailable(),

    async register(input: { email: string; label?: string }): Promise<Result<AuthSession, AuthError>> {
      const email = normaliseEmail(input.email);
      if (!isPlausibleEmail(email))
        return err(authError("invalid", "Проверьте адрес почты"));

      const started = await transport.request<{ challengeId: string; options: PasskeyCreationOptions }>(
        "/auth/register/options",
        { method: "POST", body: { email } },
      );
      if (!started.ok) return started;

      const attestation = await usePasskey<RegistrationResponseJson>(() =>
        passkeys.create(started.value.options),
      );
      if (!attestation.ok) return attestation;

      const verified = await transport.request<{
        token: string;
        expiresAt: string;
        account: AccountPayload;
      }>("/auth/register/verify", {
        method: "POST",
        body: {
          challengeId: started.value.challengeId,
          label: input.label ?? "",
          response: attestation.value,
        },
      });
      if (!verified.ok) return verified;

      return ok({
        token: verified.value.token,
        expiresAt: instantOf(verified.value.expiresAt),
        account: parseAccount(verified.value.account),
      });
    },

    async login(input: { email?: string | null } = {}): Promise<Result<AuthSession, AuthError>> {
      const email = input.email ? normaliseEmail(input.email) : null;
      if (email !== null && !isPlausibleEmail(email))
        return err(authError("invalid", "Проверьте адрес почты"));

      const started = await transport.request<{ challengeId: string; options: PasskeyRequestOptions }>(
        "/auth/login/options",
        { method: "POST", body: email ? { email } : {} },
      );
      if (!started.ok) return started;

      const assertion = await usePasskey<AuthenticationResponseJson>(() =>
        passkeys.get(started.value.options),
      );
      if (!assertion.ok) return assertion;

      const verified = await transport.request<{
        token: string;
        expiresAt: string;
        account: AccountPayload;
      }>("/auth/login/verify", {
        method: "POST",
        body: { challengeId: started.value.challengeId, response: assertion.value },
      });
      if (!verified.ok) return verified;

      return ok({
        token: verified.value.token,
        expiresAt: instantOf(verified.value.expiresAt),
        account: parseAccount(verified.value.account),
      });
    },

    async me(token: string): Promise<Result<AccountDetails, AuthError>> {
      const response = await transport.request<{
        account: AccountPayload;
        passkeys: Parameters<typeof parsePasskey>[0][];
      }>("/auth/me", { token });
      if (!response.ok) return response;

      return ok({
        account: parseAccount(response.value.account),
        passkeys: (response.value.passkeys ?? []).map(parsePasskey),
      });
    },

    async logout(token: string): Promise<Result<null, AuthError>> {
      const response = await transport.request("/auth/logout", { method: "POST", token, body: {} });
      return response.ok ? ok(null) : response;
    },

    /**
     * A one-time link that enrolls another device into this account.
     *
     * The link carries the invite in its fragment, which is what keeps it out
     * of server logs and out of the Referer header on the way there.
     */
    async deviceInvite(token: string): Promise<Result<DeviceInvite, AuthError>> {
      const response = await transport.request<{ url?: string; expiresAt?: string }>(
        "/auth/invite",
        { method: "POST", token, body: {} },
      );
      if (!response.ok) return response;

      const url = response.value.url ?? "";
      return url
        ? ok({ url, expiresAt: instantOf(response.value.expiresAt ?? new Date().toISOString()) })
        : err(authError("server", "Сервер не вернул ссылку"));
    },

    async removePasskey(token: string, credentialId: string): Promise<Result<null, AuthError>> {
      const response = await transport.request(`/auth/passkeys/${encodeURIComponent(credentialId)}`, {
        method: "DELETE",
        token,
      });
      return response.ok ? ok(null) : response;
    },

    async pull(token: string): Promise<Result<RemoteDocument, AuthError>> {
      const response = await transport.request<Parameters<typeof parseDocument>[0]>("/state", { token });
      return response.ok ? ok(parseDocument(response.value)) : response;
    },

    async push(token: string, revision: number, body: unknown): Promise<Result<PushOutcome, AuthError>> {
      const response = await transport.request<{ revision: number; updatedAt: string | null }>("/state", {
        method: "PUT",
        token,
        body: { revision, body },
      });

      if (response.ok)
        return ok({
          kind: "saved",
          revision: response.value.revision,
          updatedAt: response.value.updatedAt ? instantOf(response.value.updatedAt) : null,
        });

      // A conflict is an outcome of pushing, not a failure of it: the caller
      // merges and pushes again.
      if (response.error.kind === "conflict" && response.error.details)
        return ok({ kind: "conflict", remote: parseDocument(response.error.details) });

      return response;
    },
  };
};

export type AuthClient = ReturnType<typeof createAuthClient>;
