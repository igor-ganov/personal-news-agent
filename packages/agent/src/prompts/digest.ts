import type { DigestPeriod } from "@pna/core";
import type { BuildDigestInput } from "../ports/content-provider.js";
import { BASE_SYSTEM, renderBlockedHosts, renderSourceList, renderTopicContext } from "./context.js";

export const DIGEST_TOOL = "emit_digest";

const PERIOD_WORD: Record<DigestPeriod, string> = {
  day: "the last day",
  week: "the last week",
  month: "the last month",
  year: "the last year",
};

/** Longer windows should zoom out rather than list more items. */
const PERIOD_GUIDANCE: Record<DigestPeriod, string> = {
  day: "Aim for 3-7 items. Anything genuinely new counts, including small releases.",
  week: "Aim for 5-10 items. Group them into 2-4 sections by theme.",
  month:
    "Aim for 6-12 items. Lead with what shifted, not with every release. Sections should be themes, not dates.",
  year:
    "Aim for 8-15 items. This is a retrospective: name the trends that actually changed the field this year, and use individual items as evidence.",
};

export const digestSystem = (period: DigestPeriod): string =>
  [
    BASE_SYSTEM,
    "",
    `Your job right now: write the "${PERIOD_WORD[period]}" digest for this topic.`,
    "A digest is a briefing for someone who already knows the field — say what changed and why it matters,",
    "not what the subject is. Each item needs a real summary, not a teaser.",
    PERIOD_GUIDANCE[period],
    "If nothing meaningful happened in the window, say so in the summary and return few or no items.",
    `Call ${DIGEST_TOOL} once when you are done.`,
  ].join("\n");

export const digestPrompt = (input: BuildDigestInput): string =>
  [
    renderTopicContext(input.context),
    renderBlockedHosts(input.blockedHosts),
    "",
    "PREFERRED SOURCES — start here, then widen the search if the topic warrants it:",
    renderSourceList(input.sources),
    "",
    `WINDOW: from ${input.window.from} to ${input.window.to} (UTC, half-open).`,
    "Only include things published inside this window.",
    "Fill published_at from the source; leave it empty if the source does not state a date.",
    "",
    `Today is ${input.now}.`,
  ].join("\n");
