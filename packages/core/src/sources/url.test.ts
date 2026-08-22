import { describe, expect, it } from "vitest";
import { canonicalSourceUrl, normaliseSourceUrl } from "./url.js";

const key = (raw: string) => {
  const result = normaliseSourceUrl(raw);
  if (!result.ok) throw new Error(`expected ok for ${raw}`);
  return result.value;
};

describe("normaliseSourceUrl", () => {
  it("lowercases the host and drops www, scheme and trailing slash", () => {
    expect(key("https://WWW.Example.com/feed/")).toBe("example.com/feed");
  });

  it("treats http and https as the same source", () => {
    expect(key("http://example.com/feed")).toBe(key("https://example.com/feed"));
  });

  it("drops the fragment and tracking parameters but keeps real ones", () => {
    expect(key("https://example.com/feed?utm_source=tg&id=7&fbclid=z#top")).toBe(
      "example.com/feed?id=7",
    );
  });

  it("sorts query parameters so order does not create duplicates", () => {
    expect(key("https://example.com/x?b=2&a=1")).toBe(key("https://example.com/x?a=1&b=2"));
  });

  it("keeps a non-default port", () => {
    expect(key("https://example.com:8443/feed")).toBe("example.com:8443/feed");
  });

  it("accepts a bare host and assumes https", () => {
    expect(key("example.com/feed")).toBe("example.com/feed");
  });

  it("is case-sensitive in the path — many feeds are", () => {
    expect(key("https://example.com/Feed")).toBe("example.com/Feed");
  });

  it("rejects blanks, non-http schemes and hostless input", () => {
    expect(normaliseSourceUrl("  ")).toEqual({ ok: false, error: "invalid-url" });
    expect(normaliseSourceUrl("javascript:alert(1)")).toEqual({ ok: false, error: "invalid-url" });
    expect(normaliseSourceUrl("ftp://example.com/x")).toEqual({ ok: false, error: "invalid-url" });
    expect(normaliseSourceUrl("localhost")).toEqual({ ok: false, error: "invalid-url" });
  });
});

describe("canonicalSourceUrl", () => {
  it("returns an absolute url without a fragment", () => {
    expect(canonicalSourceUrl("example.com/feed#top")).toEqual({
      ok: true,
      value: "https://example.com/feed",
    });
  });

  it("rejects what normalisation rejects", () => {
    expect(canonicalSourceUrl("javascript:alert(1)")).toEqual({ ok: false, error: "invalid-url" });
  });
});
