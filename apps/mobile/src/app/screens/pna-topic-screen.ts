import {
  addSourceByHand,
  addTopic,
  changeSourceStatus,
  commitProgram,
  deleteTopic,
  digestTaskKey,
  dismissJob,
  failTask,
  draftProgram,
  editTopic,
  ensureSourcesFresh,
  forgetSource,
  generateDigest,
  heldPlan,
  programTaskKey,
  refreshTopicSources,
  sourceTaskKey,
} from "@pna/app";
import {
  ancestorsOf,
  applyPlanEdit,
  capacityReport,
  childrenOf,
  draftLessonMinutes,
  topicOverview,
  type DigestPeriod,
  type PlanEdit,
  type ProgramDraft,
  type ProgramId,
  type Schedule,
  type SourceId,
  type TopicId,
  type UserSourceDraft,
} from "@pna/core";
import { routeHref, type ProgramRequest, type SourceStatusChange, type TopicFormValue, type TopicTab } from "@pna/ui";
import { css, html, type TemplateResult } from "lit";
import { ConnectedElement } from "../context.js";
import { navigate } from "../router.js";
import "@pna/ui";

const TABS = [
  { id: "news", label: "Новости" },
  { id: "skills", label: "Скилы" },
  { id: "sources", label: "Источники" },
  { id: "about", label: "О теме" },
];

type SkillsMode = "list" | "wizard";

/**
 * A topic: its digests, its programs, its sources and its own settings.
 *
 * A plan being drafted is not screen state: the generation runs on the server
 * and can finish while this app is closed, so the plan waits under its task key
 * and the screen renders whatever is there — after a restart, or on a device
 * that never asked for it.
 */
export class PnaTopicScreen extends ConnectedElement {
  static override properties = {
    topicId: { type: String },
    tab: { type: String },
    _mode: { state: true },
    _edited: { state: true },
    _planError: { state: true },
    _editing: { state: true },
    _formError: { state: true },
  };

  declare topicId: TopicId;
  declare tab: TopicTab;
  private declare _mode: SkillsMode;
  /** The user's edits to the plan that came back, before they commit it. */
  private declare _edited: ProgramDraft | null;
  private declare _planError: string;
  private declare _editing: boolean;
  private declare _formError: string;
  private refreshed = new Set<string>();

  constructor() {
    super();
    this.tab = "news";
    this._mode = "list";
    this._edited = null;
    this._planError = "";
    this._editing = false;
    this._formError = "";
  }

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

    .section {
      margin-bottom: var(--pna-gap-lg);
    }

