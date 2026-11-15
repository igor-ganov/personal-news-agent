import { css } from "lit";

/**
 * Design tokens, declared once on `:root` by the host page and consumed by every
 * component through `var(--pna-*)`. Components never hard-code a colour, so the
 * theme switches with the system without a single conditional in a component.
 */
export const tokensCss = `
:root {
  color-scheme: light dark;

  /* Ink on paper: a warm sheet, graphite text, pencil-grey rules. */
  --pna-bg: #f6f4ef;
  /* Panels are the same sheet: pencil lines, not grey fills, separate them. */
  --pna-surface: #f6f4ef;
  --pna-surface-2: #ece8de;
  --pna-border: #c9c4b8;
  --pna-line: #bdb8ae;
  --pna-text: #22211f;
  --pna-text-dim: #6b6862;
  --pna-accent: #22211f;
  --pna-accent-text: #f6f4ef;
  --pna-danger: #a8322a;
  --pna-ok: #2f6b3a;
  --pna-warn: #8a6200;

  --pna-radius: 4px;
  --pna-radius-sm: 3px;
  --pna-gap: 12px;
  --pna-gap-sm: 8px;
  --pna-gap-lg: 20px;

  --pna-font: "Literata Variable", Georgia, "Times New Roman", serif;
  --pna-hand: "Caveat", "Segoe Print", cursive;
  --pna-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

  --pna-tap: 44px;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* A night notebook: blue-black paper, chalk-white ink, a yellow gel pen. */
    --pna-bg: #1a2029;
    --pna-surface: #1a2029;
    --pna-surface-2: #242b36;
    --pna-border: #3d4654;
    --pna-line: rgba(241, 238, 230, 0.22);
    --pna-text: #ece8df;
    --pna-text-dim: #98a0ab;
    --pna-accent: #f3c76e;
    --pna-accent-text: #1a2029;
    --pna-danger: #ef7b6c;
    --pna-ok: #7cc49a;
    --pna-warn: #e0b45a;
  }
}

/* Inherited into every shadow root: native sliders and checkboxes take the ink. */
html {
  accent-color: var(--pna-text);
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--pna-bg);
  color: var(--pna-text);
  font-family: var(--pna-font);
  font-size: 16px;
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  overscroll-behavior-y: none;
}

body {
  padding-bottom: env(safe-area-inset-bottom);
}
`;

/** Base rules shared by every component's shadow root. */
export const baseCss = css`
  :host {
    box-sizing: border-box;
    font-family: var(--pna-font);
    color: var(--pna-text);
  }

  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }

  .dim {
    color: var(--pna-text-dim);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--pna-gap-sm);
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--pna-gap-sm);
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .small {
    font-size: 0.85rem;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
