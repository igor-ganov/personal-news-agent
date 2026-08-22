import type { LessonId, ProgramId, TopicId } from "@pna/core";
import { describe, expect, it } from "vitest";
import { HOME, parseRoute, routeHref, sameRoute } from "./route.js";

describe("parseRoute", () => {
  it("maps the empty hash to the topic list", () => {
    expect(parseRoute("")).toEqual(HOME);
    expect(parseRoute("#")).toEqual(HOME);
    expect(parseRoute("#/")).toEqual(HOME);
  });

  it("parses a topic with its tab", () => {
    expect(parseRoute("#/t/topic_1?tab=skills")).toEqual({
      name: "topic",
      topicId: "topic_1",
      tab: "skills",
    });
  });

  it("defaults to the news tab", () => {
    expect(parseRoute("#/t/topic_1")).toMatchObject({ tab: "news" });
    expect(parseRoute("#/t/topic_1?tab=nonsense")).toMatchObject({ tab: "news" });
  });

  it("parses programs, lessons and settings", () => {
    expect(parseRoute("#/p/program_2")).toEqual({ name: "program", programId: "program_2" });
    expect(parseRoute("#/l/lesson_3")).toEqual({ name: "lesson", lessonId: "lesson_3" });
    expect(parseRoute("#/settings")).toEqual({ name: "settings" });
  });

  it("decodes ids that were escaped in the url", () => {
    expect(parseRoute("#/t/topic%2F1")).toMatchObject({ topicId: "topic/1" });
  });

  it("falls back home for anything unrecognised", () => {
    expect(parseRoute("#/nope")).toEqual(HOME);
    expect(parseRoute("#/t/")).toEqual(HOME);
    expect(parseRoute("#/p")).toEqual(HOME);
  });
});

describe("routeHref", () => {
  it("round-trips every route", () => {
    const routes = [
      HOME,
      { name: "topic", topicId: "topic_1" as TopicId, tab: "sources" } as const,
      { name: "program", programId: "program_1" as ProgramId } as const,
      { name: "lesson", lessonId: "lesson_1" as LessonId } as const,
      { name: "settings" } as const,
    ];
    for (const route of routes) {
      expect(parseRoute(routeHref(route))).toEqual(route);
    }
  });

  it("escapes ids", () => {
    expect(routeHref({ name: "lesson", lessonId: "a/b" as LessonId })).toBe("#/l/a%2Fb");
  });
});

describe("sameRoute", () => {
  it("compares by destination, not by identity", () => {
    expect(sameRoute(HOME, { name: "topics" })).toBe(true);
    expect(
      sameRoute(
        { name: "topic", topicId: "t" as TopicId, tab: "news" },
        { name: "topic", topicId: "t" as TopicId, tab: "skills" },
      ),
    ).toBe(false);
  });
});

describe("маршрут аккаунта", () => {
  it("разбирается и собирается обратно", () => {
    expect(parseRoute("#/account")).toEqual({ name: "account" });
    expect(routeHref({ name: "account" })).toBe("#/account");
  });
});
