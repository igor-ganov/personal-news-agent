import { describe, expect, it } from "vitest";
import { sequentialIds, type SourceId, type TopicId } from "../model/ids.js";
import { makeSource, T0 } from "../testing/builders.js";
import { addUserSource, editSource, setSourceStatus } from "./edit.js";

const topicId = "topic_1" as TopicId;
const add = (existing: Parameters<typeof addUserSource>[0]["existing"], draft: { title: string; url: string; kind?: never; rationale?: string }) =>
  addUserSource({ existing, draft, topicId, ids: sequentialIds(), now: T0 });

describe("addUserSource", () => {
  it("adds a hand-written source owned by the user", () => {
    const result = add([], { title: " Мой блог ", url: "example.com/feed/", rationale: " по делу " });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({
      id: "source_1",
      title: "Мой блог",
      url: "https://example.com/feed/",
      key: "example.com/feed",
      origin: "user",
      status: "active",
      rationale: "по делу",
    });
  });

  it("falls back to the url when no title is given", () => {
    const result = add([], { title: "  ", url: "example.com/feed" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.title).toBe("https://example.com/feed");
  });

  it("rejects an unusable url", () => {
    expect(add([], { title: "x", url: "нет" })).toEqual({ ok: false, error: "invalid-url" });
  });

  it("rejects a source already in the list", () => {
    const existing = makeSource({ key: "example.com/feed" });
    expect(add([existing], { title: "x", url: "https://WWW.example.com/feed/" })).toEqual({
      ok: false,
      error: "duplicate",
    });
  });

  it("treats re-adding a blacklisted source as un-blacklisting it", () => {
    const blocked = makeSource({ id: "source_9" as SourceId, key: "example.com/feed", status: "blacklisted" });
    const result = add([blocked], { title: "Передумал", url: "example.com/feed" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({ id: "source_9", status: "active", origin: "user", title: "Передумал" });
  });
});

describe("setSourceStatus", () => {
  it("changes the status", () => {
    expect(setSourceStatus(makeSource(), "blacklisted").status).toBe("blacklisted");
  });

  it("returns the same object when nothing changes", () => {
    const source = makeSource({ status: "muted" });
    expect(setSourceStatus(source, "muted")).toBe(source);
  });
});

describe("editSource", () => {
  it("takes ownership so discovery stops overwriting the source", () => {
    const discovered = makeSource({ origin: "discovered", title: "Авто" });
    expect(editSource(discovered, { title: "Ручное" })).toMatchObject({
      title: "Ручное",
      origin: "user",
    });
  });

  it("keeps the old title when the patch is blank", () => {
    expect(editSource(makeSource({ title: "Старое" }), { title: "   " }).title).toBe("Старое");
  });
});
