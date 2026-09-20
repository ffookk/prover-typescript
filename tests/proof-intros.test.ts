import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { tacticSession, TacticSession } from '../src/proof/tactic';
import { Nat, Type, Zero, app, lambda, pi, variable } from '../src/syntax/ast';
import { RealProofEngine } from '../src/ui/proof-engine';

test('intros introduces dependent binders and preserves the original proof target', () => {
  const target = pi(Type, pi(variable(0), variable(1), 'value'), 'A');
  const session = tacticSession({ goals: [{ context: [], type: target, caseName: 'case' }] });
  const introduced = session.intros();
  assert.equal(session.currentGoal()?.type, target);
  assert.deepEqual(introduced.currentGoal()?.context.map(entry => entry.name), ['A', 'value']);
  assert.equal(introduced.currentGoal()?.caseName, 'case');
  check([], introduced.assumption().proof(), target);
});

test('intros sees function binders exposed by definitional reduction', () => {
  const target = pi(Nat, app(lambda(Nat, pi(Nat, Nat, 'second')), Zero), 'first');
  const introduced = tacticSession({ goals: [{ context: [], type: target }] }).intros();
  assert.equal(introduced.currentGoal()?.context.length, 2);
  assert.deepEqual(introduced.currentGoal()?.type, Nat);
  check([], introduced.exact(Zero).proof(), target);
});

test('intros changes only the focused premise', () => {
  const context = [{ name: 'f', type: pi(Nat, pi(pi(Nat, Nat, 'x'), Nat)) }];
  const applied = tacticSession({ goals: [{ context, type: Nat }] }).apply(variable(0, 'f'));
  const first = applied.state.goals[0];
  const second = applied.state.goals[1];
  const introduced = applied.focusGoal(second.id!).intros();
  assert.deepEqual(introduced.state.goals[0], first);
  assert.equal(introduced.currentGoal()?.context.length, 2);
  const completed = introduced.exact(Zero).exact(Zero);
  check(context.map(entry => entry.type), completed.proof(), Nat);
});

test('intros rejects non-function and completed goals without changing the session', () => {
  const session = tacticSession({ goals: [{ context: [], type: Nat }] });
  const before = session.state;
  assert.throws(() => session.intros(), /intro expected a function goal/);
  assert.equal(session.state, before);
  const completed = session.exact(Zero);
  assert.throws(() => completed.intros(), /No goals remain/);
  check([], completed.proof(), Nat);
});

test('the real engine records intros as one command and accepts the completed proof', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('assumption');
  const internals = engine as unknown as { session: TacticSession };
  const target = internals.session.currentGoal()!.type;
  const introduced = engine.runTactic('intros');
  assert.equal(introduced.kind, 'success');
  assert.equal(introduced.state.goals[0].context.length, 2);
  assert.deepEqual(engine.tacticHistory(), ['intros']);
  assert.equal(engine.runTactic('assumption').state.completed, true);
  check([], internals.session.proof(), target);
});

test('intros rejects arguments and preserves the engine state and history', () => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem('identity');
  const rejected = engine.runTactic('intros n');
  assert.equal(rejected.kind, 'error');
  assert.deepEqual(rejected.state, initial);
  assert.deepEqual(engine.tacticHistory(), []);
  assert.equal(engine.runTactic('intro').kind, 'success');
  assert.equal(engine.runTactic('intros').kind, 'error');
  assert.deepEqual(engine.tacticHistory(), ['intro']);
  assert.equal(engine.runTactic('rfl').state.completed, true);
});
