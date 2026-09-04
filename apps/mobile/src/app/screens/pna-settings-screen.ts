import { clearApiKey, generatorCredentials, patchSettings, saveApiKey } from "@pna/app";
import type { Settings } from "@pna/core";
import { maskSecret } from "@pna/storage";
import { routeHref } from "@pna/ui";
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

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

    .account {
      margin-top: var(--pna-gap-lg);
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
      ? "Ключ передан на сервер — генерация идёт там и не прерывается, если закрыть приложение."
      : credentials.value.configured
        ? "Сервер генерирует своим ключом."
        : "На сервере ключа нет: сохраните ключ ещё раз, войдя в аккаунт, иначе генерация пойдёт только на этом устройстве.";
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

        ${this._server
          ? html`<ui-notice tone="info" message=${this._server}></ui-notice>`
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

        <section class="account">
          <ui-button @click=${() => navigate(routeHref({ name: "account" }))}
            >Аккаунт и синхронизация</ui-button
          >
        </section>

        <p class="note">
          Все данные — темы, дайджесты, лекции и результаты тестов — хранятся на устройстве.
          Наружу уходят только запросы к выбранной модели, а в аккаунт — то, что вы решите
          синхронизировать.
        </p>
      </main>
    `;
  }
}

customElements.define("pna-settings-screen", PnaSettingsScreen);
