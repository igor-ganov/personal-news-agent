/** Models that support the dynamic-filtering web search tool. */
const MODERN_WEB_SEARCH = new Set([
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-fable-5",
]);

export interface WebSearchTool {
  readonly type: "web_search_20260209" | "web_search_20250305";
  readonly name: "web_search";
  readonly max_uses: number;
  readonly blocked_domains?: string[];
}

/**
 * The web search tool definition for a model.
 * Older models only have the basic variant, so the type is chosen per model
 * rather than hard-coded.
 */
export const webSearchTool = (
  model: string,
  maxUses: number,
  blockedDomains: readonly string[],
): WebSearchTool => {
  const base = {
    type: MODERN_WEB_SEARCH.has(model)
      ? ("web_search_20260209" as const)
      : ("web_search_20250305" as const),
    name: "web_search" as const,
    max_uses: Math.max(1, maxUses),
  };
  // The API rejects an empty blocked_domains array, so it is only sent when non-empty.
  return blockedDomains.length === 0 ? base : { ...base, blocked_domains: [...blockedDomains] };
};

export const DEFAULT_MODEL = "claude-opus-5";
