import { clearApiKey, generatorCredentials, patchSettings, saveApiKey } from "@pna/app";
import type { Settings } from "@pna/core";
import { maskSecret } from "@pna/storage";
import { drawnIcon, iconCss, routeHref } from "@pna/ui";
import { css, html } from "lit";
import { ConnectedElement } from "../context.js";
import { goBack, navigate } from "../router.js";
import "@pna/ui";

/** Settings, plus the one thing the app cannot work without: the API key. */
export class PnaSettingsScreen extends ConnectedElement {
  static override properties = {
    _mask: { state: true },
    _server: { state: true },
  };

  private declare _mask: string;
  /** What the server can generate with: "" when there is no account to ask. */
  private declare _server: string;

  constructor() {
    super();
    this._mask = "не задан";
    this._server = "";
  }

  static override styles = [iconCss, css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

    .account {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: var(--pna-tap);
      margin-bottom: var(--pna-gap-lg);
      padding: 8px 2px;
      border: none;
      border-bottom: 1px solid var(--pna-line);
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }

    .account:focus-visible {
      outline: 2px solid var(--pna-text);
      outline-offset: 2px;
    }

    .account .icon {
      color: var(--pna-text-dim);
    }

    .note {
      margin-top: var(--pna-gap-lg);
      font-size: 0.85rem;
      color: var(--pna-text-dim);
    }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    void this.refreshMask();
  }

  private async refreshMask(): Promise<void> {
    this._mask = maskSecret(await this.ctx.deps.secrets.get());
    await this.refreshServer();
  }

  /**
   * Whether the server holds a key of its own.
   *
   * This is what decides where generation happens: with a key on the server the
   * work survives the app being closed, without one it can only run here.
   */
  private async refreshServer(): Promise<void> {
    const credentials = await generatorCredentials(this.ctx);
    if (!credentials.ok) {
      this._server = "";
      return;
    }
    if (!credentials.value) {
      this._server = "";
      return;
    }
    this._server = credentials.value.ownKey
      ? "Ключ есть и на сервере: генерация идёт, даже если закрыть приложение."
      : credentials.value.configured
        ? "Сервер генерирует своим ключом."
        : "На сервере ключа нет — сохраните ключ ещё раз, иначе генерация идёт только здесь.";
  }

  override render() {
    const settings = this.ctx.store.getState().settings;
    const usingMock = this._mask === "не задан";

    return html`
      <pna-app-bar heading="Настройки" canGoBack @go-back=${() => goBack()}></pna-app-bar>

      <main>
        <button class="account" @click=${() => navigate(routeHref({ name: "account" }))}>
          <span>Аккаунт и синхронизация</span>
          ${drawnIcon("next")}
        </button>

        <pna-settings-view
          .settings=${settings}
          .apiKeyMask=${this._mask}
          .providerId=${settings.providerId}
          ?keyMissing=${usingMock}
          .keyNote=${usingMock ? "" : this._server}
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
          Темы, дайджесты и лекции хранятся на устройстве и в вашем аккаунте; наружу уходят
          только запросы к модели.
        </p>
      </main>
    `;
  }
}

customElements.define("pna-settings-screen", PnaSettingsScreen);
