import { describe, expect, it } from "vitest";
import type { TopicId } from "../model/ids.js";
import { makeTopic, topicMapOf } from "../testing/builders.js";
import {
  ancestorsOf,
  breadcrumbOf,
  buildTree,
  childrenOf,
  depthOf,
  descendantIdsOf,
  isDescendantOf,
  pathOf,
  rootTopics,
} from "./tree.js";

const id = (s: string) => s as TopicId;

// ai ─ inference ─ quantization
//    └ agents
// music (root)
const topics = topicMapOf(
  makeTopic({ id: id("ai"), title: "ИИ" }),
  makeTopic({ id: id("inference"), parentId: id("ai"), title: "Инференс" }),
  makeTopic({ id: id("quantization"), parentId: id("inference"), title: "Квантизация" }),
  makeTopic({ id: id("agents"), parentId: id("ai"), title: "Агенты" }),
  makeTopic({ id: id("music"), title: "Музыка" }),
);

describe("topic tree", () => {
  it("lists root topics in creation order", () => {
    expect(rootTopics(topics).map((t) => t.id)).toEqual(["ai", "music"]);
  });

  it("lists direct children only", () => {
    expect(childrenOf(topics, id("ai")).map((t) => t.id)).toEqual(["inference", "agents"]);
    expect(childrenOf(topics, id("quantization"))).toEqual([]);
  });

  it("walks the path from root to the topic", () => {
    expect(pathOf(topics, id("quantization")).map((t) => t.id)).toEqual([
      "ai",
      "inference",
      "quantization",
    ]);
  });

  it("returns an empty path for an unknown topic", () => {
    expect(pathOf(topics, id("nope"))).toEqual([]);
  });

  it("lists ancestors without the topic itself", () => {
    expect(ancestorsOf(topics, id("quantization")).map((t) => t.id)).toEqual(["ai", "inference"]);
    expect(ancestorsOf(topics, id("ai"))).toEqual([]);
  });

  it("collects descendants depth-first", () => {
    expect(descendantIdsOf(topics, id("ai"))).toEqual(["inference", "quantization", "agents"]);
    expect(descendantIdsOf(topics, id("music"))).toEqual([]);
  });

  it("answers descendant questions", () => {
    expect(isDescendantOf(topics, id("quantization"), id("ai"))).toBe(true);
    expect(isDescendantOf(topics, id("ai"), id("quantization"))).toBe(false);
    expect(isDescendantOf(topics, id("agents"), id("inference"))).toBe(false);
  });

  it("builds a nested tree", () => {
    const tree = buildTree(topics);
    expect(tree.map((n) => n.topic.id)).toEqual(["ai", "music"]);
    expect(tree[0]!.children.map((n) => n.topic.id)).toEqual(["inference", "agents"]);
    expect(tree[0]!.children[0]!.children.map((n) => n.topic.id)).toEqual(["quantization"]);
  });

  it("reports depth and a readable breadcrumb", () => {
    expect(depthOf(topics, id("ai"))).toBe(0);
    expect(depthOf(topics, id("quantization"))).toBe(2);
    expect(breadcrumbOf(topics, id("quantization"))).toBe("ИИ / Инференс / Квантизация");
  });

  it("survives a broken parent link without looping forever", () => {
    const orphaned = topicMapOf(makeTopic({ id: id("child"), parentId: id("ghost") }));
    expect(pathOf(orphaned, id("child")).map((t) => t.id)).toEqual(["child"]);
  });
});
