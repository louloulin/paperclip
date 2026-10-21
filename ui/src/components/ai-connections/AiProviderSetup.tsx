import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, Monitor } from "lucide-react";
import {
  aiProviderRoutingSchema,
  createAiConnectionSchema,
  AI_VENDOR_PRESETS,
  aiVendorAuth,
  aiVendorPreset,
  aiVendorPresetForEndpoint,
  type AiVendorProtocol,
  type AiProvider,
  type AiProviderRouting,
  type AiConnectionBinding,
  type AiManagedConnectionSummary,
} from "@paperclipai/shared";
import { aiConnectionsApi } from "@/api/ai-connections";
import { agentsApi } from "@/api/agents";
import { ConnectionChoiceList } from "@/features/connections/ConnectionChoiceList";
import { ConnectionAccessDefaults, connectionDefaultSummarySentence } from "@/features/connections/ConnectionSetupFlow";
import { AppLogo } from "@/pages/apps/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiConnectionCredentialStep } from "./AiConnectionCredentialStep";

const vendorChoices = AI_VENDOR_PRESETS.map((preset) => ({
  id: `vendor:${preset.id}`,
  name: preset.name,
  description: "Anthropic- or OpenAI-compatible API key",
  presetId: preset.id,
}));
const providers = [
  {
    id: "openai",
    name: "OpenAI",
    description: "ChatGPT subscription or API key",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude subscription or API key",
  },
  { id: "google", name: "Google", description: "Gemini API key" },
  { id: "xai", name: "xAI", description: "Grok subscription or API key" },
  ...vendorChoices,
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Models through one API key",
    advanced: true,
  },
  {
    id: "bedrock",
    name: "Amazon Bedrock",
    description: "Bedrock API key and AWS region",
    advanced: true,
  },
  {
    id: "gateway",
    name: "Custom gateway",
    description: "Emissary or another compatible endpoint",
    advanced: true,
  },
  {
    id: "local",
    name: "Local endpoint",
    description: "A model server in the agent’s environment",
    advanced: true,
  },
] as const;
type ProviderChoice = (typeof providers)[number]["id"] | "openai_compatible";

/** What a completed setup can tell its host beyond the binding itself. */
export interface AiProviderSetupResult {
  vendorId?: string;
  protocol?: AiVendorProtocol;
  models: string[];
}

