import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmountAll } from "../testing/dom.js";
import { UiButton } from "./ui-button.js";

const render = async (variant: UiButton["variant"], size: UiButton["size"] = "md") => {
  const element = new UiButton();
  element.variant = variant;
  element.size = size;
  element.textContent = "Действие";
  return mount(element);
};

afterEach(unmountAll);

describe("ui-button — how much a button says about itself", () => {
  it("draws a box only round the main action of a screen", async () => {
    const primary = await render("primary");
    expect(query(primary, "svg.frame")).not.toBeNull();
  });

  it("underlines a secondary action instead of boxing it", async () => {
    const secondary = await render("secondary");
    expect(query(secondary, "svg.frame")).toBeNull();
    expect(query(secondary, "svg.under")).not.toBeNull();
  });

  it("leaves a quiet action as plain text", async () => {
    const ghost = await render("ghost");
    expect(query(ghost, "svg.frame")).toBeNull();
    expect(query(ghost, "svg.under")).toBeNull();
  });

  it("underlines a destructive action in the warning colour, never boxes it", async () => {
    const danger = await render("danger");
    expect(query(danger, "svg.frame")).toBeNull();
    expect(query(danger, "svg.under")).not.toBeNull();
  });

  it("keeps a small button a full finger tall", async () => {
    const small = await render("secondary", "sm");
    const rules = [...(small.shadowRoot!.adoptedStyleSheets ?? [])]
      .flatMap((sheet) => [...sheet.cssRules])
      .map((rule) => rule.cssText)
      .filter((rule) => rule.includes("sm"));
    expect(rules.join(" ")).not.toMatch(/min-height:\s*36px/);
  });
});

describe("ui-button wording", () => {
  // A shared heading class once leaked into the label and set every button in grey italics.
  it("keeps its label clear of the section-heading style", async () => {
    const element = await render("primary");
    expect(query(element, "button .label")).toBeNull();
  });
});
