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
  pendingRequest,
  programTaskKey,
  refreshTopicSources,
  sourceTaskKey,
  suggestIdeas,
  type TaskState,
} from "@pna/app";
import {
  ancestorsOf,
  applyPlanEdit,
  calendarDay,
  capacityReport,
  childrenOf,
  draftLessonMinutes,
  topicOverview,
  type DigestPeriod,
  type PlanEdit,
  type ProgramDraft,
  type ProgramId,
  type Schedule,
  type SetupKind,
  type ContinuationMode,
  type SourceId,
  type Suggestion,
  type SuggestionKind,
  type TopicId,
  type UserSourceDraft,
} from "@pna/core";
import {
  drawnIcon,
  iconCss,
  routeHref,
  type ProgramRequest,
  type ProgramTaskView,
  type SourceStatusChange,
  type TopicFormValue,
  type TopicTab,
} from "@pna/ui";
import { css, html, type TemplateResult } from "lit";
import { ConnectedElement } from "../context.js";
import { navigate } from "../router.js";
import { NO_SETUP, setupAsker, type SetupAsker, type SetupView } from "../setup-view.js";
import "@pna/ui";

const TABS = [
  { id: "news", label: "Новости" },
  { id: "skills", label: "Навыки" },
  { id: "sources", label: "Источники" },
  { id: "about", label: "О теме" },
];

type SkillsMode = "list" | "wizard";

const PERIODS: readonly DigestPeriod[] = ["day", "week", "month", "year"];

/** Ideas offered for one kind of card, as the screen holds them between taps. */
interface IdeasState {
  readonly ideas: readonly Suggestion[];
  readonly busy: boolean;
  readonly error: string;
}

const NO_IDEAS: IdeasState = { ideas: [], busy: false, error: "" };

const MAX_GOAL = 80;

const quoted = (titles: readonly string[]): string => titles.map((title) => `«${title}»`).join(", ");

