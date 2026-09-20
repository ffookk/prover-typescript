import assert from 'node:assert/strict';
import test from 'node:test';
import { TacticSession } from '../src/proof/tactic';
import { MockProofEngine, RealProofEngine, type ProofEngine } from '../src/ui/proof-engine';
import { EXERCISES, initialLessonProgress, isCompleted, recordProofResult, removeExerciseCompletion } from '../src/ui/tutorial';

test('undo restores the initial real goal and removes the successful tactic from history', () => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem('identity');
  assert.equal(engine.canUndo(), false);
  assert.equal(engine.undo().kind, 'error');
  const introduced = engine.runTactic('intro');
  assert.equal(introduced.kind, 'success');
  assert.equal(introduced.state.goals[0].context.length, 1);
  assert.equal(engine.canUndo(), true);

  const undone = engine.undo();

  assert.equal(undone.kind, 'success');
  assert.deepEqual(undone.state, initial);
  assert.deepEqual(engine.tacticHistory(), []);
  assert.equal(engine.canUndo(), false);
  assert.deepEqual(engine.undo().state, initial);
  assert.equal(engine.runTactic('intro').kind, 'success');
  assert.equal(engine.runTactic('rfl').state.completed, true);
});

test('a completed proof can be undone, retried, and undone back to its original goal', () => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem('identity');
  const introduced = engine.runTactic('intro').state;
  assert.equal(engine.runTactic('rfl').state.completed, true);
  assert.equal(engine.runTactic('rfl').kind, 'error');

  const undone = engine.undo();

  assert.equal(undone.kind, 'success');
  assert.deepEqual(undone.state, introduced);
  assert.deepEqual(engine.tacticHistory(), ['intro']);
  assert.equal(engine.canUndo(), true);
  assert.equal(engine.runTactic('rfl').message, 'Proof accepted');
  assert.deepEqual(engine.undo().state, introduced);
  assert.deepEqual(engine.undo().state, initial);
  assert.equal(engine.canUndo(), false);
});

test('undo restores multiple goals, their IDs, and the focused case for the next tactic', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('add_zero');
  const introduced = engine.runTactic('intro').state;
  const cases = engine.runTactic('induction n').state;
  const baseDisplay = engine.displayProofState();
  assert.equal(cases.goals.length, 2);
  const afterBase = engine.runTactic('rfl').state;
  assert.equal(afterBase.goals.length, 1);
  assert.equal(afterBase.goals[0].id, cases.goals[1].id);

  assert.deepEqual(engine.undo().state, cases);
  assert.deepEqual(engine.displayProofState(), baseDisplay);
  assert.deepEqual(engine.tacticHistory(), ['intro', 'induction n']);
  assert.deepEqual(engine.runTactic('rfl').state, afterBase);
  assert.deepEqual(engine.undo().state, cases);
  assert.deepEqual(engine.undo().state, introduced);
});

test('failed tactics do not add an undo step or discard earlier successful steps', () => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem('identity');
  assert.equal(engine.runTactic('not_a_tactic').kind, 'error');
  assert.equal(engine.runTactic(' ').kind, 'error');
  assert.equal(engine.canUndo(), false);
  engine.runTactic('intro');
  assert.equal(engine.runTactic('exact Nat').kind, 'error');
  assert.deepEqual(engine.tacticHistory(), ['intro']);
  assert.deepEqual(engine.undo().state, initial);
  assert.equal(engine.canUndo(), false);
});

test('a failed final proof check leaves the session and undo stack unchanged', t => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem('identity');
  const introduced = engine.runTactic('intro').state;
  const extraction = t.mock.method(TacticSession.prototype, 'proof', () => {
    throw new Error('Injected final proof failure');
  });

  const rejected = engine.runTactic('rfl');

  assert.equal(rejected.kind, 'error');
  assert.deepEqual(rejected.state, introduced);
  assert.deepEqual(engine.tacticHistory(), ['intro']);
  assert.deepEqual(engine.undo().state, initial);
  assert.equal(engine.canUndo(), false);
  extraction.mock.restore();
  assert.equal(engine.runTactic('intro').kind, 'success');
  assert.equal(engine.runTactic('rfl').message, 'Proof accepted');
});

