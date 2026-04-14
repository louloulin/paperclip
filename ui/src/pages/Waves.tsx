import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { wavesApi } from "../api/waves";
import type { Wave, WaveWithEvents, WaveEvent } from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusBadge } from "../components/StatusBadge";
import { timeAgo } from "../lib/timeAgo";
import { Zap, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

function WaveStatusBadge({ status }: { status: Wave["status"] }) {
  return <StatusBadge status={status} />;
}

function EventStatusBadge({ status }: { status: WaveEvent["status"] }) {
  return <StatusBadge status={status} />;
}

function WaveRow({ wave, onClick }: { wave: Wave; onClick: () => void }) {
  const progress = wave.totalCount > 0 ? (wave.completedCount / wave.totalCount) * 100 : 0;
  const failedProgress = wave.totalCount > 0 ? (wave.failedCount / wave.totalCount) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors border-b border-border last:border-0"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">#</span>
            <span className="font-medium truncate">{wave.topic}</span>
            <WaveStatusBadge status={wave.status} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {wave.completedCount + wave.failedCount}/{wave.totalCount} events
            · dispatched by {wave.dispatchedBy}
            · {timeAgo(wave.createdAt)}
          </div>
        </div>
        {wave.totalCount > 0 && (
          <div className="w-20 shrink-0">
            <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${progress}%` }}
              />
              <div
                className="bg-destructive transition-all"
                style={{ width: `${failedProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

function WaveDetailPanel({ wave, onClose }: { wave: WaveWithEvents; onClose: () => void }) {
  const { data: freshWave } = useQuery({
    queryKey: ["waves", wave.id],
    queryFn: () => wavesApi.get(wave.id),
    refetchInterval: wave.status === "running" || wave.status === "dispatching" ? 3000 : false,
    enabled: wave.status === "running" || wave.status === "dispatching",
  });

  const display = freshWave || wave;
  const progress = display.totalCount > 0 ? Math.round((display.completedCount / display.totalCount) * 100) : 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="bg-muted/30 px-4 py-3 flex items-center justify-between border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{display.topic}</h3>
            <WaveStatusBadge status={display.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {display.completedCount}/{display.totalCount} completed
            {display.failedCount > 0 && ` · ${display.failedCount} failed`}
            · {timeAgo(display.createdAt)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      {display.totalCount > 0 && (
        <div className="px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{progress}%</span>
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        {display.events.map((event) => (
          <div key={event.id} className="px-4 py-2 flex items-center gap-3">
            <EventStatusBadge status={event.status} />
            <span className="flex-1 text-sm truncate">
              {String((event.payload as Record<string, unknown>)?.text || JSON.stringify(event.payload))}
            </span>
            {event.agentId && (
              <span className="text-xs text-muted-foreground font-mono">
                {event.agentId.slice(0, 8)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DispatchWaveDialog({ companyId, onDispatched }: { companyId: string; onDispatched: () => void }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [payloadsText, setPayloadsText] = useState("");

  const dispatchMutation = useMutation({
    mutationFn: (data: { topic: string; payloads: string[] }) =>
      wavesApi.dispatch(companyId, data),
    onSuccess: () => {
      setTopic("");
      setPayloadsText("");
      setOpen(false);
      onDispatched();
    },
  });

  const handleSubmit = () => {
    const payloads = payloadsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!topic.trim() || payloads.length === 0) return;
    dispatchMutation.mutate({ topic: topic.trim(), payloads });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Dispatch Wave
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dispatch Wave</DialogTitle>
          <DialogDescription>
            Dispatch multiple tasks in parallel using Ralph wave.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              placeholder="e.g., review.files"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="payloads">Payloads (one per line)</Label>
            <Textarea
              id="payloads"
              placeholder={"file1.ts\nfile2.ts\nfile3.ts"}
              value={payloadsText}
              onChange={(e) => setPayloadsText(e.target.value)}
              className="mt-1 font-mono text-xs"
              rows={6}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Each line becomes one parallel task. {payloadsText.split("\n").filter(Boolean).length} tasks
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!topic.trim() || !payloadsText.trim() || dispatchMutation.isPending}
          >
            {dispatchMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Dispatch {payloadsText.split("\n").filter(Boolean).length} Tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Waves() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Waves" }]);
  }, [setBreadcrumbs]);

  const { data: waves, isLoading } = useQuery({
    queryKey: ["waves", selectedCompanyId, statusFilter],
    queryFn: () => wavesApi.list(selectedCompanyId!, statusFilter === "all" ? undefined : statusFilter),
    enabled: !!selectedCompanyId,
  });

  const { data: selectedWave } = useQuery({
    queryKey: ["waves", selectedWaveId],
    queryFn: () => wavesApi.get(selectedWaveId!),
    enabled: !!selectedWaveId,
  });

  const handleDispatched = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["waves", selectedCompanyId] });
  }, [queryClient, selectedCompanyId]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Zap} message="Select a company to view waves." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All waves</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="dispatching">Dispatching</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DispatchWaveDialog companyId={selectedCompanyId} onDispatched={handleDispatched} />
      </div>

      {selectedWave && (
        <WaveDetailPanel
          wave={selectedWave}
          onClose={() => setSelectedWaveId(null)}
        />
      )}

      {waves && waves.length === 0 && (
        <EmptyState
          icon={Zap}
          message="No waves yet. Dispatch your first parallel task wave."
        />
      )}

      {waves && waves.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          {waves.map((wave) => (
            <WaveRow
              key={wave.id}
              wave={wave}
              onClick={() => setSelectedWaveId(wave.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
