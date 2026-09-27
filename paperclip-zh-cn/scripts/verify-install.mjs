#!/usr/bin/env node
/**
 * verify-install — REAL end-to-end install verification against a live
 * Paperclip instance.
 *
 * Everything the unit tests and `check-install-contract.mjs` do is local. This
 * script is the other half: it drives a real host over HTTP and asserts the
 * things only a real host can prove.
 *
 *   1. target       the instance answers /api/health (no false green on a dead port)
 *   2. install      POST /api/plugins/install with this directory as a local path
 *   3. enable       POST /api/plugins/:id/enable
 *   4. registry     GET  /api/plugins/:id/health
 *   5. contribution GET  /api/plugins/ui-contributions lists our slot
 *   6. ui bundle    GET  /_plugins/:id/ui/index.js — the host serves OUR bytes
 *   7. ui runtime   the bytes the host served actually translate a Paperclip page
 *   8. worker RPC   POST /api/plugins/:id/bridge/data — a real forked worker answers
 *   9. worker state POST /api/plugins/:id/bridge/action — the state write lands
 *  10. rollback     POST /api/plugins/:id/disable — contribution disappears
 *  11. resume       POST /api/plugins/:id/enable — ready again, state intact
 *  12. uninstall    DELETE /api/plugins/:id (only with --uninstall)
 *
 * Every step is recorded; the first failure aborts the run and the script exits
 * non-zero. `--json <file>` writes the full step log for CI/audit.
 *
 * Usage:
 *   node scripts/verify-install.mjs [--api-url http://localhost:3100]
 *                                   [--token <board token>]
 *                                   [--company <companyId>]
 *                                   [--uninstall] [--keep-log]
 *
 * Env: PAPERCLIP_API_URL, PAPERCLIP_TOKEN, PAPERCLIP_VERIFY_COMPANY_ID
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import manifest, { PLUGIN_ID } from "../src/manifest.js";
import { StubDocument, serialize } from "../tests/helpers/mini-dom.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_FILES = [
  { url: "index.js", dest: "ui/index.js" },
  { url: "runtime.js", dest: "ui/runtime.js" },
  { url: "../i18n/translate.js", dest: "i18n/translate.js" },
  { url: "../i18n/dictionary.zh-cn.js", dest: "i18n/dictionary.zh-cn.js" },
];

/** Real English strings taken from the Paperclip board UI. */
const PAGE_SAMPLES = [
  { text: "Dashboard", expect: "仪表盘" },
  { text: "Settings", expect: "设置" },
  { text: "Save", expect: "保存" },
  { text: "More actions", expect: "更多操作" },
  { placeholder: "Search tasks", expect: "搜索任务" },
];

