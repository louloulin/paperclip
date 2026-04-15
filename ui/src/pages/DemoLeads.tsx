import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  demoLeadsApi,
  type DemoLead,
  type LeadStatus,
  type DemoRequest,
  type PipelineStats,
} from "../api/demo-leads";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { useToast } from "../context/ToastContext";
import {
  BarChart3,
  Users,
  TrendingUp,
  Star,
  Plus,
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronRight,
  Phone,
  Mail,
  Globe,
  MapPin,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Flame,
  ExternalLink,
  Trash2,
  Edit2,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  new: "新线索",
  contacted: "已联系",
  qualified: "已筛选",
  demo_scheduled: "演示已安排",
  demo_in_progress: "演示进行中",
  negotiating: "商务洽谈",
  won: "成交",
  lost: "流失",
  churned: "流失",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  qualified: "bg-purple-100 text-purple-700",
  demo_scheduled: "bg-indigo-100 text-indigo-700",
  demo_in_progress: "bg-orange-100 text-orange-700",
  negotiating: "bg-teal-100 text-teal-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-gray-100 text-gray-500",
  churned: "bg-red-50 text-red-400",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "手动录入",
  website: "官网表单",
  referral: "推荐",
  linkedin: "LinkedIn",
  cold_outreach: "主动联系",
  event: "活动",
  partner: "合作伙伴",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-400",
  medium: "text-yellow-600",
  high: "text-orange-500",
  urgent: "text-red-600",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status === "won" && <CheckCircle2 className="h-3 w-3" />}
      {status === "lost" && <XCircle className="h-3 w-3" />}
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: "bg-gray-300",
    medium: "bg-yellow-400",
    high: "bg-orange-400",
    urgent: "bg-red-500 animate-pulse",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[priority] || "bg-gray-300"}`}
      title={`Priority: ${priority}`}
    />
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  return d.toLocaleDateString();
}

// ── Pipeline Overview ────────────────────────────────────────────────────────

function PipelineCard({ stats }: { stats: PipelineStats }) {
  const pipelineItems = [
    { key: "new", label: "新线索" },
    { key: "contacted", label: "已联系" },
    { key: "qualified", label: "已筛选" },
    { key: "demo_scheduled", label: "演示安排" },
    { key: "demo_in_progress", label: "演示中" },
    { key: "negotiating", label: "洽谈中" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {pipelineItems.map(({ key, label }) => {
        const item = stats.pipeline.find((p) => p.status === key);
        return (
          <div key={key} className="rounded-lg border border-border bg-card p-3">
            <div className="text-2xl font-bold">{item?.count ?? 0}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        );
      })}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-1 text-2xl font-bold text-orange-600">
          <Flame className="h-4 w-4" />
          {stats.hotLeads}
        </div>
        <div className="text-xs text-muted-foreground">Hot Leads</div>
      </div>
      <div className="rounded-lg border border-border bg-green-50 p-3">
        <div className="flex items-center gap-1 text-2xl font-bold text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          {stats.won}
        </div>
        <div className="text-xs text-green-700">成交数</div>
      </div>
    </div>
  );
}

// ── Create Lead Modal ────────────────────────────────────────────────────────

function CreateLeadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    companySize: "",
    industry: "",
    country: "",
    source: "manual",
    priority: "medium",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => demoLeadsApi.create(data as Parameters<typeof demoLeadsApi.create>[0]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demoLeads"] });
      queryClient.invalidateQueries({ queryKey: ["demoLeadsPipeline"] });
      pushToast({ title: "线索创建成功" });
      onClose();
      setForm({ companyName: "", contactName: "", contactEmail: "", contactPhone: "", companySize: "", industry: "", country: "", source: "manual", priority: "medium", notes: "" });
    },
    onError: () => pushToast({ title: "创建失败" }),
  });

  if (!open) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">新建销售线索</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium">公司名称 *</label>
            <input className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" value={form.companyName} onChange={set("companyName")} placeholder="Acme Corp" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">联系人</label>
            <input className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" value={form.contactName} onChange={set("contactName")} placeholder="张三" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">邮箱 *</label>
            <input className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" type="email" value={form.contactEmail} onChange={set("contactEmail")} placeholder="zhangsan@acme.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">电话</label>
            <input className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" value={form.contactPhone} onChange={set("contactPhone")} placeholder="+86 13812345678" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">公司规模</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" value={form.companySize} onChange={set("companySize")}>
              <option value="">请选择</option>
              <option value="startup">Startup (1-10人)</option>
              <option value="small">小型 (11-50人)</option>
              <option value="medium">中型 (51-200人)</option>
              <option value="large">大型 (201-1000人)</option>
              <option value="enterprise">Enterprise (1000+人)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">行业</label>
            <input className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" value={form.industry} onChange={set("industry")} placeholder="科技/金融/电商..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">国家/地区</label>
            <input className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" value={form.country} onChange={set("country")} placeholder="中国/美国..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">来源</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" value={form.source} onChange={set("source")}>
              <option value="manual">手动录入</option>
              <option value="website">官网表单</option>
              <option value="referral">推荐</option>
              <option value="linkedin">LinkedIn</option>
              <option value="cold_outreach">主动联系</option>
              <option value="event">活动</option>
              <option value="partner">合作伙伴</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">优先级</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" value={form.priority} onChange={set("priority")}>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium">备注</label>
            <textarea className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" rows={2} value={form.notes} onChange={set("notes")} placeholder="补充信息..." />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={() => createMutation.mutate(form)}
            disabled={!form.companyName || !form.contactEmail || createMutation.isPending}
          >
            {createMutation.isPending ? "创建中..." : "创建线索"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Lead Detail Panel ────────────────────────────────────────────────────────

function LeadDetailPanel({ lead, onClose }: { lead: DemoLead; onClose: () => void }) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"info" | "requests" | "companies">("info");

  const { data: requestsData } = useQuery({
    queryKey: ["demoLeadRequests", lead.id],
    queryFn: () => demoLeadsApi.getRequests(lead.id),
    enabled: activeTab === "requests",
  });

  const { data: companiesData } = useQuery({
    queryKey: ["demoLeadCompanies", lead.id],
    queryFn: () => demoLeadsApi.getDemoCompanies(lead.id),
    enabled: activeTab === "companies",
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      demoLeadsApi.updateStatus(lead.id, { status: status as LeadStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demoLeads"] });
      queryClient.invalidateQueries({ queryKey: ["demoLeadsPipeline"] });
      pushToast({ title: "状态更新成功" });
    },
    onError: () => pushToast({ title: "更新失败" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => demoLeadsApi.delete(lead.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demoLeads"] });
      queryClient.invalidateQueries({ queryKey: ["demoLeadsPipeline"] });
      pushToast({ title: "线索已删除" });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<DemoLead>) => demoLeadsApi.update(lead.id, data as Parameters<typeof demoLeadsApi.update>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demoLeads"] });
      pushToast({ title: "更新成功" });
    },
  });

  const tabs = [
    { key: "info" as const, label: "基本信息" },
    { key: "requests" as const, label: `演示请求${requestsData?.requests?.length ? ` (${requestsData.requests.length})` : ""}` },
    { key: "companies" as const, label: `试用公司${companiesData?.demoCompanies?.length ? ` (${companiesData.demoCompanies.length})` : ""}` },
  ];

  const nextStatuses: Record<string, string[]> = {
    new: ["contacted"],
    contacted: ["qualified"],
    qualified: ["demo_scheduled"],
    demo_scheduled: ["demo_in_progress"],
    demo_in_progress: ["negotiating"],
    negotiating: ["won", "lost"],
    won: [],
    lost: [],
    churned: [],
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-2xl overflow-y-auto bg-card shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border bg-card px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">{lead.companyName}</h2>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge status={lead.status} />
                <PriorityDot priority={lead.priority} />
                {lead.hotLead && <span className="flex items-center gap-0.5 text-xs text-orange-500"><Flame className="h-3 w-3" /> Hot</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {nextStatuses[lead.status]?.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => statusMutation.mutate(s)} disabled={statusMutation.isPending}>
                  标记为 {STATUS_LABELS[s]}
                </Button>
              ))}
              <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>
          </div>
          {/* Tabs */}
          <div className="mt-3 flex gap-1 border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "info" && (
            <div className="space-y-4">
              {/* Contact Info */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">联系信息</h3>
                <div className="grid gap-2 rounded-lg border border-border p-3">
                  {lead.contactName && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">联系人:</span>
                      <span>{lead.contactName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">邮箱:</span>
                    <a href={`mailto:${lead.contactEmail}`} className="text-primary hover:underline">{lead.contactEmail}</a>
                  </div>
                  {lead.contactPhone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">电话:</span>
                      <span>{lead.contactPhone}</span>
                    </div>
                  )}
                  {lead.website && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">网站:</span>
                      <a href={lead.website} target="_blank" rel="noopener" className="flex items-center gap-1 text-primary hover:underline">
                        {lead.website} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {(lead.country || lead.city) && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">位置:</span>
                      <span>{[lead.city, lead.country].filter(Boolean).join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Company Info */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">公司信息</h3>
                <div className="grid gap-2 rounded-lg border border-border p-3">
                  {lead.companySize && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">规模:</span>
                      <span>{lead.companySize}</span>
                    </div>
                  )}
                  {lead.industry && (
                    <div className="flex items-center gap-2 text-sm">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">行业:</span>
                      <span>{lead.industry}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">来源:</span>
                    <span>{SOURCE_LABELS[lead.source] || lead.source}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">创建:</span>
                    <span>{formatDate(lead.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Star className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">评分:</span>
                    <span>{lead.leadScore} 分</span>
                    <span className="text-xs text-muted-foreground">(跟进 {lead.followupCount} 次)</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {lead.notes && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">备注</h3>
                  <div className="whitespace-pre-wrap rounded-lg border border-border p-3 text-sm">{lead.notes}</div>
                </div>
              )}

              {/* Hot Lead Toggle */}
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Flame className={`h-4 w-4 ${lead.hotLead ? "text-orange-500" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">Hot Lead</span>
                </div>
                <button
                  onClick={() => updateMutation.mutate({ hotLead: !lead.hotLead })}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    lead.hotLead ? "bg-orange-500" : "bg-muted"
                  }`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    lead.hotLead ? "translate-x-4" : "translate-x-0.5"
                  }`} />
                </button>
              </div>
            </div>
          )}

          {activeTab === "requests" && (
            <div>
              {requestsData?.requests?.length === 0 && (
                <EmptyState
                  icon={Users}
                  message="暂无演示请求"
                />
              )}
              <div className="space-y-3">
                {requestsData?.requests?.map((req) => (
                  <div key={req.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          req.status === "completed" ? "bg-green-100 text-green-700" :
                          req.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {req.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                          {req.status}
                        </span>
                        <span className="ml-2 text-sm text-muted-foreground">{req.demoType} 演示</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(req.createdAt)}</span>
                    </div>
                    {req.useCase && <p className="mt-2 text-sm">{req.useCase}</p>}
                    {req.outcome && (
                      <div className="mt-2 text-xs text-muted-foreground">结果: {req.outcome}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "companies" && (
            <div>
              {companiesData?.demoCompanies?.length === 0 && (
                <EmptyState
                  icon={Users}
                  message="暂无试用公司"
                />
              )}
              <div className="space-y-3">
                {companiesData?.demoCompanies?.map((dc) => (
                  <div key={dc.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{dc.companyName}</span>
                      {dc.convertedToPaid ? (
                        <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" /> 已转化
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {dc.trialExpiresAt ? `到期: ${formatRelativeDate(dc.trialExpiresAt)}` : "试用中"}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>Agent: {dc.agentsCreated}</div>
                      <div>任务: {dc.tasksCompleted}</div>
                      <div>活跃: {dc.activeDays}天</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Lead Row ────────────────────────────────────────────────────────────────

function LeadRow({ lead, onClick }: { lead: DemoLead; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-border transition-colors hover:bg-muted/50"
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <PriorityDot priority={lead.priority} />
          <div>
            <div className="font-medium">{lead.companyName}</div>
            {lead.contactName && <div className="text-xs text-muted-foreground">{lead.contactName}</div>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={lead.status} />
      </td>
      <td className="px-3 py-2.5">
        <div className="text-xs text-muted-foreground">{SOURCE_LABELS[lead.source] || lead.source}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className="text-xs text-muted-foreground">{lead.industry || "—"}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className="text-xs text-muted-foreground">{formatRelativeDate(lead.createdAt)}</div>
      </td>
      <td className="px-3 py-2.5">
        {lead.hotLead && <Flame className="h-4 w-4 text-orange-500" />}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end">
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onClick(); }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function DemoLeads() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSource, setFilterSource] = useState<string>("");
  const [showHotOnly, setShowHotOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<DemoLead | null>(null);

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ["demoLeads", filterStatus, filterSource, showHotOnly],
    queryFn: () =>
      demoLeadsApi.list({
        status: (filterStatus || undefined) as LeadStatus | undefined,
        source: filterSource || undefined,
        hotLead: showHotOnly || undefined,
      }),
  });

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery({
    queryKey: ["demoLeadsPipeline"],
    queryFn: () => demoLeadsApi.getPipeline(),
  });

  if (leadsLoading || pipelineLoading) return <PageSkeleton />;

  const leads = leadsData?.leads ?? [];

  return (
    <div className="flex flex-1 flex-col">
      {/* Page Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">销售线索</h1>
            <p className="text-sm text-muted-foreground">企业版演示环境与销售线索追踪</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            新建线索
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Pipeline Overview */}
        {pipelineData && (
          <div className="mb-6">
            <PipelineCard stats={pipelineData} />
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">所有状态</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
          >
            <option value="">所有来源</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => setShowHotOnly(!showHotOnly)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              showHotOnly ? "border-orange-300 bg-orange-50 text-orange-700" : "border-border bg-background"
            }`}
          >
            <Flame className="h-3.5 w-3.5" /> Hot Leads
          </button>
          {(filterStatus || filterSource || showHotOnly) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterStatus(""); setFilterSource(""); setShowHotOnly(false); }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> 清除筛选
            </Button>
          )}
          <span className="ml-auto text-sm text-muted-foreground">
            {leads.length} 条记录
          </span>
        </div>

        {/* Leads Table */}
        {leads.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            message="暂无销售线索，请点击上方按钮创建第一条线索"
          />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">公司 / 联系人</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">状态</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">来源</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">行业</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">创建时间</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Hot</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateLeadModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
      {selectedLead && (
        <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  );
}
