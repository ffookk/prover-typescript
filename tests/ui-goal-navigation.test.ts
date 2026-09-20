import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { TacticSession } from '../src/proof/tactic';
import { RealProofEngine } from '../src/ui/proof-engine';

function twoGoals() {
  const engine = new RealProofEngine();
  engine.loadTheorem('identity');
  const internals = engine as unknown as { session: TacticSession };
  const target = internals.session.currentGoal()!.type;
  assert.equal(engine.runTactic('intro').kind, 'success');
  const split = engine.runTactic('induction n');
  assert.equal(split.kind, 'success');
  assert.equal(split.state.goals.length, 2);
  return { engine, internals, target, ids: split.state.goals.map(goal => goal.id) };
}

test('next and previous wrap focus while preserving internal goal order and identities', () => {
  const { engine, internals, ids } = twoGoals();
  for (const [command, expected] of [['next', ids[1]], ['next', ids[0]], ['previous', ids[1]], ['previous', ids[0]]]) {
    const moved = engine.runTactic(command);
    assert.equal(moved.kind, 'success');
    assert.equal(moved.state.goals[0].id, expected);
    assert.equal(String(internals.session.state.focusedGoalId), expected);
    assert.deepEqual(internals.session.state.goals.map(goal => String(goal.id)), ids);
    assert.equal(moved.state.goals[0].target, engine.displayProofState()?.goal);
  }
  assert.deepEqual(engine.tacticHistory(), ['intro', 'induction n', 'next', 'next', 'previous', 'previous']);
});

test('navigation lets the successor goal be proved before the base case', () => {
  const { engine, internals, target, ids } = twoGoals();
  assert.equal(engine.runTactic('next').state.goals[0].id, ids[1]);
  const successor = engine.runTactic('rfl');
  assert.equal(successor.kind, 'success');
  assert.equal(successor.state.goals[0].id, ids[0]);
  assert.equal(engine.runTactic('rfl').state.completed, true);
  check([], internals.session.proof(), target);
});

test('navigation rejects arguments without changing focus or history', () => {
  const { engine, internals } = twoGoals();
  const previous = internals.session;
  const history = engine.tacticHistory();
  for (const command of ['next 2', 'previous extra']) {
    assert.equal(engine.runTactic(command).kind, 'error');
    assert.equal(internals.session, previous);
    assert.deepEqual(engine.tacticHistory(), history);
  }
});

test('one-goal navigation is stable and completed proofs reject navigation', () => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem('zero');
  for (const command of ['next', 'previous', 'NEXT']) {
    assert.deepEqual(engine.runTactic(command).state, initial);
  }
  assert.equal(engine.runTactic('rfl').state.completed, true);
  const history = engine.tacticHistory();
  for (const command of ['next', 'previous']) {
    const result = engine.runTactic(command);
    assert.equal(result.kind, 'error');
    assert.equal(result.state.completed, true);
    assert.deepEqual(engine.tacticHistory(), history);
  }
});
