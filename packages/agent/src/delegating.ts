import type { ContentProvider } from "./ports/content-provider.js";

/**
 * A provider that resolves the real one at call time.
 *
 * Settings change while the app is running — the user pastes an API key, or
 * switches model — and every screen already holds a reference to the provider.
 * Resolving per call means those changes take effect immediately without
 * rebuilding the application context.
 */
export const createDelegatingProvider = (
  resolve: () => Promise<ContentProvider>,
  id = "delegating",
): ContentProvider => ({
  id,
  discoverSources: async (input) => (await resolve()).discoverSources(input),
  buildDigest: async (input) => (await resolve()).buildDigest(input),
  draftProgram: async (input) => (await resolve()).draftProgram(input),
  writeLesson: async (input) => (await resolve()).writeLesson(input),
  buildQuiz: async (input) => (await resolve()).buildQuiz(input),
});

/**
 * Wraps a factory so the provider is rebuilt only when its inputs change.
 * The fingerprint is whatever identifies the configuration — key plus model.
 */
export const memoiseProvider = <T>(
  fingerprint: () => Promise<T>,
  build: (value: T) => ContentProvider,
): (() => Promise<ContentProvider>) => {
  let cachedKey: T | undefined;
  let cached: ContentProvider | undefined;

  return async () => {
    const key = await fingerprint();
    if (cached === undefined || key !== cachedKey) {
      cachedKey = key;
      cached = build(key);
    }
    return cached;
  };
};
