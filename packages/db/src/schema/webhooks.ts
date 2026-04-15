import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    url: text("url").notNull(),
    secret: text("secret"),
    provider: text("provider").notNull().default("generic"),
    isActive: boolean("is_active").notNull().default(true),
    events: jsonb("events").notNull().default(["*"]),
    headers: jsonb("headers").notNull().default({}),
    description: text("description"),
    retryConfig: jsonb("retry_config").notNull().default({ maxRetries: 3, backoffMs: 1000 }),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyActiveIdx: index("webhooks_company_active_idx").on(table.companyId, table.isActive),
    providerIdx: index("webhooks_provider_idx").on(table.provider),
  }),
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    requestHeaders: jsonb("request_headers").notNull().default({}),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    durationMs: integer("duration_ms"),
    attempt: integer("attempt").notNull().default(1),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    webhookIdx: index("webhook_deliveries_webhook_idx").on(table.webhookId),
    statusIdx: index("webhook_deliveries_status_idx").on(table.status),
    createdIdx: index("webhook_deliveries_created_idx").on(table.createdAt),
  }),
);
