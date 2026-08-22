import { fromBase64Url, toBase64Url } from "../bytes.js";
import type {
  AuthenticationResponseJson,
  PasskeyAgent,
  PasskeyCreationOptions,
  PasskeyRequestOptions,
  RegistrationResponseJson,
} from "../ports/passkeys.js";

/**
 * The browser's own WebAuthn API behind the passkey port.
 *
 * All this adapter really does is translate: the wire format is base64url, the
 * DOM API wants ArrayBuffers, and nothing above the port should have to know
 * that. On Android the app swaps this for the Credential Manager plugin and
 * everything else stays identical.
 */

const buffer = (value: string): ArrayBuffer => fromBase64Url(value).buffer as ArrayBuffer;

const encode = (value: ArrayBuffer | null): string | null =>
  value ? toBase64Url(new Uint8Array(value)) : null;

const descriptors = (
  list: readonly { id: string; type?: string; transports?: readonly string[] }[] | undefined,
): PublicKeyCredentialDescriptor[] =>
  (list ?? []).map((item) => ({
    id: buffer(item.id),
    type: (item.type ?? "public-key") as "public-key",
    ...(item.transports ? { transports: item.transports as AuthenticatorTransport[] } : {}),
  }));

export const browserPasskeys = (): PasskeyAgent => ({
  async isAvailable() {
    if (typeof globalThis.PublicKeyCredential === "undefined") return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  },

  async create(options: PasskeyCreationOptions): Promise<RegistrationResponseJson> {
    const credential = (await navigator.credentials.create({
      publicKey: {
        ...(options as unknown as PublicKeyCredentialCreationOptions),
        challenge: buffer(options.challenge),
        user: { ...options.user, id: buffer(options.user.id) },
        excludeCredentials: descriptors(options.excludeCredentials),
      },
    })) as PublicKeyCredential | null;

    if (!credential) throw Object.assign(new Error("Ключ не создан"), { name: "NotAllowedError" });
    const response = credential.response as AuthenticatorAttestationResponse;

    return {
      id: credential.id,
      rawId: toBase64Url(new Uint8Array(credential.rawId)),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment ?? null,
      clientExtensionResults: credential.getClientExtensionResults() as Record<string, unknown>,
      response: {
        clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
        attestationObject: toBase64Url(new Uint8Array(response.attestationObject)),
        transports: response.getTransports?.() ?? [],
      },
    };
  },

  async get(options: PasskeyRequestOptions): Promise<AuthenticationResponseJson> {
    const credential = (await navigator.credentials.get({
      publicKey: {
        ...(options as unknown as PublicKeyCredentialRequestOptions),
        challenge: buffer(options.challenge),
        allowCredentials: descriptors(options.allowCredentials),
      },
    })) as PublicKeyCredential | null;

    if (!credential) throw Object.assign(new Error("Ключ не выбран"), { name: "NotAllowedError" });
    const response = credential.response as AuthenticatorAssertionResponse;

    return {
      id: credential.id,
      rawId: toBase64Url(new Uint8Array(credential.rawId)),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment ?? null,
      clientExtensionResults: credential.getClientExtensionResults() as Record<string, unknown>,
      response: {
        clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
        authenticatorData: toBase64Url(new Uint8Array(response.authenticatorData)),
        signature: toBase64Url(new Uint8Array(response.signature)),
        userHandle: encode(response.userHandle),
      },
    };
  },
});
