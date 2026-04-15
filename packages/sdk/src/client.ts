// ============================================================
// Paperclip SDK — HTTP Client
// Zero-dependency TypeScript client for the Paperclip API
// ============================================================

import type {
  Company, CreateCompanyInput, UpdateCompanyInput,
  Agent, CreateAgentInput, UpdateAgentInput,
  Issue, CreateIssueInput, UpdateIssueInput, IssueStatus,
  Project, CreateProjectInput,
  Goal, CreateGoalInput,
  Approval, ApprovalChain,
  CostEvent, CreateCostEventInput,
  Skill, PublishSkillInput,
  Webhook, CreateWebhookInput, WebhookProvider,
  CompanyTemplate,
  CollaborationSession, TaskDelegation, KnowledgeShare, AgentMessage,
  SsoConfig, CreateSsoConfigInput, SsoProvider,
  Department, CreateDepartmentInput,
  Wave, DispatchWaveInput,
  BudgetPrecheck,
  ActivityEntry,
  ComplianceReport, ComplianceReportType,
  CheckoutSession, Purchase,
  HealthResponse,
  DashboardStats,
  DemoLead, CreateDemoLeadInput,
  PaginationParams, PaginatedResponse,
} from "./types.js";

export class PaperclipError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PaperclipError";
  }
}

export interface PaperclipClientOptions {
  /** Base URL of the Paperclip server (e.g., "http://localhost:3101") */
  baseUrl: string;
  /** API key for agent authentication */
  apiKey?: string;
  /** Session token for board user authentication */
  sessionToken?: string;
  /** Custom headers to include in every request */
  headers?: Record<string, string>;
  /** Fetch implementation (defaults to global fetch) */
  fetch?: typeof globalThis.fetch;
}

/**
 * Paperclip SDK Client
 *
 * @example
 * ```ts
 * import { PaperclipClient } from "@paperclipai/sdk";
 *
 * const client = new PaperclipClient({
 *   baseUrl: "http://localhost:3101",
 *   apiKey: "pc_abc123",
 * });
 *
 * // List companies
 * const companies = await client.companies.list();
 *
 * // Create an issue
 * const issue = await client.issues.create(companyId, {
 *   title: "Build feature X",
 *   priority: 1,
 * });
 * ```
 */
export class PaperclipClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: typeof globalThis.fetch;

  public readonly companies: CompaniesResource;
  public readonly agents: AgentsResource;
  public readonly issues: IssuesResource;
  public readonly projects: ProjectsResource;
  public readonly goals: GoalsResource;
  public readonly approvals: ApprovalsResource;
  public readonly costs: CostsResource;
  public readonly skills: SkillsResource;
  public readonly webhooks: WebhooksResource;
  public readonly templates: TemplatesResource;
  public readonly collaboration: CollaborationResource;
  public readonly sso: SsoResource;
  public readonly departments: DepartmentsResource;
  public readonly waves: WavesResource;
  public readonly activity: ActivityResource;
  public readonly compliance: ComplianceResource;
  public readonly payments: PaymentsResource;
  public readonly health: HealthResource;
  public readonly dashboard: DashboardResource;
  public readonly demoLeads: DemoLeadsResource;

  constructor(options: PaperclipClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchFn = options.fetch ?? globalThis.fetch;

    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    if (options.apiKey) {
      this.headers["Authorization"] = `Bearer ${options.apiKey}`;
    }
    if (options.sessionToken) {
      this.headers["Cookie"] = `session=${options.sessionToken}`;
    }

    // Initialize resource modules
    const ctx = { baseUrl: this.baseUrl, headers: this.headers, fetch: this.fetchFn };
    this.companies = new CompaniesResource(ctx);
    this.agents = new AgentsResource(ctx);
    this.issues = new IssuesResource(ctx);
    this.projects = new ProjectsResource(ctx);
    this.goals = new GoalsResource(ctx);
    this.approvals = new ApprovalsResource(ctx);
    this.costs = new CostsResource(ctx);
    this.skills = new SkillsResource(ctx);
    this.webhooks = new WebhooksResource(ctx);
    this.templates = new TemplatesResource(ctx);
    this.collaboration = new CollaborationResource(ctx);
    this.sso = new SsoResource(ctx);
    this.departments = new DepartmentsResource(ctx);
    this.waves = new WavesResource(ctx);
    this.activity = new ActivityResource(ctx);
    this.compliance = new ComplianceResource(ctx);
    this.payments = new PaymentsResource(ctx);
    this.health = new HealthResource(ctx);
    this.dashboard = new DashboardResource(ctx);
    this.demoLeads = new DemoLeadsResource(ctx);
  }

  /** Generic request helper */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchFn(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errorMsg = text;
      try { errorMsg = JSON.parse(text).error ?? text; } catch {}
      throw new PaperclipError(res.status, `HTTP_${res.status}`, errorMsg);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
}

