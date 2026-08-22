/** Byte helpers shared by the virtual authenticator and its tests. */

export const concatBytes = (...chunks: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Explicitly `ArrayBuffer`-backed: `TextEncoder` says `ArrayBufferLike`, and the
 * WebAuthn library asks for the narrower type. */
export const utf8 = (value: string): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(value);
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
};

export const uint32 = (value: number): Uint8Array =>
  Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);

export const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));

/**
 * WebCrypto signs ECDSA as raw r‖s; WebAuthn's ES256 wants the same pair as an
 * ASN.1 DER SEQUENCE. Nothing else in the stack does this conversion, so the
 * authenticator has to.
 */
export const p1363ToDer = (raw: Uint8Array): Uint8Array => {
  const half = raw.byteLength / 2;
  const integer = (part: Uint8Array): Uint8Array => {
    let start = 0;
    while (start < part.byteLength - 1 && part[start] === 0) start += 1;
    const trimmed = part.slice(start);
    // A leading bit of 1 would read as a negative number, so pad it.
    const body = (trimmed[0] ?? 0) & 0x80 ? concatBytes(Uint8Array.of(0), trimmed) : trimmed;
    return concatBytes(Uint8Array.of(0x02, body.byteLength), body);
  };
  const body = concatBytes(integer(raw.slice(0, half)), integer(raw.slice(half)));
  return concatBytes(Uint8Array.of(0x30, body.byteLength), body);
};
