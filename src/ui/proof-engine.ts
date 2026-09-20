import { elaborate } from "../elaborator/elaborate";
import { GlobalEnvironment } from "../environment/environment";
import { parse } from "../parser/parser";
import { proofState, type ProofState } from "../proof/state";
import { tacticSession, TacticError, type TacticSession } from "../proof/tactic";
import { show } from "../kernel/typecheck";
import { type Term as CoreTerm, Nat, Zero, variable, pi, eq, app } from "../syntax/ast";
import { add, addTerm, addTwoThreeProof } from "../library/nat";
import { addZeroProof, addZeroType } from "../library/add-zero";
import { zeroAddProof, zeroAddType } from "../library/zero-add";
import { succAddProof, succAddType } from "../library/succ-add";
import { addSuccProof, addSuccType } from "../library/add-succ";
import { addAssocProof } from "../library/add-assoc";
import { addCommProof } from "../library/add-comm";
import { definitionalEqual, shift, whnf } from "../kernel/reduction";

export interface ContextEntryView { name: string; type: string; }
export interface GoalView { id: string; target: string; context: ContextEntryView[]; }
export interface ProofStateView { theoremName: string; goals: GoalView[]; completed: boolean; }
export interface DisplayProofState { props: ContextEntryView[]; goal: string; }
export interface TacticDescriptor {
  id: string;
  label: string;
  syntax: string;
  description: string;
  canApply: (goal: import("../proof/state").Goal) => boolean;
}
export type ProofResult = { kind: "success"; state: ProofStateView; message?: string } | { kind: "error"; message: string; state: ProofStateView };
export interface ProofEngine { loadTheorem(id: string): ProofStateView; runTactic(tactic: string): ProofResult; tacticSuggestions(): TacticDescriptor[]; tacticHistory(): string[]; }

interface MockTheorem { name: string; goals: GoalView[]; }
const MOCK_THEOREMS: Record<string, MockTheorem> = {
  zero: { name: "zero", goals: [{ id: "zero-1", target: "0 = 0", context: [] }] },
  n_plus_zero: { name: "n_plus_zero", goals: [{ id: "n-plus-zero-1", target: "n + 0 = n", context: [{ name: "n", type: "Nat" }] }] },
  zero_plus_n: { name: "zero_plus_n", goals: [{ id: "zero-plus-n-1", target: "0 + n = n", context: [{ name: "n", type: "Nat" }] }] },
  identity: { name: "identity", goals: [{ id: "identity-1", target: "n = n", context: [{ name: "n", type: "Nat" }] }] },
  multi_goal: { name: "multi_goal", goals: [
    { id: "multi-1", target: "m + 0 = m", context: [{ name: "m", type: "Nat" }] },
    { id: "multi-2", target: "Succ m + 0 = Succ m", context: [{ name: "m", type: "Nat" }] },
  ] },
};

function cloneMockState(state: ProofStateView): ProofStateView {
  return { theoremName: state.theoremName, completed: state.completed, goals: state.goals.map((goal) => ({ id: goal.id, target: goal.target, context: goal.context.map((entry) => ({ ...entry })) })) };
}
function initialState(theorem: MockTheorem): ProofStateView { return cloneMockState({ theoremName: theorem.name, goals: theorem.goals, completed: theorem.goals.length === 0 }); }

