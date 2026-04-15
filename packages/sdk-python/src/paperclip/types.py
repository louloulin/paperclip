"""
Paperclip SDK - Type definitions (dataclasses mirroring TypeScript types)
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ---- Pagination ----


@dataclass
class PaginationParams:
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class PaginatedResponse:
    items: List[Any]
    total: int
    limit: int
    offset: int


# ---- Company ----


@dataclass
class Company:
    id: str
    name: str
    created_at: str
    updated_at: Optional[str] = None
    logo_url: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


@dataclass
class CreateCompanyInput:
    name: str
    logo_url: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


@dataclass
class UpdateCompanyInput:
    name: Optional[str] = None
    logo_url: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


# ---- Agent ----


@dataclass
class Agent:
    id: str
    company_id: str
    name: str
    role: str
    status: str
    created_at: str
    adapter_id: Optional[str] = None
    reports_to: Optional[str] = None
    email: Optional[str] = None


@dataclass
class CreateAgentInput:
    name: str
    role: str
    adapter_id: Optional[str] = None
    reports_to: Optional[str] = None
    email: Optional[str] = None


@dataclass
class UpdateAgentInput:
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    reports_to: Optional[str] = None


# ---- Issue ----


IssuePriority = str  # 'critical' | 'high' | 'medium' | 'low'
IssueStatus = str  # 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked'


@dataclass
class Issue:
    id: str = ""
    company_id: str = ""
    title: str = ""
    description: Optional[str] = None
    status: IssueStatus = "todo"
    priority: IssuePriority = "medium"
    assignee_id: Optional[str] = None
    project_id: Optional[str] = None
    goal_id: Optional[str] = None
    labels: List[str] = field(default_factory=list)
    created_at: str = ""
    updated_at: Optional[str] = None


@dataclass
class CreateIssueInput:
    title: str
    description: Optional[str] = None
    priority: IssuePriority = "medium"
    assignee_id: Optional[str] = None
    project_id: Optional[str] = None
    goal_id: Optional[str] = None
    labels: List[str] = field(default_factory=list)


@dataclass
class UpdateIssueInput:
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[IssueStatus] = None
    priority: Optional[IssuePriority] = None
    assignee_id: Optional[str] = None
    labels: Optional[List[str]] = None


# ---- Project ----


@dataclass
class Project:
    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    created_at: str = ""


@dataclass
class CreateProjectInput:
    name: str
    description: Optional[str] = None


# ---- Goal ----


@dataclass
class Goal:
    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    target_date: Optional[str] = None
    status: str = "active"
    created_at: str = ""


@dataclass
class CreateGoalInput:
    name: str
    description: Optional[str] = None
    target_date: Optional[str] = None


# ---- Approval ----


@dataclass
class Approval:
    id: str
    company_id: str
    chain_id: Optional[str] = None
    requester_id: Optional[str] = None
    approver_id: Optional[str] = None
    status: str = "pending"  # pending | approved | rejected
    decision: Optional[str] = None
    comment: Optional[str] = None
    decided_at: Optional[str] = None
    created_at: str = ""


@dataclass
class ApprovalChain:
    id: str
    company_id: str
    name: str
    template_type: str
    status: str = "active"
    current_step: int = 0
    total_steps: int = 0
    created_at: str = ""


# ---- Cost ----


@dataclass
class CostEvent:
    id: str
    company_id: str
    agent_id: Optional[str] = None
    issue_id: Optional[str] = None
    amount: float = 0.0
    currency: str = "token"
    event_type: str = ""
    description: Optional[str] = None
    created_at: str = ""


@dataclass
class CreateCostEventInput:
    agent_id: Optional[str] = None
    issue_id: Optional[str] = None
    amount: float = 0.0
    currency: str = "token"
    event_type: str = ""
    description: Optional[str] = None


# ---- Skill ----


@dataclass
class Skill:
    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    version: str = "1.0.0"
    price: Optional[float] = None
    currency: Optional[str] = None
    rating_avg: float = 0.0
    rating_count: int = 0
    download_count: int = 0
    tags: List[str] = field(default_factory=list)
    source_type: str = "npm"
    source_url: Optional[str] = None
    author_id: Optional[str] = None
    status: str = "published"
    created_at: str = ""


@dataclass
class PublishSkillInput:
    name: str
    description: Optional[str] = None
    version: str = "1.0.0"
    price: Optional[float] = None
    tags: List[str] = field(default_factory=list)
    source_type: str = "npm"
    source_url: Optional[str] = None


# ---- Webhook ----


WebhookProvider = str  # 'generic' | 'slack' | 'feishu' | 'dingtalk' | 'wecom'


@dataclass
class Webhook:
    id: str
    company_id: str
    name: str
    url: str
    provider: WebhookProvider = "generic"
    is_active: bool = True
    secret: Optional[str] = None
    events: List[str] = field(default_factory=list)
    created_at: str = ""


@dataclass
class CreateWebhookInput:
    name: str
    url: str
    provider: WebhookProvider = "generic"
    secret: Optional[str] = None
    events: List[str] = field(default_factory=list)


# ---- Template ----


@dataclass
class CompanyTemplate:
    id: str
    name: str
    description: Optional[str] = None
    category: str = ""
    industry: str = ""
    is_builtin: bool = False
    author_id: Optional[str] = None
    rating_avg: float = 0.0
    install_count: int = 0
    created_at: str = ""


# ---- Collaboration ----


@dataclass
class CollaborationSession:
    id: str
    company_id: str
    name: str
    coordinator_id: Optional[str] = None
    status: str = "active"
    created_at: str = ""


@dataclass
class TaskDelegation:
    id: str
    company_id: str
    from_agent_id: str
    to_agent_id: str
    title: str
    description: Optional[str] = None
    status: str = "pending"  # pending | accepted | rejected | completed
    result: Optional[str] = None
    created_at: str = ""


@dataclass
class KnowledgeShare:
    id: str
    company_id: str
    agent_id: str
    title: str
    content: str
    category: str = "general"
    tags: List[str] = field(default_factory=list)
    access_count: int = 0
    created_at: str = ""


@dataclass
class AgentMessage:
    id: str
    company_id: str
    from_agent_id: str
    to_agent_id: str
    content: str
    message_type: str = "text"
    is_read: bool = False
    read_at: Optional[str] = None
    created_at: str = ""


# ---- SSO ----


SsoProvider = str  # 'okta' | 'google' | 'feishu' | 'dingtalk' | 'oidc' | 'saml'


@dataclass
class SsoConfig:
    id: str
    company_id: str
    provider: SsoProvider
    name: str
    client_id: Optional[str] = None
    issuer_url: Optional[str] = None
    is_active: bool = True
    created_at: str = ""


@dataclass
class CreateSsoConfigInput:
    provider: SsoProvider
    name: str
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    issuer_url: Optional[str] = None


# ---- Department ----


@dataclass
class Department:
    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    parent_id: Optional[str] = None
    lead_agent_id: Optional[str] = None
    member_count: int = 0
    created_at: str = ""


@dataclass
class CreateDepartmentInput:
    name: str
    description: Optional[str] = None
    parent_id: Optional[str] = None


# ---- Wave ----


@dataclass
class Wave:
    id: str
    company_id: str
    topic: str
    status: str = "pending"
    total_events: int = 0
    completed_events: int = 0
    created_at: str = ""


@dataclass
class DispatchWaveInput:
    topic: str
    payloads: List[str]
    concurrency: int = 1


# ---- Activity ----


@dataclass
class ActivityEntry:
    id: str
    company_id: str
    actor_id: str
    actor_type: str = "agent"
    verb: str = ""
    entity_type: str = ""
    entity_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: str = ""


# ---- Compliance ----


ComplianceReportType = str  # 'gdpr' | 'china_dsl' | 'summary'


@dataclass
class ComplianceReport:
    id: str
    company_id: str
    report_type: ComplianceReportType
    title: str
    content: Optional[str] = None
    generated_by: Optional[str] = None
    created_at: str = ""


# ---- Payments ----


@dataclass
class CheckoutSession:
    id: str
    url: str
    amount: float
    currency: str
    platform_fee: float
    seller_amount: float
    expires_at: Optional[str] = None


@dataclass
class Purchase:
    id: str
    skill_id: str
    buyer_id: str
    amount: float
    currency: str
    platform_fee: float
    status: str = "active"
    created_at: str = ""


# ---- Health ----


@dataclass
class HealthResponse:
    status: str
    version: str
    deployment_mode: str = "local"
    deployment_exposure: str = "private"
    auth_ready: bool = True
    bootstrap_status: str = "ready"


# ---- Dashboard ----


@dataclass
class DashboardStats:
    company_id: str
    total_agents: int = 0
    active_agents: int = 0
    total_issues: int = 0
    open_issues: int = 0
    done_issues: int = 0
    total_cost: float = 0.0
    budget_used_pct: float = 0.0


# ---- Demo Leads ----


@dataclass
class DemoLead:
    id: str
    company_name: str
    contact_name: str
    contact_email: str
    status: str = "new"  # new | contacted | qualified | proposal | closed_won | closed_lost
    source: Optional[str] = None
    priority: str = "medium"
    score: Optional[int] = None
    created_at: str = ""


@dataclass
class CreateDemoLeadInput:
    company_name: str
    contact_name: str
    contact_email: str
    source: Optional[str] = None
    priority: str = "medium"


# ---- Budget ----


@dataclass
class BudgetPrecheck:
    company_id: str
    agent_id: Optional[str] = None
    utilization_pct: float = 0.0
    is_soft_warning: bool = False
    is_hard_stop: bool = False
    budget_remaining: float = 0.0
    budget_total: float = 0.0
    currency: str = "token"
