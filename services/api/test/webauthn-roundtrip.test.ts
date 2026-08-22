/**
 * The virtual authenticator against the very verification library the Worker
 * runs. If these pass, a real passkey and this fake one are indistinguishable
 * to the server — which is what makes the end-to-end script trustworthy.
 */

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { beforeAll, describe, expect, it } from "vitest";
import { fromBase64Url, utf8 } from "./bytes.js";
import { createVirtualAuthenticator } from "./virtual-authenticator.js";

const RP_ID = "pna-api.igor-ganov.workers.dev";
const ORIGIN = `https://${RP_ID}`;

const authenticator = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });

const register = async () => {
  const options = await generateRegistrationOptions({
    rpName: "PNA",
    rpID: RP_ID,
    userID: utf8("00000000-0000-4000-8000-000000000001"),
    userName: "probe@example.com",
    attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  const response = await authenticator.create(options);
  const verification = await verifyRegistrationResponse({
    response: response as never,
    expectedChallenge: options.challenge,
    expectedOrigin: [ORIGIN],
    expectedRPID: RP_ID,
    requireUserVerification: false,
  });
  return { options, response, verification };
};

describe("регистрация ключа", () => {
  let registered: Awaited<ReturnType<typeof register>>;
  beforeAll(async () => {
    registered = await register();
  });

  it("проходит проверку", () => {
    expect(registered.verification.verified).toBe(true);
  });

  it("отдаёт публичный ключ и счётчик", () => {
    const info = registered.verification.registrationInfo;
    expect(info?.credential.id).toBe(registered.response.id);
    expect(info?.credential.counter).toBe(0);
    expect(info?.credential.publicKey.byteLength).toBeGreaterThan(50);
  });

  it("сообщает транспорты, чтобы клиент знал, где искать ключ", () => {
    expect(registered.verification.registrationInfo?.credential.transports).toEqual([
      "internal",
      "hybrid",
    ]);
  });

  it("не проходит с чужим challenge", async () => {
    await expect(
      verifyRegistrationResponse({
        response: registered.response as never,
        expectedChallenge: "c29tZS1vdGhlci1jaGFsbGVuZ2U",
        expectedOrigin: [ORIGIN],
        expectedRPID: RP_ID,
      }),
    ).rejects.toThrow();
  });

  it("не проходит с чужого origin", async () => {
    await expect(
      verifyRegistrationResponse({
        response: registered.response as never,
        expectedChallenge: registered.options.challenge,
        expectedOrigin: ["https://evil.example"],
        expectedRPID: RP_ID,
      }),
    ).rejects.toThrow();
  });
});

describe("вход по ключу", () => {
  it("подпись проверяется, а счётчик растёт", async () => {
    const { verification } = await register();
    const credential = verification.registrationInfo!.credential;

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "preferred",
      allowCredentials: [{ id: credential.id }],
    });
    const assertion = await authenticator.get(options);
    const result = await verifyAuthenticationResponse({
      response: assertion as never,
      expectedChallenge: options.challenge,
      expectedOrigin: [ORIGIN],
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
      },
    });

    expect(result.verified).toBe(true);
    expect(result.authenticationInfo.newCounter).toBeGreaterThan(credential.counter);
  });

  it("подделанная подпись не проходит", async () => {
    const { verification } = await register();
    const credential = verification.registrationInfo!.credential;

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: [{ id: credential.id }],
    });
    const assertion = await authenticator.get(options);
    const tampered = {
      ...assertion,
      response: { ...assertion.response, signature: assertion.response.signature.slice(0, -4) + "AAAA" },
    };

    const result = await verifyAuthenticationResponse({
      response: tampered as never,
      expectedChallenge: options.challenge,
      expectedOrigin: [ORIGIN],
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: { id: credential.id, publicKey: credential.publicKey, counter: credential.counter },
    }).catch(() => ({ verified: false }));

    expect(result.verified).toBe(false);
  });

  it("ключ, о котором сервер не знает, использовать нельзя", async () => {
    const other = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const { verification } = await register();
    const credential = verification.registrationInfo!.credential;

    const options = await generateAuthenticationOptions({ rpID: RP_ID });
    await other.create(options);
    const assertion = await other.get(options);

    // The assertion is well-formed, but signed by a key the server never stored.
    const result = await verifyAuthenticationResponse({
      response: assertion as never,
      expectedChallenge: options.challenge,
      expectedOrigin: [ORIGIN],
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: { id: credential.id, publicKey: credential.publicKey, counter: credential.counter },
    }).catch(() => ({ verified: false }));

    expect(result.verified).toBe(false);
  });

  it("ключ для другого домена не подходит", async () => {
    const foreign = createVirtualAuthenticator({ rpId: "evil.example", origin: "https://evil.example" });
    const options = await generateRegistrationOptions({
      rpName: "PNA",
      rpID: RP_ID,
      userID: utf8("00000000-0000-4000-8000-000000000002"),
      userName: "probe@example.com",
    });
    const response = await foreign.create(options);

    await expect(
      verifyRegistrationResponse({
        response: response as never,
        expectedChallenge: options.challenge,
        expectedOrigin: [ORIGIN],
        expectedRPID: RP_ID,
      }),
    ).rejects.toThrow();
  });
});

describe("форма ответа", () => {
  it("идентификатор ключа — это base64url его сырых байтов", async () => {
    const { response } = await register();
    expect(response.id).toBe(response.rawId);
    expect(fromBase64Url(response.id).byteLength).toBe(32);
    expect(response.id).not.toMatch(/[+/=]/);
  });
});