export class MockProofEngine implements ProofEngine {
  private state = initialState(MOCK_THEOREMS.n_plus_zero);
  loadTheorem(id: string): ProofStateView { const theorem = MOCK_THEOREMS[id] ?? MOCK_THEOREMS.n_plus_zero; this.state = initialState(theorem); return cloneMockState(this.state); }
  tacticSuggestions(): TacticDescriptor[] { return []; }
  tacticHistory(): string[] { return []; }
  runTactic(tactic: string): ProofResult {
    const normalized = tactic.trim().toLowerCase();
    if (!normalized) return { kind: "error", message: "Enter a tactic before applying it.", state: cloneMockState(this.state) };
    if (this.state.completed) return { kind: "error", message: "There are no goals left to solve.", state: cloneMockState(this.state) };
    const currentGoal = this.state.goals[0];
    if (normalized === "rfl" && ["0 = 0", "n = n"].includes(currentGoal.target)) {
      this.state = { ...this.state, goals: this.state.goals.slice(1), completed: this.state.goals.length === 1 };
      return { kind: "success", message: this.state.completed ? "Mock proof completed" : undefined, state: cloneMockState(this.state) };
    }
    if (normalized === "rfl" && currentGoal.target === "n + 0 = n") return { kind: "error", message: "rfl cannot solve this goal in mock mode.", state: cloneMockState(this.state) };
    if (normalized === "intro") {
      const nextGoal = { ...currentGoal, target: currentGoal.target === "n + 0 = n" ? "0 = 0" : currentGoal.target };
      this.state = { ...this.state, goals: [nextGoal, ...this.state.goals.slice(1)] };
      return { kind: "success", state: cloneMockState(this.state) };
    }
    if (normalized === "assumption" && /^\w+ = \w+$/.test(currentGoal.target)) {
      const [left, right] = currentGoal.target.split(" = ");
      if (left === right && currentGoal.context.some((entry) => entry.name === left)) {
        this.state = { ...this.state, goals: this.state.goals.slice(1), completed: this.state.goals.length === 1 };
        return { kind: "success", message: this.state.completed ? "Mock proof completed" : undefined, state: cloneMockState(this.state) };
      }
    }
    return { kind: "error", message: `${normalized} cannot solve the focused goal in mock mode.`, state: cloneMockState(this.state) };
  }
}

interface RealTheorem { readonly name: string; readonly type: CoreTerm; }

const REAL_THEOREMS: Record<string, RealTheorem> = {
  zero: { name: "zero", type: { kind: "Eq", type: { kind: "Nat" }, left: { kind: "Zero" }, right: { kind: "Zero" } } },
  identity: { name: "identity", type: { kind: "Pi", domain: { kind: "Nat" }, body: { kind: "Eq", type: { kind: "Nat" }, left: { kind: "Var", index: 0, name: "n" }, right: { kind: "Var", index: 0, name: "n" } }, name: "n" } },
  zero_plus_n: { name: "zero_plus_n", type: pi(Nat, eq(Nat, addTerm(Zero, variable(0, "n")), variable(0, "n")), "n") },
  add_zero: { name: "add_zero", type: addZeroType },
  add_succ: { name: "add_succ", type: addSuccType },
  equality_transport: { name: "equality_transport", type: pi(Nat, pi(Nat, pi(eq(Nat, variable(2, "a"), variable(1, "b")), eq(Nat, variable(2, "a"), variable(1, "b")), "h"), "b"), "a") },
  equality_rewrite: { name: "equality_rewrite", type: pi(pi(Nat, Nat, "x"), pi(Nat, pi(Nat, pi(eq(Nat, variable(1, "a"), variable(0, "b")), eq(Nat, app(variable(3, "f"), variable(2, "a")), app(variable(3, "f"), variable(2, "a"))), "h"), "b"), "a"), "f") },
  zero_add: { name: "zero_add", type: zeroAddType },
  succ_add: { name: "succ_add", type: pi(Nat, eq(Nat, addTerm({ kind: "Succ", value: variable(0, "n") }, Zero), { kind: "Succ", value: variable(0, "n") }), "n") },
  assumption: { name: "assumption", type: { kind: "Pi", domain: { kind: "Nat" }, body: { kind: "Pi", domain: { kind: "Eq", type: { kind: "Nat" }, left: { kind: "Var", index: 0, name: "n" }, right: { kind: "Var", index: 0, name: "n" } }, body: { kind: "Eq", type: { kind: "Nat" }, left: { kind: "Var", index: 1, name: "n" }, right: { kind: "Var", index: 1, name: "n" } }, name: "h" }, name: "n" } },
  apply: { name: "apply", type: { kind: "Eq", type: { kind: "Nat" }, left: { kind: "Zero" }, right: { kind: "Zero" } } },
};

