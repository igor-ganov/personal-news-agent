import { addTopic, type AppError } from "@pna/app";
import { buildTree, type TopicId } from "@pna/core";
import { routeHref, type TopicFormValue } from "@pna/ui";
import { css, html } from "lit";
import { ConnectedElement } from "../context.js";
import { navigate } from "../router.js";
import { NO_SETUP, setupAsker, type SetupView } from "../setup-view.js";
import "@pna/ui";

/** The root screen: every topic the user follows, and the way to add one. */
export class PnaTopicsScreen extends ConnectedElement {
  static override properties = {
    _creating: { state: true },
    _parentId: { state: true },
    _error: { state: true },
    _setup: { state: true },
  };

  private declare _creating: boolean;
  private declare _parentId: TopicId | null;
  private declare _error: string;
  private declare _setup: SetupView;
  private readonly setupFor = setupAsker(this.ctx, (view) => {
    this._setup = view;
  });

  constructor() {
    super();
    this._creating = false;
    this._parentId = null;
    this._error = "";
    this._setup = NO_SETUP;
  }

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

    .intro {
      margin: 0 0 var(--pna-gap-lg);
      color: var(--pna-text-dim);
      font-size: 0.9rem;
    }
  `;

  private save(value: TopicFormValue): void {
    const result = addTopic(this.ctx, {
      parentId: this._parentId,
      title: value.title,
      brief: value.brief,
      level: value.level,
      excludes: value.excludes,
      focusAreas: value.focusAreas,
    });

    if (!result.ok) {
      this._error = (result.error as AppError).message;
      return;
    }
    this._error = "";
    this._creating = false;
    navigate(routeHref({ name: "topic", topicId: result.value.id, tab: "news" }));
  }

  private readonly toggleCreating = (): void => {
    this._creating = !this._creating;
    this._parentId = null;
    this.setupFor.reset();
  };

  override render() {
    const state = this.ctx.store.getState();
    const tree = buildTree(state.topics);

    return html`
      <pna-app-bar heading="Мои темы">
        ${this._creating
          ? html`<ui-button slot="actions" size="sm" variant="ghost" @click=${this.toggleCreating}
              >Закрыть</ui-button
            >`
          : html`<ui-pencil-button slot="actions" @click=${this.toggleCreating}>Новая</ui-pencil-button>`}
      </pna-app-bar>

      <main>
        ${this._creating
          ? html`<pna-topic-form
              .error=${this._error}
              .setup=${this._setup.setup}
              ?setupBusy=${this._setup.busy}
              .setupError=${this._setup.error}
              @setup-request=${(e: CustomEvent<string>) => void this.setupFor.ask({ kind: "topic", title: e.detail })}
              @topic-save=${(e: CustomEvent<TopicFormValue>) => this.save(e.detail)}
              @topic-cancel=${() => {
                this._creating = false;
              }}
            ></pna-topic-form>`
          : html`<div>
              <p class="intro">
                Тема — это то, за чем вы следите. Внутри у неё новости и программы обучения,
                а подтемы наследуют её фокус.
              </p>
              <pna-topic-tree
                .nodes=${tree}
                @topic-open=${(e: CustomEvent<TopicId>) =>
                  navigate(routeHref({ name: "topic", topicId: e.detail, tab: "news" }))}
                @topic-create=${() => {
                  this._creating = true;
                  this.setupFor.reset();
                }}
              ></pna-topic-tree>
            </div>`}
      </main>
    `;
  }
}

customElements.define("pna-topics-screen", PnaTopicsScreen);
