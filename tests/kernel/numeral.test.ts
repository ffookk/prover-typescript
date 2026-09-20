import assert from 'node:assert/strict';
import test from 'node:test';
import { numeral } from '../../src/library/nat';
import { Nat, natLiteral } from '../../src/syntax/ast';
import { infer } from '../../src/kernel/typecheck';

test('library numerals preserve the Core literal representation and type', () => {
  for (const value of [0, -0, 1, 2, 5, 20]) {
    const term = numeral(value);
    assert.deepEqual(term, natLiteral(value));
    assert.deepEqual(infer([], term), Nat);
  }
});

test('library numerals reject negative, fractional, and unsafe integers', () => {
  for (const value of [-1, -0.5, 0.5, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => numeral(value), /Nat literal must be a non-negative safe integer/);
  }
});

test('library numerals reject non-finite inputs instead of silently returning zero or looping', () => {
  for (const value of [NaN, -Infinity, Infinity]) {
    assert.throws(() => numeral(value), /Nat literal must be a non-negative safe integer/);
  }
});
