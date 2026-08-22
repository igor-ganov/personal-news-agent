import type { ClaimStrategy, ClaimSummary, StateCounts } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, queryAll, text, unmountAll } from "../testing/dom.js";
import { describeCounts, PnaClaimChoice } from "./pna-claim-choice.js";

const counts = (over: Partial<StateCounts> = {}): StateCounts => ({
  topics: 0,
  sources: 0,
  digests: 0,
  programs: 0,
  lessons: 0,
  quizzes: 0,
  attempts: 0,
  ...over,
});

const summary: ClaimSummary = {
  local: counts({ topics: 2, digests: 5 }),
  account: counts({ topics: 1, programs: 3 }),
  needsChoice: true,
  suggested: "merge",
};

const view = async (props: Partial<PnaClaimChoice> = {}): Promise<PnaClaimChoice> => {
  const element = new PnaClaimChoice();
  Object.assign(element, { summary, ...props });
  return mount(element);
};

afterEach(unmountAll);

describe("describeCounts", () => {
  it("склоняет числительные", () => {
    expect(describeCounts(counts({ topics: 1 }))).toBe("1 тема");
    expect(describeCounts(counts({ topics: 3 }))).toBe("3 темы");
    expect(describeCounts(counts({ topics: 11 }))).toBe("11 тем");
  });

  it("перечисляет только непустое", () => {
    expect(describeCounts(counts({ topics: 2, digests: 5 }))).toBe("2 темы, 5 дайджестов");
  });

  it("пустую сторону называет пустой", () => {
    expect(describeCounts(counts())).toBe("пусто");
  });
});

describe("pna-claim-choice", () => {
  it("показывает, что лежит с каждой стороны", async () => {
    const element = await view();

    expect(text(element)).toContain("2 темы, 5 дайджестов");
    expect(text(element)).toContain("1 тема, 3 программы");
  });

  it("объединение стоит первым", async () => {
    const element = await view();
    expect(queryAll(element, "ui-button")[0]?.textContent).toContain("Объединить");
  });

  it("сообщает выбранную стратегию", async () => {
    const element = await view();
    const chosen = capture<ClaimStrategy>(element, "claim-choose");

    for (const button of queryAll(element, "ui-button")) await click(element, button);

    expect(chosen).toEqual(["merge", "keep-account", "keep-local"]);
  });

  it("во время применения кнопки заблокированы", async () => {
    const element = await view({ busy: true });
    for (const button of queryAll(element, "ui-button"))
      expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("без сводки ничего не рисует", async () => {
    const element = await view({ summary: null });
    expect(text(element)).toBe("");
  });

  it("говорит, чья копия победит при совпадении", async () => {
    const element = await view();
    expect(text(element)).toContain("побеждает копия из аккаунта");
  });
});
