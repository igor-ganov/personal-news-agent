import type {
  DigestDraft,
  LessonContentDraft,
  ProgramDraft,
  QuizDraft,
  SourceCandidate,
} from "@pna/core";
import type {
  BuildDigestInput,
  BuildQuizInput,
  ContentProvider,
  DiscoverSourcesInput,
  DraftProgramInput,
  GenerationOptions,
  ProviderResult,
  WriteLessonInput,
} from "../ports/content-provider.js";

/**
 * The vocabulary of work that can be handed to a server instead of being run
 * on the device.
 *
 * Both sides of the wire speak it: the app builds a request, the server picks
 * the matching provider call. Nothing else about the domain has to cross —
 * the server never learns what a topic or a lesson is, only which of these
 * five calls to make with the payload it was given.
 */
export const AGENT_JOB_KINDS = ["sources", "digest", "program", "lesson", "quiz"] as const;

export type AgentJobKind = (typeof AGENT_JOB_KINDS)[number];

export interface AgentJobInputs {
  readonly sources: DiscoverSourcesInput;
  readonly digest: BuildDigestInput;
  readonly program: DraftProgramInput;
  readonly lesson: WriteLessonInput;
  readonly quiz: BuildQuizInput;
}

export interface AgentJobResults {
  readonly sources: readonly SourceCandidate[];
  readonly digest: DigestDraft;
  readonly program: ProgramDraft;
  readonly lesson: LessonContentDraft;
  readonly quiz: QuizDraft;
}

/** One request, with its input tied to its kind. */
export type AgentJobRequest = {
  [K in AgentJobKind]: { readonly kind: K; readonly input: AgentJobInputs[K] };
}[AgentJobKind];

type Runners = {
  [K in AgentJobKind]: (
    provider: ContentProvider,
    input: AgentJobInputs[K],
    options: GenerationOptions,
  ) => Promise<ProviderResult<AgentJobResults[K]>>;
};

/** A table, not a switch: adding a kind is adding a row. */
const RUNNERS: Runners = {
  sources: (provider, input, options) => provider.discoverSources(input, options),
  digest: (provider, input, options) => provider.buildDigest(input, options),
  program: (provider, input, options) => provider.draftProgram(input, options),
  lesson: (provider, input, options) => provider.writeLesson(input, options),
  quiz: (provider, input, options) => provider.buildQuiz(input, options),
};

export const isAgentJobKind = (value: unknown): value is AgentJobKind =>
  typeof value === "string" && (AGENT_JOB_KINDS as readonly string[]).includes(value);

/**
 * Runs a request against a provider.
 *
 * The cast is confined to this one line: `RUNNERS[kind]` and `request.input`
 * are correlated by construction, but TypeScript loses that pairing once the
 * union is indexed.
 */
export const runAgentJob = (
  provider: ContentProvider,
  request: AgentJobRequest,
  options: GenerationOptions = {},
): Promise<ProviderResult<AgentJobResults[AgentJobKind]>> =>
  (RUNNERS[request.kind] as (
    p: ContentProvider,
    i: unknown,
    o: GenerationOptions,
  ) => Promise<ProviderResult<never>>)(
    provider,
    request.input,
    options,
  );
