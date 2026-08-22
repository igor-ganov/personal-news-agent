import { emptyState, STATE_VERSION, type AppState, type TopicId } from "@pna/core";
import { describe, expect, it } from "vitest";
import { decodeState, encodeState, type Migration } from "./codec.js";

const stateWithTopic = (): AppState => ({
  ...emptyState(),
  topics: {
    ["t1" as TopicId]: {
      id: "t1" as TopicId,
      parentId: null,
      title: "ИИ",
      brief: "",
      focusAreas: [],
      excludes: [],
      language: "ru",
      level: "intermediate",
      createdAt: "2026-08-22T10:00:00.000Z" as never,
      updatedAt: "2026-08-22T10:00:00.000Z" as never,
    },
  },
});

describe("encode/decode", () => {
  it("round-trips a state", () => {
    const state = stateWithTopic();
    const result = decodeState(encodeState(state));
    expect(result).toEqual({ ok: true, value: state });
  });

  it("reports unreadable data instead of throwing", () => {
    expect(decodeState("{не json")).toEqual({
      ok: false,
      error: { kind: "corrupt", message: expect.stringContaining("JSON") },
    });
  });

  it("rejects a document that is not an object", () => {
    expect(decodeState("[1,2,3]")).toMatchObject({ ok: false, error: { kind: "corrupt" } });
  });

  it("fills in collections that are missing or malformed", () => {
    const result = decodeState(JSON.stringify({ version: STATE_VERSION, topics: "нет" }));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.topics).toEqual({});
    expect(result.value.digests).toEqual({});
  });

  it("keeps unknown settings out of the way but preserves known ones", () => {
    const result = decodeState(
      JSON.stringify({ version: STATE_VERSION, settings: { sourceRefreshDays: 3 } }),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.settings.sourceRefreshDays).toBe(3);
    expect(result.value.settings.providerId).toBe("anthropic");
  });

  it("refuses a document written by a newer app version", () => {
    const result = decodeState(JSON.stringify({ version: STATE_VERSION + 1 }));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "corrupt", message: expect.stringContaining("новее") },
    });
  });

  it("runs the migration chain forward to the current version", () => {
    const steps: number[] = [];
    const bump = (from: number): Migration => (raw) => {
      steps.push(from);
      return { ...raw, version: from + 1, topics: { migrated: {} } };
    };
    const migrations = Object.fromEntries(
      Array.from({ length: STATE_VERSION + 1 }, (_, i) => [i - 1, bump(i - 1)]),
    );

    const result = decodeState(JSON.stringify({ version: -1 }), migrations);
    if (!result.ok) throw new Error("expected ok");
    expect(steps).toEqual(Array.from({ length: STATE_VERSION + 1 }, (_, i) => i - 1));
    expect(result.value.version).toBe(STATE_VERSION);
    expect(Object.keys(result.value.topics)).toEqual(["migrated"]);
  });

  it("refuses to guess when a migration is missing", () => {
    const result = decodeState(JSON.stringify({ version: STATE_VERSION - 1 }), {});
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "corrupt", message: expect.stringContaining("миграции") },
    });
  });

  it("treats a document with no version as version 1", () => {
    const result = decodeState(JSON.stringify({ topics: {} }));
    expect(result.ok).toBe(true);
  });
});
