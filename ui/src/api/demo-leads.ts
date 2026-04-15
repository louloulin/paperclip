import { api } from "./client";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "demo_scheduled"
  | "demo_in_progress"
  | "negotiating"
  | "won"
  | "lost"
  | "churned";

export type DemoRequestStatus =
  | "requested"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "no_show"
  | "cancelled";

export interface DemoLead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  companySize: string | null;
  industry: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  source: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referralCode: string | null;
  status: LeadStatus;
  priority: "low" | "medium" | "high" | "urgent";
  leadScore: number;
  hotLead: boolean;
  assignedToUserId: string | null;
  assignedAt: string | null;
  lastContactedAt: string | null;
  nextFollowupAt: string | null;
  followupCount: number;
  notes: string | null;
  lostReason: string | null;
  wonDetails: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoRequest {
  id: string;
  leadId: string;
  companyId: string | null;
  demoType: "standard" | "enterprise" | "technical" | "poc";
  useCase: string | null;
  teamSize: string | null;
  preferredDuration: string | null;
  scheduledAt: string | null;
  durationMinutes: number | null;
  meetingUrl: string | null;
  calendarEventId: string | null;
  status: DemoRequestStatus;
  outcome: string | null;
  completionNotes: string | null;
  feedbackScore: number | null;
  nextSteps: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DemoCompany {
  id: string;
  leadId: string;
  demoRequestId: string | null;
  companyId: string;
  companyName: string;
  isTrial: boolean;
  trialExpiresAt: string | null;
  demoTemplate: string;
  sampleDataEnabled: boolean;
  agentsCreated: number;
  tasksCompleted: number;
  apiCalls: number;
  activeDays: number;
  lastActiveAt: string | null;
  convertedToPaid: boolean;
  convertedAt: string | null;
  paidPlan: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface PipelineStats {
  pipeline: { status: string; count: number }[];
  total: number;
  hotLeads: number;
  won: number;
}

export interface LeadCreate {
  companyName: string;
  contactName?: string;
  contactEmail: string;
  contactPhone?: string;
  companySize?: "startup" | "small" | "medium" | "large" | "enterprise";
  industry?: string;
  website?: string;
  country?: string;
  city?: string;
  source?: "manual" | "website" | "referral" | "linkedin" | "cold_outreach" | "event" | "partner";
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referralCode?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  notes?: string;
}

export interface DemoRequestCreate {
  demoType?: "standard" | "enterprise" | "technical" | "poc";
  useCase?: string;
  teamSize?: string;
  preferredDuration?: "30min" | "60min" | "90min";
  scheduledAt?: string;
  durationMinutes?: number;
  meetingUrl?: string;
  status?: DemoRequestStatus;
  outcome?: "interested" | "very_interested" | "needs_review" | "not_interested";
  completionNotes?: string;
  feedbackScore?: number;
  nextSteps?: string;
}

export interface DemoCompanyCreate {
  demoRequestId?: string;
  companyId: string;
  companyName: string;
  demoTemplate?: "default" | "enterprise" | "developer" | "poc";
  sampleDataEnabled?: boolean;
  trialDays?: number;
}

export const demoLeadsApi = {
  list: (params?: {
    status?: LeadStatus;
    source?: string;
    priority?: string;
    hotLead?: boolean;
    assignedToUserId?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.source) query.set("source", params.source);
    if (params?.priority) query.set("priority", params.priority);
    if (params?.hotLead) query.set("hotLead", "true");
    if (params?.assignedToUserId) query.set("assignedToUserId", params.assignedToUserId);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return api.get<{ leads: DemoLead[]; total: number; limit: number; offset: number }>(
      `/demo-leads${qs ? `?${qs}` : ""}`,
    );
  },

  get: (id: string) =>
    api.get<DemoLead>(`/demo-leads/${id}`),

  create: (data: LeadCreate) =>
    api.post<DemoLead>("/demo-leads", data),

  update: (id: string, data: Partial<LeadCreate>) =>
    api.patch<DemoLead>(`/demo-leads/${id}`, data),

  updateStatus: (
    id: string,
    data: {
      status?: LeadStatus;
      lostReason?: string;
      wonDetails?: string;
      nextFollowupAt?: string;
    },
  ) => api.patch<DemoLead>(`/demo-leads/${id}/status`, data),

  delete: (id: string) =>
    api.delete<void>(`/demo-leads/${id}`),

  getPipeline: () =>
    api.get<PipelineStats>("/demo-leads/pipeline"),

  getNextFollowups: () =>
    api.get<{ leads: DemoLead[] }>("/demo-leads/next-followups"),

  getSources: () =>
    api.get<{ sources: { source: string; count: number }[] }>("/demo-leads/sources"),

  // Demo Requests
  getRequests: (leadId: string) =>
    api.get<{ requests: DemoRequest[] }>(`/demo-leads/${leadId}/requests`),

  createRequest: (leadId: string, data: DemoRequestCreate) =>
    api.post<DemoRequest>(`/demo-leads/${leadId}/requests`, data),

  getRequest: (id: string) =>
    api.get<DemoRequest>(`/demo-requests/${id}`),

  updateRequest: (id: string, data: Partial<DemoRequestCreate & { status: DemoRequestStatus }>) =>
    api.patch<DemoRequest>(`/demo-requests/${id}`, data),

  // Demo Companies
  getDemoCompanies: (leadId: string) =>
    api.get<{ demoCompanies: DemoCompany[] }>(`/demo-leads/${leadId}/demo-companies`),

  createDemoCompany: (leadId: string, data: DemoCompanyCreate) =>
    api.post<DemoCompany>(`/demo-leads/${leadId}/demo-companies`, data),

  updateDemoCompany: (
    id: string,
    data: Partial<{
      agentsCreated: number;
      tasksCompleted: number;
      apiCalls: number;
      activeDays: number;
      convertedToPaid: boolean;
      paidPlan: string;
    }>,
  ) => api.patch<DemoCompany>(`/demo-companies/${id}`, data),
};
