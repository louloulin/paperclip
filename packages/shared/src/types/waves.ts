export interface Wave {
  id: string;
  companyId: string;
  topic: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  status: "dispatching" | "running" | "completed" | "failed";
  dispatchedBy: string;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface WaveEvent {
  id: string;
  waveId: string;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  agentId: string | null;
  runId: string | null;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface WaveWithEvents extends Wave {
  events: WaveEvent[];
}
