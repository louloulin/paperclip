import { api } from "./client";
import type { Wave, WaveEvent, WaveWithEvents } from "@paperclipai/shared";

export type { Wave, WaveEvent, WaveWithEvents };

export interface DispatchWaveRequest {
  topic: string;
  payloads: string[];
  dispatchedBy?: "agent" | "user";
  agentId?: string;
}

export const wavesApi = {
  list: (companyId: string, status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    return api.get<Wave[]>(`/companies/${companyId}/waves${qs ? `?${qs}` : ""}`);
  },

  dispatch: (companyId: string, data: DispatchWaveRequest) =>
    api.post<WaveWithEvents & { ralphOutput?: string; ralphError?: string }>(
      `/companies/${companyId}/waves`,
      data,
    ),

  get: (waveId: string) => api.get<WaveWithEvents>(`/waves/${waveId}`),

  getEvents: (waveId: string) => api.get<WaveEvent[]>(`/waves/${waveId}/events`),
};
