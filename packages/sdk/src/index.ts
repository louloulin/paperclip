// ============================================================
// Paperclip SDK — Main Entry Point
// @paperclipai/sdk — Official TypeScript SDK for Paperclip API
// ============================================================

export { PaperclipClient, PaperclipError } from "./client.js";
export type { PaperclipClientOptions } from "./client.js";

// Re-export all types
export type {
  // Common
  PaginationParams,
  PaginatedResponse,
  ApiError,
  ActorType,
  Actor,

  // Company
  Company,
  CreateCompanyInput,
  UpdateCompanyInput,

  // Agent
  Agent,
  CreateAgentInput,
  UpdateAgentInput,

  // Issue
  IssueStatus,
  Issue,
  CreateIssueInput,
  UpdateIssueInput,

  // Project
  Project,
  CreateProjectInput,

  // Goal
  Goal,
  CreateGoalInput,

  // Approval
  ApprovalStatus,
  Approval,
  ApprovalChain,
  ApprovalChainStep,

  // Cost
  CostEvent,
  CreateCostEventInput,

  // Skill
  Skill,
  PublishSkillInput,

  // Webhook
  WebhookProvider,
  Webhook,
  CreateWebhookInput,

  // Template
  CompanyTemplate,

  // Collaboration
  CollaborationSession,
  TaskDelegation,
  KnowledgeShare,
  AgentMessage,

  // SSO
  SsoProvider,
  SsoConfig,
  CreateSsoConfigInput,

  // Department
  Department,
  CreateDepartmentInput,

  // Wave
  Wave,
  DispatchWaveInput,

  // Budget
  BudgetPrecheck,

  // Activity
  ActivityEntry,

  // Compliance
  ComplianceReportType,
  ComplianceReport,

  // Payment
  CheckoutSession,
  Purchase,

  // Health
  HealthResponse,

  // Dashboard
  DashboardStats,

  // Demo Lead
  DemoLead,
  CreateDemoLeadInput,
} from "./types.js";
