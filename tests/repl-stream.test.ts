import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';
import { startRepl } from '../src/repl/repl';

async function runInput(source: string): Promise<string> {
  let transcript = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      transcript += chunk.toString();
      callback();
    },
  });
  // A single input chunk models a file or pipe that closes before all queued
  // readline events have been consumed by the asynchronous REPL loop.
  await startRepl(Readable.from([source]), output);
  return transcript;
}

test('REPL drains piped definitions and evaluates later references after EOF', async () => {
  const transcript = await runInput('def zero := 0\ndef one := Succ zero\none\n');
  assert.match(transcript, /defined zero\n(?:> )?defined one\n(?:> )?Nat\n/);
  assert.doesNotMatch(transcript, /Error/);
});

test('REPL continues through a queued error and blank line after EOF', async () => {
  const transcript = await runInput('unknown\n\n0\n');
  assert.match(transcript, /Error \[ElaborationError\]: Unknown variable: unknown\n/);
  assert.match(transcript, /(?:^|\n)(?:> )?Nat\n/);
});

test('REPL processes the final queued command without a trailing newline', async () => {
  const transcript = await runInput('def zero := 0\nzero');
  assert.match(transcript, /defined zero\n(?:> )?Nat\n/);
});

test('explicit exit still stops processing buffered commands', async () => {
  const transcript = await runInput('0\nexit\ndef after_exit := 0\n');
  assert.match(transcript, /Nat\n/);
  assert.doesNotMatch(transcript, /defined after_exit|Error/);
});

test('REPL completes cleanly with empty input', async () => {
  assert.equal(await runInput(''), 'prover-typescript REPL\n> ');
});
