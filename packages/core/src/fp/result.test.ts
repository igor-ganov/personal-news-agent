import { describe, expect, it } from "vitest";
import { allResults, err, flatMapResult, isErr, isOk, mapResult, ok, unwrapOr } from "./result.js";

describe("result", () => {
  it("narrows ok and err", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err("boom"))).toBe(true);
  });

  it("maps only the ok branch", () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(mapResult(err<string>("boom"), (n: number) => n * 3)).toEqual(err("boom"));
  });

  it("flat-maps and short-circuits on error", () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err("odd"));
    expect(flatMapResult(ok(8), half)).toEqual(ok(4));
    expect(flatMapResult(ok(7), half)).toEqual(err("odd"));
    expect(flatMapResult(err<string>("prior"), half)).toEqual(err("prior"));
  });

  it("unwraps with a fallback", () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr<number, string>(err("boom"), 0)).toBe(0);
  });

  it("collects results, failing on the first error", () => {
    expect(allResults([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(allResults([ok(1), err("bad"), err("worse")])).toEqual(err("bad"));
  });
});
