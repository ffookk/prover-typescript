import assert from 'node:assert/strict';
import test from 'node:test';
import { parse, ParseError } from '../src/parser/parser';
import { elaborate } from '../src/elaborator/elaborate';
import { GlobalEnvironment } from '../src/environment/environment';
import { check, TypeError } from '../src/kernel/typecheck';
import { normalize } from '../src/kernel/reduction';
import { processLine } from '../src/repl/repl';
import { Nat, Type, Zero, eq, natLiteral, pi, refl, variable } from '../src/syntax/ast';

const naturalMotive = '((n : Nat) => Nat)';
const incrementStep = '((n : Nat) => (ih : Nat) => Succ ih)';

test('parser reads the existing natural and equality recursor surface nodes', () => {
  const natural = parse('Nat.rec P z s n');
  assert.deepEqual(natural, {
    kind: 'NatRec',
    motive: { kind: 'Var', name: 'P' },
    zeroCase: { kind: 'Var', name: 'z' },
    succCase: { kind: 'Var', name: 's' },
    scrutinee: { kind: 'Var', name: 'n' },
  });
  assert.deepEqual(parse('Eq.rec P r a b h'), {
    kind: 'EqRec',
    motive: { kind: 'Var', name: 'P' },
    reflCase: { kind: 'Var', name: 'r' },
    left: { kind: 'Var', name: 'a' },
    right: { kind: 'Var', name: 'b' },
    equality: { kind: 'Var', name: 'h' },
  });
});

test('recursor operands follow atom precedence and can be grouped or nested', () => {
  const source = `Succ (Nat.rec ${naturalMotive} (Nat.rec ${naturalMotive} 0 ${incrementStep} 2) ${incrementStep} 0)`;
  const term = elaborate(parse(source));
  check([], term, Nat);
  assert.deepEqual(normalize(term), natLiteral(3));
  const applied = parse('Nat.rec P z s n x');
  assert.equal(applied.kind, 'App');
  if (applied.kind !== 'App') throw new Error('expected application');
  assert.equal(applied.fn.kind, 'NatRec');
  assert.deepEqual(applied.arg, { kind: 'Var', name: 'x' });
  assert.deepEqual(parse('f Nat.rec P z s n'), {
    kind: 'App', fn: { kind: 'Var', name: 'f' }, arg: parse('Nat.rec P z s n'),
  });
});

test('REPL defines and calls a recursive function through the Kernel', () => {
  const environment = new GlobalEnvironment();
  const source = `def count := (n : Nat) => Nat.rec ${naturalMotive} 0 ${incrementStep} n`;
  assert.equal(processLine(source, environment), 'defined count');
  assert.equal(processLine('Succ (count 3)', environment), 'Nat');
  const term = elaborate(parse('count 3'), [], environment);
  check([], term, Nat);
  assert.deepEqual(normalize(term), natLiteral(3));
});

test('REPL accepts dependent natural-recursion proofs', () => {
  const environment = new GlobalEnvironment();
  const source = 'theorem self : (n : Nat) -> Eq Nat n n := (n : Nat) => Nat.rec ((k : Nat) => Eq Nat k k) (Refl Nat 0) ((k : Nat) => (ih : Eq Nat k k) => Refl Nat (Succ k)) n';
  assert.equal(processLine(source, environment), 'theorem self');
  const proof = environment.lookup('self');
  assert.ok(proof);
  check([], proof, pi(Nat, eq(Nat, variable(0), variable(0))));
  const applied = elaborate(parse('self 2'), [], environment);
  check([], applied, eq(Nat, natLiteral(2), natLiteral(2)));
  assert.deepEqual(normalize(applied), refl(Nat, natLiteral(2)));
});

test('REPL equality transport supports a dependent motive and a local equality', () => {
  const environment = new GlobalEnvironment();
  const source = 'theorem transport : (a : Nat) -> (b : Nat) -> (h : Eq Nat a b) -> Eq Nat b b := (a : Nat) => (b : Nat) => (h : Eq Nat a b) => Eq.rec ((n : Nat) => Eq Nat n n) (Refl Nat a) a b h';
  assert.equal(processLine(source, environment), 'theorem transport');
  const proof = environment.lookup('transport');
  assert.ok(proof);
  const proposition = elaborate(parse('(a : Nat) -> (b : Nat) -> (h : Eq Nat a b) -> Eq Nat b b'));
  check([], proposition, Type);
  check([], proof, proposition);
  const applied = elaborate(parse('transport 0 0 (Refl Nat 0)'), [], environment);
  check([], applied, eq(Nat, Zero, Zero));
  assert.deepEqual(normalize(applied), refl(Nat, Zero));
});

test('recursor type errors are rejected before REPL definitions are stored', () => {
  const environment = new GlobalEnvironment();
  for (const body of [
    `Nat.rec ${naturalMotive} Type ${incrementStep} 0`,
    `Nat.rec ${naturalMotive} 0 ${incrementStep} Type`,
    'Eq.rec ((n : Nat) => Nat) 0 0 1 (Refl Nat 0)',
  ]) {
    assert.throws(() => processLine(`def bad := ${body}`, environment), TypeError);
    assert.equal(environment.lookup('bad'), undefined);
  }
});

test('recursors require every argument and cannot be binding or declaration names', () => {
  for (const source of ['Nat.rec P z s', 'Eq.rec P r a b', '(Nat.rec : Nat) => 0', '(Eq.rec : Nat) -> Nat']) {
    assert.throws(() => parse(source), ParseError);
  }
  for (const name of ['Nat.rec', 'Eq.rec']) {
    assert.throws(() => processLine(`def ${name} := 0`), ParseError);
    assert.throws(() => processLine(`theorem ${name} : Nat := 0`), ParseError);
  }
});

test('recursor tokenization preserves ordinary names and rejects unsupported dotted names', () => {
  for (const name of ['Nat_rec', 'Eq_rec', 'rec', 'Natrec', 'Eqrec']) {
    assert.deepEqual(parse(name), { kind: 'Var', name });
  }
  for (const source of ['Nat.recursive', 'Nat.rec0', "Eq.rec'", 'Eq.rec.more', 'Other.rec']) {
    assert.throws(() => parse(source), ParseError);
  }
});
