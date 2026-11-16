import { css, html, LitElement, type TemplateResult } from "lit";
import type { Route } from "@pna/ui";
import { currentRoute, goBack, onRouteChange } from "../router.js";
import "./pna-account-screen.js";
import "./pna-lesson-screen.js";
import "./pna-program-screen.js";
import "./pna-settings-screen.js";
import "./pna-topic-screen.js";
import "./pna-topics-screen.js";
import "@pna/ui";

/**
 * The shell: turns the current route into a screen, and says what the app as a
 * whole is doing — a load in progress, or a failure that is not one screen's.
 */
export class PnaApp extends LitElement {
  static override properties = {
    warning: { type: String },
    status: { type: String },
    _route: { state: true },
  };

  declare warning: string;
  /** Work in progress that is not a fault, such as loading the account. */
  declare status: string;
  private declare _route: Route;
  private stopListening: (() => void) | null = null;

  constructor() {
    super();
    this.warning = "";
    this.status = "";
    this._route = currentRoute();
  }

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }

    .warning {
      padding: var(--pna-gap-sm) var(--pna-gap);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.stopListening = onRouteChange((route) => {
      this._route = route;
      globalThis.scrollTo?.({ top: 0 });
    });
  }

  override disconnectedCallback(): void {
    this.stopListening?.();
    this.stopListening = null;
    super.disconnectedCallback();
  }

  private renderScreen(): TemplateResult {
    switch (this._route.name) {
      case "topics":
        return html`<pna-topics-screen></pna-topics-screen>`;
      case "topic":
        return html`<pna-topic-screen
          .topicId=${this._route.topicId}
          .tab=${this._route.tab}
          @go-back=${() => goBack()}
        ></pna-topic-screen>`;
      case "program":
        return html`<pna-program-screen .programId=${this._route.programId}></pna-program-screen>`;
      case "lesson":
        return html`<pna-lesson-screen .lessonId=${this._route.lessonId}></pna-lesson-screen>`;
      case "settings":
        return html`<pna-settings-screen></pna-settings-screen>`;
      case "account":
        return html`<pna-account-screen></pna-account-screen>`;
    }
  }

  override render() {
    return html`
      <div class="app">
        ${this.warning
          ? html`<div class="warning">
              <ui-notice tone="error" .message=${this.warning}></ui-notice>
            </div>`
          : null}
        ${this.status
          ? html`<div class="warning">
              <ui-notice tone="info" .message=${this.status}></ui-notice>
            </div>`
          : null}
        ${this.renderScreen()}
      </div>
    `;
  }
}

customElements.define("pna-app", PnaApp);
