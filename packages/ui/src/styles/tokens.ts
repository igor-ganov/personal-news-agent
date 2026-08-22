import { css } from "lit";

/**
 * Design tokens, declared once on `:root` by the host page and consumed by every
 * component through `var(--pna-*)`. Components never hard-code a colour, so the
 * theme switches with the system without a single conditional in a component.
 */
export const tokensCss = `
:root {
  color-scheme: light dark;

  --pna-bg: #ffffff;
  --pna-surface: #f6f7f9;
  --pna-surface-2: #eceef2;
  --pna-border: #dcdfe5;
  --pna-text: #14161a;
  --pna-text-dim: #5b6270;
  --pna-accent: #2f6df6;
  --pna-accent-text: #ffffff;
  --pna-danger: #c8392b;
  --pna-ok: #1f7a4d;
  --pna-warn: #9a6a00;

  --pna-radius: 12px;
  --pna-radius-sm: 8px;
  --pna-gap: 12px;
  --pna-gap-sm: 8px;
  --pna-gap-lg: 20px;

  --pna-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --pna-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

  --pna-tap: 44px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --pna-bg: #101215;
    --pna-surface: #181b20;
    --pna-surface-2: #21252c;
    --pna-border: #2c313a;
    --pna-text: #e8eaee;
    --pna-text-dim: #98a0ae;
    --pna-accent: #5b8cff;
    --pna-accent-text: #0b0d10;
    --pna-danger: #ef6b5c;
    --pna-ok: #4fbf8b;
    --pna-warn: #d9a441;
  }
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
