import { sortBy } from "../fp/array.js";
import type { TopicId } from "../model/ids.js";
import type { Topic, TopicNode } from "../model/topic.js";

export type TopicMap = Readonly<Record<TopicId, Topic>>;

export const allTopics = (topics: TopicMap): Topic[] =>
  sortBy(Object.values(topics), (t) => `${t.createdAt}|${t.id}`);

export const childrenOf = (topics: TopicMap, parentId: TopicId | null): Topic[] =>
  allTopics(topics).filter((t) => t.parentId === parentId);

export const rootTopics = (topics: TopicMap): Topic[] => childrenOf(topics, null);

/** Root → … → topic, inclusive. Empty when the id is unknown or the chain is broken. */
export const pathOf = (topics: TopicMap, id: TopicId): Topic[] => {
  const path: Topic[] = [];
  const seen = new Set<TopicId>();
  let current = topics[id];
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : topics[current.parentId];
  }
  return path;
};

/** Ancestors, root first, excluding the topic itself. */
export const ancestorsOf = (topics: TopicMap, id: TopicId): Topic[] =>
  pathOf(topics, id).slice(0, -1);

/** Every descendant id, depth-first, excluding the topic itself. */
export const descendantIdsOf = (topics: TopicMap, id: TopicId): TopicId[] => {
  const out: TopicId[] = [];
  const walk = (parentId: TopicId): void => {
    for (const child of childrenOf(topics, parentId)) {
      out.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
};

export const isDescendantOf = (
  topics: TopicMap,
  candidate: TopicId,
  ancestor: TopicId,
): boolean => ancestorsOf(topics, candidate).some((t) => t.id === ancestor);

export const buildTree = (topics: TopicMap): TopicNode[] => {
  const build = (parentId: TopicId | null): TopicNode[] =>
    childrenOf(topics, parentId).map((topic) => ({
      topic,
      children: build(topic.id),
    }));
  return build(null);
};

export const depthOf = (topics: TopicMap, id: TopicId): number =>
  Math.max(0, pathOf(topics, id).length - 1);

/** Breadcrumb string, e.g. "ИИ / Инференс / Квантизация". */
export const breadcrumbOf = (topics: TopicMap, id: TopicId, separator = " / "): string =>
  pathOf(topics, id)
    .map((t) => t.title)
    .join(separator);