function cloneView(state: ProofStateView): ProofStateView {
  return { theoremName: state.theoremName, completed: state.completed, goals: state.goals.map((goal) => ({ id: goal.id, target: goal.target, context: goal.context.map((entry) => ({ ...entry })) })) };
}

function isAddRecursor(term: Extract<CoreTerm, { kind: "NatRec" }>): boolean {
  if (term.motive.kind !== "Lambda" || !definitionalEqual(term.motive.domain, Nat)) return false;
  if (!definitionalEqual(term.motive.body, Nat)) return false;
  if (term.succCase.kind !== "Lambda" || !definitionalEqual(term.succCase.domain, Nat)) return false;
  if (term.succCase.body.kind !== "Lambda" || !definitionalEqual(term.succCase.body.domain, Nat)) return false;
  const succBody = term.succCase.body.body;
  return succBody.kind === "Succ" && succBody.value.kind === "Var" && succBody.value.index === 0;
}

function formatDisplayTerm(term: CoreTerm, boundNames: readonly string[] = []): string {
  const formatAddOperand = (operand: CoreTerm): string => {
    const rendered = formatDisplayTerm(operand, boundNames);
    return operand.kind === "Succ" && operand.value.kind === "App" ? `(${rendered})` : rendered;
  };

  switch (term.kind) {
    case "Type": return "Type";
    case "Nat": return "Nat";
    case "Zero": return "0";
    case "Succ": {
      const rendered = formatDisplayTerm(term.value, boundNames);
      return term.value.kind === "App" || term.value.kind === "Succ" ? `Succ (${rendered})` : `Succ ${rendered}`;
    }
    case "Var": return term.name ?? boundNames[term.index] ?? `v${term.index}`;
    case "Pi": {
      const names: string[] = [];
      let current: CoreTerm = term;
      let bodyNames = [...boundNames];
      const domainText = formatDisplayTerm(term.domain, boundNames);

      // Group consecutive non-dependent binders with the same domain so the
      // goal uses the surface syntax `n, x2 : Nat -> ...` instead of exposing
      // the Core representation as a chain of Pi binders.
      while (current.kind === "Pi") {
        const currentDomain = formatDisplayTerm(current.domain, bodyNames);
        if (names.length > 0 && currentDomain !== domainText) break;
        const name = current.name ?? `x${boundNames.length + names.length + 1}`;
        names.push(name);
        bodyNames = [name, ...bodyNames];
        if (current.body.kind !== "Pi") {
          return `(${names.join(", ")} : ${domainText}) → ${formatDisplayTerm(current.body, bodyNames)}`;
        }
        current = current.body;
      }

      const name = names[0];
      return `(${name} : ${domainText}) → ${formatDisplayTerm(term.body, [name, ...boundNames])}`;
    }
    case "Eq": return `${formatDisplayTerm(term.left, boundNames)} = ${formatDisplayTerm(term.right, boundNames)}`;
    case "App": {
      // `add` is encoded as a dependent lambda/recursor in Core, but users
      // should see the surface notation in the tutorial.
      if (term.fn.kind === "App" && term.fn.fn === add) {
        return `${formatAddOperand(term.fn.arg)} + ${formatAddOperand(term.arg)}`;
      }
      return `(${formatDisplayTerm(term.fn, boundNames)} ${formatDisplayTerm(term.arg, boundNames)})`;
    }
    case "NatRec": {
      if (isAddRecursor(term)) {
        return `${formatDisplayTerm(term.scrutinee, boundNames)} + ${formatDisplayTerm(term.zeroCase, boundNames)}`;
      }
      // Nat.rec introduces one binder in its motive and two binders (n, ih)
      // in its successor case; keep those names in the UI instead of showing
      // de Bruijn indices such as #0 and #1.
      return `(Nat.rec ${formatDisplayTerm(term.motive, boundNames)} ${formatDisplayTerm(term.zeroCase, boundNames)} ${formatDisplayTerm(term.succCase, ["ih", "n", ...boundNames])} ${formatDisplayTerm(term.scrutinee, boundNames)})`;
    }
    case "Refl": return `refl ${formatDisplayTerm(term.value, boundNames)}`;
    case "EqRec": {
      return `(Eq.rec ${formatDisplayTerm(term.motive, boundNames)} ${formatDisplayTerm(term.reflCase, boundNames)} ${formatDisplayTerm(term.left, boundNames)} ${formatDisplayTerm(term.right, boundNames)} ${formatDisplayTerm(term.equality, boundNames)})`;
    }
    default: return show(term);
  }
}

