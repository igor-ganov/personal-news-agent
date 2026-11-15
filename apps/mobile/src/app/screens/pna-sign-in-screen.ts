import type { LaunchOutcome } from "@pna/app";
import { authError, type AuthError } from "@pna/auth";
import type { Result } from "@pna/core";
import { css, html, LitElement } from "lit";
import { appContext } from "../context.js";
import "@pna/ui";

type Phase = "asking" | "idle";

/**
 * What the app opens with when nobody is signed in: the passkey prompt.
 *
 * It asks on its own the moment it appears. The buttons exist only for when
 * the prompt was dismissed or failed — one to ask again, one to start a new
 * account, one to reach a key on another phone.
 */
export class PnaSignInScreen extends LitElement {
  static override properties = {
    _phase: { state: true },
    _error: { state: true },
  };

  private declare _phase: Phase;
  private declare _error: string;
  private readonly ctx = appContext();

  constructor() {
    super();
    this._phase = "asking";
    this._error = "";
  }

  static override styles = css`
    :host {
      display: grid;
      min-height: 100vh;
      place-items: center;
      padding: var(--pna-gap);
      box-sizing: border-box;
    }

    main {
      display: grid;
      gap: var(--pna-gap);
      width: min(100%, 24rem);
      text-align: center;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
    }

    p {
      margin: 0;
      color: var(--pna-text-dim);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.attempt(() => this.service.enter());
  }

  private get service() {
    const service = this.ctx.deps.account;
    if (!service) throw new Error("Sign-in screen shown in a build without an account server");
    return service;
  }

  private async attempt(action: () => Promise<Result<LaunchOutcome, AuthError>>): Promise<void> {
    this._phase = "asking";
    this._error = "";
    const outcome = await action().catch(
      (error: unknown): Result<LaunchOutcome, AuthError> => ({
        ok: false,
        error: authError("network", String(error)),
      }),
    );
    this._phase = "idle";
    if (!outcome.ok) {
      this._error = outcome.error.message;
      return;
    }
    if (outcome.value.kind === "signed-in")
      this.dispatchEvent(new CustomEvent("signed-in", { bubbles: true, composed: true }));
  }

  override render() {
    const asking = this._phase === "asking";
    return html`
      <main>
        <h1>Skill Grower</h1>
        <p role="status">${asking ? "Подтвердите вход ключом доступа…" : "Вход по ключу доступа"}</p>
        ${this._error ? html`<ui-notice tone="error" .message=${this._error}></ui-notice>` : null}
        <ui-button ?disabled=${asking} @click=${() => void this.attempt(() => this.service.enter())}
          >Войти по ключу</ui-button
        >
        <ui-button
          variant="secondary"
          ?disabled=${asking}
          @click=${() => void this.attempt(() => this.service.enterAsNew())}
          >Новый аккаунт</ui-button
        >
        <ui-button
          variant="ghost"
          ?disabled=${asking}
          @click=${() => void this.attempt(() => this.service.enterFromAnotherDevice())}
          >Ключ с другого устройства</ui-button
        >
      </main>
    `;
  }
}

customElements.define("pna-sign-in-screen", PnaSignInScreen);
