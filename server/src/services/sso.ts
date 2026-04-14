import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, ssoConfigs, ssoAuditLog, ssoSessions } from "@paperclipai/db";
import { notFound, forbidden, badRequest } from "../errors.js";
import { logActivity } from "./activity-log.js";

export type SsoProvider = "okta" | "google" | "feishu" | "dingtalk" | "oidc" | "saml";

export interface SsoConfigCreateInput {
  provider: SsoProvider;
  name: string;
  enabled?: boolean;
  config: SsoProviderConfig;
  allowedDomains?: string[];
  isDefault?: boolean;
  userMapping?: UserMappingConfig;
}

export interface SsoProviderConfig {
  // OIDC/SAML common
  issuerUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  jwksUri?: string;
  // OAuth client
  clientId?: string;
  redirectUri?: string;
  // SAML specific
  samlMetadataUrl?: string;
  samlAcsUrl?: string;
  samlEntityId?: string;
  // Okta specific
  oktaDomain?: string;
  // Google specific
  googleClientId?: string;
  // Feishu specific
  feishuAppId?: string;
  feishuEndpoint?: string;
  // DingTalk specific
  dingtalkAppKey?: string;
  dingtalkEndpoint?: string;
  // Scope
  scopes?: string[];
}

export interface UserMappingConfig {
  emailField?: string;
  nameField?: string;
  roleMapping?: Record<string, string>;
  autoProvision?: boolean; // 自动创建用户
}

export interface SsoConfigRow {
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
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
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
  createdAt: Date;
}

