import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const waves = pgTable(
  "waves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    topic: text("topic").notNull(),
    totalCount: integer("total_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    status: text("status").notNull().default("dispatching"), // dispatching | running | completed | failed
    dispatchedBy: text("dispatched_by").notNull(), // agent | user
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdByUserId: text("created_by_user_id"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("waves_company_status_idx").on(table.companyId, table.status),
    createdAtIdx: index("waves_created_at_idx").on(table.createdAt),
  }),
);

export const waveEvents = pgTable(
  "wave_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    waveId: uuid("wave_id").notNull().references(() => waves.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending | running | completed | failed
    agentId: uuid("agent_id").references(() => agents.id),
    runId: text("run_id"),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    waveStatusIdx: index("wave_events_wave_status_idx").on(table.waveId, table.status),
  }),
);
