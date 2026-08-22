import { describe, expect, it } from "vitest";
import type {
  AttemptId,
  DigestId,
  LessonId,
  ModuleId,
  ProgramId,
  QuizId,
  SourceId,
  TopicId,
} from "../model/ids.js";
import { emptyState, type AppState } from "../model/state.js";
import {
  makeDigest,
  makeLessonPlan,
  makeModule,
  makeProgram,
  makeQuiz,
  makeSource,
  makeTopic,
  T0,
} from "../testing/builders.js";
import { instantOf } from "../time/instant.js";
import { reduce, reduceAll } from "./reduce.js";

const id = (s: string) => s as TopicId;

describe("reduce — topics", () => {
  it("adds and replaces a topic", () => {
    const topic = makeTopic({ id: id("ai") });
    const added = reduce(emptyState(), { type: "topics/upsert", topic });
    expect(added.topics["ai" as TopicId]).toBe(topic);

    const renamed = { ...topic, title: "Другое" };
    const updated = reduce(added, { type: "topics/upsert", topic: renamed });
    expect(updated.topics["ai" as TopicId]!.title).toBe("Другое");
    expect(Object.keys(updated.topics)).toHaveLength(1);
  });

  it("never mutates the previous state", () => {
    const before = emptyState();
    reduce(before, { type: "topics/upsert", topic: makeTopic() });
    expect(Object.keys(before.topics)).toHaveLength(0);
  });

  it("adds many topics at once", () => {
    const next = reduce(emptyState(), {
      type: "topics/upsert-many",
      topics: [makeTopic({ id: id("a") }), makeTopic({ id: id("b") })],
    });
    expect(Object.keys(next.topics).sort()).toEqual(["a", "b"]);
  });
});

describe("reduce — cascading topic removal", () => {
  const seeded = (): AppState =>
    reduceAll(emptyState(), [
      { type: "topics/upsert", topic: makeTopic({ id: id("ai") }) },
      { type: "topics/upsert", topic: makeTopic({ id: id("inference"), parentId: id("ai") }) },
      { type: "topics/upsert", topic: makeTopic({ id: id("music") }) },
      {
        type: "sources/upsert-many",
        sources: [
          makeSource({ id: "s_ai" as SourceId, topicId: id("ai") }),
          makeSource({ id: "s_inf" as SourceId, topicId: id("inference") }),
          makeSource({ id: "s_music" as SourceId, topicId: id("music") }),
        ],
      },
      { type: "digests/upsert", digest: makeDigest({ id: "d_inf" as DigestId, topicId: id("inference") }) },
      { type: "digests/upsert", digest: makeDigest({ id: "d_music" as DigestId, topicId: id("music") }) },
      {
        type: "programs/upsert",
        program: makeProgram({
          id: "p_inf" as ProgramId,
          topicId: id("inference"),
          modules: [
            makeModule({
              id: "m1" as ModuleId,
              lessons: [makeLessonPlan({ id: "l1" as LessonId, moduleId: "m1" as ModuleId })],
            }),
          ],
        }),
      },
      {
        type: "lessons/content",
        content: {
          lessonId: "l1" as LessonId,
          generatedAt: T0,
          keyPoints: [],
          body: "",
          diagrams: [],
          links: [],
          newsHooks: [],
          priorReferences: [],
        },
      },
      { type: "quizzes/upsert", quiz: makeQuiz({ id: "q1" as QuizId, lessonId: "l1" as LessonId }) },
      {
        type: "attempts/record",
        attempt: {
          id: "a1" as AttemptId,
          quizId: "q1" as QuizId,
          submittedAt: T0,
          answers: { choices: {}, texts: {} },
          result: { quizId: "q1" as QuizId, results: [], gradedCount: 0, correctCount: 0, score: 0, selfReviewIds: [] },
        },
      },
    ]);

  it("removes the topic together with its sub-topics", () => {
    const next = reduce(seeded(), { type: "topics/remove", id: id("ai") });
    expect(Object.keys(next.topics)).toEqual(["music"]);
  });

  it("takes the sources and digests of the whole subtree with it", () => {
    const next = reduce(seeded(), { type: "topics/remove", id: id("ai") });
    expect(Object.keys(next.sources)).toEqual(["s_music"]);
    expect(Object.keys(next.digests)).toEqual(["d_music"]);
  });

  it("takes programs, lesson content, quizzes and attempts with it", () => {
    const next = reduce(seeded(), { type: "topics/remove", id: id("ai") });
    expect(next.programs).toEqual({});
    expect(next.lessonContent).toEqual({});
    expect(next.quizzes).toEqual({});
    expect(next.attempts).toEqual({});
  });

  it("leaves untouched branches alone", () => {
    const next = reduce(seeded(), { type: "topics/remove", id: id("music") });
    expect(Object.keys(next.topics).sort()).toEqual(["ai", "inference"]);
    expect(Object.keys(next.programs)).toEqual(["p_inf"]);
  });

  it("removing a program takes its lesson content, quizzes and attempts", () => {
    const next = reduce(seeded(), { type: "programs/remove", id: "p_inf" as ProgramId });
    expect(next.programs).toEqual({});
    expect(next.lessonContent).toEqual({});
    expect(next.quizzes).toEqual({});
    expect(next.attempts).toEqual({});
    expect(Object.keys(next.topics)).toHaveLength(3);
  });
});

describe("reduce — the rest", () => {
  it("merges sources by id", () => {
    const state = reduce(emptyState(), {
      type: "sources/upsert-many",
      sources: [makeSource({ id: "s1" as SourceId }), makeSource({ id: "s2" as SourceId })],
    });
    const next = reduce(state, {
      type: "sources/upsert-many",
      sources: [makeSource({ id: "s1" as SourceId, status: "blacklisted" })],
    });
    expect(next.sources["s1" as SourceId]!.status).toBe("blacklisted");
    expect(Object.keys(next.sources).sort()).toEqual(["s1", "s2"]);
  });

  it("removes a single source", () => {
    const state = reduce(emptyState(), {
      type: "sources/upsert-many",
      sources: [makeSource({ id: "s1" as SourceId })],
    });
    expect(reduce(state, { type: "sources/remove", id: "s1" as SourceId }).sources).toEqual({});
  });

  it("prunes digests down to the newest per period", () => {
    const state = reduceAll(emptyState(), [
      { type: "digests/upsert", digest: makeDigest({ id: "d1" as DigestId, generatedAt: instantOf("2026-08-01T00:00:00Z") }) },
      { type: "digests/upsert", digest: makeDigest({ id: "d2" as DigestId, generatedAt: instantOf("2026-08-02T00:00:00Z") }) },
    ]);
    expect(Object.keys(reduce(state, { type: "digests/prune", keepPerPeriod: 1 }))).toBeDefined();
    expect(Object.keys(reduce(state, { type: "digests/prune", keepPerPeriod: 1 }).digests)).toEqual(["d2"]);
  });

  it("patches settings without dropping the rest", () => {
    const next = reduce(emptyState(), { type: "settings/patch", patch: { sourceRefreshDays: 3 } });
    expect(next.settings.sourceRefreshDays).toBe(3);
    expect(next.settings.providerId).toBe("anthropic");
  });

  it("replaces the whole state on load", () => {
    const loaded = { ...emptyState(), settings: { ...emptyState().settings, model: "claude-sonnet-5" } };
    expect(reduce(emptyState(), { type: "state/replace", state: loaded })).toBe(loaded);
  });
});