export function AiProviderSetup({
  companyId,
  agentId,
  environmentId,
  initialProvider,
  initialProtocol,
  providerLabel,
  advancedOnly = false,
  vendorOnly = false,
  protocols,
  reconnect,
  onCancel,
  onComplete,
}: {
  companyId: string;
  agentId?: string;
  environmentId?: string;
  initialProvider?: ProviderChoice;
  initialProtocol?: AiProviderRouting["protocol"];
  providerLabel?: string;
  advancedOnly?: boolean;
  /** Show only the known-vendor cards; used by hosts that already offered the native providers. */
  vendorOnly?: boolean;
  /** Wire formats the host can run. One entry locks the format select to it. */
  protocols?: AiVendorProtocol[];
  reconnect?: AiManagedConnectionSummary;
  onCancel: () => void;
  onComplete: (
    binding: Exclude<AiConnectionBinding, { mode: "responsible_user" }>,
    context?: AiProviderSetupResult,
  ) => void;
}) {
  const reconnectKindRaw: string | undefined = reconnect?.routing?.kind;
  const reconnectPreset = reconnectKindRaw === "openai_compatible"
    ? aiVendorPresetForEndpoint(reconnect?.routing?.baseUrl)
    : undefined;
  const [provider, setProvider] = useState<ProviderChoice | undefined>(
    reconnect
      ? reconnectKindRaw === "gateway" ||
        reconnectKindRaw === "local" ||
        reconnectKindRaw === "bedrock" ||
        reconnectKindRaw === "openai_compatible"
        ? (reconnectKindRaw as ProviderChoice)
        : reconnect.provider
      : initialProvider,
  );
  const [vendorPresetId, setVendorPresetId] = useState<string | null>(
    reconnectPreset?.id ?? null,
  );
  const vendorPreset = aiVendorPreset(vendorPresetId);
  const protocolOptions: AiVendorProtocol[] = protocols ?? ["messages", "chat"];
  const presetProtocol = (preset: NonNullable<ReturnType<typeof aiVendorPreset>>): AiVendorProtocol =>
    protocolOptions.includes(preset.defaultProtocol) ? preset.defaultProtocol : protocolOptions[0];
  const [step, setStep] = useState(
    reconnect || initialProvider ? "connect" : "provider",
  );
  const [ownershipChoice, setOwnership] = useState<"personal" | "shared">();
  const [allAgentsChoice, setAllAgents] = useState<boolean>();
  const [agentIds, setAgentIds] = useState(new Set(agentId ? [agentId] : []));
  const [protocol, setProtocol] = useState<AiProviderRouting["protocol"]>(
    reconnect?.routing?.protocol ??
      initialProtocol ??
      (vendorPreset
        ? presetProtocol(vendorPreset)
        : provider === "openai_compatible"
          ? protocolOptions[0]
          : "responses"),
  );
  const [auth, setAuth] = useState<AiProviderRouting["auth"]>(
    reconnect?.routing?.auth ?? "bearer",
  );
  const [baseUrl, setBaseUrl] = useState(
    reconnect?.routing?.baseUrl ??
      (vendorPreset ? vendorPreset.endpoints[presetProtocol(vendorPreset)] : ""),
  );
  const [region, setRegion] = useState(
    reconnect?.routing?.region ?? "us-east-1",
  );
  const [models, setModels] = useState(
    reconnect?.routing?.models.map((m) => m.id).join(", ") ??
      (vendorPreset ? vendorPreset.models.join(", ") : ""),
  );
  // A vendor preset derives authentication from its wire format: the Claude-compatible
  // surface takes an x-api-key, Chat Completions takes a bearer token.
  const vendorProtocol: AiVendorProtocol | undefined = vendorPreset
    ? (protocol === "messages" ? "messages" : "chat")
    : undefined;
  const effectiveAuth: AiProviderRouting["auth"] = vendorProtocol
    ? aiVendorAuth(vendorProtocol)
    : auth;
  const [apiKey, setApiKey] = useState("");
  const client = useQueryClient();
  const accounts = useQuery({
    queryKey: ["ai-connections", companyId, agentId],
    queryFn: () => aiConnectionsApi.list(companyId, agentId),
  });
  const canManageConnections = accounts.data?.canManageConnections ?? false;
  const ownership = reconnect?.ownership ?? ownershipChoice ?? (!agentId && canManageConnections ? "shared" : "personal");
  const allAgents = allAgentsChoice ?? (!agentId && canManageConnections);
  const agents = useQuery({
    queryKey: ["agents", companyId, "provider-access"],
    queryFn: () => agentsApi.list(companyId),
  });
  const label = providerLabel ?? vendorPreset?.name ?? providers.find((p) => p.id === provider)?.name ?? "provider";
  const advanced = reconnect
    ? Boolean(reconnect.routing)
    : provider === "openai_compatible" ||
      ["openrouter", "bedrock", "gateway", "local"].includes(provider ?? "");
  const nativeProvider: AiProvider =
    provider === "bedrock"
      ? "anthropic"
      : provider === "gateway" || provider === "local" || provider === "openai_compatible"
        ? protocol === "messages"
          ? "anthropic"
          : "openai"
        : ((provider as AiProvider | undefined) ?? "openai");
  const name =
    reconnect?.name ??
    `${ownership === "personal" ? "My" : "Company"} ${
      (provider === "gateway" || provider === "openai_compatible") && baseUrl
        ? (() => {
            try {
              return new URL(baseUrl).hostname;
            } catch {
              return label;
            }
          })()
        : label
    }`;
  const complete = (result: {
    connectionId: string;
    grantId: string;
    method?: "api_key" | "subscription";
  }) => {
    void client.invalidateQueries({ queryKey: ["ai-connections", companyId] });
    void client.invalidateQueries({ queryKey: ["tools"] });
    onComplete({
      provider: nativeProvider,
      method: result.method ?? "api_key",
      mode: ownership === "shared" ? "shared" : "delegated",
      ...result,
    }, {
      vendorId: vendorPreset?.id,
      protocol: vendorProtocol,
      models: models
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    });
  };
  const save = useMutation({
    mutationFn: () => {
      const routing =
        reconnect?.routing ??
        aiProviderRoutingSchema.parse({
          kind: provider,
          protocol: provider === "bedrock" ? "bedrock" : protocol,
          auth: provider === "openrouter" ? "bearer" : effectiveAuth,
          ...(provider === "bedrock"
            ? { region }
            : provider === "gateway" || provider === "local" || provider === "openai_compatible"
              ? { baseUrl }
              : {}),
          models: models
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
            .map((id) => ({ id })),
        });
      return aiConnectionsApi.create(
        companyId,
        createAiConnectionSchema.parse({
          provider: nativeProvider,
          method: "api_key",
          name,
          ownership,
          allAgents,
          agentIds: [...agentIds],
          connectionId: reconnect?.id,
          routing,
          ...(effectiveAuth !== "none" ? { apiKey } : {}),
        }),
      );
    },
    onSuccess: complete,
    onSettled: () => {
      setApiKey("");
    },
  });
  const choices = (advancedOnly: boolean) => (
    <ConnectionChoiceList
      choices={providers
        .filter((p) => !vendorOnly || "presetId" in p)
        .filter((p) => Boolean("advanced" in p && p.advanced) === advancedOnly)
        .map((p) => {
          const preset = "presetId" in p ? aiVendorPreset(p.presetId) : undefined;
          return {
            ...p,
            icon:
              p.id === "gateway" || p.id === "local" ? (
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  {p.id === "gateway" ? (
                    <Network className="size-5" />
                  ) : (
                    <Monitor className="size-5" />
                  )}
                </span>
              ) : (
                <AppLogo name={p.name} brandKey={preset?.brandKey ?? p.id} />
              ),
          };
        })}
      onSelect={(id) => {
        const selectedPreset = id.startsWith("vendor:")
          ? aiVendorPreset(id.slice("vendor:".length))
          : undefined;
        save.reset();
        setApiKey("");
        setAuth("bearer");
        if (selectedPreset) {
          const nextProtocol = presetProtocol(selectedPreset);
          setProvider("openai_compatible");
          setVendorPresetId(selectedPreset.id);
          setProtocol(nextProtocol);
          setBaseUrl(selectedPreset.endpoints[nextProtocol]);
          setModels(selectedPreset.models.join(", "));
          setStep("connect");
          return;
        }
        setVendorPresetId(null);
        setProvider(id as ProviderChoice);
        setModels("");
        setStep("connect");
      }}
    />
  );
  const selectProtocol = (next: AiProviderRouting["protocol"]) => {
    setProtocol(next);
    if (next !== "messages" && auth === "api_key") setAuth("bearer");
    // A vendor's two surfaces live on different base URLs; follow the chosen format when the
    // board has not replaced the preset URL with something custom.
    if (vendorPreset && (next === "chat" || next === "messages")) {
      const endpoints = vendorPreset.endpoints;
      const otherEndpoint = next === "messages" ? endpoints.chat : endpoints.messages;
      if (!baseUrl.trim() || baseUrl.trim().replace(/\/+$/, "") === otherEndpoint) {
        setBaseUrl(endpoints[next]);
      }
    }
  };
  const modelSettings = (
    <label className="block space-y-2 text-xs text-muted-foreground">
      Model IDs (comma separated)
      <Input
        aria-label="Model IDs"
        value={models}
        onChange={(e) => setModels(e.target.value)}
        disabled={Boolean(reconnect)}
      />
      <span className="block">
        Use the provider’s model ID or your gateway’s alias. You can
        also enter one on the agent.
      </span>
    </label>
  );
  const accessDefaults = !reconnect ? (
    <ConnectionAccessDefaults
      companyId={companyId}
      extra={advanced ? modelSettings : undefined}
      agents={agents.data ?? []}
      sentence={connectionDefaultSummarySentence({ grantKind: ownership === "shared" ? "organization" : "user", authKind: effectiveAuth === "none" ? "none" : "api_key", installChoice: allAgents ? "all" : "specific", installCount: agentIds.size })}
      capabilities={{ canCreateOrganizationGrant: canManageConnections, canSetCompanyInstall: canManageConnections }}
      authKind={effectiveAuth === "none" ? "none" : "api_key"}
      grantKind={ownership === "shared" ? "organization" : "user"}
      grantKinds={["user", "organization"]}
      setGrantKind={kind => setOwnership(kind === "organization" ? "shared" : "personal")}
      installChoice={allAgents ? "all" : "specific"}
      setInstallChoice={choice => setAllAgents(choice === "all")}
      installAgentIds={agentIds}
      setInstallAgentIds={setAgentIds}
      disabled={save.isPending}
      notice={!canManageConnections ? ["Only a connection manager can share this credential with everyone or give every agent access."] : undefined}
    />
  ) : undefined;
  // A host that opened this sheet as its own screen (vendor-only) has nowhere
  // to return to inside it, so Back leaves rather than stepping back to the
  // card list it was the only way to reach in the first place.
  const cancel = () => vendorOnly || reconnect || initialProvider ? onCancel() : setStep("provider");
  if (!reconnect && accounts.isPending) return <p role="status">Loading connection permissions…</p>;
  if (!reconnect && accounts.isError) return <p role="alert">Could not load connection permissions. <Button type="button" variant="ghost" onClick={() => void accounts.refetch()}>Retry</Button></p>;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6" onSubmit={(event) => event.stopPropagation()}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          {step === "provider"
            ? "Connect a model provider"
            : `${reconnect ? "Reconnect" : "Connect"} ${label}`}
        </h2>
      </div>
      {agents.isError && <p role="alert" className="text-sm text-destructive">Could not load agents. <Button type="button" variant="ghost" onClick={() => void agents.refetch()}>Retry</Button></p>}
      {step === "provider" ? (
        <>
          {advancedOnly ? choices(true) : <>
          {choices(false)}
          {!vendorOnly && (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Advanced providers
              </summary>
              <div className="pt-4">{choices(true)}</div>
            </details>
          )}
          </>}
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </>
      ) : !advanced ? (
        <AiConnectionCredentialStep
          companyId={companyId}
          provider={nativeProvider}
          connectionId={reconnect?.id}
          initialMethod={reconnect?.method}
          fixedMethod={Boolean(reconnect)}
          name={name}
          hideName
          ownership={ownership}
          allAgents={allAgents}
          agentIds={[...agentIds]}
          environmentId={environmentId}
          onCancel={cancel}
          defaults={accessDefaults}
          disabled={!reconnect && ownership === "shared" && !allAgents && agentIds.size === 0}
          onComplete={complete}
        />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {(provider === "gateway" || provider === "local" || provider === "openai_compatible") && (
            <>
              <label className="block space-y-2 text-xs text-muted-foreground">
                Provider URL
                <Input
                  aria-label="Provider URL"
                  placeholder={
                    provider === "local"
                      ? "http://localhost:11434/v1"
                      : vendorPreset
                        ? vendorPreset.endpoints[vendorProtocol ?? "chat"]
                        : provider === "openai_compatible"
                          ? "https://api.example.com/v1"
                          : "https://gateway.example.com/v1"
                  }
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={Boolean(reconnect)}
                />
              </label>
              <label className="block space-y-2 text-xs text-muted-foreground">
                API format
                <Select
                  value={protocol}
                  onValueChange={(v) => selectProtocol(v as typeof protocol)}
                  disabled={
                    Boolean(reconnect) ||
                    Boolean(initialProtocol) ||
                    protocolOptions.length === 1
                  }
                >
                  <SelectTrigger aria-label="API format" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {protocolOptions.includes("chat") && (
                      <SelectItem value="chat">
                        Chat Completions · OpenCode, Hermes
                      </SelectItem>
                    )}
                    {protocolOptions.includes("messages") && (provider === "openai_compatible" || provider === "local" || provider === "gateway") ? (
                      <SelectItem value="messages">
                        Anthropic Messages · Claude
                      </SelectItem>
                    ) : null}
                    {provider !== "openai_compatible" && (
                      <SelectItem value="responses">
                        OpenAI Responses · Codex
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </label>
            </>
          )}
          {provider === "bedrock" && (
            <label className="block space-y-2 text-xs text-muted-foreground">
              AWS region
              <Input
                aria-label="AWS region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={Boolean(reconnect)}
              />
            </label>
          )}
          {vendorPreset && (
            <p className="text-xs text-muted-foreground">
              Sends {vendorProtocol === "messages" ? "Anthropic Messages with an x-api-key" : "OpenAI Chat Completions with a bearer token"}.
              {" "}The vendor documents this credential as <code>{vendorPreset.envKey}</code>.{" "}
              <a
                href={vendorPreset.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Provider setup guide
              </a>
            </p>
          )}
          {provider !== "openrouter" && !vendorPreset && (
            <label className="block space-y-2 text-xs text-muted-foreground">
              Authentication
              <Select
                value={auth}
                onValueChange={(v) => setAuth(v as typeof auth)}
                disabled={Boolean(reconnect)}
              >
                <SelectTrigger aria-label="Authentication" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">
                    {provider === "bedrock"
                      ? "Bedrock API key"
                      : "Bearer token"}
                  </SelectItem>
                  {provider !== "bedrock" && (
                    <>
                      {protocol === "messages" && (
                        <SelectItem value="api_key">
                          API key · x-api-key
                        </SelectItem>
                      )}
                      <SelectItem value="none">No authentication</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </label>
          )}
          {
            effectiveAuth !== "none" && (
              <label className="block space-y-2 text-xs text-muted-foreground">
                API key
                <Input
                  aria-label="API key"
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
            )
          }
          {reconnect && <details><summary className="cursor-pointer text-sm text-muted-foreground">Model settings</summary>{modelSettings}</details>}
          <p className="text-xs text-muted-foreground">
            Test the connection with your chosen model in the agent’s execution
            environment after connecting.
          </p>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error instanceof Error && save.error.name === "ZodError"
                ? "Check the URL, API format, and authentication fields."
                : save.error.message}
            </p>
          )}
          {accessDefaults}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={save.isPending}
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={
                save.isPending || accounts.isPending || accounts.isError ||
                (!reconnect && ownership === "shared" && !allAgents && agentIds.size === 0) ||
                (effectiveAuth !== "none" && !apiKey.trim())
              }
            >
              {save.isPending
                ? "Connecting…"
                : reconnect
                  ? "Reconnect"
                  : "Connect"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
