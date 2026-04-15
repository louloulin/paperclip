"""
Paperclip SDK - Synchronous HTTP Client
Zero-dependency Python client for the Paperclip API.
"""

import json
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional, cast

from paperclip.errors import PaperclipError
from paperclip.types import (
    ActivityEntry,
    Agent,
    AgentMessage,
    Approval,
    ApprovalChain,
    BudgetPrecheck,
    CheckoutSession,
    CollaborationSession,
    Company,
    CompanyTemplate,
    ComplianceReport,
    ComplianceReportType,
    CostEvent,
    CreateAgentInput,
    CreateCompanyInput,
    CreateCostEventInput,
    CreateDepartmentInput,
    CreateDemoLeadInput,
    CreateGoalInput,
    CreateIssueInput,
    CreateProjectInput,
    CreateSsoConfigInput,
    CreateWebhookInput,
    DashboardStats,
    DemoLead,
    Department,
    DispatchWaveInput,
    HealthResponse,
    Issue,
    IssueStatus,
    KnowledgeShare,
    PaginatedResponse,
    PaginationParams,
    Project,
    PublishSkillInput,
    Purchase,
    Skill,
    SsoConfig,
    TaskDelegation,
    UpdateAgentInput,
    UpdateCompanyInput,
    UpdateIssueInput,
    Wave,
    Webhook,
)


def _default_json_encoder(obj: Any) -> Any:
    """JSON encoder for dataclasses and common types."""
    if hasattr(obj, "__dataclass_fields__"):
        return {k: getattr(obj, k) for k in obj.__dataclass_fields__}
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return obj


def _json_dumps(body: Any) -> Optional[bytes]:
    if body is None:
        return None
    return json.dumps(body, default=_default_json_encoder).encode("utf-8")


def _json_loads(data: bytes | str) -> Any:
    return json.loads(data)


# ---- HTTP Client ----


