import { describe, expect, it } from "vitest";
import { appendSuggestions, readSuggestions, type Suggestion } from "./suggestion.js";

const idea = (title: string): Suggestion => ({ title, summary: `${title} в двух словах`, brief: "", focus: [] });

describe("readSuggestions — ideas that came back over the wire", () => {
  it("keeps well-formed ideas and trims them", () => {
    expect(
      readSuggestions([{ title: " Rust async ", summary: "s", brief: "b", focus: ["Pin", 3, " "] }]),
    ).toEqual([{ title: "Rust async", summary: "s", brief: "b", focus: ["Pin"] }]);
  });

  it("drops ideas without a title and anything that is not a list", () => {
    expect(readSuggestions([{ title: "  " }, null, "x"])).toEqual([]);
    expect(readSuggestions({ title: "x" })).toEqual([]);
  });
});

describe("appendSuggestions — «ещё» adds, never repeats", () => {
  it("adds the new batch after what is shown", () => {
    expect(appendSuggestions([idea("A")], [idea("B")]).map((s) => s.title)).toEqual(["A", "B"]);
  });

  it("skips an idea already shown, whatever its case or spacing", () => {
    expect(appendSuggestions([idea("Rust Async")], [idea(" rust  async "), idea("C")]).map((s) => s.title)).toEqual([
      "Rust Async",
      "C",
    ]);
  });
});
