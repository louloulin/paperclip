import { Router } from "express";
import { serverVersion } from "../version.js";

/**
 * OpenAPI 3.0 documentation for Paperclip API.
 *
 * Generates an OpenAPI 3.0 specification covering all documented API endpoints,
 * grouped by tag. Serves both the JSON spec and an interactive Swagger UI.
 */

// ─── Route catalogue (static, curated from all route modules) ─────────────────

interface ApiEndpoint {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: string;
  summary: string;
  tag: string;
}

const ENDPOINTS: ApiEndpoint[] = [
  // ── Health ──
  { method: "get", path: "/api/health", summary: "系统健康检查", tag: "Health" },

  // ── Companies ──
  { method: "get", path: "/api/companies", summary: "列出所有公司", tag: "Companies" },
  { method: "post", path: "/api/companies", summary: "创建公司", tag: "Companies" },
  { method: "get", path: "/api/companies/{companyId}", summary: "获取公司详情", tag: "Companies" },
  { method: "patch", path: "/api/companies/{companyId}", summary: "更新公司", tag: "Companies" },
  { method: "delete", path: "/api/companies/{companyId}", summary: "删除公司", tag: "Companies" },
  { method: "get", path: "/api/companies/{companyId}/dashboard", summary: "获取仪表盘数据", tag: "Dashboard" },
  { method: "get", path: "/api/companies/stats", summary: "获取公司统计", tag: "Companies" },
  { method: "post", path: "/api/companies/{companyId}/export", summary: "导出公司数据", tag: "Companies" },
  { method: "post", path: "/api/companies/{companyId}/imports/preview", summary: "预览导入数据", tag: "Companies" },
  { method: "post", path: "/api/companies/{companyId}/imports/apply", summary: "应用导入数据", tag: "Companies" },
  { method: "patch", path: "/api/companies/{companyId}/branding", summary: "更新公司品牌", tag: "Companies" },
  { method: "post", path: "/api/companies/{companyId}/archive", summary: "归档公司", tag: "Companies" },

  // ── Agents ──
  { method: "get", path: "/api/companies/{companyId}/agents", summary: "列出公司所有 Agent", tag: "Agents" },
  { method: "post", path: "/api/companies/{companyId}/agents", summary: "创建 Agent", tag: "Agents" },
  { method: "get", path: "/api/agents/{agentId}", summary: "获取 Agent 详情", tag: "Agents" },
  { method: "patch", path: "/api/agents/{agentId}", summary: "更新 Agent", tag: "Agents" },
  { method: "delete", path: "/api/agents/{agentId}", summary: "删除 Agent", tag: "Agents" },
  { method: "get", path: "/api/agents/me", summary: "获取当前 Agent 信息", tag: "Agents" },
  { method: "get", path: "/api/agents/me/inbox-lite", summary: "获取 Agent 收件箱(轻量)", tag: "Agents" },
  { method: "get", path: "/api/agents/{agentId}/configuration", summary: "获取 Agent 配置", tag: "Agents" },
  { method: "get", path: "/api/agents/{agentId}/runtime-state", summary: "获取运行时状态", tag: "Agents" },
  { method: "post", path: "/api/agents/{agentId}/pause", summary: "暂停 Agent", tag: "Agents" },
  { method: "post", path: "/api/agents/{agentId}/resume", summary: "恢复 Agent", tag: "Agents" },
  { method: "post", path: "/api/agents/{agentId}/terminate", summary: "终止 Agent", tag: "Agents" },
  { method: "get", path: "/api/agents/{agentId}/skills", summary: "获取 Agent 技能列表", tag: "Agents" },
  { method: "post", path: "/api/agents/{agentId}/skills/sync", summary: "同步 Agent 技能", tag: "Agents" },
  { method: "get", path: "/api/agents/{agentId}/keys", summary: "获取 Agent API 密钥", tag: "Agents" },
  { method: "post", path: "/api/agents/{agentId}/keys", summary: "创建 Agent API 密钥", tag: "Agents" },
  { method: "delete", path: "/api/agents/{agentId}/keys/{keyId}", summary: "删除 Agent API 密钥", tag: "Agents" },
  { method: "post", path: "/api/agents/{agentId}/wakeup", summary: "唤醒 Agent", tag: "Agents" },
  { method: "post", path: "/api/agents/{agentId}/heartbeat/invoke", summary: "触发心跳调用", tag: "Agents" },
  { method: "get", path: "/api/agents/{agentId}/task-sessions", summary: "获取任务会话", tag: "Agents" },
  { method: "post", path: "/api/companies/{companyId}/agent-hires", summary: "创建 Agent 招聘请求", tag: "Agents" },
  { method: "post", path: "/api/companies/{companyId}/agent-fires", summary: "创建 Agent 解雇请求", tag: "Agents" },
  { method: "patch", path: "/api/companies/{companyId}/agents/{agentId}/reports-to", summary: "调整汇报关系", tag: "Agents" },
  { method: "get", path: "/api/companies/{companyId}/org", summary: "获取组织架构", tag: "Agents" },
  { method: "get", path: "/api/agents/{agentId}/budget-precheck", summary: "预算预检", tag: "Agents" },

  // ── Heartbeat Runs ──
  { method: "get", path: "/api/companies/{companyId}/heartbeat-runs", summary: "列出色跳运行", tag: "Agents" },
  { method: "get", path: "/api/companies/{companyId}/live-runs", summary: "获取活跃运行", tag: "Agents" },
  { method: "get", path: "/api/heartbeat-runs/{runId}", summary: "获取运行详情", tag: "Agents" },
  { method: "post", path: "/api/heartbeat-runs/{runId}/cancel", summary: "取消运行", tag: "Agents" },
  { method: "get", path: "/api/heartbeat-runs/{runId}/events", summary: "获取运行事件", tag: "Agents" },
  { method: "get", path: "/api/heartbeat-runs/{runId}/log", summary: "获取运行日志", tag: "Agents" },

  // ── Issues ──
  { method: "get", path: "/api/companies/{companyId}/issues", summary: "列出公司 Issue", tag: "Issues" },
  { method: "post", path: "/api/companies/{companyId}/issues", summary: "创建 Issue", tag: "Issues" },
  { method: "get", path: "/api/issues/{issueId}", summary: "获取 Issue 详情", tag: "Issues" },
  { method: "patch", path: "/api/issues/{issueId}", summary: "更新 Issue", tag: "Issues" },
  { method: "delete", path: "/api/issues/{issueId}", summary: "删除 Issue", tag: "Issues" },
  { method: "post", path: "/api/issues/{issueId}/checkout", summary: "签出 Issue", tag: "Issues" },
  { method: "post", path: "/api/issues/{issueId}/release", summary: "释放 Issue", tag: "Issues" },
  { method: "post", path: "/api/issues/{issueId}/read", summary: "标记已读", tag: "Issues" },
  { method: "get", path: "/api/issues/{issueId}/comments", summary: "获取评论", tag: "Issues" },
  { method: "post", path: "/api/issues/{issueId}/comments", summary: "添加评论", tag: "Issues" },
  { method: "get", path: "/api/issues/{issueId}/work-products", summary: "获取工作产出", tag: "Issues" },
  { method: "post", path: "/api/issues/{issueId}/work-products", summary: "创建工作产出", tag: "Issues" },
  { method: "get", path: "/api/issues/{issueId}/documents", summary: "获取文档列表", tag: "Issues" },
  { method: "get", path: "/api/issues/{issueId}/documents/{key}", summary: "获取文档内容", tag: "Issues" },
  { method: "put", path: "/api/issues/{issueId}/documents/{key}", summary: "保存文档", tag: "Issues" },
  { method: "get", path: "/api/issues/{issueId}/attachments", summary: "获取附件列表", tag: "Issues" },
  { method: "post", path: "/api/issues/{issueId}/attachments", summary: "上传附件", tag: "Issues" },
  { method: "get", path: "/api/issues/{issueId}/approvals", summary: "获取 Issue 审批列表", tag: "Issues" },
  { method: "post", path: "/api/issues/{issueId}/approvals", summary: "创建 Issue 审批", tag: "Issues" },
  { method: "get", path: "/api/companies/{companyId}/labels", summary: "获取标签列表", tag: "Issues" },
  { method: "post", path: "/api/companies/{companyId}/labels", summary: "创建标签", tag: "Issues" },

  // ── Projects ──
  { method: "get", path: "/api/companies/{companyId}/projects", summary: "列出项目", tag: "Projects" },
  { method: "post", path: "/api/companies/{companyId}/projects", summary: "创建项目", tag: "Projects" },
  { method: "get", path: "/api/projects/{projectId}", summary: "获取项目详情", tag: "Projects" },
  { method: "patch", path: "/api/projects/{projectId}", summary: "更新项目", tag: "Projects" },
  { method: "delete", path: "/api/projects/{projectId}", summary: "删除项目", tag: "Projects" },
  { method: "get", path: "/api/projects/{projectId}/workspaces", summary: "列出项目工作空间", tag: "Projects" },

  // ── Goals ──
  { method: "get", path: "/api/companies/{companyId}/goals", summary: "列出目标", tag: "Goals" },
  { method: "post", path: "/api/companies/{companyId}/goals", summary: "创建目标", tag: "Goals" },
  { method: "get", path: "/api/goals/{goalId}", summary: "获取目标详情", tag: "Goals" },
  { method: "patch", path: "/api/goals/{goalId}", summary: "更新目标", tag: "Goals" },
  { method: "delete", path: "/api/goals/{goalId}", summary: "删除目标", tag: "Goals" },

  // ── Approvals ──
  { method: "get", path: "/api/companies/{companyId}/approvals", summary: "列出审批", tag: "Approvals" },
  { method: "post", path: "/api/companies/{companyId}/approvals", summary: "创建审批", tag: "Approvals" },
  { method: "get", path: "/api/approvals/{approvalId}", summary: "获取审批详情", tag: "Approvals" },
  { method: "post", path: "/api/approvals/{approvalId}/approve", summary: "批准", tag: "Approvals" },
  { method: "post", path: "/api/approvals/{approvalId}/reject", summary: "拒绝", tag: "Approvals" },
  { method: "post", path: "/api/approvals/{approvalId}/request-revision", summary: "请求修订", tag: "Approvals" },
  { method: "post", path: "/api/approvals/{approvalId}/resubmit", summary: "重新提交", tag: "Approvals" },

  // ── Approval Chains ──
  { method: "get", path: "/api/companies/{companyId}/approval-chains", summary: "列出审批链", tag: "Approval Chains" },
  { method: "post", path: "/api/companies/{companyId}/approval-chains", summary: "创建审批链", tag: "Approval Chains" },
  { method: "get", path: "/api/approval-chains/{id}", summary: "获取审批链详情", tag: "Approval Chains" },
  { method: "post", path: "/api/approval-chains/{id}/advance", summary: "推进审批链", tag: "Approval Chains" },
  { method: "post", path: "/api/approval-chains/{id}/reject", summary: "拒绝审批链", tag: "Approval Chains" },

  // ── Costs & Budgets ──
  { method: "post", path: "/api/companies/{companyId}/cost-events", summary: "上报成本事件", tag: "Costs & Budgets" },
  { method: "get", path: "/api/companies/{companyId}/costs/summary", summary: "获取成本汇总", tag: "Costs & Budgets" },
  { method: "get", path: "/api/companies/{companyId}/costs/by-agent", summary: "按 Agent 统计成本", tag: "Costs & Budgets" },
  { method: "get", path: "/api/companies/{companyId}/costs/by-project", summary: "按项目统计成本", tag: "Costs & Budgets" },
  { method: "get", path: "/api/companies/{companyId}/budgets/overview", summary: "获取预算概览", tag: "Costs & Budgets" },
  { method: "patch", path: "/api/companies/{companyId}/budgets", summary: "更新公司预算", tag: "Costs & Budgets" },
  { method: "patch", path: "/api/agents/{agentId}/budgets", summary: "更新 Agent 预算", tag: "Costs & Budgets" },
  { method: "post", path: "/api/companies/{companyId}/budgets/policies", summary: "创建预算策略", tag: "Costs & Budgets" },

  // ── Routines ──
  { method: "get", path: "/api/companies/{companyId}/routines", summary: "列出例程", tag: "Routines" },
  { method: "post", path: "/api/companies/{companyId}/routines", summary: "创建例程", tag: "Routines" },
  { method: "get", path: "/api/routines/{routineId}", summary: "获取例程详情", tag: "Routines" },
  { method: "patch", path: "/api/routines/{routineId}", summary: "更新例程", tag: "Routines" },
  { method: "post", path: "/api/routines/{routineId}/run", summary: "手动执行例程", tag: "Routines" },
  { method: "post", path: "/api/routines/{routineId}/triggers", summary: "创建触发器", tag: "Routines" },
  { method: "post", path: "/api/routine-triggers/public/{publicId}/fire", summary: "公开触发器执行", tag: "Routines" },

  // ── Secrets ──
  { method: "get", path: "/api/companies/{companyId}/secrets", summary: "列出密钥", tag: "Secrets" },
  { method: "post", path: "/api/companies/{companyId}/secrets", summary: "创建密钥", tag: "Secrets" },
  { method: "patch", path: "/api/secrets/{id}", summary: "更新密钥", tag: "Secrets" },
  { method: "delete", path: "/api/secrets/{id}", summary: "删除密钥", tag: "Secrets" },
  { method: "post", path: "/api/secrets/{id}/rotate", summary: "轮换密钥", tag: "Secrets" },

  // ── Activity ──
  { method: "get", path: "/api/companies/{companyId}/activity", summary: "获取活动日志", tag: "Activity" },
  { method: "post", path: "/api/companies/{companyId}/activity", summary: "记录活动", tag: "Activity" },
  { method: "get", path: "/api/issues/{issueId}/activity", summary: "获取 Issue 活动日志", tag: "Activity" },

  // ── Waves ──
  { method: "get", path: "/api/companies/{companyId}/waves", summary: "列出波浪", tag: "Waves" },
  { method: "post", path: "/api/companies/{companyId}/waves", summary: "创建波浪", tag: "Waves" },
  { method: "get", path: "/api/waves/{id}", summary: "获取波浪详情", tag: "Waves" },
  { method: "get", path: "/api/waves/{id}/events", summary: "获取波浪事件", tag: "Waves" },
  { method: "patch", path: "/api/waves/{waveId}/events/{eventId}", summary: "更新波浪事件", tag: "Waves" },

  // ── Company Skills ──
  { method: "get", path: "/api/companies/{companyId}/skills", summary: "列出公司技能", tag: "Company Skills" },
  { method: "post", path: "/api/companies/{companyId}/skills", summary: "创建技能", tag: "Company Skills" },
  { method: "get", path: "/api/companies/{companyId}/skills/{skillId}", summary: "获取技能详情", tag: "Company Skills" },
  { method: "delete", path: "/api/companies/{companyId}/skills/{skillId}", summary: "删除技能", tag: "Company Skills" },

  // ── Instance Settings ──
  { method: "get", path: "/api/instance/settings/general", summary: "获取实例设置", tag: "Instance Settings" },
  { method: "patch", path: "/api/instance/settings/general", summary: "更新实例设置", tag: "Instance Settings" },

  // ── Compliance Reports ──
  { method: "get", path: "/api/companies/{companyId}/compliance-reports", summary: "列出合规报告", tag: "Compliance" },
  { method: "post", path: "/api/companies/{companyId}/compliance-reports", summary: "生成合规报告", tag: "Compliance" },
  { method: "get", path: "/api/companies/{companyId}/compliance-reports/export", summary: "导出合规报告 (Markdown)", tag: "Compliance" },

  // ── SSO ──
  { method: "get", path: "/api/sso/providers", summary: "获取 SSO 提供商列表", tag: "SSO" },
  { method: "get", path: "/api/companies/{companyId}/sso-configs", summary: "列出 SSO 配置", tag: "SSO" },
  { method: "post", path: "/api/companies/{companyId}/sso-configs", summary: "创建 SSO 配置", tag: "SSO" },

  // ── Departments ──
  { method: "get", path: "/api/companies/{companyId}/departments", summary: "列出部门", tag: "Departments" },
  { method: "post", path: "/api/companies/{companyId}/departments", summary: "创建部门", tag: "Departments" },
  { method: "get", path: "/api/departments/{id}", summary: "获取部门详情", tag: "Departments" },
  { method: "get", path: "/api/departments/{id}/roles", summary: "获取部门角色", tag: "Departments" },
  { method: "post", path: "/api/departments/{id}/members", summary: "添加部门成员", tag: "Departments" },
  { method: "get", path: "/api/departments/{id}/members", summary: "列出部门成员", tag: "Departments" },
  { method: "get", path: "/api/departments/{id}/permissions/{type}/{id}/{perm}", summary: "检查权限", tag: "Departments" },

  // ── Sales CRM (Demo Leads) ──
  { method: "get", path: "/api/demo-leads", summary: "列出销售线索", tag: "Sales CRM" },
  { method: "post", path: "/api/demo-leads", summary: "创建销售线索", tag: "Sales CRM" },
  { method: "patch", path: "/api/demo-leads/{id}/status", summary: "更新线索状态", tag: "Sales CRM" },
  { method: "get", path: "/api/demo-leads/pipeline", summary: "获取管线统计", tag: "Sales CRM" },
  { method: "get", path: "/api/demo-leads/sources", summary: "获取来源统计", tag: "Sales CRM" },

  // ── SkillMart ──
  { method: "get", path: "/api/skill-mart", summary: "浏览技能市场", tag: "SkillMart" },
  { method: "get", path: "/api/skill-mart/tags", summary: "获取标签列表", tag: "SkillMart" },
  { method: "get", path: "/api/skill-mart/my", summary: "获取我发布的技能", tag: "SkillMart" },
  { method: "get", path: "/api/skill-mart/{id}", summary: "获取技能详情", tag: "SkillMart" },
  { method: "post", path: "/api/skill-mart/publish", summary: "发布技能", tag: "SkillMart" },
  { method: "patch", path: "/api/skill-mart/{id}", summary: "更新技能", tag: "SkillMart" },
  { method: "delete", path: "/api/skill-mart/{id}", summary: "归档技能", tag: "SkillMart" },
  { method: "post", path: "/api/skill-mart/{id}/download", summary: "下载技能", tag: "SkillMart" },
  { method: "get", path: "/api/skill-mart/{id}/reviews", summary: "获取技能评论", tag: "SkillMart" },
  { method: "post", path: "/api/skill-mart/{id}/reviews", summary: "添加技能评论", tag: "SkillMart" },

  // ── Stripe Payments ──
  { method: "post", path: "/api/stripe/checkout", summary: "创建支付会话", tag: "Payments" },
  { method: "post", path: "/api/stripe/confirm-demo", summary: "确认演示支付", tag: "Payments" },
  { method: "get", path: "/api/stripe/purchases", summary: "获取购买记录", tag: "Payments" },
  { method: "get", path: "/api/stripe/sales", summary: "获取销售记录", tag: "Payments" },
  { method: "get", path: "/api/stripe/purchases/check/{skillId}", summary: "检查购买状态", tag: "Payments" },
  { method: "post", path: "/api/stripe/seller/onboard", summary: "卖家入驻", tag: "Payments" },

  // ── Company Templates ──
  { method: "get", path: "/api/company-templates", summary: "浏览公司模板", tag: "Templates" },
  { method: "get", path: "/api/company-templates/categories", summary: "获取模板分类", tag: "Templates" },
  { method: "get", path: "/api/company-templates/{id}", summary: "获取模板详情", tag: "Templates" },
  { method: "post", path: "/api/company-templates/{id}/install", summary: "安装模板", tag: "Templates" },
  { method: "post", path: "/api/company-templates/publish", summary: "发布模板", tag: "Templates" },
  { method: "get", path: "/api/company-templates/{id}/reviews", summary: "获取模板评论", tag: "Templates" },
  { method: "post", path: "/api/company-templates/{id}/reviews", summary: "添加模板评论", tag: "Templates" },
  { method: "get", path: "/api/company-templates/my/installs", summary: "获取已安装模板", tag: "Templates" },

  // ── Agent Collaboration ──
  { method: "post", path: "/api/companies/{companyId}/collaboration-sessions", summary: "创建协作会话", tag: "Collaboration" },
  { method: "get", path: "/api/companies/{companyId}/collaboration-sessions", summary: "列出协作会话", tag: "Collaboration" },
  { method: "post", path: "/api/companies/{companyId}/task-delegations", summary: "创建任务委派", tag: "Collaboration" },
  { method: "patch", path: "/api/task-delegations/{id}/status", summary: "更新委派状态", tag: "Collaboration" },
  { method: "post", path: "/api/companies/{companyId}/knowledge-shares", summary: "创建知识共享", tag: "Collaboration" },
  { method: "get", path: "/api/companies/{companyId}/knowledge-shares", summary: "搜索知识", tag: "Collaboration" },
  { method: "get", path: "/api/companies/{companyId}/agents/{agentId}/messages", summary: "获取 Agent 消息", tag: "Collaboration" },
  { method: "post", path: "/api/companies/{companyId}/agent-messages", summary: "发送 Agent 消息", tag: "Collaboration" },
  { method: "patch", path: "/api/agent-messages/{id}/read", summary: "标记消息已读", tag: "Collaboration" },
  { method: "get", path: "/api/companies/{companyId}/collaboration-stats", summary: "获取协作统计", tag: "Collaboration" },

  // ── Webhooks ──
  { method: "get", path: "/api/companies/{companyId}/webhooks", summary: "列出 Webhook", tag: "Webhooks" },
  { method: "post", path: "/api/companies/{companyId}/webhooks", summary: "创建 Webhook", tag: "Webhooks" },
  { method: "get", path: "/api/webhooks/{webhookId}", summary: "获取 Webhook 详情", tag: "Webhooks" },
  { method: "patch", path: "/api/webhooks/{webhookId}", summary: "更新 Webhook", tag: "Webhooks" },
  { method: "delete", path: "/api/webhooks/{webhookId}", summary: "删除 Webhook", tag: "Webhooks" },
  { method: "post", path: "/api/webhooks/{webhookId}/test", summary: "测试 Webhook 投递", tag: "Webhooks" },
  { method: "get", path: "/api/webhooks/{webhookId}/deliveries", summary: "获取投递日志", tag: "Webhooks" },
  { method: "get", path: "/api/companies/{companyId}/webhook-stats", summary: "获取 Webhook 统计", tag: "Webhooks" },
  { method: "post", path: "/api/webhook-deliveries/{deliveryId}/retry", summary: "重试投递", tag: "Webhooks" },

  // ── Adapters ──
  { method: "get", path: "/api/companies/{companyId}/adapters", summary: "列出适配器", tag: "Adapters" },
  { method: "get", path: "/api/companies/{companyId}/adapters/{type}/models", summary: "获取适配器模型列表", tag: "Adapters" },

  // ── Plugins ──
  { method: "get", path: "/api/plugins", summary: "列出插件", tag: "Plugins" },
  { method: "get", path: "/api/plugins/{pluginId}", summary: "获取插件详情", tag: "Plugins" },
];

