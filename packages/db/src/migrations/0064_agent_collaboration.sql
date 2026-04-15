-- Migration: 0064_agent_collaboration
-- Multi-Agent Collaboration Protocol tables

-- Collaboration sessions
CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'project',
  status TEXT NOT NULL DEFAULT 'active',
  coordinator_agent_id UUID REFERENCES agents(id),
  parent_issue_id UUID REFERENCES issues(id),
  config JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  created_by_agent_id UUID REFERENCES agents(id),
  created_by_user_id TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collab_sessions_company_status_idx ON collaboration_sessions(company_id, status);
CREATE INDEX IF NOT EXISTS collab_sessions_coordinator_idx ON collaboration_sessions(coordinator_agent_id);

-- Session participants
CREATE TABLE IF NOT EXISTS collaboration_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'invited',
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collab_participants_session_agent_idx ON collaboration_participants(session_id, agent_id);

-- Task delegations
CREATE TABLE IF NOT EXISTS task_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  session_id UUID REFERENCES collaboration_sessions(id) ON DELETE SET NULL,
  issue_id UUID REFERENCES issues(id),
  from_agent_id UUID NOT NULL REFERENCES agents(id),
  to_agent_id UUID NOT NULL REFERENCES agents(id),
  task_type TEXT NOT NULL DEFAULT 'delegation',
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  cost_attribution TEXT NOT NULL DEFAULT 'to_agent',
  cost_cents INTEGER NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ,
  result JSONB,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_delegations_company_status_idx ON task_delegations(company_id, status);
CREATE INDEX IF NOT EXISTS task_delegations_from_agent_idx ON task_delegations(from_agent_id);
CREATE INDEX IF NOT EXISTS task_delegations_to_agent_idx ON task_delegations(to_agent_id);
CREATE INDEX IF NOT EXISTS task_delegations_issue_idx ON task_delegations(issue_id);

-- Knowledge shares
CREATE TABLE IF NOT EXISTS knowledge_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  session_id UUID REFERENCES collaboration_sessions(id) ON DELETE SET NULL,
  from_agent_id UUID NOT NULL REFERENCES agents(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'insight',
  visibility TEXT NOT NULL DEFAULT 'team',
  target_agent_id UUID REFERENCES agents(id),
  target_department_id UUID,
  tags JSONB NOT NULL DEFAULT '[]',
  relevance_score INTEGER DEFAULT 0,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_shares_company_cat_idx ON knowledge_shares(company_id, category);
CREATE INDEX IF NOT EXISTS knowledge_shares_from_agent_idx ON knowledge_shares(from_agent_id);

-- Inter-agent messages
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  session_id UUID REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
  delegation_id UUID REFERENCES task_delegations(id) ON DELETE SET NULL,
  from_agent_id UUID NOT NULL REFERENCES agents(id),
  to_agent_id UUID NOT NULL REFERENCES agents(id),
  message_type TEXT NOT NULL DEFAULT 'message',
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_messages_session_idx ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS agent_messages_to_agent_idx ON agent_messages(to_agent_id, read_at);
CREATE INDEX IF NOT EXISTS agent_messages_delegation_idx ON agent_messages(delegation_id);
