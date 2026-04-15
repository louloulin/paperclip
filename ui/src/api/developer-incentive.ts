const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }
  return res.json();
}

export const developerIncentiveApi = {
  // Profile
  getProfile: () => request<any>("/developer-incentive/profile"),
  updateProfile: (data: { payoutMethod?: string; payoutDetails?: Record<string, string> }) =>
    request<any>("/developer-incentive/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Earnings
  getEarnings: (period?: string) =>
    request<any>(`/developer-incentive/earnings${period ? `?period=${period}` : ""}`),
  getEarningsHistory: (months: number = 6) =>
    request<any[]>(`/developer-incentive/earnings/history?months=${months}`),

  // Payout
  createPayoutRequest: (data: { amount: number; currency?: string; method?: string; notes?: string }) =>
    request<any>("/developer-incentive/payout-request", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPayoutRequests: (status?: string) =>
    request<any[]>(`/developer-incentive/payout-requests${status ? `?status=${status}` : ""}`),
  cancelPayoutRequest: (id: string) =>
    request<any>(`/developer-incentive/payout-requests/${id}/cancel`, {
      method: "PATCH",
    }),

  // Leaderboard
  getLeaderboard: (limit: number = 10) =>
    request<any[]>(`/developer-incentive/leaderboard?limit=${limit}`),

  // Tiers
  getTiers: () => request<any[]>("/developer-incentive/tiers"),

  // Stats
  getStats: () => request<any>("/developer-incentive/stats"),
};
