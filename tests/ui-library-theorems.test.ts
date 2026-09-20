import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { substitute, whnf } from '../src/kernel/reduction';
import { addZeroType } from '../src/library/add-zero';
import { zeroAddType } from '../src/library/zero-add';
import { succAddType } from '../src/library/succ-add';
import { addSuccType } from '../src/library/add-succ';
import { addAssocType } from '../src/library/add-assoc';
import { addCommType } from '../src/library/add-comm';
import { addTerm, addTwoThree, numeral } from '../src/library/nat';
import { Context } from '../src/proof/state';
import { tacticSession, TacticSession } from '../src/proof/tactic';
import { Term, Nat, Zero, eq, variable } from '../src/syntax/ast';
import { AVAILABLE_THEOREM_LIST, RealProofEngine } from '../src/ui/proof-engine';

const theoremTypes: Record<string, Term> = {
  add_succ: addSuccType, add_zero: addZeroType, zero_add: zeroAddType,
  succ_add: succAddType, add_assoc: addAssocType, add_comm: addCommType,
  add_two_three: eq(Nat, addTwoThree, numeral(5)),
};

function engineFor(type: Term, context: Context = []) {
  const engine = new RealProofEngine();
  const internals = engine as unknown as { session: TacticSession };
  internals.session = tacticSession({ goals: [{ context, type }] });
  return { engine, internals };
}

test('every completed library theorem is available directly and inside parentheses', () => {
  for (const [name, type] of Object.entries(theoremTypes)) {
    for (const source of [name, '(' + name + ')']) {
      const { engine, internals } = engineFor(type);
      const result = engine.runTactic('exact ' + source);
      assert.equal(result.kind, 'success', name + ': ' + result.message);
      assert.equal(result.state.completed, true);
      check([], internals.session.proof(), type);
    }
  }
});

test('parameterized theorem aliases work in exact terms', () => {
  for (const [name, fullType] of Object.entries(theoremTypes)) {
    let type = whnf(fullType);
    const arguments_: string[] = [];
    while (type.kind === 'Pi') {
      const value = arguments_.length + 1;
      arguments_.push(String(value));
      type = whnf(substitute(type.body, numeral(value)));
    }
    if (arguments_.length === 0) continue;
    const { engine, internals } = engineFor(type);
    const result = engine.runTactic('exact (' + name + ' ' + arguments_.join(' ') + ')');
    assert.equal(result.kind, 'success', name + ': ' + result.message);
    assert.equal(result.state.completed, true);
    check([], internals.session.proof(), type);
  }
});

test('apply can use a function that references a registered library proof', () => {
  const type = eq(Nat, addTerm(numeral(1), Zero), numeral(1));
  const { engine, internals } = engineFor(type);
  const applied = engine.runTactic('apply ((unused : Nat) => add_zero 1)');
  assert.equal(applied.kind, 'success', applied.message);
  assert.equal(engine.runTactic('exact 0').state.completed, true);
  check([], internals.session.proof(), type);
});

test('the palette lists exactly the available completed library proofs', () => {
  assert.deepEqual(AVAILABLE_THEOREM_LIST.map(entry => entry.id).sort(), Object.keys(theoremTypes).sort());
  const engine = new RealProofEngine();
  const before = engine.loadTheorem('zero');
  const rejected = engine.runTactic('exact identity');
  assert.equal(rejected.kind, 'error');
  assert.deepEqual(rejected.state, before);
  assert.deepEqual(engine.tacticHistory(), []);
});

test('a local hypothesis takes precedence over an identically named library theorem', () => {
  const type = eq(Nat, Zero, Zero);
  const context = [{ name: 'add_zero', type }];
  const { engine, internals } = engineFor(type, context);
  assert.equal(engine.runTactic('exact (add_zero)').state.completed, true);
  assert.deepEqual(internals.session.proof(), variable(0, 'add_zero'));
  check([type], internals.session.proof(), type);
});

test('rewrite accepts a library theorem applied to a local variable', () => {
  const context = [{ name: 'n', type: Nat }];
  const target = eq(Nat, addTerm(variable(0, 'n'), Zero), addTerm(variable(0, 'n'), Zero));
  const { engine, internals } = engineFor(target, context);
  const rewritten = engine.runTactic('rewrite (add_zero n)');
  assert.equal(rewritten.kind, 'success', rewritten.message);
  assert.equal(engine.runTactic('rfl').state.completed, true);
  check([Nat], internals.session.proof(), target);
});
