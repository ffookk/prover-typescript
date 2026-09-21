import test from "node:test";
import assert from "node:assert/strict";
import { projectGoal, showDisplayTerm } from "../src/ui/proof-engine.js";
import { addTerm } from "../src/library/nat.js";
import { infer } from "../src/kernel/typecheck.js";
import { Nat, Type, app, eq, eqRec, lambda, natRec, pi, refl, succ, variable, Zero } from "../src/syntax/ast.js";

test("goal display resolves variable metadata through the actual local scope", () => {
  const display = projectGoal({
    id: 1,
    context: [{ name: "A", type: Type }, { name: "value", type: variable(0, "stale") }],
    type: eq(variable(1, "oldType"), variable(0, "oldValue"), variable(0)),
  });
  assert.deepEqual(display, {
    props: [{ name: "A", type: "Type" }, { name: "value", type: "A" }],
    goal: "value = value",
  });
});

test("Pi display gives shadowed binders distinct names and preserves outer references", () => {
  const term = pi(Type, pi(Type, pi(variable(1, "stale"), variable(2), "value"), "A"), "A");
  assert.doesNotThrow(() => infer([], term));
  assert.equal(showDisplayTerm(term), "(A : Type) → (A1 : Type) → (value : A) → A");
});

test("lambda display retains outer scope and freshens its own binder", () => {
  const term = pi(Nat, eq(pi(Nat, Nat), lambda(Nat, variable(1, "stale"), "n"), lambda(Nat, variable(0), "n")), "n");
  assert.doesNotThrow(() => infer([], term));
  assert.equal(showDisplayTerm(term), "(n : Nat) → (fun n1 : Nat => n) = (fun n1 : Nat => n1)");
});

test("recursor display scopes its explicit lambdas exactly once", () => {
  const term = lambda(Nat, natRec(lambda(Nat, Nat), Zero, lambda(Nat, lambda(Nat, variable(2))), variable(0)), "outer");
  assert.doesNotThrow(() => infer([], term));
  assert.equal(showDisplayTerm(term), "(fun outer : Nat => (Nat.rec (fun x2 : Nat => Nat) 0 (fun x2 : Nat => (fun x3 : Nat => outer)) outer))");
});

test("display keeps the diagnostic fallback for variables outside the supplied scope", () => {
  assert.equal(showDisplayTerm(variable(2, "external")), "external");
  assert.equal(showDisplayTerm(variable(2)), "v2");
});

test("display distinguishes successor of a sum from a sum with a successor", () => {
  const sum = natRec(lambda(Nat, Nat), variable(0, "b"), lambda(Nat, lambda(Nat, { kind: "Succ", value: variable(0) })), variable(1, "a"));
  assert.equal(showDisplayTerm({ kind: "Succ", value: sum }), "Succ (a + b)");
  assert.equal(showDisplayTerm(natRec(lambda(Nat, Nat), variable(0, "b"), lambda(Nat, lambda(Nat, { kind: "Succ", value: variable(0) })), { kind: "Succ", value: variable(1, "a") })), "Succ a + b");
});

test("display preserves nested addition structure", () => {
  const a = variable(2, "a"), b = variable(1, "b"), c = variable(0, "c");
  assert.equal(showDisplayTerm(addTerm(a, addTerm(b, c))), "a + (b + c)");
  assert.equal(showDisplayTerm(addTerm(addTerm(a, b), c)), "(a + b) + c");
});

test("display parenthesizes Pi and equality operands inside expressions", () => {
  const identityType = pi(Nat, Nat, "n");
  assert.equal(showDisplayTerm(eq(Type, identityType, identityType)), "((n : Nat) → Nat) = ((n : Nat) → Nat)");
  assert.equal(showDisplayTerm(app(variable(0, "f"), identityType)), "(f ((n : Nat) → Nat))");
  assert.equal(showDisplayTerm(refl(Type, eq(Nat, Zero, Zero))), "refl (0 = 0)");
});

test("Nat.rec display groups compound zero cases and scrutinees", () => {
  const motive = lambda(Nat, eq(Nat, variable(0), variable(0)), "n");
  const step = lambda(Nat, lambda(eq(Nat, variable(0), variable(0)), refl(Nat, succ(variable(1))), "ih"), "n");
  const term = natRec(motive, refl(Nat, Zero), step, succ(Zero));
  assert.doesNotThrow(() => infer([], term));
  assert.equal(showDisplayTerm(term), "(Nat.rec (fun n : Nat => n = n) (refl 0) (fun n : Nat => (fun ih : n = n => refl (Succ n))) (Succ 0))");
});

test("Eq.rec display groups function-type cases and equality evidence", () => {
  const term = eqRec(lambda(Nat, Type, "n"), pi(Nat, Nat, "n"), Zero, Zero, refl(Nat, Zero));
  assert.doesNotThrow(() => infer([], term));
  assert.equal(showDisplayTerm(term), "(Eq.rec (fun n : Nat => Type) ((n : Nat) → Nat) 0 0 (refl 0))");
});
