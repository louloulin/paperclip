/**
 * Paperclip manifest. Plain ESM JavaScript on purpose: the host imports this
 * file directly, so the plugin needs no bundler and no install-time build.
 */
import { LOCALE } from "./i18n/dictionary.zh-cn.js";

const PLUGIN_ID = "paperclip.zh-cn";
const PLUGIN_VERSION = "1.0.0";
const OVERLAY_SLOT_ID = "zh-cn-locale-overlay";

const manifest = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Paperclip 汉化（zh-CN）",
  description:
    "动态把 Paperclip 界面汉化为简体中文：运行时翻译整个 Web 应用（含新渲染内容），提供一键中/英切换，停用或卸载时完整还原页面。",
  author: "paperclip-zh-cn contributors",
  categories: ["ui"],
  minimumHostVersion: "0.1.0",
  capabilities: [
    "ui.action.register",
    "plugin.state.read",
    "plugin.state.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: {
        type: "string",
        enum: ["auto", "on", "off"],
        default: "auto",
        description: "auto = 依据浏览器语言；on = 始终汉化；off = 始终英文",
      },
      translateAttributes: {
        type: "boolean",
        default: true,
        description: "同时翻译 placeholder / title / aria-label / alt",
      },
      skipCodeBlocks: {
        type: "boolean",
        default: true,
        description: "跳过 <pre>/<code> 与可编辑区域",
      },
    },
  },
  ui: {
    slots: [
      {
        type: "appShellOverlay",
        id: OVERLAY_SLOT_ID,
        displayName: "中文界面开关",
        exportName: "ChineseLocalizationOverlay",
      },
    ],
  },
};

export { LOCALE, OVERLAY_SLOT_ID, PLUGIN_ID, PLUGIN_VERSION };
export default manifest;
