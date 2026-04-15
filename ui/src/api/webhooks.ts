import { api } from "./client";

export interface Webhook {
  id: string;
  company_id: string;
  name: string;
  url: string;
  secret: string | null;
  provider: string;
  is_active: boolean;
  events: string[];
  headers: Record<string, string>;
  description: string | null;
  retry_config: { maxRetries: number; backoffMs: number };
  last_triggered_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  request_headers: Record<string, string>;
  response_status: number | null;
  response_body: string | null;
  duration_ms: number | null;
  attempt: number;
  status: string;
  error_message: string | null;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface WebhookStats {
  webhooks: { total: number; active: number };
  deliveries: {
    total_deliveries: number;
    delivered: number;
    failed: number;
    last_24h: number;
    avg_duration_ms: number | null;
  };
}

export interface CreateWebhookRequest {
  name: string;
  url: string;
  secret?: string;
  provider?: "generic" | "slack" | "feishu" | "dingtalk" | "wecom";
  events?: string[];
  headers?: Record<string, string>;
  description?: string;
  retryConfig?: { maxRetries?: number; backoffMs?: number };
}

export const webhooksApi = {
  list: (companyId: string, activeOnly?: boolean) => {
    const params = new URLSearchParams();
    if (activeOnly) params.set("active", "true");
    const qs = params.toString();
    return api.get<Webhook[]>(`/companies/${companyId}/webhooks${qs ? `?${qs}` : ""}`);
  },

  create: (companyId: string, data: CreateWebhookRequest) =>
    api.post<Webhook>(`/companies/${companyId}/webhooks`, data),

  get: (webhookId: string) =>
    api.get<Webhook>(`/webhooks/${webhookId}`),

  update: (webhookId: string, data: Partial<CreateWebhookRequest & { isActive: boolean }>) =>
    api.patch<Webhook>(`/webhooks/${webhookId}`, data),

  delete: (webhookId: string) =>
    api.delete<{ success: boolean }>(`/webhooks/${webhookId}`),

  test: (webhookId: string, eventType?: string, payload?: Record<string, unknown>) =>
    api.post<{ success: boolean; statusCode?: number; error?: string; durationMs?: number }>(
      `/webhooks/${webhookId}/test`,
      { eventType: eventType ?? "test", payload: payload ?? {} },
    ),

  deliveries: (webhookId: string, limit?: number) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    return api.get<WebhookDelivery[]>(`/webhooks/${webhookId}/deliveries?${params}`);
  },

  stats: (companyId: string) =>
    api.get<WebhookStats>(`/companies/${companyId}/webhook-stats`),

  retryDelivery: (deliveryId: string) =>
    api.post<{ success: boolean; statusCode?: number; attempt: number }>(
      `/webhook-deliveries/${deliveryId}/retry`,
      {},
    ),
};
