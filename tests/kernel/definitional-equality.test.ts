import test from 'node:test';
import assert from 'node:assert/strict';
import { Nat, Zero, Type, variable, lambda, pi, app, succ, natRec } from '../../src/syntax/ast';
import { definitionalEqual, normalize, whnf } from '../../src/kernel/reduction';
import { infer } from '../../src/kernel/typecheck';
import { addTerm, numeral } from '../../src/library/nat';

test('beta reduction is reflected by definitional equality', () => {
  const term = app(lambda(Nat, variable(0)), numeral(3));
  assert.ok(definitionalEqual(term, numeral(3)));
  assert.deepEqual(normalize(term), numeral(3));
});

test('nested beta reduction preserves the outer variable', () => {
  const term = app(app(lambda(Nat, lambda(Nat, variable(1))), numeral(3)), numeral(4));
  assert.ok(definitionalEqual(term, numeral(3)));
  assert.deepEqual(normalize(term), numeral(3));
});

test('Nat.rec zero iota reduction is definitional equality', () => {
  const motive = lambda(Nat, Nat);
  const zeroCase = numeral(7);
  const succCase = lambda(Nat, lambda(Nat, succ(variable(0))));
  const term = natRec(motive, zeroCase, succCase, Zero);
  assert.ok(definitionalEqual(term, zeroCase));
  assert.deepEqual(normalize(term), zeroCase);
});

test('Nat.rec successor iota reduction is definitional equality', () => {
  const motive = lambda(Nat, Nat);
  const zeroCase = Zero;
  const succCase = lambda(Nat, lambda(Nat, succ(variable(0))));
  const n = variable(0, 'n');
  const term = natRec(motive, zeroCase, succCase, succ(n));
  const expected = app(app(succCase, n), natRec(motive, zeroCase, succCase, n));
  assert.ok(definitionalEqual(term, expected));
  assert.deepEqual(whnf(term), succ(natRec(motive, zeroCase, succCase, n)));
});

test('closed add computation is definitionally equal to a numeral', () => {
  assert.ok(definitionalEqual(addTerm(numeral(2), numeral(3)), numeral(5)));
  assert.ok(definitionalEqual(normalize(addTerm(numeral(3), numeral(4))), numeral(7)));
});

test('neutral Nat.rec does not speculatively reduce an unknown scrutinee', () => {
  const motive = lambda(Nat, Nat);
  const zeroCase = Zero;
  const succCase = lambda(Nat, lambda(Nat, succ(variable(0))));
  const n = variable(0, 'n');
  const term = natRec(motive, zeroCase, succCase, n);
  assert.deepEqual(whnf(term), term);
  assert.deepEqual(normalize(term), term);
  assert.ok(!definitionalEqual(term, n));
  assert.ok(definitionalEqual(infer([Nat], term), Nat));
});

test('unknown add n 0 remains neutral while retaining type Nat', () => {
  const ctx = [Nat] as const;
  const n = variable(0, 'n');
  const term = addTerm(n, Zero);
  const normalized = normalize(term);

  assert.equal(normalized.kind, 'NatRec');
  assert.equal((normalized as typeof term & { kind: 'NatRec' }).scrutinee.kind, 'Var');
  assert.ok(!definitionalEqual(term, n));
  assert.ok(definitionalEqual(infer(ctx, term), Nat));
});

test('normalization reduces beta-redexes inside neutral applications', () => {
  const ctx = [Nat] as const;
  const n = variable(0, 'n');
  const identity = lambda(Nat, variable(0));
  const neutral = app(identity, n);
  assert.ok(definitionalEqual(neutral, n));
  assert.ok(definitionalEqual(infer(ctx, neutral), Nat));
});

test('definitional equality compares normalized dependent types structurally', () => {
  const left = pi(Nat, app(lambda(Nat, Nat), Zero));
  const right = pi(Nat, Nat);
  assert.ok(definitionalEqual(left, right));
  assert.ok(definitionalEqual(infer([], left), Type));
});
