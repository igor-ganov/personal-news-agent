import { err, ok, type Result } from "../fp/result.js";
import type { LessonDraft, ModuleDraft, ProgramDraft } from "../model/skill.js";

/**
 * Edits the user can apply to a generated plan before committing it
 * ("программу можно модернизировать на момент создания").
 *
 * Every edit is a value, so the UI dispatches data and the domain stays pure.
 */
export type PlanEdit =
  | { readonly type: "set-title"; readonly title: string }
  | { readonly type: "set-goal"; readonly goal: string }
  | { readonly type: "add-module"; readonly module: ModuleDraft; readonly at?: number }
  | { readonly type: "remove-module"; readonly module: number }
  | { readonly type: "move-module"; readonly from: number; readonly to: number }
  | {
      readonly type: "edit-module";
      readonly module: number;
      readonly patch: Partial<Pick<ModuleDraft, "title" | "objective">>;
    }
  | { readonly type: "add-lesson"; readonly module: number; readonly lesson: LessonDraft; readonly at?: number }
  | { readonly type: "remove-lesson"; readonly module: number; readonly lesson: number }
  | {
      readonly type: "edit-lesson";
      readonly module: number;
      readonly lesson: number;
      readonly patch: Partial<LessonDraft>;
    }
  | {
      readonly type: "move-lesson";
      readonly from: { readonly module: number; readonly lesson: number };
      readonly to: { readonly module: number; readonly lesson: number };
    };

export type PlanEditError = "out-of-range" | "empty-title" | "empty-plan";

const insertAt = <T>(items: readonly T[], item: T, at: number | undefined): T[] => {
  const index = at === undefined ? items.length : Math.min(Math.max(0, at), items.length);
  return [...items.slice(0, index), item, ...items.slice(index)];
};

const moveWithin = <T>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(Math.min(Math.max(0, to), next.length), 0, moved);
  return next;
};

const inRange = (index: number, length: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < length;

const withModules = (draft: ProgramDraft, modules: readonly ModuleDraft[]): ProgramDraft => ({
  ...draft,
  modules,
});

const replaceModule = (
  draft: ProgramDraft,
  index: number,
  next: ModuleDraft,
): ProgramDraft => withModules(draft, draft.modules.map((m, i) => (i === index ? next : m)));

export const applyPlanEdit = (
  draft: ProgramDraft,
  edit: PlanEdit,
): Result<ProgramDraft, PlanEditError> => {
  switch (edit.type) {
    case "set-title": {
      const title = edit.title.trim();
      return title.length === 0 ? err("empty-title") : ok({ ...draft, title });
    }

    case "set-goal":
      return ok({ ...draft, goal: edit.goal.trim() });

    case "add-module": {
      const title = edit.module.title.trim();
      if (title.length === 0) return err("empty-title");
      return ok(withModules(draft, insertAt(draft.modules, { ...edit.module, title }, edit.at)));
    }

    case "remove-module": {
      if (!inRange(edit.module, draft.modules.length)) return err("out-of-range");
      if (draft.modules.length === 1) return err("empty-plan");
      return ok(withModules(draft, draft.modules.filter((_, i) => i !== edit.module)));
    }

    case "move-module": {
      if (!inRange(edit.from, draft.modules.length)) return err("out-of-range");
      return ok(withModules(draft, moveWithin(draft.modules, edit.from, edit.to)));
    }

    case "edit-module": {
      const module = draft.modules[edit.module];
      if (!module) return err("out-of-range");
      const title = edit.patch.title === undefined ? module.title : edit.patch.title.trim();
      if (title.length === 0) return err("empty-title");
      return ok(
        replaceModule(draft, edit.module, {
          ...module,
          title,
          objective: edit.patch.objective === undefined ? module.objective : edit.patch.objective.trim(),
        }),
      );
    }

    case "add-lesson": {
      const module = draft.modules[edit.module];
      if (!module) return err("out-of-range");
      const title = edit.lesson.title.trim();
      if (title.length === 0) return err("empty-title");
      return ok(
        replaceModule(draft, edit.module, {
          ...module,
          lessons: insertAt(module.lessons, { ...edit.lesson, title }, edit.at),
        }),
      );
    }

    case "remove-lesson": {
      const module = draft.modules[edit.module];
      if (!module || !inRange(edit.lesson, module.lessons.length)) return err("out-of-range");
      return ok(
        replaceModule(draft, edit.module, {
          ...module,
          lessons: module.lessons.filter((_, i) => i !== edit.lesson),
        }),
      );
    }

    case "edit-lesson": {
      const module = draft.modules[edit.module];
      const lesson = module?.lessons[edit.lesson];
      if (!module || !lesson) return err("out-of-range");
      const title = edit.patch.title === undefined ? lesson.title : edit.patch.title.trim();
      if (title.length === 0) return err("empty-title");
      const next: LessonDraft = {
        title,
        objective: edit.patch.objective === undefined ? lesson.objective : edit.patch.objective.trim(),
        estimatedMinutes: edit.patch.estimatedMinutes ?? lesson.estimatedMinutes,
      };
      return ok(
        replaceModule(draft, edit.module, {
          ...module,
          lessons: module.lessons.map((l, i) => (i === edit.lesson ? next : l)),
        }),
      );
    }

    case "move-lesson": {
      const source = draft.modules[edit.from.module];
      const target = draft.modules[edit.to.module];
      if (!source || !target || !inRange(edit.from.lesson, source.lessons.length))
        return err("out-of-range");

      if (edit.from.module === edit.to.module) {
        return ok(
          replaceModule(draft, edit.from.module, {
            ...source,
            lessons: moveWithin(source.lessons, edit.from.lesson, edit.to.lesson),
          }),
        );
      }

      const lesson = source.lessons[edit.from.lesson]!;
      const modules = draft.modules.map((m, i) => {
        if (i === edit.from.module)
          return { ...m, lessons: m.lessons.filter((_, j) => j !== edit.from.lesson) };
        if (i === edit.to.module) return { ...m, lessons: insertAt(m.lessons, lesson, edit.to.lesson) };
        return m;
      });
      return ok(withModules(draft, modules));
    }
  }
};

/** Applies a sequence of edits, stopping at the first failure. */
export const applyPlanEdits = (
  draft: ProgramDraft,
  edits: readonly PlanEdit[],
): Result<ProgramDraft, PlanEditError> => {
  let current = draft;
  for (const edit of edits) {
    const result = applyPlanEdit(current, edit);
    if (!result.ok) return result;
    current = result.value;
  }
  return ok(current);
};

export const draftLessonMinutes = (draft: ProgramDraft): number[] =>
  draft.modules.flatMap((m) => m.lessons.map((l) => l.estimatedMinutes));
