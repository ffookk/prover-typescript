import assert from 'node:assert/strict';
import test from 'node:test';
import { GlobalEnvironment, type Environment } from '../src/environment/environment';
import { TypeError } from '../src/kernel/typecheck';
import { parseCommand } from '../src/parser/command';
import { ParseError } from '../src/parser/parser';
import { processLine } from '../src/repl/repl';

test('inspection commands parse their complete source term', () => {
  assert.deepEqual(parseCommand('  #check\tNat  '), { kind: 'check', term: { kind: 'Nat' } });
  const expression = parseCommand('((x : Nat) => x) 2');
  assert.ok('term' in expression);
  assert.deepEqual(parseCommand('#eval ((x : Nat) => x) 2'), {
    kind: 'eval', term: expression.term,
  });
});

test('check reports the same inferred type as a bare expression', () => {
  for (const source of ['0', 'Nat', '(A : Type) => (x : A) => x', 'Refl Nat 2']) {
    assert.equal(processLine(`#check ${source}`), processLine(source));
  }
});

test('eval computes a value instead of only displaying its type', () => {
  const source = '((x : Nat) => Succ x) 1';
  assert.equal(processLine(`#eval ${source}`), '(Succ (Succ 0))');
  assert.equal(processLine(`#check ${source}`), 'Nat');
  assert.equal(processLine(source), 'Nat');
});

test('eval handles dependent applications through the existing Kernel', () => {
  assert.equal(processLine('#eval ((A : Type) => (x : A) => x) Nat 2'), '(Succ (Succ 0))');
  assert.equal(processLine('#eval ((A : Type) => (x : A) => Refl A x) Nat 0'), 'refl 0');
});

test('inspection reads definitions without writing or replacing the environment', () => {
  const definitions = new GlobalEnvironment();
  processLine('def twice := (x : Nat) => Succ (Succ x)', definitions);
  const original = definitions.lookup('twice');
  const environment: Environment = {
    lookup: name => definitions.lookup(name),
    define: () => { throw new Error('Inspection must not define a name'); },
  };
  assert.equal(processLine('#check twice 0', environment), 'Nat');
  assert.equal(processLine('#eval twice 0', environment), '(Succ (Succ 0))');
  assert.equal(definitions.lookup('twice'), original);
});

test('check and eval remain usable as ordinary definition names', () => {
  const environment = new GlobalEnvironment();
  processLine('def check := 1', environment);
  processLine('def eval := 2', environment);
  assert.equal(processLine('#eval check', environment), '(Succ 0)');
  assert.equal(processLine('#check eval', environment), 'Nat');
});

test('inspection rejects ill-typed terms even when evaluation could discard the error', () => {
  for (const command of ['#check', '#eval']) {
    assert.throws(() => processLine(`${command} ((x : Nat) => 0) Type`), TypeError);
    assert.throws(() => processLine(`${command} 0 1`), TypeError);
    assert.throws(() => processLine(`${command} missing`), /Unknown variable/);
  }
});

test('inspection requires an exact command name and a term', () => {
  for (const command of ['#check', '#eval']) {
    assert.throws(() => parseCommand(command), ParseError);
    assert.throws(() => parseCommand(`${command}  `), ParseError);
    assert.throws(() => parseCommand(`${command}x Nat`), ParseError);
    assert.throws(() => parseCommand(`${command} def zero := 0`), ParseError);
  }
});