// --- Resource Context ---

interface ResourceContext {
  baseUrl: string;
  headers: Record<string, string>;
  fetch: typeof globalThis.fetch;
}

async function request<T>(
  ctx: ResourceContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${ctx.baseUrl}${path}`;
  const res = await ctx.fetch(url, {
    method,
    headers: ctx.headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errorMsg = text;
    try { errorMsg = JSON.parse(text).error ?? text; } catch {}
    throw new PaperclipError(res.status, `HTTP_${res.status}`, errorMsg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ============================================================
// Resource Modules
// ============================================================

// --- Companies ---

class CompaniesResource {
  constructor(private ctx: ResourceContext) {}

  list(): Promise<Company[]> {
    return request(this.ctx, "GET", "/api/companies");
  }

  get(id: string): Promise<Company> {
    return request(this.ctx, "GET", `/api/companies/${id}`);
  }

  create(input: CreateCompanyInput): Promise<Company> {
    return request(this.ctx, "POST", "/api/companies", input);
  }

  update(id: string, input: UpdateCompanyInput): Promise<Company> {
    return request(this.ctx, "PATCH", `/api/companies/${id}`, input);
  }

  delete(id: string): Promise<void> {
    return request(this.ctx, "DELETE", `/api/companies/${id}`);
  }

  export(id: string): Promise<unknown> {
    return request(this.ctx, "POST", `/api/companies/${id}/export`);
  }
}

// --- Agents ---

class AgentsResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<Agent[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/agents`);
  }

  get(companyId: string, agentId: string): Promise<Agent> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/agents/${agentId}`);
  }

  create(companyId: string, input: CreateAgentInput): Promise<Agent> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/agent-hires`, input);
  }

  update(companyId: string, agentId: string, input: UpdateAgentInput): Promise<Agent> {
    return request(this.ctx, "PATCH", `/api/companies/${companyId}/agents/${agentId}`, input);
  }

  delete(companyId: string, agentId: string): Promise<void> {
    return request(this.ctx, "DELETE", `/api/companies/${companyId}/agents/${agentId}`);
  }

  /** Get agent inbox (issues assigned to agent) */
  inbox(companyId: string, agentId: string): Promise<Issue[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/agents/${agentId}/inbox-lite`);
  }

  /** Budget precheck for an agent */
  budgetPrecheck(companyId: string, agentId: string): Promise<BudgetPrecheck> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/agents/${agentId}/budget-precheck`);
  }
}

// --- Issues ---

class IssuesResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string, params?: PaginationParams & { status?: IssueStatus }): Promise<Issue[]> {
    const qs = params ? "?" + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
    ).toString() : "";
    return request(this.ctx, "GET", `/api/companies/${companyId}/issues${qs}`);
  }

  get(issueId: string): Promise<Issue> {
    return request(this.ctx, "GET", `/api/issues/${issueId}`);
  }

  create(companyId: string, input: CreateIssueInput): Promise<Issue> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/issues`, input);
  }

  update(issueId: string, input: UpdateIssueInput): Promise<Issue> {
    return request(this.ctx, "PATCH", `/api/issues/${issueId}`, input);
  }

  /** Checkout an issue for execution */
  checkout(issueId: string): Promise<Issue> {
    return request(this.ctx, "PATCH", `/api/issues/${issueId}`, { status: "in_progress" });
  }

  addComment(issueId: string, body: string): Promise<unknown> {
    return request(this.ctx, "POST", `/api/issues/${issueId}/comments`, { body });
  }
}

// --- Projects ---

class ProjectsResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<Project[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/projects`);
  }

  get(projectId: string): Promise<Project> {
    return request(this.ctx, "GET", `/api/projects/${projectId}`);
  }

  create(companyId: string, input: CreateProjectInput): Promise<Project> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/projects`, input);
  }
}

// --- Goals ---

class GoalsResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<Goal[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/goals`);
  }

  create(companyId: string, input: CreateGoalInput): Promise<Goal> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/goals`, input);
  }
}

// --- Approvals ---

class ApprovalsResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<Approval[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/approvals`);
  }

  get(approvalId: string): Promise<Approval> {
    return request(this.ctx, "GET", `/api/approvals/${approvalId}`);
  }

  /** Advance an approval chain step */
  advanceChain(chainId: string, decision: "approved" | "rejected", comment?: string): Promise<ApprovalChain> {
    return request(this.ctx, "POST", `/api/approval-chains/${chainId}/advance`, { decision, comment });
  }

  getChain(chainId: string): Promise<ApprovalChain> {
    return request(this.ctx, "GET", `/api/approval-chains/${chainId}`);
  }
}

// --- Costs ---

class CostsResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<CostEvent[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/cost-events`);
  }

  create(companyId: string, input: CreateCostEventInput): Promise<CostEvent> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/cost-events`, input);
  }
}

// --- Skills (SkillMart) ---

class SkillsResource {
  constructor(private ctx: ResourceContext) {}

  list(params?: { tag?: string; q?: string }): Promise<Skill[]> {
    const qs = params ? "?" + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
    ).toString() : "";
    return request<{ skills: Skill[] }>(this.ctx, "GET", `/api/skill-mart${qs}`).then(r => r.skills);
  }

  get(skillId: string): Promise<Skill> {
    return request(this.ctx, "GET", `/api/skill-mart/${skillId}`);
  }

  publish(input: PublishSkillInput): Promise<Skill> {
    return request(this.ctx, "POST", "/api/skill-mart/publish", input);
  }

  download(skillId: string): Promise<{ success: boolean; downloadId: string }> {
    return request(this.ctx, "POST", `/api/skill-mart/${skillId}/download`);
  }

  tags(): Promise<{ tag: string; count: number }[]> {
    return request(this.ctx, "GET", "/api/skill-mart/tags");
  }
}

// --- Webhooks ---

class WebhooksResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<Webhook[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/webhooks`);
  }

  get(webhookId: string): Promise<Webhook> {
    return request(this.ctx, "GET", `/api/webhooks/${webhookId}`);
  }

  create(companyId: string, input: CreateWebhookInput): Promise<Webhook> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/webhooks`, input);
  }

  update(webhookId: string, input: Partial<CreateWebhookInput & { isActive: boolean }>): Promise<Webhook> {
    return request(this.ctx, "PATCH", `/api/webhooks/${webhookId}`, input);
  }

  delete(webhookId: string): Promise<{ success: boolean }> {
    return request(this.ctx, "DELETE", `/api/webhooks/${webhookId}`);
  }

  test(webhookId: string): Promise<{ statusCode: number; durationMs: number }> {
    return request(this.ctx, "POST", `/api/webhooks/${webhookId}/test`);
  }

  deliveries(webhookId: string): Promise<unknown[]> {
    return request(this.ctx, "GET", `/api/webhooks/${webhookId}/deliveries`);
  }

  stats(companyId: string): Promise<unknown> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/webhook-stats`);
  }
}

// --- Company Templates ---

class TemplatesResource {
  constructor(private ctx: ResourceContext) {}

  list(params?: { category?: string; q?: string }): Promise<CompanyTemplate[]> {
    const qs = params ? "?" + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
    ).toString() : "";
    return request(this.ctx, "GET", `/api/company-templates${qs}`);
  }

  get(templateId: string): Promise<CompanyTemplate> {
    return request(this.ctx, "GET", `/api/company-templates/${templateId}`);
  }

  install(templateId: string): Promise<{ success: boolean; config: Record<string, unknown> }> {
    return request(this.ctx, "POST", `/api/company-templates/${templateId}/install`);
  }

  categories(): Promise<unknown> {
    return request(this.ctx, "GET", "/api/company-templates/categories");
  }
}

// --- Collaboration ---

class CollaborationResource {
  constructor(private ctx: ResourceContext) {}

  sessions(companyId: string): Promise<CollaborationSession[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/collaboration-sessions`);
  }

  createSession(companyId: string, input: { name: string; coordinatorAgentId?: string; participantIds?: string[] }): Promise<CollaborationSession> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/collaboration-sessions`, input);
  }

  delegate(companyId: string, input: { fromAgentId: string; toAgentId: string; title: string; description?: string }): Promise<TaskDelegation> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/task-delegations`, input);
  }

  updateDelegation(delegationId: string, status: string, result?: string): Promise<TaskDelegation> {
    return request(this.ctx, "PATCH", `/api/task-delegations/${delegationId}/status`, { status, result });
  }

  shareKnowledge(companyId: string, input: { agentId: string; title: string; content: string; category: string; tags?: string[] }): Promise<KnowledgeShare> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/knowledge-shares`, input);
  }

  searchKnowledge(companyId: string, query: string): Promise<KnowledgeShare[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/knowledge-shares?q=${encodeURIComponent(query)}`);
  }

  messages(companyId: string, agentId: string, unreadOnly?: boolean): Promise<AgentMessage[]> {
    const qs = unreadOnly ? "?unread=true" : "";
    return request(this.ctx, "GET", `/api/companies/${companyId}/agents/${agentId}/messages${qs}`);
  }

  sendMessage(companyId: string, input: { fromAgentId: string; toAgentId: string; content: string; messageType?: string }): Promise<AgentMessage> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/agent-messages`, input);
  }

  stats(companyId: string): Promise<unknown> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/collaboration-stats`);
  }
}

// --- SSO ---