// ─── OpenAPI spec builder ─────────────────────────────────────────────────────

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  paths: Record<string, Record<string, unknown>>;
  tags: { name: string; description: string }[];
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
}

const TAG_DESCRIPTIONS: Record<string, string> = {
  "Health": "系统健康检查",
  "Companies": "公司管理 — 创建、更新、删除、导入导出",
  "Agents": "智能体管理 — CRUD、心跳、运行时、API 密钥、招聘/解雇",
  "Issues": "任务/Issue 管理 — CRUD、签出/释放、评论、附件、文档",
  "Projects": "项目管理 — CRUD、工作空间",
  "Goals": "目标管理 — CRUD",
  "Approvals": "审批管理 — 创建、批准、拒绝、修订",
  "Approval Chains": "链式审批流 — 多步审批、推进、拒绝",
  "Costs & Budgets": "成本追踪与预算控制 — 成本上报、汇总、预算策略",
  "Routines": "例程与自动化触发器 — CRUD、执行、Webhook 触发",
  "Secrets": "密钥管理 — CRUD、轮换",
  "Activity": "活动审计日志 — 记录和查询操作历史",
  "Dashboard": "仪表盘数据",
  "Waves": "并行波浪分发 — 创建、事件追踪",
  "Company Skills": "公司技能管理 — CRUD、同步",
  "Instance Settings": "实例设置 — 通用和实验性配置",
  "Compliance": "合规报告 — GDPR、中国数据安全法、综合报告",
  "SSO": "SSO/SAML 企业认证 — 6 种提供商支持",
  "Departments": "部门与 RBAC — 部门管理、角色权限",
  "Sales CRM": "销售线索追踪 — 线索、演示请求、管线统计",
  "SkillMart": "技能市场 — 发布、浏览、评分、下载",
  "Payments": "Stripe 支付集成 — Checkout、购买记录、卖家管理",
  "Templates": "公司模板商店 — 预构建行业模板、安装、评分",
  "Collaboration": "多智能体协作 — 会话、任务委派、知识共享、消息",
  "Webhooks": "Webhook 集成 — CRUD、测试、投递日志、5 种提供商",
  "Adapters": "适配器管理 — 模型列表、环境检测",
  "Plugins": "插件管理 — CRUD",
};

