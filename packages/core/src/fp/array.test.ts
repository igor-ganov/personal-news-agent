import { describe, expect, it } from "vitest";
import { chunk, distributeEvenly, groupBy, partition, sortBy, uniqueBy } from "./array.js";

describe("array helpers", () => {
  it("keeps the first occurrence when deduplicating", () => {
    const items = [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
      { id: "a", n: 3 },
    ];
    expect(uniqueBy(items, (i) => i.id).map((i) => i.n)).toEqual([1, 2]);
  });

  it("groups by a string key", () => {
    expect(groupBy(["one", "two", "three"], (s) => (s.length > 3 ? "long" : "short"))).toEqual({
      short: ["one", "two"],
      long: ["three"],
    });
  });

  it("sorts without mutating the input", () => {
    const input = [3, 1, 2];
    expect(sortBy(input, (n) => n)).toEqual([1, 2, 3]);
    expect(input).toEqual([3, 1, 2]);
  });

  it("partitions by a predicate", () => {
    expect(partition([1, 2, 3, 4], (n) => n % 2 === 0)).toEqual([
      [2, 4],
      [1, 3],
    ]);
  });

  it("chunks and refuses non-positive sizes", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 0)).toEqual([]);
  });

  it("distributes remainders to the earliest buckets", () => {
    expect(distributeEvenly(7, 3)).toEqual([3, 2, 2]);
    expect(distributeEvenly(6, 3)).toEqual([2, 2, 2]);
    expect(distributeEvenly(2, 5)).toEqual([1, 1, 0, 0, 0]);
    expect(distributeEvenly(5, 0)).toEqual([]);
  });
});
