// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { AiProviderSetup } from "./AiProviderSetup";
import { aiConnectionsApi } from "@/api/ai-connections";
import { TooltipProvider } from "@/components/ui/tooltip";
import { aiProviderSetupPreset, type AiManagedConnectionSummary } from "@paperclipai/shared";
import type { AiConnectionCredentialStep } from "./AiConnectionCredentialStep";

let credentialProps: ComponentProps<typeof AiConnectionCredentialStep> | undefined;
vi.mock("@/api/ai-connections", () => ({ aiConnectionsApi: { create: vi.fn(async () => ({ connectionId: "connection", grantId: "grant" })), list: vi.fn(async () => ({ currentUserId: "owner", connections: [], canManageConnections: true })) } }));
vi.mock("@/api/agents", () => ({ agentsApi: { list: vi.fn(async () => []) } }));
vi.mock("./AiConnectionCredentialStep", () => ({ AiConnectionCredentialStep: (props: ComponentProps<typeof AiConnectionCredentialStep>) => { credentialProps = props; return <div>Existing credential flow</div>; } }));

it("reconnects an older OpenRouter account without adding routing metadata", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  const root = createRoot(container);
  const onComplete = vi.fn();
  const account = { id: "connection", grantId: "grant", companyId: "company", provider: "openrouter", method: "api_key", name: "Existing OpenRouter", ownership: "personal", ownerUserId: "owner", isDefault: true, status: "needs_attention" } as const;
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" reconnect={account} onCancel={() => {}} onComplete={onComplete} /></QueryClientProvider>));
    expect(container.textContent).toContain("Existing credential flow");
    expect(credentialProps).toMatchObject({ connectionId: account.id, provider: "openrouter", initialMethod: "api_key", fixedMethod: true });
    credentialProps!.onComplete({ connectionId: account.id, grantId: account.grantId, method: "api_key" });
    expect(onComplete.mock.calls[0]?.[0]).toEqual({ provider: "openrouter", method: "api_key", mode: "delegated", connectionId: account.id, grantId: account.grantId });
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});

const providerSources = ["openrouter", "bedrock", "responses-api", "messages-api", "chat-completions-api", "local"];
it("shows advanced providers directly when entered from advanced connection mode", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: true, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" advancedOnly onCancel={() => {}} onComplete={() => {}} /></QueryClientProvider>));
    const choices = Array.from(container.querySelectorAll("button[aria-label]")).map(button => button.getAttribute("aria-label"));
    expect(choices).toEqual(["OpenRouter", "Amazon Bedrock", "Custom gateway", "Local endpoint"]);
    expect(container.querySelector("details")).toBeNull();
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

it.each(providerSources)("opens %s directly with shared access folded under Advanced", async source => {
  const preset = aiProviderSetupPreset(source)!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: true, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], [{ id: "agent", name: "Nova" }]);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onCancel = vi.fn();
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><TooltipProvider><AiProviderSetup companyId="company" initialProvider={preset.provider} initialProtocol={preset.protocol} providerLabel={preset.label} onCancel={onCancel} onComplete={() => {}} /></TooltipProvider></QueryClientProvider>));
    expect(container.textContent).not.toContain("Connect a model provider");
    expect(container.textContent).toContain("Connects for everyone in your organization, available to all agents.");
    expect(container.querySelector('[role="radio"]')).toBeNull();
    const change = Array.from(container.querySelectorAll('button')).find(b => b.textContent === "Change")!;
    expect(change.getAttribute("aria-expanded")).toBe("false");
    await act(async () => change.click());
    const radio = (text: string) => Array.from(container.querySelectorAll('[role="radio"]')).find(b => b.textContent?.includes(text)) as HTMLButtonElement;
    expect(radio("Any human in the organization").getAttribute("aria-checked")).toBe("true");
    expect(radio("Any agent").getAttribute("aria-checked")).toBe("true");
    await act(async () => radio("Just me").click());
    expect(container.textContent).toContain("Connects as you, available to all agents.");
    await act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === "Back")!.click());
    expect(onCancel).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount()); container.remove(); client.clear();
  }
});

