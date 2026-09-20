import assert from 'node:assert/strict';
import test from 'node:test';
import { MockProofEngine, RealProofEngine } from '../src/ui/proof-engine';

const inheritedNames = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__'];

test('real theorem lookup treats inherited names as missing and remains usable', () => {
  for (const id of inheritedNames) {
    const engine = new RealProofEngine();
    engine.loadTheorem('identity');
    assert.equal(engine.runTactic('intro').kind, 'success');

    const fallback = engine.loadTheorem(id);

    assert.equal(fallback.theoremName, 'zero');
    assert.equal(fallback.completed, false);
    assert.equal(fallback.goals.length, 1);
    assert.equal(fallback.goals[0].target, '0 = 0');
    assert.deepEqual(fallback.goals[0].context, []);
    assert.deepEqual(engine.tacticHistory(), []);
    assert.deepEqual(engine.displayProofState(), { props: [], goal: '0 = 0' });
    assert.ok(engine.tacticSuggestions().some(tactic => tactic.id === 'rfl'));
    const proof = engine.runTactic('rfl');
    assert.equal(proof.kind, 'success');
    assert.equal(proof.message, 'Proof accepted');
    assert.equal(proof.state.completed, true);
  }
});

test('mock theorem lookup treats inherited names as missing and starts a fresh proof', () => {
  for (const id of inheritedNames) {
    const engine = new MockProofEngine();
    engine.loadTheorem('n_plus_zero');
    assert.equal(engine.runTactic('intro').state.goals[0].target, '0 = 0');

    const fallback = engine.loadTheorem(id);

    assert.equal(fallback.theoremName, 'n_plus_zero');
    assert.equal(fallback.completed, false);
    assert.equal(fallback.goals[0].target, 'n + 0 = n');
    assert.deepEqual(fallback.goals[0].context, [{ name: 'n', type: 'Nat' }]);
    assert.deepEqual(engine.tacticHistory(), []);
    assert.equal(engine.runTactic('rfl').kind, 'error');
    assert.equal(engine.runTactic('intro').kind, 'success');
    assert.equal(engine.runTactic('rfl').state.completed, true);
  }
});

test('ordinary missing names keep the established Real and Mock fallback behavior', () => {
  for (const id of ['', 'missing-theorem', 'not-a-theorem']) {
    const real = new RealProofEngine();
    assert.equal(real.loadTheorem(id).theoremName, 'zero');
    assert.equal(real.runTactic('rfl').message, 'Proof accepted');
    const mock = new MockProofEngine();
    assert.equal(mock.loadTheorem(id).theoremName, 'n_plus_zero');
    assert.equal(mock.runTactic('intro').kind, 'success');
    assert.equal(mock.runTactic('rfl').state.completed, true);
  }
});

test('registered theorem names still load their own goals and can be proved', () => {
  const real = new RealProofEngine();
  const identity = real.loadTheorem('identity');
  assert.equal(identity.theoremName, 'identity');
  assert.equal(identity.goals[0].target, '(n : Nat) → n = n');
  assert.equal(real.runTactic('intro').kind, 'success');
  assert.equal(real.runTactic('rfl').state.completed, true);
  assert.equal(real.loadTheorem('zero').theoremName, 'zero');
  assert.equal(real.runTactic('rfl').state.completed, true);

  const mock = new MockProofEngine();
  assert.equal(mock.loadTheorem('identity').theoremName, 'identity');
  assert.equal(mock.runTactic('rfl').state.completed, true);
  assert.equal(mock.loadTheorem('zero').theoremName, 'zero');
  assert.equal(mock.runTactic('rfl').state.completed, true);
});

test('loading an inherited name after completion resets completion before the fallback proof', () => {
  for (const Engine of [RealProofEngine, MockProofEngine]) {
    const engine = new Engine();
    engine.loadTheorem('zero');
    assert.equal(engine.runTactic('rfl').state.completed, true);

    const fallback = engine.loadTheorem('constructor');

    assert.equal(fallback.completed, false);
    assert.equal(fallback.goals.length, 1);
    assert.deepEqual(engine.tacticHistory(), []);
    if (engine instanceof MockProofEngine) assert.equal(engine.runTactic('intro').kind, 'success');
    assert.equal(engine.runTactic('rfl').state.completed, true);
  }
});
