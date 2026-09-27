import assert from "node:assert/strict";
import test from "node:test";

import { DICTIONARY_ZH_CN } from "../src/i18n/dictionary.zh-cn.js";
import {
  buildLookup,
  isTranslated,
  normalizeText,
  translateAttribute,
  translateText,
} from "../src/i18n/translate.js";

test("normalizes whitespace before lookup", () => {
  assert.equal(normalizeText("  Save \n  changes  "), "Save changes");
  // Surrounding whitespace is kept on purpose so inline layout never shifts.
  assert.equal(translateText("  Save  "), "  保存  ");
});

test("exact dictionary hits translate", () => {
  assert.equal(translateText("Cancel"), "取消");
  assert.equal(translateText("In Progress"), "进行中");
  assert.equal(translateText("No projects found."), "未找到项目。");
});

test("unknown strings are left alone", () => {
  assert.equal(translateText("Zqxjv blorp"), null);
  assert.equal(translateText(""), null);
  assert.equal(translateText(undefined), null);
});

test("already-translated text is never re-translated (idempotent)", () => {
  assert.equal(translateText("取消"), null);
  assert.equal(translateText("已保存的更改"), null);
  assert.equal(isTranslated("已保存的更改"), true);
});

test("multi-word phrases inside longer sentences are replaced on word boundaries", () => {
  assert.equal(translateText("Copy link to clipboard"), "复制链接 to clipboard");
  assert.equal(translateText("uncancelled link"), null, "word boundary prevents partial-word hits");
});

test("single words are not phrase-replaced (only exact matches)", () => {
  assert.equal(translateText("Save now"), null);
  assert.equal(translateText("Cancel"), "取消");
});

test("code-like and overlong strings are rejected by the phrase pass", () => {
  assert.equal(translateText("useSettings({ enabled: true })"), null);
  assert.equal(translateText(`Save ${"x".repeat(120)}`), null);
});

test("leading and trailing whitespace is preserved", () => {
  assert.equal(translateText("  Cancel  "), "  取消  ");
});

test("attributes translate only when whitelisted", () => {
  assert.equal(translateAttribute("placeholder", "Search tasks"), "搜索任务");
  assert.equal(translateAttribute("data-secret", "Cancel"), null);
  assert.equal(translateAttribute("title", "已翻译"), null);
});

test("custom dictionaries are supported and validated", () => {
  const lookup = buildLookup({ Cancel: "撤销" });
  assert.equal(translateText("Cancel", lookup), "撤销");
  assert.equal(translateText("Save", lookup), null, "custom dictionary does not fall back to the default");
});

test("dictionary has no duplicate or empty entries", () => {
  for (const [source, target] of Object.entries(DICTIONARY_ZH_CN)) {
    assert.ok(source.trim().length > 0, "empty source key");
    assert.ok(target.trim().length > 0, `empty translation for ${source}`);
    assert.notEqual(source, target);
  }
  assert.ok(Object.keys(DICTIONARY_ZH_CN).length >= 300, "dictionary should stay substantial");
});
