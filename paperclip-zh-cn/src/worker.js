/**
 * Worker half of the plugin. It owns the server-side record of the operator's
 * language choice (instance-scoped state + per-company override) and answers
 * health probes. The browser half never depends on it: translation works even
 * if this worker is slow, which keeps the UI resilient.
 */
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { DICTIONARY_ZH_CN, LOCALE } from "./i18n/dictionary.zh-cn.js";

const PLUGIN_ID = "paperclip.zh-cn";
const STATE_KEY_MODE = "ui-mode";
const MODES = new Set(["auto", "on", "off"]);

const DEFAULT_CONFIG = {
  /** `auto` translates when the browser asks for zh-*, `on` forces zh-CN. */
  mode: "auto",
  /** Translate placeholder/title/aria-label attributes as well as text. */
  translateAttributes: true,
  /** Skip `<pre>/<code>` and editable regions. Keep true unless debugging. */
  skipCodeBlocks: true,
};

function normalizeMode(value) {
  return typeof value === "string" && MODES.has(value) ? value : null;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_ID} setup complete (locale ${LOCALE})`);
    ctx.data.register("i18n-settings", async (params) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get(companyId)) };
      const instanceMode = normalizeMode(await ctx.state.get({ scopeKind: "instance", stateKey: STATE_KEY_MODE }));
      const companyMode = companyId
        ? normalizeMode(await ctx.state.get({ scopeKind: "company", scopeId: companyId, stateKey: STATE_KEY_MODE }))
        : null;
      return {
        locale: LOCALE,
        mode: companyMode ?? instanceMode ?? normalizeMode(config.mode) ?? DEFAULT_CONFIG.mode,
        translateAttributes: config.translateAttributes !== false,
        skipCodeBlocks: config.skipCodeBlocks !== false,
        dictionaryEntries: Object.keys(DICTIONARY_ZH_CN).length,
        pluginId: PLUGIN_ID,
        version: ctx.manifest.version,
      };
    });

    ctx.actions.register("set-i18n-mode", async (params) => {
      const mode = normalizeMode(params?.mode);
      if (!mode) return { ok: false, error: "mode must be one of auto|on|off" };
      const companyId = typeof params?.companyId === "string" && params.companyId.length > 0
        ? params.companyId
        : undefined;
      if (companyId) await ctx.state.set({ scopeKind: "company", scopeId: companyId, stateKey: STATE_KEY_MODE }, mode);
      else await ctx.state.set({ scopeKind: "instance", stateKey: STATE_KEY_MODE }, mode);
      return { ok: true, mode, scope: companyId ? "company" : "instance" };
    });
  },

  async onHealth() {
    return {
      status: "ok",
      message: `${PLUGIN_ID} ready (${Object.keys(DICTIONARY_ZH_CN).length} zh-CN entries)`,
      details: { locale: LOCALE, dictionaryEntries: Object.keys(DICTIONARY_ZH_CN).length },
    };
  },

  async onConfigChanged(config) {
    // Config is read on demand; nothing to recompute here.
    void config;
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