class _HttpClient:
    """Minimal sync HTTP client using urllib (zero extra dependencies)."""

    def __init__(
        self,
        base_url: str,
        headers: Optional[Dict[str, str]] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.headers: Dict[str, str] = {
            "Content-Type": "application/json",
            **(headers or {}),
        }

    def request(
        self,
        method: str,
        path: str,
        body: Optional[Any] = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        data = _json_dumps(body) if body is not None else None

        req = urllib.request.Request(
            url,
            data=data,
            headers=self.headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 204:
                    return None
                raw = resp.read()
                if not raw:
                    return None
                return _json_loads(raw)
        except urllib.error.HTTPError as e:
            raw = e.read() or b""
            try:
                err_data = _json_loads(raw)
                message = err_data.get("error", raw.decode("utf-8", errors="replace"))
            except Exception:
                message = raw.decode("utf-8", errors="replace")
            code = f"HTTP_{e.code}"
            details = None
            try:
                details = _json_loads(raw)
            except Exception:
                pass
            raise PaperclipError(e.code, code, message, details)
        except urllib.error.URLError as e:
            raise PaperclipError(0, "NETWORK_ERROR", str(e.reason))


# ---- Resource Base ----


class _Resource:
    def __init__(self, http: _HttpClient):
        self._http = http


# ---- Companies ----


class CompaniesResource(_Resource):
    def list(self) -> List[Company]:
        return self._http.request("GET", "/api/companies")

    def get(self, id: str) -> Company:
        return self._http.request("GET", f"/api/companies/{id}")

    def create(self, input: CreateCompanyInput) -> Company:
        return self._http.request("POST", "/api/companies", input)

    def update(self, id: str, input: UpdateCompanyInput) -> Company:
        return self._http.request("PATCH", f"/api/companies/{id}", input)

    def delete(self, id: str) -> None:
        return self._http.request("DELETE", f"/api/companies/{id}")

    def export(self, id: str) -> Any:
        return self._http.request("POST", f"/api/companies/{id}/export")


# ---- Agents ----


class AgentsResource(_Resource):
    def list(self, company_id: str) -> List[Agent]:
        return self._http.request("GET", f"/api/companies/{company_id}/agents")

    def get(self, company_id: str, agent_id: str) -> Agent:
        return self._http.request("GET", f"/api/companies/{company_id}/agents/{agent_id}")

    def create(self, company_id: str, input: CreateAgentInput) -> Agent:
        return self._http.request("POST", f"/api/companies/{company_id}/agent-hires", input)

    def update(self, company_id: str, agent_id: str, input: UpdateAgentInput) -> Agent:
        return self._http.request("PATCH", f"/api/companies/{company_id}/agents/{agent_id}", input)

    def delete(self, company_id: str, agent_id: str) -> None:
        return self._http.request("DELETE", f"/api/companies/{company_id}/agents/{agent_id}")

    def inbox(self, company_id: str, agent_id: str) -> List[Issue]:
        return self._http.request("GET", f"/api/companies/{company_id}/agents/{agent_id}/inbox-lite")

    def budget_precheck(self, company_id: str, agent_id: str) -> BudgetPrecheck:
        return self._http.request("GET", f"/api/companies/{company_id}/agents/{agent_id}/budget-precheck")


# ---- Issues ----


class IssuesResource(_Resource):
    def list(self, company_id: str, params: Optional[PaginationParams] = None, status: Optional[IssueStatus] = None) -> List[Issue]:
        qp: Dict[str, str] = {}
        if params and params.limit is not None:
            qp["limit"] = str(params.limit)
        if params and params.offset is not None:
            qp["offset"] = str(params.offset)
        if status:
            qp["status"] = status
        qs = _build_qs(qp)
        return self._http.request("GET", f"/api/companies/{company_id}/issues{qs}")

    def get(self, issue_id: str) -> Issue:
        return self._http.request("GET", f"/api/issues/{issue_id}")

    def create(self, company_id: str, input: CreateIssueInput) -> Issue:
        return self._http.request("POST", f"/api/companies/{company_id}/issues", input)

    def update(self, issue_id: str, input: UpdateIssueInput) -> Issue:
        return self._http.request("PATCH", f"/api/issues/{issue_id}", input)

    def checkout(self, issue_id: str) -> Issue:
        return self._http.request("PATCH", f"/api/issues/{issue_id}", {"status": "in_progress"})

    def add_comment(self, issue_id: str, body: str) -> Any:
        return self._http.request("POST", f"/api/issues/{issue_id}/comments", {"body": body})


# ---- Projects ----


class ProjectsResource(_Resource):
    def list(self, company_id: str) -> List[Project]:
        return self._http.request("GET", f"/api/companies/{company_id}/projects")

    def get(self, project_id: str) -> Project:
        return self._http.request("GET", f"/api/projects/{project_id}")

    def create(self, company_id: str, input: CreateProjectInput) -> Project:
        return self._http.request("POST", f"/api/companies/{company_id}/projects", input)


# ---- Goals ----


class GoalsResource(_Resource):
    def list(self, company_id: str) -> List[Goal]:
        return self._http.request("GET", f"/api/companies/{company_id}/goals")

    def create(self, company_id: str, input: CreateGoalInput) -> Goal:
        return self._http.request("POST", f"/api/companies/{company_id}/goals", input)


# ---- Approvals ----


class ApprovalsResource(_Resource):
    def list(self, company_id: str) -> List[Approval]:
        return self._http.request("GET", f"/api/companies/{company_id}/approvals")

    def get(self, approval_id: str) -> Approval:
        return self._http.request("GET", f"/api/approvals/{approval_id}")

    def advance_chain(self, chain_id: str, decision: str, comment: Optional[str] = None) -> ApprovalChain:
        body: Dict[str, Any] = {"decision": decision}
        if comment:
            body["comment"] = comment
        return self._http.request("POST", f"/api/approval-chains/{chain_id}/advance", body)

    def get_chain(self, chain_id: str) -> ApprovalChain:
        return self._http.request("GET", f"/api/approval-chains/{chain_id}")


# ---- Costs ----


class CostsResource(_Resource):
    def list(self, company_id: str) -> Any:
        """Get cost summary for a company."""
        return self._http.request("GET", f"/api/companies/{company_id}/costs/summary")

    def summary(self, company_id: str) -> Any:
        return self._http.request("GET", f"/api/companies/{company_id}/costs/summary")

    def by_agent(self, company_id: str) -> List[Any]:
        return self._http.request("GET", f"/api/companies/{company_id}/costs/by-agent")

    def by_project(self, company_id: str) -> List[Any]:
        return self._http.request("GET", f"/api/companies/{company_id}/costs/by-project")

    def by_provider(self, company_id: str) -> List[Any]:
        return self._http.request("GET", f"/api/companies/{company_id}/costs/by-provider")

    def create(self, company_id: str, input: CreateCostEventInput) -> CostEvent:
        return self._http.request("POST", f"/api/companies/{company_id}/cost-events", input)


# ---- Skills ----


class SkillsResource(_Resource):
    def list(self, tag: Optional[str] = None, q: Optional[str] = None) -> List[Skill]:
        qp: Dict[str, str] = {}
        if tag:
            qp["tag"] = tag
        if q:
            qp["q"] = q
        qs = _build_qs(qp)
        data = self._http.request("GET", f"/api/skill-mart{qs}")
        return data.get("skills", [])

    def get(self, skill_id: str) -> Skill:
        return self._http.request("GET", f"/api/skill-mart/{skill_id}")

    def publish(self, input: PublishSkillInput) -> Skill:
        return self._http.request("POST", "/api/skill-mart/publish", input)

    def download(self, skill_id: str) -> Dict[str, Any]:
        return self._http.request("POST", f"/api/skill-mart/{skill_id}/download")

    def tags(self) -> List[Dict[str, Any]]:
        return self._http.request("GET", "/api/skill-mart/tags")

    def reviews(self, skill_id: str) -> List[Any]:
        return self._http.request("GET", f"/api/skill-mart/{skill_id}/reviews")


# ---- Webhooks ----


class WebhooksResource(_Resource):
    def list(self, company_id: str) -> List[Webhook]:
        return self._http.request("GET", f"/api/companies/{company_id}/webhooks")

    def get(self, webhook_id: str) -> Webhook:
        return self._http.request("GET", f"/api/webhooks/{webhook_id}")

    def create(self, company_id: str, input: CreateWebhookInput) -> Webhook:
        return self._http.request("POST", f"/api/companies/{company_id}/webhooks", input)

    def update(self, webhook_id: str, input: Dict[str, Any]) -> Webhook:
        return self._http.request("PATCH", f"/api/webhooks/{webhook_id}", input)

    def delete(self, webhook_id: str) -> Dict[str, bool]:
        return self._http.request("DELETE", f"/api/webhooks/{webhook_id}")

    def test(self, webhook_id: str) -> Dict[str, Any]:
        return self._http.request("POST", f"/api/webhooks/{webhook_id}/test")

    def deliveries(self, webhook_id: str) -> List[Any]:
        return self._http.request("GET", f"/api/webhooks/{webhook_id}/deliveries")

    def stats(self, company_id: str) -> Any:
        return self._http.request("GET", f"/api/companies/{company_id}/webhook-stats")


# ---- Templates ----


class TemplatesResource(_Resource):
    def list(self, category: Optional[str] = None, q: Optional[str] = None) -> List[CompanyTemplate]:
        qp: Dict[str, str] = {}
        if category:
            qp["category"] = category
        if q:
            qp["q"] = q
        qs = _build_qs(qp)
        return self._http.request("GET", f"/api/company-templates{qs}")

    def get(self, template_id: str) -> CompanyTemplate:
        return self._http.request("GET", f"/api/company-templates/{template_id}")

    def install(self, template_id: str) -> Dict[str, Any]:
        return self._http.request("POST", f"/api/company-templates/{template_id}/install")

    def categories(self) -> Any:
        return self._http.request("GET", "/api/company-templates/categories")


# ---- Collaboration ----


class CollaborationResource(_Resource):
    def sessions(self, company_id: str) -> List[CollaborationSession]:
        return self._http.request("GET", f"/api/companies/{company_id}/collaboration-sessions")

    def create_session(
        self,
        company_id: str,
        name: str,
        coordinator_agent_id: Optional[str] = None,
        participant_ids: Optional[List[str]] = None,
    ) -> CollaborationSession:
        body: Dict[str, Any] = {"name": name}
        if coordinator_agent_id:
            body["coordinatorAgentId"] = coordinator_agent_id
        if participant_ids:
            body["participantIds"] = participant_ids
        return self._http.request("POST", f"/api/companies/{company_id}/collaboration-sessions", body)

    def delegate(
        self,
        company_id: str,
        from_agent_id: str,
        to_agent_id: str,
        title: str,
        description: Optional[str] = None,
    ) -> TaskDelegation:
        body: Dict[str, Any] = {
            "fromAgentId": from_agent_id,
            "toAgentId": to_agent_id,
            "title": title,
        }
        if description:
            body["description"] = description
        return self._http.request("POST", f"/api/companies/{company_id}/task-delegations", body)

    def update_delegation(self, delegation_id: str, status: str, result: Optional[str] = None) -> TaskDelegation:
        body: Dict[str, Any] = {"status": status}
        if result:
            body["result"] = result
        return self._http.request("PATCH", f"/api/task-delegations/{delegation_id}/status", body)

    def share_knowledge(
        self,
        company_id: str,
        agent_id: str,
        title: str,
        content: str,
        category: str = "general",
        tags: Optional[List[str]] = None,
    ) -> KnowledgeShare:
        body: Dict[str, Any] = {
            "agentId": agent_id,
            "title": title,
            "content": content,
            "category": category,
        }
        if tags:
            body["tags"] = tags
        return self._http.request("POST", f"/api/companies/{company_id}/knowledge-shares", body)

    def search_knowledge(self, company_id: str, query: str) -> List[KnowledgeShare]:
        return self._http.request("GET", f"/api/companies/{company_id}/knowledge-shares?q={_encode(query)}")

    def messages(self, company_id: str, agent_id: str, unread_only: bool = False) -> List[AgentMessage]:
        qs = "?unread=true" if unread_only else ""
        return self._http.request("GET", f"/api/companies/{company_id}/agents/{agent_id}/messages{qs}")

    def send_message(
        self,
        company_id: str,
        from_agent_id: str,
        to_agent_id: str,
        content: str,
        message_type: str = "text",
    ) -> AgentMessage:
        body: Dict[str, Any] = {
            "fromAgentId": from_agent_id,
            "toAgentId": to_agent_id,
            "content": content,
            "messageType": message_type,
        }
        return self._http.request("POST", f"/api/companies/{company_id}/agent-messages", body)

    def stats(self, company_id: str) -> Any:
        return self._http.request("GET", f"/api/companies/{company_id}/collaboration-stats")


# ---- SSO ----


class SsoResource(_Resource):
    def providers(self) -> List[Dict[str, str]]:
        return self._http.request("GET", "/api/sso/providers")

    def list(self, company_id: str) -> List[SsoConfig]:
        return self._http.request("GET", f"/api/companies/{company_id}/sso-configs")

    def create(self, company_id: str, input: CreateSsoConfigInput) -> SsoConfig:
        return self._http.request("POST", f"/api/companies/{company_id}/sso-configs", input)

    def test(self, config_id: str) -> Dict[str, Any]:
        return self._http.request("POST", f"/api/sso-configs/{config_id}/test")


# ---- Departments ----


class DepartmentsResource(_Resource):
    def list(self, company_id: str) -> List[Department]:
        return self._http.request("GET", f"/api/companies/{company_id}/departments")

    def get(self, department_id: str) -> Department:
        return self._http.request("GET", f"/api/departments/{department_id}")

    def create(self, company_id: str, input: CreateDepartmentInput) -> Department:
        return self._http.request("POST", f"/api/companies/{company_id}/departments", input)

    def members(self, department_id: str) -> List[Any]:
        return self._http.request("GET", f"/api/departments/{department_id}/members")

    def add_member(self, department_id: str, agent_id: str, role_name: Optional[str] = None) -> Any:
        body: Dict[str, Any] = {"agentId": agent_id}
        if role_name:
            body["roleName"] = role_name
        return self._http.request("POST", f"/api/departments/{department_id}/members", body)

    def check_permission(self, department_id: str, member_type: str, member_id: str, permission: str) -> Dict[str, bool]:
        return self._http.request("GET", f"/api/departments/{department_id}/permissions/{member_type}/{member_id}/{permission}")


# ---- Waves ----


class WavesResource(_Resource):
    def list(self, company_id: str) -> List[Wave]:
        return self._http.request("GET", f"/api/companies/{company_id}/waves")

    def get(self, wave_id: str) -> Wave:
        return self._http.request("GET", f"/api/waves/{wave_id}")

    def dispatch(self, company_id: str, input: DispatchWaveInput) -> Wave:
        return self._http.request("POST", f"/api/companies/{company_id}/waves", input)


# ---- Activity ----


class ActivityResource(_Resource):
    def list(self, company_id: str, entity_type: Optional[str] = None) -> List[ActivityEntry]:
        qp: Dict[str, str] = {}
        if entity_type:
            qp["entityType"] = entity_type
        qs = _build_qs(qp)
        return self._http.request("GET", f"/api/companies/{company_id}/activity{qs}")

    def for_issue(self, issue_id: str) -> List[ActivityEntry]:
        return self._http.request("GET", f"/api/issues/{issue_id}/activity")


# ---- Compliance ----


class ComplianceResource(_Resource):
    def list(self, company_id: str) -> List[ComplianceReport]:
        return self._http.request("GET", f"/api/companies/{company_id}/compliance-reports")

    def generate(self, company_id: str, report_type: ComplianceReportType) -> ComplianceReport:
        return self._http.request("POST", f"/api/companies/{company_id}/compliance-reports", {"reportType": report_type})

    def export(self, company_id: str, report_type: ComplianceReportType) -> str:
        return self._http.request("GET", f"/api/companies/{company_id}/compliance-reports/export?reportType={report_type}")


# ---- Payments ----


class PaymentsResource(_Resource):
    def checkout(self, skill_id: str) -> CheckoutSession:
        return self._http.request("POST", "/api/stripe/checkout", {"skillId": skill_id})

    def confirm_demo(self, payment_session_id: str) -> Dict[str, Any]:
        return self._http.request("POST", "/api/stripe/confirm-demo", {"paymentSessionId": payment_session_id})

    def purchases(self) -> List[Purchase]:
        return self._http.request("GET", "/api/stripe/purchases")

    def check_purchase(self, skill_id: str) -> Dict[str, bool]:
        return self._http.request("GET", f"/api/stripe/purchases/check/{skill_id}")

    def sales(self) -> List[Any]:
        return self._http.request("GET", "/api/stripe/sales")


# ---- Health ----


class HealthResource(_Resource):
    def check(self) -> HealthResponse:
        return self._http.request("GET", "/api/health")


# ---- Dashboard ----


class DashboardResource(_Resource):
    def stats(self, company_id: str) -> DashboardStats:
        return self._http.request("GET", f"/api/companies/{company_id}/dashboard")


# ---- Demo Leads ----


class DemoLeadsResource(_Resource):
    def list(self, status: Optional[str] = None) -> List[DemoLead]:
        qs = f"?status={status}" if status else ""
        return self._http.request("GET", f"/api/demo-leads{qs}")

    def create(self, input: CreateDemoLeadInput) -> DemoLead:
        return self._http.request("POST", "/api/demo-leads", input)

    def update_status(self, lead_id: str, status: str) -> DemoLead:
        return self._http.request("PATCH", f"/api/demo-leads/{lead_id}/status", {"status": status})

    def pipeline(self) -> Any:
        return self._http.request("GET", "/api/demo-leads/pipeline")


# ---- Utility ----


def _build_qs(params: Dict[str, str]) -> str:
    if not params:
        return ""
    parts = [f"{_encode(k)}={_encode(v)}" for k, v in params.items() if v]
    return "?" + "&".join(parts) if parts else ""


def _encode(s: str) -> str:
    import urllib.parse

    return urllib.parse.quote(s)


# ---- Main Client ----


class PaperclipClient:
    """
    Paperclip API client.

    Args:
        base_url: Base URL of the Paperclip server (e.g., "http://localhost:3101")
        api_key: API key for agent authentication
        session_token: Session token for board user authentication
        headers: Custom headers to include in every request
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        session_token: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        self_headers = dict(headers) if headers else {}
        if api_key:
            self_headers["Authorization"] = f"Bearer {api_key}"
        if session_token:
            self_headers["Cookie"] = f"session={session_token}"

        self._http = _HttpClient(base_url, self_headers)

        # Initialize resources
        self.companies = CompaniesResource(self._http)
        self.agents = AgentsResource(self._http)
        self.issues = IssuesResource(self._http)
        self.projects = ProjectsResource(self._http)
        self.goals = GoalsResource(self._http)
        self.approvals = ApprovalsResource(self._http)
        self.costs = CostsResource(self._http)
        self.skills = SkillsResource(self._http)
        self.webhooks = WebhooksResource(self._http)
        self.templates = TemplatesResource(self._http)
        self.collaboration = CollaborationResource(self._http)
        self.sso = SsoResource(self._http)
        self.departments = DepartmentsResource(self._http)
        self.waves = WavesResource(self._http)
        self.activity = ActivityResource(self._http)
        self.compliance = ComplianceResource(self._http)
        self.payments = PaymentsResource(self._http)
        self.health = HealthResource(self._http)
        self.dashboard = DashboardResource(self._http)
        self.demo_leads = DemoLeadsResource(self._http)