function describeParam(name: string): string {
  const map: Record<string, string> = {
    companyId: "公司 UUID",
    agentId: "智能体 UUID",
    issueId: "Issue UUID",
    id: "资源 UUID",
    projectId: "项目 UUID",
    goalId: "目标 UUID",
    routineId: "例程 UUID",
    approvalId: "审批 UUID",
    webhookId: "Webhook UUID",
    runId: "运行 UUID",
    workspaceId: "工作空间 UUID",
    pluginId: "插件 UUID",
    skillId: "技能 UUID",
    key: "文档键名",
    keyId: "密钥 UUID",
    deliveryId: "投递记录 UUID",
    publicId: "公开触发器 ID",
    perm: "权限名称",
    type: "成员类型 (agent/user)",
  };
  return map[name] ?? name;
}

function inferSchemaRef(ep: ApiEndpoint): string {
  const p = ep.path;
  if (p.includes("webhook")) return "#/components/schemas/Webhook";
  if (p.includes("cost") || p.includes("budget")) return "#/components/schemas/CostEvent";
  if (p.includes("skill-mart") || (p.includes("skill") && !p.includes("company"))) return "#/components/schemas/Skill";
  if (p.includes("agent")) return "#/components/schemas/Agent";
  if (p.includes("compan")) return "#/components/schemas/Company";
  if (p.includes("issue")) return "#/components/schemas/Issue";
  if (p.includes("approval")) return "#/components/schemas/Approval";
  return "#/components/schemas/Error";
}

