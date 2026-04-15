import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collaborationApi, type CollaborationSession, type TaskDelegation, type KnowledgeShare, type CollaborationStats } from "../api/agent-collaboration";
import { useCompany } from "../context/CompanyContext";
import { Users, ArrowRight, BookOpen, MessageSquare, Plus, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";

type Tab = "sessions" | "delegations" | "knowledge" | "messages";

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "sessions", label: "Sessions", icon: Users },
  { key: "delegations", label: "Delegations", icon: ArrowRight },
  { key: "knowledge", label: "Knowledge", icon: BookOpen },
  { key: "messages", label: "Messages", icon: MessageSquare },
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paused: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-500",
  medium: "text-blue-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Users }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

// ===== Sessions Tab =====

function SessionsTab({ companyId }: { companyId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const { data: sessions, isLoading } = useQuery({
    queryKey: [...queryKeys.sidebarBadges(companyId), "collab-sessions"],
    queryFn: () => collaborationApi.listSessions(companyId),
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Collaboration Sessions</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Session
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : !sessions?.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No collaboration sessions yet. Create one to start agents working together.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="border border-border rounded-lg p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.type} &middot; {s.participantCount || 0} participants
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                  {expandedId === s.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
              {expandedId === s.id && (
                <div className="mt-3 pt-3 border-t border-border text-sm space-y-2">
                  {s.description && <p className="text-muted-foreground">{s.description}</p>}
                  {s.participants && s.participants.length > 0 && (
                    <div>
                      <span className="font-medium">Participants:</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {s.participants.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs">
                            <span className="font-mono">{p.agentId.slice(0, 8)}</span>
                            <span className="text-muted-foreground">({p.role})</span>
                            <StatusBadge status={p.status} />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Created: {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateSessionDialog companyId={companyId} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateSessionDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("project");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () => collaborationApi.createSession(companyId, { title, type, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...queryKeys.sidebarBadges(companyId), "collab-sessions"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg border border-border shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">New Collaboration Session</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              className="w-full mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q2 Product Launch"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Type</label>
            <select
              className="w-full mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="project">Project</option>
              <option value="task_force">Task Force</option>
              <option value="knowledge_share">Knowledge Share</option>
              <option value="ad_hoc">Ad Hoc</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="w-full mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the collaboration goal..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={!title || mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Session"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Delegations Tab =====

function DelegationsTab({ companyId }: { companyId: string }) {
  const { data: delegations, isLoading } = useQuery({
    queryKey: [...queryKeys.sidebarBadges(companyId), "collab-delegations"],
    queryFn: () => collaborationApi.listDelegations(companyId),
  });

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Task Delegations</h2>
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : !delegations?.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No task delegations yet. Agents can delegate tasks to each other.
        </div>
      ) : (
        <div className="space-y-2">
          {delegations.map((d) => (
            <div key={d.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{d.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono">{d.fromAgentId.slice(0, 8)}</span>
                      {" → "}
                      <span className="font-mono">{d.toAgentId.slice(0, 8)}</span>
                      {" · "}
                      {d.taskType}
                      {d.deadline && (
                        <> · <Clock className="inline h-3 w-3" /> {new Date(d.deadline).toLocaleDateString()}</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${PRIORITY_COLORS[d.priority] || ""}`}>
                    {d.priority}
                  </span>
                  <StatusBadge status={d.status} />
                </div>
              </div>
              {d.description && (
                <p className="mt-2 text-sm text-muted-foreground pl-7">{d.description}</p>
              )}
              {d.costCents > 0 && (
                <div className="mt-2 pl-7 text-xs text-muted-foreground">
                  Cost: ${(d.costCents / 100).toFixed(2)} ({d.costAttribution})
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Knowledge Tab =====

function KnowledgeTab({ companyId }: { companyId: string }) {
  const [category, setCategory] = useState<string>("");
  const { data: shares, isLoading } = useQuery({
    queryKey: [...queryKeys.sidebarBadges(companyId), "collab-knowledge", category],
    queryFn: () => collaborationApi.listKnowledge(companyId, category ? { category } : undefined),
  });

  const categories = ["insight", "pattern", "decision", "fix", "context", "procedure"];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Knowledge Sharing</h2>
        <div className="flex gap-1">
          <button
            className={`px-2 py-1 text-xs rounded ${!category ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            onClick={() => setCategory("")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`px-2 py-1 text-xs rounded ${category === cat ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : !shares?.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No knowledge shared yet. Agents can share insights, patterns, and decisions.
        </div>
      ) : (
        <div className="space-y-2">
          {shares.map((s) => (
            <div key={s.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono">{s.fromAgentId.slice(0, 8)}</span>
                      {" · "}{s.category}{" · "}{s.visibility}
                      {s.accessCount > 0 && ` · ${s.accessCount} views`}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {s.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-xs">{tag}</span>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground pl-7 line-clamp-3">{s.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Messages Tab =====

function MessagesTab({ companyId }: { companyId: string }) {
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const { data: messages, isLoading } = useQuery({
    queryKey: [...queryKeys.sidebarBadges(companyId), "collab-messages", selectedAgent],
    queryFn: () => collaborationApi.getMessages(companyId, selectedAgent),
    enabled: !!selectedAgent,
  });

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Inter-Agent Messages</h2>
      {!selectedAgent ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Select an agent to view messages. Enter an agent ID below.
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : !messages?.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No messages for this agent.</div>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="border border-border rounded-lg p-4 flex items-start gap-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{m.fromAgentId.slice(0, 8)}</span>
                    {" → "}
                    <span className="font-mono">{m.toAgentId.slice(0, 8)}</span>
                    {" · "}{m.messageType}
                    {!m.readAt && <AlertCircle className="inline h-3 w-3 ml-1 text-blue-500" />}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm mt-1">{m.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Enter agent ID to view messages"
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
        />
      </div>
    </div>
  );
}

// ===== Main Page =====

export function AgentCollaboration() {
  const { selectedCompanyId } = useCompany();
  const [activeTab, setActiveTab] = useState<Tab>("sessions");

  const { data: stats } = useQuery({
    queryKey: [...queryKeys.sidebarBadges(selectedCompanyId!), "collab-stats"],
    queryFn: () => collaborationApi.getStats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Users className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Agent Collaboration</h1>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={Users} label="Sessions" value={stats.sessions.active} />
          <StatCard icon={ArrowRight} label="Delegations" value={stats.delegations.pending} />
          <StatCard icon={BookOpen} label="Knowledge" value={stats.knowledge.total} />
          <StatCard icon={MessageSquare} label="Messages" value={stats.messages.unread} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-4">
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(key)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "sessions" && <SessionsTab companyId={selectedCompanyId} />}
      {activeTab === "delegations" && <DelegationsTab companyId={selectedCompanyId} />}
      {activeTab === "knowledge" && <KnowledgeTab companyId={selectedCompanyId} />}
      {activeTab === "messages" && <MessagesTab companyId={selectedCompanyId} />}
    </div>
  );
}
