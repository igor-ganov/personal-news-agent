import { describe, expect, it } from "vitest";
import { focusId, type TopicId } from "../model/ids.js";
import { makeFocus, makeTopic, topicMapOf } from "../testing/builders.js";
import { contextHeadline, topicContextOf } from "./context.js";

const id = (s: string) => s as TopicId;

const topics = topicMapOf(
  makeTopic({
    id: id("ai"),
    title: "ИИ",
    focusAreas: [makeFocus({ id: focusId("f_root"), title: "Практика", detail: "Только применимое" })],
    excludes: ["Хайп-новости"],
    language: "ru",
  }),
  makeTopic({
    id: id("inference"),
    parentId: id("ai"),
    title: "Инференс",
    focusAreas: [makeFocus({ id: focusId("f_inf"), title: "Латентность", detail: "p99 на CPU" })],
    excludes: ["Обучение с нуля", "хайп-новости"],
    level: "advanced",
  }),
);

describe("topic context", () => {
  it("fails on an unknown topic", () => {
    expect(topicContextOf(topics, id("nope"))).toEqual({ ok: false, error: "unknown-topic" });
  });

  it("puts the topic's own focus areas ahead of inherited ones", () => {
    const context = topicContextOf(topics, id("inference"));
    expect(context.ok).toBe(true);
    if (!context.ok) return;
    expect(context.value.focusAreas.map((f) => f.title)).toEqual(["Латентность", "Практика"]);
  });

  it("merges excludes from the whole chain, case-insensitively", () => {
    const context = topicContextOf(topics, id("inference"));
    if (!context.ok) throw new Error("expected ok");
    expect(context.value.excludes).toEqual(["Обучение с нуля", "хайп-новости"]);
  });

  it("lets a leaf override an ancestor's focus area of the same name", () => {
    const overridden = topicMapOf(
      makeTopic({ id: id("root"), focusAreas: [makeFocus({ title: "Практика", detail: "общее" })] }),
      makeTopic({
        id: id("leaf"),
        parentId: id("root"),
        focusAreas: [makeFocus({ id: focusId("f2"), title: "практика", detail: "конкретное" })],
      }),
    );
    const context = topicContextOf(overridden, id("leaf"));
    if (!context.ok) throw new Error("expected ok");
    expect(context.value.focusAreas).toHaveLength(1);
    expect(context.value.focusAreas[0]!.detail).toBe("конкретное");
  });

  it("takes language and level from the topic itself", () => {
    const context = topicContextOf(topics, id("inference"));
    if (!context.ok) throw new Error("expected ok");
    expect(context.value.language).toBe("ru");
    expect(context.value.level).toBe("advanced");
  });

  it("renders a breadcrumb headline", () => {
    const context = topicContextOf(topics, id("inference"));
    if (!context.ok) throw new Error("expected ok");
    expect(contextHeadline(context.value)).toBe("ИИ → Инференс");
  });
});
