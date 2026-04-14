import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { complianceApi, type ComplianceReport, type ComplianceReportType } from "../api/compliance";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Shield,
  FileText,
  Download,
  Clock,
  Users,
  Activity as ActivityIcon,
  DollarSign,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

function formatCents(cents: number): string {
  if (cents >= 10000) {
    return `$${(cents / 100).toFixed(2)}`;
  }
  return `${cents} cents`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function ReportTypeCard({
  reportType,
  onGenerate,
  isGenerating,
}: {
  reportType: ComplianceReportType;
  onGenerate: (type: string) => void;
  isGenerating: boolean;
}) {
  const iconMap: Record<string, React.ReactNode> = {
    gdpr: <Shield className="h-5 w-5 text-blue-500" />,
    china_dsl: <Shield className="h-5 w-5 text-red-500" />,
    summary: <FileText className="h-5 w-5 text-green-500" />,
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{iconMap[reportType.type] ?? <FileText className="h-5 w-5" />}</div>
          <div>
            <h3 className="font-semibold">{reportType.label}</h3>
            <p className="text-xs text-muted-foreground">{reportType.labelEn}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{reportType.description}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onGenerate(reportType.type)}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="mr-1.5 h-3.5 w-3.5" />
          )}
          生成报告
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ExpandableSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium hover:bg-accent/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        {title}
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  );
}

