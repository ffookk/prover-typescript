import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PassThrough, Writable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { parse, ParseError } from '../src/parser/parser';
import { startRepl } from '../src/repl/repl';
import { SurfaceTerm } from '../src/syntax/surface';

function naturalValue(term: SurfaceTerm): number {
  let value = 0;
  while (term.kind === 'Succ') { value += 1; term = term.value; }
  assert.equal(term.kind, 'Zero');
  return value;
}

test('decimal literals retain their values, including leading zeroes', () => {
  for (const [source, value] of [['0', 0], ['1', 1], ['00042', 42]] as const) {
    assert.equal(naturalValue(parse(source)), value);
  }
});

test('a single decimal literal cannot exceed the expansion budget', () => {
  assert.throws(() => parse('10001'), { name: 'ParseError', message: /numeral expansion limit/i });
});

test('the expansion budget is shared by all decimal literals in one term', () => {
  assert.throws(() => parse('Eq Nat 6000 6000'), ParseError);
  assert.throws(() => parse('(n : Eq Nat 4000 3000) => 4000'), ParseError);
});

test('decimal literals can use the whole expansion budget without truncation', () => {
  assert.equal(naturalValue(parse('10000')), 10000);
  const equality = parse('Eq Nat 6000 4000');
  assert.equal(equality.kind, 'Eq');
  assert.equal(naturalValue(equality.left), 6000);
  assert.equal(naturalValue(equality.right), 4000);
});

test('each parse receives a fresh budget after a successful or rejected term', () => {
  assert.equal(naturalValue(parse('10000')), 10000);
  assert.throws(() => parse('10001'), ParseError);
  assert.equal(naturalValue(parse('10000')), 10000);
});

test('unsafe integer literals remain rejected before expansion', () => {
  for (const source of ['9007199254740992', '9'.repeat(400)]) {
    assert.throws(() => parse(source), ParseError);
  }
});

test('a huge safe integer is rejected without exhausting the process heap', { timeout: 5000 }, () => {
  // Isolate this regression: the original expansion aborts the process rather
  // than throwing a catchable error. Limit both memory and execution time.
  const script = `
    const { parse, ParseError } = require(${JSON.stringify(require.resolve('../src/parser/parser'))});
    try { parse('9007199254740991'); process.exitCode = 2; }
    catch (error) { process.exitCode = error instanceof ParseError ? 0 : 3; }
  `;
  const result = spawnSync(process.execPath, ['--max-old-space-size=24', '-e', script], {
    encoding: 'utf8', timeout: 3000, maxBuffer: 64 * 1024,
  });
  assert.equal(result.error, undefined, 'The bounded parser probe must finish normally');
  assert.equal(result.signal, null, 'The parser must not abort or time out');
  assert.equal(result.status, 0, 'A huge safe integer must produce a catchable ParseError');
});

test('REPL rejects an oversized definition and continues with later commands', { timeout: 5000 }, async () => {
  const input = new PassThrough();
  let transcript = '';
  const output = new Writable({
    write(chunk, _encoding, callback) { transcript += chunk.toString(); callback(); },
  });
  const running = startRepl(input, output);
  try {
    // Keep the stream open between lines so this test is independent of EOF
    // buffering behavior and exercises the interactive error-recovery path.
    for (const line of ['def large := 10001', 'def large := 0', 'large', 'exit']) {
      input.write(line + '\n');
      await setImmediate();
    }
    await running;
    assert.match(transcript, /Error \[ParseError\]: .*numeral expansion limit/i);
    assert.match(transcript, /defined large\n/);
    assert.match(transcript, /(?:^|\n)(?:> )?Nat\n/);
    assert.doesNotMatch(transcript, /already defined|RangeError/);
  } finally {
    input.destroy();
    output.destroy();
  }
});
