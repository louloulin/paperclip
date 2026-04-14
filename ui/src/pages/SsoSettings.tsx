import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { ssoApi, type SsoConfig, type SsoProviderInfo, type SsoConfigCreate } from "../api/sso";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Shield, Key } from "lucide-react";

const PROVIDER_LABELS: Record<string, string> = {
  okta: "Okta",
  google: "Google Workspace",
  feishu: "飞书 (Feishu)",
  dingtalk: "钉钉 (DingTalk)",
  oidc: "通用 OIDC",
  saml: "通用 SAML 2.0",
};

const PROVIDER_ICONS: Record<string, string> = {
  okta: "🔐",
  google: "🌐",
  feishu: "📮",
  dingtalk: "💬",
  oidc: "🔑",
  saml: "🛡️",
};

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.125rem 0.5rem",
        borderRadius: "6px",
        background: "var(--accent, #3b82f6)",
        color: "white",
        fontSize: "0.6875rem",
        fontWeight: 500,
      }}
    >
      {PROVIDER_ICONS[provider] || "🔐"} {PROVIDER_LABELS[provider] || provider}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    active: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
    error: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
    pending: { bg: "rgba(234,179,8,0.15)", color: "#eab308" },
  };
  const c = colors[status] || { bg: "rgba(128,128,128,0.15)", color: "#888" };
  return (
    <span
      style={{
        fontSize: "0.6875rem",
        padding: "0.125rem 0.375rem",
        borderRadius: "4px",
        background: c.bg,
        color: c.color,
      }}
    >
      {status}
    </span>
  );
}

function AddProviderForm({
  providers,
  onAdd,
  onCancel,
}: {
  providers: SsoProviderInfo[];
  onAdd: (provider: SsoProviderInfo) => void;
  onCancel: () => void;
}) {
  const existing = new Set<string>([]); // We filter already added ones above
  const available = providers.filter((p) => !existing.has(p.id));

  if (available.length === 0) {
    return (
      <div style={{ padding: "1rem", textAlign: "center", color: "var(--muted)" }}>
        All providers have been configured.
        <Button variant="outline" onClick={onCancel} style={{ marginTop: "0.5rem", marginLeft: "0.5rem" }}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "1.5rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
      }}
    >
      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.25rem" }}>选择 SSO 提供商</h3>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: 0 }}>
          选择要添加的 SSO 提供商类型
        </p>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {available.map((provider) => (
          <button
            key={provider.id}
            onClick={() => onAdd(provider)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.375rem",
              padding: "1rem",
              background: "var(--accent, #3b82f6)",
              color: "white",
              border: "1px solid var(--accent, #3b82f6)",
              borderRadius: "8px",
              cursor: "pointer",
              minWidth: "110px",
              transition: "opacity 0.15s",
            }}
          >
            <span style={{ fontSize: "1.75rem" }}>{PROVIDER_ICONS[provider.id] || "🔐"}</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{provider.name}</span>
          </button>
        ))}
      </div>
      <Button variant="outline" onClick={onCancel}>取消</Button>
    </div>
  );
}

