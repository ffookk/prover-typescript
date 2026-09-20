import assert from 'node:assert/strict';
import test from 'node:test';
import { Nat, Type, Zero, app, lambda, pi, succ, variable } from '../src/syntax/ast';
import { infer, inferLambdaApplication, typeCheck, TypeError } from '../src/kernel/typecheck';

test('lambda application rejects an ill-typed body before returning a result', () => {
  const fn = lambda(Nat, app(Zero, variable(0)));
  assert.throws(() => infer([], app(fn, Zero)), TypeError);
  assert.throws(() => inferLambdaApplication(fn, Zero), TypeError);
});

test('lambda application rejects free variables in the function body', () => {
  const fn = lambda(Nat, variable(1));
  assert.throws(() => infer([], app(fn, Zero)), TypeError);
  assert.throws(() => inferLambdaApplication(fn, Zero), TypeError);
});

test('lambda application validates an annotation even when it reduces to Nat', () => {
  const invalidDomain = app(lambda(Nat, Nat), Type);
  const fn = lambda(invalidDomain, variable(0));
  assert.throws(() => infer([], app(fn, Zero)), TypeError);
  assert.throws(() => inferLambdaApplication(fn, Zero), TypeError);
});

test('lambda application keeps rejecting non-lambdas and incompatible arguments', () => {
  assert.throws(() => inferLambdaApplication(Zero, Zero), /Expected a lambda/);
  assert.throws(() => inferLambdaApplication(lambda(Nat, Zero), Type), TypeError);
});

test('lambda application preserves dependent domains and nested binder scope', () => {
  const identity = lambda(Type, lambda(variable(0), variable(0)));
  const specialized = inferLambdaApplication(identity, Nat);
  assert.deepEqual(specialized, lambda(Nat, variable(0)));
  assert.deepEqual(infer([], specialized), pi(Nat, Nat));
  const constant = lambda(Nat, lambda(Nat, variable(1)));
  assert.deepEqual(inferLambdaApplication(constant, succ(Zero)), lambda(Nat, succ(Zero)));
});

test('lambda application returns the substituted body without normalizing it', () => {
  const body = app(lambda(Nat, variable(0)), variable(0));
  assert.deepEqual(inferLambdaApplication(lambda(Nat, body), Zero), app(lambda(Nat, variable(0)), Zero));
});

test('typeCheck rejects an ill-typed expected type hidden by beta reduction', () => {
  const invalidExpected = app(lambda(Nat, Nat), Type);
  assert.throws(() => infer([], invalidExpected), TypeError);
  assert.throws(() => typeCheck(Zero, invalidExpected), TypeError);
});

test('typeCheck validates expected types while retaining its return value', () => {
  const expected = app(lambda(Nat, Nat), Zero);
  assert.equal(typeCheck(Zero, expected), expected);
  assert.equal(typeCheck(Nat, Type), Type);
  assert.equal(typeCheck(Zero), Nat);
  assert.throws(() => typeCheck(Zero, Zero), TypeError);
});
