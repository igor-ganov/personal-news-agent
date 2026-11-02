import { memoryStore } from "@pna/storage";
import { describe, expect, it } from "vitest";
import { createKnownKeysStore, KNOWN_KEYS_KEY } from "./known-keys.js";

describe("createKnownKeysStore", () => {
  it("keeps the ids between launches", async () => {
    const kv = memoryStore();
    await createKnownKeysStore(kv).save(["cred-1", "cred-2"]);

    expect(await createKnownKeysStore(kv).load()).toEqual(["cred-1", "cred-2"]);
  });

  it("forgets everything when saved empty", async () => {
    const kv = memoryStore();
    const keys = createKnownKeysStore(kv);
    await keys.save(["cred-1"]);

    await keys.save([]);

    expect(await kv.get(KNOWN_KEYS_KEY)).toBeNull();
  });

  it("reads a damaged entry as nothing known", async () => {
    const kv = memoryStore();
    await kv.set(KNOWN_KEYS_KEY, "{not json");

    expect(await createKnownKeysStore(kv).load()).toEqual([]);
  });
});