function buildSpec(basePath: string): OpenApiSpec {
  const paths: Record<string, Record<string, unknown>> = {};
  const usedTags = new Set<string>();

  for (const ep of ENDPOINTS) {
    if (!paths[ep.path]) paths[ep.path] = {};

    // Extract path params
    const parameters: Record<string, unknown>[] = [];
    const paramMatches = ep.path.matchAll(/\{(\w+)\}/g);
    for (const m of paramMatches) {
      parameters.push({
        name: m[1],
        in: "path",
        required: true,
        schema: { type: "string" },
        description: describeParam(m[1]),
      });
    }

    const isList = ep.method === "get" && !ep.path.split("/").pop()?.startsWith("{");

    const entry: Record<string, unknown> = {
      summary: ep.summary,
      tags: [ep.tag],
      operationId: `${ep.method}_${ep.path.replace(/[{}]/g, "").replace(/\//g, "_").replace(/^_api_/, "")}`,
      parameters: parameters.length > 0 ? parameters : undefined,
      responses: {
        ...(ep.method === "post"
          ? { 201: { description: "创建成功", content: { "application/json": { schema: { $ref: inferSchemaRef(ep) } } } } }
          : {}),
        200: {
          description: ep.method === "delete" ? "删除成功" : isList ? "列表数据" : "成功响应",
          content: ep.method === "delete"
            ? { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } }
            : isList
              ? { "application/json": { schema: { type: "array", items: { $ref: inferSchemaRef(ep) } } } }
              : { "application/json": { schema: { $ref: inferSchemaRef(ep) } } },
        },
        401: { description: "未授权" },
        404: { description: "资源不存在" },
      },
      security: [{ BearerAuth: [] }],
    };

    if (ep.method === "post" || ep.method === "patch") {
      entry.requestBody = {
        required: true,
        content: { "application/json": { schema: { $ref: inferSchemaRef(ep) } } },
      };
    }

    paths[ep.path][ep.method] = entry;
    usedTags.add(ep.tag);
  }

  // Collect tags in order of first appearance
  const tagOrder = [...new Set(ENDPOINTS.map((e) => e.tag))];
  const tags = tagOrder.map((t) => ({
    name: t,
    description: TAG_DESCRIPTIONS[t] ?? t,
  }));

  return {
    openapi: "3.0.3",
    info: {
      title: "Paperclip API",
      version: serverVersion,
      description:
        "Paperclip 控制平面 REST API — 企业级 AI 公司操作系统。\n\n" +
        "包含公司治理、智能体管理、任务调度、审批流、预算控制、技能市场、Webhook 集成等完整功能。\n\n" +
        "**认证方式**: Bearer Token (Agent API Key 或 Board Session Token)",
    },
    servers: [{ url: basePath, description: "当前实例" }],
    paths,
    tags,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Agent API Key 或 Board Session Token",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string", description: "错误消息" } },
          required: ["error"],
        },
        Company: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            issuePrefix: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Agent: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            role: { type: "string" },
            status: { type: "string", enum: ["idle", "running", "paused", "terminated"] },
            adapterType: { type: "string" },
            companyId: { type: "string", format: "uuid" },
          },
        },
        Issue: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            status: { type: "string", enum: ["todo", "in_progress", "in_review", "done", "blocked"] },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
            companyId: { type: "string", format: "uuid" },
            agentId: { type: "string", format: "uuid" },
          },
        },
        Approval: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            status: { type: "string", enum: ["pending", "approved", "rejected"] },
            requestedBy: { type: "string" },
            reviewedBy: { type: "string" },
          },
        },
        Webhook: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            url: { type: "string", format: "uri" },
            provider: { type: "string", enum: ["generic", "slack", "feishu", "dingtalk", "wecom"] },
            events: { type: "array", items: { type: "string" } },
            isActive: { type: "boolean" },
          },
        },
        CostEvent: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            kind: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            agentId: { type: "string", format: "uuid" },
            companyId: { type: "string", format: "uuid" },
          },
        },
        Skill: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string" },
            version: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            ratingAvg: { type: "number" },
            downloadCount: { type: "integer" },
            price: { type: "number", nullable: true },
            currency: { type: "string", nullable: true },
          },
        },
      },
    },
  };
}

