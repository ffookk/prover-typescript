import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCommand } from '../src/parser/command';

test('command parser reads definitions', () => {
  assert.deepEqual(parseCommand('def zero := 0'), {
    kind: 'def',
    name: 'zero',
    term: { kind: 'Zero' },
  });
  assert.equal(parseCommand('def one := Succ 0').kind, 'def');
});

test('command parser keeps ordinary terms as term commands', () => {
  assert.equal(parseCommand('0').kind, 'term');
  assert.equal(parseCommand('Succ 0').kind, 'term');
  assert.equal(parseCommand('(x : Nat) => x').kind, 'term');
});

test('command parser rejects malformed definitions', () => {
  assert.throws(() => parseCommand('def'), /Expected 'def name := term'/);
  assert.throws(() => parseCommand('def 123 := 0'), /Invalid definition name/);
  assert.throws(() => parseCommand('def x = 0'), /Expected 'def name := term'/);
  assert.throws(() => parseCommand('def x :='), /Expected a term after :=/);
});

test('command parser reads theorem declarations', () => {
  const command = parseCommand('theorem id : (A : Type) -> (x : A) -> A := (A : Type) => (x : A) => x');
  assert.equal(command.kind, 'theorem');
  if (command.kind !== 'theorem') return;
  assert.equal(command.name, 'id');
  assert.equal(command.proposition.kind, 'Pi');
  assert.equal(command.proof.kind, 'Lambda');
});

test('command parser rejects malformed theorem declarations', () => {
  assert.throws(() => parseCommand('theorem id'), /Expected 'theorem name : proposition := proof'/);
  assert.throws(() => parseCommand('theorem 1id : Nat := 0'), /Invalid theorem name/);
  assert.throws(() => parseCommand('theorem id :='), /Expected 'theorem name : proposition := proof'/);
  assert.throws(() => parseCommand('theorem id : Nat :='), /Expected a proof after :=/);
});

test('command parser rejects constructor keywords as declaration names', () => {
  for (const name of ['Type', 'Nat', 'Succ', 'Eq', 'Refl']) {
    assert.throws(() => parseCommand(`def ${name} := 0`), {
      name: 'ParseError', message: `Reserved definition name: ${name}`,
    });
    assert.throws(() => parseCommand(`theorem ${name} : Eq Nat 0 0 := Refl Nat 0`), {
      name: 'ParseError', message: `Reserved theorem name: ${name}`,
    });
  }
});

test('command parser keeps lowercase and keyword-prefixed names available', () => {
  for (const name of ['type', 'nat', 'succ', 'eq', 'refl', 'Natural', "Nat'"]) {
    assert.equal(parseCommand(`def ${name} := 0`).kind, 'def');
    assert.equal(parseCommand(`theorem ${name} : Eq Nat 0 0 := Refl Nat 0`).kind, 'theorem');
  }
});
