import { api } from "./client";

export interface AdapterListing {
  id: string;
  company_id: string;
  adapter_type: string;
  slug: string;
  name: string;
  description: string | null;
  markdown: string;
  tags: string[];
  version: string;
  source_type: string;
  source_locator: string | null;
  author_name: string | null;
  author_url: string | null;
  homepage_url: string | null;
  repository_url: string | null;
  config_schema: Record<string, unknown> | null;
  compatible_adapters: string[];
  install_count: number;
  rating_avg: string;
  rating_count: number;
  is_paid: boolean;
  price: string | null;
  price_currency: string;
  status: string;
  company_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdapterReview {
  id: string;
  adapter_id: string;
  company_id: string;
  rating: number;
  comment: string | null;
  status: string;
  company_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdapterMarketplaceStats {
  totalAdapters: number;
  totalInstalls: number;
  topAdapters: Array<{
    id: string;
    name: string;
    adapter_type: string;
    install_count: number;
    rating_avg: string;
  }>;
}

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export const adapterMarketplaceApi = {
  list: (params?: { q?: string; tag?: string; sort?: string; source_type?: string; limit?: number; offset?: number }) =>
    api.get<{ adapters: AdapterListing[]; total: number; limit: number; offset: number }>(
      `/adapter-marketplace${qs(params as Record<string, string | number | undefined>)}`,
    ),

  get: (id: string) =>
    api.get<AdapterListing>(`/adapter-marketplace/${id}`),

  tags: () =>
    api.get<Array<{ name: string; count: number }>>("/adapter-marketplace/tags"),

  categories: () =>
    api.get<Array<{ source_type: string; count: number }>>("/adapter-marketplace/categories"),

  stats: () =>
    api.get<AdapterMarketplaceStats>("/adapter-marketplace/stats"),

  publish: (data: Record<string, unknown>) =>
    api.post<AdapterListing>("/adapter-marketplace/publish", data),

  my: () =>
    api.get<AdapterListing[]>("/adapter-marketplace/my"),

  myInstalls: () =>
    api.get<AdapterListing[]>("/adapter-marketplace/my/installs"),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<AdapterListing>(`/adapter-marketplace/${id}`, data),

  archive: (id: string) =>
    api.delete<{ success: boolean }>(`/adapter-marketplace/${id}`),

  install: (id: string) =>
    api.post<{ success: boolean; installId: string }>(`/adapter-marketplace/${id}/install`, {}),

  reviews: (id: string) =>
    api.get<AdapterReview[]>(`/adapter-marketplace/${id}/reviews`),

  submitReview: (id: string, data: { rating: number; comment?: string }) =>
    api.post<AdapterReview>(`/adapter-marketplace/${id}/reviews`, data),
};
