import { clearApiKey, patchSettings, saveApiKey } from "@pna/app";
import type { Settings } from "@pna/core";
import { maskSecret } from "@pna/storage";
import { css, html } from "lit";
import { ConnectedElement } from "../context.js";
import { goBack } from "../router.js";
import "@pna/ui";

/** Settings, plus the one thing the app cannot work without: the API key. */
export class PnaSettingsScreen extends ConnectedElement {
  static override properties = {
    _mask: { state: true },
  };

  private declare _mask: string;

  constructor() {
    super();
    this._mask = "не задан";
  }

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

    .note {
      margin-top: var(--pna-gap-lg);
      font-size: 0.85rem;
      color: var(--pna-text-dim);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.refreshMask();
  }

  private async refreshMask(): Promise<void> {
    this._mask = maskSecret(await this.ctx.deps.secrets.get());
  }

  override render() {
    const settings = this.ctx.store.getState().settings;
    const usingMock = this._mask === "не задан";

    return html`
      <pna-app-bar heading="Настройки" canGoBack @go-back=${() => goBack()}></pna-app-bar>

      <main>
        ${usingMock
          ? html`<ui-notice
              tone="info"
              message="Ключ не задан — приложение работает на офлайн-заглушке: экраны и переходы живые, но материалы демонстрационные."
            ></ui-notice>`
          : null}

        <pna-settings-view
          .settings=${settings}
          .apiKeyMask=${this._mask}
          .providerId=${settings.providerId}
          @settings-change=${(e: CustomEvent<Partial<Settings>>) =>
            patchSettings(this.ctx, e.detail)}
          @api-key-save=${async (e: CustomEvent<string>) => {
            await saveApiKey(this.ctx, e.detail);
            await this.refreshMask();
          }}
          @api-key-clear=${async () => {
            await clearApiKey(this.ctx);
            await this.refreshMask();
          }}
        ></pna-settings-view>

        <p class="note">
          Все данные — темы, дайджесты, лекции и результаты тестов — хранятся на устройстве.
          Наружу уходят только запросы к выбранной модели.
        </p>
      </main>
    `;
  }
}

customElements.define("pna-settings-screen", PnaSettingsScreen);