export function ssoService(db: Db) {
  return {
    async listByCompany(companyId: string): Promise<SsoConfigRow[]> {
      const rows = await db
        .select()
        .from(ssoConfigs)
        .where(eq(ssoConfigs.companyId, companyId))
        .orderBy(desc(ssoConfigs.createdAt));
      return rows as SsoConfigRow[];
    },

    async getById(configId: string): Promise<SsoConfigRow | null> {
      const row = await db
        .select()
        .from(ssoConfigs)
        .where(eq(ssoConfigs.id, configId))
        .then((rows) => rows[0] ?? null);
      return row as SsoConfigRow | null;
    },

    async getByCompanyAndId(companyId: string, configId: string): Promise<SsoConfigRow | null> {
      const row = await db
        .select()
        .from(ssoConfigs)
        .where(and(eq(ssoConfigs.companyId, companyId), eq(ssoConfigs.id, configId)))
        .then((rows) => rows[0] ?? null);
      return row as SsoConfigRow | null;
    },

    async getDefaultConfig(companyId: string): Promise<SsoConfigRow | null> {
      const row = await db
        .select()
        .from(ssoConfigs)
        .where(and(eq(ssoConfigs.companyId, companyId), eq(ssoConfigs.isDefault, true), eq(ssoConfigs.enabled, true)))
        .then((rows) => rows[0] ?? null);
      return row as SsoConfigRow | null;
    },

    async getActiveConfigs(companyId: string): Promise<SsoConfigRow[]> {
      const rows = await db
        .select()
        .from(ssoConfigs)
        .where(and(eq(ssoConfigs.companyId, companyId), eq(ssoConfigs.enabled, true)))
        .orderBy(desc(ssoConfigs.isDefault));
      return rows as SsoConfigRow[];
    },

    async create(companyId: string, userId: string | null, input: SsoConfigCreateInput): Promise<SsoConfigRow> {
      // Validate provider
      const validProviders: SsoProvider[] = ["okta", "google", "feishu", "dingtalk", "oidc", "saml"];
      if (!validProviders.includes(input.provider)) {
        throw badRequest(`Invalid provider: ${input.provider}`);
      }

      // If this is set as default, unset others
      if (input.isDefault) {
        await db
          .update(ssoConfigs)
          .set({ isDefault: false })
          .where(and(eq(ssoConfigs.companyId, companyId), eq(ssoConfigs.isDefault, true)));
      }

      const row = await db
        .insert(ssoConfigs)
        .values({
          companyId,
          provider: input.provider,
          name: input.name,
          enabled: input.enabled ?? false,
          config: input.config,
          allowedDomains: input.allowedDomains?.join(",") ?? null,
          isDefault: input.isDefault ?? false,
          status: "pending",
          userMapping: input.userMapping ?? { emailField: "email", nameField: "name", roleMapping: {} },
          createdByUserId: userId,
        })
        .returning()
        .then((rows) => rows[0]);

      await logActivity(db, {
        companyId,
        actorType: userId ? "user" : "system",
        actorId: userId ?? "system",
        action: "sso.config_created",
        entityType: "sso_config",
        entityId: row.id,
        details: { provider: input.provider, name: input.name },
      });

      return row as SsoConfigRow;
    },

    async update(
      configId: string,
      companyId: string,
      userId: string | null,
      input: Partial<SsoConfigCreateInput>,
    ): Promise<SsoConfigRow> {
      const existing = await this.getByCompanyAndId(companyId, configId);
      if (!existing) throw notFound("SSO config not found");

      const updates: {
        updatedAt: Date;
        name?: string;
        enabled?: boolean;
        config?: SsoProviderConfig;
        allowedDomains?: string | null;
        isDefault?: boolean;
        userMapping?: UserMappingConfig;
      } = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.enabled !== undefined) updates.enabled = input.enabled;
      if (input.config !== undefined) updates.config = input.config;
      if (input.allowedDomains !== undefined) updates.allowedDomains = input.allowedDomains?.join(",") ?? null;
      if (input.userMapping !== undefined) updates.userMapping = input.userMapping;

      if (input.isDefault === true) {
        await db
          .update(ssoConfigs)
          .set({ isDefault: false })
          .where(and(eq(ssoConfigs.companyId, companyId), eq(ssoConfigs.isDefault, true)));
        updates.isDefault = true;
      }

      const row = await db
        .update(ssoConfigs)
        .set(updates)
        .where(and(eq(ssoConfigs.id, configId), eq(ssoConfigs.companyId, companyId)))
        .returning()
        .then((rows) => rows[0]);

      await logActivity(db, {
        companyId,
        actorType: userId ? "user" : "system",
        actorId: userId ?? "system",
        action: "sso.config_updated",
        entityType: "sso_config",
        entityId: configId,
        details: { changedFields: Object.keys(input) },
      });

      return row as SsoConfigRow;
    },

    async delete(configId: string, companyId: string): Promise<void> {
      const existing = await this.getByCompanyAndId(companyId, configId);
      if (!existing) throw notFound("SSO config not found");

      await db
        .delete(ssoConfigs)
        .where(and(eq(ssoConfigs.id, configId), eq(ssoConfigs.companyId, companyId)));

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: "system",
        action: "sso.config_deleted",
        entityType: "sso_config",
        entityId: configId,
        details: { provider: existing.provider, name: existing.name },
      });
    },

    async testConnection(configId: string, companyId: string): Promise<{ success: boolean; message: string }> {
      const config = await this.getByCompanyAndId(companyId, configId);
      if (!config) throw notFound("SSO config not found");

      try {
        // Basic connectivity test based on provider type
        const cfg = config.config;
        switch (config.provider) {
          case "okta": {
            if (!cfg.issuerUrl) throw new Error("Okta issuer URL is required");
            const res = await fetch(`${cfg.issuerUrl}/.well-known/openid-configuration`);
            if (!res.ok) throw new Error(`Okta endpoint returned ${res.status}`);
            break;
          }
          case "google": {
            if (!cfg.googleClientId) throw new Error("Google Client ID is required");
            // Google well-known endpoint
            const res = await fetch("https://accounts.google.com/.well-known/openid-configuration");
            if (!res.ok) throw new Error("Google OIDC endpoint unreachable");
            break;
          }
          case "oidc": {
            if (!cfg.issuerUrl) throw new Error("OIDC issuer URL is required");
            const res = await fetch(`${cfg.issuerUrl}/.well-known/openid-configuration`);
            if (!res.ok) throw new Error(`OIDC discovery endpoint returned ${res.status}`);
            break;
          }
          case "saml": {
            if (!cfg.samlMetadataUrl) throw new Error("SAML metadata URL is required");
            const res = await fetch(cfg.samlMetadataUrl);
            if (!res.ok) throw new Error(`SAML metadata returned ${res.status}`);
            break;
          }
          case "feishu":
          case "dingtalk": {
            // These require app credentials - basic validation only
            if (config.provider === "feishu" && !cfg.feishuAppId) {
              throw new Error("Feishu App ID is required");
            }
            if (config.provider === "dingtalk" && !cfg.dingtalkAppKey) {
              throw new Error("DingTalk App Key is required");
            }
            break;
          }
        }

        // Update status to active
        await db
          .update(ssoConfigs)
          .set({ status: "active", errorMessage: null, activatedAt: new Date(), updatedAt: new Date() })
          .where(eq(ssoConfigs.id, configId));

        await this.logAudit(companyId, configId, "config_activated", null, null, config.provider, { success: true });

        return { success: true, message: "Connection test successful" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await db
          .update(ssoConfigs)
          .set({ status: "error", errorMessage: message, updatedAt: new Date() })
          .where(eq(ssoConfigs.id, configId));

        await this.logAudit(companyId, configId, "config_error", null, null, config.provider, { error: message });

        return { success: false, message };
      }
    },

    async buildLoginUrl(configId: string, companyId: string, redirectAfter?: string): Promise<string> {
      const config = await this.getByCompanyAndId(companyId, configId);
      if (!config) throw notFound("SSO config not found");
      if (!config.enabled) throw forbidden("SSO is not enabled for this company");

      const state = Buffer.from(JSON.stringify({ configId, companyId, redirectAfter })).toString("base64url");
      const cfg = config.config;
      let url = "";

      switch (config.provider) {
        case "okta":
        case "oidc": {
          const authUrl = cfg.authorizationUrl || `${cfg.issuerUrl}/authorize`;
          const params = new URLSearchParams({
            client_id: cfg.clientId || "",
            redirect_uri: cfg.redirectUri || "",
            response_type: "code",
            scope: (cfg.scopes || ["openid", "email", "profile"]).join(" "),
            state,
          });
          url = `${authUrl}?${params}`;
          break;
        }
        case "google": {
          const params = new URLSearchParams({
            client_id: cfg.googleClientId || cfg.clientId || "",
            redirect_uri: cfg.redirectUri || "",
            response_type: "code",
            scope: (cfg.scopes || ["openid", "email", "profile"]).join(" "),
            state,
          });
          url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
          break;
        }
        case "feishu": {
          const params = new URLSearchParams({
            app_id: cfg.feishuAppId || "",
            redirect_uri: cfg.redirectUri || "",
            state,
          });
          url = `${cfg.feishuEndpoint || "https://open.feishu.cn/open-apis/authen/v1/authorize"}?${params}`;
          break;
        }
        case "dingtalk": {
          const params = new URLSearchParams({
            appkey: cfg.dingtalkAppKey || "",
            redirect_uri: cfg.redirectUri || "",
            state,
          });
          url = `${cfg.dingtalkEndpoint || "https://login.dingtalk.com/oauth2/auth"}?${params}`;
          break;
        }
        case "saml": {
          // For SAML, return the ACS URL (Assertion Consumer Service)
          // The UI should POST to this with the SAMLRequest
          url = cfg.samlAcsUrl || `/api/sso/${configId}/saml/sso`;
          break;
        }
        default:
          throw badRequest(`Provider ${config.provider} login not yet implemented`);
      }

      return url;
    },

    async listAuditLog(companyId: string, configId?: string): Promise<SsoAuditEvent[]> {
      const conditions = [eq(ssoAuditLog.companyId, companyId)];
      if (configId) conditions.push(eq(ssoAuditLog.configId, configId));

      const rows = await db
        .select()
        .from(ssoAuditLog)
        .where(and(...conditions))
        .orderBy(desc(ssoAuditLog.createdAt))
        .limit(100);
      return rows as SsoAuditEvent[];
    },

    async logAudit(
      companyId: string,
      configId: string | null,
      event: string,
      actorEmail: string | null,
      actorIp: string | null,
      provider: string | null,
      details: Record<string, unknown> | null,
    ): Promise<void> {
      await db.insert(ssoAuditLog).values({
        companyId,
        configId,
        event,
        actorEmail,
        actorIp,
        provider,
        details,
      });
    },

    async listProviders(): Promise<Array<{ id: SsoProvider; name: string; description: string; icon: string }>> {
      return [
        { id: "okta", name: "Okta", description: "SAML/OIDC SSO for Okta workspaces", icon: "okta" },
        { id: "google", name: "Google Workspace", description: "Sign in with Google accounts", icon: "google" },
        { id: "feishu", name: "飞书 (Feishu)", description: "飞书 OAuth2 企业登录", icon: "feishu" },
        { id: "dingtalk", name: "钉钉 (DingTalk)", description: "钉钉 OAuth2 企业登录", icon: "dingtalk" },
        { id: "oidc", name: "通用 OIDC", description: "支持任何兼容 OpenID Connect 的身份提供商", icon: "oidc" },
        { id: "saml", name: "通用 SAML 2.0", description: "支持任何兼容 SAML 2.0 的身份提供商", icon: "saml" },
      ];
    },
  };
}
