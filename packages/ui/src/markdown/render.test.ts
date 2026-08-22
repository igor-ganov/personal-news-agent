import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render.js";

describe("renderMarkdown — safety", () => {
  it("escapes html in the source", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("escapes html inside code blocks too", () => {
    expect(renderMarkdown("```\n<b>x</b>\n```")).toBe("<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>");
  });

  it("refuses a javascript: link, leaving the markup as inert text", () => {
    const html = renderMarkdown("[тык](javascript:alert(1))");
    expect(html).not.toContain("<a ");
    expect(html).toContain("тык");
  });

  it("refuses a relative link", () => {
    expect(renderMarkdown("[a](/local)")).not.toContain("<a ");
  });

  it("opens external links safely", () => {
    expect(renderMarkdown("[док](https://example.com/a)")).toBe(
      '<p><a href="https://example.com/a" target="_blank" rel="noreferrer noopener">док</a></p>',
    );
  });
});

describe("renderMarkdown — blocks", () => {
  it("renders headings at the right level", () => {
    expect(renderMarkdown("# Раз\n\n### Три")).toBe("<h1>Раз</h1><h3>Три</h3>");
  });

  it("renders a fenced code block with its language", () => {
    expect(renderMarkdown("```python\nx = 1\n```")).toBe(
      '<pre><code class="language-python">x = 1</code></pre>',
    );
  });

  it("closes an unterminated code fence at the end of input", () => {
    expect(renderMarkdown("```\nx = 1")).toBe("<pre><code>x = 1</code></pre>");
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdown("- раз\n- два")).toBe("<ul><li>раз</li><li>два</li></ul>");
    expect(renderMarkdown("1. раз\n2. два")).toBe("<ol><li>раз</li><li>два</li></ol>");
  });

  it("renders a blockquote and a horizontal rule", () => {
    expect(renderMarkdown("> цитата")).toBe("<blockquote>цитата</blockquote>");
    expect(renderMarkdown("---")).toBe("<hr>");
  });

  it("keeps line breaks inside a paragraph", () => {
    expect(renderMarkdown("строка\nещё")).toBe("<p>строка<br>ещё</p>");
  });

  it("separates paragraphs on a blank line", () => {
    expect(renderMarkdown("раз\n\nдва")).toBe("<p>раз</p><p>два</p>");
  });

  it("returns nothing for empty input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("\n\n  \n")).toBe("");
  });
});

describe("renderMarkdown — inline", () => {
  it("renders bold, italic and code", () => {
    expect(renderMarkdown("**жирный** и *курсив* и `код`")).toBe(
      "<p><strong>жирный</strong> и <em>курсив</em> и <code>код</code></p>",
    );
  });

  it("does not treat a bare number as a code-span placeholder", () => {
    expect(renderMarkdown("в 2026 году вышло `vllm` 0.9")).toBe(
      "<p>в 2026 году вышло <code>vllm</code> 0.9</p>",
    );
  });

  it("leaves markup inside code spans alone", () => {
    expect(renderMarkdown("`**не жирный**`")).toBe("<p><code>**не жирный**</code></p>");
  });

  it("formats inline markup inside list items and headings", () => {
    expect(renderMarkdown("- **раз**")).toBe("<ul><li><strong>раз</strong></li></ul>");
    expect(renderMarkdown("## `код` в заголовке")).toBe("<h2><code>код</code> в заголовке</h2>");
  });
});

describe("renderMarkdown — a realistic lecture", () => {
  it("renders a mixed document", () => {
    const html = renderMarkdown(
      [
        "# Квантизация",
        "",
        "Что теряется при переходе к **4 битам**:",
        "",
        "- точность на длинном контексте",
        "- предсказуемость latency",
        "",
        "```bash",
        "llama-quantize model.gguf q4_k_m",
        "```",
        "",
        "> Подробнее — [в документации](https://example.com/docs).",
      ].join("\n"),
    );

    expect(html).toContain("<h1>Квантизация</h1>");
    expect(html).toContain("<strong>4 битам</strong>");
    expect(html).toContain("<ul><li>точность");
    expect(html).toContain('<code class="language-bash">llama-quantize');
    expect(html).toContain('<a href="https://example.com/docs"');
  });
});
