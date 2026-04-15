import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { developerIncentiveApi } from "../api/developer-incentive";
import {
  DollarSign,
  TrendingUp,
  Award,
  Wallet,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  BarChart3,
  Users,
} from "lucide-react";

const tierColors: Record<string, string> = {
  bronze: "bg-amber-700 text-white",
  silver: "bg-gray-400 text-white",
  gold: "bg-yellow-500 text-white",
  platinum: "bg-purple-600 text-white",
};

const TIER_CONFIG: Record<string, { minEarnings: number; bonusRate: number; maxPayoutPerMonth: number }> = {
  bronze: { minEarnings: 0, bonusRate: 0, maxPayoutPerMonth: 500 },
  silver: { minEarnings: 1000, bonusRate: 0.02, maxPayoutPerMonth: 2000 },
  gold: { minEarnings: 5000, bonusRate: 0.05, maxPayoutPerMonth: 10000 },
  platinum: { minEarnings: 10000, bonusRate: 0.10, maxPayoutPerMonth: Infinity },
};

const tierLabels: Record<string, string> = {
  bronze: "Bronze 青铜",
  silver: "Silver 白银",
  gold: "Gold 黄金",
  platinum: "Platinum 铂金",
};

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-yellow-600 bg-yellow-50", label: "Pending" },
  processing: { icon: Loader2, color: "text-blue-600 bg-blue-50", label: "Processing" },
  completed: { icon: CheckCircle, color: "text-green-600 bg-green-50", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-600 bg-red-50", label: "Failed" },
  cancelled: { icon: XCircle, color: "text-gray-600 bg-gray-50", label: "Cancelled" },
};

