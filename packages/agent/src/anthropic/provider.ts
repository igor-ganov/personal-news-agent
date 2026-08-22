import Anthropic from "@anthropic-ai/sdk";
import { mapResult, type DigestPeriod } from "@pna/core";
import type {
  BuildDigestInput,
  BuildQuizInput,
  ContentProvider,
  DiscoverSourcesInput,
  DraftProgramInput,
  WriteLessonInput,
} from "../ports/content-provider.js";
import { digestPrompt, digestSystem, DIGEST_TOOL } from "../prompts/digest.js";
import { lessonPrompt, lessonSystem, LESSON_TOOL } from "../prompts/lesson.js";
import { programPrompt, programSystem, PROGRAM_TOOL } from "../prompts/program.js";
import { quizPrompt, quizSystem, QUIZ_TOOL } from "../prompts/quiz.js";
import {
  discoverSourcesPrompt,
  discoverSourcesSystem,
  DISCOVER_SOURCES_TOOL,
} from "../prompts/sources.js";
import { digestSchema, toDigestDraft } from "../schemas/digest.js";
import {
  lessonContentSchema,
  toLessonContentDraft,
  type LessonContentPayload,
} from "../schemas/lesson.js";
import { programDraftSchema, toProgramDraft, type ProgramPayload } from "../schemas/program.js";
import { quizSchema, toQuizDraft } from "../schemas/quiz.js";
import { discoverSourcesSchema, toSourceCandidates } from "../schemas/sources.js";
import { DEFAULT_MODEL } from "./models.js";
import { runStructured, type MessagesClient } from "./structured.js";

export interface AnthropicProviderConfig {
  readonly apiKey: string;
  readonly model?: string;
  /**
   * Custom fetch. On Android the app passes Tauri's HTTP plugin here so the
   * request leaves the WebView and is not subject to CORS.
   */
  readonly fetch?: typeof globalThis.fetch;
  readonly maxIterations?: number;
}

/** How hard each kind of call should search. Longer windows warrant more digging. */
const DIGEST_SEARCHES: Record<DigestPeriod, number> = { day: 8, week: 12, month: 16, year: 20 };

export const createAnthropicClient = (config: AnthropicProviderConfig): Anthropic =>
  new Anthropic({
    apiKey: config.apiKey,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

/**
 * The Claude-backed content provider.
 *
 * `client` is injected rather than constructed here so tests can drive the
 * whole provider without a network, and so the app can swap in a
 * Tauri-transported client on Android.
 */
export const createAnthropicProviderWith = (
  client: MessagesClient,
  config: { readonly model?: string; readonly maxIterations?: number } = {},
): ContentProvider => {
  const runnerConfig = {
    model: config.model ?? DEFAULT_MODEL,
    ...(config.maxIterations === undefined ? {} : { maxIterations: config.maxIterations }),
  };

  return {
    id: "anthropic",

    async discoverSources(input: DiscoverSourcesInput) {
      const result = await runStructured(client, runnerConfig, {
        system: discoverSourcesSystem(),
        prompt: discoverSourcesPrompt(input),
        toolName: DISCOVER_SOURCES_TOOL,
        toolDescription: "Report the sources found for this topic.",
        schema: discoverSourcesSchema,
        maxTokens: 8000,
        maxSearches: 8,
        blockedDomains: input.blockedHosts,
        effort: "medium",
      });
      return mapResult(result, toSourceCandidates);
    },

    async buildDigest(input: BuildDigestInput) {
      const result = await runStructured(client, runnerConfig, {
        system: digestSystem(input.period),
        prompt: digestPrompt(input),
        toolName: DIGEST_TOOL,
        toolDescription: "Report the digest for the requested window.",
        schema: digestSchema,
        maxTokens: 16000,
        maxSearches: DIGEST_SEARCHES[input.period] ?? 8,
        blockedDomains: input.blockedHosts,
        effort: "high",
      });
      return mapResult(result, toDigestDraft);
    },

    async draftProgram(input: DraftProgramInput) {
      const result = await runStructured(client, runnerConfig, {
        system: programSystem(input.continuation),
        prompt: programPrompt(input),
        toolName: PROGRAM_TOOL,
        toolDescription: "Report the study program.",
        schema: programDraftSchema,
        maxTokens: 12000,
        maxSearches: 5,
        blockedDomains: [],
        effort: "high",
      });
      return mapResult(result, (payload: ProgramPayload) =>
        toProgramDraft(payload, input.minutesPerSession),
      );
    },

    async writeLesson(input: WriteLessonInput) {
      const result = await runStructured(client, runnerConfig, {
        system: lessonSystem(),
        prompt: lessonPrompt(input),
        toolName: LESSON_TOOL,
        toolDescription: "Report the finished lecture.",
        schema: lessonContentSchema,
        maxTokens: 16000,
        maxSearches: 10,
        blockedDomains: input.blockedHosts,
        effort: "xhigh",
      });
      return mapResult(result, (payload: LessonContentPayload) =>
        toLessonContentDraft(payload, input.priorMaterial),
      );
    },

    async buildQuiz(input: BuildQuizInput) {
      const result = await runStructured(client, runnerConfig, {
        system: quizSystem(),
        prompt: quizPrompt(input),
        toolName: QUIZ_TOOL,
        toolDescription: "Report the self-check questions.",
        schema: quizSchema,
        // The lecture is already in the prompt; searching again adds nothing.
        maxTokens: 8000,
        maxSearches: 0,
        blockedDomains: [],
        effort: "medium",
      });
      return mapResult(result, toQuizDraft);
    },
  };
};

export const createAnthropicProvider = (config: AnthropicProviderConfig): ContentProvider =>
  createAnthropicProviderWith(createAnthropicClient(config), {
    ...(config.model === undefined ? {} : { model: config.model }),
    ...(config.maxIterations === undefined ? {} : { maxIterations: config.maxIterations }),
  });
