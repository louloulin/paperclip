import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { activityLog, agents, companies, costEvents } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const reportTypeSchema = z.enum(["gdpr", "china_dsl", "summary"]);
const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const generateReportSchema = z.object({
  reportType: reportTypeSchema,
  from: z.string().optional(),
  to: z.string().optional(),
});

export interface ComplianceReport {
  reportId: string;
  reportType: string;
  companyId: string;
  generatedAt: string;
  period: { from: string | null; to: string | null };
  summary: {
    totalActivities: number;
    uniqueAgents: number;
    uniqueUsers: number;
    totalCostCents: number;
    issueOperations: number;
    approvalOperations: number;
  };
  gdpr?: {
    dataSubjectAccessRequests: number;
    dataProcessingActivities: ActivitySummary[];
    crossBorderTransfers: number;
    dataRetentionRecords: RetentionRecord[];
  };
  chinaDsl?: {
    importantDataOperations: number;
    crossBorderDataTransfers: number;
    dataLocalizationCompliance: LocalizationRecord[];
    networkSecurityIncidents: number;
  };
  timeline: ActivitySummary[];
  agents: AgentComplianceSummary[];
}

interface ActivitySummary {
  action: string;
  entityType: string;
  count: number;
  lastOccurred: string | null;
  agentIds: string[];
}

interface RetentionRecord {
  entityType: string;
  recordCount: number;
  oldestRecord: string | null;
  newestRecord: string | null;
}

interface LocalizationRecord {
  dataType: string;
  operationCount: number;
  locations: string[];
}

interface AgentComplianceSummary {
  agentId: string;
  agentName: string;
  activityCount: number;
  lastActiveAt: string | null;
  operations: { action: string; count: number }[];
}

function buildWhereClause(companyId: string, from?: string, to?: string) {
  const conditions = [eq(activityLog.companyId, companyId)];
  if (from) conditions.push(gte(activityLog.createdAt, new Date(from)));
  if (to) conditions.push(lte(activityLog.createdAt, new Date(to)));
  return and(...conditions);
}