function parseArgs(argv) {
  const args = {
    apiUrl: process.env.PAPERCLIP_API_URL?.trim() || "http://localhost:3100",
    token: process.env.PAPERCLIP_TOKEN?.trim() || null,
    companyId: process.env.PAPERCLIP_VERIFY_COMPANY_ID?.trim() || null,
    uninstall: false,
    json: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--api-url") args.apiUrl = argv[++i];
    else if (arg === "--token") args.token = argv[++i];
    else if (arg === "--company") args.companyId = argv[++i];
    else if (arg === "--uninstall") args.uninstall = true;
    else if (arg === "--json") args.json = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`✗ unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  args.apiUrl = args.apiUrl.replace(/\/+$/, "");
  return args;
}

class HttpError extends Error {
  constructor(status, body, method, url) {
    super(`${method} ${url} → ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

class Client {
  constructor({ apiUrl, token }) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  headers(extra = {}) {
    const headers = { accept: "application/json", ...extra };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return headers;
  }

  async request(method, url, body) {
    const init = { method, headers: this.headers() };
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${this.apiUrl}${url}`, init);
    const text = await response.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON (e.g. a served JS bundle) is returned verbatim.
    }
    if (!response.ok) throw new HttpError(response.status, parsed, method, url);
    return { status: response.status, body: parsed, text, contentType: response.headers.get("content-type") ?? "" };
  }

  get(url) {
    return this.request("GET", url);
  }
  post(url, body = {}) {
    return this.request("POST", url, body);
  }
  del(url) {
    return this.request("DELETE", url);
  }
}

class Report {
  constructor() {
    this.steps = [];
  }
  pass(name, detail, extra = {}) {
    this.steps.push({ name, ok: true, detail, ...extra });
    console.log(`✓ ${name.padEnd(14)} ${detail}`);
  }
  fail(name, detail, extra = {}) {
    this.steps.push({ name, ok: false, detail, ...extra });
    console.error(`✗ ${name.padEnd(14)} ${detail}`);
  }
  get ok() {
    return this.steps.every((step) => step.ok);
  }
}

async function step(report, name, fn) {
  try {
    const detail = await fn();
    report.pass(name, detail.detail ?? "ok", detail.extra ?? {});
    return detail.value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.fail(name, message);
    throw error;
  }
}

async function resolvePluginId(client, key) {
  const { body } = await client.get("/api/plugins");
  const plugins = Array.isArray(body) ? body : [];
  return plugins.find((plugin) => plugin.pluginKey === key || plugin.pluginId === key) ?? null;
}

async function run(args, report) {
  const client = new Client({ apiUrl: args.apiUrl, token: args.token });
  const startedAt = new Date().toISOString();
  let pluginId = null;

  // 1. target -----------------------------------------------------------------
  await step(report, "target", async () => {
    const { body } = await client.get("/api/health");
    return {
      detail: `${args.apiUrl} answers /api/health (status=${body?.status ?? "?"})`,
      value: body,
    };
  });

  // 1b. board access ----------------------------------------------------------
  // The host gates every plugin route on a board actor with instance admin.
  // Checking it up front turns a deep 403 into one actionable line.
  await step(report, "auth", async () => {
    try {
      const { body } = await client.get("/api/plugins");
      const count = Array.isArray(body) ? body.length : 0;
      return { detail: `board access confirmed (${count} plugin record(s) visible)`, value: body };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        throw new Error(
          `${error.status} on /api/plugins — this run needs a board session with instance admin. ` +
            `Run \`paperclipai auth login --api-base ${args.apiUrl}\` in a browser, then re-run, ` +
            `or pass \`--token <board token>\`. Agent tokens cannot install plugins by design.`,
        );
      }
      throw error;
    }
  });

  // Clean slate: a previous run may have left the plugin installed.
  const existing = await resolvePluginId(client, PLUGIN_ID).catch(() => null);
  if (existing?.id) {
    if (existing.status === "ready") await client.post(`/api/plugins/${existing.id}/disable`).catch(() => {});
    pluginId = existing.id;
    report.pass("pre-clean", `reused existing plugin record ${existing.id} (status=${existing.status})`);
  }

  // 2. install ----------------------------------------------------------------
  pluginId = await step(report, "install", async () => {
    const { body } = await client.post("/api/plugins/install", {
      packageName: packageRoot,
      isLocalPath: true,
    });
    if (!body?.id) throw new Error(`install returned no plugin id: ${JSON.stringify(body)}`);
    return {
      detail: `installed ${body.pluginKey ?? body.pluginId} v${body.version} (status=${body.status})`,
      value: body.id,
      extra: { pluginId: body.id, status: body.status, lastError: body.lastError ?? null },
    };
  });

  // 3. enable -----------------------------------------------------------------
  await step(report, "enable", async () => {
    const { body } = await client.post(`/api/plugins/${pluginId}/enable`);
    if (body?.status && body.status !== "ready") {
      throw new Error(`enable left status=${body.status}${body.lastError ? ` lastError=${body.lastError}` : ""}`);
    }
    return { detail: `status=${body?.status ?? "ready"}`, extra: { status: body?.status ?? null } };
  });

  // 4. registry health --------------------------------------------------------
  await step(report, "registry", async () => {
    const { body } = await client.get(`/api/plugins/${pluginId}/health`);
    if (!body?.healthy) {
      const failed = (body?.checks ?? []).filter((check) => !check.passed).map((check) => check.name);
      throw new Error(`host health not healthy (status=${body?.status}, failed=${failed.join(",") || "?"})`);
    }
    return { detail: `healthy, ${body.checks.length} checks passed` };
  });

  // 5. UI contribution --------------------------------------------------------
  const slotId = manifest.ui.slots[0].id;
  await step(report, "contribution", async () => {
    const { body } = await client.get("/api/plugins/ui-contributions");
    const contributions = Array.isArray(body) ? body : [];
    const mine = contributions.find((item) => item.pluginId === pluginId || item.pluginKey === PLUGIN_ID);
    if (!mine) throw new Error(`no UI contribution for ${PLUGIN_ID} in ${contributions.length} contribution(s)`);
    if (!mine.slots?.some((slot) => slot.id === slotId)) {
      throw new Error(`contribution does not declare slot ${slotId}`);
    }
    return { detail: `slot ${slotId} served as ${mine.uiEntryFile}` };
  });

  // 6. UI bundle bytes --------------------------------------------------------
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-zh-verify-"));
  try {
    await step(report, "ui-bundle", async () => {
      for (const file of PLUGIN_FILES) {
        const { text, status } = await client.get(`/_plugins/${pluginId}/ui/${file.url}`);
        if (status !== 200 || !text.includes("export")) {
          throw new Error(`host did not serve ${file.url} (status=${status}, ${text.length} bytes)`);
        }
        const dest = path.join(bundleDir, file.dest);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, text);
      }
      return { detail: `host served ${PLUGIN_FILES.length} UI files` };
    });

    // 7. the served runtime really translates --------------------------------
    await step(report, "ui-runtime", async () => {
      const { ZhCnRuntime } = await import(pathToFileURL(path.join(bundleDir, "ui", "runtime.js")).href);
      const doc = new StubDocument();
      const app = doc.body.addElement("div", { class: "app" });
      const translated = [];
      for (const sample of PAGE_SAMPLES) {
        if (sample.placeholder) {
          app.addElement("input", { placeholder: sample.placeholder });
        } else {
          app.addElement("span").addText(sample.text);
        }
      }
      const runtime = new ZhCnRuntime({ document: doc, observe: false });
      runtime.start();
      const html = serialize(app);
      for (const sample of PAGE_SAMPLES) {
        if (!html.includes(sample.expect)) {
          throw new Error(`served bundle did not translate "${sample.placeholder ?? sample.text}" (expected ${sample.expect}); got: ${html}`);
        }
        translated.push(sample.expect);
      }
      // Rollback must restore the original English, byte for byte.
      runtime.stop();
      const restored = serialize(app);
      for (const sample of PAGE_SAMPLES) {
        const original = sample.placeholder ?? sample.text;
        if (!restored.includes(original)) {
          throw new Error(`stop() did not restore "${original}"; got: ${restored}`);
        }
      }
      return {
        detail: `${translated.length} real UI strings translated, stop() restored every original`,
        extra: { counts: runtime.counts },
      };
    });
  } finally {
    if (!args.keepLog) await fs.rm(bundleDir, { recursive: true, force: true });
  }

  // 8. worker RPC through the host ------------------------------------------
  await step(report, "worker-rpc", async () => {
    const body = args.companyId ? { key: "i18n-settings", companyId: args.companyId } : { key: "i18n-settings" };
    const { body: payload } = await client.post(`/api/plugins/${pluginId}/bridge/data`, body);
    const data = payload?.data ?? payload;
    if (data?.locale !== "zh-CN") {
      throw new Error(`worker did not answer getData (got ${JSON.stringify(payload)})`);
    }
    if (!(data?.dictionaryEntries > 0)) {
      throw new Error(`worker reported no dictionary entries: ${JSON.stringify(data)}`);
    }
    return {
      detail: `forked worker answered getData (locale=${data.locale}, entries=${data.dictionaryEntries}, mode=${data.mode})`,
    };
  });

  // 9. worker state write ----------------------------------------------------
  await step(report, "worker-state", async () => {
    const call = (mode) =>
      client
        .post(`/api/plugins/${pluginId}/bridge/action`, {
          key: "set-i18n-mode",
          params: { mode },
          ...(args.companyId ? { companyId: args.companyId } : {}),
        })
        .then(({ body }) => body);
    const saved = await call("on");
    if (saved?.ok !== true || saved?.mode !== "on") {
      throw new Error(`set-i18n-mode(on) rejected: ${JSON.stringify(saved)}`);
    }
    const readBack = await client
      .post(`/api/plugins/${pluginId}/bridge/data`, {
        key: "i18n-settings",
        ...(args.companyId ? { companyId: args.companyId } : {}),
      })
      .then(({ body }) => (body?.data ?? body));
    if (readBack?.mode !== "on") {
      throw new Error(`persisted mode not visible over the bridge: ${JSON.stringify(readBack)}`);
    }
    await call("auto");
    return { detail: "instance state write persisted and read back through the host" };
  });

  // 10. rollback -------------------------------------------------------------
  await step(report, "rollback", async () => {
    await client.post(`/api/plugins/${pluginId}/disable`, { reason: "paperclip-zh verify" });
    const { body } = await client.get("/api/plugins/ui-contributions");
    const contributions = Array.isArray(body) ? body : [];
    if (contributions.some((item) => item.pluginId === pluginId || item.pluginKey === PLUGIN_ID)) {
      throw new Error("contribution is still served after disable — the host would keep injecting zh-CN");
    }
    const record = await resolvePluginId(client, PLUGIN_ID);
    if (record?.status === "ready") throw new Error(`plugin is still ready after disable (status=${record.status})`);
    return { detail: `disabled (status=${record?.status ?? "?"}); UI contribution withdrawn` };
  });

  // 11. resume ---------------------------------------------------------------
  await step(report, "resume", async () => {
    const { body } = await client.post(`/api/plugins/${pluginId}/enable`);
    if (body?.status && body.status !== "ready") throw new Error(`re-enable left status=${body.status}`);
    const readBack = await client
      .post(`/api/plugins/${pluginId}/bridge/data`, { key: "i18n-settings" })
      .then(({ body: payload }) => payload?.data ?? payload);
    return { detail: `ready again (mode=${readBack?.mode}, state preserved)` };
  });

  // 12. uninstall ------------------------------------------------------------
  if (args.uninstall) {
    await step(report, "uninstall", async () => {
      const { body } = await client.del(`/api/plugins/${pluginId}`);
      const gone = await resolvePluginId(client, PLUGIN_ID);
      if (gone && gone.status !== "uninstalled") {
        throw new Error(`plugin still listed after uninstall (status=${gone.status})`);
      }
      return { detail: `uninstalled (${body?.status ?? "uninstalled"})` };
    });
  }

  return {
    pluginKey: PLUGIN_ID,
    pluginVersion: manifest.version,
    apiUrl: args.apiUrl,
    pluginId,
    startedAt,
    finishedAt: new Date().toISOString(),
    uninstalled: args.uninstall,
    ok: report.ok,
    steps: report.steps,
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    "paperclip-zh verify [--api-url <url>] [--token <board token>] [--company <id>] [--uninstall] [--json <file>]",
  );
  process.exit(0);
}

const report = new Report();
let result;
try {
  result = await run(args, report);
} catch (error) {
  // The failing step already recorded itself; keep the whole log so the JSON
  // artifact shows exactly how far a real install got.
  result = {
    pluginKey: PLUGIN_ID,
    pluginVersion: manifest.version,
    apiUrl: args.apiUrl,
    ok: false,
    finishedAt: new Date().toISOString(),
    steps: report.steps,
    fatal: error instanceof Error ? error.message : String(error),
  };
}

if (args.json) {
  await fs.mkdir(path.dirname(path.resolve(args.json)), { recursive: true });
  await fs.writeFile(path.resolve(args.json), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nstep log → ${path.resolve(args.json)}`);
}

if (result.ok) {
  console.log(`\n✓ real install verified against ${args.apiUrl} — ${result.steps.filter((s) => s.ok).length} steps passed`);
  process.exit(0);
}
process.exit(1);