it("saves the default organization grant and all-agent installation from the direct connect screen", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: true, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" initialProvider="openrouter" onCancel={() => {}} onComplete={() => {}} /></QueryClientProvider>));
    const input = container.querySelector('input[aria-label="API key"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "fixture-key");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(aiConnectionsApi.create).toHaveBeenCalledWith("company", expect.objectContaining({ ownership: "shared", allAgents: true, agentIds: [], apiKey: "fixture-key", routing: expect.objectContaining({ kind: "openrouter" }) }));
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});


it("allows an ordinary member to save a personal gateway before the agent exists", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: false, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onComplete = vi.fn();
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" initialProvider="openrouter" onCancel={() => {}} onComplete={onComplete} /></QueryClientProvider>));
    const input = container.querySelector('input[aria-label="API key"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "member-key");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const connect = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(connect.disabled).toBe(false);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(aiConnectionsApi.create).toHaveBeenCalledWith("company", expect.objectContaining({ ownership: "personal", allAgents: false, agentIds: [], apiKey: "member-key" }));
    expect(onComplete.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ mode: "delegated", connectionId: "connection", grantId: "grant" }));
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});


it.each(["google", "openai", "anthropic", "xai"] as const)("allows an ordinary member to connect a personal %s account before an agent exists", async provider => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: false, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  credentialProps = undefined;
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" initialProvider={provider} onCancel={() => {}} onComplete={() => {}} /></QueryClientProvider>));
    expect(credentialProps).toMatchObject({ provider, ownership: "personal", allAgents: false, agentIds: [], disabled: false });
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

it("exposes vendor presets for the Chinese and third-party model APIs", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: true, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" onCancel={() => {}} onComplete={() => {}} /></QueryClientProvider>));
    const buttonLabels = Array.from(container.querySelectorAll("button[aria-label]")).map(b => b.getAttribute("aria-label"));
    for (const name of ["MiniMax (China)", "Zhipu GLM", "DeepSeek", "Moonshot Kimi (China)", "Aliyun DashScope (Qwen)"]) {
      expect(buttonLabels).toContain(name);
    }
    // The advanced drawer keeps the generic endpoints in addition to the vendor presets.
    const summary = container.querySelector("details > summary")!;
    await act(async () => summary.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const advancedLabels = Array.from(container.querySelectorAll("button[aria-label]")).map(b => b.getAttribute("aria-label"));
    expect(advancedLabels).toEqual(expect.arrayContaining(["Custom gateway", "Local endpoint", "OpenRouter", "Amazon Bedrock"]));
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

it("shows only vendor cards on one locked wire format when the host asks for it", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: true, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onComplete = vi.fn();
  (aiConnectionsApi.create as unknown as { mockClear: () => void }).mockClear?.();
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" vendorOnly protocols={["messages"]} initialProtocol="messages" onCancel={() => {}} onComplete={onComplete} /></QueryClientProvider>));
    const labels = Array.from(container.querySelectorAll("button[aria-label]")).map(b => b.getAttribute("aria-label"));
    expect(labels).toEqual(["MiniMax (China)", "DeepSeek", "Zhipu GLM", "Moonshot Kimi (China)", "Aliyun DashScope (Qwen)"]);
    expect(container.querySelector("details")).toBeNull();
    await submitVendorConnection(container, "MiniMax (China)", "fixture-minimax");
    expect(aiConnectionsApi.create).toHaveBeenCalledWith("company", expect.objectContaining({
      provider: "anthropic",
      routing: expect.objectContaining({ protocol: "messages", auth: "api_key", baseUrl: "https://api.minimax.cn/anthropic" }),
    }));
    expect(onComplete.mock.calls[0]?.[1]).toEqual({
      vendorId: "minimax-cn",
      protocol: "messages",
      models: ["MiniMax-M3.1-Flash", "MiniMax-M3"],
    });
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

async function submitVendorConnection(container: HTMLElement, vendor: string, key: string) {
  const card = Array.from(container.querySelectorAll("button[aria-label]")).find(b => b.getAttribute("aria-label") === vendor) as HTMLButtonElement;
  expect(card).toBeDefined();
  await act(async () => card.click());
  const apiKey = container.querySelector('input[aria-label="API key"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(apiKey, key);
    apiKey.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

it("submits MiniMax China through its Claude-compatible endpoint by default", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: true, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  (aiConnectionsApi.create as unknown as { mockClear: () => void }).mockClear?.();
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" onCancel={() => {}} onComplete={() => {}} /></QueryClientProvider>));
    await submitVendorConnection(container, "MiniMax (China)", "fixture-minimax");
    expect(aiConnectionsApi.create).toHaveBeenCalledWith("company", expect.objectContaining({
      provider: "anthropic",
      method: "api_key",
      apiKey: "fixture-minimax",
      name: "Company api.minimax.cn",
      routing: expect.objectContaining({
        kind: "openai_compatible",
        protocol: "messages",
        auth: "api_key",
        baseUrl: "https://api.minimax.cn/anthropic",
        models: [{ id: "MiniMax-M3.1-Flash" }, { id: "MiniMax-M3" }],
      }),
    }));
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

it("switches a vendor preset to the Chat Completions surface with its own URL and bearer auth", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: true, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  (aiConnectionsApi.create as unknown as { mockClear: () => void }).mockClear?.();
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" onCancel={() => {}} onComplete={() => {}} /></QueryClientProvider>));
    const card = Array.from(container.querySelectorAll("button[aria-label]")).find(b => b.getAttribute("aria-label") === "DeepSeek") as HTMLButtonElement;
    await act(async () => card.click());
    const url = container.querySelector('input[aria-label="Provider URL"]') as HTMLInputElement;
    expect(url.value).toBe("https://api.deepseek.com/anthropic");
    const format = container.querySelector('[aria-label="API format"]') as HTMLButtonElement;
    expect(format.disabled).toBe(false);
    await act(async () => format.click());
    const chatOption = Array.from(document.querySelectorAll('[role="option"], [data-radix-collection-item]')).find(node => node.textContent?.includes("Chat Completions")) as HTMLElement;
    expect(chatOption).toBeDefined();
    await act(async () => chatOption.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    await act(async () => chatOption.click());
    expect((container.querySelector('input[aria-label="Provider URL"]') as HTMLInputElement).value).toBe("https://api.deepseek.com");
    const apiKey = container.querySelector('input[aria-label="API key"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(apiKey, "fixture-deepseek");
      apiKey.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(aiConnectionsApi.create).toHaveBeenCalledWith("company", expect.objectContaining({
      provider: "openai",
      routing: expect.objectContaining({
        kind: "openai_compatible",
        protocol: "chat",
        auth: "bearer",
        baseUrl: "https://api.deepseek.com",
      }),
    }));
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});

it("reopens a saved vendor endpoint with its preset, format, and models", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["ai-connections", "company", undefined], { canManageConnections: true, connections: [] });
  client.setQueryData(["agents", "company", "provider-access"], []);
  const container = document.createElement("div");
  const root = createRoot(container);
  const account: AiManagedConnectionSummary = {
    id: "connection", grantId: "grant", companyId: "company", provider: "anthropic", method: "api_key",
    name: "Company api.minimax.cn", ownership: "shared", isDefault: false, status: "connected",
    routing: { kind: "openai_compatible", protocol: "messages", auth: "api_key", baseUrl: "https://api.minimax.cn/anthropic", models: [{ id: "MiniMax-M3" }] },
  };
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><AiProviderSetup companyId="company" reconnect={account} onCancel={() => {}} onComplete={() => {}} /></QueryClientProvider>));
    expect(container.textContent).toContain("Reconnect MiniMax (China)");
    expect((container.querySelector('input[aria-label="Provider URL"]') as HTMLInputElement).value).toBe("https://api.minimax.cn/anthropic");
    expect((container.querySelector('input[aria-label="Model IDs"]') as HTMLInputElement).value).toBe("MiniMax-M3");
  } finally {
    await act(async () => root.unmount()); client.clear();
  }
});
