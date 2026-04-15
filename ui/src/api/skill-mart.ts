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

// ── Stripe Payment API ─────────────────────────────────────────────────────────

export interface StripeCheckoutResponse {
  sessionId: string;
  sessionUrl?: string;
  paymentSessionId: string;
  amount: number;
  currency: string;
  platformFee: number;
  sellerAmount: number;
  alreadyPurchased?: boolean;
  purchaseId?: string;
}

export interface StripePurchase {
  id: string;
  skillId: string;
  skillName?: string;
  skillSlug?: string;
  amount: string;
  currency: string;
  platformFee: string;
  status: "active" | "refunded";
  purchasedAt: string;
}

export interface StripeSale {
  id: string;
  skillId: string;
  skillName?: string;
  amount: string;
  currency: string;
  platformFee: string;
  sellerAmount: string;
  status: string;
  paidAt?: string;
}

export interface SellerStatus {
  onboarded: boolean;
  status?: string;
  payoutsEnabled?: boolean;
  country?: string;
  demo?: boolean;
}

export const stripeApi = {
  /** Create a Stripe Checkout session for a paid skill */
  createCheckout(skillId: string, successUrl?: string, cancelUrl?: string): Promise<StripeCheckoutResponse> {
    return api.post("/stripe/checkout", { skillId, successUrl, cancelUrl });
  },

  /** Confirm a demo-mode payment (no real Stripe key needed) */
  confirmDemo(paymentSessionId: string): Promise<{ success: boolean; purchaseId: string; skillId: string }> {
    return api.post("/stripe/confirm-demo", { paymentSessionId });
  },

  /** Check if current company already purchased a skill */
  checkPurchase(skillId: string): Promise<{ purchased: boolean; purchaseId: string | null }> {
    return api.get(`/stripe/purchases/check/${skillId}`);
  },

  /** List all purchases for current company */
  listPurchases(): Promise<StripePurchase[]> {
    return api.get("/stripe/purchases");
  },

  /** List all sales (as seller) for current company */
  listSales(): Promise<StripeSale[]> {
    return api.get("/stripe/sales");
  },

  /** Get seller account status */
  getSellerStatus(): Promise<SellerStatus> {
    return api.get("/stripe/seller/status");
  },

  /** Onboard as a seller with Stripe Connect */
  onboardSeller(country = "US", returnUrl?: string): Promise<{ accountId: string; onboardingUrl?: string; status: string; demo?: boolean }> {
    return api.post("/stripe/seller/onboard", { country, return_url: returnUrl });
  },
};
