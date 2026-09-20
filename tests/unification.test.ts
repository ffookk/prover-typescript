import assert from 'node:assert/strict';
import test from 'node:test';
import { MetaContext, coreTerm } from '../src/proof/metavariable/meta';
import { infer } from '../src/kernel/typecheck';
import { UnificationError, uApp, unify } from '../src/proof/unification';
import { Nat, Zero, app, lambda, succ, variable } from '../src/syntax/ast';

test('unification assigns a metavariable to a Core term', () => {
  const created = MetaContext.empty().create(0, Nat);
  const result = unify(created.term, Nat, created.context);
  assert.deepEqual(result.resolve(created.variable.id), coreTerm(Nat));
});

test('application unification solves P ?x = P n', () => {
  const created = MetaContext.empty().create(0, Nat);
  const p = variable(0, 'P');
  const n = succ(Zero);
  const result = unify(uApp(p, created.term), app(p, n), created.context);
  assert.deepEqual(result.resolve(created.variable.id), coreTerm(n));
});

test('nested application unification solves f ?x = f (g n)', () => {
  const created = MetaContext.empty().create(2, Nat);
  const f = variable(0, 'f');
  const g = variable(1, 'g');
  const result = unify(uApp(f, created.term), uApp(f, uApp(g, Zero)), created.context);
  assert.deepEqual(result.resolve(created.variable.id), coreTerm(app(g, Zero)));
});

test('constructor mismatch is rejected without mutating the context', () => {
  const context = MetaContext.empty();
  assert.throws(() => unify(Zero, succ(Zero), context), UnificationError);
  assert.equal(context.variables.length, 0);
  assert.equal(context.assignments.size, 0);
});

test('occurs check rejects ?x = f ?x without mutation', () => {
  const created = MetaContext.empty().create(0, Nat);
  const f = variable(0, 'f');
  assert.throws(() => unify(created.term, uApp(f, created.term), created.context), /Occurs check/);
  assert.equal(created.context.assignment(created.variable.id), undefined);
});

test('scope safety is preserved by unification assignments', () => {
  const outer = MetaContext.empty().create(0, Nat);
  const inner = outer.context.create(1, Nat);
  assert.throws(() => unify(outer.term, variable(1), inner.context), /Scope escape/);
  assert.equal(inner.context.assignment(outer.variable.id), undefined);
});

test('failed unification leaves prior assignments stable', () => {
  const created = MetaContext.empty().create(0, Nat);
  const assigned = created.context.assign(created.variable.id, coreTerm(Zero));
  assert.throws(() => unify(Zero, succ(Zero), assigned), UnificationError);
  assert.deepEqual(assigned.resolve(created.variable.id), coreTerm(Zero));
});

test('M20 conflicting implicit constraints reject without mutating prior assignments', () => {
  const created = MetaContext.empty().create(0, Nat);
  const first = unify(created.term, Nat, created.context);
  assert.throws(() => unify(created.term, succ(Zero), first), UnificationError);
  assert.deepEqual(first.resolve(created.variable.id), coreTerm(Nat));
  assert.equal(created.context.assignments.size, 0);
});

test('nested unresolved metavariables cannot bypass assignment scope checks', () => {
  const outer = MetaContext.empty().create(0, Nat);
  const inner = outer.context.create(1, Nat);
  const identity = lambda(Nat, variable(0));

  assert.throws(
    () => unify(outer.term, uApp(identity, inner.term), inner.context),
    /Unassigned metavariable/,
  );
  assert.equal(inner.context.assignment(outer.variable.id), undefined);
  assert.equal(inner.context.assignment(inner.variable.id), undefined);
});

test('nested assigned metavariables are checked in the receiving metavariable scope', () => {
  const outer = MetaContext.empty().create(0, Nat);
  const inner = outer.context.create(1, Nat);
  const assigned = inner.context.assign(inner.variable.id, coreTerm(variable(0)));
  const identity = lambda(Nat, variable(0));

  assert.throws(
    () => unify(outer.term, uApp(identity, inner.term), assigned),
    /Scope escape/,
  );
  assert.equal(assigned.assignment(outer.variable.id), undefined);
  assert.deepEqual(assigned.instantiate(inner.term), variable(0));
});

test('nested closed assignments materialize into Core terms before storage', () => {
  const outer = MetaContext.empty().create(0, Nat);
  const inner = outer.context.create(1, Nat);
  const assigned = inner.context.assign(inner.variable.id, coreTerm(Zero));
  const identity = lambda(Nat, variable(0));

  const result = unify(outer.term, uApp(identity, inner.term), assigned);
  const proof = result.instantiate(outer.term);

  assert.deepEqual(proof, app(identity, Zero));
  assert.deepEqual(result.assignment(outer.variable.id), coreTerm(app(identity, Zero)));
  assert.deepEqual(infer([], proof), Nat);
  assert.equal(assigned.assignment(outer.variable.id), undefined);
});

test('direct unresolved metavariable aliases can still be solved later', () => {
  const first = MetaContext.empty().create(0, Nat);
  const second = first.context.create(0, Nat);

  const aliased = unify(first.term, second.term, second.context);
  const solved = unify(second.term, Zero, aliased);

  assert.deepEqual(solved.instantiate(first.term), Zero);
  assert.deepEqual(solved.instantiate(second.term), Zero);
  assert.equal(second.context.assignments.size, 0);
});
