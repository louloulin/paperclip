import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  skillMartApi,
  stripeApi,
  type SkillMartSkill,
  type SkillMartReview,
  type SkillMartTag,
} from "../api/skill-mart";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { useToast } from "../context/ToastContext";
import {
  Store,
  Star,
  Download,
  Search,
  Plus,
  Tag,
  Users,
  Clock,
  X,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trash2,
  Edit2,
  MessageSquare,
  StarHalf,
  CreditCard,
  ShoppingCart,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const RATING_LABELS = ["很差", "较差", "一般", "良好", "优秀"];
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
};

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${size > 12 ? "h-3 w-3" : "h-2.5 w-2.5"} ${
            n <= Math.round(rating)
              ? "fill-yellow-400 text-yellow-400"
              : n - 0.5 <= rating
              ? "fill-yellow-400/50 text-yellow-400"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

function RatingBadge({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return <span className="text-xs text-gray-400">暂无评分</span>;
  return (
    <div className="flex items-center gap-1">
      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
      <span className="text-xs font-medium">{Number(avg).toFixed(1)}</span>
      <span className="text-xs text-gray-400">({count})</span>
    </div>
  );
}

// ── Publish Dialog ─────────────────────────────────────────────────────────────

interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function PublishDialog({ open, onClose, onSuccess }: PublishDialogProps) {
  const [form, setForm] = useState({
    skillKey: "",
    slug: "",
    name: "",
    description: "",
    tags: "",
    version: "1.0.0",
    isPaid: false,
    price: 0,
    priceCurrency: "USD",
  });
  const { pushToast } = useToast();

  const publish = useMutation({
    mutationFn: skillMartApi.publishSkill,
    onSuccess: () => {
      pushToast({ title: "技能发布成功！" });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      pushToast({ title: err.message || "发布失败" });
    },
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    publish.mutate({
      skillKey: form.skillKey,
      slug: form.slug || form.skillKey.toLowerCase().replace(/\s+/g, "-"),
      name: form.name,
      description: form.description || undefined,
      tags: form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      version: form.version,
      isPaid: form.isPaid,
      price: form.price,
      priceCurrency: form.priceCurrency,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">发布技能到市场</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">技能 Key *</label>
            <input
              value={form.skillKey}
              onChange={(e) => setForm({ ...form, skillKey: e.target.value })}
              placeholder="e.g. my-company/my-skill"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">技能名称 *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. 代码审查助手"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="简要描述这个技能的功能..."
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">标签（逗号分隔）</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="e.g. react, typescript, ui"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">版本</label>
              <input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end gap-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPaid}
                  onChange={(e) => setForm({ ...form, isPaid: e.target.checked })}
                  className="rounded"
                />
                付费
              </label>
              {form.isPaid && (
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    className="w-20 rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={form.priceCurrency}
                    onChange={(e) => setForm({ ...form, priceCurrency: e.target.value })}
                    className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
                  >
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={publish.isPending}>
              {publish.isPending ? "发布中..." : "发布到市场"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Review Dialog ──────────────────────────────────────────────────────────────

interface ReviewDialogProps {
  open: boolean;
  skill: SkillMartSkill | null;
  onClose: () => void;
}

  const ReviewDialog = ({ open, skill, onClose }: ReviewDialogProps) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const submit = useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment: string }) =>
      skillMartApi.submitReview(skill!.id, { rating, comment }),
    onSuccess: () => {
      pushToast({ title: "评价提交成功！" });
      queryClient.invalidateQueries({ queryKey: ["skill-mart-reviews", skill?.id] });
      queryClient.invalidateQueries({ queryKey: ["skill-mart"] });
      onClose();
    },
    onError: (err: Error) => pushToast({ title: err.message || "提交失败" }),
  });

  if (!open || !skill) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">评价: {skill.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">评分</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={`p-1 rounded ${n <= rating ? "text-yellow-400" : "text-gray-300"}`}
                >
                  <Star className={`h-7 w-7 ${n <= rating ? "fill-yellow-400" : ""}`} />
                </button>
              ))}
              <span className="ml-2 self-center text-sm text-gray-600">
                {RATING_LABELS[rating - 1]}
              </span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">评论（可选）</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="分享你的使用体验..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              onClick={() => submit.mutate({ rating, comment })}
              disabled={submit.isPending}
            >
              {submit.isPending ? "提交中..." : "提交评价"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────

interface PaymentModalProps {
  open: boolean;
  skill: SkillMartSkill;
  onClose: () => void;
  onPurchased: () => void;
}

function PaymentModal({ open, skill, onClose, onPurchased }: PaymentModalProps) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const sym = CURRENCY_SYMBOLS[skill.priceCurrency] ?? "$";
  const price = Number(skill.price) || 0;
  const platformFee = Math.round(price * 0.15 * 100) / 100;
  const sellerAmount = Math.round((price - platformFee) * 100) / 100;

  const checkout = useMutation({
    mutationFn: () => stripeApi.createCheckout(skill.id),
    onSuccess: async (data) => {
      if (data.alreadyPurchased) {
        pushToast({ title: "已购买此技能，无需重复购买！" });
        onPurchased();
        onClose();
        return;
      }
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      } else {
        // Demo mode — confirm payment
        const confirmed = await stripeApi.confirmDemo(data.paymentSessionId);
        if (confirmed.success) {
          pushToast({ title: `购买成功！${sym}${price} 已支付` });
          onPurchased();
          onClose();
        }
      }
    },
    onError: (err: Error) => pushToast({ title: err.message || "支付失败" }),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-purple-600" />
            <h2 className="text-base font-semibold">购买技能</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Skill info */}
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">{skill.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">v{skill.version} · {skill.companyName ?? "匿名发布者"}</p>
            </div>
            <span className="text-lg font-bold text-purple-700">{sym}{price}</span>
          </div>

          {/* Payment breakdown */}
          <div className="space-y-2 rounded-lg border p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">商品金额</span>
              <span>{sym}{price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>平台服务费（15%）</span>
              <span>-{sym}{platformFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>实付金额</span>
              <span className="text-purple-700">{sym}{price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>开发者实收</span>
              <span>{sym}{sellerAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Demo mode notice */}
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>演示模式：无需真实 Stripe 密钥，点击"立即购买"即可模拟支付完成。</span>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              取消
            </Button>
            <Button
              className="flex-1 bg-purple-600 hover:bg-purple-700"
              disabled={checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              <ShoppingCart className="mr-1 h-3.5 w-3.5" />
              {checkout.isPending ? "处理中..." : `立即购买 ${sym}${price}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Skill Detail Panel ─────────────────────────────────────────────────────────

interface SkillDetailPanelProps {
  skill: SkillMartSkill;
  onClose: () => void;
  onReview: () => void;
  onPurchase: () => void;
  hasPurchased: boolean;
}

function SkillDetailPanel({ skill, onClose, onReview, onPurchase, hasPurchased }: SkillDetailPanelProps) {
  const { data: reviews } = useQuery({
    queryKey: ["skill-mart-reviews", skill.id],
    queryFn: () => skillMartApi.getReviews(skill.id),
  });
  const { pushToast } = useToast();
  const download = useMutation({
    mutationFn: () => skillMartApi.downloadSkill(skill.id),
    onSuccess: () => pushToast({ title: "下载成功！" }),
    onError: (err: Error) => pushToast({ title: err.message || "下载失败" }),
  });
  const sym = CURRENCY_SYMBOLS[skill.priceCurrency] ?? "$";

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-gray-400" />
          <h2 className="text-base font-semibold">{skill.name}</h2>
          {skill.isPaid && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
              {sym}{skill.price} {skill.priceCurrency}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <RatingBadge avg={Number(skill.ratingAvg)} count={skill.ratingCount} />
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Download className="h-3 w-3" />
            {skill.downloadCount} 下载
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Tag className="h-3 w-3" />
            v{skill.version}
          </div>
          {skill.companyName && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="h-3 w-3" />
              {skill.companyName}
            </div>
          )}
        </div>

        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {skill.description && (
          <p className="text-sm text-gray-600">{skill.description}</p>
        )}

        <div className="flex gap-2">
          {skill.isPaid && !hasPurchased ? (
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={onPurchase}>
              <CreditCard className="mr-1 h-3 w-3" />
              购买 {sym}{skill.price}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => download.mutate()}
              disabled={download.isPending}
            >
              {hasPurchased && skill.isPaid ? (
                <>
                  <CheckCircle className="mr-1 h-3 w-3" />
                  已购买 · 下载
                </>
              ) : (
                <>
                  <Download className="mr-1 h-3 w-3" />
                  {download.isPending ? "记录中..." : "下载使用"}
                </>
              )}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onReview}>
            <MessageSquare className="mr-1 h-3 w-3" />
            评价
          </Button>
        </div>

        {/* Reviews */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">用户评价</h3>
          {!reviews || reviews.length === 0 ? (
            <p className="text-xs text-gray-400">暂无评价，成为第一个评价者吧！</p>
          ) : (
            <div className="space-y-3">
              {reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="rounded-lg border bg-gray-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{review.companyName ?? "匿名"}</span>
                      <StarRating rating={review.rating} size={10} />
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-xs text-gray-600">{review.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main SkillMart Page ───────────────────────────────────────────────────────

export function SkillMart() {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [sort, setSort] = useState("downloads");
  const [selectedSkill, setSelectedSkill] = useState<SkillMartSkill | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [purchasedSkillIds, setPurchasedSkillIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["skill-mart", search, activeTag, sort],
    queryFn: () =>
      skillMartApi.listSkills({
        q: search || undefined,
        tag: activeTag || undefined,
        sort: sort === "downloads" ? undefined : sort,
        limit: 50,
      }),
  });

  const { data: tags } = useQuery({
    queryKey: ["skill-mart-tags"],
    queryFn: skillMartApi.getTags,
  });

  const skills = data?.skills ?? [];
  const popularTags = tags?.slice(0, 10) ?? [];

  const mySkills = useQuery({
    queryKey: ["skill-mart-my"],
    queryFn: skillMartApi.getMySkills,
  });

  const { data: purchases } = useQuery({
    queryKey: ["stripe-purchases"],
    queryFn: stripeApi.listPurchases,
  });

  // Sync purchased skill IDs
  const purchasedSet = new Set(purchases?.map((p) => p.skillId) ?? []);
  const hasPurchased = selectedSkill ? purchasedSet.has(selectedSkill.id) : false;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">SkillMart</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              发现并分享 AI 技能 — {data?.total ?? 0} 个技能已发布
            </p>
          </div>
          <Button size="sm" onClick={() => setShowPublish(true)}>
            <Plus className="mr-1 h-3 w-3" />
            发布技能
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索技能名称、描述..."
              className="h-8 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-8 rounded-lg border border-gray-200 px-2 text-sm"
          >
            <option value="downloads">🔥 最多下载</option>
            <option value="rating">⭐ 最高评分</option>
            <option value="newest">🕐 最新发布</option>
          </select>
          {activeTag && (
            <button
              onClick={() => setActiveTag("")}
              className="flex h-8 items-center gap-1 rounded-lg bg-blue-100 px-3 text-sm text-blue-700"
            >
              <Tag className="h-3 w-3" />
              {activeTag}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Tags */}
        {popularTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {popularTags.map((tag) => (
              <button
                key={tag.name}
                onClick={() => setActiveTag(activeTag === tag.name ? "" : tag.name)}
                className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                  activeTag === tag.name
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {tag.name} ({tag.count})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Skills Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : skills.length === 0 ? (
            <EmptyState
              icon={Store}
              message="成为第一个在市场上发布技能的人吧！"
              action="发布技能"
              onAction={() => setShowPublish(true)}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  onClick={() => setSelectedSkill(skill)}
                  className={`group cursor-pointer rounded-xl border bg-white p-4 transition-all hover:shadow-md ${
                    selectedSkill?.id === skill.id ? "border-blue-400 ring-1 ring-blue-400" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="truncate text-sm font-semibold">{skill.name}</h3>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {skill.companyName ?? "匿名发布者"}
                      </p>
                    </div>
                    {skill.isPaid && (
                      <span className="ml-2 shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {CURRENCY_SYMBOLS[skill.priceCurrency] ?? "$"}
                        {skill.price}
                      </span>
                    )}
                  </div>

                  {skill.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-gray-500">{skill.description}</p>
                  )}

                  {skill.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {skill.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
                        >
                          {tag}
                        </span>
                      ))}
                      {skill.tags.length > 3 && (
                        <span className="text-xs text-gray-400">+{skill.tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <RatingBadge avg={Number(skill.ratingAvg)} count={skill.ratingCount} />
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-0.5">
                        <Download className="h-2.5 w-2.5" />
                        {skill.downloadCount}
                      </span>
                      <span>v{skill.version}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedSkill && (
          <div className="w-80 flex-shrink-0 overflow-y-auto border-l bg-gray-50 p-4">
            <SkillDetailPanel
              skill={selectedSkill}
              onClose={() => setSelectedSkill(null)}
              onReview={() => setShowReview(true)}
              onPurchase={() => setShowPayment(true)}
              hasPurchased={hasPurchased}
            />
          </div>
        )}
      </div>

      {/* My Skills Section */}
      {mySkills.data && mySkills.data.length > 0 && (
        <div className="flex-shrink-0 border-t bg-white px-6 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">我发布的技能</h3>
          <div className="flex flex-wrap gap-2">
            {mySkills.data.map((s) => (
              <span
                key={s.id}
                className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
              >
                {s.name} ({s.status})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* My Purchases Section */}
      {purchases && purchases.length > 0 && (
        <div className="flex-shrink-0 border-t bg-white px-6 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">我购买的技能</h3>
          <div className="flex flex-wrap gap-2">
            {purchases.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-xs text-green-700"
              >
                <CheckCircle className="h-3 w-3" />
                {p.skillName ?? "未知技能"} · {CURRENCY_SYMBOLS[p.currency] ?? "$"}{Number(p.amount).toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <PublishDialog
        open={showPublish}
        onClose={() => setShowPublish(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["skill-mart"] });
          queryClient.invalidateQueries({ queryKey: ["skill-mart-my"] });
        }}
      />
      <ReviewDialog
        open={showReview}
        skill={selectedSkill}
        onClose={() => setShowReview(false)}
      />
      {selectedSkill && (
        <PaymentModal
          open={showPayment}
          skill={selectedSkill}
          onClose={() => setShowPayment(false)}
          onPurchased={() => {
            queryClient.invalidateQueries({ queryKey: ["stripe-purchases"] });
          }}
        />
      )}
    </div>
  );
}
