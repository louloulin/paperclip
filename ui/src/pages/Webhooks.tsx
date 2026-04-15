import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { webhooksApi, type Webhook, type WebhookDelivery, type WebhookStats, type CreateWebhookRequest } from "../api/webhooks";
import { useCompany } from "../context/CompanyContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusBadge } from "../components/StatusBadge";
import { timeAgo } from "../lib/timeAgo";
import {
  Webhook as WebhookIcon,
  Plus,
  Loader2,
  Send,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Activity,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const PROVIDERS = [
  { value: "generic", label: "Generic HTTP", color: "bg-gray-500" },
  { value: "slack", label: "Slack", color: "bg-purple-500" },
  { value: "feishu", label: "Feishu (飞书)", color: "bg-blue-500" },
  { value: "dingtalk", label: "DingTalk (钉钉)", color: "bg-sky-500" },
  { value: "wecom", label: "WeCom (企业微信)", color: "bg-green-500" },
];

const EVENT_OPTIONS = [
  { value: "*", label: "All Events" },
  { value: "issue.created", label: "Issue Created" },
  { value: "issue.done", label: "Issue Done" },
  { value: "issue.blocked", label: "Issue Blocked" },
  { value: "agent.status_changed", label: "Agent Status Changed" },
  { value: "approval.requested", label: "Approval Requested" },
  { value: "approval.approved", label: "Approval Approved" },
  { value: "run.completed", label: "Run Completed" },
  { value: "run.failed", label: "Run Failed" },
  { value: "wave.completed", label: "Wave Completed" },
  { value: "cost.threshold_reached", label: "Cost Threshold" },
];

function ProviderBadge({ provider }: { provider: string }) {
  const p = PROVIDERS.find((x) => x.value === provider) ?? PROVIDERS[0];
  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <span className={`inline-block w-2 h-2 rounded-full ${p.color}`} />
      {p.label}
    </Badge>
  );
}

