import { fromBase64Url, toBase64Url } from "./crypto.js";

/**
 * Encryption for the one secret this service stores on behalf of a user: their
 * model API key.
 *
 * The key is derived from a Worker secret, so the D1 rows on their own are not
 * enough to use anything: a dump of `provider_keys` yields ciphertext, and the
 * material that decrypts it never leaves the environment binding.
 */
export interface Sealed {
  readonly ciphertext: string;
  readonly iv: string;
}

const keyOf = async (secret: string): Promise<CryptoKey> => {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
};

export const seal = async (secret: string, value: string): Promise<Sealed> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyOf(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return { ciphertext: toBase64Url(new Uint8Array(encrypted)), iv: toBase64Url(iv) };
};

/** Null rather than a throw: a key that cannot be opened is a key we do not have. */
export const unseal = async (secret: string, sealed: Sealed): Promise<string | null> => {
  try {
    const key = await keyOf(secret);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(sealed.iv) },
      key,
      fromBase64Url(sealed.ciphertext),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
};
