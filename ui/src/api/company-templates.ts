import { api } from "./client";

export interface CompanyTemplate {
  id: string;
  publisherId: string;
  publisherName: string | null;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  industry: string;
  icon: string | null;
  version: string;
  config: Record<string, unknown>;
  tags: string[];
  isPaid: boolean;
  price: string;
  priceCurrency: string;
  downloadCount: number;
  ratingAvg: string;
  ratingCount: number;
  status: string;
  isOfficial: boolean;
  source: "builtin" | "community";
  createdAt: string;
  updatedAt: string;
}

export interface TemplateReview {
  id: string;
  templateId: string;
  companyId: string;
  rating: number;
  comment: string | null;
  status: string;
  createdAt: string;
}

export interface TemplateInstall {
  id: string;
  templateId: string;
  companyId: string;
  version: string;
  configOverrides: Record<string, unknown>;
  installedAt: string;
}

export interface TemplateCategories {
  categories: Array<{ id: string; name: string; icon: string }>;
  industries: string[];
}

export const companyTemplatesApi = {
  list: async (params?: { q?: string; category?: string; industry?: string; sort?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set("q", params.q);
    if (params?.category) searchParams.set("category", params.category);
    if (params?.industry) searchParams.set("industry", params.industry);
    if (params?.sort) searchParams.set("sort", params.sort);
    const qs = searchParams.toString();
    return api.get<CompanyTemplate[]>(`/company-templates${qs ? `?${qs}` : ""}`);
  },

  getCategories: async () => {
    return api.get<TemplateCategories>("/company-templates/categories");
  },

  get: async (id: string) => {
    return api.get<CompanyTemplate>(`/company-templates/${id}`);
  },

  publish: async (data: {
    slug: string;
    name: string;
    description?: string;
    category?: string;
    industry?: string;
    config?: Record<string, unknown>;
    tags?: string[];
    isPaid?: boolean;
    price?: number;
  }) => {
    return api.post<CompanyTemplate>("/company-templates/publish", data);
  },

  install: async (id: string, configOverrides?: Record<string, unknown>) => {
    return api.post<{ installId: string; config: Record<string, unknown>; version: string }>(
      `/company-templates/${id}/install`,
      { configOverrides },
    );
  },

  getReviews: async (id: string) => {
    return api.get<TemplateReview[]>(`/company-templates/${id}/reviews`);
  },

  createReview: async (id: string, data: { rating: number; comment?: string }) => {
    return api.post<TemplateReview>(`/company-templates/${id}/reviews`, data);
  },

  getMyInstalls: async () => {
    return api.get<TemplateInstall[]>("/company-templates/my/installs");
  },

  update: async (id: string, data: Partial<{ name: string; description: string; config: Record<string, unknown>; tags: string[] }>) => {
    return api.patch<CompanyTemplate>(`/company-templates/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<{ success: boolean }>(`/company-templates/${id}`);
  },
};