function WebhookRow({
  webhook,
  onTest,
  onDelete,
  onToggle,
  onSelect,
  selected,
}: {
  webhook: Webhook;
  onTest: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
        <button onClick={onSelect} className="shrink-0">
          {selected ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{webhook.name}</span>
            <ProviderBadge provider={webhook.provider} />
            {!webhook.is_active && (
              <Badge variant="secondary" className="text-xs">Inactive</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{webhook.url}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
          {webhook.last_triggered_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(webhook.last_triggered_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={onTest} title="Test webhook">
            <Send className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onToggle} title={webhook.is_active ? "Disable" : "Enable"}>
            {webhook.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} title="Delete webhook" className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeliveryRow({ delivery, onRetry }: { delivery: WebhookDelivery; onRetry: () => void }) {
  const statusIcon =
    delivery.status === "delivered" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
    delivery.status === "failed" ? <XCircle className="h-4 w-4 text-red-500" /> :
    <Clock className="h-4 w-4 text-yellow-500" />;

  return (
    <div className="flex items-center gap-3 px-4 py-2 text-xs border-b border-border/50">
      {statusIcon}
      <span className="font-mono text-muted-foreground">{delivery.event_type}</span>
      <span className="flex-1 truncate text-muted-foreground">
        {delivery.response_status ?? "—"} · {delivery.duration_ms != null ? `${delivery.duration_ms}ms` : "—"}
      </span>
      <span className="text-muted-foreground">{timeAgo(delivery.created_at)}</span>
      {delivery.status === "failed" && (
        <Button variant="ghost" size="icon-sm" onClick={onRetry} title="Retry">
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function CreateWebhookDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [provider, setProvider] = useState<string>("generic");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["*"]);
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: CreateWebhookRequest) => webhooksApi.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", companyId] });
      onClose();
    },
  });

  const handleSubmit = () => {
    createMutation.mutate({
      name,
      url,
      provider: provider as CreateWebhookRequest["provider"],
      secret: secret || undefined,
      events: selectedEvents,
      description: description || undefined,
    });
  };

  const toggleEvent = (event: string) => {
    if (event === "*") {
      setSelectedEvents(["*"]);
      return;
    }
    const next = selectedEvents.filter((e) => e !== "*");
    if (next.includes(event)) {
      setSelectedEvents(next.filter((e) => e !== event));
    } else {
      setSelectedEvents([...next, event]);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Create Webhook</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Slack Channel" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="provider">Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="url">URL</Label>
          <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="secret">Secret (optional)</Label>
          <Input id="secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Webhook signing secret" />
        </div>
        <div className="grid gap-2">
          <Label>Events</Label>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_OPTIONS.map((ev) => (
              <Badge
                key={ev.value}
                variant={selectedEvents.includes(ev.value) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleEvent(ev.value)}
              >
                {ev.label}
              </Badge>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this webhook is for..." rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!name || !url || createMutation.isPending}>
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function Webhooks() {
  const { selectedCompanyId } = useCompany();
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ webhookId: string; result: unknown } | null>(null);
  const queryClient = useQueryClient();

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks", selectedCompanyId],
    queryFn: () => webhooksApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: stats } = useQuery({
    queryKey: ["webhook-stats", selectedCompanyId],
    queryFn: () => webhooksApi.stats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: deliveries } = useQuery({
    queryKey: ["webhook-deliveries", expandedId],
    queryFn: () => webhooksApi.deliveries(expandedId!, 20),
    enabled: !!expandedId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks", selectedCompanyId] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => webhooksApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks", selectedCompanyId] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.test(id),
    onSuccess: (data, id) => setTestResult({ webhookId: id, result: data }),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.retryDelivery(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", expandedId] }),
  });

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-4xl py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <WebhookIcon className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Webhooks</h1>
            <p className="text-sm text-muted-foreground">Send real-time event notifications to external services</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Webhook
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Total Webhooks</div>
            <div className="text-lg font-semibold">{Number(stats.webhooks?.total ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="text-lg font-semibold text-green-600">{Number(stats.webhooks?.active ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Deliveries (24h)</div>
            <div className="text-lg font-semibold">{Number(stats.deliveries?.last_24h ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Avg Duration</div>
            <div className="text-lg font-semibold">
              {stats.deliveries?.avg_duration_ms ? `${Math.round(Number(stats.deliveries.avg_duration_ms))}ms` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Test result banner */}
      {testResult && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${
          (testResult.result as any)?.success
            ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900"
            : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
        }`}>
          <div className="flex items-center justify-between">
            <span>
              {(testResult.result as any)?.success
                ? `Test successful (${(testResult.result as any)?.durationMs ?? 0}ms)`
                : `Test failed: ${(testResult.result as any)?.error ?? "Unknown error"}`}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setTestResult(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      {/* Webhook list */}
      {!webhooks || webhooks.length === 0 ? (
        <EmptyState
          icon={WebhookIcon}
          message="No webhooks configured. Add a webhook to receive real-time notifications."
          action="Add Webhook"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {webhooks.map((wh) => (
            <div key={wh.id}>
              <WebhookRow
                webhook={wh}
                selected={expandedId === wh.id}
                onSelect={() => setExpandedId(expandedId === wh.id ? null : wh.id)}
                onTest={() => testMutation.mutate(wh.id)}
                onDelete={() => deleteMutation.mutate(wh.id)}
                onToggle={() => toggleMutation.mutate({ id: wh.id, isActive: !wh.is_active })}
              />
              {expandedId === wh.id && (
                <div className="bg-muted/20 border-t border-border">
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Recent Deliveries
                  </div>
                  {deliveries && deliveries.length > 0 ? (
                    deliveries.map((d) => (
                      <DeliveryRow
                        key={d.id}
                        delivery={d}
                        onRetry={() => retryMutation.mutate(d.id)}
                      />
                    ))
                  ) : (
                    <p className="px-4 py-2 text-xs text-muted-foreground">No deliveries yet</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      {createOpen && selectedCompanyId && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <CreateWebhookDialog companyId={selectedCompanyId} onClose={() => setCreateOpen(false)} />
        </Dialog>
      )}
    </div>
  );
}
