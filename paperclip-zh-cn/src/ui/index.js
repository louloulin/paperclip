/**
 * appShellOverlay contribution: mounts once per application shell, starts the
 * zh-CN runtime, and renders a small always-there toggle so the operator can
 * switch language (or roll the translation back) without a page reload.
 *
 * The bundle imports bare `react` and `@paperclipai/plugin-sdk/ui`; the host
 * rewrites both specifiers to its own React instance and SDK runtime when it
 * loads this module (see ui/src/plugins/slots.tsx).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { LOCALE } from "../i18n/dictionary.zh-cn.js";
import { ZhCnRuntime } from "./runtime.js";

const STORAGE_KEY = "paperclip.i18n.zh-cn";
const MODE_AUTO = "auto";
const MODE_ON = "on";
const MODE_OFF = "off";

function readStoredMode() {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === MODE_ON || value === MODE_OFF ? value : MODE_AUTO;
  } catch {
    return MODE_AUTO;
  }
}

function storeMode(mode) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, mode);
  } catch {
    // Private-mode or blocked storage: the toggle still works for this session.
  }
}

function prefersChinese() {
  const languages = globalThis.navigator?.languages?.length
    ? globalThis.navigator.languages
    : [globalThis.navigator?.language ?? "en"];
  return languages.some((tag) => String(tag).toLowerCase().startsWith("zh"));
}

export function ChineseLocalizationOverlay() {
  const [mode, setMode] = useState(readStoredMode);
  const [stats, setStats] = useState(null);
  const runtimeRef = useRef(null);
  // The bridge is optional: the overlay must never break the host shell, so
  // every bridge call is guarded and failures are non-fatal by design.
  const saveMode = usePluginAction?.("set-i18n-mode") ?? (async () => undefined);

  useEffect(() => {
    const runtime = new ZhCnRuntime({ document: globalThis.document });
    runtimeRef.current = runtime;
    return () => {
      // Unmount = full restore. Disabling the plugin therefore leaves the DOM
      // exactly as the host rendered it.
      runtime.stop();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const shouldTranslate = mode === MODE_ON || (mode === MODE_AUTO && prefersChinese());
    if (shouldTranslate) runtime.start();
    else runtime.stop();
    setStats(runtime.stats());
  }, [mode]);

  useEffect(() => {
    // Host soft navigations re-render large trees; a periodic sweep is a cheap
    // safety net for nodes the MutationObserver missed (e.g. portals attached
    // outside the observed body subtree).
    const timer = setInterval(() => {
      const runtime = runtimeRef.current;
      if (!runtime?.enabled) return;
      runtime.sweep();
      setStats(runtime.stats());
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const { data: serverSettings } = usePluginData?.("i18n-settings", {}) ?? {};
  const dictionaryEntries = serverSettings?.dictionaryEntries ?? null;

  const toggle = useCallback(() => {
    const runtime = runtimeRef.current;
    const next = mode === MODE_ON || (mode === MODE_AUTO && prefersChinese()) ? MODE_OFF : MODE_ON;
    setMode(next);
    storeMode(next);
    setStats(runtime ? runtime.stats() : null);
    void Promise.resolve(saveMode?.({ mode: next, companyId: null })).catch(() => undefined);
  }, [mode, saveMode]);

  const active = mode === MODE_ON || (mode === MODE_AUTO && prefersChinese());
  const label = active ? "切换为英文" : "切换为中文";

  return createToggle({ label, active, onClick: toggle, stats, dictionaryEntries });
}

/**
 * Rendered without JSX so the bundle needs no build step. The host resolves
 * `React.createElement` through the plugin bridge registry; when the shim is
 * unavailable we fall back to constructing the element directly.
 */
function createToggle({ label, active, onClick, stats }) {
  const doc = globalThis.document;
  const bridgeCreateElement = globalThis.__paperclipPluginBridge__?.react?.createElement;
  if (typeof bridgeCreateElement === "function") {
    return bridgeCreateElement("button", {
      type: "button",
      "data-paperclip-i18n": "own",
      "data-active": String(active),
      title: `${LOCALE} — ${label}`,
      "aria-label": label,
      onClick,
      style: {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483000",
        padding: "6px 12px",
        borderRadius: "999px",
        border: "1px solid currentColor",
        background: "Canvas",
        color: "CanvasText",
        font: "12px/1.4 system-ui, sans-serif",
        cursor: "pointer",
        opacity: "0.75",
      },
    }, active ? "EN" : "中");
  }
  // Last-resort DOM path: still fully reversible because the runtime skips
  // anything marked as its own surface.
  const existing = doc?.getElementById?.(TOGGLE_ID);
  if (existing) existing.remove();
  if (!doc?.body) return null;
  const button = doc.createElement("button");
  button.id = TOGGLE_ID;
  button.type = "button";
  button.textContent = active ? "EN" : "中";
  button.title = `${LOCALE} — ${label}`;
  button.setAttribute("data-paperclip-i18n", "own");
  button.addEventListener("click", onClick);
  doc.body.appendChild(button);
  return null;
}

const TOGGLE_ID = "paperclip-i18n-zh-cn-toggle";

export default ChineseLocalizationOverlay;
