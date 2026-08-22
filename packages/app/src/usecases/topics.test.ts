import { focusId, type TopicId } from "@pna/core";
import { describe, expect, it } from "vitest";
import { harness } from "../testing/harness.js";
import {
  addFocus,
  addTopic,
  deleteTopic,
  editFocus,
  editTopic,
  removeFocus,
  reparentTopic,
} from "./topics.js";

const rootDraft = { parentId: null, title: "ИИ", brief: "практика" };

describe("addTopic", () => {
  it("stores the created topic", () => {
    const { ctx, state } = harness();
    const result = addTopic(ctx, rootDraft);

    if (!result.ok) throw new Error("expected ok");
    expect(state().topics[result.value.id]).toEqual(result.value);
  });

  it("translates a domain failure into a message", () => {
    const { ctx, state } = harness();
    expect(addTopic(ctx, { parentId: null, title: "  " })).toEqual({
      ok: false,
      error: { kind: "domain", message: "Название не может быть пустым" },
    });
    expect(state().topics).toEqual({});
  });

  it("nests a sub-topic under its parent", () => {
    const { ctx, state } = harness();
    const parent = addTopic(ctx, rootDraft);
    if (!parent.ok) throw new Error("expected ok");

    const child = addTopic(ctx, { parentId: parent.value.id, title: "Инференс" });
    if (!child.ok) throw new Error("expected ok");
    expect(state().topics[child.value.id]!.parentId).toBe(parent.value.id);
  });
});

describe("editTopic", () => {
  it("patches a stored topic", () => {
    const { ctx, state } = harness();
    const created = addTopic(ctx, rootDraft);
    if (!created.ok) throw new Error("expected ok");

    editTopic(ctx, created.value.id, { title: "Машинное обучение" });
    expect(state().topics[created.value.id]!.title).toBe("Машинное обучение");
  });

  it("reports an unknown topic", () => {
    const { ctx } = harness();
    expect(editTopic(ctx, "ghost" as TopicId, { title: "x" })).toEqual({
      ok: false,
      error: { kind: "domain", message: "Тема не найдена" },
    });
  });
});

describe("reparentTopic", () => {
  it("moves a topic and refuses a cycle", () => {
    const { ctx, state } = harness();
    const a = addTopic(ctx, { parentId: null, title: "A" });
    const b = addTopic(ctx, { parentId: null, title: "B" });
    if (!a.ok || !b.ok) throw new Error("expected ok");

    expect(reparentTopic(ctx, b.value.id, a.value.id).ok).toBe(true);
    expect(state().topics[b.value.id]!.parentId).toBe(a.value.id);

    expect(reparentTopic(ctx, a.value.id, b.value.id)).toEqual({
      ok: false,
      error: { kind: "domain", message: "Нельзя вложить тему саму в себя" },
    });
  });
});

describe("deleteTopic", () => {
  it("removes the subtree and reports what went", () => {
    const { ctx, state } = harness();
    const parent = addTopic(ctx, rootDraft);
    if (!parent.ok) throw new Error("expected ok");
    const child = addTopic(ctx, { parentId: parent.value.id, title: "Инференс" });
    if (!child.ok) throw new Error("expected ok");

    const result = deleteTopic(ctx, parent.value.id);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toEqual([parent.value.id, child.value.id]);
    expect(state().topics).toEqual({});
  });

  it("reports an unknown topic", () => {
    const { ctx } = harness();
    expect(deleteTopic(ctx, "ghost" as TopicId)).toMatchObject({ ok: false });
  });
});

describe("focus areas", () => {
  it("adds, edits and removes a focus area", () => {
    const { ctx, state } = harness();
    const created = addTopic(ctx, rootDraft);
    if (!created.ok) throw new Error("expected ok");
    const id = created.value.id;

    const added = addFocus(ctx, id, { title: "Латентность", detail: "p99" });
    if (!added.ok) throw new Error("expected ok");
    const focus = added.value.focusAreas[0]!.id;

    editFocus(ctx, id, focus, { weight: 5 });
    expect(state().topics[id]!.focusAreas[0]!.weight).toBe(5);

    removeFocus(ctx, id, focus);
    expect(state().topics[id]!.focusAreas).toEqual([]);
  });

  it("reports an unknown focus area", () => {
    const { ctx } = harness();
    const created = addTopic(ctx, rootDraft);
    if (!created.ok) throw new Error("expected ok");

    expect(editFocus(ctx, created.value.id, focusId("ghost"), {})).toEqual({
      ok: false,
      error: { kind: "domain", message: "Раздел фокуса не найден" },
    });
  });
});
