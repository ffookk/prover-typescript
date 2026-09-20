import assert from 'node:assert/strict';
import test from 'node:test';
import { parse, ParseError } from '../src/parser/parser';

function expectLiteralPosition(source: string, literal: string): void {
  assert.throws(() => parse(source), {
    name: 'ParseError',
    message: `Natural literal is too large: ${literal} at position ${source.indexOf(literal)}`,
  });
}

test('oversized literal errors point to the literal instead of EOF', () => {
  for (const literal of ['9007199254740992', '9'.repeat(400)]) {
    expectLiteralPosition(literal, literal);
  }
});

test('oversized literal errors retain leading whitespace and nested source offsets', () => {
  const literal = '9007199254740992';
  for (const source of [`  ${literal}`, `(x : Nat) => ${literal}`, `Eq Nat 0 (Succ ${literal})`]) {
    expectLiteralPosition(source, literal);
  }
});

test('oversized literal errors do not point to the following token', () => {
  const literal = '9007199254740992';
  expectLiteralPosition(`f ${literal} x`, literal);
});

test('errors on unconsumed tokens retain their current source position', () => {
  assert.throws(() => parse('Succ )'), {
    name: 'ParseError', message: "Expected a term, found ')' at position 5",
  });
  assert.throws(() => parse('(x : Nat) =>'), ParseError);
});
