import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { addTerm } from '../src/library/nat';
import { zeroAddProof } from '../src/library/zero-add';
import { MetaContext, coreTerm } from '../src/proof/metavariable/meta';
import { initialProofState } from '../src/proof/state';
import { tacticSession } from '../src/proof/tactic';
import { UnificationError, uApp, unify } from '../src/proof/unification';
import { Nat, Type, Zero, app, eq, eqRec, lambda, natRec, refl, succ, variable } from '../src/syntax/ast';

test('unification accepts computationally equal Core subterms', () => {
  const context = MetaContext.empty();
  const beta = app(lambda(Nat, variable(0)), Zero);
  const recursive = natRec(lambda(Nat, Nat), Zero, lambda(Nat, lambda(Nat, succ(variable(0)))), succ(Zero));
  const transport = eqRec(lambda(Nat, Nat), Zero, Zero, Zero, refl(Nat, Zero));
  assert.equal(unify(beta, Zero, context), context);
  assert.equal(unify(recursive, succ(Zero), context), context);
  assert.equal(unify(transport, Zero, context), context);
});

test('conversion can compare rigid fields before inferring an unresolved argument', () => {
  const created = MetaContext.empty().create(1, Nat);
  const identity = lambda(Nat, variable(0));
  const left = uApp(variable(0), created.term);
  const right = app(app(lambda(Type, variable(1)), Nat), app(identity, Zero));
  const result = unify(left, right, created.context);
  assert.deepEqual(result.resolve(created.variable.id), coreTerm(app(identity, Zero)));
  assert.equal(created.context.assignments.size, 0);
});

test('conversion preserves rigid mismatches and never reduces unresolved metas in Core', () => {
  const created = MetaContext.empty().create(0, Nat);
  const before = created.context;
  const mixed = uApp(lambda(Nat, variable(0)), created.term);
  assert.throws(() => unify(mixed, Zero, before), UnificationError);
  assert.throws(() => unify(app(lambda(Nat, variable(0)), Zero), succ(Zero), before), UnificationError);
  assert.equal(before.assignments.size, 0);
});

test('apply accepts a computed result type and returns a proof of the original target', () => {
  const one = succ(Zero);
  const target = eq(Nat, addTerm(Zero, one), one);
  const theorem = lambda(Nat, app(zeroAddProof, one), 'unused');
  const session = tacticSession(initialProofState(target));
  const applied = session.apply(theorem);
  assert.equal(applied.state.goals.length, 1);
  assert.deepEqual(applied.state.goals[0].type, Nat);
  const proof = applied.exact(Zero).proof();
  check([], proof, target);
  assert.equal(session.state.goals.length, 1);
});

test('apply still rejects unequal computed endpoints without changing its state', () => {
  const target = eq(Nat, addTerm(Zero, succ(Zero)), Zero);
  const theorem = lambda(Nat, app(zeroAddProof, succ(Zero)), 'unused');
  const session = tacticSession(initialProofState(target));
  const before = session.state;
  assert.throws(() => session.apply(theorem), /Cannot unify/);
  assert.equal(session.state, before);
});
