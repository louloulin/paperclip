-- Migration: 0065_webhooks
-- Webhook integration for external notifications (Slack/Feishu/DingTalk/WeCom/Generic)

-- Webhook configurations
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  provider TEXT NOT NULL DEFAULT 'generic',
  is_active BOOLEAN NOT NULL DEFAULT true,
  events JSONB NOT NULL DEFAULT '["*"]',
  headers JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  retry_config JSONB NOT NULL DEFAULT '{"maxRetries": 3, "backoffMs": 1000}',
  last_triggered_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhooks_company_active_idx ON webhooks(company_id, is_active);
CREATE INDEX IF NOT EXISTS webhooks_provider_idx ON webhooks(provider);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  request_headers JSONB NOT NULL DEFAULT '{}',
  response_status INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_idx ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_status_idx ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS webhook_deliveries_created_idx ON webhook_deliveries(created_at);
