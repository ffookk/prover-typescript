import assert from 'node:assert/strict';
import test from 'node:test';
import { GlobalEnvironment } from '../src/environment/environment';
import { parseCommand } from '../src/parser/command';
import { ParseError, parse } from '../src/parser/parser';
import { processLine } from '../src/repl/repl';

test('terms accept trailing and multiline -- comments', () => {
  assert.deepEqual(parse('Succ 0 -- one'), parse('Succ 0'));
  assert.deepEqual(parse('(x : Nat) -- binder\n -> Nat'), parse('(x : Nat) -> Nat'));
  assert.deepEqual(parse('Succ -- ignored syntax := )\r\n0'), parse('Succ 0'));
});

test('comment text cannot introduce a command separator or declaration', () => {
  const source = 'theorem self : Eq Nat 0 0 -- not a separator :=\n := Refl Nat 0 -- proof';
  assert.deepEqual(parseCommand(source), parseCommand('theorem self : Eq Nat 0 0 := Refl Nat 0'));
  assert.throws(() => parseCommand('def one -- := 1'), ParseError);
});

test('REPL skips comment-only lines and permits comments after exit', () => {
  assert.equal(processLine('  -- lesson notes'), '');
  assert.equal(processLine('-- first\n -- second'), '');
  assert.equal(processLine('exit -- done'), null);
});

test('REPL definitions and later references accept comments', () => {
  const environment = new GlobalEnvironment();
  assert.equal(processLine('def one := Succ 0 -- remember one', environment), 'defined one');
  assert.equal(processLine('one -- inspect its type', environment), 'Nat');
});

test('comment removal preserves error positions and does not join tokens', () => {
  const source = '0 -- ignored\n @';
  assert.throws(() => parse(source), new RegExp(`position ${source.indexOf('@')}$`));
  assert.deepEqual(parse('Su-- comment\ncc'), parse('Su cc'));
  assert.throws(() => parse('0 - 1'), ParseError);
});
