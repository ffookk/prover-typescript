import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

async function startServer(t: TestContext): Promise<number> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "prover-web-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await copyFile(path.resolve(__dirname, "../../server.cjs"), path.join(directory, "server.cjs"));
  await mkdir(path.join(directory, "dist-web"));
  await writeFile(path.join(directory, "dist-web/index.html"), "proof course");
  await writeFile(path.join(directory, "dist-web/a b.txt"), "encoded asset");

  // Retry if another process takes the ephemeral port before the child binds it.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reservation = net.createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as net.AddressInfo).port;
    await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
    const child = spawn(process.execPath, [path.join(directory, "server.cjs")], {
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    const exited = once(child, "exit");
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
    });
    const ready = await Promise.race([
      once(child.stdout, "data").then(() => true),
      exited.then(() => false),
    ]);
    if (ready) return port;
    if (!stderr.includes("EADDRINUSE")) throw new Error(`Web server failed to start: ${stderr}`);
  }
  throw new Error("Could not reserve a port for the web server");
}

function request(port: number, requestPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: requestPath }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode!, body }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("Web request timed out")));
  });
}

for (const badPath of ["/%", "/%E0%A4%A", "/%00"]) {
  test(`web server rejects ${badPath} without stopping subsequent requests`, { timeout: 10000 }, async t => {
    const port = await startServer(t);
    assert.equal((await request(port, badPath)).status, 400);
    assert.deepEqual(await request(port, "/"), { status: 200, body: "proof course" });
  });
}

test("web server keeps encoded assets, query strings, and SPA fallback working", { timeout: 10000 }, async t => {
  const port = await startServer(t);
  assert.deepEqual(await request(port, "/a%20b.txt?x=%"), { status: 200, body: "encoded asset" });
  assert.deepEqual(await request(port, "/lesson/one"), { status: 200, body: "proof course" });
  assert.equal((await request(port, "/%2e%2e/server.cjs")).status, 403);
});
