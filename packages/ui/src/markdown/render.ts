/**
 * A small Markdown renderer for lecture bodies.
 *
 * Written by hand rather than pulled in as a dependency: the app ships to a
 * phone and this covers everything the lecture format uses. Input is escaped
 * before any markup is produced, and link targets are restricted to http(s),
 * so model-written text cannot inject markup or a javascript: URL.
 */

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeHref = (raw: string): string | null => {
  const trimmed = raw.trim();
  return /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
};

/**
 * Placeholder marker for extracted code spans. A NUL character cannot appear in
 * already-escaped text, so a bare number in the prose is never mistaken for one.
 */
const MARK = String.fromCharCode(0);

/** Inline formatting. Runs on already-escaped text. */
export const renderInline = (escaped: string): string => {
  const codeSpans: string[] = [];
  const withPlaceholders = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `${MARK}${codeSpans.length - 1}${MARK}`;
  });

  const formatted = withPlaceholders
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, url: string) => {
      const href = safeHref(url);
      return href
        ? `<a href="${href}" target="_blank" rel="noreferrer noopener">${text}</a>`
        : match;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

  return formatted.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (_match, index: string) => codeSpans[Number(index)] ?? "");
};

type Block =
  | { kind: "code"; language: string; lines: string[] }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "rule" }
  | { kind: "paragraph"; lines: string[] };

const parseBlocks = (source: string): Block[] => {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = /^```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const language = fence[1] ?? "";
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1; // closing fence, or end of input
      blocks.push({ kind: "code", language, lines: body });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? "";
        const match = ordered
          ? /^\s*\d+[.)]\s+(.*)$/.exec(current)
          : /^\s*[-*+]\s+(.*)$/.exec(current);
        if (!match) break;
        items.push(match[1]!);
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", lines: body });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim().length === 0 ||
        /^```/.test(current) ||
        /^#{1,6}\s/.test(current) ||
        /^\s*[-*+]\s+/.test(current) ||
        /^\s*\d+[.)]\s+/.test(current) ||
        /^>\s?/.test(current)
      )
        break;
      paragraph.push(current);
      index += 1;
    }
    blocks.push({ kind: "paragraph", lines: paragraph });
  }

  return blocks;
};

const renderBlock = (block: Block): string => {
  switch (block.kind) {
    case "code": {
      const language = block.language ? ` class="language-${escapeHtml(block.language)}"` : "";
      return `<pre><code${language}>${escapeHtml(block.lines.join("\n"))}</code></pre>`;
    }
    case "heading":
      return `<h${block.level}>${renderInline(escapeHtml(block.text))}</h${block.level}>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map((item) => `<li>${renderInline(escapeHtml(item))}</li>`)
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "quote":
      return `<blockquote>${renderInline(escapeHtml(block.lines.join(" ")))}</blockquote>`;
    case "rule":
      return "<hr>";
    case "paragraph":
      return `<p>${renderInline(escapeHtml(block.lines.join("\n"))).replace(/\n/g, "<br>")}</p>`;
  }
};

export const renderMarkdown = (source: string): string =>
  parseBlocks(source).map(renderBlock).join("");
