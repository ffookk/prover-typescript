import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { tacticSession } from '../src/proof/tactic';
import { Nat, Type, Zero, pi, variable } from '../src/syntax/ast';

test('apply preserves the case label on each generated premise and the completed proof', () => {
  const context = [{ name: 'f', type: pi(Nat, pi(Nat, Nat)) }];
  const session = tacticSession({ goals: [{ context, type: Nat, caseName: 'successor' }] });
  const before = session.state;

  const applied = session.apply(variable(0, 'f'));

  assert.equal(session.state, before);
  assert.equal(applied.state.goals.length, 2);
  assert.deepEqual(applied.state.goals.map(goal => goal.caseName), ['successor', 'successor']);
  const firstId = applied.state.goals[0].id!;
  const secondId = applied.state.goals[1].id!;
  const remaining = applied.focusGoal(secondId).exact(Zero);
  assert.equal(remaining.currentGoal()?.id, firstId);
  assert.equal(remaining.currentGoal()?.caseName, 'successor');
  const completed = remaining.exact(Zero);
  check(context.map(entry => entry.type), completed.proof(), Nat);
});

test('apply leaves unlabelled goals unlabelled', () => {
  const context = [{ name: 'f', type: pi(Nat, Nat) }];
  const applied = tacticSession({ goals: [{ context, type: Nat }] }).apply(variable(0, 'f'));

  assert.equal(applied.currentGoal()?.caseName, undefined);
  check(context.map(entry => entry.type), applied.exact(Zero).proof(), Nat);
});

test('a rejected apply preserves the original case, goal, and focus', () => {
  const context = [{ name: 'f', type: pi(Nat, Nat) }];
  const session = tacticSession({ goals: [{ context, type: Type, caseName: 'base' }] });
  const before = session.state;

  assert.throws(() => session.apply(variable(0, 'f')), /Cannot unify|result mismatch/);

  assert.equal(session.state, before);
  assert.equal(session.currentGoal()?.caseName, 'base');
  assert.equal(session.currentGoal()?.id, before.focusedGoalId);
  check(context.map(entry => entry.type), session.exact(Nat).proof(), Type);
});
