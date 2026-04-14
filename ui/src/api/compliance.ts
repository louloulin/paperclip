import { api } from "./client";

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
  timeline: Array<{ action: string; entityType: string; count: number; lastOccurred: string | null; agentIds: string[] }>;
  agents: Array<{ agentId: string; agentName: string; activityCount: number; lastActiveAt: string | null; operations: Array<{ action: string; count: number }> }>;
  gdpr?: {
    dataSubjectAccessRequests: number;
    dataProcessingActivities: Array<{ action: string; entityType: string; count: number; lastOccurred: string | null; agentIds: string[] }>;
    crossBorderTransfers: number;
    dataRetentionRecords: Array<{ entityType: string; recordCount: number; oldestRecord: string | null; newestRecord: string | null }>;
  };
  chinaDsl?: {
    importantDataOperations: number;
    crossBorderDataTransfers: number;
    dataLocalizationCompliance: Array<{ dataType: string; operationCount: number; locations: string[] }>;
    networkSecurityIncidents: number;
  };
}

export interface ComplianceReportType {
  type: string;
  label: string;
  labelEn: string;
  description: string;
}

export interface ReportTypesResponse {
  reportTypes: ComplianceReportType[];
}

export const complianceApi = {
  listReportTypes: (companyId: string) =>
    api.get<ReportTypesResponse>(`/companies/${companyId}/compliance-reports`),

  generate: (
    companyId: string,
    data: { reportType: string; from?: string; to?: string },
  ) =>
    api.post<ComplianceReport>(`/companies/${companyId}/compliance-reports`, data),

  exportUrl: (companyId: string, params: { reportType: string; from?: string; to?: string }) => {
    const searchParams = new URLSearchParams({ reportType: params.reportType });
    if (params.from) searchParams.set("from", params.from);
    if (params.to) searchParams.set("to", params.to);
    return `/api/companies/${companyId}/compliance-reports/export?${searchParams.toString()}`;
  },
};
