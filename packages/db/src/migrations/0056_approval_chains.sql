-- Approval Chains: 多步骤审批链支持
-- 支持审批流：direct_manager → CFO → CEO → Board

CREATE TABLE "approval_chains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "base_approval_id" uuid,
  "type" text NOT NULL,
  "name" text,
  "current_step_index" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active',
  "config" jsonb NOT NULL DEFAULT '{}',
  "requested_by_agent_id" uuid REFERENCES "agents"("id"),
  "requested_by_user_id" text,
  "decided_by_user_id" text,
  "decided_at" timestamptz,
  "decision_note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "approval_chains_company_status_idx" ON "approval_chains"("company_id", "status");
CREATE INDEX "approval_chains_company_type_idx" ON "approval_chains"("company_id", "type");

CREATE TABLE "approval_chain_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chain_id" uuid NOT NULL REFERENCES "approval_chains"("id") ON DELETE CASCADE,
  "step_index" integer NOT NULL,
  "name" text NOT NULL,
  "required_role" text NOT NULL,
  "approval_id" uuid,
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by_user_id" text,
  "decided_at" timestamptz,
  "decision_note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "approval_chain_steps_chain_idx" ON "approval_chain_steps"("chain_id", "step_index");
