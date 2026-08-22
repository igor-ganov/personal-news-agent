import { describe, expect, it } from "vitest";
import { focusId, sequentialIds, type TopicId } from "../model/ids.js";
import { makeFocus, makeTopic, T0, topicMapOf } from "../testing/builders.js";
import { instantOf } from "../time/instant.js";
import {
  addFocusArea,
  createTopic,
  moveTopic,
  removeFocusArea,
  removeTopicSubtree,
  updateFocusArea,
  updateTopic,
} from "./edit.js";
import { descendantIdsOf } from "./tree.js";

const id = (s: string) => s as TopicId;
const deps = () => ({ ids: sequentialIds(), now: T0 });
const T1 = instantOf("2026-08-23T10:00:00Z");

describe("createTopic", () => {
  it("rejects a blank title", () => {
    expect(createTopic({ parentId: null, title: "   " }, deps())).toEqual({
      ok: false,
      error: "empty-title",
    });
  });

  it("fills defaults and trims input", () => {
    const result = createTopic({ parentId: null, title: "  Музыка  ", brief: " синты " }, deps());
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({
      id: "topic_1",
      title: "Музыка",
      brief: "синты",
      language: "ru",
      level: "intermediate",
      focusAreas: [],
      excludes: [],
    });
  });

  it("gives every focus area its own id and clamps the weight", () => {
    const result = createTopic(
      {
        parentId: null,
        title: "ИИ",
        focusAreas: [
          { title: "Инференс", detail: "edge", weight: 99 },
          { title: "Агенты", detail: "tool use", weight: -4 },
        ],
      },
      deps(),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.focusAreas.map((f) => [f.id, f.weight])).toEqual([
      ["focus_1", 5],
      ["focus_2", 1],
    ]);
  });

  it("drops blank excludes", () => {
    const result = createTopic(
      { parentId: null, title: "ИИ", excludes: ["хайп", "  ", ""] },
      deps(),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.excludes).toEqual(["хайп"]);
  });
});

describe("updateTopic", () => {
  it("patches only the given fields and stamps updatedAt", () => {
    const topic = makeTopic({ title: "Старое", brief: "бриф" });
    const result = updateTopic(topic, { title: "Новое" }, T1);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.title).toBe("Новое");
    expect(result.value.brief).toBe("бриф");
    expect(result.value.updatedAt).toBe(T1);
    expect(result.value.createdAt).toBe(T0);
  });

  it("rejects blanking the title", () => {
    expect(updateTopic(makeTopic(), { title: " " }, T1)).toEqual({
      ok: false,
      error: "empty-title",
    });
  });
});

describe("moveTopic", () => {
  const topics = topicMapOf(
    makeTopic({ id: id("ai") }),
    makeTopic({ id: id("inference"), parentId: id("ai") }),
    makeTopic({ id: id("quant"), parentId: id("inference") }),
    makeTopic({ id: id("music") }),
  );

  it("re-parents a subtree", () => {
    const result = moveTopic(topics, id("inference"), id("music"), T1);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value["inference" as TopicId]!.parentId).toBe("music");
    expect(descendantIdsOf(result.value, id("music"))).toEqual(["inference", "quant"]);
  });

  it("promotes a topic to the root", () => {
    const result = moveTopic(topics, id("quant"), null, T1);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value["quant" as TopicId]!.parentId).toBeNull();
  });

  it("refuses to make a topic its own parent", () => {
    expect(moveTopic(topics, id("ai"), id("ai"), T1)).toEqual({ ok: false, error: "cycle" });
  });

  it("refuses to move a topic under its own descendant", () => {
    expect(moveTopic(topics, id("ai"), id("quant"), T1)).toEqual({ ok: false, error: "cycle" });
  });

  it("refuses unknown topics on either side", () => {
    expect(moveTopic(topics, id("ghost"), null, T1)).toEqual({ ok: false, error: "unknown-topic" });
    expect(moveTopic(topics, id("ai"), id("ghost"), T1)).toEqual({
      ok: false,
      error: "unknown-topic",
    });
  });
});

describe("removeTopicSubtree", () => {
  it("drops the topic together with its descendants", () => {
    const topics = topicMapOf(
      makeTopic({ id: id("ai") }),
      makeTopic({ id: id("inference"), parentId: id("ai") }),
      makeTopic({ id: id("quant"), parentId: id("inference") }),
      makeTopic({ id: id("music") }),
    );
    const next = removeTopicSubtree(topics, id("ai"), descendantIdsOf(topics, id("ai")));
    expect(Object.keys(next)).toEqual(["music"]);
  });
});

describe("focus areas", () => {
  it("appends a focus area with a fresh id", () => {
    const result = addFocusArea(makeTopic(), { title: "Латентность", detail: "p99" }, deps());
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.focusAreas).toEqual([
      { id: "focus_1", title: "Латентность", detail: "p99", weight: 3 },
    ]);
  });

  it("rejects a blank focus title", () => {
    expect(addFocusArea(makeTopic(), { title: "", detail: "x" }, deps())).toEqual({
      ok: false,
      error: "empty-title",
    });
  });

  it("patches an existing focus area", () => {
    const topic = makeTopic({ focusAreas: [makeFocus({ id: focusId("f1"), title: "A" })] });
    const result = updateFocusArea(topic, focusId("f1"), { detail: " новое " }, T1);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.focusAreas[0]).toMatchObject({ title: "A", detail: "новое" });
    expect(result.value.updatedAt).toBe(T1);
  });

  it("reports an unknown focus area", () => {
    expect(updateFocusArea(makeTopic(), focusId("nope"), {}, T1)).toEqual({
      ok: false,
      error: "unknown-focus",
    });
  });

  it("removes a focus area", () => {
    const topic = makeTopic({
      focusAreas: [makeFocus({ id: focusId("f1") }), makeFocus({ id: focusId("f2") })],
    });
    expect(removeFocusArea(topic, focusId("f1"), T1).focusAreas.map((f) => f.id)).toEqual(["f2"]);
  });
});
