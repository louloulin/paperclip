import { z } from "zod";

/** Value-free routing stored on the connection, never supplied by an agent binding. */
export const aiProviderRoutingSchema = z
  .object({
    kind: z.enum(["openrouter", "bedrock", "gateway", "local", "openai_compatible"]),
    protocol: z.enum(["responses", "messages", "chat", "bedrock"]),
    baseUrl: z.string().trim().max(2048).optional(),
    auth: z
      .enum(["bearer", "api_key", "none"])
      .default("bearer"),
    region: z
      .string()
      .regex(/^[a-z]{2}(?:-[a-z]+)+-\d$/)
      .optional(),
    models: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(256),
            label: z.string().trim().max(160).optional(),
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict()
  .superRefine((route, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (route.kind === "bedrock") {
      if (
        route.protocol !== "bedrock" ||
        !route.region ||
        route.auth !== "bearer" ||
        route.baseUrl
      )
        invalid(
          "Bedrock requires a region and a Bedrock API key.",
        );
    } else if (
      route.protocol === "bedrock" ||
      route.region
    )
      invalid("AWS settings require Bedrock.");
    if (
      route.kind === "openrouter" &&
      (route.baseUrl || route.auth !== "bearer")
    )
      invalid("OpenRouter uses its official endpoint and an API key.");
    if (route.auth === "api_key" && route.protocol !== "messages")
      invalid("API-key header authentication requires Anthropic Messages.");
    if (route.baseUrl !== undefined) {
      try {
        const url = new URL(route.baseUrl);
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
          url.hostname,
        );
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
        )
          throw new Error();
      } catch {
        invalid(
          "Enter an HTTPS base URL without credentials, query parameters, or a fragment. Local endpoints may use HTTP.",
        );
      }
    }
    // Loopback / required-baseUrl rules depend on kind, which TypeScript
    // narrows in superRefine; read it from the raw input instead.
    {
      const kind = (route as { kind: string }).kind;
      if (kind === "local" && route.baseUrl) {
        try {
          const url = new URL(route.baseUrl);
          const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
          if (!loopback) invalid("A local endpoint must use localhost or a loopback address.");
        } catch {/* caught above */}
      }
      if (kind === "openai_compatible" && !route.baseUrl) {
        invalid("An OpenAI-compatible endpoint requires a base URL.");
      }
    }
  });
export type AiProviderRouting = z.infer<typeof aiProviderRoutingSchema>;
export function aiRoutingHarness(
  adapter: string,
  provider?: unknown,
  acpxAgent?: unknown,
): string {
  if (adapter !== "paperclip_runner") return adapter;
  const runner =
    provider === "acpx" && (acpxAgent === "claude" || acpxAgent === "grok")
      ? acpxAgent
      : provider;
  return (
    (
      {
        claude: "claude_local",
        codex: "codex_local",
        opencode: "opencode_local",
        grok: "grok_local",
      } as Record<string, string>
    )[String(runner)] ?? "unsupported"
  );
}
export function isAiRoutingCompatible(
  route: AiProviderRouting,
  harness: string,
): boolean {
  if (route.kind === "bedrock") return harness === "claude_local";
  if (route.kind === "openrouter")
    return [
      "claude_local",
      "codex_local",
      "opencode_local",
      "hermes_local",
    ].includes(harness);
  if (route.protocol === "responses") return harness === "codex_local";
  if (route.protocol === "messages") return harness === "claude_local";
  return ["opencode_local", "hermes_local"].includes(harness);
}
export function aiRoutingBaseUrl(
  route: AiProviderRouting,
  harness: string,
): string {
  return route.kind === "openrouter"
    ? `https://openrouter.ai/api${harness === "claude_local" ? "" : "/v1"}`
    : (route.baseUrl ?? "").replace(/\/+$/, "");
}

/** OpenCode names models with a provider prefix; other harnesses use the raw ID. */
export function aiRoutingModel(
  route: AiProviderRouting,
  harness: string,
  model: string,
): string {
  if (!model || harness !== "opencode_local") return model;
  const prefix = route.kind === "openrouter" ? "openrouter" : "paperclip";
  return model.startsWith(`${prefix}/`) ? model : `${prefix}/${model}`;
}

/** Catalog identity is derived from routing, including accounts saved before these rows existed. */
export function aiConnectionCatalogSlug(provider: string, routing?: Pick<AiProviderRouting, "kind" | "protocol">): string {
  if (!routing) return provider;
  if (routing.kind === "gateway" || routing.kind === "openai_compatible") {
    return routing.protocol === "messages" ? "messages-api"
      : routing.protocol === "chat" ? "chat-completions-api" : "responses-api";
  }
  return routing.kind;
}

/** Wire format a vendor preset can speak. Both are proxyable by the shipped harnesses:
 *  `chat` runs on the OpenAI Chat Completions harnesses, `messages` on Claude. */
export type AiVendorProtocol = "chat" | "messages";

/** A vendor preset is the one-click entry for a known model vendor. The credential stays under the
 *  provider implied by the protocol (`openai` for chat, `anthropic` for messages) and the endpoint
 *  is stored as routing.kind = "openai_compatible" with the preset's base URL.
 *  Endpoints, model IDs and docs are researched from the vendor's own documentation; model IDs are
 *  suggestions the board can edit, never a closed allowlist. */
