import assert from 'node:assert/strict';
import test from 'node:test';
import { GlobalEnvironment } from '../src/environment/environment';
import { focusGoal, focusNext, focusPrevious, initialProofState, goal, proofState, replaceGoal } from '../src/proof/state';
import { Nat, Type, variable } from '../src/syntax/ast';

test('proof state starts with one Core-level goal and an empty context', () => {
  const state = initialProofState(Nat);
  assert.equal(state.goals.length, 1);
  assert.deepEqual(state.goals[0].context, []);
  assert.equal(state.goals[0].type, Nat);
});

test('proof state context can express named local Core types', () => {
  const state = proofState([goal([
    { name: 'A', type: Type },
    { name: 'x', type: variable(0, 'A') },
  ], variable(0, 'A'))]);

  assert.deepEqual(state.goals[0].context.map(entry => entry.name), ['A', 'x']);
  assert.equal(state.goals[0].context[0].type, Type);
  assert.equal(state.goals[0].context[1].type.kind, 'Var');
  assert.equal(state.goals[0].type.kind, 'Var');
});

test('proof state can safely contain multiple independent goals', () => {
  const state = proofState([goal([], Nat), goal([], Type)]);

  assert.equal(state.goals.length, 2);
  assert.equal(state.goals[0].type, Nat);
  assert.equal(state.goals[1].type, Type);
});

test('goal replacement creates a new proof state without mutating the original', () => {
  const original = proofState([goal([], Nat), goal([], Type)]);
  const replacement = replaceGoal(original, 0, [goal([], Type), goal([], Nat)]);

  assert.deepEqual(original.goals.map(item => item.type), [Nat, Type]);
  assert.deepEqual(replacement.goals.map(item => item.type), [Type, Nat, Type]);
});

test('proof state operations do not modify the global environment', () => {
  const environment = new GlobalEnvironment();
  const state = initialProofState(Nat);
  const updated = replaceGoal(state, 0, [goal([], Type)]);

  assert.equal(updated.goals.length, 1);
  assert.equal(environment.lookup('answer'), undefined);
});

test('invalid goal replacement is rejected', () => {
  const state = initialProofState(Nat);
  assert.throws(() => replaceGoal(state, 1, []), RangeError);
});

test('goal identities remain stable while order changes', () => {
  const state = proofState([goal([], Nat), goal([], Type), goal([], Nat)]);
  const ids = state.goals.map(item => item.id);
  const focused = state.focusedGoalId;
  const replacement = replaceGoal(state, 1, [state.goals[1]]);
  assert.deepEqual(replacement.goals.map(item => item.id), ids);
  assert.equal(replacement.focusedGoalId, focused);
  assert.notEqual(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
});

test('focus navigation is immutable and rejects unknown goals', () => {
  const state = proofState([goal([], Nat), goal([], Type), goal([], Nat)]);
  const second = state.goals[1].id!;
  assert.equal(focusGoal(state, second).focusedGoalId, second);
  assert.equal(focusNext(focusGoal(state, second)).focusedGoalId, state.goals[2].id);
  assert.equal(focusPrevious(focusGoal(state, second)).focusedGoalId, state.goals[0].id);
  assert.equal(state.focusedGoalId, state.goals[0].id);
  assert.throws(() => focusGoal(state, 999999), /Goal id not found/);
});

test('case metadata is preserved as Proof Engine data', () => {
  const state = proofState([
    goal([], Nat, 'zero'),
    goal([{ name: 'n', type: Nat }], Type, 'succ'),
  ]);
  assert.equal(state.goals[0].caseName, 'zero');
  assert.equal(state.goals[1].caseName, 'succ');
});

test('solving the focused goal leaves other goals and selects the next goal', () => {
  const state = proofState([goal([], Nat), goal([], Nat), goal([], Nat)]);
  const updated = replaceGoal(focusGoal(state, state.goals[1].id!), 1, []);
  assert.deepEqual(updated.goals.map(item => item.id), [state.goals[0].id, state.goals[2].id]);
  assert.equal(updated.focusedGoalId, state.goals[2].id);
});

test('generated goal IDs do not steal a later explicit goal identity or focus', () => {
  const explicitId = goal([], Nat).id! + 1;
  const input = [
    { context: [], type: Nat },
    { id: explicitId, context: [], type: Type },
  ];

  const state = proofState(input, explicitId);

  assert.equal(state.goals[1].id, explicitId);
  assert.notEqual(state.goals[0].id, explicitId);
  assert.equal(state.goals.find(item => item.id === state.focusedGoalId)?.type, Type);
  assert.equal(focusNext(state).focusedGoalId, state.goals[0].id);
  assert.equal('id' in input[0], false);
  assert.equal(input[1].id, explicitId);
});

test('replacing a duplicate goal ID preserves later explicit goal IDs', () => {
  const first = goal([], Nat);
  const laterId = first.id! + 1;
  const state = proofState([
    first,
    { ...first, caseName: 'duplicate' },
    { id: laterId, context: [], type: Type },
  ], laterId);

  assert.equal(state.goals[0].id, first.id);
  assert.equal(state.goals[2].id, laterId);
  assert.equal(new Set(state.goals.map(item => item.id)).size, 3);
  assert.equal(state.goals.find(item => item.id === state.focusedGoalId)?.type, Type);
  assert.equal(state.goals[1].caseName, 'duplicate');
});
