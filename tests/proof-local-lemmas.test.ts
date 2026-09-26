import assert from 'node:assert/strict';
import test from 'node:test';
import { shift } from '../src/kernel/reduction';
import { check } from '../src/kernel/typecheck';
import { initialProofState } from '../src/proof/state';
import { tacticSession } from '../src/proof/tactic';
import { Nat, Type, Zero, app, eq, lambda, pi, variable } from '../src/syntax/ast';

test('have creates an isolated obligation and a shifted continuation without mutating its input', () => {
  const context = [{ name: 'n', type: Nat }];
  const target = eq(Nat, variable(0, 'n'), variable(0, 'n'));
  const original = tacticSession({ goals: [{ context, type: target, caseName: 'branch' }] });
  const before = original.state;
  const next = original.have('h', target);
  const [lemma, continuation] = next.state.goals;
  assert.equal(original.state, before);
  assert.equal(original.state.goals.length, 1);
  assert.deepEqual(lemma.context, context);
  assert.equal(lemma.type, target);
  assert.equal(lemma.caseName, 'have h');
  assert.deepEqual(continuation.context, [...context, { name: 'h', type: target }]);
  assert.deepEqual(continuation.type, shift(target, 1));
  assert.equal(continuation.caseName, 'branch');
  assert.equal(next.state.focusedGoalId, lemma.id);
  assert.notEqual(lemma.id, continuation.id);
});

test('a proved local lemma is available in the continuation and compiles to checked application', () => {
  const target = eq(Nat, Zero, Zero);
  const session = tacticSession(initialProofState(target)).have('h', target).rfl().assumption();
  const proof = session.proof();
  assert.equal(proof.kind, 'App');
  check([], proof, target);
});

test('solving the continuation first cannot discharge the outstanding local lemma', () => {
  const target = eq(Nat, Zero, Zero);
  const split = tacticSession(initialProofState(target)).have('h', target);
  const [lemma, continuation] = split.state.goals;
  const pending = split.focusGoal(continuation.id!).assumption();
  assert.deepEqual(pending.state.goals.map((goal) => goal.id), [lemma.id]);
  assert.equal(pending.currentGoal()?.context.length, 0);
  assert.throws(() => pending.proof(), /1 goal\(s\) remain/);
  check([], pending.rfl().proof(), target);
});

test('an immediate proof creates only the continuation and checks the declared type', () => {
  const session = tacticSession(initialProofState(Nat)).have('answer', Nat, Zero);
  assert.equal(session.state.goals.length, 1);
  assert.equal(session.currentGoal()?.context[0].name, 'answer');
  check([], session.exact(variable(0, 'answer')).proof(), Nat);
});

test('nested local lemmas preserve types and values beneath introduced dependent binders', () => {
  const target = pi(Type, pi(variable(0, 'A'), variable(1, 'A'), 'x'), 'A');
  const session = tacticSession(initialProofState(target)).intro().intro()
    .have('first', variable(1, 'A'), variable(0, 'x'))
    .have('second', variable(2, 'A'), variable(0, 'first'))
    .assumption();
  check([], session.proof(), target);
});

test('a local lemma obligation can itself contain an immediate local lemma', () => {
  const session = tacticSession(initialProofState(Nat)).have('a', Nat)
    .have('b', Nat, Zero).exact(variable(0, 'b')).exact(variable(0, 'a'));
  check([], session.proof(), Nat);
});

test('local lemmas preserve a nonempty context with dependent types and a predicate', () => {
  const context = [
    { name: 'A', type: Type },
    { name: 'a', type: variable(0, 'A') },
    { name: 'P', type: pi(variable(1, 'A'), Type, 'x') },
    { name: 'h', type: app(variable(0, 'P'), variable(1, 'a')) },
  ];
  const target = app(variable(1, 'P'), variable(2, 'a'));
  const session = tacticSession({ goals: [{ context, type: target }] })
    .have('copy', target, variable(0, 'h')).assumption();
  check(context.map((entry) => entry.type), session.proof(), target);
});

test('a functional local lemma can be applied to generate a new argument goal', () => {
  const identity = lambda(Nat, variable(0, 'x'), 'x');
  const session = tacticSession(initialProofState(Nat))
    .have('id', pi(Nat, Nat, 'x'), identity).apply(variable(0, 'id')).exact(Zero);
  check([], session.proof(), Nat);
});

test('have only replaces the focused goal and leaves sibling identities and contexts unchanged', () => {
  const context = [{ name: 'f', type: pi(Nat, pi(Nat, Nat, 'b'), 'a') }];
  const split = tacticSession({ goals: [{ context, type: Nat }] }).apply(variable(0, 'f'));
  const [first, second] = split.state.goals;
  const next = split.focusGoal(second.id!).have('value', Nat, Zero);
  assert.deepEqual(next.state.goals[0], first);
  assert.equal(next.currentGoal()?.context.length, 2);
  const remaining = next.exact(variable(0, 'value'));
  assert.equal(remaining.state.focusedGoalId, first.id);
  assert.deepEqual(remaining.currentGoal()?.context, context);
  check(context.map((entry) => entry.type), remaining.exact(Zero).proof(), Nat);
});

test('local lemmas preserve the base and successor branches of an induction', () => {
  const target = pi(Nat, eq(Nat, Zero, Zero), 'n');
  const split = tacticSession(initialProofState(target)).intro().induction('n');
  const successorId = split.state.goals[1].id;
  const base = split.have('zero', Nat, Zero);
  assert.equal(base.currentGoal()?.caseName, 'base');
  assert.equal(base.state.goals[1].id, successorId);
  const successor = base.rfl();
  assert.equal(successor.currentGoal()?.caseName, 'successor');
  const complete = successor.have('copy', Nat, variable(1, 'n')).rfl();
  check([], complete.proof(), target);
});

test('invalid local lemma types and proofs leave the session, goal identity and focus unchanged', () => {
  const original = tacticSession(initialProofState(Nat));
  const before = original.state;
  for (const attempt of [
    () => original.have('h', Zero),
    () => original.have('h', lambda(Nat, variable(0))),
    () => original.have('h', variable(0)),
    () => original.have('h', Nat, Type),
    () => original.have('h', Nat, variable(0)),
  ]) {
    assert.throws(attempt, /Type mismatch|Unbound variable/);
    assert.equal(original.state, before);
    assert.equal(original.state.goals[0].id, before.goals[0].id);
    assert.equal(original.state.focusedGoalId, before.focusedGoalId);
  }
});

test('local lemma names must be fresh, non-reserved surface identifiers', () => {
  const original = tacticSession({ goals: [{ context: [{ name: 'h', type: Nat }], type: Nat }] });
  for (const name of ['', ' h ', 'two words', '0h', 'h-x', 'Type', 'Nat', 'Succ', 'Eq', 'Refl', 'h']) {
    assert.throws(() => original.have(name, Nat, Zero), /identifier|already exists/);
    assert.equal(original.state.goals.length, 1);
  }
  assert.equal(original.have("h_2'", Nat, Zero).currentGoal()?.context[1].name, "h_2'");
});

test('have cannot introduce a binding after all goals are solved', () => {
  const complete = tacticSession(initialProofState(Nat)).exact(Zero);
  assert.throws(() => complete.have('h', Nat, Zero), /No goals remain/);
  check([], complete.proof(), Nat);
});
