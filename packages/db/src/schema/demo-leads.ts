import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * 销售线索表 - 追踪潜在客户从首次接触到达成合作的全生命周期
 */
export const demoLeads = pgTable(
  "demo_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 基本联系信息
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    companySize: text("company_size"), // startup | small | medium | large | enterprise
    industry: text("industry"),
    website: text("website"),
    country: text("country"),
    city: text("city"),
    // 来源
    source: text("source").notNull().default("manual"), // manual | website | referral | linkedin | cold_outreach | event | partner
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referralCode: text("referral_code"),
    // 销售状态
    status: text("status").notNull().default("new"), // new | contacted | qualified | demo_scheduled | demo_in_progress | negotiating | won | lost | churned
    priority: text("priority").notNull().default("medium"), // low | medium | high | urgent
    // 评分
    leadScore: integer("lead_score").notNull().default(0),
    hotLead: boolean("hot_lead").notNull().default(false),
    // 分配
    assignedToUserId: text("assigned_to_user_id"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    // 跟进
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
    followupCount: integer("followup_count").notNull().default(0),
    // 备注
    notes: text("notes"),
    lostReason: text("lost_reason"),
    wonDetails: text("won_details"),
    // 时间戳
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("demo_leads_status_idx").on(table.status),
    assignedIdx: index("demo_leads_assigned_idx").on(table.assignedToUserId),
    emailIdx: index("demo_leads_email_idx").on(table.contactEmail),
    hotLeadIdx: index("demo_leads_hot_lead_idx").on(table.hotLead),
    createdAtIdx: index("demo_leads_created_at_idx").on(table.createdAt),
  }),
);

/**
 * 演示请求表 - 追踪每次演示会话
 */
export const demoRequests = pgTable(
  "demo_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => demoLeads.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    // 演示类型
    demoType: text("demo_type").notNull().default("standard"), // standard | enterprise | technical | poc
    useCase: text("use_case"),
    teamSize: text("team_size"),
    preferredDuration: text("preferred_duration"), // 30min | 60min | 90min
    // 安排
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    meetingUrl: text("meeting_url"),
    calendarEventId: text("calendar_event_id"),
    // 状态
    status: text("status").notNull().default("requested"), // requested | scheduled | in_progress | completed | no_show | cancelled
    outcome: text("outcome"), // interested | very_interested | needs_review | not_interested
    // 跟进
    completionNotes: text("completion_notes"),
    feedbackScore: integer("feedback_score"), // 1-5
    nextSteps: text("next_steps"),
    // 时间戳
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    leadIdx: index("demo_requests_lead_idx").on(table.leadId),
    companyIdx: index("demo_requests_company_idx").on(table.companyId),
    statusIdx: index("demo_requests_status_idx").on(table.status),
  }),
);

/**
 * 演示公司表 - 追踪演示环境中创建的试用公司
 */
export const demoCompanies = pgTable(
  "demo_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => demoLeads.id, { onDelete: "cascade" }),
    demoRequestId: uuid("demo_request_id").references(() => demoRequests.id, { onDelete: "set null" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    // 演示公司特点
    isTrial: boolean("is_trial").notNull().default(true),
    trialExpiresAt: timestamp("trial_expires_at", { withTimezone: true }),
    // 演示数据配置
    demoTemplate: text("demo_template").notNull().default("default"), // default | enterprise | developer | poc
    sampleDataEnabled: boolean("sample_data_enabled").notNull().default(true),
    // 使用情况追踪
    agentsCreated: integer("agents_created").notNull().default(0),
    tasksCompleted: integer("tasks_completed").notNull().default(0),
    apiCalls: integer("api_calls").notNull().default(0),
    activeDays: integer("active_days").notNull().default(0),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    // 转化
    convertedToPaid: boolean("converted_to_paid").notNull().default(false),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    paidPlan: text("paid_plan"),
    // 时间戳
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    leadIdx: index("demo_companies_lead_idx").on(table.leadId),
    companyIdx: index("demo_companies_company_idx").on(table.companyId),
    trialExpiresIdx: index("demo_companies_trial_expires_idx").on(table.trialExpiresAt),
  }),
);
