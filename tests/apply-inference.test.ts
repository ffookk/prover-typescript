import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { addSuccProof, addSuccType } from '../src/library/add-succ';
import { addTerm } from '../src/library/nat';
import { initialProofState } from '../src/proof/state';
import { TacticError, tacticSession } from '../src/proof/tactic';
import { Nat, Type, Zero, app, eq, lambda, pi, refl, succ, variable } from '../src/syntax/ast';

test('apply infers add_succ arguments through its beta-reduced motive', () => {
  const original = tacticSession(initialProofState(addSuccType)).intro().intro();
  const before = original.state;
  const completed = original.apply(addSuccProof);
  assert.equal(completed.state.goals.length, 0);
  check([], completed.proof(), addSuccType);
  assert.equal(original.state, before);
  assert.equal(original.state.goals.length, 1);
});

test('apply accepts concrete add_succ instances and partially applied proofs', () => {
  const n = succ(Zero);
  const m = succ(succ(Zero));
  const target = eq(Nat, addTerm(n, succ(m)), succ(addTerm(n, m)));
  for (const theorem of [addSuccProof, app(addSuccProof, n)]) {
    const completed = tacticSession(initialProofState(target)).apply(theorem);
    assert.equal(completed.state.goals.length, 0);
    check([], completed.proof(), target);
  }
});

test('apply retains explicit proof goals after inferring a beta-reduced dependent argument', () => {
  const theoremType = pi(Nat,
    app(lambda(Nat, pi(eq(Nat, variable(0), variable(0)), eq(Nat, variable(1), variable(1)))), variable(0)),
  );
  const target = eq(Nat, succ(Zero), succ(Zero));
  const context = [{ name: 'h', type: theoremType }];
  const applied = tacticSession({ goals: [{ context, type: target }] }).apply(variable(0, 'h'));
  assert.equal(applied.state.goals.length, 1);
  assert.deepEqual(applied.state.goals[0].type, target);
  check(context.map(entry => entry.type), applied.rfl().proof(), target);
});

test('apply permits an explicit argument erased by result-type beta reduction', () => {
  const theoremType = pi(Nat, app(lambda(Nat, Nat), variable(0)));
  const context = [{ name: 'h', type: theoremType }];
  const applied = tacticSession({ goals: [{ context, type: Nat }] }).apply(variable(0, 'h'));
  assert.equal(applied.state.goals.length, 1);
  assert.deepEqual(applied.state.goals[0].type, Nat);
  check(context.map(entry => entry.type), applied.exact(Zero).proof(), Nat);
});

test('apply rejects a conflicting add_succ endpoint without changing the session', () => {
  const target = pi(Nat, pi(Nat,
    eq(Nat, addTerm(variable(1), succ(variable(0))), succ(succ(addTerm(variable(1), variable(0))))),
  ));
  const session = tacticSession(initialProofState(target)).intro().intro();
  const before = session.state;
  assert.throws(() => session.apply(addSuccProof), TacticError);
  assert.equal(session.state, before);
  assert.equal(session.state.goals.length, 1);
});

test('apply checks inferred argument types before accepting an application', () => {
  const functionType = pi(Nat, Nat);
  const theorem = lambda(Nat, refl(functionType, lambda(Nat, variable(1))));
  const identity = lambda(Nat, variable(0));
  const target = eq(functionType, identity, identity);
  const session = tacticSession({ goals: [{ context: [{ name: 'A', type: Type }], type: target }] });
  const before = session.state;
  assert.throws(() => session.apply(theorem), /Type mismatch|Cannot infer metavariable \?m\d+ under a binder/);
  assert.equal(session.state, before);
});

test('apply rejects inferred arguments that escape the local scope', () => {
  const theorem = lambda(Nat, refl(Nat, variable(0)));
  const session = tacticSession(initialProofState(eq(Nat, variable(0), variable(0))));
  const before = session.state;
  assert.throws(() => session.apply(theorem), /Scope escape/);
  assert.equal(session.state, before);
});

test('apply rejects binder capture even when the inferred argument has the right type', () => {
  const functionType = pi(Nat, Nat);
  const constantFunction = lambda(Nat, variable(1));
  const theorem = lambda(Nat, refl(functionType, constantFunction));
  const identity = lambda(Nat, variable(0));
  const target = eq(functionType, identity, identity);
  const context = [{ name: 'n', type: Nat }];
  const session = tacticSession({ goals: [{ context, type: target }] });
  const before = session.state;
  assert.throws(() => session.apply(theorem), /result mismatch|Cannot infer metavariable \?m\d+ under a binder/);
  assert.equal(session.state, before);
  // The unchanged goal is valid and remains solvable by another tactic.
  check(context.map(entry => entry.type), session.rfl().proof(), target);
});
