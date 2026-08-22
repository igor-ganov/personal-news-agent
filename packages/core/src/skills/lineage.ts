import type { LessonId, ProgramId } from "../model/ids.js";
import type { SkillProgram } from "../model/skill.js";

export type ProgramMap = Readonly<Record<ProgramId, SkillProgram>>;

/**
 * Every program the given one builds on, transitively — the material a
 * "скилл на основе скилла" is allowed to reference and expected to continue.
 *
 * Order is foundation-first (the deepest ancestor comes first), so lesson
 * prompts can present prior material in the order it was studied.
 * Self-references and cycles are ignored rather than fatal.
 */
export const lineageOf = (programs: ProgramMap, id: ProgramId): SkillProgram[] => {
  const ordered: SkillProgram[] = [];
  const visited = new Set<ProgramId>([id]);

  const visit = (currentId: ProgramId): void => {
    const program = programs[currentId];
    if (!program) return;
    for (const baseId of program.basedOn) {
      if (visited.has(baseId)) continue;
      visited.add(baseId);
      visit(baseId);
      const base = programs[baseId];
      if (base) ordered.push(base);
    }
  };

  visit(id);
  return ordered;
};

/** Programs that build directly on the given one. */
export const dependentsOf = (programs: ProgramMap, id: ProgramId): SkillProgram[] =>
  Object.values(programs).filter((p) => p.basedOn.includes(id));

/**
 * Whether `baseId` can be used as a foundation for `programId` without
 * creating a cycle. A program may not be based on itself or on anything
 * that already depends on it.
 */
export const canBaseOn = (
  programs: ProgramMap,
  programId: ProgramId,
  baseId: ProgramId,
): boolean => {
  if (programId === baseId) return false;
  if (!programs[baseId]) return false;
  return !lineageOf(programs, baseId).some((p) => p.id === programId);
};

export interface PriorMaterial {
  readonly programId: ProgramId;
  readonly programTitle: string;
  readonly lessonId: LessonId;
  readonly lessonTitle: string;
  readonly objective: string;
  readonly covered: boolean;
}

/** A flat index of everything already studied upstream — the raw material for cross-references. */
export const priorMaterialOf = (programs: ProgramMap, id: ProgramId): PriorMaterial[] =>
  lineageOf(programs, id).flatMap((program) =>
    program.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({
        programId: program.id,
        programTitle: program.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        objective: lesson.objective,
        covered: lesson.status === "done",
      })),
    ),
  );
