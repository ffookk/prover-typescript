import assert from 'node:assert/strict';
import test from 'node:test';
import { elaborate } from '../src/elaborator/elaborate';
import { structuralEqual } from '../src/kernel/reduction';
import { infer, show } from '../src/kernel/typecheck';
import { parse } from '../src/parser/parser';
import { processLine } from '../src/repl/repl';
import { Nat, Term, Type, eq, lambda, pi, variable } from '../src/syntax/ast';

function assertTypeRoundTrip(term: Term): void {
  assert.deepEqual(infer([], term), Type);
  const restored = elaborate(parse(show(term)));
  assert.ok(structuralEqual(restored, term), 'printing must preserve de Bruijn references');
  assert.deepEqual(infer([], restored), Type);
}

test('REPL inferred dependent types preserve their binder names', () => {
  const source = '(A : Type) => (value : A) => value';
  const output = processLine(source);
  assert.equal(output, '(A : Type) -> (value : A) -> A');
  assertTypeRoundTrip(infer([], elaborate(parse(source))));
});

test('printer supplies names for anonymous dependent Pi binders', () => {
  const type = pi(Type, pi(variable(0), variable(1)));
  assertTypeRoundTrip(type);
});

test('printer resolves shadowed Pi binders by index instead of variable name metadata', () => {
  const type = pi(Type, pi(Type, pi(variable(1, 'stale'), variable(2, 'stale'), 'value'), 'A'), 'A');
  assertTypeRoundTrip(type);
});

test('printer carries binder scope through lambda domains and bodies', () => {
  const term = lambda(Type, lambda(variable(0, 'stale'), variable(0, 'stale'), 'A'), 'A');
  assert.equal(show(term), '(fun A : Type => (fun A1 : A => A1))');
  assertTypeRoundTrip(infer([], term));
});

test('printer keeps presentation names for variables outside the displayed term', () => {
  assert.equal(show(eq(Nat, variable(0, 'n'), variable(0, 'n'))), 'Eq Nat n n');
  assert.equal(show(variable(0)), '#0');
});
