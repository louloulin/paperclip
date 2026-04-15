import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import {
  adapterMarketplaceApi,
  type AdapterListing,
} from "../api/adapter-marketplace";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Search,
  Star,
  Download,
  CheckCircle2,
  Plus,
  Package,
  X,
  ExternalLink,
  Github,
} from "lucide-react";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  const colors: Record<string, string> = {
    npm: "bg-red-100 text-red-700",
    github: "bg-gray-100 text-gray-700",
    local_path: "bg-green-100 text-green-700",
    url: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[sourceType] ?? "bg-gray-100 text-gray-700"}`}>
      {sourceType.toUpperCase()}
    </span>
  );
}

function AdapterCard({
  adapter,
  isInstalled,
  onInstall,
  isInstalling,
}: {
  adapter: AdapterListing;
  isInstalled: boolean;
  onInstall: (id: string) => void;
  isInstalling: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate">{adapter.name}</h3>
                <SourceBadge sourceType={adapter.source_type} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {adapter.description || "No description"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1">
            <StarRating rating={Math.round(Number(adapter.rating_avg))} />
            <span className="text-xs text-muted-foreground">({adapter.rating_count})</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="h-3 w-3" />
            {adapter.install_count}
          </div>
          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">
            v{adapter.version}
          </span>
          {adapter.author_name && (
            <span className="text-xs text-muted-foreground truncate">by {adapter.author_name}</span>
          )}
        </div>

        {adapter.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {adapter.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-accent rounded text-accent-foreground">
                {tag}
              </span>
            ))}
            {adapter.tags.length > 4 && (
              <span className="text-[10px] text-muted-foreground">+{adapter.tags.length - 4}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          {isInstalled ? (
            <Button variant="outline" size="sm" className="flex-1" disabled>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Installed
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onInstall(adapter.id)}
              disabled={isInstalling}
            >
              {isInstalling ? "Installing..." : "Install"}
            </Button>
          )}
          {adapter.repository_url && (
            <a href={adapter.repository_url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon-sm">
                <Github className="h-4 w-4" />
              </Button>
            </a>
          )}
          {adapter.homepage_url && (
            <a href={adapter.homepage_url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon-sm">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function PublishDialog({
  onClose,
  onPublish,
}: {
  onClose: () => void;
  onPublish: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    adapterType: "",
    slug: "",
    name: "",
    description: "",
    version: "1.0.0",
    sourceType: "npm",
    sourceLocator: "",
    authorName: "",
    homepageUrl: "",
    repositoryUrl: "",
    tags: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPublish({
      adapterType: form.adapterType,
      slug: form.slug || form.adapterType.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      name: form.name,
      description: form.description || undefined,
      version: form.version,
      sourceType: form.sourceType,
      sourceLocator: form.sourceLocator || undefined,
      authorName: form.authorName || undefined,
      homepageUrl: form.homepageUrl || undefined,
      repositoryUrl: form.repositoryUrl || undefined,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()) : [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-lg border border-border w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Publish Adapter</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Adapter Type *</label>
            <input
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.adapterType}
              onChange={(e) => setForm({ ...form, adapterType: e.target.value })}
              placeholder="e.g., my_custom_adapter"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <input
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Custom Adapter"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Slug</label>
            <input
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="auto-generated from adapter type"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Version</label>
              <input
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Source Type</label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.sourceType}
                onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
              >
                <option value="npm">npm</option>
                <option value="github">GitHub</option>
                <option value="local_path">Local Path</option>
                <option value="url">URL</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Source Locator (npm package / URL)</label>
            <input
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.sourceLocator}
              onChange={(e) => setForm({ ...form, sourceLocator: e.target.value })}
              placeholder="@scope/package-name"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Author Name</label>
            <input
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.authorName}
              onChange={(e) => setForm({ ...form, authorName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Homepage URL</label>
              <input
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.homepageUrl}
                onChange={(e) => setForm({ ...form, homepageUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Repository URL</label>
              <input
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.repositoryUrl}
                onChange={(e) => setForm({ ...form, repositoryUrl: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
            <input
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="ai, automation, nlp"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Publish</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdapterMarketplace() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"popular" | "rating" | "newest">("popular");
  const [showPublish, setShowPublish] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  React.useEffect(() => {
    setBreadcrumbs([{ label: "Adapter Marketplace" }]);
  }, [setBreadcrumbs]);

  const { data: adaptersData, isLoading } = useQuery({
    queryKey: ["adapter-marketplace", search, selectedTag, sortBy],
    queryFn: () =>
      adapterMarketplaceApi.list({
        q: search || undefined,
        tag: selectedTag || undefined,
        sort: sortBy === "popular" ? undefined : sortBy,
      }),
  });

  const { data: tags } = useQuery({
    queryKey: ["adapter-marketplace-tags"],
    queryFn: () => adapterMarketplaceApi.tags(),
  });

  const { data: stats } = useQuery({
    queryKey: ["adapter-marketplace-stats"],
    queryFn: () => adapterMarketplaceApi.stats(),
  });

  const { data: myInstalls } = useQuery({
    queryKey: ["adapter-marketplace-my-installs"],
    queryFn: () => adapterMarketplaceApi.myInstalls(),
  });

  const installedIds = new Set((myInstalls ?? []).map((a) => a.id));

  const installMutation = useMutation({
    mutationFn: (id: string) => adapterMarketplaceApi.install(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adapter-marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["adapter-marketplace-my-installs"] });
      pushToast({ title: "Adapter installed", tone: "success" });
      setInstallingId(null);
    },
    onError: () => {
      pushToast({ title: "Failed to install adapter", tone: "error" });
      setInstallingId(null);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => adapterMarketplaceApi.publish(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adapter-marketplace"] });
      pushToast({ title: "Adapter published", tone: "success" });
      setShowPublish(false);
    },
    onError: () => {
      pushToast({ title: "Failed to publish adapter", tone: "error" });
    },
  });

  if (isLoading) return <PageSkeleton />;

  const adapters = adaptersData?.adapters ?? [];

  return (
    <div className="mx-auto max-w-5xl py-6 px-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{stats?.totalAdapters ?? 0} Adapters</span>
        </div>
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{stats?.totalInstalls ?? 0} Installs</span>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm"
            placeholder="Search adapters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={sortBy === "popular" ? "default" : "outline"}
          size="sm"
          onClick={() => setSortBy("popular")}
        >
          Popular
        </Button>
        <Button
          variant={sortBy === "rating" ? "default" : "outline"}
          size="sm"
          onClick={() => setSortBy("rating")}
        >
          Top Rated
        </Button>
        <Button
          variant={sortBy === "newest" ? "default" : "outline"}
          size="sm"
          onClick={() => setSortBy("newest")}
        >
          Newest
        </Button>
        <Button size="sm" onClick={() => setShowPublish(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Publish
        </Button>
      </div>

      {/* Tag filters */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              !selectedTag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => setSelectedTag(null)}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag.name}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                selectedTag === tag.name
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
              onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
            >
              {tag.name} ({tag.count})
            </button>
          ))}
        </div>
      )}

      {/* Adapter grid */}
      {adapters.length === 0 ? (
        <EmptyState
          icon={Package}
          message="No adapters found. Be the first to publish an adapter to the marketplace."
          action="Publish Adapter"
          onAction={() => setShowPublish(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {adapters.map((adapter) => (
            <AdapterCard
              key={adapter.id}
              adapter={adapter}
              isInstalled={installedIds.has(adapter.id)}
              onInstall={(id) => {
                setInstallingId(id);
                installMutation.mutate(id);
              }}
              isInstalling={installingId === adapter.id}
            />
          ))}
        </div>
      )}

      {/* My installs section */}
      {myInstalls && myInstalls.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Installed Adapters ({myInstalls.length})
          </h2>
          <div className="space-y-2">
            {myInstalls.map((adapter: AdapterListing & { installedAt?: string; installedVersion?: string }) => (
              <div key={adapter.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{adapter.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">v{adapter.installedVersion || adapter.version}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {adapter.installedAt ? new Date(adapter.installedAt).toLocaleDateString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Publish dialog */}
      {showPublish && (
        <PublishDialog
          onClose={() => setShowPublish(false)}
          onPublish={(data) => publishMutation.mutate(data)}
        />
      )}
    </div>
  );
}