    h3 {
      margin: 0 0 var(--pna-gap-sm);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--pna-text-dim);
    }

    .subtopic {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--pna-gap-sm);
      min-height: var(--pna-tap);
      padding: var(--pna-gap-sm);
      margin-bottom: 6px;
      border: 1px solid var(--pna-border);
      border-radius: var(--pna-radius-sm);
      background: var(--pna-surface);
      color: inherit;
      font: inherit;
      width: 100%;
      text-align: left;
      cursor: pointer;
    }

    .danger {
      margin-top: var(--pna-gap-lg);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.autoRefreshSources();
  }

  override updated(): void {
    this.autoRefreshSources();
  }

  /** Runs discovery once per topic per session, and only if the list is stale. */
  private autoRefreshSources(): void {
    if (!this.topicId || this.refreshed.has(this.topicId)) return;
    this.refreshed.add(this.topicId);
    void ensureSourcesFresh(this.ctx, this.topicId);
  }

  private goTab(tab: string): void {
    navigate(routeHref({ name: "topic", topicId: this.topicId, tab: tab as TopicTab }));
  }

  /* ------------------------------------------------------------- skills -- */

  private requestPlan(request: ProgramRequest): void {
    this._planError = "";
    this._edited = null;
    void draftProgram(this.ctx, {
      topicId: this.topicId,
      intent: request.intent,
      schedule: request.schedule,
      basedOn: request.basedOn,
      continuation: request.continuation,
    });
  }

  /** The plan waiting for this topic, if one has finished generating. */
  private plan(): { draft: ProgramDraft; schedule: Schedule; request: ProgramRequest } | null {
    const held = heldPlan(this.ctx.deps.tasks.get(programTaskKey(this.topicId)));
    if (!held) return null;
    return {
      draft: this._edited ?? held.draft,
      schedule: held.request.schedule,
      request: {
        intent: held.request.intent,
        schedule: held.request.schedule,
        basedOn: held.request.basedOn,
        continuation: held.request.continuation,
      },
    };
  }

  private applyEdit(edit: PlanEdit): void {
    const plan = this.plan();
    if (!plan) return;

    const next = applyPlanEdit(plan.draft, edit);
    if (!next.ok) {
      this._planError = next.error;
      return;
    }
    this._planError = "";
    this._edited = next.value;
  }

  private discardPlan(): void {
    this._edited = null;
    this._planError = "";
    this._mode = "list";
    void dismissJob(this.ctx, programTaskKey(this.topicId));
  }

  private commit(): void {
    const plan = this.plan();
    if (!plan) return;

    const result = commitProgram(this.ctx, {
      topicId: this.topicId,
      draft: plan.draft,
      schedule: plan.schedule,
      basedOn: plan.request.basedOn,
      continuation: plan.request.continuation,
    });
    if (!result.ok) {
      this._planError = result.error.message;
      return;
    }

    this.discardPlan();
    navigate(routeHref({ name: "program", programId: result.value.id }));
  }

  private renderSkills(): TemplateResult {
    const state = this.ctx.store.getState();
    const overview = topicOverview(state, this.topicId);
    const key = programTaskKey(this.topicId);
    const plan = this.plan();

    // A plan that finished generating wins over whatever the screen was doing:
    // it may have arrived while the app was closed, or from another device.
    if (plan) {
      return html`<pna-plan-editor
        .draft=${plan.draft}
        .capacity=${capacityReport(plan.schedule.intensity, draftLessonMinutes(plan.draft))}
        .error=${this._planError}
        @plan-edit=${(e: CustomEvent<PlanEdit>) => this.applyEdit(e.detail)}
        @plan-commit=${() => this.commit()}
        @plan-discard=${() => this.discardPlan()}
      ></pna-plan-editor>`;
    }

    if (this._mode === "wizard") {
      return html`<pna-program-wizard
        .availableBases=${(overview?.programs ?? []).map((p) => p.program)}
        .startDay=${this.ctx.deps.clock.now().slice(0, 10)}
        ?busy=${this.isBusy(key)}
        .error=${this.taskError(key)}
        @program-request=${(e: CustomEvent<ProgramRequest>) => this.requestPlan(e.detail)}
      ></pna-program-wizard>`;
    }

    return html`<pna-program-list
      .programs=${overview?.programs ?? []}
      @program-open=${(e: CustomEvent<ProgramId>) =>
        navigate(routeHref({ name: "program", programId: e.detail }))}
      @program-new=${() => {
        this._mode = "wizard";
        void dismissJob(this.ctx, key);
      }}
    ></pna-program-list>`;
  }

  /* --------------------------------------------------------------- about -- */

  private renderAbout(): TemplateResult {
    const state = this.ctx.store.getState();
    const topic = state.topics[this.topicId];
    if (!topic) return html`<ui-notice tone="error" message="Тема не найдена"></ui-notice>`;
    const children = childrenOf(state.topics, this.topicId);

    return html`<div>
      ${this._editing
        ? html`<pna-topic-form
            .topic=${topic}
            .error=${this._formError}
            @topic-save=${(e: CustomEvent<TopicFormValue>) => {
              const result = editTopic(this.ctx, this.topicId, {
                title: e.detail.title,
                brief: e.detail.brief,
                level: e.detail.level,
                excludes: e.detail.excludes,
              });
              if (!result.ok) {
                this._formError = result.error.message;
                return;
              }
              this._formError = "";
              this._editing = false;
            }}
            @topic-cancel=${() => {
              this._editing = false;
            }}
          ></pna-topic-form>`
        : html`<div class="section">
            <h3>Что интересно</h3>
            <p>${topic.brief || "Описание не заполнено"}</p>
            <ui-button size="sm" @click=${() => {
              this._editing = true;
            }}
              >Редактировать тему</ui-button
            >
          </div>`}

      <div class="section">
        <h3>Подтемы</h3>
        ${children.map(
          (child) => html`
            <button
              class="subtopic"
              @click=${() => navigate(routeHref({ name: "topic", topicId: child.id, tab: "news" }))}
            >
              <span>${child.title}</span>
              <span class="dim">›</span>
            </button>
          `,
        )}
        <ui-button
          size="sm"
          @click=${() => {
            const result = addTopic(this.ctx, { parentId: this.topicId, title: "Новая подтема" });
            if (result.ok)
              navigate(routeHref({ name: "topic", topicId: result.value.id, tab: "about" }));
          }}
          >Добавить подтему</ui-button
        >
      </div>

      <div class="danger">
        <ui-button
          variant="danger"
          @click=${() => {
            deleteTopic(this.ctx, this.topicId);
            navigate("#/");
          }}
          >Удалить тему со всем содержимым</ui-button
        >
      </div>
    </div>`;
  }

  /* -------------------------------------------------------------- render -- */

  private renderTab(): TemplateResult {
    const state = this.ctx.store.getState();
    const overview = topicOverview(state, this.topicId);
    if (!overview) return html`<ui-notice tone="error" message="Тема не найдена"></ui-notice>`;

    switch (this.tab) {
      case "news": {
        const busy = (["day", "week", "month", "year"] as DigestPeriod[]).filter((period) =>
          this.isBusy(digestTaskKey(this.topicId, period)),
        );
        const errors = (["day", "week", "month", "year"] as DigestPeriod[])
          .map((period) => this.taskError(digestTaskKey(this.topicId, period)))
          .filter((message) => message.length > 0);

        return html`<pna-digest-panel
          .digests=${overview.digests}
          .busyPeriods=${busy}
          .error=${errors[0] ?? ""}
          @digest-request=${(e: CustomEvent<DigestPeriod>) =>
            void generateDigest(this.ctx, { topicId: this.topicId, period: e.detail })}
        ></pna-digest-panel>`;
      }

      case "sources": {
        const key = sourceTaskKey(this.topicId);
        return html`<pna-source-list
          .sources=${overview.sources}
          ?busy=${this.isBusy(key)}
          .error=${this.taskError(key)}
          @source-refresh=${() =>
            void refreshTopicSources(this.ctx, this.topicId, { force: true })}
          @source-add=${(e: CustomEvent<UserSourceDraft>) => {
            const result = addSourceByHand(this.ctx, this.topicId, e.detail);
            if (!result.ok) this.reportSourceError(key, result.error.message);
          }}
          @source-status=${(e: CustomEvent<SourceStatusChange>) =>
            changeSourceStatus(this.ctx, e.detail.id, e.detail.status)}
          @source-forget=${(e: CustomEvent<SourceId>) => forgetSource(this.ctx, e.detail)}
        ></pna-source-list>`;
      }

      case "skills":
        return this.renderSkills();

      case "about":
        return this.renderAbout();
    }
  }

  private reportSourceError(key: string, message: string): void {
    failTask(this.ctx.deps.tasks, key, message);
  }

  override render() {
    const state = this.ctx.store.getState();
    const topic = state.topics[this.topicId];

    return html`
      <pna-app-bar
        heading=${topic?.title ?? "Тема"}
        subtitle=${ancestorsOf(state.topics, this.topicId)
          .map((t) => t.title)
          .join(" / ")}
        canGoBack
      >
        <pna-tabs
          slot="tabs"
          .tabs=${TABS}
          .active=${this.tab}
          @tab-select=${(e: CustomEvent<string>) => this.goTab(e.detail)}
        ></pna-tabs>
      </pna-app-bar>

      <main>${this.renderTab()}</main>
    `;
  }
}

customElements.define("pna-topic-screen", PnaTopicScreen);