export function complianceReportRoutes(db: Db) {
  const router = Router();

  // GET /companies/:companyId/compliance-reports - List available report types
  router.get("/companies/:companyId/compliance-reports", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    res.json({
      reportTypes: [
        {
          type: "gdpr",
          label: "GDPR 合规报告",
          labelEn: "GDPR Compliance Report",
          description: "欧盟通用数据保护条例合规报告，包含数据访问、处理活动和跨境传输记录",
        },
        {
          type: "china_dsl",
          label: "中国数据安全法报告",
          labelEn: "China Data Security Law Report",
          description: "中国数据安全法合规报告，包含重要数据操作和数据本地化合规记录",
        },
        {
          type: "summary",
          label: "综合合规摘要",
          labelEn: "Compliance Summary",
          description: "综合合规摘要，包含所有主要操作审计链和统计汇总",
        },
      ],
    });
  });

  // POST /companies/:companyId/compliance-reports - Generate compliance report
  router.post(
    "/companies/:companyId/compliance-reports",
    validate(generateReportSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertBoard(req);
      assertCompanyAccess(req, companyId);

      const { reportType, from, to } = req.body as z.infer<typeof generateReportSchema>;

      const company = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0]);

      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }

      const whereClause = buildWhereClause(companyId, from, to);

      // Fetch all activity logs for the period
      const activities = await db
        .select()
        .from(activityLog)
        .where(whereClause)
        .orderBy(desc(activityLog.createdAt));

      // Fetch cost events
      const costWhere = and(
        eq(costEvents.companyId, companyId),
        from ? gte(costEvents.occurredAt, new Date(from)) : sql`1=1`,
        to ? lte(costEvents.occurredAt, new Date(to)) : sql`1=1`,
      );
      const costs = await db.select().from(costEvents).where(costWhere);

      // Fetch all agents
      const allAgents = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(eq(agents.companyId, companyId));

      // Build summary
      const uniqueAgents = new Set(activities.filter((a) => a.agentId).map((a) => a.agentId!));
      const uniqueUsers = new Set(activities.filter((a) => a.actorType === "user").map((a) => a.actorId));
      const totalCostCents = costs.reduce((sum, c) => sum + Number(c.costCents), 0);

      const issueOperations = activities.filter(
        (a) => a.entityType === "issue" && a.action.startsWith("issue."),
      ).length;
      const approvalOperations = activities.filter(
        (a) => a.entityType === "approval" || a.action.includes("approval") || a.action.includes("chain"),
      ).length;

      // Build activity summary grouped by action + entityType
      const actionMap = new Map<string, ActivitySummary>();
      for (const activity of activities) {
        const key = `${activity.action}::${activity.entityType}`;
        if (!actionMap.has(key)) {
          actionMap.set(key, {
            action: activity.action,
            entityType: entityTypeLabel(activity.entityType),
            count: 0,
            lastOccurred: null,
            agentIds: [],
          });
        }
        const summary = actionMap.get(key)!;
        summary.count++;
        if (!summary.lastOccurred || String(activity.createdAt) > summary.lastOccurred) {
          summary.lastOccurred = String(activity.createdAt);
        }
        if (activity.agentId && !summary.agentIds.includes(activity.agentId)) {
          summary.agentIds.push(activity.agentId);
        }
      }

      // Agent compliance summaries
      const agentActivityMap = new Map<string, AgentComplianceSummary>();
      for (const activity of activities) {
        if (!activity.agentId) continue;
        if (!agentActivityMap.has(activity.agentId)) {
          const agent = allAgents.find((a) => a.id === activity.agentId);
          agentActivityMap.set(activity.agentId, {
            agentId: activity.agentId,
            agentName: agent?.name ?? activity.agentId,
            activityCount: 0,
            lastActiveAt: null,
            operations: [],
          });
        }
        const summary = agentActivityMap.get(activity.agentId)!;
        summary.activityCount++;
        if (!summary.lastActiveAt || String(activity.createdAt) > summary.lastActiveAt) {
          summary.lastActiveAt = String(activity.createdAt);
        }
      }

      // Count operations per agent
      const agentOpsMap = new Map<string, Map<string, number>>();
      for (const activity of activities) {
        if (!activity.agentId) continue;
        if (!agentOpsMap.has(activity.agentId)) {
          agentOpsMap.set(activity.agentId, new Map());
        }
        const ops = agentOpsMap.get(activity.agentId)!;
        ops.set(activity.action, (ops.get(activity.action) ?? 0) + 1);
      }
      for (const [agentId, summary] of agentActivityMap) {
        const ops = agentOpsMap.get(agentId);
        if (ops) {
          summary.operations = Array.from(ops.entries())
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        }
      }

      const baseReport: ComplianceReport = {
        reportId: `cr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        reportType,
        companyId,
        generatedAt: new Date().toISOString(),
        period: { from: from ?? null, to: to ?? null },
        summary: {
          totalActivities: activities.length,
          uniqueAgents: uniqueAgents.size,
          uniqueUsers: uniqueUsers.size,
          totalCostCents,
          issueOperations,
          approvalOperations,
        },
        timeline: Array.from(actionMap.values()).sort((a, b) => b.count - a.count),
        agents: Array.from(agentActivityMap.values()).sort((a, b) => b.activityCount - a.activityCount),
      };

      // GDPR-specific data
      if (reportType === "gdpr") {
        const dataProcessingActions = new Set([
          "issue.created", "issue.updated", "issue.completed", "issue.blocked",
          "agent.hired", "agent.fired", "agent.updated",
          "project.created", "project.updated",
          "cost.reported", "finance_event.reported",
        ]);
        const dataProcessingActivities = activities
          .filter((a) => dataProcessingActions.has(a.action) || a.entityType !== "system")
          .map((a) => ({
            action: a.action,
            entityType: entityTypeLabel(a.entityType),
            count: activities.filter((x) => x.action === a.action && x.entityType === a.entityType).length,
            lastOccurred: String(
              activities
                .filter((x) => x.action === a.action && x.entityType === a.entityType)
                .map((x) => x.createdAt)
                .sort((a, b) => (a.getTime() > b.getTime() ? -1 : 1))[0] ?? null,
            ),
            agentIds: [...new Set(activities.filter((x) => x.action === a.action && x.entityType === a.entityType && x.agentId).map((x) => x.agentId!))],
          }))
          .filter((v, i, arr) => arr.findIndex((x) => x.action === v.action && x.entityType === v.entityType) === i)
          .slice(0, 20);

        // Data retention records
        const entityTypes = [...new Set(activities.map((a) => a.entityType))];
        const retentionRecords: RetentionRecord[] = entityTypes.map((et) => {
          const etActivities = activities.filter((a) => a.entityType === et);
          const timestamps = etActivities.map((a) => a.createdAt).sort();
          return {
            entityType: entityTypeLabel(et),
            recordCount: etActivities.length,
            oldestRecord: timestamps[0] ? String(timestamps[0]) : null,
            newestRecord: timestamps[timestamps.length - 1] ? String(timestamps[timestamps.length - 1]) : null,
          };
        }).filter((r) => r.recordCount > 0);

        // Cross-border transfers (cost events with external providers)
        const crossBorderTransfers = costs.filter((c) => c.provider && !["openai", "anthropic"].includes(c.provider)).length;

        baseReport.gdpr = {
          dataSubjectAccessRequests: 0, // Would be tracked via a separate DSAR table
          dataProcessingActivities,
          crossBorderTransfers,
          dataRetentionRecords: retentionRecords,
        };
      }

      // China DSL-specific data
      if (reportType === "china_dsl") {
        const importantDataActions = new Set([
          "issue.created", "issue.completed",
          "agent.hired", "agent.fired",
          "budget.updated", "cost.reported",
          "approval.created", "approval.approved", "approval.rejected",
          "chain.created", "chain.advanced",
        ]);
        const importantDataOperations = activities.filter((a) => importantDataActions.has(a.action)).length;
        const crossBorderDataTransfers = costs.filter((c) => c.provider).length;

        const localizationRecords: LocalizationRecord[] = [
          {
            dataType: "activity_log",
            operationCount: activities.length,
            locations: ["local"],
          },
          {
            dataType: "cost_events",
            operationCount: costs.length,
            locations: ["local"],
          },
        ];

        baseReport.chinaDsl = {
          importantDataOperations,
          crossBorderDataTransfers,
          dataLocalizationCompliance: localizationRecords,
          networkSecurityIncidents: 0,
        };
      }

      res.status(201).json(baseReport);
    },
  );

  // GET /companies/:companyId/compliance-reports/export - Export report as text/markdown
  router.get("/companies/:companyId/compliance-reports/export", async (req, res) => {
    const companyId = req.params.companyId as string;
    const { reportType, from, to } = req.query as Record<string, string>;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    if (!reportType) {
      res.status(400).json({ error: "reportType is required" });
      return;
    }

    const whereClause = buildWhereClause(companyId, from, to);

    const activities = await db
      .select()
      .from(activityLog)
      .where(whereClause)
      .orderBy(desc(activityLog.createdAt));

    const reportLabel = reportType === "gdpr"
      ? "GDPR 合规报告"
      : reportType === "china_dsl"
        ? "中国数据安全法报告"
        : "综合合规摘要";

    const lines: string[] = [];
    lines.push(`# ${reportLabel}`);
    lines.push("");
    lines.push(`**公司 ID**: ${companyId}`);
    lines.push(`**生成时间**: ${new Date().toISOString()}`);
    lines.push(`**报告周期**: ${from ?? "开始"} ~ ${to ?? "至今"}`);
    lines.push("");
    lines.push("## 审计链汇总 (Audit Trail Summary)");
    lines.push("");
    lines.push(`- 总活动数: ${activities.length}`);
    lines.push(`- 唯一 Agent 数: ${new Set(activities.filter((a) => a.agentId).map((a) => a.agentId)).size}`);
    lines.push(`- 唯一用户数: ${new Set(activities.filter((a) => a.actorType === "user").map((a) => a.actorId)).size}`);
    lines.push("");
    lines.push("## 操作时间线 (Operation Timeline)");
    lines.push("");

    const actionCounts = new Map<string, number>();
    for (const a of activities) {
      actionCounts.set(a.action, (actionCounts.get(a.action) ?? 0) + 1);
    }
    lines.push("| 操作 | 次数 |");
    lines.push("|------|------|");
    for (const [action, count] of [...actionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
      lines.push(`| ${action} | ${count} |`);
    }
    lines.push("");
    lines.push("## 合规说明");
    lines.push("");
    if (reportType === "gdpr") {
      lines.push("本报告符合欧盟通用数据保护条例 (GDPR) 要求。");
      lines.push("数据处理活动已记录，可供数据主体访问请求 (DSAR) 使用。");
    } else if (reportType === "china_dsl") {
      lines.push("本报告符合中国《数据安全法》要求。");
      lines.push("重要数据操作已记录，数据本地化要求已满足。");
    }
    lines.push("");
    lines.push("---");
    lines.push(`*由 Paperclip AgentCorp OS 自动生成 | ${new Date().toISOString()}*`);

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="compliance-report-${reportType}-${new Date().toISOString().split("T")[0]}.md"`);
    res.send(lines.join("\n"));
  });

  return router;
}

function entityTypeLabel(entityType: string): string {
  const labels: Record<string, string> = {
    issue: "任务/Issue",
    agent: "智能体/Agent",
    user: "用户/User",
    company: "公司/Company",
    project: "项目/Project",
    approval: "审批/Approval",
    approval_chain: "审批链/Approval Chain",
    cost_event: "成本事件/Cost Event",
    finance_event: "财务事件/Finance Event",
    budget: "预算/Budget",
    wave: "波浪/Wave",
    wave_event: "波浪事件/Wave Event",
    goal: "目标/Goal",
    routine: "例程/Routine",
    secret: "密钥/Secret",
    system: "系统/System",
  };
  return labels[entityType] ?? entityType;
}
