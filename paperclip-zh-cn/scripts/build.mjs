#!/usr/bin/env node
/**
 * Build step: copy `src/` into `dist/` and run cheap structural checks.
 *
 * The plugin ships as plain ESM, so "build" is a copy plus validation — there
 * is no bundler, no node_modules, and nothing to install before use. That is
 * what makes `paperclip-zh install` work offline on an air-gapped instance.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(packageRoot, "src");
const distDir = path.join(packageRoot, "dist");

async function copyTree(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(src, dest);
    else if (entry.name.endsWith(".js")) await fs.copyFile(src, dest);
  }
}

async function validate() {
  const manifestModule = await import(pathToFileURL(path.join(distDir, "manifest.js")).href);
  const manifest = manifestModule.default;
  const problems = [];
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(manifest.id)) problems.push(`invalid plugin id: ${manifest.id}`);
  if (manifest.apiVersion !== 1) problems.push("apiVersion must be 1");
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) problems.push(`invalid version: ${manifest.version}`);
  if (!manifest.entrypoints?.worker) problems.push("entrypoints.worker is required");
  const slots = manifest.ui?.slots ?? [];
  if (slots.length === 0) problems.push("ui.slots must declare at least one slot");
  for (const slot of slots) {
    if (!slot.exportName) problems.push(`slot ${slot.id} is missing exportName`);
  }
  for (const capability of manifest.capabilities ?? []) {
    if (!/^[a-z]+(\.[a-z*]+)+$/.test(capability)) problems.push(`suspicious capability: ${capability}`);
  }
  // The UI bundle must actually export every declared slot component.
  const uiModule = await import(pathToFileURL(path.join(distDir, "ui", "index.js")).href).catch(() => null);
  if (uiModule) {
    for (const slot of slots) {
      if (typeof uiModule[slot.exportName] !== "function") {
        problems.push(`ui bundle does not export ${slot.exportName}`);
      }
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exitCode = 1;
    return false;
  }
  const { DICTIONARY_ZH_CN } = await import(pathToFileURL(path.join(distDir, "i18n", "dictionary.zh-cn.js")).href);
  console.log(`✓ dist built: ${Object.keys(DICTIONARY_ZH_CN).length} zh-CN entries, ${slots.length} UI slot(s)`);
  return true;
}

async function main() {
  await fs.rm(distDir, { recursive: true, force: true });
  await copyTree(srcDir, distDir);
  if (await validate()) console.log(`✓ manifest ${(await import(pathToFileURL(path.join(distDir, "manifest.js")).href)).default.id} is valid`);
}

await main();
