-- T2.10 企业版演示环境 + 销售线索追踪
-- 销售线索 (demo_leads) + 演示请求 (demo_requests) + 演示公司 (demo_companies)

CREATE TABLE "demo_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 基本联系信息
  "company_name" text NOT NULL,
  "contact_name" text,
  "contact_email" text NOT NULL,
  "contact_phone" text,
  "company_size" text, -- startup | small | medium | large | enterprise
  "industry" text,
  "website" text,
  "country" text,
  "city" text,
  -- 来源
  "source" text NOT NULL DEFAULT 'manual', -- manual | website | referral | linkedin | cold_outreach | event | partner
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "referral_code" text,
  -- 销售状态
  "status" text NOT NULL DEFAULT 'new', -- new | contacted | qualified | demo_scheduled | demo_in_progress | negotiating | won | lost | churned
  "priority" text NOT NULL DEFAULT 'medium', -- low | medium | high | urgent
  -- 评分
  "lead_score" integer NOT NULL DEFAULT 0,
  "hot_lead" boolean NOT NULL DEFAULT false,
  -- 分配
  "assigned_to_user_id" text,
  "assigned_at" timestamptz,
  -- 跟进
  "last_contacted_at" timestamptz,
  "next_followup_at" timestamptz,
  "followup_count" integer NOT NULL DEFAULT 0,
  -- 备注
  "notes" text,
  "lost_reason" text,
  "won_details" text,
  -- 时间戳
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "demo_leads_status_idx" ON "demo_leads"("status");
CREATE INDEX "demo_leads_assigned_idx" ON "demo_leads"("assigned_to_user_id");
CREATE INDEX "demo_leads_email_idx" ON "demo_leads"("contact_email");
CREATE INDEX "demo_leads_hot_lead_idx" ON "demo_leads"("hot_lead");
CREATE INDEX "demo_leads_created_at_idx" ON "demo_leads"("created_at");

CREATE TABLE "demo_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL REFERENCES "demo_leads"("id") ON DELETE cascade,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL,
  -- 演示类型
  "demo_type" text NOT NULL DEFAULT 'standard', -- standard | enterprise | technical | poc
  "use_case" text, -- 演示用例描述
  "team_size" text, -- estimated team size
  "preferred_duration" text, -- 30min | 60min | 90min
  -- 安排
  "scheduled_at" timestamptz,
  "duration_minutes" integer,
  "meeting_url" text,
  "calendar_event_id" text,
  -- 状态
  "status" text NOT NULL DEFAULT 'requested', -- requested | scheduled | in_progress | completed | no_show | cancelled
  "outcome" text, -- interested | very_interested | needs_review | not_interested
  -- 跟进
  "completion_notes" text,
  "feedback_score" integer, -- 1-5
  "next_steps" text,
  -- 时间戳
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

CREATE INDEX "demo_requests_lead_idx" ON "demo_requests"("lead_id");
CREATE INDEX "demo_requests_company_idx" ON "demo_requests"("company_id");
CREATE INDEX "demo_requests_status_idx" ON "demo_requests"("status");

CREATE TABLE "demo_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL REFERENCES "demo_leads"("id") ON DELETE cascade,
  "demo_request_id" uuid REFERENCES "demo_requests"("id") ON DELETE SET NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "company_name" text NOT NULL,
  -- 演示公司特点
  "is_trial" boolean NOT NULL DEFAULT true,
  "trial_expires_at" timestamptz,
  -- 演示数据配置
  "demo_template" text NOT NULL DEFAULT 'default', -- default | enterprise | developer | poc
  "sample_data_enabled" boolean NOT NULL DEFAULT true,
  -- 使用情况追踪
  "agents_created" integer NOT NULL DEFAULT 0,
  "tasks_completed" integer NOT NULL DEFAULT 0,
  "api_calls" integer NOT NULL DEFAULT 0,
  "active_days" integer NOT NULL DEFAULT 0,
  "last_active_at" timestamptz,
  -- 转化
  "converted_to_paid" boolean NOT NULL DEFAULT false,
  "converted_at" timestamptz,
  "paid_plan" text,
  -- 时间戳
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz
);

CREATE INDEX "demo_companies_lead_idx" ON "demo_companies"("lead_id");
CREATE INDEX "demo_companies_company_idx" ON "demo_companies"("company_id");
CREATE INDEX "demo_companies_trial_expires_idx" ON "demo_companies"("trial_expires_at");
