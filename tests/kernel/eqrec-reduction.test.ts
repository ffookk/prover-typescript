import test from 'node:test';
import assert from 'node:assert/strict';
import { Nat, Type, Zero, app, eq, eqRec, lambda, pi, refl, succ, variable } from '../../src/syntax/ast';
import { definitionalEqual, normalize, whnf } from '../../src/kernel/reduction';
import { check } from '../../src/kernel/typecheck';

test('Eq.rec reduces when its equality evidence computes to Refl', () => {
  const equalityType = eq(Nat, Zero, Zero);
  const equality = app(lambda(equalityType, variable(0)), refl(Nat, Zero));
  const transported = eqRec(lambda(Nat, Nat), succ(Zero), Zero, Zero, equality);

  check([], transported, Nat);
  assert.deepEqual(whnf(transported), succ(Zero));
  assert.deepEqual(normalize(transported), succ(Zero));
  assert.ok(definitionalEqual(transported, succ(Zero)));
});

test('Kernel accepts a completed equality proof about computed transport', () => {
  const equalityType = eq(Nat, Zero, Zero);
  const equality = app(lambda(equalityType, variable(0)), refl(Nat, Zero));
  const transported = eqRec(lambda(Nat, Nat), succ(Zero), Zero, Zero, equality);

  check([], refl(Nat, transported), eq(Nat, transported, succ(Zero)));
});

test('normalization descends into neutral Eq.rec without inventing equality evidence', () => {
  const betaZero = app(lambda(Nat, variable(0)), Zero);
  const equalityType = eq(Nat, Zero, Zero);
  const motive = app(lambda(pi(Nat, Type), variable(0)), lambda(Nat, Nat));
  const evidence = app(lambda(equalityType, variable(0)), variable(0));
  const neutral = eqRec(motive, betaZero, betaZero, betaZero, evidence);
  const expected = eqRec(lambda(Nat, Nat), Zero, Zero, Zero, variable(0));

  check([equalityType], neutral, Nat);
  assert.deepEqual(normalize(neutral), expected);
  assert.ok(definitionalEqual(neutral, expected));
  assert.ok(!definitionalEqual(neutral, Zero));
  check([equalityType], normalize(neutral), Nat);
});
