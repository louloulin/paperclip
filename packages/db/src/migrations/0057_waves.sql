-- Wave Dispatch: 并行任务分发系统
-- 支持批量创建任务并并行分发给多个 Agent 执行

CREATE TABLE "waves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "topic" text NOT NULL,
  "total_count" integer NOT NULL DEFAULT 0,
  "completed_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'dispatching',
  "dispatched_by" text NOT NULL,
  "created_by_agent_id" uuid REFERENCES "agents"("id"),
  "created_by_user_id" text,
  "finished_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "waves_company_status_idx" ON "waves"("company_id", "status");
CREATE INDEX "waves_created_at_idx" ON "waves"("created_at");

CREATE TABLE "wave_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "wave_id" uuid NOT NULL REFERENCES "waves"("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "agent_id" uuid REFERENCES "agents"("id"),
  "run_id" text,
  "error_message" text,
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "wave_events_wave_status_idx" ON "wave_events"("wave_id", "status");
