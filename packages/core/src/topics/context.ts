import { uniqueBy } from "../fp/array.js";
import { err, ok, type Result } from "../fp/result.js";
import type { TopicId } from "../model/ids.js";
import type { FocusArea, TopicContext } from "../model/topic.js";
import { pathOf, type TopicMap } from "./tree.js";

const normalise = (s: string): string => s.trim().toLowerCase();

/**
 * The interest context a sub-topic actually carries: its own framing plus
 * everything inherited from its ancestors.
 *
 * Ordering is significant — it is the priority order used when building prompts.
 * The topic's own focus areas come first, then the nearest ancestor's, and so on
 * up to the root. A focus area re-declared closer to the leaf wins.
 */
export const topicContextOf = (
  topics: TopicMap,
  id: TopicId,
): Result<TopicContext, "unknown-topic"> => {
  const path = pathOf(topics, id);
  const topic = path.at(-1);
  if (!topic) return err("unknown-topic");

  const nearestFirst = [...path].reverse();

  const focusAreas: FocusArea[] = uniqueBy(
    nearestFirst.flatMap((t) => t.focusAreas),
    (f) => normalise(f.title),
  );

  const excludes = uniqueBy(
    nearestFirst.flatMap((t) => t.excludes),
    normalise,
  );

  return ok({
    topic,
    path,
    focusAreas,
    excludes,
    language: topic.language,
    level: topic.level,
  });
};

/** A one-line description used as the search seed for discovery and digests. */
export const contextHeadline = (context: TopicContext): string =>
  context.path.map((t) => t.title).join(" → ");
