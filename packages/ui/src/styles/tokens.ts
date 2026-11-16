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
    /* The same sheet at night: warm graphite paper, the same ink turned pale. */
    --pna-bg: #1c1a17;
    --pna-surface: #1c1a17;
    --pna-surface-2: #26231f;
    --pna-border: #4a453d;
    --pna-line: rgba(236, 230, 218, 0.2);
    --pna-text: #ece6da;
    --pna-text-dim: #a59d90;
    --pna-accent: #ece6da;
    --pna-accent-text: #1c1a17;
    --pna-danger: #ef8a7a;
    --pna-ok: #8fc49c;
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

  /* A section label: a quiet heading in the book face, never spaced capitals. */
  .label {
    margin: 0 0 var(--pna-gap-sm);
    font-size: 0.95rem;
    font-style: italic;
    font-weight: 600;
    color: var(--pna-text-dim);
  }

  /* A slider is a pencil line with a round handle big enough for a thumb. */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    height: var(--pna-tap);
    margin: 0;
    background: transparent;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    height: 2px;
    border-radius: 1px;
    background: var(--pna-text-dim);
  }

  input[type="range"]::-moz-range-track {
    height: 2px;
    background: var(--pna-text-dim);
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 28px;
    height: 28px;
    margin-top: -13px;
    border: 2px solid var(--pna-text);
    border-radius: 50%;
    background: var(--pna-bg);
  }

  input[type="range"]::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border: 2px solid var(--pna-text);
    border-radius: 50%;
    background: var(--pna-bg);
  }

  input[type="range"]:focus-visible {
    outline: 2px solid var(--pna-text);
    outline-offset: 2px;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
