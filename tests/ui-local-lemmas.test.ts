import assert from 'node:assert/strict';
import test from 'node:test';
import { RealProofEngine } from '../src/ui/proof-engine';

test('the real engine exposes have and proves a local equality in two stages', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('zero');
  assert.ok(engine.tacticSuggestions().some((tactic) => tactic.id === 'have' && tactic.syntax === 'have '));
  const declared = engine.runTactic('have h : Eq Nat 0 0');
  assert.equal(declared.kind, 'success');
  assert.equal(declared.state.goals.length, 2);
  assert.equal(declared.state.goals[0].context.length, 0);
  assert.deepEqual(declared.state.goals[1].context, [{ name: 'h', type: '0 = 0' }]);
  assert.equal(engine.runTactic('rfl').kind, 'success');
  const complete = engine.runTactic('assumption');
  assert.equal(complete.kind, 'success');
  assert.equal(complete.state.completed, true);
  assert.equal(complete.message, 'Proof accepted');
  assert.deepEqual(engine.tacticHistory(), ['have h : Eq Nat 0 0', 'rfl', 'assumption']);
});

test('immediate local lemmas elaborate both terms in the preceding local context', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('identity');
  engine.runTactic('intro');
  const declared = engine.runTactic('have h : Eq Nat n n := Refl Nat n');
  assert.equal(declared.kind, 'success');
  assert.equal(declared.state.goals.length, 1);
  assert.deepEqual(declared.state.goals[0].context.map((entry) => entry.name), ['n', 'h']);
  assert.equal(engine.runTactic('exact h').message, 'Proof accepted');
});

test('have supports binder types, lambda proofs and later use of the local function', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('zero');
  const declared = engine.runTactic('have prove : (n : Nat) -> Eq Nat 0 0 := (n : Nat) => Refl Nat 0');
  assert.equal(declared.kind, 'success', declared.message);
  const completed = engine.runTactic('exact prove 0');
  assert.equal(completed.kind, 'success', completed.message);
  assert.equal(completed.state.completed, true);
});

test('have accepts parenthesized dependent types and nested lambda binders', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('zero');
  const declared = engine.runTactic("have id' : ((A : Type) -> (x : A) -> A) := (A : Type) => (x : A) => x");
  assert.equal(declared.kind, 'success', declared.message);
  assert.equal(engine.runTactic("exact id' (Eq Nat 0 0) (Refl Nat 0)").message, 'Proof accepted');
});

test('malformed have wrappers leave the displayed state and history unchanged', () => {
  const engine = new RealProofEngine();
  const before = engine.loadTheorem('zero');
  for (const source of [
    'have', 'have h', 'have : Nat', 'have 1h : Nat', 'have h :',
    'have h : := 0', 'have h : Nat :=', 'have h : Nat := 0 := 0',
    'have h : (Nat := 0)', 'have h : (Nat', 'have h : Nat)',
  ]) {
    const result = engine.runTactic(source);
    assert.equal(result.kind, 'error', source);
    assert.deepEqual(result.state, before, source);
    assert.deepEqual(engine.tacticHistory(), [], source);
  }
});

test('invalid declaration types, proofs, reserved names and self references are rejected atomically', () => {
  const engine = new RealProofEngine();
  const before = engine.loadTheorem('zero');
  for (const source of [
    'have h : 0', 'have h : Nat := Nat', 'have h : Nat := h',
    'have h : h', 'have Nat : Nat := 0', 'have Type : Type := Nat',
    'have h : (n : Nat) => n',
  ]) {
    const result = engine.runTactic(source);
    assert.equal(result.kind, 'error', source);
    assert.deepEqual(result.state, before, source);
    assert.deepEqual(engine.tacticHistory(), [], source);
  }
});

test('a duplicate local lemma does not replace the previous binding or append history', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('zero');
  const first = engine.runTactic('have h : Eq Nat 0 0 := Refl Nat 0');
  assert.equal(first.kind, 'success');
  const duplicate = engine.runTactic('have h : Nat := Succ 0');
  assert.equal(duplicate.kind, 'error');
  assert.match(duplicate.message!, /already exists/);
  assert.deepEqual(duplicate.state, first.state);
  assert.deepEqual(engine.tacticHistory(), ['have h : Eq Nat 0 0 := Refl Nat 0']);
  assert.equal(engine.runTactic('exact h').message, 'Proof accepted');
});

test('loading another theorem removes local lemmas and their tactic history', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('zero');
  engine.runTactic('have h : Nat := 0');
  const reset = engine.loadTheorem('identity');
  assert.equal(reset.goals[0].context.length, 0);
  assert.deepEqual(engine.tacticHistory(), []);
  assert.equal(engine.runTactic('have copy : Nat := h').kind, 'error');
});

test('a local lemma takes precedence over the built-in exact theorem alias', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('zero');
  const declared = engine.runTactic('have add_succ : Eq Nat 0 0 := Refl Nat 0');
  assert.equal(declared.kind, 'success', declared.message);
  assert.equal(engine.runTactic('exact add_succ').message, 'Proof accepted');
});

test('an immediate local value remains an opaque assumption while solving the continuation', () => {
  const engine = new RealProofEngine();
  engine.loadTheorem('zero');
  const declared = engine.runTactic('have n : Nat := 0');
  assert.equal(declared.kind, 'success');
  const invalid = engine.runTactic('exact Refl Nat n');
  assert.equal(invalid.kind, 'error');
  assert.deepEqual(invalid.state, declared.state);
  assert.deepEqual(engine.tacticHistory(), ['have n : Nat := 0']);
  assert.equal(engine.runTactic('rfl').message, 'Proof accepted');
});
