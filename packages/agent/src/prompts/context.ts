import { contextHeadline, type Source, type TopicContext } from "@pna/core";

const bullet = (lines: readonly string[]): string =>
  lines.length === 0 ? "(none)" : lines.map((l) => `- ${l}`).join("\n");

/**
 * Renders the user's interest framing for a topic — including everything
 * inherited from parent topics — as a stable block of text.
 *
 * Stability matters: this block is the cacheable prefix of every request about
 * the topic, so it must not contain timestamps or anything else that varies
 * between calls.
 */
export const renderTopicContext = (context: TopicContext): string => {
  const briefs = context.path
    .filter((t) => t.brief.length > 0)
    .map((t) => `${t.title}: ${t.brief}`);

  const focus = context.focusAreas.map(
    (f) => `${f.title} (importance ${f.weight}/5): ${f.detail || "—"}`,
  );

  return [
    `TOPIC PATH: ${contextHeadline(context)}`,
    `CURRENT TOPIC: ${context.topic.title}`,
    `LEVEL: ${context.level}`,
    `OUTPUT LANGUAGE: ${context.language}`,
    "",
    "WHAT THE USER CARES ABOUT (inherited from parent topics first, then this topic):",
    bullet(briefs),
    "",
    "FOCUS AREAS, most important first:",
    bullet(focus),
    "",
    "EXPLICITLY NOT INTERESTED IN:",
    bullet(context.excludes),
  ].join("\n");
};

export const renderSourceList = (sources: readonly Source[]): string =>
  sources.length === 0
    ? "(no sources yet — search the open web)"
    : sources.map((s) => `- ${s.title} — ${s.url} (${s.kind})`).join("\n");

export const renderBlockedHosts = (hosts: readonly string[]): string =>
  hosts.length === 0
    ? ""
    : [
        "",
        "BLACKLISTED HOSTS — never cite, link to, or propose anything from these:",
        hosts.map((h) => `- ${h}`).join("\n"),
      ].join("\n");

/** Shared rules every generation call inherits. */
export const BASE_SYSTEM = [
  "You are the research and teaching engine of a personal knowledge app.",
  "The user is one person with a specific, narrow set of interests; everything you produce is for them alone.",
  "",
  "Rules that always apply:",
  "- Write in the OUTPUT LANGUAGE given in the topic context.",
  "- Never invent a URL, a title, a date, or a fact. If you did not see it, leave the field empty.",
  "- Respect EXPLICITLY NOT INTERESTED IN — those subjects must not appear at all.",
  "- Prefer primary sources (official docs, release notes, papers, the author's own post) over aggregators.",
  "- Be concrete. No filler, no marketing tone, no 'in today's fast-moving world'.",
  "- You must finish by calling the provided tool exactly once. Never answer in plain text.",
].join("\n");
