import assert from 'node:assert/strict';
import test from 'node:test';
import { definitionalEqual, shift } from '../src/kernel/reduction';
import { check, infer } from '../src/kernel/typecheck';
import { initialProofState } from '../src/proof/state';
import { tacticSession, TacticError } from '../src/proof/tactic';
import { Nat, Type, Zero, app, eq, lambda, pi, refl, variable } from '../src/syntax/ast';

test('symmetry swaps equality endpoints and preserves local context and case metadata', () => {
  const context = [
    { name: 'a', type: Nat },
    { name: 'b', type: Nat },
    { name: 'h', type: eq(Nat, variable(0, 'b'), variable(1, 'a')) },
  ];
  const target = eq(Nat, variable(2, 'a'), variable(1, 'b'));
  const session = tacticSession({ goals: [{ context, type: target, caseName: 'successor' }] });
  const before = session.state;
  const reversed = session.symmetry();

  assert.equal(session.state, before);
  assert.equal(reversed.state.goals.length, 1);
  assert.notEqual(reversed.currentGoal()?.id, session.currentGoal()?.id);
  assert.deepEqual(reversed.currentGoal()?.context, context);
  assert.equal(reversed.currentGoal()?.caseName, 'successor');
  assert.deepEqual(reversed.currentGoal()?.type, eq(Nat, variable(1, 'b'), variable(2, 'a')));
  assert.throws(() => reversed.proof(), /1 goal\(s\) remain/);
  const proof = reversed.assumption().proof();
  check(context.map(entry => entry.type), proof, target);
  assert.equal(proof.kind, 'App');
  assert.equal(proof.fn.kind, 'Lambda');
  assert.equal(proof.fn.body.kind, 'EqRec');
});

test('symmetry proves a polymorphic theorem after introducing dependent binders', () => {
  // (A : Type) (a b : A) (h : b = a) -> a = b
  const target = pi(Type,
    pi(variable(0, 'A'),
      pi(variable(1, 'A'),
        pi(eq(variable(2, 'A'), variable(0, 'b'), variable(1, 'a')),
          eq(variable(3, 'A'), variable(2, 'a'), variable(1, 'b')), 'h'), 'b'), 'a'), 'A');
  check([], target, Type);
  const completed = tacticSession(initialProofState(target))
    .intro().intro().intro().intro().symmetry().assumption();

  assert.equal(completed.state.goals.length, 0);
  const proof = completed.proof();
  check([], proof, target);
  assert.ok(definitionalEqual(infer([], proof), target));
});

test('symmetry works when the equality carrier depends on an outer local', () => {
  const context = [
    { name: 'P', type: pi(Nat, Type, 'n') },
    { name: 'n', type: Nat },
    { name: 'a', type: app(variable(1, 'P'), variable(0, 'n')) },
    { name: 'b', type: app(variable(2, 'P'), variable(1, 'n')) },
    { name: 'h', type: eq(app(variable(3, 'P'), variable(2, 'n')), variable(0, 'b'), variable(1, 'a')) },
  ];
  const target = eq(app(variable(4, 'P'), variable(3, 'n')), variable(2, 'a'), variable(1, 'b'));
  const types = context.map(entry => entry.type);
  check(types, target, Type);

  const proof = tacticSession({ goals: [{ context, type: target }] }).symmetry().assumption().proof();

  check(types, proof, target);
});

test('symmetry supports equality of functions without capturing their internal binders', () => {
  const identity = lambda(Nat, variable(0, 'x'), 'x');
  const target = eq(pi(Nat, Nat), identity, identity);

  const completed = tacticSession(initialProofState(target)).symmetry().rfl();

  check([], completed.proof(), target);
});

test('symmetry sees through computation in the target while proving the original target', () => {
  const context = [
    { name: 'n', type: Nat },
    { name: 'h', type: eq(Nat, Zero, variable(0, 'n')) },
  ];
  const target = app(lambda(Nat, eq(Nat, variable(0), Zero)), variable(1, 'n'));
  const reversed = tacticSession({ goals: [{ context, type: target }] }).symmetry();

  assert.deepEqual(reversed.currentGoal()?.type, eq(Nat, Zero, variable(1, 'n')));
  check(context.map(entry => entry.type), reversed.assumption().proof(), target);
});

test('two symmetry steps restore the original orientation and still produce a valid proof', () => {
  const context = [
    { name: 'A', type: Type },
    { name: 'B', type: Type },
    { name: 'h', type: eq(Type, variable(1, 'A'), variable(0, 'B')) },
  ];
  const target = eq(Type, variable(2, 'A'), variable(1, 'B'));
  const restored = tacticSession({ goals: [{ context, type: target }] }).symmetry().symmetry();

  assert.deepEqual(restored.currentGoal()?.type, target);
  check(context.map(entry => entry.type), restored.assumption().proof(), target);
});

test('symmetry transforms only the focused goal in a multi-goal proof', () => {
  const context = [
    { name: 'a', type: Nat },
    { name: 'b', type: Nat },
    { name: 'h', type: eq(Nat, variable(0, 'b'), variable(1, 'a')) },
  ];
  const premise = eq(Nat, variable(2, 'a'), variable(1, 'b'));
  const target = eq(Nat, Zero, Zero);
  const theorem = lambda(premise, lambda(shift(premise, 1), refl(Nat, Zero)));
  const pending = tacticSession({ goals: [{ context, type: target }] }).apply(theorem);
  const first = pending.state.goals[0];
  const second = pending.state.goals[1];
  assert.equal(pending.state.goals.length, 2);

  const reversed = pending.focusGoal(second.id!).symmetry();

  assert.deepEqual(reversed.state.goals[0], first);
  assert.equal(reversed.state.focusedGoalId, reversed.state.goals[1].id);
  assert.deepEqual(reversed.currentGoal()?.type, eq(Nat, variable(1, 'b'), variable(2, 'a')));
  const remaining = reversed.assumption();
  assert.equal(remaining.currentGoal()?.id, first.id);
  const completed = remaining.symmetry().assumption();
  assert.equal(completed.state.goals.length, 0);
  check(context.map(entry => entry.type), completed.proof(), target);
});

test('symmetry rejects non-equality and invalid equality goals without changing the session', () => {
  for (const target of [Nat, eq(Nat, Zero, Type)]) {
    const session = tacticSession(initialProofState(target));
    const before = session.state;

    assert.throws(() => session.symmetry(), TacticError);

    assert.equal(session.state, before);
    assert.equal(session.currentGoal()?.type, target);
  }
  const completed = tacticSession(initialProofState(eq(Nat, Zero, Zero))).rfl();
  assert.throws(() => completed.symmetry(), /No goals remain/);
  check([], completed.proof(), eq(Nat, Zero, Zero));
});
