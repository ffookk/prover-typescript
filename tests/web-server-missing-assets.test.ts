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

test("missing static assets return 404 instead of the application document", { timeout: 10000 }, async t => {
  const port = await startServer(t);
  for (const asset of ["/assets/missing.js", "/assets/missing.css?v=1", "/missing.png", "/missing.json"]) {
    const response = await request(port, asset);
    assert.equal(response.status, 404, asset);
    assert.notEqual(response.body, "proof course", asset);
  }
});

test("static assets and extensionless navigation keep working after a miss", { timeout: 10000 }, async t => {
  const port = await startServer(t);
  await request(port, "/missing.js");
  assert.deepEqual(await request(port, "/a%20b.txt?version=1"), { status: 200, body: "encoded asset" });
  assert.deepEqual(await request(port, "/lesson/one"), { status: 200, body: "proof course" });
  assert.deepEqual(await request(port, "/"), { status: 200, body: "proof course" });
});
