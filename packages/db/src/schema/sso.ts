import { pgTable, uuid, text, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * SSO/SAML 配置表
 * 每个公司可以有多个 SSO 配置（支持多提供商）
 */
export const ssoConfigs = pgTable(
  "sso_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // 提供商类型: okta | google | feishu | dingtalk | oidc | saml
    provider: text("provider").notNull(),
    // 显示名称
    name: text("name").notNull(),
    // 是否启用
    enabled: boolean("enabled").notNull().default(false),
    // 配置数据（OAuth client_id, OIDC discovery URL, SAML metadata URL 等）
    config: jsonb("config").notNull().$default(() => ({})),
    // 加密后的 secrets (client_secret 等)
    encryptedSecrets: jsonb("encrypted_secrets"),
    // 域名限制（可选，只允许特定域名登录）
    allowedDomains: text("allowed_domains"), // comma-separated domains
    // 是否设为默认登录方式
    isDefault: boolean("is_default").notNull().default(false),
    // 状态
    status: text("status").notNull().default("pending"), // pending | active | error
    errorMessage: text("error_message"),
    // 用户映射规则
    userMapping: jsonb("user_mapping").$default(() => ({
      emailField: "email",
      nameField: "name",
      roleMapping: {},
    })),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => ({
    companyEnabledIdx: index("sso_configs_company_enabled_idx").on(table.companyId, table.enabled),
    companyProviderIdx: index("sso_configs_company_provider_idx").on(table.companyId, table.provider),
  }),
);

/**
 * SSO 会话表 - 追踪活跃 SSO 登录会话
 */
export const ssoSessions = pgTable(
  "sso_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configId: uuid("config_id").notNull().references(() => ssoConfigs.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // 外部身份提供商的 subject (sub claim)
    externalSubject: text("external_subject").notNull(),
    // 映射到的 Paperclip userId
    userId: text("user_id"),
    email: text("email").notNull(),
    displayName: text("display_name"),
    rawProfile: jsonb("raw_profile"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    configIdIdx: index("sso_sessions_config_id_idx").on(table.configId),
    externalSubjectIdx: index("sso_sessions_external_subject_idx").on(table.configId, table.externalSubject),
    userIdIdx: index("sso_sessions_user_id_idx").on(table.userId),
  }),
);

/**
 * SSO 审计日志
 */
export const ssoAuditLog = pgTable(
  "sso_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    configId: uuid("config_id").references(() => ssoConfigs.id),
    event: text("event").notNull(), // login_success | login_failed | config_created | config_updated | config_enabled | config_disabled
    actorEmail: text("actor_email"),
    actorIp: text("actor_ip"),
    provider: text("provider"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedAtIdx: index("sso_audit_log_company_created_idx").on(table.companyId, table.createdAt),
    configEventIdx: index("sso_audit_log_config_event_idx").on(table.configId, table.event),
  }),
);
