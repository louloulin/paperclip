/**
 * Browser runtime: walks a live document, swaps known English strings for their
 * zh-CN equivalents, and — critically — remembers every original value so
 * `stop()` restores the page byte-for-byte. That reversibility is what makes
 * "rollback" a one-call operation instead of a page reload.
 *
 * The runtime deliberately uses only a small, boring slice of the DOM API
 * (`querySelectorAll`, `childNodes`, `nodeValue`, attributes) so the whole
 * layer is testable against a stub document in plain Node.
 */
import { TRANSLATED_ATTRIBUTES } from "../i18n/dictionary.zh-cn.js";
import { isTranslated, translateAttribute, translateText } from "../i18n/translate.js";

/** Never touch these: user input, code, and the plugin's own control surface. */
export const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "pre",
  "code",
  "kbd",
  "samp",
  "textarea",
  "input",
  "select",
  "option",
]);

/** Same policy expressed as a selector, for host-side diagnostics and docs. */
export const SKIP_SELECTOR = [
  ...SKIP_TAGS,
  "[contenteditable='']",
  "[contenteditable='true']",
  "[data-paperclip-i18n='skip']",
  "[data-paperclip-i18n='own']",
].join(",");

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const OBSERVED_ATTRIBUTES = [...TRANSLATED_ATTRIBUTES];

export class ZhCnRuntime {
  /**
   * @param {object} options
   * @param {Document} options.document host document
   * @param {Window} [options.window] host window (defaults to document.defaultView)
   * @param {Record<string,string>} [options.dictionary] zh-CN dictionary
   * @param {boolean} [options.observe] attach a MutationObserver for dynamic content
   */
  constructor({ document: doc, window: win, dictionary, observe = true } = {}) {
    if (!doc) throw new Error("ZhCnRuntime requires a document");
    this.document = doc;
    this.window = win ?? doc.defaultView ?? undefined;
    this.dictionary = dictionary;
    this.observe = observe;
    this.enabled = false;
    /** @type {Map<Text, string>} translated text node -> original value */
    this.textUndo = new Map();
    /** @type {Map<Element, Map<string, string>>} element -> attribute -> original value */
    this.attributeUndo = new Map();
    this.counts = { textNodes: 0, attributes: 0, sweeps: 0, restored: 0 };
    this.observer = null;
    this.pending = false;
  }

  /** Idempotent. */
  start() {
    if (this.enabled) return this;
    this.enabled = true;
    this.sweep();
    if (this.observe && typeof this.window?.MutationObserver === "function") {
      this.observer = new this.window.MutationObserver(() => this.scheduleSweep());
      const target = this.document.body ?? this.document.documentElement;
      if (target) {
        this.observer.observe(target, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: OBSERVED_ATTRIBUTES,
        });
      }
    }
    return this;
  }

  /** Idempotent, and a full restore: every original value goes back. */
  stop() {
    if (!this.enabled && this.textUndo.size === 0 && this.attributeUndo.size === 0) return this;
    this.enabled = false;
    this.observer?.disconnect();
    this.observer = null;
    this.restoreAll();
    return this;
  }

  /** Coalesce bursts of DOM mutations into one sweep per animation frame. */
  scheduleSweep() {
    if (this.pending) return;
    this.pending = true;
    const run = () => {
      this.pending = false;
      if (this.enabled) this.sweep();
    };
    if (typeof this.window?.requestAnimationFrame === "function") this.window.requestAnimationFrame(run);
    else queueMicrotask(run);
  }

  /** Translate the whole document once. Cheap and idempotent. */
  sweep(root = this.document.body ?? this.document.documentElement) {
    if (!root) return;
    this.counts.sweeps += 1;
    this.walk(root);
  }

  walk(node) {
    if (!node) return;
    if (node.nodeType === TEXT_NODE) {
      this.translateTextNode(node);
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    this.translateAttributes(node);
    if (this.shouldSkip(node)) return;
    const children = node.childNodes ?? [];
    for (const child of [...children]) this.walk(child);
  }

  shouldSkip(element) {
    const tag = String(element.tagName ?? "").toLowerCase();
    if (SKIP_TAGS.has(tag)) return true;
    if (element.getAttribute?.("data-paperclip-i18n") === "skip") return true;
    if (element.getAttribute?.("data-paperclip-i18n") === "own") return true;
    if (element.isContentEditable) return true;
    return false;
  }

  translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || this.shouldSkip(parent)) return;    const current = node.nodeValue;
    if (!current || isTranslated(current)) return;
    const translated = translateText(current, this.dictionary);
    if (!translated || translated === current) return;
    if (!this.textUndo.has(node)) this.textUndo.set(node, current);
    node.nodeValue = translated;
    this.counts.textNodes += 1;
  }

  translateAttributes(element) {
    for (const name of OBSERVED_ATTRIBUTES) {
      const value = element.getAttribute?.(name);
      if (!value || isTranslated(value)) continue;
      const translated = translateAttribute(name, value, this.dictionary);
      if (!translated || translated === value) continue;
      let undo = this.attributeUndo.get(element);
      if (!undo) {
        undo = new Map();
        this.attributeUndo.set(element, undo);
      }
      if (!undo.has(name)) undo.set(name, value);
      element.setAttribute(name, translated);
      this.counts.attributes += 1;
    }
  }

  /** Put every original value back. Disconnected nodes are dropped silently. */
  restoreAll() {
    for (const [node, original] of this.textUndo) {
      if (node.parentElement) node.nodeValue = original;
    }
    for (const [element, attributes] of this.attributeUndo) {
      for (const [name, original] of attributes) {
        try {
          element.setAttribute(name, original);
        } catch {
          // Element left the document between sweep and rollback: nothing to restore.
        }
      }
    }
    this.counts.restored = this.textUndo.size + this.attributeUndo.size;
    this.textUndo.clear();
    this.attributeUndo.clear();
    return this.counts.restored;
  }

  stats() {
    return {
      ...this.counts,
      enabled: this.enabled,
      pendingTranslations: this.textUndo.size + this.attributeUndo.size,
      observing: this.observer !== null,
    };
  }
}