// ─── Swagger UI HTML (CDN, zero npm dependencies) ─────────────────────────────

function swaggerUiHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Paperclip API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "${specUrl}",
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: "BaseLayout",
      deepLinking: true,
      showExtensions: true,
      showCommonExtensions: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
    });
  </script>
</body>
</html>`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export function apiDocsRoutes() {
  const router = Router();

  /**
   * GET /api-docs/spec — OpenAPI 3.0 JSON specification
   */
  router.get("/spec", (req, res) => {
    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:3103";
    const basePath = `${protocol}://${host}`;
    const spec = buildSpec(basePath);
    res.json(spec);
  });

  /**
   * GET /api-docs — Swagger UI (interactive API documentation)
   */
  router.get("/", (req, res) => {
    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:3103";
    const specUrl = `${protocol}://${host}/api/api-docs/spec`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(swaggerUiHtml(specUrl));
  });

  /**
   * GET /api-docs/stats — Route statistics
   */
  router.get("/stats", (_req, res) => {
    const byMethod: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    for (const ep of ENDPOINTS) {
      byMethod[ep.method.toUpperCase()] = (byMethod[ep.method.toUpperCase()] ?? 0) + 1;
      byTag[ep.tag] = (byTag[ep.tag] ?? 0) + 1;
    }

    res.json({
      totalEndpoints: ENDPOINTS.length,
      byMethod,
      byTag,
      tags: Object.keys(byTag).length,
    });
  });

  return router;
}
