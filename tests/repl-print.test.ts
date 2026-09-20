import assert from 'node:assert/strict';
import test from 'node:test';
import { GlobalEnvironment } from '../src/environment/environment';
import { parseCommand } from '../src/parser/command';
import { ParseError } from '../src/parser/parser';
import { processLine } from '../src/repl/repl';

test('#print accepts one definition name with surrounding whitespace', () => {
  assert.deepEqual(parseCommand("  #print\tvalue'  "), { kind: 'print', name: "value'" });
});

test('#print shows the type and stored unreduced value without redefining it', () => {
  const environment = new GlobalEnvironment();
  processLine('def one := ((x : Nat) => Succ x) 0', environment);
  const original = environment.lookup('one');
  const output = processLine('#print one', environment);
  assert.ok(output);
  assert.match(output, /^one : Nat := /);
  assert.match(output, /=>/);
  assert.equal(environment.lookup('one'), original);
  assert.equal(processLine('one', environment), 'Nat');
});

test('#print inspects stored theorem proofs', () => {
  const environment = new GlobalEnvironment();
  processLine('theorem self : Eq Nat 0 0 := Refl Nat 0', environment);
  assert.equal(processLine('#print self', environment), 'self : Eq Nat 0 0 := refl 0');
});

test('#print reports unknown names without adding a definition', () => {
  const environment = new GlobalEnvironment();
  assert.throws(() => processLine('#print missing', environment), /Unknown definition: missing/);
  assert.equal(environment.lookup('missing'), undefined);
  assert.throws(() => processLine('#print Nat', environment), /Unknown definition: Nat/);
});

test('#print rejects missing names, expressions, and prefixes', () => {
  for (const source of ['#print', '#print one 0', '#print (one)', '#print 0', '#printable']) {
    assert.throws(() => parseCommand(source), ParseError);
  }
});
