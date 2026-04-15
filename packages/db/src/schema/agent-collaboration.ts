import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";

/**
 * Collaboration sessions — groups of agents working together
 */
export const collaborationSessions = pgTable(
  "collaboration_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("project"), // project | task_force | knowledge_share | ad_hoc
    status: text("status").notNull().default("active"), // active | paused | completed | cancelled
    coordinatorAgentId: uuid("coordinator_agent_id").references(() => agents.id),
    parentIssueId: uuid("parent_issue_id").references(() => issues.id),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdByUserId: text("created_by_user_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("collab_sessions_company_status_idx").on(table.companyId, table.status),
    coordinatorIdx: index("collab_sessions_coordinator_idx").on(table.coordinatorAgentId),
  }),
);

/**
 * Session participants — agents in a collaboration session
 */
export const collaborationParticipants = pgTable(
  "collaboration_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => collaborationSessions.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    role: text("role").notNull().default("member"), // coordinator | member | observer
    status: text("status").notNull().default("invited"), // invited | active | left | removed
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionAgentIdx: index("collab_participants_session_agent_idx").on(table.sessionId, table.agentId),
  }),
);

/**
 * Task delegations — agent-to-agent task handoffs
 */
export const taskDelegations = pgTable(
  "task_delegations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sessionId: uuid("session_id").references(() => collaborationSessions.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id),
    fromAgentId: uuid("from_agent_id").notNull().references(() => agents.id),
    toAgentId: uuid("to_agent_id").notNull().references(() => agents.id),
    taskType: text("task_type").notNull().default("delegation"), // delegation | subtask | review | approval_request
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority").notNull().default("medium"), // low | medium | high | urgent
    status: text("status").notNull().default("pending"), // pending | accepted | in_progress | completed | rejected | cancelled
    costAttribution: text("cost_attribution").notNull().default("to_agent"), // to_agent | to_department | to_session
    costCents: integer("cost_cents").notNull().default(0),
    deadline: timestamp("deadline", { withTimezone: true }),
    result: jsonb("result").$type<Record<string, unknown>>(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("task_delegations_company_status_idx").on(table.companyId, table.status),
    fromAgentIdx: index("task_delegations_from_agent_idx").on(table.fromAgentId),
    toAgentIdx: index("task_delegations_to_agent_idx").on(table.toAgentId),
    issueIdx: index("task_delegations_issue_idx").on(table.issueId),
  }),
);

/**
 * Knowledge shares — cross-agent knowledge sharing
 */
export const knowledgeShares = pgTable(
  "knowledge_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sessionId: uuid("session_id").references(() => collaborationSessions.id, { onDelete: "set null" }),
    fromAgentId: uuid("from_agent_id").notNull().references(() => agents.id),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull().default("insight"), // insight | pattern | decision | fix | context | procedure
    visibility: text("visibility").notNull().default("team"), // private | team | department | company
    targetAgentId: uuid("target_agent_id").references(() => agents.id),
    targetDepartmentId: uuid("target_department_id"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    relevanceScore: integer("relevance_score").default(0),
    accessCount: integer("access_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCatIdx: index("knowledge_shares_company_cat_idx").on(table.companyId, table.category),
    fromAgentIdx: index("knowledge_shares_from_agent_idx").on(table.fromAgentId),
  }),
);

/**
 * Inter-agent messages — communication log
 */
export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sessionId: uuid("session_id").references(() => collaborationSessions.id, { onDelete: "cascade" }),
    delegationId: uuid("delegation_id").references(() => taskDelegations.id, { onDelete: "set null" }),
    fromAgentId: uuid("from_agent_id").notNull().references(() => agents.id),
    toAgentId: uuid("to_agent_id").notNull().references(() => agents.id),
    messageType: text("message_type").notNull().default("message"), // message | notification | request | response | broadcast
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("agent_messages_session_idx").on(table.sessionId),
    toAgentIdx: index("agent_messages_to_agent_idx").on(table.toAgentId, table.readAt),
    delegationIdx: index("agent_messages_delegation_idx").on(table.delegationId),
  }),
);
