import type { Digest } from "@pna/core";
import { css, html, LitElement } from "lit";
import { formatDate, formatWindow, PERIOD_LABEL } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-chip.js";

/** One digest: the summary, then its sections. */
export class PnaDigestView extends LitElement {
  static override properties = {
    digest: { type: Object },
  };

  declare digest: Digest;

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      h3 {
        margin: 0 0 4px;
        font-size: 1.05rem;
        line-height: 1.35;
      }

      .meta {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: var(--pna-gap-sm);
      }

      .summary {
        margin: 0 0 var(--pna-gap);
      }

      h4 {
        margin: var(--pna-gap-lg) 0 var(--pna-gap-sm);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--pna-text-dim);
      }

      article {
        padding: var(--pna-gap-sm) 0;
        border-top: 1px solid var(--pna-border);
      }

      .item-title {
        font-weight: 500;
      }

      a.item-title {
        color: var(--pna-text);
        text-decoration: none;
      }

      .source {
        font-size: 0.78rem;
        color: var(--pna-text-dim);
      }

      .item-summary {
        margin: 4px 0;
      }

      .relevance {
        margin: 4px 0 0;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
        border-left: 2px solid var(--pna-accent);
        padding-left: 8px;
      }
    `,
  ];

  override render() {
    const digest = this.digest;
    if (!digest) return null;

    return html`
      <div class="digest">
        <h3>${digest.headline}</h3>
        <div class="meta">
          <ui-chip tone="accent">${PERIOD_LABEL[digest.period]}</ui-chip>
          <ui-chip>${formatWindow(digest.window.from, digest.window.to)}</ui-chip>
          <ui-chip>собрано ${formatDate(digest.generatedAt)}</ui-chip>
        </div>
        <p class="summary">${digest.summary}</p>

        ${digest.sections.map(
          (section) => html`<section>
            <h4>${section.title}</h4>
            ${section.items.map(
              (item) => html`
                <article>
                  ${item.url
                    ? html`<a
                        class="item-title"
                        href=${item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        >${item.title}</a
                      >`
                    : html`<span class="item-title">${item.title}</span>`}
                  <div class="source">
                    ${item.sourceTitle}${item.publishedAt ? ` · ${formatDate(item.publishedAt)}` : ""}
                  </div>
                  <p class="item-summary">${item.summary}</p>
                  ${item.relevance ? html`<p class="relevance">${item.relevance}</p>` : null}
                </article>
              `,
            )}
          </section>`,
        )}
      </div>
    `;
  }
}

customElements.define("pna-digest-view", PnaDigestView);

declare global {
  interface HTMLElementTagNameMap {
    "pna-digest-view": PnaDigestView;
  }
}
