export interface Env {
  readonly DB: D1Database;
  /**
   * The WebAuthn Relying Party id — the domain credentials are bound to.
   * A passkey created for one RP id cannot be used for another, so this value
   * is effectively part of the account's identity and must not drift.
   */
  readonly RP_ID: string;
  readonly RP_NAME: string;
  /** Comma-separated origins allowed to call the API and to hold credentials. */
  readonly ALLOWED_ORIGINS: string;
  /** SHA-256 fingerprints of the Android signing certs, comma-separated. */
  readonly ANDROID_CERT_FINGERPRINTS?: string;
  readonly ANDROID_PACKAGE_NAME?: string;
}

export const allowedOrigins = (env: Env): string[] =>
  env.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

/**
 * Android's Credential Manager presents an origin of the form
 * `android:apk-key-hash:<base64url sha-256 of the signing cert>`, which is not
 * a URL and never appears in the browser allowlist. It is accepted only when a
 * fingerprint has been configured, so a misconfigured deployment rejects it
 * rather than trusting anything that looks Android-shaped.
 */
export const androidOrigins = (env: Env): string[] =>
  (env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().replace(/:/g, ""))
    .filter((f) => f.length > 0)
    .map((hex) => `android:apk-key-hash:${hexToBase64Url(hex)}`);

export const hexToBase64Url = (hex: string): string => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const expectedOrigins = (env: Env): string[] => [
  ...allowedOrigins(env),
  ...androidOrigins(env),
];
