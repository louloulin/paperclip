import { api } from "./client";

export type SsoProvider = "okta" | "google" | "feishu" | "dingtalk" | "oidc" | "saml";

export interface SsoProviderInfo {
  id: SsoProvider;
  name: string;
  description: string;
  icon: string;
}

export interface SsoProviderConfig {
  issuerUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  jwksUri?: string;
  clientId?: string;
  redirectUri?: string;
  samlMetadataUrl?: string;
  samlAcsUrl?: string;
  samlEntityId?: string;
  oktaDomain?: string;
  googleClientId?: string;
  feishuAppId?: string;
  feishuEndpoint?: string;
  dingtalkAppKey?: string;
  dingtalkEndpoint?: string;
  scopes?: string[];
}

export interface UserMappingConfig {
  emailField?: string;
  nameField?: string;
  roleMapping?: Record<string, string>;
  autoProvision?: boolean;
}

export interface SsoConfig {
  id: string;
  companyId: string;
  provider: SsoProvider;
  name: string;
  enabled: boolean;
  config: SsoProviderConfig;
  allowedDomains: string | null;
  isDefault: boolean;
  status: "pending" | "active" | "error";
  errorMessage: string | null;
  userMapping: UserMappingConfig;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

export interface SsoAuditEvent {
  id: string;
  companyId: string;
  configId: string | null;
  event: string;
  actorEmail: string | null;
  actorIp: string | null;
  provider: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface SsoConfigCreate {
  provider: SsoProvider;
  name: string;
  enabled?: boolean;
  config: SsoProviderConfig;
  allowedDomains?: string[];
  isDefault?: boolean;
  userMapping?: UserMappingConfig;
}

export const ssoApi = {
  listProviders: () =>
    api.get<{ providers: SsoProviderInfo[] }>("/sso/providers"),

  listConfigs: (companyId: string) =>
    api.get<SsoConfig[]>(`/companies/${companyId}/sso-configs`),

  getConfig: (companyId: string, configId: string) =>
    api.get<SsoConfig>(`/companies/${companyId}/sso-configs/${configId}`),

  createConfig: (companyId: string, data: SsoConfigCreate) =>
    api.post<SsoConfig>(`/companies/${companyId}/sso-configs`, data),

  updateConfig: (companyId: string, configId: string, data: Partial<SsoConfigCreate>) =>
    api.patch<SsoConfig>(`/companies/${companyId}/sso-configs/${configId}`, data),

  deleteConfig: (companyId: string, configId: string) =>
    api.delete<void>(`/companies/${companyId}/sso-configs/${configId}`),

  testConnection: (companyId: string, configId: string) =>
    api.post<{ success: boolean; message: string }>(
      `/companies/${companyId}/sso-configs/${configId}/test`,
      {},
    ),

  initiateLogin: (companyId: string, data?: { configId?: string; redirectAfter?: string }) =>
    api.post<{ loginUrl: string; configId: string }>(
      `/companies/${companyId}/sso-login`,
      data ?? {},
    ),

  listAuditLog: (companyId: string, configId?: string) => {
    const params = configId ? `?configId=${configId}` : "";
    return api.get<SsoAuditEvent[]>(`/companies/${companyId}/sso-audit${params}`);
  },
};
