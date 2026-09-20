import test from 'node:test';
import assert from 'node:assert/strict';
import { check, infer, TypeError as KernelTypeError } from '../src/kernel/typecheck';
import { definitionalEqual } from '../src/kernel/reduction';
import { Nat, eq, pi, variable } from '../src/syntax/ast';
import { proofState } from '../src/proof/state';
import { tacticSession } from '../src/proof/tactic';

test('proof extraction checks the original type in its original local context', () => {
  const type = pi(Nat, eq(Nat, variable(1, 'm'), variable(1, 'm')), 'n');
  const session = tacticSession(proofState([{ context: [{ name: 'm', type: Nat }], type }])).intro();
  const complete = session.focusGoal(session.currentGoal()!.id!).rfl();
  const proof = complete.proof();

  check([Nat], proof, type);
  assert.ok(definitionalEqual(infer([Nat], proof), type));
});

test('proof extraction never returns an induction term for a different original goal', () => {
  const type = pi(Nat, pi(Nat, eq(Nat, variable(1, 'm'), variable(1, 'm')), 'n'), 'm');
  const complete = tacticSession(proofState([{ context: [], type }]))
    .intro().intro().induction('n').rfl().rfl();

  assert.equal(complete.state.goals.length, 0);
  // A compiler that captures m as n must reject extraction. If compilation
  // succeeds, the returned term must prove the original m = m goal.
  let proof: ReturnType<typeof complete.proof>;
  try {
    proof = complete.proof();
  } catch (error) {
    assert.ok(error instanceof KernelTypeError && /Type mismatch/.test(error.message));
    return;
  }
  check([], proof, type);
  assert.ok(definitionalEqual(infer([], proof), type));
});
