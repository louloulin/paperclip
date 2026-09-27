/**
 * Real spawn test: forks `dist/worker.js` exactly the way the host does
 * (`child_process.fork`, minimal env, NDJSON over stdin/stdout) and drives the
 * real host→worker protocol: `initialize`, `health`, `getData`, `performAction`.
 *
 * This is the test that caught the real install blocker: the first version of
 * this project imported `@paperclipai/plugin-sdk` as a bare specifier, so the
 * worker died with ERR_MODULE_NOT_FOUND the moment a host forked it. Unit tests
 * on the plugin object never noticed; only a real spawn does.
 */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import manifest from "../src/manifest.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerEntrypoint = path.join(packageRoot, "dist", "worker.js");
const TIMEOUT_MS = 15_000;

function startWorker({ config = {}, instanceState = {}, companyState = {} } = {}) {
  // Mirror server/src/services/plugin-worker-manager.ts: a minimal env, no
  // host secrets, and NDJSON framing on stdin/stdout.
  const child = fork(workerEntrypoint, [], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH ?? "", PAPERCLIP_PLUGIN_ID: manifest.id },
  });
  const pending = new Map();
  const stderr = [];
  const hostState = { config, instanceState, companyState, written: [] };
  let buffer = "";
  let nextId = 1;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) handleLine(line);
      index = buffer.indexOf("\n");
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  /** Answer worker→host RPCs the way a real host would. */
  function handleLine(line) {
    const message = JSON.parse(line);
    if (message.id !== undefined && message.method) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: answerHostCall(message) })}\n`);
      return;
    }
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      waiter(message);
    }
  }

  function answerHostCall({ method, params }) {
    switch (method) {
      case "config.get":
        return hostState.config;
      case "state.get": {
        const bucket = params.scopeKind === "company" ? hostState.companyState : hostState.instanceState;
        return bucket[params.stateKey] ?? null;
      }
      case "state.set": {
        const bucket = params.scopeKind === "company" ? hostState.companyState : hostState.instanceState;
        bucket[params.stateKey] = params.value;
        hostState.written.push({ method, scopeKind: params.scopeKind, stateKey: params.stateKey, value: params.value });
        return null;
      }
      case "state.delete":
        return null;
      default:
        return {};
    }
  }

  return {
    child,
    stderr,
    hostState,
    call(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`timeout waiting for ${method}; stderr=${stderr.join("")}`));
        }, TIMEOUT_MS);
        pending.set(id, (message) => {
          clearTimeout(timer);
          if (message.error) reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
          else resolve(message.result);
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
    async close() {
      try {
        await this.call("shutdown", {});
      } catch {
        // A worker that already exited answers nothing; that is fine.
      }
      child.kill();
    },
  };
}

test("worker boots under a real fork and completes the host handshake", async (t) => {
  const worker = startWorker();
  t.after(() => worker.close());

  const initialized = await worker.call("initialize", {
    manifest,
    config: { mode: "auto", translateAttributes: true, skipCodeBlocks: true },
    instanceInfo: { instanceId: "00000000-0000-4000-8000-000000000000", hostVersion: "2026.916.1" },
    apiVersion: 1,
  });
  assert.equal(initialized.ok, true, `stderr=${worker.stderr.join("")}`);
  assert.ok(Array.isArray(initialized.supportedMethods));
});

test("health probe reports the dictionary size", async (t) => {
  const worker = startWorker();
  t.after(() => worker.close());
  await worker.call("initialize", {
    manifest,
    config: {},
    instanceInfo: { instanceId: "00000000-0000-4000-8000-000000000000", hostVersion: "2026.916.1" },
    apiVersion: 1,
  });
  const health = await worker.call("health", {});
  assert.equal(health.status, "ok");
  assert.match(health.message, /zh-CN/);
  assert.ok(health.details.dictionaryEntries >= 300);
});

test("i18n-settings data handler and set-i18n-mode action work over the bridge", async (t) => {
  const worker = startWorker({ config: { mode: "off" } });
  t.after(() => worker.close());
  await worker.call("initialize", {
    manifest,
    config: { mode: "off" },
    instanceInfo: { instanceId: "00000000-0000-4000-8000-000000000000", hostVersion: "2026.916.1" },
    apiVersion: 1,
  });

  const settings = await worker.call("getData", { key: "i18n-settings", params: {} });
  assert.equal(settings.locale, "zh-CN");
  assert.equal(settings.mode, "off", "operator config wins when no stored preference exists");
  assert.ok(settings.dictionaryEntries >= 300);

  const action = await worker.call("performAction", {
    key: "set-i18n-mode",
    params: { mode: "on" },
  });
  assert.equal(action.ok, true);
  assert.equal(action.mode, "on");
  assert.deepEqual(worker.hostState.written, [
    { method: "state.set", scopeKind: "instance", stateKey: "ui-mode", value: "on" },
  ]);

  const after = await worker.call("getData", { key: "i18n-settings", params: {} });
  assert.equal(after.mode, "on", "the stored preference wins over the operator config default");

  const rejected = await worker.call("performAction", {
    key: "set-i18n-mode",
    params: { mode: "sideways" },
  });
  assert.equal(rejected.ok, false, "invalid modes are refused, not persisted");
  assert.equal(worker.hostState.written.length, 1, "a refused mode must not write state");
});

test("a company-scoped preference overrides the instance value", async (t) => {
  const companyId = "11111111-1111-4111-8111-111111111111";
  const worker = startWorker({ config: { mode: "off" }, instanceState: { "ui-mode": "auto" } });
  t.after(() => worker.close());
  await worker.call("initialize", {
    manifest,
    config: { mode: "off" },
    instanceInfo: { instanceId: "00000000-0000-4000-8000-000000000000", hostVersion: "2026.916.1" },
    apiVersion: 1,
  });
  const saved = await worker.call("performAction", { key: "set-i18n-mode", params: { mode: "on", companyId } });
  assert.equal(saved.scope, "company");
  assert.equal(worker.hostState.companyState["ui-mode"], "on");

  const settings = await worker.call("getData", { key: "i18n-settings", params: { companyId } });
  assert.equal(settings.mode, "on", "the company value is the most specific one");
});

test("unknown data keys fail loudly instead of returning junk", async (t) => {
  const worker = startWorker();
  t.after(() => worker.close());
  await worker.call("initialize", {
    manifest,
    config: {},
    instanceInfo: { instanceId: "00000000-0000-4000-8000-000000000000", hostVersion: "2026.916.1" },
    apiVersion: 1,
  });
  await assert.rejects(() => worker.call("getData", { key: "nope", params: {} }));
});

test("the built UI entry keeps only host-rewritable bare specifiers", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(path.join(packageRoot, "dist", "ui", "index.js"), "utf8");
  const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  const bare = specifiers.filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("/"));
  for (const specifier of bare) {
    assert.ok(
      ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"].includes(specifier),
      `unexpected bare specifier in the UI bundle: ${specifier}`,
    );
  }
  assert.ok(specifiers.some((specifier) => specifier === "react"), "the UI bundle must use the host React shim");
});