function ReportView({ report }: { report: ComplianceReport }) {
  const { selectedCompanyId } = useCompany();
  const exportUrl = complianceApi.exportUrl(selectedCompanyId!, {
    reportType: report.reportType,
    from: report.period.from ?? undefined,
    to: report.period.to ?? undefined,
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-xs text-muted-foreground">
              报告 ID: {report.reportId}
            </span>
            <span className="text-xs text-muted-foreground">
              生成于 {formatDate(report.generatedAt)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            报告周期: {report.period.from ?? "开始"} ~ {report.period.to ?? "至今"}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <a href={exportUrl} download>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            导出 Markdown
          </a>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard
          icon={<ActivityIcon className="h-3.5 w-3.5" />}
          label="总活动数"
          value={report.summary.totalActivities}
        />
        <SummaryCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="活跃 Agent"
          value={report.summary.uniqueAgents}
        />
        <SummaryCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="活跃用户"
          value={report.summary.uniqueUsers}
        />
        <SummaryCard
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="总成本"
          value={formatCents(report.summary.totalCostCents)}
        />
        <SummaryCard
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Issue 操作"
          value={report.summary.issueOperations}
        />
        <SummaryCard
          icon={<Shield className="h-3.5 w-3.5" />}
          label="审批操作"
          value={report.summary.approvalOperations}
        />
      </div>

      {/* GDPR specific */}
      {report.gdpr && (
        <ExpandableSection title="GDPR 数据保护报告" defaultOpen>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard
                icon={<Users className="h-3.5 w-3.5" />}
                label="DSAR 请求"
                value={report.gdpr.dataSubjectAccessRequests}
              />
              <SummaryCard
                icon={<ActivityIcon className="h-3.5 w-3.5" />}
                label="数据处理活动"
                value={report.gdpr.dataProcessingActivities.length}
              />
              <SummaryCard
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="跨境传输"
                value={report.gdpr.crossBorderTransfers}
              />
              <SummaryCard
                icon={<Clock className="h-3.5 w-3.5" />}
                label="保留记录类型"
                value={report.gdpr.dataRetentionRecords.length}
              />
            </div>
            {report.gdpr.dataRetentionRecords.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-1.5 pr-4 font-medium">数据类型</th>
                      <th className="pb-1.5 pr-4 font-medium">记录数</th>
                      <th className="pb-1.5 pr-4 font-medium">最早记录</th>
                      <th className="pb-1.5 font-medium">最新记录</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.gdpr.dataRetentionRecords.map((r) => (
                      <tr key={r.entityType} className="border-b border-border/50">
                        <td className="py-1.5 pr-4">{r.entityType}</td>
                        <td className="pr-4">{r.recordCount}</td>
                        <td className="pr-4">{formatDate(r.oldestRecord)}</td>
                        <td>{formatDate(r.newestRecord)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ExpandableSection>
      )}

      {/* China DSL specific */}
      {report.chinaDsl && (
        <ExpandableSection title="中国数据安全法报告" defaultOpen>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="重要数据操作"
                value={report.chinaDsl.importantDataOperations}
              />
              <SummaryCard
                icon={<ActivityIcon className="h-3.5 w-3.5" />}
                label="跨境数据传输"
                value={report.chinaDsl.crossBorderDataTransfers}
              />
              <SummaryCard
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="本地化合规项"
                value={report.chinaDsl.dataLocalizationCompliance.length}
              />
              <SummaryCard
                icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                label="安全事故"
                value={report.chinaDsl.networkSecurityIncidents}
              />
            </div>
          </div>
        </ExpandableSection>
      )}

      {/* Timeline */}
      <ExpandableSection title={`操作时间线 (${report.timeline.length} 种操作类型)`} defaultOpen>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-1.5 pr-4 font-medium">#</th>
                <th className="pb-1.5 pr-4 font-medium">操作</th>
                <th className="pb-1.5 pr-4 font-medium">实体类型</th>
                <th className="pb-1.5 pr-4 font-medium">次数</th>
                <th className="pb-1.5 font-medium">最近发生</th>
              </tr>
            </thead>
            <tbody>
              {report.timeline.slice(0, 50).map((item, idx) => (
                <tr key={`${item.action}-${item.entityType}`} className="border-b border-border/50">
                  <td className="py-1.5 pr-4 text-muted-foreground">{idx + 1}</td>
                  <td className="pr-4 font-mono">{item.action}</td>
                  <td className="pr-4">{item.entityType}</td>
                  <td className="pr-4">{item.count}</td>
                  <td>{formatDate(item.lastOccurred)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ExpandableSection>

      {/* Agent summaries */}
      <ExpandableSection title={`Agent 合规摘要 (${report.agents.length} 个)`}>
        <div className="space-y-3">
          {report.agents.map((agent) => (
            <div key={agent.agentId} className="rounded-md border border-border bg-accent/10 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{agent.agentName}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {agent.activityCount} 次活动
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(agent.lastActiveAt)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {agent.operations.slice(0, 5).map((op) => (
                  <span
                    key={op.action}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {op.action} ×{op.count}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {report.agents.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无 Agent 活动数据</p>
          )}
        </div>
      </ExpandableSection>
    </div>
  );
}

export function ComplianceReports() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [generatedReport, setGeneratedReport] = useState<ComplianceReport | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Compliance Reports" }]);
  }, [setBreadcrumbs]);

  const { data: reportTypes, isLoading: isLoadingTypes } = useQuery({
    queryKey: ["compliance-report-types", selectedCompanyId],
    queryFn: () => complianceApi.listReportTypes(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const generateMutation = useMutation({
    mutationFn: (reportType: string) =>
      complianceApi.generate(selectedCompanyId!, {
        reportType,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      }),
    onSuccess: (report) => {
      setGeneratedReport(report);
      pushToast({
        tone: "success",
        title: "报告已生成",
        body: `${report.reportType} 报告已生成，共 ${report.summary.totalActivities} 条活动记录`,
      });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "生成失败",
        body: err instanceof Error ? err.message : "无法生成合规报告",
      });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Shield} message="请先选择一个公司。" />;
  }

  if (isLoadingTypes) {
    return <PageSkeleton variant="detail" />;
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-5">
        <h1 className="text-xl font-bold">合规报告</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          生成 GDPR、中国数据安全法等合规报告，包含完整操作审计链
        </p>
      </div>

      {/* Date range filter */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span className="text-sm font-medium">报告周期:</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          />
          <span className="text-sm text-muted-foreground">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setDateFrom(""); setDateTo(""); }}
          >
            清除
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {dateFrom || dateTo ? "已设置自定义周期" : "默认显示所有历史记录"}
        </span>
      </div>

      {/* Report type cards */}
      <div className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          选择报告类型
        </h2>
        {reportTypes?.reportTypes.map((rt) => (
          <ReportTypeCard
            key={rt.type}
            reportType={rt}
            onGenerate={(type) => generateMutation.mutate(type)}
            isGenerating={generateMutation.isPending}
          />
        ))}
      </div>

      {/* Generated report */}
      {generatedReport && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-5">
          <ReportView report={generatedReport} />
        </div>
      )}
    </div>
  );
}