test('loading or reloading a theorem resets the undo stack and history', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('identity');
  engine.runTactic('intro');
  const reloaded = engine.loadTheorem('identity');
  assert.equal(engine.canUndo(), false);
  assert.deepEqual(engine.undo().state, reloaded);
  assert.deepEqual(engine.tacticHistory(), []);
  engine.runTactic('intro');
  engine.runTactic('rfl');
  const selected = engine.loadTheorem('zero');
  assert.equal(engine.canUndo(), false);
  assert.deepEqual(engine.undo().state, selected);
  assert.equal(engine.runTactic('rfl').message, 'Proof accepted');
});

test('returned undo views and history cannot mutate stored proof snapshots', () => {
  const engine = new RealProofEngine();
  const initial = engine.loadTheorem('identity');
  const introduced = engine.runTactic('intro').state;
  const expected = structuredClone(introduced);
  introduced.goals[0].context[0].name = 'changed';
  engine.tacticHistory().push('changed');
  engine.runTactic('rfl');

  const undone = engine.undo();

  assert.deepEqual(undone.state, expected);
  undone.state.goals[0].context[0].type = 'changed';
  assert.deepEqual(engine.tacticHistory(), ['intro']);
  assert.equal(engine.runTactic('rfl').message, 'Proof accepted');
  assert.deepEqual(engine.undo().state, expected);
  assert.deepEqual(engine.undo().state, initial);
});

test('the Mock implementation supports the same undo and reset contract', () => {
  const engine: ProofEngine = new MockProofEngine();
  const initial = engine.loadTheorem('n_plus_zero');
  assert.equal(engine.canUndo(), false);
  assert.equal(engine.runTactic('rfl').kind, 'error');
  assert.equal(engine.canUndo(), false);
  const introduced = engine.runTactic('intro').state;
  assert.equal(engine.runTactic('rfl').state.completed, true);
  assert.deepEqual(engine.tacticHistory(), ['intro', 'rfl']);
  assert.deepEqual(engine.undo().state, introduced);
  assert.deepEqual(engine.tacticHistory(), ['intro']);
  assert.deepEqual(engine.undo().state, initial);
  assert.equal(engine.undo().kind, 'error');
  engine.runTactic('intro');
  engine.loadTheorem('zero');
  assert.equal(engine.canUndo(), false);
  assert.deepEqual(engine.tacticHistory(), []);
});

test('undoing completion revokes only the current exercise and retry restores it', () => {
  const engine = new RealProofEngine();
  const zero = EXERCISES.find(exercise => exercise.id === 'numbers.zero_eq_zero')!;
  const identity = EXERCISES.find(exercise => exercise.id === 'numbers.identity')!;
  let progress = initialLessonProgress();
  engine.loadTheorem(zero.theoremId);
  progress = recordProofResult(progress, zero, engine.runTactic('rfl'));
  engine.loadTheorem(identity.theoremId);
  engine.runTactic('intro');
  progress = recordProofResult(progress, identity, engine.runTactic('rfl'));
  const completed = progress;

  assert.equal(engine.undo().kind, 'success');
  progress = removeExerciseCompletion(progress, identity.id);

  assert.equal(isCompleted(progress, zero.id), true);
  assert.equal(isCompleted(progress, identity.id), false);
  assert.deepEqual(progress.completedTheorems, [zero.id]);
  assert.equal(isCompleted(completed, identity.id), true);
  progress = recordProofResult(progress, identity, engine.runTactic('rfl'));
  assert.deepEqual(progress.completedExercises, [zero.id, identity.id]);
});

test('completion removal uses exercise IDs even when exercises share a theorem', () => {
  const ids = ['addition.add_zero', 'induction.add_zero'];
  const progress = { completedExercises: ids, completedTheorems: ids };

  const updated = removeExerciseCompletion(progress, ids[1]);

  assert.deepEqual(updated.completedExercises, [ids[0]]);
  assert.deepEqual(updated.completedTheorems, [ids[0]]);
  assert.deepEqual(progress.completedExercises, ids);
  assert.equal(removeExerciseCompletion(updated, 'unknown'), updated);
});
