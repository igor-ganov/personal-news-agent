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
import { sdkErrorMapper, structuralErrorMapper, type ErrorMapper } from "./errors.js";
import { DEFAULT_MODEL } from "./models.js";
import { loadAnthropicSdk } from "./sdk.js";
import { runStructured, type MessagesClient } from "./structured.js";

export interface AnthropicProviderConfig {
  readonly apiKey: string;
  readonly model?: string;
  /**
   * Custom fetch. Useful when the host wants requests to leave the WebView
   * through a native transport instead of the browser stack.
   */
  readonly fetch?: typeof globalThis.fetch;
  readonly maxIterations?: number;
  /**
   * Allows the SDK to run inside a WebView. The app is local-first: the key
   * belongs to the user and never leaves their device except to Anthropic, so
   * there is no server to hide it behind.
   */
  readonly allowBrowser?: boolean;
}

/** How hard each kind of call should search. Longer windows warrant more digging. */
const DIGEST_SEARCHES: Record<DigestPeriod, number> = { day: 8, week: 12, month: 16, year: 20 };

interface Runtime {
  readonly client: MessagesClient;
  readonly mapError: ErrorMapper;
}

type RuntimeResolver = () => Promise<Runtime>;

interface ProviderOptions {
  readonly model?: string;
  readonly maxIterations?: number;
}

const buildProvider = (resolve: RuntimeResolver, options: ProviderOptions): ContentProvider => {
  const runner = async (): Promise<{
    client: MessagesClient;
    config: { model: string; maxIterations?: number; mapError: ErrorMapper };
  }> => {
    const { client, mapError } = await resolve();
    return {
      client,
      config: {
        model: options.model ?? DEFAULT_MODEL,
        ...(options.maxIterations === undefined ? {} : { maxIterations: options.maxIterations }),
        mapError,
      },
    };
  };

  return {
    id: "anthropic",

    async discoverSources(input: DiscoverSourcesInput) {
      const { client, config } = await runner();
      const result = await runStructured(client, config, {
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
      const { client, config } = await runner();
      const result = await runStructured(client, config, {
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
      const { client, config } = await runner();
      const result = await runStructured(client, config, {
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
      const { client, config } = await runner();
      const result = await runStructured(client, config, {
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
      const { client, config } = await runner();
      const result = await runStructured(client, config, {
        system: quizSystem(),
        prompt: quizPrompt(input),
        toolName: QUIZ_TOOL,
        toolDescription: "Report the self-check questions.",
        schema: quizSchema,
        maxTokens: 8000,
        // The lecture is already in the prompt; searching again adds nothing.
        maxSearches: 0,
        blockedDomains: [],
        effort: "medium",
      });
      return mapResult(result, toQuizDraft);
    },
  };
};

/**
 * The Claude-backed content provider.
 *
 * The SDK is imported the first time a call is made, not at module load, so the
 * app starts without it. Everything after that is ordinary SDK usage, including
 * its typed error classes.
 */
export const createAnthropicProvider = (config: AnthropicProviderConfig): ContentProvider => {
  let runtime: Promise<Runtime> | null = null;

  const resolve: RuntimeResolver = () =>
    (runtime ??= (async () => {
      const sdk = await loadAnthropicSdk();
      const client = new sdk.default({
        apiKey: config.apiKey,
        ...(config.fetch ? { fetch: config.fetch } : {}),
        ...(config.allowBrowser ? { dangerouslyAllowBrowser: true } : {}),
      });
      return { client, mapError: sdkErrorMapper(sdk) };
    })());

  return buildProvider(resolve, {
    ...(config.model === undefined ? {} : { model: config.model }),
    ...(config.maxIterations === undefined ? {} : { maxIterations: config.maxIterations }),
  });
};

/**
 * The same provider over a client supplied by the caller — how tests drive the
 * whole thing without a network, and how a host can plug in its own transport.
 */
export const createAnthropicProviderWith = (
  client: MessagesClient,
  options: ProviderOptions = {},
): ContentProvider =>
  buildProvider(async () => ({ client, mapError: structuralErrorMapper }), options);
