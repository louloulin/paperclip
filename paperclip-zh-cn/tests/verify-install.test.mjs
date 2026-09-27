/**
 * Guards on the real install verifier itself.
 *
 * The value of `scripts/verify-install.mjs` is that it can only go green
 * against a real Paperclip. These tests pin that property: with no host on the
 * other end it must fail loudly (non-zero exit, a recorded failing step), and
 * the driver must expose it as a first-class command. A verifier that degrades
 * to "skip" is worse than no verifier at all.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifier = path.join(packageRoot, "scripts", "verify-install.mjs");
const TIMEOUT_MS = 60_000;

/** A port nothing is listening on: connect fails fast, unlike a black hole. */
async function deadPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function runVerifier(args) {
  return spawnSync(process.execPath, [verifier, ...args], { encoding: "utf8", timeout: TIMEOUT_MS });
}

test("the verifier fails instead of reporting green when no host answers", async () => {
  const apiUrl = `http://127.0.0.1:${await deadPort()}`;
  const result = runVerifier(["--api-url", apiUrl]);
  assert.notEqual(result.status, 0, `expected a non-zero exit; stdout=${result.stdout} stderr=${result.stderr}`);
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, /✗\s+target/, "the failing step must be named");
  assert.doesNotMatch(output, /real install verified/, "a dead host must never read as verified");
});

test("the driver exposes `paperclip-zh verify`", () => {
  const help = spawnSync(process.execPath, [path.join(packageRoot, "bin", "paperclip-zh.mjs"), "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /verify/);
});

test("every verification step is named in the script, in install order", () => {
  const source = spawnSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8'))", verifier], {
    encoding: "utf8",
  }).stdout;
  const order = [
    "target",
    "install",
    "enable",
    "registry",
    "contribution",
    "ui-bundle",
    "ui-runtime",
    "worker-rpc",
    "worker-state",
    "rollback",
    "resume",
    "uninstall",
  ];
  let cursor = -1;
  for (const name of order) {
    const next = source.indexOf(`"${name}"`, cursor + 1);
    assert.ok(next > cursor, `step ${name} is missing or out of order in verify-install.mjs`);
    cursor = next;
  }
});
