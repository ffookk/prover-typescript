import test from "node:test";
import assert from "node:assert/strict";
import { AVAILABLE_THEOREM_LIST, MockProofEngine, REAL_THEOREM_LIST, RealProofEngine, type ProofEngine } from "../src/ui/proof-engine";

test("UI proof view loads an initial theorem without exposing engine internals", () => {
  const engine = new MockProofEngine();
  const state = engine.loadTheorem("n_plus_zero");
  assert.equal(state.theoremName, "n_plus_zero");
  assert.equal(state.completed, false);
  assert.deepEqual(state.goals[0], { id: "n-plus-zero-1", target: "n + 0 = n", context: [{ name: "n", type: "Nat" }] });
});

test("theorem selection resets the mock proof", () => {
  const engine = new MockProofEngine();
  engine.runTactic("intro");
  const state = engine.loadTheorem("zero");
  assert.equal(state.theoremName, "zero");
  assert.equal(state.goals.length, 1);
});

test("valid mock tactic completes a solvable theorem", () => {
  const engine = new MockProofEngine();
  engine.loadTheorem("zero");
  const result = engine.runTactic("rfl");
  assert.equal(result.kind, "success");
  assert.equal(result.state.completed, true);
  assert.equal(result.message, "Mock proof completed");
});

test("invalid mock tactic returns a user-facing error and keeps the goal", () => {
  const engine = new MockProofEngine();
  const before = engine.loadTheorem("n_plus_zero");
  const result = engine.runTactic("rfl");
  assert.equal(result.kind, "error");
  assert.equal(result.message, "rfl cannot solve this goal in mock mode.");
  assert.deepEqual(result.state, before);
});

test("empty tactic is rejected without changing state", () => {
  const engine = new MockProofEngine();
  const before = engine.loadTheorem("zero");
  const result = engine.runTactic("  ");
  assert.equal(result.kind, "error");
  assert.equal(result.message, "Enter a tactic before applying it.");
  assert.deepEqual(result.state, before);
});

test("mock engine supports multiple goals and advances one at a time", () => {
  const engine = new MockProofEngine();
  const state = engine.loadTheorem("multi_goal");
  assert.equal(state.goals.length, 2);
  assert.equal(state.goals[0].id, "multi-1");
  const result = engine.runTactic("rfl");
  assert.equal(result.kind, "error");
  assert.equal(result.state.goals.length, 2);
});

test("returned proof states are detached from engine state", () => {
  const engine = new MockProofEngine();
  const state = engine.loadTheorem("zero");
  state.goals[0].target = "mutated";
  assert.equal(engine.runTactic("rfl").kind, "success");
});

test("real engine accepts a proof through the kernel", () => {
  const engine: ProofEngine = new RealProofEngine();
  engine.loadTheorem("zero");
  const result = engine.runTactic("rfl");
  assert.equal(result.kind, "success");
  assert.equal(result.message, "Proof accepted");
  assert.equal(result.state.completed, true);
});

test("the add_succ palette entry supplies a Kernel-accepted proof of its exercise", () => {
  const theorem = AVAILABLE_THEOREM_LIST.find(entry => entry.id === "add_succ");
  assert.ok(theorem);
  const engine = new RealProofEngine();
  assert.equal(engine.loadTheorem(theorem.id).theoremName, theorem.id);
  const result = engine.runTactic(`exact ${theorem.id}`);
  assert.equal(result.kind, "success", `${theorem.id}: ${result.message}`);
  assert.equal(result.state.completed, true);
  assert.equal(result.message, "Proof accepted");
});

test("theorem palette commands resolve across selectable goals and preserve mismatched goals", () => {
  for (const goal of REAL_THEOREM_LIST) {
    for (const theorem of AVAILABLE_THEOREM_LIST) {
      const engine = new RealProofEngine();
      const before = engine.loadTheorem(goal.id);
      assert.equal(before.theoremName, goal.id);
      const result = engine.runTactic(`exact ${theorem.id}`);
      if (result.kind === "error") {
        assert.doesNotMatch(result.message, /Unknown variable/, `${theorem.id} on ${goal.id}: ${result.message}`);
        assert.deepEqual(result.state, before);
        assert.deepEqual(engine.tacticHistory(), []);
      } else {
        assert.equal(result.state.completed, true);
      }
    }
  }
});

test("real engine rejects an invalid tactic and preserves the proof state", () => {
  const engine = new RealProofEngine();
  const before = engine.loadTheorem("zero");
  const result = engine.runTactic("exact Nat");
  assert.equal(result.kind, "error");
  assert.match(result.message, /Type mismatch|Found: Type/);
  assert.deepEqual(result.state, before);
});

