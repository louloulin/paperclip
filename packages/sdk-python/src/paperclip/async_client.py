"""
Paperclip SDK - Async HTTP Client (requires httpx)
pip install paperclip-sdk[async]
"""

from typing import Any, Dict, List, Optional

try:
    import httpx
except ImportError as e:
    raise ImportError(
        "Async client requires httpx. Install with: pip install paperclip-sdk[async]"
    ) from e

from paperclip.client import (
    ActivityResource,
    AgentsResource,
    ApprovalsResource,
    CollaborationResource,
    CompaniesResource,
    ComplianceResource,
    CostsResource,
    DashboardResource,
    DemoLeadsResource,
    DepartmentsResource,
    GoalsResource,
    HealthResource,
    IssuesResource,
    PaperclipClient,
    PaymentsResource,
    ProjectsResource,
    SkillsResource,
    SsoResource,
    TemplatesResource,
    WavesResource,
    WebhooksResource,
    _HttpClient,
)
from paperclip.errors import PaperclipError


class _AsyncHttpClient:
    """Async HTTP client using httpx."""

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

    async def request(
        self,
        method: str,
        path: str,
        body: Optional[Any] = None,
    ) -> Any:
        import json

        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.request(
                    method,
                    url,
                    content=data,
                    headers=self.headers,
                )
                if resp.status_code == 204:
                    return None
                return resp.json()
            except httpx.HTTPStatusError as e:
                try:
                    err_data = e.response.json()
                    message = err_data.get("error", str(e))
                except Exception:
                    message = str(e)
                code = f"HTTP_{e.response.status_code}"
                try:
                    details = e.response.json()
                except Exception:
                    details = None
                raise PaperclipError(e.response.status_code, code, message, details)
            except httpx.RequestError as e:
                raise PaperclipError(0, "NETWORK_ERROR", str(e))


# ---- Async Resources (proxy to sync resources with async HTTP) ----


class AsyncCompaniesResource(CompaniesResource):
    def __init__(self, http: _AsyncHttpClient):
        self._http = http

    async def list(self) -> List[Any]:
        return await self._http.request("GET", "/api/companies")

    async def get(self, id: str) -> Any:
        return await self._http.request("GET", f"/api/companies/{id}")

    async def create(self, input: Any) -> Any:
        return await self._http.request("POST", "/api/companies", input)

    async def update(self, id: str, input: Any) -> Any:
        return await self._http.request("PATCH", f"/api/companies/{id}", input)

    async def delete(self, id: str) -> None:
        return await self._http.request("DELETE", f"/api/companies/{id}")


class AsyncPaperclipClient:
    """
    Async Paperclip API client using httpx.

    Args:
        base_url: Base URL of the Paperclip server (e.g., "http://localhost:3101")
        api_key: API key for agent authentication
        session_token: Session token for board user authentication
        headers: Custom headers to include in every request
        timeout: Request timeout in seconds (default: 30)
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        session_token: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 30.0,
    ):
        self_headers = dict(headers) if headers else {}
        if api_key:
            self_headers["Authorization"] = f"Bearer {api_key}"
        if session_token:
            self_headers["Cookie"] = f"session={session_token}"
        self._http = _AsyncHttpClient(base_url, self_headers)
        self._timeout = timeout

        # Initialize async resources
        self.companies = _AsyncResource(self._http, "/api/companies")
        self.agents = _AsyncSubResource(self._http, "/api/companies/{company_id}/agents")
        self.issues = _AsyncSubResource(self._http, "/api/companies/{company_id}/issues")
        self.projects = _AsyncSubResource(self._http, "/api/companies/{company_id}/projects")
        self.goals = _AsyncSubResource(self._http, "/api/companies/{company_id}/goals")
        self.approvals = _AsyncSubResource(self._http, "/api/companies/{company_id}/approvals")
        self.costs = _AsyncSubResource(self._http, "/api/companies/{company_id}/cost-events")
        self.skills = _AsyncResource(self._http, "/api/skill-mart")
        self.webhooks = _AsyncSubResource(self._http, "/api/companies/{company_id}/webhooks")
        self.templates = _AsyncResource(self._http, "/api/company-templates")
        self.collaboration = _AsyncSubResource(self._http, "/api/companies/{company_id}")
        self.sso = _AsyncResource(self._http, "/api/sso")
        self.departments = _AsyncSubResource(self._http, "/api/companies/{company_id}/departments")
        self.waves = _AsyncSubResource(self._http, "/api/companies/{company_id}/waves")
        self.activity = _AsyncSubResource(self._http, "/api/companies/{company_id}/activity")
        self.compliance = _AsyncSubResource(self._http, "/api/companies/{company_id}/compliance-reports")
        self.payments = _AsyncResource(self._http, "/api/stripe")
        self.health = _AsyncResource(self._http, "/api/health")
        self.dashboard = _AsyncSubResource(self._http, "/api/companies/{company_id}/dashboard")
        self.demo_leads = _AsyncResource(self._http, "/api/demo-leads")


class _AsyncResource:
    """Generic async resource for top-level endpoints."""

    def __init__(self, http: _AsyncHttpClient, base_path: str):
        self._http = http
        self._base = base_path

    async def list(self, params: Optional[Dict[str, str]] = None) -> List[Any]:
        qs = ""
        if params:
            import urllib.parse

            qs = "?" + "&".join(f"{urllib.parse.quote(k)}={urllib.parse.quote(v)}" for k, v in params.items() if v)
        return await self._http.request("GET", f"{self._base}{qs}")

    async def get(self, id: str) -> Any:
        return await self._http.request("GET", f"{self._base}/{id}")

    async def create(self, input: Dict[str, Any]) -> Any:
        return await self._http.request("POST", self._base, input)


class _AsyncSubResource:
    """Generic async resource for company-scoped endpoints."""

    def __init__(self, http: _AsyncHttpClient, base_path: str):
        self._http = http
        self._base = base_path

    def _path(self, company_id: str) -> str:
        return self._base.format(company_id=company_id)

    async def list(self, company_id: str, params: Optional[Dict[str, str]] = None) -> List[Any]:
        qs = ""
        if params:
            import urllib.parse

            qs = "?" + "&".join(f"{urllib.parse.quote(k)}={urllib.parse.quote(v)}" for k, v in params.items() if v)
        return await self._http.request("GET", f"{self._path(company_id)}{qs}")

    async def get(self, company_id: str, id: str) -> Any:
        return await self._http.request("GET", f"{self._path(company_id)}/{id}")

    async def create(self, company_id: str, input: Dict[str, Any]) -> Any:
        return await self._http.request("POST", self._path(company_id), input)
