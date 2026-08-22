import type { DiscoverSourcesInput } from "../ports/content-provider.js";
import { BASE_SYSTEM, renderBlockedHosts, renderSourceList, renderTopicContext } from "./context.js";

export const DISCOVER_SOURCES_TOOL = "emit_sources";

export const discoverSourcesSystem = (): string =>
  [
    BASE_SYSTEM,
    "",
    "Your job right now: find the places this user should be following for this topic.",
    "A good source publishes regularly, is close to the subject, and matches the focus areas.",
    "Prefer a feed URL when one exists — it is what the app will poll.",
    `Call ${DISCOVER_SOURCES_TOOL} once with everything you found.`,
  ].join("\n");

export const discoverSourcesPrompt = (input: DiscoverSourcesInput): string =>
  [
    renderTopicContext(input.context),
    renderBlockedHosts(input.blockedHosts),
    "",
    "SOURCES ALREADY IN THE LIST — do not propose these again:",
    renderSourceList(input.known),
    "",
    `Search the web and propose up to ${input.limit} NEW sources for this topic.`,
    "For each one, say in a single sentence why it fits this user's focus areas specifically.",
    "Spread the list across kinds — a blog, a release feed, a forum and a paper stream beat four blogs.",
  ].join("\n");
