import type { ProofStateView, ProofResult } from "./proof-engine";

export interface Exercise {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly theoremId: string;
  readonly statement: string;
  readonly prerequisiteIds: readonly string[];
  readonly tacticHint: string;
  readonly available: boolean;
  readonly countsAsCompleted: boolean;
  readonly availabilityNote?: string;
}

export interface Chapter {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly exerciseIds: readonly string[];
}

export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly chapters: readonly Chapter[];
  readonly exercises: readonly Exercise[];
  readonly theorems: readonly Exercise[];
}

export interface LessonProgress {
  readonly completedExercises: readonly string[];
  /** Backward-compatible alias used by older UI callers. */
  readonly completedTheorems: readonly string[];
}

const E = (id: string, number: number, title: string, theoremId: string, statement: string, prerequisiteIds: readonly string[], tacticHint: string): Exercise => ({
  id, number, title, theoremId, statement, prerequisiteIds, tacticHint, available: true, countsAsCompleted: true,
});

export const CHAPTERS: readonly Chapter[] = [
  { id: "numbers", number: 1, title: "Natural Numbers", exerciseIds: ["numbers.zero_eq_zero", "numbers.identity", "numbers.zero_add"] },
  { id: "addition", number: 2, title: "Addition", exerciseIds: ["addition.add_zero", "addition.add_succ"] },
  { id: "equality", number: 3, title: "Equality & Rewrite", exerciseIds: ["equality.transport", "equality.rewrite"] },
  { id: "induction", number: 4, title: "Induction", exerciseIds: ["induction.add_zero", "induction.zero_add", "induction.succ_add_zero"] },
];

export const EXERCISES: readonly Exercise[] = [
  E("numbers.zero_eq_zero", 1, "Zero", "zero", "0 = 0", [], "rfl"),
  E("numbers.identity", 2, "Identity", "identity", "n = n", ["numbers.zero_eq_zero"], "intro; rfl"),
  E("numbers.zero_add", 3, "Zero + n", "zero_plus_n", "0 + n = n", ["numbers.identity"], "intro; rfl"),
  E("addition.add_zero", 4, "n + 0", "add_zero", "n + 0 = n", ["numbers.zero_add"], "intro; induction n; rfl; rewrite IH; rfl"),
  E("addition.add_succ", 5, "Addition successor", "add_succ", "n + Succ m = Succ (n + m)", ["addition.add_zero"], "exact add_succ"),
  E("equality.transport", 6, "Equality transport", "assumption", "n = n → n = n", ["addition.add_zero"], "intro; intro; assumption"),
  E("equality.rewrite", 7, "Single rewrite", "equality_rewrite", "a = b → f a = f a", ["equality.transport"], "intro; intro; intro; intro; rewrite h; rfl"),
  E("induction.add_zero", 8, "Induction: n + 0", "add_zero", "n + 0 = n", ["equality.rewrite"], "intro; induction n; rfl; rewrite IH; rfl"),
  E("induction.zero_add", 9, "Induction: 0 + n", "zero_add", "0 + n = n", ["induction.add_zero"], "intro; rfl (compare with induction)"),
  E("induction.succ_add_zero", 10, "Induction: Succ n + 0", "succ_add", "Succ n + 0 = Succ n", ["induction.zero_add"], "intro n; intro m; induction m; rfl; rewrite IH; rfl"),
];

export const NATURAL_NUMBERS_LESSON: Lesson = {
  id: "natural-numbers",
  title: "Natural Numbers: Chapters 1–4",
  chapters: CHAPTERS,
  exercises: EXERCISES,
  theorems: EXERCISES,
};

export function initialLessonProgress(): LessonProgress {
  return { completedExercises: [], completedTheorems: [] };
}

export function recordProofResult(progress: LessonProgress, exercise: Exercise, result: ProofResult): LessonProgress {
  if (result.kind !== "success" || !result.state.completed || !exercise.available || !exercise.countsAsCompleted) return progress;
  if (progress.completedExercises.includes(exercise.id)) return progress;
  const completedExercises = [...progress.completedExercises, exercise.id];
  return { completedExercises, completedTheorems: completedExercises };
}

export function isCompleted(progress: LessonProgress, exerciseId: string): boolean {
  return progress.completedExercises.includes(exerciseId);
}

export function previousExercise(lesson: Lesson, exerciseId: string): Exercise | null {
  const index = lesson.exercises.findIndex((exercise) => exercise.id === exerciseId);
  return index > 0 ? lesson.exercises[index - 1] : null;
}

export function nextExercise(lesson: Lesson, exerciseId: string): Exercise | null {
  const index = lesson.exercises.findIndex((exercise) => exercise.id === exerciseId);
  return index >= 0 ? lesson.exercises[index + 1] ?? null : null;
}

export function nextTheorem(lesson: Lesson, theoremId: string): Exercise | null {
  return nextExercise(lesson, theoremId);
}

export function initialTheoremState(exercise: Exercise, load: (engineId: string) => ProofStateView): ProofStateView | null {
  return exercise.available ? load(exercise.theoremId) : null;
}
