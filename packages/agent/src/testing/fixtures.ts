import {
  focusId,
  instantOf,
  topicContextOf,
  type LessonPlan,
  type ModuleId,
  type LessonId,
  type Topic,
  type TopicContext,
  type TopicId,
} from "@pna/core";

export const T0 = instantOf("2026-08-22T10:00:00Z");

const topic = (over: Partial<Topic> = {}): Topic => ({
  id: "inf" as TopicId,
  parentId: null,
  title: "Инференс",
  brief: "Гонять модели локально",
  focusAreas: [
    { id: focusId("f1"), title: "Латентность", detail: "p99 на CPU", weight: 5 },
    { id: focusId("f2"), title: "Память", detail: "влезть в 16 ГБ", weight: 4 },
  ],
  excludes: ["Хайп"],
  language: "ru",
  level: "advanced",
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

export const testContext = (over: Partial<Topic> = {}): TopicContext => {
  const t = topic(over);
  const result = topicContextOf({ [t.id]: t }, t.id);
  if (!result.ok) throw new Error("broken fixture");
  return result.value;
};

export const testLesson = (over: Partial<LessonPlan> = {}): LessonPlan => ({
  id: "l1" as LessonId,
  moduleId: "m1" as ModuleId,
  order: 0,
  title: "Квантизация",
  objective: "Понять, что теряется",
  estimatedMinutes: 45,
  scheduledFor: null,
  status: "planned",
  ...over,
});
