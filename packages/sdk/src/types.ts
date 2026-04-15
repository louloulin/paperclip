// ============================================================
// Paperclip SDK — Type Definitions
// Auto-generated API types for the Paperclip Control Plane
// ============================================================

// --- Common ---

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiError {
  error: string;
  status: number;
  details?: unknown;
}

// --- Actor / Auth ---

export type ActorType = "board" | "agent" | "none";

export interface Actor {
  type: ActorType;
  source?: string;
  isInstanceAdmin?: boolean;
  agentId?: string;
  companyId?: string;
  userId?: string;
}

// --- Company ---

export interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyInput {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateCompanyInput {
  name?: string;
  description?: string;
}

// --- Agent ---

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  role?: string;
  systemPrompt?: string;
  model?: string;
  status: string;
  reportsTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInput {
  name: string;
  role?: string;
  systemPrompt?: string;
  model?: string;
  reportsTo?: string;
}

export interface UpdateAgentInput {
  name?: string;
  role?: string;
  systemPrompt?: string;
  model?: string;
  status?: string;
}

// --- Issue ---

export type IssueStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked";

export type IssuePriority = "critical" | "high" | "medium" | "low";

export interface Issue {
  id: string;
  companyId: string;
  projectId?: string;
  title: string;
  body?: string;
  status: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  projectId?: string;
  priority?: IssuePriority;
  assigneeId?: string;
  labels?: string[];
}

export interface UpdateIssueInput {
  title?: string;
  body?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string;
}

// --- Project ---

export interface Project {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

// --- Goal ---

export interface Goal {
  id: string;
  companyId: string;
  projectId?: string;
  title: string;
  description?: string;
  status: string;
  createdAt: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  projectId?: string;
}

// --- Approval ---

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface Approval {
  id: string;
  companyId: string;
  issueId?: string;
  type: string;
  status: ApprovalStatus;
  requestedBy?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ApprovalChain {
  id: string;
  companyId: string;
  type: string;
  status: string;
  steps: ApprovalChainStep[];
  createdAt: string;
}

export interface ApprovalChainStep {
  id: string;
  chainId: string;
  role: string;
  status: string;
  actedBy?: string;
  actedAt?: string;
}

// --- Cost ---

export interface CostEvent {
  id: string;
  companyId: string;
  agentId?: string;
  issueId?: string;
  amount: number;
  unit: string;
  description?: string;
  createdAt: string;
}

export interface CreateCostEventInput {
  amount: number;
  unit: string;
  description?: string;
  agentId?: string;
  issueId?: string;
}

// --- Skill Mart ---

export interface Skill {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  version: string;
  tags?: string[];
  isFree: boolean;
  price?: number;
  currency?: string;
  ratingAvg?: number;
  downloadCount: number;
  createdAt: string;
}

export interface PublishSkillInput {
  name: string;
  description?: string;
  version: string;
  tags?: string[];
  isFree?: boolean;
  price?: number;
  currency?: string;
  manifest?: Record<string, unknown>;
}

// --- Webhook ---

export type WebhookProvider = "generic" | "slack" | "feishu" | "dingtalk" | "wecom";

export interface Webhook {
  id: string;
  companyId: string;
  name: string;
  url: string;
  provider: WebhookProvider;
  isActive: boolean;
  events?: string[];
  secret?: string;
  createdAt: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  provider: WebhookProvider;
  events?: string[];
  secret?: string;
}

// --- Company Template ---

export interface CompanyTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  industry?: string;
  isOfficial: boolean;
  ratingAvg?: number;
  installCount: number;
  config?: Record<string, unknown>;
  createdAt: string;
}

// --- Collaboration ---

export interface CollaborationSession {
  id: string;
  companyId: string;
  name: string;
  status: string;
  coordinatorAgentId?: string;
  createdAt: string;
}

export interface TaskDelegation {
  id: string;
  sessionId?: string;
  fromAgentId: string;
  toAgentId: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  createdAt: string;
}

export interface KnowledgeShare {
  id: string;
  companyId: string;
  agentId: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  accessCount: number;
  createdAt: string;
}

export interface AgentMessage {
  id: string;
  companyId: string;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  messageType: string;
  isRead: boolean;
  createdAt: string;
}

// --- SSO ---

export type SsoProvider = "okta" | "google" | "feishu" | "dingtalk" | "oidc" | "saml";

export interface SsoConfig {
  id: string;
  companyId: string;
  provider: SsoProvider;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateSsoConfigInput {
  provider: SsoProvider;
  name: string;
  clientId?: string;
  clientSecret?: string;
  domain?: string;
  metadataUrl?: string;
}

// --- Department ---

export interface Department {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  parentId?: string;
  memberCount: number;
  createdAt: string;
}

export interface CreateDepartmentInput {
  name: string;
  description?: string;
  parentId?: string;
}

// --- Wave ---

export interface Wave {
  id: string;
  companyId: string;
  topic: string;
  status: string;
  totalEvents: number;
  completedEvents: number;
  createdAt: string;
}

export interface DispatchWaveInput {
  topic: string;
  payloads: string[];
}

// --- Budget ---

export interface BudgetPrecheck {
  utilization: number;
  softWarning: boolean;
  hardStop: boolean;
  budgetLimit?: number;
  currentSpend?: number;
}

// --- Activity ---

export interface ActivityEntry {
  id: string;
  companyId: string;
  actorType: string;
  actorId?: string;
  verb: string;
  entityType: string;
  entityId?: string;
  description?: string;
  createdAt: string;
}

// --- Compliance Report ---

export type ComplianceReportType = "gdpr" | "china_dsl" | "summary";

export interface ComplianceReport {
  id: string;
  companyId: string;
  reportType: ComplianceReportType;
  status: string;
  content?: Record<string, unknown>;
  createdAt: string;
}

// --- Stripe Payment ---

export interface CheckoutSession {
  paymentSessionId: string;
  url?: string;
  amount: number;
  currency: string;
  platformFee: number;
  sellerAmount: number;
}

export interface Purchase {
  id: string;
  companyId: string;
  skillId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

// --- Health ---

export interface HealthResponse {
  status: string;
  version: string;
  deploymentMode: string;
  deploymentExposure: string;
  authReady: boolean;
  bootstrapStatus: string;
  features?: Record<string, boolean>;
}

// --- Dashboard ---

export interface DashboardStats {
  companyId: string;
  agents: { active: number; running: number; paused: number; error: number };
  tasks: { open: number; inProgress: number; blocked: number; done: number };
  costs: { monthSpendCents: number; monthBudgetCents: number; monthUtilizationPercent: number };
  pendingApprovals: number;
  budgets: { activeIncidents: number; pendingApprovals: number; pausedAgents: number; pausedProjects: number };
}

// --- Demo Lead ---

export interface DemoLead {
  id: string;
  companyName: string;
  contactName?: string;
  email?: string;
  source?: string;
  status: string;
  score?: number;
  priority?: string;
  createdAt: string;
}

export interface CreateDemoLeadInput {
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  notes?: string;
}