function ConfigForm({
  provider,
  config,
  companyId,
  onSave,
  onCancel,
  saving,
}: {
  provider: SsoProviderInfo;
  config?: SsoConfig;
  companyId: string;
  onSave: (data: SsoConfigCreate) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(config?.name ?? `${provider.name} SSO`);
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [isDefault, setIsDefault] = useState(config?.isDefault ?? false);
  const [allowedDomains, setAllowedDomains] = useState(config?.allowedDomains ?? "");
  const [clientId, setClientId] = useState("");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [scopes, setScopes] = useState("openid email profile");
  const [clientSecret, setClientSecret] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const configData: SsoConfigCreate = {
      provider: provider.id as SsoConfigCreate["provider"],
      name,
      enabled,
      isDefault,
      allowedDomains: allowedDomains ? allowedDomains.split(",").map((d) => d.trim()) : undefined,
      config: {
        ...(clientId ? { clientId } : {}),
        ...(issuerUrl ? { issuerUrl } : {}),
        scopes: scopes.split(" ").filter(Boolean),
        ...(provider.id === "google" ? { googleClientId: clientId } : {}),
        ...(provider.id === "okta" ? { oktaDomain: issuerUrl } : {}),
        ...(provider.id === "feishu" ? { feishuAppId: clientId } : {}),
        ...(provider.id === "dingtalk" ? { dingtalkAppKey: clientId } : {}),
        ...(provider.id === "saml" ? { samlMetadataUrl: issuerUrl } : {}),
      },
    };
    onSave(configData);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        padding: "1.5rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "1.5rem" }}>{PROVIDER_ICONS[provider.id]}</span>
        <h3 style={{ margin: 0 }}>{config ? "编辑配置" : `配置 ${provider.name}`}</h3>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
          配置名称 *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
        />
      </div>

      {(provider.id === "okta" || provider.id === "oidc") && (
        <div>
          <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
            Issuer URL *
          </label>
          <input
            type="url"
            value={issuerUrl}
            onChange={(e) => setIssuerUrl(e.target.value)}
            placeholder={provider.id === "okta" ? "https://your-org.okta.com" : "https://your-idp.com"}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
      )}

      {(provider.id !== "saml") && (
        <div>
          <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
            Client ID / App ID *
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={
              provider.id === "google" ? ".apps.googleusercontent.com"
                : provider.id === "feishu" ? "cli_xxxxxxxx"
                : provider.id === "dingtalk" ? "dingtalk_app_key"
                : "Client ID from your IdP"
            }
            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
      )}

      {provider.id !== "saml" && (
        <div>
          <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
            Client Secret
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Leave blank to keep existing"
            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
      )}

      {provider.id === "saml" && (
        <div>
          <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
            SAML Metadata URL
          </label>
          <input
            type="url"
            value={issuerUrl}
            onChange={(e) => setIssuerUrl(e.target.value)}
            placeholder="https://your-idp.com/metadata.xml"
            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
      )}

      <div>
        <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
          OAuth Scopes
        </label>
        <input
          type="text"
          value={scopes}
          onChange={(e) => setScopes(e.target.value)}
          placeholder="openid email profile"
          style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
        />
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
          允许的邮箱域名（可选）
        </label>
        <input
          type="text"
          value={allowedDomains}
          onChange={(e) => setAllowedDomains(e.target.value)}
          placeholder="company.com, subsidiary.com"
          style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
        />
        <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0.25rem 0 0" }}>
          逗号分隔。设置后仅这些域名的用户可通过 SSO 登录。
        </p>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用 SSO
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          默认登录方式
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "保存中..." : config ? "更新配置" : "添加提供商"}
        </Button>
      </div>
    </form>
  );
}