/** What a plan being drafted is about: the programs it builds on, else its goal. */
const PLAN_LABEL: Readonly<Record<ContinuationMode, (bases: readonly string[], goal: string) => string>> = {
  fresh: (_bases, goal) => (goal ? `Составляю программу: «${goal}»` : "Составляю программу"),
  deepen: (bases) => `Углубляю ${quoted(bases)}`,
  extend: (bases) => `Продолжаю ${quoted(bases)}`,
  apply: (bases) => `Практика по ${quoted(bases)}`,
};

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
    _ideas: { state: true },
    _setup: { state: true },
    _addingSubtopic: { state: true },
    _mode: { state: true },
    _edited: { state: true },
    _planError: { state: true },
    _editing: { state: true },
    _formError: { state: true },
    _confirmingDelete: { state: true },
  };

  declare topicId: TopicId;
  declare tab: TopicTab;
  private declare _mode: SkillsMode;
  /** The user's edits to the plan that came back, before they commit it. */
  private declare _edited: ProgramDraft | null;
  private declare _planError: string;
  private declare _editing: boolean;
  private declare _formError: string;
  private declare _ideas: Readonly<Record<SuggestionKind, IdeasState>>;
  /** Settings proposed for the name typed on the open card: a subtopic, or a skill goal. */
  private declare _setup: Readonly<Record<SetupKind, SetupView>>;
  private declare _addingSubtopic: boolean;
  /** Deleting a topic takes everything under it, so it asks once more inline. */
  private declare _confirmingDelete: boolean;
  private readonly setupFor: Readonly<Record<SetupKind, SetupAsker>> = {
    topic: setupAsker(this.ctx, (view) => this.showSetup("topic", view)),
    skill: setupAsker(this.ctx, (view) => this.showSetup("skill", view)),
  };
  private refreshed = new Set<string>();

  constructor() {
    super();
    this.tab = "news";
    this._mode = "list";
    this._edited = null;
    this._planError = "";
    this._editing = false;
    this._formError = "";
    this._ideas = { subtopic: NO_IDEAS, skill: NO_IDEAS };
    this._setup = { topic: NO_SETUP, skill: NO_SETUP };
    this._addingSubtopic = false;
    this._confirmingDelete = false;
  }

  static override styles = [iconCss, css`
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
      font-size: 0.95rem;
      font-style: italic;
      font-weight: 600;
      color: var(--pna-text-dim);
    }

    .brief {
      margin: 0 0 var(--pna-gap-sm);
    }

    .subtopic {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--pna-gap-sm);
      min-height: var(--pna-tap);
      padding: 8px 2px;
      border: none;
      border-bottom: 1px solid var(--pna-line);
      background: none;
      color: inherit;
      font: inherit;
      width: 100%;
      text-align: left;
      cursor: pointer;
    }

    .subtopic .icon {
      color: var(--pna-text-dim);
    }

    .add {
      margin-top: var(--pna-gap-sm);
    }

    /* The way out sits last and small: nothing about it should invite a tap. */
    .danger {
      margin-top: calc(var(--pna-gap-lg) * 2);
      padding-top: var(--pna-gap);
      border-top: 1px solid var(--pna-line);
    }

    .danger p {
      margin: 0 0 var(--pna-gap-sm);
    }

    .danger .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--pna-gap-sm);
    }
  `];

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

  /* -------------------------------------------------------------- ideas -- */

  private setIdeas(kind: SuggestionKind, next: IdeasState): void {
    this._ideas = { ...this._ideas, [kind]: next };
  }

  /** Asks for the next ten ideas of a kind and appends them to the list. */
  private async moreIdeas(kind: SuggestionKind): Promise<void> {
    const shown = this._ideas[kind].ideas;
    this.setIdeas(kind, { ideas: shown, busy: true, error: "" });
    const result = await suggestIdeas(this.ctx, { kind, topicId: this.topicId, shown });
    this.setIdeas(
      kind,
      result.ok
        ? { ideas: result.value, busy: false, error: "" }
        : { ideas: shown, busy: false, error: result.error.message },
    );
  }

  private showSetup(kind: SetupKind, view: SetupView): void {
    this._setup = { ...this._setup, [kind]: view };
  }

  /** Opens the program wizard with nothing proposed yet. */
  private openWizard(): void {
    this.setupFor.skill.reset();
    this._mode = "wizard";
  }

  private goTab(tab: string): void {
    navigate(routeHref({ name: "topic", topicId: this.topicId, tab: tab as TopicTab }));
  }

  /* ------------------------------------------------------------- skills -- */

  private requestPlan(request: ProgramRequest): void {
    this._planError = "";
    this._edited = null;
    // Back to the list: the status card is what shows the plan being drafted,
    // and it is also what the screen opens on after a restart.
    this._mode = "list";
    void draftProgram(this.ctx, {
      topicId: this.topicId,
      intent: request.intent,
      schedule: request.schedule,
      basedOn: request.basedOn,
      continuation: request.continuation,
    });
  }

  /** What the topic's last plan request asked for, if the tracker still knows. */
  private lastRequest(): ProgramRequest | undefined {
    const meta = pendingRequest("program", this.ctx.deps.tasks.get(programTaskKey(this.topicId)));
    return meta
      ? {
          intent: meta.intent,
          schedule: meta.schedule,
          basedOn: meta.basedOn,
          continuation: meta.continuation,
        }
      : undefined;
  }

  /**
   * Asks again with the same request, starting today rather than on the day the
   * failed one was made for; without a request, the wizard opens to ask.
   */
  private retryPlan(): void {
    const request = this.lastRequest();
    if (!request) {
      this.openWizard();
      return;
    }
    const startDay = calendarDay(this.ctx.deps.clock.now().slice(0, 10));
    this.requestPlan({ ...request, schedule: { ...request.schedule, startDay } });
  }

  /** The status card of the plan being drafted, named after what it is about. */
  private programTask(key: string): ProgramTaskView {
    const state: TaskState = this.ctx.deps.tasks.get(key);
    if (state.status === "error") return { kind: "error", message: state.error ?? "Не получилось" };
    if (state.status !== "running") return { kind: "idle" };

    const meta = pendingRequest("program", state);
    const programs = this.ctx.store.getState().programs;
    const bases = (meta?.basedOn ?? []).flatMap((id) => programs[id]?.title ?? []);
    const goal = (meta?.intent ?? "").trim().slice(0, MAX_GOAL);
    const mode = bases.length > 0 ? (meta?.continuation ?? "fresh") : "fresh";
    return {
      kind: "running",
      since: state.since ?? "",
      label: PLAN_LABEL[mode](bases, goal),
      steps: this.taskSteps(key, "program"),
    };
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

    const task = this.programTask(key);

    // A plan being drafted is never hidden behind the wizard: one request at a
    // time, and its status card is the only place it shows.
    if (this._mode === "wizard" && task.kind !== "running") {
      return html`<pna-program-wizard
        .availableBases=${(overview?.programs ?? []).map((p) => p.program)}
        .startDay=${this.ctx.deps.clock.now().slice(0, 10)}
        .initial=${this.lastRequest()}
        .error=${this.taskError(key)}
        .ideas=${this._ideas.skill.ideas}
        ?ideasBusy=${this._ideas.skill.busy}
        .ideasError=${this._ideas.skill.error}
        @suggestions-more=${() => void this.moreIdeas("skill")}
        .setup=${this._setup.skill.setup}
        ?setupBusy=${this._setup.skill.busy}
        .setupError=${this._setup.skill.error}
        @setup-request=${(e: CustomEvent<string>) =>
          void this.setupFor.skill.ask({ kind: "skill", title: e.detail, topicId: this.topicId })}
        @program-request=${(e: CustomEvent<ProgramRequest>) => this.requestPlan(e.detail)}
      ></pna-program-wizard>`;
    }

    // The "new program" action only opens the wizard. It used to dismiss the job under
    // the key, which deleted a plan the server was still writing.
    return html`<pna-program-list
      .programs=${overview?.programs ?? []}
      .task=${task}
      @program-open=${(e: CustomEvent<ProgramId>) =>
        navigate(routeHref({ name: "program", programId: e.detail }))}
      @program-new=${() => this.openWizard()}
      @program-retry=${() => this.retryPlan()}
      @program-dismiss=${() => void dismissJob(this.ctx, key)}
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
            <p class="brief">${topic.brief || "Описание не заполнено"}</p>
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
              ${drawnIcon("next")}
            </button>
          `,
        )}
        ${this._addingSubtopic
          ? this.renderSubtopicForm(topic.title)
          : html`<ui-pencil-button
              class="add"
              @click=${() => {
                this._formError = "";
                this.setupFor.topic.reset();
                this._addingSubtopic = true;
              }}
              >Добавить подтему</ui-pencil-button
            >`}
      </div>

      <div class="danger">
        ${this._confirmingDelete
          ? html`<p>Удалить «${topic.title}» вместе с подтемами, новостями и программами?</p>
              <div class="row">
                <ui-button
                  variant="danger"
                  @click=${() => {
                    deleteTopic(this.ctx, this.topicId);
                    navigate("#/");
                  }}
                  >Да, удалить</ui-button
                >
                <ui-button
                  variant="ghost"
                  @click=${() => {
                    this._confirmingDelete = false;
                  }}
                  >Оставить</ui-button
                >
              </div>`
          : html`<ui-button
              variant="ghost"
              size="sm"
              @click=${() => {
                this._confirmingDelete = true;
              }}
              >Удалить тему со всем содержимым</ui-button
            >`}
      </div>
    </div>`;
  }

  /** A new subtopic: a card to fill by hand or from an idea, created only on save. */
  private renderSubtopicForm(parentTitle: string): TemplateResult {
    return html`<pna-topic-form
      .parentTitle=${parentTitle}
      .error=${this._formError}
      suggestible
      .ideas=${this._ideas.subtopic.ideas}
      ?ideasBusy=${this._ideas.subtopic.busy}
      .ideasError=${this._ideas.subtopic.error}
      @suggestions-more=${() => void this.moreIdeas("subtopic")}
      .setup=${this._setup.topic.setup}
      ?setupBusy=${this._setup.topic.busy}
      .setupError=${this._setup.topic.error}
      @setup-request=${(e: CustomEvent<string>) =>
        void this.setupFor.topic.ask({ kind: "topic", title: e.detail, topicId: this.topicId })}
      @topic-save=${(e: CustomEvent<TopicFormValue>) => this.createSubtopic(e.detail)}
      @topic-cancel=${() => {
        this._addingSubtopic = false;
      }}
    ></pna-topic-form>`;
  }

  private createSubtopic(value: TopicFormValue): void {
    const result = addTopic(this.ctx, {
      parentId: this.topicId,
      title: value.title,
      brief: value.brief,
      level: value.level,
      excludes: value.excludes,
      focusAreas: value.focusAreas,
    });
    if (!result.ok) {
      this._formError = result.error.message;
      return;
    }
    this._formError = "";
    this._addingSubtopic = false;
    this.setIdeas("subtopic", NO_IDEAS);
    navigate(routeHref({ name: "topic", topicId: result.value.id, tab: "news" }));
  }

  /* -------------------------------------------------------------- render -- */

  private renderTab(): TemplateResult {
    const state = this.ctx.store.getState();
    const overview = topicOverview(state, this.topicId);
    if (!overview) return html`<ui-notice tone="error" message="Тема не найдена"></ui-notice>`;

    switch (this.tab) {
      case "news": {
        const busy = PERIODS.filter((period) => this.isBusy(digestTaskKey(this.topicId, period)));
        const busySince = Object.fromEntries(
          busy.map((period) => [period, this.taskSince(digestTaskKey(this.topicId, period))]),
        );
        const errors = PERIODS
          .map((period) => this.taskError(digestTaskKey(this.topicId, period)))
          .filter((message) => message.length > 0);

        return html`<pna-digest-panel
          .digests=${overview.digests}
          .busyPeriods=${busy}
          .busySince=${busySince}
          .busySteps=${Object.fromEntries(
            busy.map((period) => [period, this.taskSteps(digestTaskKey(this.topicId, period), "digest")]),
          )}
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
          .since=${this.taskSince(key)}
          .steps=${this.taskSteps(key, "sources")}
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
