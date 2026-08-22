import { createAnthropicProvider, type ContentProvider } from "@pna/agent";

/**
 * The Claude provider, behind its own module.
 *
 * This file is only ever reached through a dynamic import, which is what keeps
 * the prompt builders, the schema definitions and their validation library out
 * of the chunk the phone parses at startup.
 */
export const createProvider = (apiKey: string, model: string): ContentProvider =>
  createAnthropicProvider({ apiKey, model, allowBrowser: true });
