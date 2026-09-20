import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize, substitute } from '../src/kernel/reduction';
import { check } from '../src/kernel/typecheck';
import { MetaContext, coreTerm } from '../src/proof/metavariable/meta';
import { substituteUnification, toCoreTerm, unify } from '../src/proof/unification';
import { Nat, Type, Zero, app, lambda, pi, variable } from '../src/syntax/ast';

test('materializing a substituted metavariable preserves its outer variable under a lambda', () => {
  const created = MetaContext.empty().create(1, Nat);
  const outer = variable(0, 'outer');
  const context = created.context.assign(created.variable.id, coreTerm(outer));
  const body = lambda(Nat, variable(1), 'inner');

  const result = toCoreTerm(substituteUnification(body, created.term), context);

  assert.deepEqual(result, substitute(body, outer));
  check([Nat], result, pi(Nat, Nat));
  assert.deepEqual(normalize(app(result, Zero)), outer);
});

test('materializing metavariables tracks Pi domains and bodies through nested binders', () => {
  const created = MetaContext.empty().create(1, Type);
  const outerType = variable(0, 'A');
  const context = created.context.assign(created.variable.id, coreTerm(outerType));
  const body = pi(variable(0), pi(Nat, variable(2), 'n'), 'a');

  const result = toCoreTerm(substituteUnification(body, created.term), context);

  assert.deepEqual(result, substitute(body, outerType));
  check([Type], result, Type);
});

test('materializing an alias under a binder shifts free variables without changing its own binders', () => {
  const first = MetaContext.empty().create(1, pi(Nat, Nat));
  const second = first.context.create(1, pi(Nat, Nat));
  const value = lambda(Nat, variable(1, 'outer'), 'argument');
  const context = second.context.assign(first.variable.id, second.term)
    .assign(second.variable.id, coreTerm(value));
  const body = lambda(Nat, variable(1), 'inner');

  const result = toCoreTerm(substituteUnification(body, first.term), context);

  assert.deepEqual(result, substitute(body, value));
  check([Nat], result, pi(Nat, pi(Nat, Nat)));
});

test('closed metavariable values and existing Core binders remain unchanged', () => {
  const created = MetaContext.empty().create(0, pi(Nat, Nat));
  const identity = lambda(Nat, variable(0), 'x');
  const context = created.context.assign(created.variable.id, coreTerm(identity));
  const body = lambda(Nat, app(variable(1), variable(0)), 'n');

  const result = toCoreTerm(substituteUnification(body, created.term), context);

  assert.deepEqual(result, substitute(body, identity));
  assert.deepEqual(toCoreTerm(body, context), body);
  check([], result, pi(Nat, Nat));
});

test('unification explicitly rejects inferring a metavariable from inside a binder', () => {
  for (const binder of [lambda, pi]) {
    for (const index of [0, 1]) {
      const created = MetaContext.empty().create(2, Nat);
      const left = substituteUnification(binder(Nat, variable(1)), created.term);
      const right = binder(Nat, variable(index));

      assert.throws(() => unify(left, right, created.context), /Cannot infer metavariable .* under a binder/);
      assert.throws(() => unify(right, left, created.context), /Cannot infer metavariable .* under a binder/);
      assert.equal(created.context.assignment(created.variable.id), undefined);
      assert.equal(unify(left, left, created.context), created.context);
    }
  }
});

test('unification compares solved metavariables in the surrounding binder scope', () => {
  const created = MetaContext.empty().create(1, Nat);
  const value = variable(0, 'outer');
  const context = created.context.assign(created.variable.id, coreTerm(value));
  for (const body of [lambda(Nat, variable(1)), pi(Nat, variable(1)), lambda(Nat, pi(Nat, variable(2)))]) {
    const left = substituteUnification(body, created.term);
    const right = substitute(body, value);

    const solved = unify(left, right, context);

    assert.deepEqual(toCoreTerm(left, solved), right);
    assert.deepEqual(toCoreTerm(right, unify(right, left, context)), right);
  }
  const captured = lambda(Nat, variable(0));
  const left = substituteUnification(lambda(Nat, variable(1)), created.term);
  assert.throws(() => unify(left, captured, context), /Cannot unify variables/);
});

test('unification can solve a Pi domain and compare the same metavariable in its body', () => {
  const created = MetaContext.empty().create(1, Type);
  const body = pi(variable(0), pi(Nat, variable(2)));
  const left = substituteUnification(body, created.term);
  const right = substitute(body, variable(0, 'A'));

  const solved = unify(left, right, created.context);

  assert.deepEqual(solved.instantiate(created.term), variable(0, 'A'));
  assert.deepEqual(toCoreTerm(left, solved), right);
  check([Type], toCoreTerm(left, solved), Type);
  assert.equal(created.context.assignment(created.variable.id), undefined);
});

test('unification preserves the binders of a solved function assignment', () => {
  const first = MetaContext.empty().create(1, pi(Nat, Nat));
  const second = first.context.create(1, Nat);
  const context = second.context.assign(second.variable.id, coreTerm(variable(0, 'outer')));
  const functionValue = substituteUnification(lambda(Nat, variable(1)), second.term);
  const assigned = unify(first.term, functionValue, context);
  const left = substituteUnification(lambda(Nat, variable(1)), first.term);
  const right = lambda(Nat, lambda(Nat, variable(2, 'outer')));

  const solved = unify(left, right, assigned);

  assert.deepEqual(toCoreTerm(left, solved), right);
  check([Nat], toCoreTerm(left, solved), pi(Nat, pi(Nat, Nat)));
});
