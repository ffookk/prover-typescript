import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../src/kernel/typecheck';
import { MetaContext, MetaVariableError, coreTerm } from '../src/proof/metavariable/meta';
import { unify } from '../src/proof/unification';
import { Nat, Zero, succ } from '../src/syntax/ast';

test('an assigned metavariable rejects both conflicting and repeated assignments', () => {
  const created = MetaContext.empty().create(0, Nat);
  const assigned = created.context.assign(created.variable.id, coreTerm(Zero));
  const before = assigned.assignment(created.variable.id);

  for (const value of [succ(Zero), Zero]) {
    assert.throws(() => assigned.assign(created.variable.id, coreTerm(value)), error =>
      error instanceof MetaVariableError && /already assigned/.test(error.message));
    assert.equal(assigned.assignment(created.variable.id), before);
    assert.deepEqual(assigned.instantiate(created.term), Zero);
  }
  check([], assigned.instantiate(created.term), Nat);
});

test('an alias cannot be overwritten but its unassigned target can still be solved', () => {
  const first = MetaContext.empty().create(0, Nat);
  const second = first.context.create(0, Nat);
  const aliased = second.context.assign(first.variable.id, second.term);

  assert.throws(() => aliased.assign(first.variable.id, coreTerm(Zero)), /already assigned/);
  assert.throws(() => aliased.assign(first.variable.id, second.term), /already assigned/);
  assert.deepEqual(aliased.assignment(first.variable.id), second.term);
  assert.equal(aliased.assignment(second.variable.id), undefined);

  const solved = unify(first.term, Zero, aliased);
  assert.deepEqual(solved.instantiate(first.term), Zero);
  assert.deepEqual(solved.instantiate(second.term), Zero);
  check([], solved.instantiate(first.term), Nat);
});

test('the original unassigned context can be used for independent solution branches', () => {
  const created = MetaContext.empty().create(0, Nat);

  const zeroBranch = created.context.assign(created.variable.id, coreTerm(Zero));
  const successorBranch = created.context.assign(created.variable.id, coreTerm(succ(Zero)));

  assert.equal(created.context.assignment(created.variable.id), undefined);
  assert.deepEqual(zeroBranch.instantiate(created.term), Zero);
  assert.deepEqual(successorBranch.instantiate(created.term), succ(Zero));
});

test('unification still accepts an existing solution and rejects an incompatible constraint', () => {
  const created = MetaContext.empty().create(0, Nat);
  const assigned = unify(created.term, Zero, created.context);

  assert.equal(unify(created.term, Zero, assigned), assigned);
  assert.equal(unify(Zero, created.term, assigned), assigned);
  assert.throws(() => unify(created.term, succ(Zero), assigned), /Cannot unify/);
  assert.deepEqual(assigned.instantiate(created.term), Zero);
  assert.equal(created.context.assignment(created.variable.id), undefined);
});
