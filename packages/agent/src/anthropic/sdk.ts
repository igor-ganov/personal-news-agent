/**
 * The Anthropic SDK is loaded on demand.
 *
 * Nothing on the startup path talks to the model — the first call happens when
 * the user asks for a digest or a lecture — so a dynamic import keeps the SDK
 * out of the initial bundle the phone has to parse before showing anything.
 * The type import below is erased at compile time and costs nothing.
 */
export type AnthropicModule = typeof import("@anthropic-ai/sdk");

let cached: Promise<AnthropicModule> | null = null;

export const loadAnthropicSdk = (): Promise<AnthropicModule> =>
  (cached ??= import("@anthropic-ai/sdk"));
