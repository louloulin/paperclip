import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import manifest, { PLUGIN_ID, PLUGIN_VERSION } from "../src/manifest.js";
import { DICTIONARY_ZH_CN } from "../src/i18n/dictionary.zh-cn.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const constantsPath = path.join(packageRoot, "..", "packages", "shared", "src", "constants.ts");

test("manifest satisfies the documented install-time rules", () => {
  assert.match(manifest.id, /^[a-z0-9][a-z0-9._-]*$/);
  assert.equal(manifest.apiVersion, 1);
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
  assert.ok(manifest.displayName.length > 0 && manifest.displayName.length <= 100);
  assert.ok(manifest.description.length > 0 && manifest.description.length <= 500);
  assert.ok(manifest.capabilities.length > 0);
  assert.ok(manifest.entrypoints.worker);
  assert.equal(PLUGIN_ID, manifest.id);
  assert.equal(PLUGIN_VERSION, manifest.version);
});

test("declares exactly one appShellOverlay slot with a UI entrypoint", () => {
  const slots = manifest.ui.slots;
  assert.equal(slots.length, 1);
  assert.equal(slots[0].type, "appShellOverlay");
  assert.equal(slots[0].exportName, "ChineseLocalizationOverlay");
  assert.ok(manifest.entrypoints.ui, "UI slots require a UI entrypoint");
});

test("requests the minimum capability set", () => {
  assert.deepEqual([...manifest.capabilities].sort(), [
    "plugin.state.read",
    "plugin.state.write",
    "ui.action.register",
  ]);
});

test("instanceConfigSchema is a valid-enough JSON Schema shape", () => {
  const schema = manifest.instanceConfigSchema;
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.mode.enum, ["auto", "on", "off"]);
});

test(
  "capabilities, categories and slot type exist in the host catalog",
  { skip: existsSync(constantsPath) ? false : "not inside a Paperclip checkout" },
  () => {
    const constants = readFileSync(constantsPath, "utf8");
    const listOf = (name) =>
      new Set(
        constants
          .split(`${name} = [`)[1]
          ?.split("]")[0]
          .split("\n")
          .map((line) => line.trim().replace(/^"|",?$/g, ""))
          .filter(Boolean) ?? [],
      );
    const capabilities = listOf("export const PLUGIN_CAPABILITIES");
    const categories = listOf("export const PLUGIN_CATEGORIES");
    const slotTypes = listOf("export const PLUGIN_UI_SLOT_TYPES");
    for (const capability of manifest.capabilities) {
      assert.ok(capabilities.has(capability), `unknown capability: ${capability}`);
    }
    for (const category of manifest.categories) {
      assert.ok(categories.has(category), `unknown category: ${category}`);
    }
    for (const slot of manifest.ui.slots) {
      assert.ok(slotTypes.has(slot.type), `unknown slot type: ${slot.type}`);
    }
  },
);

test("dictionary entries are the curated zh-CN set", () => {
  assert.equal(typeof DICTIONARY_ZH_CN, "object");
  assert.ok(Object.keys(DICTIONARY_ZH_CN).length >= 300);
});
