/**
 * A software passkey. It does what a phone's Credential Manager or a browser's
 * built-in authenticator does — mint an ES256 key pair, sign the challenge,
 * hand back the WebAuthn JSON — which lets the whole registration and login
 * round-trip be exercised without a browser in the loop.
 *
 * Test-only: it performs no user verification of its own and stores nothing.
 */

import { concatBytes, fromBase64Url, p1363ToDer, sha256, toBase64Url, uint32, utf8 } from "../bytes.js";
import { encodeCbor, type CborValue } from "./cbor.js";

const ES256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const AAGUID = new Uint8Array(16); // all-zero: "no particular model", as "none" attestation implies.

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_DATA = 0x40;

export interface VirtualCredential {
  readonly id: string;
  readonly transports: readonly string[];
}

export interface VirtualAuthenticatorOptions {
  readonly rpId: string;
  readonly origin: string;
  /** Reported user verification. `false` exercises the UP-only path. */
  readonly userVerified?: boolean;
}

interface StoredKey {
  readonly credentialId: Uint8Array;
  readonly keyPair: CryptoKeyPair;
  counter: number;
}

const clientData = (type: string, challenge: string, origin: string): Uint8Array =>
  utf8(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

/** COSE_Key for an ES256 public key: the form the attestation embeds. */
const coseKey = async (publicKey: CryptoKey): Promise<Uint8Array> => {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  if (!jwk.x || !jwk.y) throw new Error("Ключ без координат");
  return encodeCbor(
    new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, fromBase64Url(jwk.x)],
      [-3, fromBase64Url(jwk.y)],
    ]),
  );
};

const authenticatorData = async (
  rpId: string,
  flags: number,
  counter: number,
  attested?: { credentialId: Uint8Array; cose: Uint8Array },
): Promise<Uint8Array> => {
  const base = concatBytes(await sha256(utf8(rpId)), Uint8Array.of(flags), uint32(counter));
  if (!attested) return base;
  const idLength = Uint8Array.of(
    (attested.credentialId.byteLength >> 8) & 0xff,
    attested.credentialId.byteLength & 0xff,
  );
  return concatBytes(base, AAGUID, idLength, attested.credentialId, attested.cose);
};

export const createVirtualAuthenticator = (options: VirtualAuthenticatorOptions) => {
  const { rpId, origin, userVerified = true } = options;
  const keys = new Map<string, StoredKey>();

  const flags = (attested: boolean): number =>
    FLAG_USER_PRESENT |
    (userVerified ? FLAG_USER_VERIFIED : 0) |
    (attested ? FLAG_ATTESTED_DATA : 0);

  return {
    /** Answers `navigator.credentials.create()`. */
    async create(publicKey: { challenge: string }) {
      const credentialId = crypto.getRandomValues(new Uint8Array(32));
      const keyPair = (await crypto.subtle.generateKey(ES256, false, ["sign", "verify"])) as CryptoKeyPair;
      const id = toBase64Url(credentialId);
      keys.set(id, { credentialId, keyPair, counter: 0 });

      const json = clientData("webauthn.create", publicKey.challenge, origin);
      const authData = await authenticatorData(rpId, flags(true), 0, {
        credentialId,
        cose: await coseKey(keyPair.publicKey),
      });

      const attestationObject = encodeCbor(
        new Map<string, CborValue>([
          ["fmt", "none"],
          ["attStmt", new Map<string, CborValue>()],
          ["authData", authData],
        ]),
      );

      return {
        id,
        rawId: id,
        type: "public-key" as const,
        authenticatorAttachment: "platform" as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: toBase64Url(json),
          attestationObject: toBase64Url(attestationObject),
          transports: ["internal", "hybrid"],
        },
      };
    },

    /** Answers `navigator.credentials.get()`. */
    async get(publicKey: { challenge: string; allowCredentials?: readonly { id: string }[] }) {
      const allowed = publicKey.allowCredentials?.map((c) => c.id);
      const id = allowed?.length ? allowed.find((c) => keys.has(c)) : [...keys.keys()][0];
      const stored = id ? keys.get(id) : undefined;
      if (!id || !stored) throw new Error("Нет подходящего ключа");

      // A real authenticator increments this on every use; the server watches it
      // for cloned credentials, so the virtual one has to behave the same.
      stored.counter += 1;

      const json = clientData("webauthn.get", publicKey.challenge, origin);
      const authData = await authenticatorData(rpId, flags(false), stored.counter);
      const signature = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          stored.keyPair.privateKey,
          concatBytes(authData, await sha256(json)) as BufferSource,
        ),
      );

      return {
        id,
        rawId: id,
        type: "public-key" as const,
        authenticatorAttachment: "platform" as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: toBase64Url(json),
          authenticatorData: toBase64Url(authData),
          signature: toBase64Url(p1363ToDer(signature)),
          userHandle: null,
        },
      };
    },

    /** What the authenticator currently holds, for assertions in tests. */
    credentials(): VirtualCredential[] {
      return [...keys.keys()].map((id) => ({ id, transports: ["internal", "hybrid"] }));
    },
  };
};

export type VirtualAuthenticator = ReturnType<typeof createVirtualAuthenticator>;
