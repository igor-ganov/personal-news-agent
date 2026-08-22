import { describe, expect, it } from "vitest";
import { memoryStore } from "./adapters/memory.js";
import { API_KEY_KEY, createSecretStore, maskSecret } from "./secrets.js";

describe("createSecretStore", () => {
  it("stores and reads a key, trimmed", async () => {
    const store = memoryStore();
    const secrets = createSecretStore(store);
    await secrets.set("  sk-ant-123  ");
    expect(await store.get(API_KEY_KEY)).toBe("sk-ant-123");
    expect(await secrets.get()).toBe("sk-ant-123");
  });

  it("treats a blank value as clearing the key", async () => {
    const store = memoryStore({ [API_KEY_KEY]: "sk-ant-123" });
    const secrets = createSecretStore(store);
    await secrets.set("   ");
    expect(await secrets.get()).toBeNull();
  });

  it("returns null when nothing is stored", async () => {
    expect(await createSecretStore(memoryStore()).get()).toBeNull();
  });

  it("clears the key", async () => {
    const secrets = createSecretStore(memoryStore({ [API_KEY_KEY]: "sk-ant-123" }));
    await secrets.clear();
    expect(await secrets.get()).toBeNull();
  });

  it("keeps the key out of the state document by using its own slot", async () => {
    const store = memoryStore();
    await createSecretStore(store).set("sk-ant-123");
    expect(await store.get("pna.state.v1")).toBeNull();
  });
});

describe("maskSecret", () => {
  it("shows only the tail", () => {
    expect(maskSecret("sk-ant-abcd1234")).toBe("••••••••1234");
  });

  it("says plainly when nothing is set", () => {
    expect(maskSecret(null)).toBe("не задан");
  });
});
