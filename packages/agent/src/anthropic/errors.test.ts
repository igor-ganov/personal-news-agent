import { describe, expect, it } from "vitest";
import { invalidOutput, refused, sdkErrorMapper, structuralErrorMapper } from "./errors.js";
import { loadAnthropicSdk } from "./sdk.js";

describe("structuralErrorMapper", () => {
  it("reads the documented status field", () => {
    expect(structuralErrorMapper({ status: 401 })).toMatchObject({ kind: "auth" });
    expect(structuralErrorMapper({ status: 403 })).toMatchObject({ kind: "auth" });
    expect(structuralErrorMapper({ status: 429 })).toMatchObject({ kind: "rate-limit" });
    expect(structuralErrorMapper({ status: 500, message: "oops" })).toMatchObject({
      kind: "unknown",
    });
  });

  it("falls back to the message for a plain error", () => {
    expect(structuralErrorMapper(new Error("socket hang up"))).toEqual({
      kind: "unknown",
      message: "socket hang up",
    });
  });

  it("survives a thrown non-error", () => {
    expect(structuralErrorMapper("странно")).toEqual({ kind: "unknown", message: "странно" });
  });
});

describe("sdkErrorMapper", () => {
  it("classifies the SDK's own exception types", async () => {
    const sdk = await loadAnthropicSdk();
    const map = sdkErrorMapper(sdk);
    const Anthropic = sdk.default;

    const headers = new Headers();
    expect(map(new Anthropic.AuthenticationError(401, {}, "bad key", headers))).toMatchObject({
      kind: "auth",
    });
    expect(map(new Anthropic.PermissionDeniedError(403, {}, "denied", headers))).toMatchObject({
      kind: "auth",
    });
    expect(map(new Anthropic.RateLimitError(429, {}, "slow down", headers))).toMatchObject({
      kind: "rate-limit",
    });
    expect(map(new Anthropic.APIConnectionError({ message: "offline" }))).toMatchObject({
      kind: "network",
    });
  });

  it("keeps the status in the message for an unclassified API error", async () => {
    const sdk = await loadAnthropicSdk();
    const error = new sdk.default.APIError(503, {}, "unavailable", new Headers());
    expect(sdkErrorMapper(sdk)(error)).toMatchObject({
      kind: "unknown",
      message: expect.stringContaining("503"),
    });
  });

  it("passes an ordinary error through", async () => {
    const sdk = await loadAnthropicSdk();
    expect(sdkErrorMapper(sdk)(new Error("boom"))).toEqual({ kind: "unknown", message: "boom" });
  });
});

describe("provider error helpers", () => {
  it("wraps an unusable model response", () => {
    expect(invalidOutput("нет вызова")).toEqual({
      kind: "invalid-output",
      message: "Модель вернула непригодный ответ: нет вызова",
    });
  });

  it("explains a refusal, with a default", () => {
    expect(refused("нельзя")).toEqual({ kind: "refused", message: "нельзя" });
    expect(refused("").message).toContain("политикой безопасности");
  });
});
