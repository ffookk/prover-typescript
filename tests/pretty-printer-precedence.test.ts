import assert from 'node:assert/strict';
import test from 'node:test';
import { elaborate } from '../src/elaborator/elaborate';
import { check, infer, show } from '../src/kernel/typecheck';
import { definitionalEqual } from '../src/kernel/reduction';
import { parse } from '../src/parser/parser';
import { processLine } from '../src/repl/repl';
import { Nat, Type, app, eq, pi, variable } from '../src/syntax/ast';

test('REPL equality types group function-type endpoints', () => {
  const source = 'Refl Type ((x : Nat) -> Nat)';
  const printed = processLine(source);
  assert.equal(typeof printed, 'string');
  const reparsed = elaborate(parse(printed!));
  check([], reparsed, Type);
  assert.ok(definitionalEqual(reparsed, infer([], elaborate(parse(source)))));
});

test('printer groups function types passed to a type constructor', () => {
  const context = [pi(Type, Type, 'A')];
  const term = app(variable(0, 'F'), pi(Nat, Nat));
  const printed = show(term);
  const reparsed = elaborate(parse(printed), ['F']);
  check(context, term, Type);
  check(context, reparsed, Type);
  assert.ok(definitionalEqual(reparsed, term));
});

test('printer preserves nested function-type endpoints and argument precedence', () => {
  const context = [pi(Type, Type, 'A')];
  const endpoint = pi(pi(Nat, Nat), pi(Nat, Nat));
  const term = eq(Type, app(variable(0, 'F'), endpoint), endpoint);
  const reparsed = elaborate(parse(show(term)), ['F']);
  check(context, term, Type);
  check(context, reparsed, Type);
  assert.ok(definitionalEqual(reparsed, term));
});

test('printer groups the function type of an equality between local functions', () => {
  const functionType = pi(Nat, Nat);
  const context = [functionType, functionType];
  const term = eq(functionType, variable(1, 'f'), variable(0, 'g'));
  const reparsed = elaborate(parse(show(term)), ['f', 'g']);
  check(context, term, Type);
  check(context, reparsed, Type);
  assert.ok(definitionalEqual(reparsed, term));
});

test('printer preserves ordinary equality and application output', () => {
  assert.equal(show(eq(Nat, variable(0, 'n'), variable(0, 'n'))), 'Eq Nat n n');
  assert.equal(show(app(variable(0, 'F'), Nat)), '(F Nat)');
  assert.equal(show(pi(Nat, Nat)), '(x : Nat) -> Nat');
});