function AuditLogModal({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const { data: auditLog, isLoading } = useQuery({
    queryKey: ["sso-audit", companyId],
    queryFn: () => ssoApi.listAuditLog(companyId),
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--card)",
          borderRadius: "12px",
          padding: "1.5rem",
          maxWidth: "700px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>SSO 审计日志</h2>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </div>
        {isLoading ? (
          <PageSkeleton />
        ) : !auditLog || auditLog.length === 0 ? (
          <p style={{ color: "var(--muted)", textAlign: "center" }}>暂无审计记录</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>时间</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>事件</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>提供商</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((event, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-dim, #2a2a2a)" }}>
                  <td style={{ padding: "0.5rem" }}>{new Date(event.createdAt).toLocaleString()}</td>
                  <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>{event.event}</td>
                  <td style={{ padding: "0.5rem" }}>{event.provider || "-"}</td>
                  <td style={{ padding: "0.5rem" }}>{event.actorIp || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function SsoSettings() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    setBreadcrumbs([{ label: "SSO / SAML" }]);
  }, [setBreadcrumbs]);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["sso-configs", selectedCompanyId],
    queryFn: () => ssoApi.listConfigs(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const { data: providersData } = useQuery<{ providers: SsoProviderInfo[] }>({
    queryKey: ["sso-providers"],
    queryFn: () => ssoApi.listProviders(),
  });
  const providers: SsoProviderInfo[] = providersData?.providers ?? [];

  const [showAddProvider, setShowAddProvider] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<SsoProviderInfo | null>(null);
  const [editingConfig, setEditingConfig] = useState<SsoConfig | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: SsoConfigCreate) => ssoApi.createConfig(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-configs"] });
      pushToast({ tone: "success", title: "操作成功", body: "SSO 配置已添加" });
      setShowAddProvider(false);
      setSelectedProvider(null);
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: "添加失败", body: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ configId, data }: { configId: string; data: Partial<SsoConfigCreate> }) =>
      ssoApi.updateConfig(selectedCompanyId!, configId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-configs"] });
      pushToast({ tone: "success", title: "操作成功", body: "SSO 配置已更新" });
      setEditingConfig(null);
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: "更新失败", body: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (configId: string) => ssoApi.deleteConfig(selectedCompanyId!, configId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-configs"] });
      pushToast({ tone: "success", title: "操作成功", body: "SSO 配置已删除" });
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: "删除失败", body: err.message });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ configId, enabled }: { configId: string; enabled: boolean }) =>
      ssoApi.updateConfig(selectedCompanyId!, configId, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-configs"] });
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: "操作失败", body: err.message });
    },
  });

  const testMutation = useMutation({
    mutationFn: (configId: string) => ssoApi.testConnection(selectedCompanyId!, configId),
    onSuccess: (result) => {
      pushToast({ tone: result.success ? "success" : "error", title: result.success ? "连接测试成功" : "测试失败", body: result.success ? "连接配置正确" : result.message });
      queryClient.invalidateQueries({ queryKey: ["sso-configs"] });
    },
    onError: (err: Error) => {
      pushToast({ tone: "error", title: "测试失败", body: err.message });
    },
  });

  const existingProviderIds = new Set(configs.map((c) => c.provider));
  const availableProviders = providers.filter((p) => !existingProviderIds.has(p.id));

  if (!selectedCompanyId) {
    return <PageSkeleton />;
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Key size={24} />
          SSO / SAML 设置
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", margin: 0 }}>
          为公司配置单点登录 (SSO)。支持 Okta、Google Workspace、飞书、钉钉、OIDC 和 SAML。
        </p>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              已配置 ({configs.length})
            </h2>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button variant="outline" size="sm" onClick={() => setShowAudit(true)}>
                审计日志
              </Button>
              {availableProviders.length > 0 && (
                <Button size="sm" onClick={() => setShowAddProvider(true)}>
                  + 添加提供商
                </Button>
              )}
            </div>
          </div>

          {/* Config List */}
          {configs.length === 0 && !showAddProvider && (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                background: "var(--card)",
                border: "1px dashed var(--border)",
                borderRadius: "8px",
                color: "var(--muted)",
              }}
            >
              暂无 SSO 配置。点击"添加提供商"开始配置。
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
            {configs.map((config) => (
              <div
                key={config.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  opacity: config.enabled ? 1 : 0.7,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>{PROVIDER_ICONS[config.provider]}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600 }}>{config.name}</span>
                      <StatusBadge status={config.status} />
                      {config.isDefault && (
                        <span style={{ fontSize: "0.6875rem", padding: "0.125rem 0.375rem", borderRadius: "4px", background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                          默认
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--muted)", marginTop: "0.125rem" }}>
                      {PROVIDER_LABELS[config.provider]} · 创建于 {new Date(config.createdAt).toLocaleDateString()}
                    </div>
                    {config.errorMessage && (
                      <div style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "0.25rem" }}>
                        错误: {config.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Button variant="outline" size="sm" onClick={() => setEditingConfig(config)}>
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate(config.id)}
                    disabled={testMutation.isPending}
                  >
                    测试
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMutation.mutate({ configId: config.id, enabled: !config.enabled })}
                    disabled={toggleMutation.isPending}
                    style={{ color: config.enabled ? "#ef4444" : "#22c55e", borderColor: config.enabled ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)" }}
                  >
                    {config.enabled ? "禁用" : "启用"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("确定要删除此 SSO 配置吗？")) {
                        deleteMutation.mutate(config.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Add Provider Selection */}
          {showAddProvider && !selectedProvider && (
            <AddProviderForm
              providers={availableProviders}
              onAdd={(provider) => setSelectedProvider(provider)}
              onCancel={() => setShowAddProvider(false)}
            />
          )}

          {/* Add/Edit Config Form */}
          {(showAddProvider && selectedProvider) && (
            <div style={{ marginTop: "1rem" }}>
              <ConfigForm
                provider={selectedProvider}
                companyId={selectedCompanyId}
                onSave={(data) => createMutation.mutate(data)}
                onCancel={() => {
                  setSelectedProvider(null);
                  setShowAddProvider(false);
                }}
                saving={createMutation.isPending}
              />
            </div>
          )}

          {editingConfig && (
            <div style={{ marginTop: "1rem" }}>
              <ConfigForm
                provider={providers.find((p) => p.id === editingConfig.provider) ?? { id: editingConfig.provider as SsoProviderInfo["id"], name: editingConfig.provider, description: "", icon: "" }}
                config={editingConfig}
                companyId={selectedCompanyId}
                onSave={(data) => updateMutation.mutate({ configId: editingConfig.id, data })}
                onCancel={() => setEditingConfig(null)}
                saving={updateMutation.isPending}
              />
            </div>
          )}
        </>
      )}

      {/* Audit Modal */}
      {showAudit && selectedCompanyId && (
        <AuditLogModal companyId={selectedCompanyId} onClose={() => setShowAudit(false)} />
      )}
    </div>
  );
}