export function showDisplayTerm(term: CoreTerm): string {
  return formatDisplayTerm(term);
}

export function projectGoal(goal: import("../proof/state").Goal): DisplayProofState {
  const props = goal.context.map((entry, index) => ({
    name: entry.name,
    // A declaration type is scoped only by locals that precede it.
    type: formatDisplayTerm(entry.type, goal.context.slice(0, index).map((item) => item.name).reverse()),
  }));

  // Keep the UI context faithful to the real proof context: a Pi binder is
  // not a local assumption until `intro` actually moves it into the context.
  // Therefore `(n : Nat) → n = n` initially stays in the Goal, and only after
  // `intro` does `n : Nat` appear under Props / Context.
  return { props, goal: formatDisplayTerm(whnf(goal.type), props.map((entry) => entry.name).reverse()) };
}

function canIntro(goal: import("../proof/state").Goal): boolean { return whnf(goal.type).kind === "Pi"; }
function canRfl(goal: import("../proof/state").Goal): boolean {
  const type = whnf(goal.type);
  return type.kind === "Eq" && definitionalEqual(type.left, type.right);
}
function canAssumption(goal: import("../proof/state").Goal): boolean {
  return goal.context.some((entry, index) => definitionalEqual(shift(entry.type, goal.context.length - index), goal.type));
}
function canInduction(goal: import("../proof/state").Goal): boolean {
  const entry = goal.context[goal.context.length - 1];
  return !!entry && definitionalEqual(entry.type, { kind: "Nat" });
}
function canRewrite(goal: import("../proof/state").Goal): boolean {
  return goal.context.some((entry) => whnf(entry.type).kind === "Eq");
}

export const TACTICS: TacticDescriptor[] = [
  { id: "intro", label: "intro", syntax: "intro", description: "Introduce a proposition into the local context.", canApply: canIntro },
  { id: "rfl", label: "rfl", syntax: "rfl", description: "Close a definitionally equal equality.", canApply: canRfl },
  { id: "assumption", label: "assumption", syntax: "assumption", description: "Use a matching local hypothesis.", canApply: canAssumption },
  { id: "induction", label: "induction", syntax: "induction ", description: "Perform induction on the newest Nat variable.", canApply: canInduction },
  { id: "rewrite", label: "rewrite", syntax: "rewrite ", description: "Rewrite the goal using an equality hypothesis.", canApply: canRewrite },
  { id: "exact", label: "exact", syntax: "exact ", description: "Provide an exact proof term.", canApply: () => true },
  { id: "apply", label: "apply", syntax: "apply ", description: "Apply a theorem or function to the current goal.", canApply: () => true },
];

export function tacticSuggestionsForGoal(goal: import("../proof/state").Goal): TacticDescriptor[] {
  return TACTICS.filter((tactic) => tactic.canApply(goal));
}
function toView(theoremName: string, state: ProofState): ProofStateView {
  return {
    theoremName,
    completed: state.goals.length === 0,
    goals: state.goals.map((goal) => {
      const display = projectGoal(goal);
      return { id: String(goal.id), target: display.goal, context: display.props };
    }),
  };
}

const libraryTheorems = {
  add_succ: addSuccProof, add_zero: addZeroProof, zero_add: zeroAddProof,
  succ_add: succAddProof, add_assoc: addAssocProof, add_comm: addCommProof,
  add_two_three: addTwoThreeProof,
};
const theoremEnvironment = new GlobalEnvironment();
for (const [name, proof] of Object.entries(libraryTheorems)) theoremEnvironment.define(name, proof);
export const AVAILABLE_THEOREM_LIST = Object.keys(libraryTheorems).map(id => ({ id, label: id }));

