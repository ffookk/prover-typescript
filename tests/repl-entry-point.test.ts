import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const entryPoint = require.resolve('../src/index');
const packageRoot = resolve(__dirname, '../..');

function assertSilentImport(target: string): void {
  const script = `
    const assert = require('node:assert/strict');
    const flowBefore = process.stdin.readableFlowing;
    const listenersBefore = process.stdin.listenerCount('data');
    require(${JSON.stringify(target)});
    assert.equal(process.stdin.readableFlowing, flowBefore, 'Import must not start reading stdin');
    assert.equal(process.stdin.listenerCount('data'), listenersBefore, 'Import must not attach a REPL input listener');
    process.stdout.write('imported\\n');
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    input: '0\nexit\n', encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'imported\n');
}

test('requiring the compiled entry point leaves stdin and output untouched', () => {
  assertSilentImport(entryPoint);
});

test('requiring the package through its main field does not start a REPL', () => {
  assertSilentImport(packageRoot);
});

test('executing the entry point directly still starts the REPL', () => {
  const result = spawnSync(process.execPath, [entryPoint], {
    input: '0\nexit\n', encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^prover-typescript REPL\n> /);
  assert.match(result.stdout, /(?:^|\n)(?:> )?Nat\n/);
});
