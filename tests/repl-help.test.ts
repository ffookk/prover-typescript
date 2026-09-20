import assert from 'node:assert/strict';
import test from 'node:test';
import { Environment } from '../src/environment/environment';
import { parseCommand } from '../src/parser/command';
import { ParseError } from '../src/parser/parser';
import { processLine } from '../src/repl/repl';

test('#help is a standalone command with surrounding whitespace', () => {
  assert.deepEqual(parseCommand('  #help\t'), { kind: 'help' });
  assert.equal(processLine(' #help '), processLine('#help'));
});

test('#help lists usable examples without reading or changing the environment', () => {
  const environment: Environment = {
    lookup() { throw new Error('Help must not read definitions'); },
    define() { throw new Error('Help must not create definitions'); },
  };
  const output = processLine('#help', environment);
  assert.ok(output);
  for (const example of ['Nat', 'def zero := 0', 'theorem self : Eq Nat 0 0 := Refl Nat 0', 'exit', '#help']) {
    assert.ok(output.includes(example), `missing help example: ${example}`);
  }
  assert.equal(processLine('Nat'), 'Type');
  assert.equal(processLine('def zero := 0'), 'defined zero');
  assert.equal(processLine('theorem self : Eq Nat 0 0 := Refl Nat 0'), 'theorem self');
});

test('#help rejects arguments and command-name prefixes', () => {
  for (const source of ['#help Nat', '#helpful', '#help()']) {
    assert.throws(() => parseCommand(source), ParseError);
  }
});
