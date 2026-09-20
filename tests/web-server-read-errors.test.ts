import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

async function serverWithReadFailures(t: TestContext): Promise<number> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prover-read-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await copyFile(path.resolve(__dirname, '../../server.cjs'), path.join(directory, 'server.cjs'));
  await mkdir(path.join(directory, 'dist-web'));
  await writeFile(path.join(directory, 'dist-web/index.html'), 'proof course');
  await writeFile(path.join(directory, 'dist-web/vanishing.txt'), 'removed before open');
  await writeFile(path.join(directory, 'dist-web/interrupted.txt'), 'x'.repeat(1024 * 1024));
  // Inject filesystem failures at deterministic points while running the real
  // server and real HTTP requests. No timing races or platform permissions.
  await writeFile(path.join(directory, 'bootstrap.cjs'), `
    const fs = require('node:fs');
    const path = require('node:path');
    const http = require('node:http');
    const originalRead = fs.createReadStream;
    fs.createReadStream = function(file, ...args) {
      if (path.basename(file) === 'vanishing.txt') fs.unlinkSync(file);
      const stream = originalRead.call(this, file, ...args);
      if (path.basename(file) === 'interrupted.txt') {
        stream.once('data', () => process.nextTick(() => stream.destroy(new Error('synthetic read failure'))));
      }
      return stream;
    };
    const originalServer = http.createServer;
    http.createServer = function(...args) {
      const server = originalServer.apply(this, args);
      server.once('listening', () => process.send({ port: server.address().port }));
      return server;
    };
    require('./server.cjs');
  `);
  const child = fork(path.join(directory, 'bootstrap.cjs'), [], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
    silent: true,
  });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  });
  child.stdout?.resume();
  child.stderr?.resume();
  const message = await Promise.race([
    once(child, 'message').then(([value]) => value as { port: number }),
    exited.then(() => { throw new Error('Web server exited before listening'); }),
  ]);
  return message.port;
}

function request(port: number, requestPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: requestPath }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode!, body }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Request timed out')));
  });
}

test('a file disappearing before open returns an error and keeps the server available', { timeout: 10000 }, async t => {
  const port = await serverWithReadFailures(t);
  assert.deepEqual(await request(port, '/vanishing.txt'), { status: 500, body: 'Unable to read file' });
  assert.deepEqual(await request(port, '/'), { status: 200, body: 'proof course' });
});

test('a read failure after response headers closes that response without stopping the server', { timeout: 10000 }, async t => {
  const port = await serverWithReadFailures(t);
  await assert.rejects(request(port, '/interrupted.txt'));
  assert.deepEqual(await request(port, '/'), { status: 200, body: 'proof course' });
});
