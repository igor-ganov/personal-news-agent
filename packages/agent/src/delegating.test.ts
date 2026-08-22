import { describe, expect, it, vi } from "vitest";
import { createDelegatingProvider, memoiseProvider } from "./delegating.js";
import { createMockProvider } from "./mock/provider.js";
import type { ContentProvider } from "./ports/content-provider.js";
import { T0, testContext } from "./testing/fixtures.js";

const named = (id: string): ContentProvider => ({ ...createMockProvider(), id });

const discover = (provider: ContentProvider) =>
  provider.discoverSources({
    context: testContext(),
    known: [],
    blockedHosts: [],
    limit: 3,
    now: T0,
  });

describe("createDelegatingProvider", () => {
  it("resolves the real provider on every call", async () => {
    const resolve = vi.fn(async () => named("a"));
    const provider = createDelegatingProvider(resolve);

    await discover(provider);
    await discover(provider);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("picks up a provider swapped between calls", async () => {
    let current = named("first");
    const provider = createDelegatingProvider(async () => current);

    const before = await discover(provider);
    current = { ...named("second"), discoverSources: async () => ({ ok: true, value: [] }) };
    const after = await discover(provider);

    expect(before.ok && before.value.length > 0).toBe(true);
    expect(after).toEqual({ ok: true, value: [] });
  });
});

describe("memoiseProvider", () => {
  it("rebuilds only when the fingerprint changes", async () => {
    let fingerprint = "key-1";
    const build = vi.fn((value: string) => named(value));
    const resolve = memoiseProvider(async () => fingerprint, build);

    await resolve();
    await resolve();
    expect(build).toHaveBeenCalledTimes(1);

    fingerprint = "key-2";
    const rebuilt = await resolve();
    expect(build).toHaveBeenCalledTimes(2);
    expect(rebuilt.id).toBe("key-2");
  });

  it("returns the same instance while nothing changes", async () => {
    const resolve = memoiseProvider(
      async () => "same",
      (value) => named(value),
    );
    expect(await resolve()).toBe(await resolve());
  });
});
