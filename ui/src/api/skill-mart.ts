import { api } from "./client";

export interface SkillMartSkill {
  id: string;
  companyId: string;
  companyName?: string;
  skillKey: string;
  slug: string;
  name: string;
  description?: string;
  markdown?: string;
  tags: string[];
  version: string;
  sourceType?: string;
  sourceLocator?: string;
  downloadCount: number;
  ratingAvg: number;
  ratingCount: number;
  isPaid: boolean;
  price: number;
  priceCurrency: string;
  status: "draft" | "published" | "archived";
  reviewStatus?: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface SkillMartReview {
  id: string;
  companyId: string;
  companyName?: string;
  rating: number;
  comment?: string;
  status: string;
  createdAt: string;
}

export interface SkillMartListResponse {
  skills: SkillMartSkill[];
  total: number;
  limit: number;
  offset: number;
}

export interface SkillMartTag {
  name: string;
  count: number;
}

export const skillMartApi = {
  listSkills(params?: {
    q?: string;
    tag?: string;
    sort?: string;
    limit?: number;
    offset?: number;
  }): Promise<SkillMartListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set("q", params.q);
    if (params?.tag) searchParams.set("tag", params.tag);
    if (params?.sort) searchParams.set("sort", params.sort);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    return api.get(`/skill-mart?${searchParams}`);
  },

  getMySkills(): Promise<SkillMartSkill[]> {
    return api.get("/skill-mart/my");
  },

  getTags(): Promise<SkillMartTag[]> {
    return api.get("/skill-mart/tags");
  },

  getSkill(id: string): Promise<SkillMartSkill> {
    return api.get(`/skill-mart/${id}`);
  },

  publishSkill(data: {
    skillKey: string;
    slug: string;
    name: string;
    description?: string;
    markdown?: string;
    tags?: string[];
    version?: string;
    sourceType?: string;
    sourceLocator?: string;
    isPaid?: boolean;
    price?: number;
    priceCurrency?: string;
  }): Promise<SkillMartSkill> {
    return api.post("/skill-mart/publish", data);
  },

  updateSkill(id: string, data: Partial<SkillMartSkill>): Promise<SkillMartSkill> {
    return api.patch(`/skill-mart/${id}`, data);
  },

  deleteSkill(id: string): Promise<{ success: boolean }> {
    return api.delete(`/skill-mart/${id}`);
  },

  getReviews(skillId: string, params?: { limit?: number; offset?: number }): Promise<SkillMartReview[]> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    return api.get(`/skill-mart/${skillId}/reviews?${searchParams}`);
  },

  submitReview(skillId: string, data: { rating: number; comment?: string }): Promise<SkillMartReview> {
    return api.post(`/skill-mart/${skillId}/reviews`, data);
  },

  downloadSkill(skillId: string): Promise<{ success: boolean; downloadId: string }> {
    return api.post(`/skill-mart/${skillId}/download`, {});
  },
};