class SsoResource {
  constructor(private ctx: ResourceContext) {}

  providers(): Promise<{ id: string; name: string }[]> {
    return request(this.ctx, "GET", "/api/sso/providers");
  }

  list(companyId: string): Promise<SsoConfig[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/sso-configs`);
  }

  create(companyId: string, input: CreateSsoConfigInput): Promise<SsoConfig> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/sso-configs`, input);
  }

  test(configId: string): Promise<{ success: boolean; message?: string }> {
    return request(this.ctx, "POST", `/api/sso-configs/${configId}/test`);
  }
}

// --- Departments ---

class DepartmentsResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<Department[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/departments`);
  }

  create(companyId: string, input: CreateDepartmentInput): Promise<Department> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/departments`, input);
  }

  members(departmentId: string): Promise<unknown[]> {
    return request(this.ctx, "GET", `/api/departments/${departmentId}/members`);
  }

  addMember(departmentId: string, input: { agentId: string; roleName?: string }): Promise<unknown> {
    return request(this.ctx, "POST", `/api/departments/${departmentId}/members`, input);
  }

  checkPermission(departmentId: string, memberType: string, memberId: string, permission: string): Promise<{ allowed: boolean }> {
    return request(this.ctx, "GET", `/api/departments/${departmentId}/permissions/${memberType}/${memberId}/${permission}`);
  }
}

// --- Waves ---

class WavesResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<Wave[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/waves`);
  }

  get(waveId: string): Promise<Wave> {
    return request(this.ctx, "GET", `/api/waves/${waveId}`);
  }

  dispatch(companyId: string, input: DispatchWaveInput): Promise<Wave> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/waves`, input);
  }
}

// --- Activity ---

class ActivityResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string, params?: { entityType?: string }): Promise<ActivityEntry[]> {
    const qs = params ? "?" + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
    ).toString() : "";
    return request(this.ctx, "GET", `/api/companies/${companyId}/activity${qs}`);
  }

  forIssue(issueId: string): Promise<ActivityEntry[]> {
    return request(this.ctx, "GET", `/api/issues/${issueId}/activity`);
  }
}

// --- Compliance ---

class ComplianceResource {
  constructor(private ctx: ResourceContext) {}

  list(companyId: string): Promise<ComplianceReport[]> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/compliance-reports`);
  }

  generate(companyId: string, reportType: ComplianceReportType): Promise<ComplianceReport> {
    return request(this.ctx, "POST", `/api/companies/${companyId}/compliance-reports`, { reportType });
  }

  export(companyId: string, reportType: ComplianceReportType): Promise<string> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/compliance-reports/export?reportType=${reportType}`);
  }
}

// --- Payments ---

class PaymentsResource {
  constructor(private ctx: ResourceContext) {}

  checkout(skillId: string): Promise<CheckoutSession> {
    return request(this.ctx, "POST", "/api/stripe/checkout", { skillId });
  }

  confirmDemo(paymentSessionId: string): Promise<{ success: boolean; purchaseId: string }> {
    return request(this.ctx, "POST", "/api/stripe/confirm-demo", { paymentSessionId });
  }

  purchases(): Promise<Purchase[]> {
    return request(this.ctx, "GET", "/api/stripe/purchases");
  }

  checkPurchase(skillId: string): Promise<{ purchased: boolean }> {
    return request(this.ctx, "GET", `/api/stripe/purchases/check/${skillId}`);
  }

  sales(): Promise<unknown[]> {
    return request(this.ctx, "GET", "/api/stripe/sales");
  }
}

// --- Health ---

class HealthResource {
  constructor(private ctx: ResourceContext) {}

  check(): Promise<HealthResponse> {
    return request(this.ctx, "GET", "/api/health");
  }
}

// --- Dashboard ---

class DashboardResource {
  constructor(private ctx: ResourceContext) {}

  stats(companyId: string): Promise<DashboardStats> {
    return request(this.ctx, "GET", `/api/companies/${companyId}/dashboard`);
  }
}

// --- Demo Leads ---

class DemoLeadsResource {
  constructor(private ctx: ResourceContext) {}

  list(params?: { status?: string }): Promise<DemoLead[]> {
    const qs = params ? "?" + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
    ).toString() : "";
    return request(this.ctx, "GET", `/api/demo-leads${qs}`);
  }

  create(input: CreateDemoLeadInput): Promise<DemoLead> {
    return request(this.ctx, "POST", "/api/demo-leads", input);
  }

  updateStatus(leadId: string, status: string): Promise<DemoLead> {
    return request(this.ctx, "PATCH", `/api/demo-leads/${leadId}/status`, { status });
  }

  pipeline(): Promise<unknown> {
    return request(this.ctx, "GET", "/api/demo-leads/pipeline");
  }
}