export interface AiVendorPreset {
  id: string;
  name: string;
  brandKey: string;
  docsUrl: string;
  /** Credential name the vendor documents, used in guidance text only. */
  envKey: string;
  /** Suggested model IDs, newest first. Editable per connection. */
  models: readonly string[];
  /** Vendors document the Anthropic Messages surface as their coding path, so it leads. */
  defaultProtocol: AiVendorProtocol;
  endpoints: Record<AiVendorProtocol, string>;
}

// Researched 2026-10-19 from each vendor's own docs. MiniMax: platform.minimaxi.com/docs
// documents ANTHROPIC_BASE_URL=https://api.minimax.cn/anthropic and
// OPENAI_BASE_URL=https://api.minimax.cn/v1. Every vendor below serves both surfaces from the
// same key; the four peers publish their Claude-compatible base in their coding-plan docs.
export const AI_VENDOR_PRESETS: readonly AiVendorPreset[] = [
  {
    id: "minimax-cn",
    name: "MiniMax (China)",
    brandKey: "minimax",
    docsUrl: "https://platform.minimaxi.com/docs/api-reference/text-anthropic-api",
    envKey: "MINIMAX_API_KEY",
    models: ["MiniMax-M3.1-Flash", "MiniMax-M3"],
    defaultProtocol: "messages",
    endpoints: {
      messages: "https://api.minimax.cn/anthropic",
      chat: "https://api.minimax.cn/v1",
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    brandKey: "deepseek",
    docsUrl: "https://api-docs.deepseek.com/",
    envKey: "DEEPSEEK_API_KEY",
    models: ["deepseek-v4-pro", "deepseek-flash"],
    defaultProtocol: "messages",
    endpoints: {
      messages: "https://api.deepseek.com/anthropic",
      chat: "https://api.deepseek.com",
    },
  },
  {
    id: "zhipu",
    name: "Zhipu GLM",
    brandKey: "zhipu",
    docsUrl: "https://docs.bigmodel.cn/cn/coding-plan/latest-model",
    envKey: "ZAI_API_KEY",
    models: ["glm-5.3", "glm-5.3-flash"],
    defaultProtocol: "messages",
    endpoints: {
      messages: "https://open.bigmodel.cn/api/anthropic",
      chat: "https://open.bigmodel.cn/api/paas/v4",
    },
  },
  {
    id: "moonshot-cn",
    name: "Moonshot Kimi (China)",
    brandKey: "moonshot",
    docsUrl: "https://platform.kimi.com/docs/models",
    envKey: "MOONSHOT_API_KEY",
    models: ["kimi-k3", "kimi-k2.7-code"],
    defaultProtocol: "messages",
    endpoints: {
      messages: "https://api.moonshot.cn/anthropic",
      chat: "https://api.moonshot.cn/v1",
    },
  },
  {
    id: "dashscope",
    name: "Aliyun DashScope (Qwen)",
    brandKey: "dashscope",
    docsUrl: "https://help.aliyun.com/zh/model-studio/models",
    envKey: "DASHSCOPE_API_KEY",
    models: ["qwen3.7-max", "qwen3.7-flash"],
    defaultProtocol: "messages",
    endpoints: {
      messages: "https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy",
      chat: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
  },
] as const;

export function aiVendorPreset(id: string | null | undefined): AiVendorPreset | undefined {
  if (!id) return undefined;
  return AI_VENDOR_PRESETS.find((preset) => preset.id === id);
}

/** Reconnect support: identify the vendor from a saved endpoint, including hand-edited hostnames. */
export function aiVendorPresetForEndpoint(baseUrl: string | null | undefined): AiVendorPreset | undefined {
  if (!baseUrl) return undefined;
  const normalized = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  return AI_VENDOR_PRESETS.find((preset) =>
    Object.values(preset.endpoints).some((endpoint) => endpoint.toLowerCase() === normalized),
  );
}

/** Vendor presets keep the credential under the provider that owns the wire format. */
export function aiVendorProvider(protocol: AiVendorProtocol): "openai" | "anthropic" {
  return protocol === "messages" ? "anthropic" : "openai";
}

/** Claude-compatible surfaces authenticate with `x-api-key`; chat uses a bearer token. */
export function aiVendorAuth(protocol: AiVendorProtocol): AiProviderRouting["auth"] {
  return protocol === "messages" ? "api_key" : "bearer";
}

/** Direct catalog setup presets; legacy gateway links still open their existing setup. */
export function aiProviderSetupPreset(source: string | null): {
  provider: "openrouter" | "bedrock" | "gateway" | "local" | "google" | "openai_compatible";
  protocol?: AiProviderRouting["protocol"];
  label?: string;
} | undefined {
  switch (source) {
    case "responses-api": return { provider: "gateway", protocol: "responses", label: "Responses API" };
    case "messages-api": return { provider: "gateway", protocol: "messages", label: "Messages API" };
    case "chat-completions-api": return { provider: "gateway", protocol: "chat", label: "Chat Completions API" };
    case "google-ai": return { provider: "google" };
    case "google": case "openrouter": case "bedrock": case "gateway": case "local": case "openai_compatible": return { provider: source };
    default: return undefined;
  }
}