export function DeveloperEarnings() {
  const [activeTab, setActiveTab] = useState<"overview" | "earnings" | "payouts" | "leaderboard">("overview");
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["developer-profile"],
    queryFn: () => developerIncentiveApi.getProfile(),
  });

  const { data: earnings } = useQuery({
    queryKey: ["developer-earnings"],
    queryFn: () => developerIncentiveApi.getEarnings(),
  });

  const { data: history } = useQuery({
    queryKey: ["developer-earnings-history"],
    queryFn: () => developerIncentiveApi.getEarningsHistory(6),
  });

  const { data: payouts } = useQuery({
    queryKey: ["developer-payouts"],
    queryFn: () => developerIncentiveApi.getPayoutRequests(),
  });

  const { data: leaderboard } = useQuery({
    queryKey: ["developer-leaderboard"],
    queryFn: () => developerIncentiveApi.getLeaderboard(10),
  });

  const { data: stats } = useQuery({
    queryKey: ["developer-stats"],
    queryFn: () => developerIncentiveApi.getStats(),
  });

  const { data: tiers } = useQuery({
    queryKey: ["developer-tiers"],
    queryFn: () => developerIncentiveApi.getTiers(),
  });

  const payoutMutation = useMutation({
    mutationFn: (amount: number) =>
      developerIncentiveApi.createPayoutRequest({ amount, currency: "USD", method: "stripe" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["developer-earnings"] });
      setShowPayoutDialog(false);
      setPayoutAmount("");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => developerIncentiveApi.cancelPayoutRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-payouts"] });
    },
  });

  if (profileLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tier = profile?.tier ?? "bronze";
  const tierInfo = profile?.tierInfo;

  const tabs = [
    { id: "overview" as const, label: "Overview 总览", icon: BarChart3 },
    { id: "earnings" as const, label: "Earnings 收益", icon: TrendingUp },
    { id: "payouts" as const, label: "Payouts 提现", icon: Wallet },
    { id: "leaderboard" as const, label: "Leaderboard 排行", icon: Users },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Developer Earnings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            开发者激励计划 — 85% 收入分成 · Tier 等级奖励
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${tierColors[tier] ?? "bg-gray-200"}`}
          >
            {tierLabels[tier] ?? tier}
          </span>
          <button
            onClick={() => setShowPayoutDialog(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
          >
            <Wallet className="h-4 w-4" />
            Request Payout
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Available Balance"
          value={`$${Number(earnings?.availableBalance ?? 0).toFixed(2)}`}
          subtitle="可提现余额"
          icon={DollarSign}
          color="text-green-600"
        />
        <StatCard
          title="Total Earnings"
          value={`$${Number(earnings?.netEarnings ?? 0).toFixed(2)}`}
          subtitle={`开发者分成 ${earnings?.developerShareRate ? (earnings.developerShareRate * 100).toFixed(0) : 85}%`}
          icon={TrendingUp}
          color="text-blue-600"
        />
        <StatCard
          title="Tier Bonus"
          value={`$${Number(earnings?.tierBonus ?? 0).toFixed(2)}`}
          subtitle={`额外奖励 ${(earnings?.tierBonusRate ?? 0) * 100}%`}
          icon={Award}
          color="text-purple-600"
        />
        <StatCard
          title="Sales Count"
          value={String(earnings?.salesCount ?? 0)}
          subtitle="销售次数"
          icon={BarChart3}
          color="text-orange-600"
        />
      </div>

      {/* Tier Progress */}
      {tierInfo && tierInfo.nextTier && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              {tierLabels[tier]} → {tierLabels[tierInfo.nextTier]}
            </span>
            <span className="text-sm text-muted-foreground">
              还需 ${(tierInfo.earningsToNextTier ?? 0).toFixed(2)} 升级
            </span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{
                width: `${Math.min(100, (Number(profile?.totalEarnings ?? 0) / (TIER_CONFIG[tierInfo.nextTier]?.minEarnings ?? 1000)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Revenue Share Info */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Revenue Share 分成模式</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">85%</div>
                <div className="text-sm text-muted-foreground mt-1">Developer 开发者</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-muted-foreground">15%</div>
                <div className="text-sm text-muted-foreground mt-1">Platform 平台</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  +{earnings?.tierBonusRate ? (earnings.tierBonusRate * 100).toFixed(0) : "0"}%
                </div>
                <div className="text-sm text-muted-foreground mt-1">Tier Bonus 等级奖励</div>
              </div>
            </div>
          </div>

          {/* Platform Stats */}
          {stats && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Platform Stats 平台统计</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold">{stats.totalDevelopers}</div>
                  <div className="text-sm text-muted-foreground">开发者</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">${Number(stats.totalEarnings).toFixed(0)}</div>
                  <div className="text-sm text-muted-foreground">总收益</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">${Number(stats.totalPaidOut).toFixed(0)}</div>
                  <div className="text-sm text-muted-foreground">已支付</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">${Number(stats.pendingPayoutAmount).toFixed(0)}</div>
                  <div className="text-sm text-muted-foreground">待支付</div>
                </div>
              </div>
            </div>
          )}

          {/* Tier Info */}
          {tiers && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Tier System 等级系统</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {tiers.map((t: any) => (
                  <div
                    key={t.tier}
                    className={`rounded-lg p-4 border ${
                      t.tier === tier ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${tierColors[t.tier]}`}>
                        {tierLabels[t.tier]}
                      </span>
                      {t.tier === tier && (
                        <span className="text-xs text-primary font-medium">Current</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>收益要求: ${t.minEarnings.toLocaleString()}</div>
                      <div>额外奖励: +{(t.bonusRate * 100).toFixed(0)}%</div>
                      <div>
                        月提现上限: {t.maxPayoutPerMonth ? `$${t.maxPayoutPerMonth.toLocaleString()}` : "无限制"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "earnings" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Earnings History 收益历史</h3>
          {history && history.length > 0 ? (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Month</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Revenue</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: any) => (
                    <tr key={h.period} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm font-medium">{h.period}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">
                        ${Number(h.revenue).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">{h.salesCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>暂无收益记录</p>
              <p className="text-sm mt-1">发布付费技能开始赚取收入</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "payouts" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Payout History 提现记录</h3>
          {payouts && payouts.length > 0 ? (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Method</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p: any) => {
                    const sc = statusConfig[p.status] ?? statusConfig.pending;
                    const StatusIcon = sc.icon;
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 text-sm">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium">
                          ${Number(p.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm capitalize">{p.method}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${sc.color}`}
                          >
                            <StatusIcon className={`h-3 w-3 ${p.status === "processing" ? "animate-spin" : ""}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.status === "pending" && (
                            <button
                              onClick={() => cancelMutation.mutate(p.id)}
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>暂无提现记录</p>
              <p className="text-sm mt-1">点击上方按钮申请提现</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "leaderboard" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Developer Leaderboard 开发者排行</h3>
          {leaderboard && leaderboard.length > 0 ? (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground w-16">Rank</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Developer</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Tier</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Earnings</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Sales</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Skills</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((dev: any) => (
                    <tr
                      key={dev.companyId}
                      className={`border-b border-border last:border-0 ${
                        dev.companyId === profile?.companyId ? "bg-primary/5" : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-bold">
                        {dev.rank <= 3 ? (
                          <span className="text-lg">
                            {dev.rank === 1 ? "🥇" : dev.rank === 2 ? "🥈" : "🥉"}
                          </span>
                        ) : (
                          `#${dev.rank}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {dev.companyId === profile?.companyId ? "You" : `Developer #${dev.rank}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${tierColors[dev.tier] ?? ""}`}
                        >
                          {tierLabels[dev.tier] ?? dev.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                        ${Number(dev.totalEarnings).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">{dev.totalSales}</td>
                      <td className="px-4 py-3 text-sm text-right">{dev.totalSkills}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>暂无排行数据</p>
            </div>
          )}
        </div>
      )}

      {/* Payout Dialog */}
      {showPayoutDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Request Payout 申请提现</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Available Balance 可用余额
                </label>
                <div className="text-2xl font-bold text-green-600">
                  ${Number(earnings?.availableBalance ?? 0).toFixed(2)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Amount 金额 (USD)
                </label>
                <input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="Minimum $10.00"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  min="10"
                  step="0.01"
                />
              </div>
              {payoutMutation.isError && (
                <p className="text-sm text-red-600">
                  {(payoutMutation.error as Error).message}
                </p>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowPayoutDialog(false);
                    setPayoutAmount("");
                  }}
                  className="px-4 py-2 border border-border rounded-md text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const amount = parseFloat(payoutAmount);
                    if (amount > 0) payoutMutation.mutate(amount);
                  }}
                  disabled={payoutMutation.isPending || !payoutAmount}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {payoutMutation.isPending ? "Processing..." : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof DollarSign;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
    </div>
  );
}

