import type { Topic, TopicId, TopicNode } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, text, unmountAll } from "../testing/dom.js";
import { PnaTopicTree } from "./pna-topic-tree.js";

const topic = (id: string, title: string): Topic => ({
  id: id as TopicId,
  parentId: null,
  title,
  brief: "",
  focusAreas: [],
  excludes: [],
  language: "ru",
  level: "intermediate",
  createdAt: "2026-08-22T10:00:00.000Z" as never,
  updatedAt: "2026-08-22T10:00:00.000Z" as never,
});

const node = (id: string, title: string, children: TopicNode[] = []): TopicNode => ({
  topic: topic(id, title),
  children,
});

const tree: TopicNode[] = [
  node("ai", "ИИ", [node("inference", "Инференс", [node("quant", "Квантизация")])]),
  node("music", "Музыка"),
];

const render = async (nodes: TopicNode[]) => {
  const element = new PnaTopicTree();
  element.nodes = nodes;
  return mount(element);
};

afterEach(unmountAll);

describe("pna-topic-tree", () => {
  it("invites the user to create the first topic when empty", async () => {
    const element = await render([]);
    expect(query<HTMLElement>(element, "ui-notice")?.getAttribute("tone")).toBe("empty");
    expect(text(element)).toContain("Создать тему");
  });

  it("emits topic-create from the empty state", async () => {
    const element = await render([]);
    const events = capture<TopicId | null>(element, "topic-create");
    await click(element, query(element, "ui-button"));
    expect(events).toHaveLength(1);
  });

  it("renders the whole tree expanded", async () => {
    const element = await render(tree);
    const titles = queryAll(element, ".title").map((n) => n.textContent);
    expect(titles).toEqual(["ИИ", "Инференс", "Квантизация", "Музыка"]);
  });

  it("emits topic-open with the id that was tapped", async () => {
    const element = await render(tree);
    const events = capture<TopicId>(element, "topic-open");
    await click(element, queryAll(element, ".open")[1] ?? null);
    expect(events).toEqual(["inference"]);
  });

  it("collapses and expands a branch", async () => {
    const element = await render(tree);
    const twisty = queryAll(element, ".twisty")[0] ?? null;

    await click(element, twisty);
    expect(queryAll(element, ".title").map((n) => n.textContent)).toEqual(["ИИ", "Музыка"]);

    await click(element, queryAll(element, ".twisty")[0] ?? null);
    expect(queryAll(element, ".title")).toHaveLength(4);
  });

  it("hides the twisty for a leaf", async () => {
    const element = await render([node("music", "Музыка")]);
    expect(query(element, ".twisty")?.className).toContain("hidden");
  });

  it("marks the selected topic", async () => {
    const element = new PnaTopicTree();
    element.nodes = tree;
    element.selected = "music";
    await mount(element);

    const current = queryAll(element, '.open[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("Музыка");
  });

  it("shows how many sub-topics a branch has", async () => {
    const element = await render(tree);
    expect(text(element)).toContain("1 подтем");
  });
});
