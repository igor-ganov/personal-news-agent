/** Small wrappers over Web Crypto — the only crypto this service does itself. */

/** UTF-8 bytes of a string, in the exact shape WebAuthn helpers expect. */
export const utf8Bytes = (value: string): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(value);
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
};

export const randomToken = (bytes = 32): string => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
};

export const randomId = (): string => crypto.randomUUID();

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * TypeScript 5.7 made `Uint8Array` generic over its buffer, and the WebAuthn
 * library asks specifically for one backed by an `ArrayBuffer`. Both helpers
 * below therefore say so explicitly rather than leaving it to inference.
 */
export const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * Session tokens are stored as hashes, exactly as a password would be: a leak
 * of the sessions table then reveals which sessions exist, but not how to use
 * any of them.
 */
export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
