import { api } from "./client";

// ======== Types ========

export interface CollaborationSession {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  type: "project" | "task_force" | "knowledge_share" | "ad_hoc";
  status: "active" | "paused" | "completed" | "cancelled";
  coordinatorAgentId: string | null;
  parentIssueId: string | null;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  participantCount?: number;
  participants?: CollaborationParticipant[];
}

export interface CollaborationParticipant {
  id: string;
  sessionId: string;
  agentId: string;
  role: "coordinator" | "member" | "observer";
  status: "invited" | "active" | "left" | "removed";
  joinedAt: string | null;
  leftAt: string | null;
}

export interface TaskDelegation {
  id: string;
  companyId: string;
  sessionId: string | null;
  issueId: string | null;
  fromAgentId: string;
  toAgentId: string;
  taskType: "delegation" | "subtask" | "review" | "approval_request";
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "accepted" | "in_progress" | "completed" | "rejected" | "cancelled";
  costAttribution: "to_agent" | "to_department" | "to_session";
  costCents: number;
  deadline: string | null;
  result: Record<string, unknown> | null;
  acceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeShare {
  id: string;
  companyId: string;
  sessionId: string | null;
  fromAgentId: string;
  title: string;
  content: string;
  category: "insight" | "pattern" | "decision" | "fix" | "context" | "procedure";
  visibility: "private" | "team" | "department" | "company";
  targetAgentId: string | null;
  targetDepartmentId: string | null;
  tags: string[];
  relevanceScore: number | null;
  accessCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  companyId: string;
  sessionId: string | null;
  delegationId: string | null;
  fromAgentId: string;
  toAgentId: string;
  messageType: "message" | "notification" | "request" | "response" | "broadcast";
  content: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface CollaborationStats {
  sessions: { total: number; active: number; completed: number };
  delegations: { total: number; pending: number; completed: number; totalCostCents: number };
  knowledge: { total: number; totalAccess: number };
  messages: { total: number; unread: number };
}

// ======== API ========

export const collaborationApi = {
  // Sessions
  listSessions: (companyId: string, params?: { status?: string; type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.type) qs.set("type", params.type);
    const query = qs.toString();
    return api.get<CollaborationSession[]>(`/companies/${companyId}/collaboration-sessions${query ? `?${query}` : ""}`);
  },

  createSession: (companyId: string, data: {
    title: string;
    description?: string;
    type?: string;
    coordinatorAgentId?: string;
    parentIssueId?: string;
    participantIds?: string[];
    config?: Record<string, unknown>;
  }) => api.post<CollaborationSession>(`/companies/${companyId}/collaboration-sessions`, data),

  getSession: (sessionId: string) =>
    api.get<CollaborationSession>(`/collaboration-sessions/${sessionId}`),

  updateSession: (sessionId: string, data: { status?: string; result?: Record<string, unknown> }) =>
    api.patch<CollaborationSession>(`/collaboration-sessions/${sessionId}`, data),

  addParticipant: (sessionId: string, data: { agentId: string; role?: string }) =>
    api.post(`/collaboration-sessions/${sessionId}/participants`, data),

  removeParticipant: (sessionId: string, participantId: string) =>
    api.delete(`/collaboration-sessions/${sessionId}/participants/${participantId}`),

  // Delegations
  listDelegations: (companyId: string, params?: { status?: string; agentId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.agentId) qs.set("agentId", params.agentId);
    const query = qs.toString();
    return api.get<TaskDelegation[]>(`/companies/${companyId}/task-delegations${query ? `?${query}` : ""}`);
  },

  delegateTask: (companyId: string, data: {
    fromAgentId: string;
    toAgentId: string;
    issueId?: string;
    taskType?: string;
    title: string;
    description?: string;
    priority?: string;
    costAttribution?: string;
    deadline?: string;
    sessionId?: string;
  }) => api.post<TaskDelegation>(`/companies/${companyId}/task-delegations`, data),

  updateDelegationStatus: (delegationId: string, data: { status: string; result?: Record<string, unknown> }) =>
    api.patch<TaskDelegation>(`/task-delegations/${delegationId}/status`, data),

  // Knowledge
  listKnowledge: (companyId: string, params?: { category?: string; q?: string; agentId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    if (params?.agentId) qs.set("agentId", params.agentId);
    const query = qs.toString();
    return api.get<KnowledgeShare[]>(`/companies/${companyId}/knowledge-shares${query ? `?${query}` : ""}`);
  },

  shareKnowledge: (companyId: string, data: {
    fromAgentId: string;
    title: string;
    content: string;
    category?: string;
    visibility?: string;
    targetAgentId?: string;
    targetDepartmentId?: string;
    tags?: string[];
  }) => api.post<KnowledgeShare>(`/companies/${companyId}/knowledge-shares`, data),

  accessKnowledge: (shareId: string) =>
    api.post<KnowledgeShare>(`/knowledge-shares/${shareId}/access`, {}),

  // Messages
  getMessages: (companyId: string, agentId: string, unreadOnly?: boolean) => {
    const qs = new URLSearchParams();
    if (unreadOnly) qs.set("unread", "true");
    const query = qs.toString();
    return api.get<AgentMessage[]>(`/companies/${companyId}/agents/${agentId}/messages${query ? `?${query}` : ""}`);
  },

  sendMessage: (companyId: string, data: {
    fromAgentId: string;
    toAgentId: string;
    messageType?: string;
    content: string;
    metadata?: Record<string, unknown>;
    sessionId?: string;
  }) => api.post<AgentMessage>(`/companies/${companyId}/agent-messages`, data),

  markMessageRead: (messageId: string) =>
    api.patch<AgentMessage>(`/agent-messages/${messageId}/read`, {}),

  // Stats
  getStats: (companyId: string) =>
    api.get<CollaborationStats>(`/companies/${companyId}/collaboration-stats`),
};
