/**
 * Every way signing in can fail, as a closed set.
 *
 * The UI branches on `kind`, never on the message: the server's wording may
 * change, and a cancelled passkey prompt has to read differently from a dead
 * network even though both leave the user signed out.
 */
export type AuthErrorKind =
  | "network"
  | "cancelled"
  /** No passkey for this account on this device — a fork, not a failure. */
  | "no_credential"
  /**
   * The device offered a key the server has never seen: a leftover from a
   * deleted account or another deployment. Unusable, so it means the same
   * thing as having none.
   */
  | "unknown_credential"
  | "unsupported"
  | "invalid"
  | "email_taken"
  | "unauthorized"
  | "expired"
  | "conflict"
  | "rate_limited"
  | "server";

export interface AuthError {
  readonly kind: AuthErrorKind;
  readonly message: string;
  /**
   * The error body as sent. A revision conflict carries the current document
   * with it, and that document is the whole point of the conflict — dropping it
   * would force a second round-trip to merge.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

export const authError = (
  kind: AuthErrorKind,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AuthError => (details ? { kind, message, details } : { kind, message });

const BY_CODE: Readonly<Record<string, AuthErrorKind>> = {
  bad_request: "invalid",
  email_taken: "email_taken",
  unauthorized: "unauthorized",
  verification_failed: "unauthorized",
  unknown_credential: "unknown_credential",
  challenge_expired: "expired",
  rate_limited: "rate_limited",
  last_passkey: "conflict",
  revision_conflict: "conflict",
};

const BY_STATUS: Readonly<Record<number, AuthErrorKind>> = {
  400: "invalid",
  401: "unauthorized",
  403: "unauthorized",
  409: "conflict",
  429: "rate_limited",
};

/**
 * The server's `code` decides when it sends one; the status is the fallback for
 * anything that never reached the handler (a proxy error page, say).
 */
export const errorFromResponse = (
  status: number,
  code: string | undefined,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AuthError =>
  authError(
    (code ? BY_CODE[code] : undefined) ?? BY_STATUS[status] ?? "server",
    message || "Сервер ответил ошибкой",
    details,
  );

/** What the platform throws when a passkey prompt is dismissed or unavailable. */
export const errorFromPasskeyFailure = (error: unknown): AuthError => {
  const name = (error as { name?: string } | null)?.name ?? "";
  const message = (error as Error | null)?.message ?? "Не удалось использовать ключ";
  // The platform said there is nothing to sign in with. That is where a new
  // device starts, so it must not read as a refusal.
  if (name === "NotFoundError")
    return authError("no_credential", "На этом устройстве нет ключа от этого аккаунта");
  if (name === "NotAllowedError" || name === "AbortError")
    return authError("cancelled", "Вход отменён");
  if (name === "NotSupportedError" || name === "SecurityError")
    return authError("unsupported", "Это устройство не поддерживает ключи доступа");
  return authError("cancelled", message);
};

/** Sentences the UI shows when it has nothing more specific to say. */
export const describeAuthError = (error: AuthError): string => error.message;
