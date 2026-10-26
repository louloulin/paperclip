import { describe, it, expect } from "vitest";
import {
  AI_VENDOR_PRESETS,
  aiConnectionCatalogSlug,
  aiProviderRoutingSchema,
  aiRoutingHarness,
  aiRoutingModel,
  aiVendorAuth,
  aiVendorPresetForEndpoint,
  aiVendorProvider,
  createAiConnectionSchema,
  isAiConnectionCompatible,
} from "@paperclipai/shared";
import { managedProviderRouting } from "../services/ai-provider-routing.js";

describe("provider routing", () => {
  it.each([
    "https://user:secret@gateway.example/v1",
    "https://gateway.example/v1?key=secret",
    "http://169.254.169.254/",
    "file:///tmp/secret",
    "https://gateway.example/#secret",
  ])("rejects unsafe or credential-bearing endpoint %s", (baseUrl) => {
    expect(
      aiProviderRoutingSchema.safeParse({
        kind: "gateway",
        protocol: "responses",
        baseUrl,
      }).success,
    ).toBe(false);
  });
  it("requires exactly the selected credential and disallows routed subscriptions", () => {
    const input = {
      provider: "openai",
      method: "api_key",
      name: "Local",
      ownership: "personal",
      routing: {
        kind: "local",
        protocol: "responses",
        auth: "none",
        baseUrl: "http://localhost:11434/v1",
      },
    };
    expect(createAiConnectionSchema.safeParse(input).success).toBe(true);
    expect(
      createAiConnectionSchema.safeParse({ ...input, apiKey: "unwanted" })
        .success,
    ).toBe(false);
    expect(
      createAiConnectionSchema.safeParse({
        ...input,
        method: "subscription",
        loginSessionId: "session",
      }).success,
    ).toBe(false);
  });
  it("rejects unsupported protocols and excluded remote adapters", () => {
    const routing = aiProviderRoutingSchema.parse({
      kind: "gateway",
      protocol: "chat",
      baseUrl: "https://gateway.example/v1",
    });
    for (const adapter of [
      "codex_local",
      "claude_local",
      "http",
      "process",
      "openclaw_gateway",
      "hermes_gateway",
      "acpx_local",
    ])
      expect(
        isAiConnectionCompatible(
          { provider: "openai", method: "api_key", routing },
          adapter,
        ),
      ).toBe(false);
    expect(
      isAiConnectionCompatible(
        { provider: "openai", method: "api_key", routing },
        "opencode_local",
      ),
    ).toBe(true);
    expect(
      isAiConnectionCompatible(
        { provider: "openai", method: "api_key", routing },
        "paperclip_runner",
        "model",
        "aws_agentcore",
      ),
    ).toBe(false);
  });
  it.each(["gateway", "openrouter"] as const)("uses a terminal-filtered secret variable for Hermes %s authentication", kind => {
    const route = aiProviderRoutingSchema.parse({ kind, protocol: "chat", auth: "bearer", ...(kind === "gateway" ? { baseUrl: "https://gateway.example/v1" } : {}) });
    const projected = managedProviderRouting(route, "hermes_local", "selected-key", "fixture-model");
    expect(projected.env.OPENAI_API_KEY).toBe("selected-key");
    expect(projected.env.PAPERCLIP_AI_PROVIDER_KEY).toBeUndefined();
    expect(projected.hermesConfig).toContain('api_key: "${OPENAI_API_KEY}"');
    expect(projected.hermesConfig).not.toContain("selected-key");
    expect(Object.entries(projected.env).filter(([, value]) => value === "selected-key").map(([name]) => name)).toEqual(kind === "openrouter" ? ["OPENAI_API_KEY", "OPENROUTER_API_KEY"] : ["OPENAI_API_KEY"]);
  });
  it("routes OpenRouter through each harness's protocol without putting secrets in Codex config", () => {
    const routing = aiProviderRoutingSchema.parse({
      kind: "openrouter",
      protocol: "responses",
    });
    const codex = managedProviderRouting(
      routing,
      "codex_local",
      "fixture-secret",
      "openai/gpt-5.4",
    );
    expect(codex.codexConfig).toContain('wire_api = "responses"');
    expect(codex.codexConfig).not.toContain("fixture-secret");
    const claude = managedProviderRouting(
      routing,
      "claude_local",
      "fixture-secret",
      "anthropic/claude-sonnet-4.6",
    );
    expect(claude.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
    expect(claude.env.ANTHROPIC_AUTH_TOKEN).toBe("fixture-secret");
    expect(claude.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    const opencode = managedProviderRouting(
      routing,
      "opencode_local",
      "fixture-secret",
      "anthropic/claude-sonnet-4.6",
    );
    expect(opencode.config.model).toBe(
      "openrouter/anthropic/claude-sonnet-4.6",
    );
  });
  it("projects only a Bedrock API key and rejects general AWS access keys", () => {
    const routing = aiProviderRoutingSchema.parse({
      kind: "bedrock",
      protocol: "bedrock",
      auth: "bearer",
      region: "us-east-1",
    });
    const projected = managedProviderRouting(
      routing,
      "claude_local",
      "fixture-bedrock-key",
      "bedrock-model",
    );
    expect(projected.env).toMatchObject({
      CLAUDE_CODE_USE_BEDROCK: "1",
      AWS_REGION: "us-east-1",
      AWS_BEARER_TOKEN_BEDROCK: "fixture-bedrock-key",
      AWS_EC2_METADATA_DISABLED: "true",
    });
    expect(aiProviderRoutingSchema.safeParse({ ...routing, auth: "aws_credentials" }).success).toBe(false);
    for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) expect(projected.env).not.toHaveProperty(key);
  });
  it("requires an OpenAI-compatible base URL and routes through OpenCode / Hermes", () => {
    expect(aiProviderRoutingSchema.safeParse({ kind: "openai_compatible", protocol: "chat", auth: "bearer" }).success).toBe(false);
    const routing = aiProviderRoutingSchema.parse({
      kind: "openai_compatible",
      protocol: "chat",
      auth: "bearer",
      baseUrl: "https://api.deepseek.com/v1",
    });
    expect(isAiConnectionCompatible({ provider: "openai", method: "api_key", routing }, "opencode_local")).toBe(true);
    expect(isAiConnectionCompatible({ provider: "openai", method: "api_key", routing }, "hermes_local")).toBe(true);
    expect(isAiConnectionCompatible({ provider: "openai", method: "api_key", routing }, "codex_local")).toBe(false);
    expect(isAiConnectionCompatible({ provider: "openai", method: "api_key", routing }, "claude_local")).toBe(false);
    const projected = managedProviderRouting(routing, "opencode_local", "fixture-key", "deepseek-chat");
    expect(projected.env.PAPERCLIP_AI_PROVIDER_KEY).toBe("fixture-key");
    expect(projected.env.PAPERCLIP_AI_PROVIDER_URL).toBe("https://api.deepseek.com/v1");
    expect(projected.config.model).toBe("paperclip/deepseek-chat");
    const hermes = managedProviderRouting(routing, "hermes_local", "fixture-key", "deepseek-chat");
    expect(hermes.env.OPENAI_BASE_URL).toBe("https://api.deepseek.com/v1");
    expect(hermes.env.OPENAI_API_KEY).toBe("fixture-key");
  });
  it("accepts OpenAI-compatible vendor presets as full connection create payloads", () => {
    for (const preset of AI_VENDOR_PRESETS) {
      for (const protocol of ["chat", "messages"] as const) {
        const result = createAiConnectionSchema.safeParse({
          provider: aiVendorProvider(protocol),
          method: "api_key",
          name: preset.name,
          ownership: "personal",
          apiKey: "fixture-key",
          routing: {
            kind: "openai_compatible",
            protocol,
            auth: aiVendorAuth(protocol),
            baseUrl: preset.endpoints[protocol],
            models: preset.models.map((id) => ({ id })),
          },
        });
        expect(result.success, `${preset.id}/${protocol}: ${JSON.stringify(result, null, 2)}`).toBe(true);
      }
    }
  });
  it("projects a vendor preset's Claude-compatible endpoint through claude_local", () => {
    const preset = AI_VENDOR_PRESETS.find((entry) => entry.id === "minimax-cn")!;
    expect(preset.endpoints).toEqual({
      messages: "https://api.minimax.cn/anthropic",
      chat: "https://api.minimax.cn/v1",
    });
    const routing = aiProviderRoutingSchema.parse({
      kind: "openai_compatible",
      protocol: preset.defaultProtocol,
      auth: aiVendorAuth(preset.defaultProtocol),
      baseUrl: preset.endpoints[preset.defaultProtocol],
      models: preset.models.map((id) => ({ id })),
    });
    expect(aiVendorProvider("messages")).toBe("anthropic");
    expect(aiVendorAuth("messages")).toBe("api_key");
    expect(isAiConnectionCompatible({ provider: "anthropic", method: "api_key", routing }, "claude_local")).toBe(true);
    expect(isAiConnectionCompatible({ provider: "anthropic", method: "api_key", routing }, "opencode_local")).toBe(false);
    const projected = managedProviderRouting(routing, "claude_local", "fixture-key", "MiniMax-M3");
    expect(projected.env.ANTHROPIC_BASE_URL).toBe("https://api.minimax.cn/anthropic");
    expect(projected.env.ANTHROPIC_API_KEY).toBe("fixture-key");
    expect(projected.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(projected.env.ANTHROPIC_MODEL).toBe("MiniMax-M3");
    // The chat surface runs on the OpenAI-compatible harnesses instead.
    const chatRouting = aiProviderRoutingSchema.parse({
      ...routing,
      protocol: "chat",
      auth: "bearer",
      baseUrl: preset.endpoints.chat,
    });
    const chatProjection = managedProviderRouting(chatRouting, "opencode_local", "fixture-key", "MiniMax-M3");
    expect(chatProjection.env.PAPERCLIP_AI_PROVIDER_URL).toBe("https://api.minimax.cn/v1");
    expect(chatProjection.config.model).toBe("paperclip/MiniMax-M3");
  });
  it("projects a vendor preset into Pi's models.json provider and prefixes its model", () => {
    const messagesRouting = aiProviderRoutingSchema.parse({
      kind: "openai_compatible",
      protocol: "messages",
      auth: "api_key",
      baseUrl: "https://api.minimax.cn/anthropic",
      models: [{ id: "MiniMax-M3" }],
    });
    expect(isAiConnectionCompatible({ provider: "anthropic", method: "api_key", routing: messagesRouting }, "pi_local")).toBe(true);
    const projected = managedProviderRouting(messagesRouting, "pi_local", "mm-key", "MiniMax-M3");
    // Pi has no base-URL flag: the endpoint and credential travel in the
    // provider registry, not in the Claude/OpenCode variables.
    expect(projected.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(projected.env.PAPERCLIP_AI_PROVIDER_KEY).toBe("mm-key");
    expect(JSON.parse(String(projected.env.PAPERCLIP_PI_PROVIDERS))).toEqual({
      paperclip: {
        baseUrl: "https://api.minimax.cn/anthropic",
        apiKey: "mm-key",
        api: "anthropic-messages",
        models: [{ id: "MiniMax-M3", name: "MiniMax-M3" }],
      },
    });
    expect(projected.config.model).toBe("paperclip/MiniMax-M3");

    const chatRouting = aiProviderRoutingSchema.parse({
      ...messagesRouting,
      protocol: "chat",
      auth: "bearer",
      baseUrl: "https://api.minimax.cn/v1",
    });
    expect(isAiConnectionCompatible({ provider: "openai", method: "api_key", routing: chatRouting }, "pi_local")).toBe(true);
    const chat = managedProviderRouting(chatRouting, "pi_local", "mm-key", "MiniMax-M3");
    expect(JSON.parse(String(chat.env.PAPERCLIP_PI_PROVIDERS)).paperclip.api).toBe("openai-completions");
    expect(chat.config.model).toBe("paperclip/MiniMax-M3");

    // Pi has no Responses surface, so a Codex-only routing stays incompatible.
    expect(
      isAiConnectionCompatible(
        { provider: "openai", method: "api_key", routing: { ...chatRouting, protocol: "responses" } },
        "pi_local",
      ),
    ).toBe(false);
  });

  it("uses Pi's built-in OpenRouter provider for a native OpenRouter key", () => {
    const routing = aiProviderRoutingSchema.parse({ kind: "openrouter", protocol: "chat", auth: "bearer", models: [] });
    expect(isAiConnectionCompatible({ provider: "openrouter", method: "api_key", mode: "responsible_user" }, "pi_local", "openrouter/anthropic/claude-sonnet-4.6")).toBe(true);
    const projected = managedProviderRouting(routing, "pi_local", "or-key", "anthropic/claude-sonnet-4.6");
    expect(projected.env.OPENROUTER_API_KEY).toBe("or-key");
    expect(projected.env.PAPERCLIP_PI_PROVIDERS).toBeUndefined();
    expect(projected.config.model).toBe("openrouter/anthropic/claude-sonnet-4.6");
  });

  it("routes the ACPX pi agent to the Pi harness and keeps provider/model IDs stable", () => {
    expect(aiRoutingHarness("paperclip_runner", "acpx", "pi")).toBe("pi_local");
    const routed = aiProviderRoutingSchema.parse({
      kind: "openai_compatible",
      protocol: "chat",
      auth: "bearer",
      baseUrl: "https://gateway.example/v1",
    });
    expect(aiRoutingModel(routed, "pi_local", "deepseek-chat")).toBe("paperclip/deepseek-chat");
    expect(aiRoutingModel(routed, "pi_local", "paperclip/deepseek-chat")).toBe("paperclip/deepseek-chat");
    const openrouter = aiProviderRoutingSchema.parse({ kind: "openrouter", protocol: "chat", auth: "bearer" });
    expect(aiRoutingModel(openrouter, "pi_local", "anthropic/claude-sonnet-4.6")).toBe("openrouter/anthropic/claude-sonnet-4.6");
  });

  it("keeps vendor presets in the existing chat/messages catalog rows", () => {
    expect(aiConnectionCatalogSlug("anthropic", { kind: "openai_compatible", protocol: "messages" })).toBe("messages-api");
    expect(aiConnectionCatalogSlug("openai", { kind: "openai_compatible", protocol: "chat" })).toBe("chat-completions-api");
    expect(aiVendorPresetForEndpoint("https://api.minimax.cn/anthropic/")?.id).toBe("minimax-cn");
    expect(aiVendorPresetForEndpoint("https://API.MiniMax.cn/v1")?.id).toBe("minimax-cn");
    expect(aiVendorPresetForEndpoint("https://gateway.example/v1")).toBeUndefined();
    expect(aiVendorPresetForEndpoint(null)).toBeUndefined();
  });
});
