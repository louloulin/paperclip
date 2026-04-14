-- SSO/SAML 企业认证集成
-- 支持 Okta/Google Workspace/飞书/钉钉/通用 OIDC/SAML

CREATE TABLE "sso_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "name" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "config" jsonb NOT NULL DEFAULT '{}',
  "encrypted_secrets" jsonb,
  "allowed_domains" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'pending',
  "error_message" text,
  "user_mapping" jsonb DEFAULT '{"emailField":"email","nameField":"name","roleMapping":{}}',
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "activated_at" timestamptz
);

CREATE INDEX "sso_configs_company_enabled_idx" ON "sso_configs"("company_id", "enabled");
CREATE INDEX "sso_configs_company_provider_idx" ON "sso_configs"("company_id", "provider");

CREATE TABLE "sso_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "config_id" uuid NOT NULL REFERENCES "sso_configs"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "external_subject" text NOT NULL,
  "user_id" text,
  "email" text NOT NULL,
  "display_name" text,
  "raw_profile" jsonb,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "sso_sessions_config_id_idx" ON "sso_sessions"("config_id");
CREATE INDEX "sso_sessions_external_subject_idx" ON "sso_sessions"("config_id", "external_subject");
CREATE INDEX "sso_sessions_user_id_idx" ON "sso_sessions"("user_id");

CREATE TABLE "sso_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "config_id" uuid REFERENCES "sso_configs"("id"),
  "event" text NOT NULL,
  "actor_email" text,
  "actor_ip" text,
  "provider" text,
  "details" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "sso_audit_log_company_created_idx" ON "sso_audit_log"("company_id", "created_at");
CREATE INDEX "sso_audit_log_config_event_idx" ON "sso_audit_log"("config_id", "event");
