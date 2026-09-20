import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { definitionalEqual } from '../src/kernel/reduction';
import { tacticSession, TacticSession } from '../src/proof/tactic';
import { Nat, Type, Zero, app, eq, pi, variable } from '../src/syntax/ast';
import { RealProofEngine } from '../src/ui/proof-engine';

const context = [
  { name: 'a', type: Nat },
  { name: 'b', type: Nat },
  { name: 'h', type: eq(Nat, variable(1), variable(0)) },
];

test('reverse rewrite replaces the right endpoint and Kernel-checks the original goal', () => {
  const target = eq(Nat, variable(1, 'b'), variable(1, 'b'));
  const original = tacticSession({ goals: [{ context, type: target, caseName: 'case' }] });
  const rewritten = original.rewrite(variable(0, 'h'), true);
  assert.ok(definitionalEqual(rewritten.currentGoal()!.type, eq(Nat, variable(2), variable(2))));
  assert.equal(rewritten.currentGoal()?.caseName, 'case');
  assert.deepEqual(original.currentGoal()?.type, target);
  check(context.map(entry => entry.type), rewritten.rfl().proof(), target);
});

test('reverse rewrite works over an arbitrary type in a dependent context', () => {
  const polymorphic = [
    { name: 'A', type: Type },
    { name: 'a', type: variable(0) },
    { name: 'b', type: variable(1) },
    { name: 'h', type: eq(variable(2), variable(1), variable(0)) },
  ];
  const target = eq(variable(3), variable(1), variable(1));
  const rewritten = tacticSession({ goals: [{ context: polymorphic, type: target }] }).rewrite(variable(0), true);
  assert.ok(definitionalEqual(rewritten.currentGoal()!.type, eq(variable(3), variable(2), variable(2))));
  check(polymorphic.map(entry => entry.type), rewritten.rfl().proof(), target);
});

test('reverse rewrite transports function goals with dependent domains', () => {
  const dependent = [{ name: 'P', type: pi(Nat, Type) }, ...context];
  const target = pi(app(variable(3, 'P'), variable(1, 'b')), Nat, 'value');
  const rewritten = tacticSession({ goals: [{ context: dependent, type: target }] }).rewrite(variable(0), true);
  assert.ok(definitionalEqual(rewritten.currentGoal()!.type, pi(app(variable(3), variable(2)), Nat)));
  check(dependent.map(entry => entry.type), rewritten.intro().exact(Zero).proof(), target);
});

test('reverse rewrite failures preserve the session and forward rewriting remains available', () => {
  const target = eq(Nat, variable(2), variable(2));
  const original = tacticSession({ goals: [{ context, type: target }] });
  const before = original.state;
  assert.throws(() => original.rewrite(variable(0), true), /rewrite found no match/);
  assert.throws(() => original.rewrite(Zero, true), /expected an equality proof/);
  assert.equal(original.state, before);
  check(context.map(entry => entry.type), original.rewrite(variable(0)).rfl().proof(), target);
});

test('the real engine can reverse a previous rewrite and finish its original theorem', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('equality_rewrite');
  const internals = engine as unknown as { session: TacticSession };
  const target = internals.session.currentGoal()!.type;
  for (let index = 0; index < 4; index++) assert.equal(engine.runTactic('intro').kind, 'success');
  const before = engine.displayProofState();
  assert.equal(engine.runTactic('rewrite h').kind, 'success');
  assert.equal(engine.runTactic('rewrite <- h').kind, 'success');
  assert.deepEqual(engine.displayProofState(), before);
  assert.equal(engine.runTactic('rfl').state.completed, true);
  check([], internals.session.proof(), target);
  assert.ok(engine.tacticHistory().includes('rewrite <- h'));
});

test('missing and invalid reverse rewrite arguments leave the real engine unchanged', () => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem('zero');
  for (const command of ['rewrite <-', 'rewrite <- missing', 'rewrite <- 0']) {
    const rejected = engine.runTactic(command);
    assert.equal(rejected.kind, 'error');
    assert.deepEqual(rejected.state, initial);
    assert.deepEqual(engine.tacticHistory(), []);
  }
  assert.equal(engine.runTactic('rfl').state.completed, true);
});
