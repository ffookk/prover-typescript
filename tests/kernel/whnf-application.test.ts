import test from 'node:test';
import assert from 'node:assert/strict';
import { Nat, Type, Zero, app, eq, lambda, natRec, pi, refl, succ, variable } from '../../src/syntax/ast';
import { normalize, whnf } from '../../src/kernel/reduction';
import { check, infer } from '../../src/kernel/typecheck';
import { elaborate } from '../../src/elaborator/elaborate';
import { parse } from '../../src/parser/parser';

test('weak head reduction contracts lambdas exposed in the function position', () => {
  const chooseFirst = lambda(Type, lambda(Type, variable(1)));
  assert.deepEqual(whnf(app(app(chooseFirst, Nat), Type)), Nat);
});

test('weak head reduction leaves a neutral application argument unevaluated', () => {
  const argument = app(lambda(Nat, variable(0)), Zero);
  const exposeFunction = app(lambda(Nat, variable(1)), Zero);
  assert.deepEqual(whnf(app(exposeFunction, argument)), app(variable(0), argument));
});

test('Kernel accepts applications whose function type exposes Pi after nested beta reduction', () => {
  const functionType = app(app(lambda(Type, lambda(Type, variable(1))), pi(Nat, Nat)), Type);
  const applyToZero = lambda(functionType, app(variable(0), Zero));
  const result = app(applyToZero, lambda(Nat, variable(0)));

  assert.deepEqual(infer([], result), Nat);
  check([], refl(Nat, result), eq(Nat, result, Zero));
});

test('surface programs can apply a function with a computed function type', () => {
  const term = elaborate(parse('(f : ((A : Type) => (B : Type) => A) ((n : Nat) -> Nat) Type) => f 0'));
  assert.doesNotThrow(() => infer([], term));
});

test('Nat.rec inspects a computed constructor before choosing its branch', () => {
  const motive = lambda(Nat, Nat);
  const succCase = lambda(Nat, lambda(Nat, succ(variable(0))));
  const identity = lambda(Nat, variable(0));

  for (const value of [Zero, succ(Zero)]) {
    const term = natRec(motive, Zero, succCase, app(identity, value));
    assert.equal(whnf(term).kind, value.kind);
    assert.deepEqual(normalize(term), value);
    assert.deepEqual(normalize(normalize(term)), value);
    check([], refl(Nat, term), eq(Nat, term, value));
  }
});

test('Nat.rec preserves a neutral scrutinee after reducing its head', () => {
  const motive = lambda(Nat, Nat);
  const succCase = lambda(Nat, lambda(Nat, succ(variable(0))));
  const scrutinee = app(lambda(Nat, variable(0)), variable(0));
  const term = natRec(motive, Zero, succCase, scrutinee);
  const expected = natRec(motive, Zero, succCase, variable(0));

  assert.deepEqual(whnf(term), expected);
  check([Nat], expected, Nat);
});
