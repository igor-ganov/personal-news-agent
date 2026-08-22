/** Test data builders. Every field has a sane default; override only what matters. */
import type { Digest } from "../model/digest.js";
import { focusId, type SourceId, type TopicId } from "../model/ids.js";
import type { Question, Quiz } from "../model/quiz.js";
import type { LessonPlan, ProgramModule, SkillProgram } from "../model/skill.js";
import type { Source } from "../model/source.js";
import type { FocusArea, Topic } from "../model/topic.js";
import { instantOf, type CalendarDay, type Instant } from "../time/instant.js";
import type { TopicMap } from "../topics/tree.js";

export const T0 = instantOf("2026-08-22T10:00:00Z");

export const makeFocus = (over: Partial<FocusArea> = {}): FocusArea => ({
  id: focusId("focus_1"),
  title: "Фокус",
  detail: "Детали фокуса",
  weight: 3,
  ...over,
});

export const makeTopic = (over: Partial<Topic> = {}): Topic => ({
  id: "topic_1" as TopicId,
  parentId: null,
  title: "Тема",
  brief: "Что интересно в этой теме",
  focusAreas: [],
  excludes: [],
  language: "ru",
  level: "intermediate",
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

/** Builds a topic map keyed by id, preserving the given order via createdAt. */
export const topicMapOf = (...topics: Topic[]): TopicMap =>
  Object.fromEntries(
    topics.map((t, i) => [
      t.id,
      { ...t, createdAt: instantOf(Date.parse(T0) + i * 1000) as Instant },
    ]),
  );

export const makeSource = (over: Partial<Source> = {}): Source => ({
  id: "source_1" as SourceId,
  topicId: "topic_1" as TopicId,
  title: "Источник",
  url: "https://example.com/feed",
  key: "example.com/feed",
  kind: "rss",
  origin: "discovered",
  status: "active",
  rationale: "Регулярно пишет по теме",
  addedAt: T0,
  lastConfirmedAt: null,
  ...over,
});

export const makeLessonPlan = (over: Partial<LessonPlan> = {}): LessonPlan => ({
  id: "lesson_1" as LessonPlan["id"],
  moduleId: "module_1" as LessonPlan["moduleId"],
  order: 0,
  title: "Урок",
  objective: "Цель урока",
  estimatedMinutes: 45,
  scheduledFor: "2026-09-01" as CalendarDay,
  status: "planned",
  ...over,
});

export const makeModule = (over: Partial<ProgramModule> = {}): ProgramModule => ({
  id: "module_1" as ProgramModule["id"],
  order: 0,
  title: "Модуль",
  objective: "Цель модуля",
  lessons: [makeLessonPlan()],
  ...over,
});

export const makeProgram = (over: Partial<SkillProgram> = {}): SkillProgram => ({
  id: "program_1" as SkillProgram["id"],
  topicId: "topic_1" as TopicId,
  title: "Программа",
  goal: "Цель программы",
  basedOn: [],
  continuation: "fresh",
  schedule: {
    startDay: "2026-09-01" as CalendarDay,
    intensity: { weeks: 4, sessionsPerWeek: 3, minutesPerSession: 45 },
  },
  modules: [makeModule()],
  status: "draft",
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

export const makeQuestion = (over: Partial<Question> = {}): Question => ({
  id: "q1",
  kind: "single",
  prompt: "Вопрос?",
  options: [
    { id: "a", text: "Вариант А" },
    { id: "b", text: "Вариант Б" },
  ],
  correctOptionIds: ["a"],
  expectedPoints: [],
  explanation: "Потому что А",
  ...over,
});

export const makeQuiz = (over: Partial<Quiz> = {}): Quiz => ({
  id: "quiz_1" as Quiz["id"],
  lessonId: "lesson_1" as Quiz["lessonId"],
  questions: [makeQuestion()],
  ...over,
});

export const makeDigest = (over: Partial<Digest> = {}): Digest => ({
  id: "digest_1" as Digest["id"],
  topicId: "topic_1" as TopicId,
  period: "day",
  window: { from: instantOf("2026-08-21T00:00:00Z"), to: instantOf("2026-08-22T00:00:00Z") },
  generatedAt: T0,
  headline: "Заголовок",
  summary: "Выжимка",
  sections: [],
  sourceIds: [],
  ...over,
});