test("real engine exposes dynamic tactic suggestions from the Core goal", () => {
  const engine = new RealProofEngine();
  engine.loadTheorem("identity");
  assert.deepEqual(engine.tacticSuggestions().map((tactic) => tactic.id), ["intro", "exact", "apply"]);
  assert.equal(engine.runTactic("intro").kind, "success");
  assert.deepEqual(engine.tacticSuggestions().map((tactic) => tactic.id), ["rfl", "induction", "exact", "apply"]);
});

test("display projection keeps Pi binders out of context until intro", () => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem("identity");
  assert.equal(initial.goals[0].context.length, 0);
  assert.deepEqual(engine.displayProofState(), { props: [], goal: "(n : Nat) → n = n" });
  const afterIntro = engine.runTactic("intro");
  assert.equal(afterIntro.kind, "success");
  assert.deepEqual(afterIntro.state.goals[0].context, [{ name: "n", type: "Nat" }]);
  assert.equal(afterIntro.state.goals[0].target, "n = n");
  assert.deepEqual(engine.displayProofState(), { props: [{ name: "n", type: "Nat" }], goal: "n = n" });
});

test("display projection keeps Chapter 2 binder out of context until intro", () => {
  const engine = new RealProofEngine();
  engine.loadTheorem("add_zero");
  assert.deepEqual(engine.displayProofState(), {
    props: [],
    goal: "(n : Nat) → n + 0 = n",
  });
});

test("display projection groups consecutive Pi binders with the same domain", () => {
  const engine = new RealProofEngine();
  engine.loadTheorem("add_succ");
  assert.deepEqual(engine.displayProofState(), {
    props: [],
    goal: "(n, x2 : Nat) → n + Succ x2 = Succ (n + x2)",
  });
});

test("display projection renders the induction hypothesis using surface notation", () => {
  const engine = new RealProofEngine();
  engine.loadTheorem("add_zero");
  assert.equal(engine.runTactic("intro").kind, "success");
  assert.equal(engine.runTactic("induction n").kind, "success");
  assert.equal(engine.runTactic("rfl").kind, "success");
  assert.deepEqual(engine.displayProofState(), {
    props: [
      { name: "n", type: "Nat" },
      { name: "IH", type: "n + 0 = n" },
    ],
    goal: "Succ n + 0 = Succ n",
  });
});

test("rewrite keeps an induction hypothesis as an equality", () => {
  const engine = new RealProofEngine();
  engine.loadTheorem("add_succ");
  for (const tactic of ["intro", "intro", "induction x", "induction n", "rfl"]) {
    const result = engine.runTactic(tactic);
    assert.equal(result.kind, "success", result.kind === "error" ? `${tactic}: ${result.message}` : "");
  }
  const rewritten = engine.runTactic("rewrite IH");
  assert.equal(rewritten.kind, "success", rewritten.kind === "error" ? rewritten.message : "");
  assert.equal(rewritten.state.goals[0].context[1].name, "IH");
  assert.equal(rewritten.state.goals[0].context[1].type, "n + Succ 0 = Succ n + 0");
  assert.equal(rewritten.state.goals[0].target, "Succ (Succ n + 0) = Succ (Succ n + 0)");
  assert.equal(engine.runTactic("rfl").kind, "success");
});
test("real engine supports intro followed by rfl", () => {
  const engine = new RealProofEngine();
  engine.loadTheorem("identity");
  const intro = engine.runTactic("intro");
  assert.equal(intro.kind, "success");
  assert.equal(intro.state.goals[0].context[0].name, "n");
  const result = engine.runTactic("rfl");
  assert.equal(result.kind, "success");
  assert.equal(result.message, "Proof accepted");
});

test("real engine supports assumption", () => {
  const engine = new RealProofEngine();
  engine.loadTheorem("assumption");
  assert.equal(engine.runTactic("intro").kind, "success");
  assert.equal(engine.runTactic("intro").kind, "success");
  const result = engine.runTactic("assumption");
  assert.equal(result.kind, "success");
  assert.equal(result.message, "Proof accepted");
});

test("real engine supports apply followed by exact", () => {
  const engine = new RealProofEngine();
  engine.loadTheorem("apply");
  const applied = engine.runTactic("apply (x : Nat) => Refl Nat 0");
  assert.equal(applied.kind, "success");
  assert.equal(applied.state.goals.length, 1);
  assert.equal(applied.state.goals[0].target, "Nat");
  const result = engine.runTactic("exact 0");
  assert.equal(result.kind, "success");
  assert.equal(result.message, "Proof accepted");
});

test("real engine does not expose proof internals through its UI state", () => {
  const engine = new RealProofEngine();
  const state = engine.loadTheorem("identity");
  assert.deepEqual(Object.keys(state.goals[0]), ["id", "target", "context"]);
  assert.equal("type" in state.goals[0], false);
});



