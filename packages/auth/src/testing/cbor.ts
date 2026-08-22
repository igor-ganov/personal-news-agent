/**
 * Just enough CBOR to build what an authenticator emits: attestation objects
 * and COSE keys. Decoding is the server's job (SimpleWebAuthn does it), so
 * this side only encodes.
 */

export type CborValue = number | string | Uint8Array | readonly CborValue[] | CborMap;
export type CborMap = ReadonlyMap<number | string, CborValue>;

const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

/** Major type in the top three bits, then the argument in whatever fits. */
const head = (major: number, argument: number): Uint8Array => {
  const tag = major << 5;
  if (argument < 24) return Uint8Array.of(tag | argument);
  if (argument < 0x100) return Uint8Array.of(tag | 24, argument);
  if (argument < 0x10000) return Uint8Array.of(tag | 25, argument >> 8, argument & 0xff);
  return Uint8Array.of(
    tag | 26,
    (argument >>> 24) & 0xff,
    (argument >>> 16) & 0xff,
    (argument >>> 8) & 0xff,
    argument & 0xff,
  );
};

export const encodeCbor = (value: CborValue): Uint8Array => {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("CBOR: поддерживаются только целые числа");
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return concat([head(3, bytes.byteLength), bytes]);
  }
  if (value instanceof Uint8Array) return concat([head(2, value.byteLength), value]);
  if (Array.isArray(value)) return concat([head(4, value.length), ...value.map(encodeCbor)]);

  const entries = [...(value as CborMap).entries()];
  return concat([
    head(5, entries.length),
    ...entries.flatMap(([key, item]) => [encodeCbor(key), encodeCbor(item)]),
  ]);
};
