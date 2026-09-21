import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { startRepl } from '../src/repl/repl';

function assertReleased(input: PassThrough): void {
  assert.equal(input.listenerCount('data'), 0);
  assert.equal(input.listenerCount('end'), 0);
  assert.equal(input.listenerCount('error'), 0);
  assert.equal(input.readableFlowing, false);
  assert.equal(input.destroyed, false);
}

test('REPL releases its input handlers after an input error', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const failure = new Error('synthetic input failure');
  try {
    const running = startRepl(input, output);
    input.emit('error', failure);
    await assert.rejects(running, error => error === failure);
    assertReleased(input);
  } finally {
    input.destroy();
    output.destroy();
  }
});

test('REPL releases input when writing the startup banner throws', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const failure = new Error('synthetic output failure');
  output.write = () => { throw failure; };
  try {
    await assert.rejects(startRepl(input, output), error => error === failure);
    assertReleased(input);
  } finally {
    input.destroy();
    output.destroy();
  }
});

test('REPL releases input when writing command output throws', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const failure = new Error('synthetic command output failure');
  try {
    const running = startRepl(input, output);
    output.write = () => { throw failure; };
    input.write('0\n');
    await assert.rejects(running, error => error === failure);
    assertReleased(input);
  } finally {
    input.destroy();
    output.destroy();
  }
});

test('REPL still closes normally on EOF and explicit exit', async () => {
  for (const exit of [false, true]) {
    const input = new PassThrough({ autoDestroy: false });
    const output = new PassThrough();
    let transcript = '';
    output.on('data', chunk => { transcript += String(chunk); });
    try {
      const running = startRepl(input, output);
      if (exit) input.write('exit\n');
      else input.end('0\n');
      await running;
      assertReleased(input);
      assert.match(transcript, /prover-typescript REPL/);
      if (!exit) assert.match(transcript, /Nat\n/);
      assert.doesNotMatch(transcript, /Error/);
    } finally {
      input.destroy();
      output.destroy();
    }
  }
});