function parseArgument(source: string, context: readonly { name: string }[]): CoreTerm {
  return elaborate(parse(source), context.map((entry) => entry.name), theoremEnvironment);
}

export class RealProofEngine implements ProofEngine {
  private theoremName = "zero";
  private session: TacticSession = tacticSession(proofState([{ context: [], type: { kind: "Eq", type: { kind: "Nat" }, left: { kind: "Zero" }, right: { kind: "Zero" } } }]));
  private history: string[] = [];

  loadTheorem(id: string): ProofStateView {
    const theorem = REAL_THEOREMS[id] ?? REAL_THEOREMS.zero;
    this.theoremName = theorem.name;
    this.session = tacticSession(proofState([{ context: [], type: theorem.type }]));
    this.history = [];
    return cloneView(toView(this.theoremName, this.session.state));
  }

  tacticSuggestions(): TacticDescriptor[] {
    const goal = this.session.currentGoal();
    return goal ? tacticSuggestionsForGoal(goal) : [];
  }

  tacticHistory(): string[] { return [...this.history]; }

  displayProofState(): DisplayProofState | null {
    const goal = this.session.currentGoal();
    return goal ? projectGoal(goal) : null;
  }
  runTactic(tactic: string): ProofResult {
    const source = tactic.trim();
    const currentView = () => cloneView(toView(this.theoremName, this.session.state));
    if (!source) return { kind: "error", message: "Enter a tactic before applying it.", state: currentView() };
    if (this.session.state.goals.length === 0) return { kind: "error", message: "There are no goals left to solve.", state: currentView() };
    const [name, ...parts] = source.split(/\s+/);
    const argument = parts.join(" ");
    try {
      switch (name.toLowerCase()) {
        case "intro":
          if (argument) throw new TacticError("intro does not take an argument");
          this.session = this.session.intro();
          break;
        case "rfl":
          if (argument) throw new TacticError("rfl does not take an argument");
          this.session = this.session.rfl();
          break;
        case "assumption":
          if (argument) throw new TacticError("assumption does not take an argument");
          this.session = this.session.assumption();
          break;
        case "exact": {
          if (!argument) throw new TacticError("exact expects a term");
          const goal = this.session.currentGoal();
          if (!goal) throw new TacticError("No goals remain");
          this.session = this.session.exact(parseArgument(argument, goal.context));
          break;
        }
        case "apply": {
          if (!argument) throw new TacticError("apply expects a term");
          const goal = this.session.currentGoal();
          if (!goal) throw new TacticError("No goals remain");
          this.session = this.session.apply(parseArgument(argument, goal.context));
          break;
        }
        case "rewrite": {
          if (!argument) throw new TacticError("rewrite expects an equality proof");
          const goal = this.session.currentGoal();
          if (!goal) throw new TacticError("No goals remain");
          this.session = this.session.rewrite(parseArgument(argument, goal.context));
          break;
        }
        case "induction":
          if (!argument) throw new TacticError("induction expects a variable name");
          this.session = this.session.induction(argument);
          break;
        default:
          throw new TacticError(`Unknown tactic: ${name}`);
      }
      this.history.push(source);
      const state = toView(this.theoremName, this.session.state);
      if (state.completed) {
        this.session.proof();
        return { kind: "success", message: "Proof accepted", state: cloneView(state) };
      }
      return { kind: "success", message: "Proof state updated", state: cloneView(state) };
    } catch (error) {
      return { kind: "error", message: error instanceof Error ? error.message : String(error), state: currentView() };
    }
  }
}

export const MOCK_THEOREM_LIST = [
  { id: "zero", label: "01  Zero" },
  { id: "n_plus_zero", label: "02  Addition" },
  { id: "zero_plus_n", label: "03  Add one" },
  { id: "identity", label: "04  Identity" },
];
export const MOCK_MULTI_GOAL_ID = "multi_goal";

export const REAL_THEOREM_LIST = Object.values(REAL_THEOREMS).map((theorem, index) => ({
  id: theorem.name,
  label: `${String(index + 1).padStart(2, "0")}  ${theorem.name}`,
}));





