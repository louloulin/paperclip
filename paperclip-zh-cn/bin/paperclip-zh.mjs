#!/usr/bin/env node
/**
 * paperclip-zh — install / rollback / uninstall driver for the Paperclip
 * zh-CN localization plugin.
 *
 * Design rules:
 *  - Every mutation is delegated to the host's own plugin CLI
 *    (`paperclipai plugin ...`), so the plugin follows the same capability
 *    review, health check and activation path as any other plugin.
 *  - Nothing is ever force-purged unless the operator passes `--force`.
 *  - `rollback` is the safe, reversible operation: it disables the plugin and
 *    leaves its state in place, so `install` again resumes exactly where it
 *    left off. `rollback --to <version>` reinstalls a pinned local build.
 *
 * Usage:
 *   paperclip-zh install [--yes]
 *   paperclip-zh rollback [--to <version>] [--yes]
 *   paperclip-zh uninstall [--force] [--yes]
 *   paperclip-zh status
 */
import { spawnSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(packageRoot, ".state");
const PLUGIN_KEY = "paperclip.zh-cn";

function parseArgs(argv) {
  const args = { _: [], to: null, force: false, yes: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--to") args.to = argv[++i];
    else if (arg === "--force") args.force = true;
    else if (arg === "--yes" || arg === "-y") args.yes = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args._.push(arg);
  }
  return args;
}

/** Prefer the repo-local CLI when this project sits inside a Paperclip checkout. */
function cliCandidates() {
  const local = path.join(packageRoot, "..", "cli", "node_modules", "tsx", "dist", "cli.mjs");
  return [
    { command: "npx", args: ["--yes", "paperclipai"] },
    { command: "paperclipai", args: [] },
    { command: "node", args: [local] },
  ];
}

function runCli(pluginArgs, { capture = false } = {}) {
  for (const candidate of cliCandidates()) {
    const result = spawnSync(candidate.command, [...candidate.args, ...pluginArgs], {
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (result.error?.code === "ENOENT") continue;
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }
  console.error("✗ could not find the Paperclip CLI. Install it with `npm i -g paperclipai` or run this from a Paperclip checkout.");
  process.exit(2);
}

function mustRun(pluginArgs, label) {
  const result = runCli(pluginArgs);
  if (result.status !== 0) {
    console.error(`✗ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label}`);
}

async function backupState(label) {
  const result = runCli(["plugin", "inspect", PLUGIN_KEY], { capture: true });
  await fs.mkdir(stateDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(stateDir, `${label}-${stamp}.json`);
  await fs.writeFile(file, result.stdout || result.stderr || "");
  console.log(`✓ saved plugin state snapshot -> ${path.relative(packageRoot, file)}`);
  return file;
}

async function build() {
  // The host forks the worker with a minimal environment, so every dependency
  // must already be on disk here. Install them before the contract check.
  if (!existsSync(path.join(packageRoot, "node_modules", "@paperclipai", "plugin-sdk"))) {
    console.log("› installing plugin dependencies (@paperclipai/plugin-sdk)");
    const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: packageRoot, stdio: "inherit" });
    if (install.status !== 0) process.exit(install.status ?? 1);
  }
  for (const script of ["scripts/check-install-contract.mjs", "scripts/build.mjs"]) {
    const result = spawnSync(process.execPath, [path.join(packageRoot, script)], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

async function install({ yes }) {
  console.log("› building plugin bundle");
  await build();
  console.log("› snapshotting current plugin state");
  await backupState("pre-install");
  if (!yes) {
    console.log("› this installs a UI plugin that translates the whole Paperclip interface to zh-CN.");
    console.log("  Re-run with --yes to skip this notice.");
  }
  mustRun(["plugin", "install", packageRoot, "--local"], "plugin installed");
  mustRun(["plugin", "enable", PLUGIN_KEY], "plugin enabled");
  console.log("› done. Reload the Paperclip tab; a 中/EN toggle appears bottom-right.");
}

async function rollback({ to, yes }) {
  if (to) {
    console.log(`› rolling back to pinned version ${to}`);
    await backupState("pre-rollback");
    mustRun(["plugin", "disable", PLUGIN_KEY], "plugin disabled");
    mustRun(["plugin", "install", packageRoot, "--local"], `plugin reinstalled (manifest version must be ${to})`);
    mustRun(["plugin", "enable", PLUGIN_KEY], "plugin enabled");
    return;
  }
  console.log("› rollback: disabling the translation layer (plugin state is preserved)");
  if (!yes) console.log("  Re-run with --yes to skip this notice.");
  mustRun(["plugin", "disable", PLUGIN_KEY], "plugin disabled — host UI is English again, state kept");
  console.log("› run `paperclip-zh install` to resume; `paperclip-zh uninstall` to remove it entirely.");
}

async function uninstall({ force, yes }) {
  console.log("› uninstalling the zh-CN plugin");
  if (force) {
    if (!yes) {
      console.error("✗ --force purges plugin state. Re-run with --yes to confirm.");
      process.exit(2);
    }
    await backupState("pre-uninstall");
  }
  mustRun(["plugin", "uninstall", PLUGIN_KEY, ...(force ? ["--force"] : [])], "plugin uninstalled");
  console.log("› done. Any saved snapshots remain under .state/ for audit.");
}

function status() {
  const result = runCli(["plugin", "list"], { capture: true });
  const output = `${result.stdout}${result.stderr}`;
  if (!output.includes(PLUGIN_KEY)) {
    console.log("zh-CN plugin is not installed.");
    return;
  }
  console.log(output.split("\n").filter((line) => line.includes(PLUGIN_KEY) || line.includes("paperclip")).join("\n"));
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? "status";
if (args.help) {
  console.log("paperclip-zh <install|rollback|uninstall|status> [--to <version>] [--force] [--yes]");
  process.exit(0);
}
try {
  if (command === "install") await install(args);
  else if (command === "rollback") await rollback(args);
  else if (command === "uninstall") await uninstall(args);
  else if (command === "status") status();
  else {
    console.error(`✗ unknown command: ${command}`);
    process.exit(2);
  }
} catch (error) {
  console.error(`✗ ${error?.message ?? error}`);
  process.exit(1);
}
