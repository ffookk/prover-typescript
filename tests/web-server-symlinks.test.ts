import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

async function startServer(t: TestContext, linkedIndex = false): Promise<number> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "prover-web-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await copyFile(path.resolve(__dirname, "../../server.cjs"), path.join(directory, "server.cjs"));
  await mkdir(path.join(directory, "dist-web"));
  await mkdir(path.join(directory, "outside"));
  await writeFile(path.join(directory, "outside/fixture.txt"), "outside fixture");
  await symlink("../outside/fixture.txt", path.join(directory, "dist-web/linked.txt"));
  await symlink("../outside", path.join(directory, "dist-web/linked-directory"));
  await symlink("a b.txt", path.join(directory, "dist-web/internal.txt"));
  await symlink("a b.txt", path.join(directory, "dist-web/internal.js"));
  if (linkedIndex) {
    await symlink("../outside/fixture.txt", path.join(directory, "dist-web/index.html"));
  } else {
    await writeFile(path.join(directory, "dist-web/index.html"), "proof course");
  }
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

function request(port: number, requestPath: string): Promise<{ status: number; body: string; contentType?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: requestPath }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode!, body, contentType: response.headers["content-type"] }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("Web request timed out")));
  });
}

test("static symlinks cannot serve files outside the web build", { timeout: 10000 }, async t => {
  const port = await startServer(t);
  for (const asset of ["/linked.txt", "/linked-directory/fixture.txt"]) {
    const response = await request(port, asset);
    assert.equal(response.status, 403, asset);
    assert.equal(response.body, "Forbidden", asset);
  }
  assert.deepEqual(await request(port, "/internal.js"), { status: 200, body: "encoded asset", contentType: "text/javascript; charset=utf-8" });
  assert.deepEqual(await request(port, "/internal.txt"), { status: 200, body: "encoded asset", contentType: "application/octet-stream" });
  assert.deepEqual(await request(port, "/"), { status: 200, body: "proof course", contentType: "text/html; charset=utf-8" });
});

test("the application fallback also rejects an external index symlink", { timeout: 10000 }, async t => {
  const port = await startServer(t, true);
  for (const route of ["/", "/lesson/one"]) {
    const response = await request(port, route);
    assert.equal(response.status, 403, route);
    assert.equal(response.body, "Forbidden", route);
  }
  assert.deepEqual(await request(port, "/a%20b.txt"), { status: 200, body: "encoded asset", contentType: "application/octet-stream" });
});
