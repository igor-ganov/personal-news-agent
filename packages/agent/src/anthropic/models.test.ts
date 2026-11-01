import { defaultSettings } from "@pna/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, webSearchTool } from "./models.js";

describe("models", () => {
  it("defaults to the current flagship, on the server and in a fresh app", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(defaultSettings().model).toBe(DEFAULT_MODEL);
  });

  it.each(["claude-opus-5-5", "claude-sonnet-5-5"])(
    "gives %s the dynamic-filtering web search",
    (model) => expect(webSearchTool(model, 3, []).type).toBe("web_search_20260209"),
  );
});
