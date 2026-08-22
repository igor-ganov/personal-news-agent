import type { Source, SourceId, SourceStatus, TopicId, UserSourceDraft } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, text, unmountAll } from "../testing/dom.js";
import type { SourceStatusChange } from "./pna-source-item.js";
import { PnaSourceList } from "./pna-source-list.js";

const source = (id: string, status: SourceStatus = "active"): Source => ({
  id: id as SourceId,
  topicId: "t1" as TopicId,
  title: `Источник ${id}`,
  url: `https://${id}.example/feed`,
  key: `${id}.example/feed`,
  kind: "rss",
  origin: "discovered",
  status,
  rationale: "по теме",
  addedAt: "2026-08-22T10:00:00.000Z" as never,
  lastConfirmedAt: null,
});

const render = async (sources: Source[]) => {
  const element = new PnaSourceList();
  element.sources = sources;
  return mount(element);
};

afterEach(unmountAll);

describe("pna-source-list", () => {
  it("counts only the active sources in the header", async () => {
    const element = await render([source("a"), source("b", "muted"), source("c", "blacklisted")]);
    expect(text(element)).toContain("1 источник активно");
    expect(text(element)).toContain("1 приглушено");
  });

  it("keeps blacklisted sources out of the working list", async () => {
    const element = await render([source("a"), source("c", "blacklisted")]);
    expect(queryAll(element, "pna-source-item")).toHaveLength(1);
  });

  it("reveals the blacklist on demand so it can be undone", async () => {
    const element = await render([source("a"), source("c", "blacklisted")]);
    expect(text(element)).toContain("Показать блеклист");

    const toggle = queryAll(element, ".toggle ui-button")[0] ?? null;
    await click(element, toggle);
    expect(queryAll(element, "pna-source-item")).toHaveLength(2);
  });

  it("does not mention a blacklist when there is none", async () => {
    const element = await render([source("a")]);
    expect(text(element)).not.toContain("блеклист");
  });

  it("asks for a refresh", async () => {
    const element = await render([source("a")]);
    const events = capture(element, "source-refresh");
    await click(element, query(element, "header ui-button"));
    expect(events).toHaveLength(1);
  });

  it("collects a hand-written source and closes the form", async () => {
    const element = await render([]);
    const events = capture<UserSourceDraft>(element, "source-add");

    await click(element, queryAll(element, "ui-button")[1] ?? null);
    const fields = queryAll(element, "ui-field");
    fields[0]!.dispatchEvent(new CustomEvent("field-input", { detail: "Мой блог", bubbles: true, composed: true }));
    fields[1]!.dispatchEvent(
      new CustomEvent("field-input", { detail: "example.com/feed", bubbles: true, composed: true }),
    );
    await element.updateComplete;

    const add = queryAll(element, ".add-actions ui-button")[1] ?? null;
    await click(element, add);

    expect(events).toEqual([{ title: "Мой блог", url: "example.com/feed" }]);
    expect(query(element, ".add")).toBeNull();
  });

  it("passes a status change up from a row", async () => {
    const element = await render([source("a")]);
    const events = capture<SourceStatusChange>(element, "source-status");

    const item = queryAll(element, "pna-source-item")[0]!;
    item.dispatchEvent(
      new CustomEvent("source-status", {
        detail: { id: "a", status: "blacklisted" },
        bubbles: true,
        composed: true,
      }),
    );

    expect(events).toEqual([{ id: "a", status: "blacklisted" }]);
  });

  it("explains the empty state", async () => {
    const element = await render([]);
    expect(query(element, "ui-notice")?.getAttribute("tone")).toBe("empty");
  });

  it("shows a provider error", async () => {
    const element = new PnaSourceList();
    element.sources = [source("a")];
    element.error = "Нет сети";
    await mount(element);
    expect(query(element, 'ui-notice[tone="error"]')).not.toBeNull();
  });
});
