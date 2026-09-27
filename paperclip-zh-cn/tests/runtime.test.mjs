import assert from "node:assert/strict";
import test from "node:test";

import { ZhCnRuntime } from "../src/ui/runtime.js";
import { StubDocument, serialize } from "./helpers/mini-dom.mjs";

function buildPage() {
  const doc = new StubDocument();
  const app = doc.body.addElement("div", { class: "app" });
  app.addElement("h1").addText("Dashboard");
  app.addElement("button", { "aria-label": "More actions" }).addText("Save");
  const code = app.addElement("pre");
  code.addElement("code").addText("const Cancel = 1;");
  const input = app.addElement("input", { placeholder: "Search tasks" });
  const inputText = input.addText("Settings");
  const editable = app.addElement("div", { contenteditable: "true" });
  editable.addText("Agents");
  const own = app.addElement("div", { "data-paperclip-i18n": "own" });
  own.addText("Cancel");
  return { doc, app, inputText };
}

test("sweep translates text nodes and whitelisted attributes", () => {
  const { doc, app } = buildPage();
  const runtime = new ZhCnRuntime({ document: doc, observe: false });
  runtime.start();
  const html = serialize(app);
  assert.match(html, /仪表盘/);
  assert.match(html, /保存/);
  assert.match(html, /aria-label="更多操作"/);
  assert.match(html, /placeholder="搜索任务"/);
});

test("code blocks, inputs, editable regions and own surface are skipped", () => {
  const { doc, app, inputText } = buildPage();
  new ZhCnRuntime({ document: doc, observe: false }).start();
  const html = serialize(app);
  assert.match(html, /const Cancel = 1;/, "code must stay verbatim");
  assert.equal(inputText.nodeValue, "Settings", "input text must stay verbatim");
  assert.match(html, />Agents</, "contenteditable content must stay verbatim");
  assert.match(html, /data-paperclip-i18n="own">Cancel</, "plugin-owned surface must stay verbatim");
  assert.match(html, /placeholder="搜索任务"/, "attributes are still translated on inputs");
});

test("stop() restores the document byte-for-byte (rollback guarantee)", () => {
  const { doc, app } = buildPage();
  const before = serialize(app);
  const runtime = new ZhCnRuntime({ document: doc, observe: false });
  runtime.start();
  assert.notEqual(serialize(app), before, "sweep must change something first");
  runtime.stop();
  assert.equal(serialize(app), before);
  assert.equal(runtime.stats().pendingTranslations, 0);
});

test("repeated sweeps are idempotent", () => {
  const { doc, app } = buildPage();
  const runtime = new ZhCnRuntime({ document: doc, observe: false });
  runtime.start();
  const first = serialize(app);
  runtime.sweep();
  runtime.sweep();
  assert.equal(serialize(app), first);
  assert.equal(runtime.stats().textNodes > 0, true);
});

test("start/stop are idempotent and stop() on a clean runtime is a no-op", () => {
  const { doc, app } = buildPage();
  const before = serialize(app);
  const runtime = new ZhCnRuntime({ document: doc, observe: false });
  runtime.stop();
  assert.equal(serialize(app), before);
  runtime.start();
  runtime.start();
  runtime.stop();
  runtime.stop();
  assert.equal(serialize(app), before);
});

test("newly inserted nodes are translated on the next sweep", () => {
  const { doc, app } = buildPage();
  const runtime = new ZhCnRuntime({ document: doc, observe: false });
  runtime.start();
  app.addElement("span").addText("Approve");
  runtime.sweep();
  assert.match(serialize(app), /批准/);
  runtime.stop();
  assert.match(serialize(app), />Approve</, "rollback also reverts late-arriving nodes");
});

test("custom dictionaries flow through the runtime", () => {
  const doc = new StubDocument();
  doc.body.addElement("div").addText("Cancel");
  const runtime = new ZhCnRuntime({ document: doc, observe: false, dictionary: { Cancel: "撤銷" } });
  runtime.start();
  assert.match(serialize(doc.body), /撤銷/);
});

test("a MutationObserver-shaped window is used when available", () => {
  const { doc, app } = buildPage();
  let observed = null;
  const window = {
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observed = this;
      }
      observe(target, options) {
        this.target = target;
        this.options = options;
      }
      disconnect() {
        this.target = null;
      }
    },
  };
  const runtime = new ZhCnRuntime({ document: doc, window });
  runtime.start();
  assert.ok(observed.target, "observer attached to document.body");
  assert.equal(observed.options.attributeFilter.includes("placeholder"), true);
  app.addElement("span").addText("Reject");
  observed.callback();
  assert.equal(runtime.pending, true, "mutations are coalesced into one scheduled sweep");
  runtime.sweep();
  assert.match(serialize(app), /拒绝/);
  runtime.stop();
  assert.equal(observed.target, null, "stop disconnects the observer");
});
