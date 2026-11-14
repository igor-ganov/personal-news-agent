import { QUEUED_PROGRESS, STARTED_PROGRESS, type GenerationProgress } from "@pna/core";
import { describe, expect, it } from "vitest";
import { progressSteps } from "./progress.js";

const at = (over: Partial<GenerationProgress>): GenerationProgress => ({ ...STARTED_PROGRESS, ...over });

describe("progressSteps — what a running generation is doing, in words", () => {
  it("says nothing when nobody reported anything", () => {
    expect(progressSteps("sources", null)).toEqual([]);
  });

  it("explains the wait for the server's queue", () => {
    expect(progressSteps("lesson", QUEUED_PROGRESS)).toEqual([
      "В очереди на сервере — начнётся в течение минуты",
    ]);
  });

  it("names the search under way and the sites it came back with", () => {
    expect(
      progressSteps(
        "sources",
        at({ stage: "searching", query: "tokio", searches: 2, found: ["tokio.rs", "without.boats"] }),
      ),
    ).toEqual(["Поиск 2: «tokio»", "Смотрю: tokio.rs, without.boats"]);
  });

  it("before the first query is complete it says a search is starting", () => {
    expect(progressSteps("digest", at({ stage: "searching" }))).toEqual(["Начинаю поиск"]);
  });

  it("names the source being added", () => {
    expect(
      progressSteps("sources", at({ stage: "writing", item: "Tokio blog", items: 2, searches: 3 })),
    ).toEqual(["Добавляю источник «Tokio blog»", "Позади поисков: 3"]);
  });

  it("names the part of the plan, the lecture section, the digest entry and the question", () => {
    expect(progressSteps("program", at({ stage: "writing", item: "Модуль 1" }))[0]).toBe(
      "Расписываю «Модуль 1»",
    );
    expect(progressSteps("lesson", at({ stage: "writing", item: "Lifetimes" }))[0]).toBe(
      "Пишу раздел «Lifetimes»",
    );
    expect(progressSteps("quiz", at({ stage: "writing", item: "Что такое Pin?", items: 3 }))[0]).toBe(
      "Вопрос 3: «Что такое Pin?»",
    );
    expect(progressSteps("digest", at({ stage: "writing", item: "Релиз Tokio 2" }))[0]).toBe(
      "Пишу о «Релиз Tokio 2»",
    );
  });

  it("before the first item it says the answer is being put together", () => {
    expect(progressSteps("program", at({ stage: "writing" }))).toEqual(["Собираю ответ"]);
  });

  it("tells thinking before any search from thinking over results", () => {
    expect(progressSteps("lesson", at({ stage: "thinking" }))).toEqual(["Обдумываю, с чего начать"]);
    expect(progressSteps("lesson", at({ stage: "thinking", searches: 2, query: "q" }))).toEqual([
      "Обдумываю найденное",
      "Позади поисков: 2",
    ]);
  });

  it("owns up to a malformed answer being fixed", () => {
    expect(progressSteps("digest", at({ stage: "fixing" }))).toEqual([
      "Модель ошиблась в формате ответа — исправляет",
    ]);
  });
});
