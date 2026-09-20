import assert from 'node:assert/strict';
import test from 'node:test';
import { RealProofEngine, TACTICS, tacticSuggestionsForGoal } from '../src/ui/proof-engine';
import { Nat, Zero, eq, succ } from '../src/syntax/ast';

test('the real UI engine dispatches symmetry and completes through the Kernel', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('zero');

  const reversed = engine.runTactic('symmetry');

  assert.equal(reversed.kind, 'success');
  assert.equal(reversed.state.completed, false);
  assert.deepEqual(engine.tacticHistory(), ['symmetry']);
  const completed = engine.runTactic('rfl');
  assert.equal(completed.kind, 'success');
  assert.equal(completed.message, 'Proof accepted');
  assert.equal(completed.state.completed, true);
  assert.deepEqual(engine.tacticHistory(), ['symmetry', 'rfl']);
});

test('symmetry changes the displayed orientation and preserves the current context', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('add_zero');
  const introduced = engine.runTactic('intro');
  assert.equal(introduced.kind, 'success');
  const before = introduced.state.goals[0];

  const reversed = engine.runTactic('symmetry');

  assert.equal(reversed.kind, 'success');
  assert.equal(reversed.state.goals[0].target, 'n = n + 0');
  assert.deepEqual(reversed.state.goals[0].context, before.context);
  assert.equal(engine.displayProofState()?.goal, 'n = n + 0');
  const restored = engine.runTactic('symmetry');
  assert.equal(restored.kind, 'success');
  assert.equal(restored.state.goals[0].target, before.target);
});

test('invalid symmetry commands preserve UI state, history, and display', () => {
  const engine = new RealProofEngine();
  const before = engine.loadTheorem('identity');
  const display = engine.displayProofState();
  const history = engine.tacticHistory();

  for (const command of ['symmetry', 'symmetry h']) {
    const rejected = engine.runTactic(command);
    assert.equal(rejected.kind, 'error');
    assert.match(rejected.message!, /symmetry expected an equality goal|symmetry does not take an argument/);
    assert.deepEqual(rejected.state, before);
    assert.deepEqual(engine.displayProofState(), display);
    assert.deepEqual(engine.tacticHistory(), history);
  }
  assert.equal(engine.runTactic('intro').kind, 'success');
  assert.equal(engine.runTactic('symmetry').kind, 'success');
  assert.equal(engine.runTactic('rfl').state.completed, true);
});

test('symmetry is available as a tool and suggested for goals with different endpoints', () => {
  const tool = TACTICS.find(tactic => tactic.id === 'symmetry');
  assert.ok(tool);
  assert.equal(tool.syntax, 'symmetry');
  const suggestions = tacticSuggestionsForGoal({ context: [], type: eq(Nat, Zero, succ(Zero)) });
  assert.ok(suggestions.some(tactic => tactic.id === 'symmetry'));
  assert.equal(tacticSuggestionsForGoal({ context: [], type: Nat }).some(tactic => tactic.id === 'symmetry'), false);
  // Keep the existing concise recommendations for reflexive goals.
  const engine = new RealProofEngine();
  engine.loadTheorem('identity');
  assert.deepEqual(engine.tacticSuggestions().map(tactic => tactic.id), ['intro', 'exact', 'apply']);
  engine.runTactic('intro');
  assert.deepEqual(engine.tacticSuggestions().map(tactic => tactic.id), ['rfl', 'induction', 'exact', 'apply']);
});
