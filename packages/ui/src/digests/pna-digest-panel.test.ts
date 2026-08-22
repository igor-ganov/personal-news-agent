import type { Digest, DigestId, DigestPeriod, TopicId } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, text, unmountAll } from "../testing/dom.js";
import { PnaDigestPanel } from "./pna-digest-panel.js";

const digest = (id: string, generatedAt: string, period: DigestPeriod = "day"): Digest => ({
  id: id as DigestId,
  topicId: "t1" as TopicId,
  period,
  window: { from: generatedAt as never, to: generatedAt as never },
  generatedAt: generatedAt as never,
  headline: `Заголовок ${id}`,
  summary: `Выжимка ${id}`,
  sections: [],
  sourceIds: [],
});

const newest = digest("d3", "2026-08-22T09:00:00.000Z");
const middle = digest("d2", "2026-08-21T09:00:00.000Z");
const oldest = digest("d1", "2026-08-20T09:00:00.000Z");

const render = async (over: Partial<PnaDigestPanel> = {}) => {
  const element = new PnaDigestPanel();
  Object.assign(element, over);
  return mount(element);
};

const openHeadline = (element: PnaDigestPanel): string | undefined =>
  (query(element, "pna-digest-view") as unknown as { digest?: Digest } | null)?.digest?.headline;

afterEach(unmountAll);

describe("pna-digest-panel — история", () => {
  it("says there is nothing yet before the first digest", async () => {
    const element = await render();
    expect(query(element, "ui-notice")?.getAttribute("tone")).toBe("empty");
  });

  it("shows the newest digest of the period", async () => {
    const element = await render({ digests: { day: [newest, middle, oldest] } });
    expect(openHeadline(element)).toBe("Заголовок d3");
  });

  it("lists the whole history, newest first", async () => {
    const element = await render({ digests: { day: [newest, middle, oldest] } });
    expect(text(element)).toContain("История — 3");
    expect(queryAll(element, ".history-items ui-chip")).toHaveLength(3);
  });

  it("hides the history strip when there is only one digest", async () => {
    const element = await render({ digests: { day: [newest] } });
    expect(query(element, ".history")).toBeNull();
  });

  it("opens an older digest with its full content", async () => {
    const element = await render({ digests: { day: [newest, middle, oldest] } });
    await click(element, queryAll(element, ".history-items ui-chip")[2] ?? null);
    expect(openHeadline(element)).toBe("Заголовок d1");
  });

  it("keeps the chosen digest when the list is re-rendered unchanged", async () => {
    const element = await render({ digests: { day: [newest, middle, oldest] } });
    await click(element, queryAll(element, ".history-items ui-chip")[2] ?? null);

    element.digests = { day: [newest, middle, oldest] };
    await element.updateComplete;
    expect(openHeadline(element)).toBe("Заголовок d1");
  });

  it("jumps to a freshly generated digest", async () => {
    const element = await render({ digests: { day: [middle, oldest] } });
    await click(element, queryAll(element, ".history-items ui-chip")[1] ?? null);
    expect(openHeadline(element)).toBe("Заголовок d1");

    element.digests = { day: [newest, middle, oldest] };
    await element.updateComplete;
    expect(openHeadline(element)).toBe("Заголовок d3");
  });

  it("remembers the choice separately per period", async () => {
    const week = digest("w1", "2026-08-18T09:00:00.000Z", "week");
    const element = await render({ digests: { day: [newest, middle, oldest], week: [week] } });
    await click(element, queryAll(element, ".history-items ui-chip")[2] ?? null);

    await click(element, queryAll(element, ".periods ui-chip")[1] ?? null);
    expect(openHeadline(element)).toBe("Заголовок w1");

    await click(element, queryAll(element, ".periods ui-chip")[0] ?? null);
    expect(openHeadline(element)).toBe("Заголовок d1");
  });

  it("falls back to the newest when the open digest was pruned away", async () => {
    const element = await render({ digests: { day: [newest, middle, oldest] } });
    await click(element, queryAll(element, ".history-items ui-chip")[2] ?? null);

    element.digests = { day: [newest, middle] };
    await element.updateComplete;
    expect(openHeadline(element)).toBe("Заголовок d3");
  });

  it("asks for a digest for the period on screen", async () => {
    const element = await render({ digests: { day: [newest] } });
    const events = capture<DigestPeriod>(element, "digest-request");

    await click(element, queryAll(element, ".periods ui-chip")[2] ?? null);
    await click(element, query(element, ".ask ui-button"));
    expect(events).toEqual(["month"]);
  });

  it("shows a per-period busy state without hiding the history", async () => {
    const element = await render({
      digests: { day: [newest, middle] },
      busyPeriods: ["day"],
    });
    expect(text(element)).toContain("Собираю…");
    expect(openHeadline(element)).toBe("Заголовок d3");
  });
});
