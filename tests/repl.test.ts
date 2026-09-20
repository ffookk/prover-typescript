import assert from 'node:assert/strict';
import test from 'node:test';
import { formatProofState, processLine } from '../src/repl/repl';
import { goal, proofState } from '../src/proof/state';
import { Nat, Type } from '../src/syntax/ast';
import { GlobalEnvironment } from '../src/environment/environment';

test('REPL line processing reaches Kernel inference', () => {
  assert.equal(processLine('0'), 'Nat');
  assert.equal(processLine('Succ 0'), 'Nat');
  assert.equal(processLine('(x : Nat) => x'), '(x : Nat) -> Nat');
});

test('REPL line processing reports an unknown variable', () => {
  assert.throws(() => processLine('unknown'), /Unknown variable: unknown/);
});

test('REPL handles exit and blank lines', () => {
  assert.equal(processLine('exit'), null);
  assert.equal(processLine('   '), '');
});

test('REPL definitions persist and can be chained', () => {
  const environment = new GlobalEnvironment();
  assert.equal(processLine('def zero := 0', environment), 'defined zero');
  assert.equal(processLine('def one := Succ zero', environment), 'defined one');
  assert.equal(processLine('one', environment), 'Nat');
});

test('REPL rejects duplicate definitions without replacing the old term', () => {
  const environment = new GlobalEnvironment();
  assert.equal(processLine('def zero := 0', environment), 'defined zero');
  assert.throws(() => processLine('def zero := Succ 0', environment), /already defined: zero/);
  assert.equal(processLine('zero', environment), 'Nat');
});

test('failed and recursive definitions do not enter the environment', () => {
  const environment = new GlobalEnvironment();
  assert.throws(() => processLine('def bad := unknown', environment), /Unknown variable: unknown/);
  assert.equal(environment.lookup('bad'), undefined);
  assert.throws(() => processLine('def loop := loop', environment), /Unknown variable: loop/);
  assert.equal(environment.lookup('loop'), undefined);
});

test('reserved declaration names do not enter the environment or hide builtins', () => {
  const environment = new GlobalEnvironment();
  processLine('def zero := 0', environment);
  const original = environment.lookup('zero');
  for (const name of ['Type', 'Nat', 'Succ', 'Eq', 'Refl']) {
    assert.throws(() => processLine(`def ${name} := 0`, environment), /Reserved definition name/);
    assert.equal(environment.lookup(name), undefined);
    assert.throws(() => processLine(`theorem ${name} : Eq Nat 0 0 := Refl Nat 0`, environment), /Reserved theorem name/);
    assert.equal(environment.lookup(name), undefined);
  }
  assert.equal(environment.lookup('zero'), original);
  assert.equal(processLine('zero', environment), 'Nat');
  assert.equal(processLine('Type', environment), 'Type');
  assert.equal(processLine('Nat', environment), 'Type');
  assert.equal(processLine('Succ zero', environment), 'Nat');
  assert.equal(processLine('Eq Nat zero zero', environment), 'Type');
  assert.equal(processLine('Refl Nat zero', environment), 'Eq Nat 0 0');
});

test('local bindings shadow global definitions', () => {
  const environment = new GlobalEnvironment();
  assert.equal(processLine('def x := 0', environment), 'defined x');
  assert.equal(processLine('(x : Nat) => x', environment), '(x : Nat) -> Nat');
});

test('REPL accepts a theorem whose proof checks against its proposition', () => {
  const environment = new GlobalEnvironment();
  assert.equal(
    processLine('theorem id : (A : Type) -> (x : A) -> A := (A : Type) => (x : A) => x', environment),
    'theorem id',
  );
  assert.ok(environment.lookup('id'));
});

test('REPL can use a stored theorem proof term in a later expression', () => {
  const environment = new GlobalEnvironment();
  processLine('theorem id : (A : Type) -> (x : A) -> A := (A : Type) => (x : A) => x', environment);
  assert.equal(processLine('id Nat', environment), '(x : Nat) -> Nat');
});

test('REPL accepts a direct reflexivity theorem proof term', () => {
  const environment = new GlobalEnvironment();
  assert.equal(
    processLine('theorem refl : (A : Type) -> (x : A) -> Eq A x x := (A : Type) => (x : A) => Refl A x', environment),
    'theorem refl',
  );
  assert.ok(environment.lookup('refl'));
});

test('REPL rejects a theorem with an ill-typed proof without mutating the environment', () => {
  const environment = new GlobalEnvironment();
  assert.throws(() => processLine('theorem bad : Nat := Type', environment));
  assert.equal(environment.lookup('bad'), undefined);
});

test('REPL rejects duplicate theorem declarations without replacing the old proof', () => {
  const environment = new GlobalEnvironment();
  processLine('theorem id : (A : Type) -> (x : A) -> A := (A : Type) => (x : A) => x', environment);
  const original = environment.lookup('id');
  assert.ok(original);
  assert.throws(() => processLine('theorem id : Nat := 0', environment));
  assert.equal(environment.lookup('id'), original);
});

test('REPL formats focused multi-goal state and case metadata', () => {
  const state = proofState([
    goal([{ name: 'n', type: Nat }], Nat, 'zero'),
    goal([{ name: 'n', type: Nat }], Type, 'succ'),
  ]);
  const text = formatProofState(state);
  assert.match(text, /Goals:/);
  assert.match(text, /▶ Goal 1 \(zero\)/);
  assert.match(text, /Goal 2 \(succ\)/);
  assert.match(text, /n : Nat/);
  assert.match(text, /⊢ Type/);
});

test('REPL formats completed proof state explicitly', () => {
  assert.equal(formatProofState(proofState([])), 'No goals.\nProof complete.');
});
