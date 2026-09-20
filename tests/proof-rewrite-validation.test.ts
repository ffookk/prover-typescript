import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { tacticSession, TacticError } from '../src/proof/tactic';
import { Nat, Type, app, eq, pi, variable } from '../src/syntax/ast';

for (const reflexive of [false, true]) {
  test(`rewrite rejects an invalid dependent motive before changing the goal (${reflexive ? 'reflexive' : 'distinct'} endpoints)`, () => {
    // x : P a cannot be reused at type P b. Even if h : a = a, the
    // abstracted motive fun n => Eq (P n) x x is not well typed.
    const context = [
      { name: 'P', type: pi(Nat, Type, 'n') },
      { name: 'a', type: Nat },
      { name: 'b', type: Nat },
      { name: 'h', type: eq(Nat, variable(1, 'a'), variable(reflexive ? 1 : 0)) },
      { name: 'x', type: app(variable(3, 'P'), variable(2, 'a')) },
    ];
    const target = eq(app(variable(4, 'P'), variable(3, 'a')), variable(0, 'x'), variable(0, 'x'));
    const types = context.map(entry => entry.type);
    check(types, target, Type);
    const session = tacticSession({ goals: [{ context, type: target }] });
    const before = session.state;

    assert.throws(() => session.rewrite(variable(1, 'h')), error =>
      error instanceof TacticError && /rewrite produced an invalid dependent motive/.test(error.message));
    assert.equal(session.state, before);
    assert.equal(session.currentGoal()?.type, target);
    check(types, session.rfl().proof(), target);
  });
}

test('rewrite accepts a dependent Pi motive and the completed proof checks against the original target', () => {
  const context = [
    { name: 'P', type: pi(Nat, Type, 'n') },
    { name: 'a', type: Nat },
    { name: 'b', type: Nat },
    { name: 'h', type: eq(Nat, variable(1, 'a'), variable(0, 'b')) },
  ];
  // Here x is bound inside the target, so its type changes along with P a.
  const target = pi(
    app(variable(3, 'P'), variable(2, 'a')),
    eq(app(variable(4, 'P'), variable(3, 'a')), variable(0, 'x'), variable(0, 'x')),
    'x',
  );
  const rewrittenTarget = pi(
    app(variable(3, 'P'), variable(1, 'b')),
    eq(app(variable(4, 'P'), variable(2, 'b')), variable(0, 'x'), variable(0, 'x')),
    'x',
  );
  const types = context.map(entry => entry.type);
  check(types, target, Type);
  const rewritten = tacticSession({ goals: [{ context, type: target }] }).rewrite(variable(0, 'h'));
  assert.deepEqual(rewritten.currentGoal()?.type, rewrittenTarget);
  const completed = rewritten.intro().rfl();
  assert.equal(completed.state.goals.length, 0);
  check(types, completed.proof(), target);
});
