import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import {
  companyTemplatesApi,
  type CompanyTemplate,
  type TemplateInstall,
} from "../api/company-templates";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  Search,
  Star,
  Download,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Zap,
  Filter,
  Building2,
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

function TemplateCard({
  template,
  installed,
  onInstall,
  isInstalling,
}: {
  template: CompanyTemplate;
  installed: boolean;
  onInstall: (id: string) => void;
  isInstalling: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="text-2xl flex-shrink-0 mt-0.5">{template.icon || "🏢"}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                {template.isOfficial && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium flex-shrink-0">
                    Official
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1">
            <StarRating rating={Math.round(Number(template.ratingAvg))} />
            <span className="text-xs text-muted-foreground">({template.ratingCount})</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="h-3 w-3" />
            {template.downloadCount}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-2">
          {template.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-accent rounded-md text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {template.source === "builtin" ? "AgentCorp OS" : template.publisherName}
          </span>
          {installed ? (
            <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Installed
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onInstall(template.id)}
              disabled={isInstalling}
            >
              <Zap className="h-3.5 w-3.5" />
              {isInstalling ? "Installing..." : "Use Template"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateDetailPanel({
  template,
  installed,
  onInstall,
  isInstalling,
  onClose,
}: {
  template: CompanyTemplate;
  installed: boolean;
  onInstall: (id: string) => void;
  isInstalling: boolean;
  onClose: () => void;
}) {
  const config = template.config as {
    agents?: Array<{ name: string; role: string; skills?: string[]; reportsTo?: string }>;
    departments?: Array<{ name: string; description?: string; members?: string[] }>;
    skills?: Array<{ key: string; name: string; source?: string }>;
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border shadow-xl z-50 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-3xl">{template.icon || "🏢"}</span>
            <div>
              <h2 className="font-bold text-lg">{template.name}</h2>
              <p className="text-xs text-muted-foreground">by {template.source === "builtin" ? "AgentCorp OS" : template.publisherName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            ✕
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">{template.description}</p>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-1">
            <StarRating rating={Math.round(Number(template.ratingAvg))} />
            <span className="text-sm font-medium ml-1">{Number(template.ratingAvg).toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Download className="h-4 w-4" />
            {template.downloadCount} installs
          </div>
        </div>

        {config?.agents && config.agents.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> Agents ({config.agents.length})
            </h3>
            <div className="space-y-1.5">
              {config.agents.map((agent) => (
                <div key={agent.name} className="flex items-center justify-between bg-accent/50 rounded-md px-3 py-2">
                  <div>
                    <span className="text-sm font-medium">{agent.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({agent.role})</span>
                  </div>
                  {agent.reportsTo && (
                    <span className="text-[10px] text-muted-foreground">→ {agent.reportsTo}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {config?.departments && config.departments.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold text-sm mb-2">Departments ({config.departments.length})</h3>
            <div className="space-y-1.5">
              {config.departments.map((dept) => (
                <div key={dept.name} className="bg-accent/50 rounded-md px-3 py-2">
                  <span className="text-sm font-medium">{dept.name}</span>
                  {dept.description && <p className="text-xs text-muted-foreground">{dept.description}</p>}
                  {dept.members && (
                    <p className="text-xs text-muted-foreground mt-0.5">Members: {dept.members.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {config?.skills && config.skills.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-sm mb-2">Included Skills ({config.skills.length})</h3>
            <div className="flex flex-wrap gap-1.5">
              {config.skills.map((skill) => (
                <span key={skill.key} className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md">
                  {skill.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {installed ? (
          <Button variant="outline" className="w-full gap-2" disabled>
            <CheckCircle2 className="h-4 w-4" />
            Already Installed
          </Button>
        ) : (
          <Button
            className="w-full gap-2"
            onClick={() => onInstall(template.id)}
            disabled={isInstalling}
          >
            <Zap className="h-4 w-4" />
            {isInstalling ? "Installing..." : "Use This Template"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function CompanyTemplates() {
  const { company } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CompanyTemplate | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  React.useEffect(() => {
    setBreadcrumbs([{ label: "Template Store" }]);
  }, [setBreadcrumbs]);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["company-templates", search, selectedCategory],
    queryFn: () =>
      companyTemplatesApi.list({
        q: search || undefined,
        category: selectedCategory || undefined,
      }),
    enabled: !!company,
  });

  const { data: installs } = useQuery({
    queryKey: ["template-installs"],
    queryFn: () => companyTemplatesApi.getMyInstalls(),
    enabled: !!company,
  });

  const { data: categories } = useQuery({
    queryKey: ["template-categories"],
    queryFn: () => companyTemplatesApi.getCategories(),
  });

  const installMutation = useMutation({
    mutationFn: (templateId: string) => companyTemplatesApi.install(templateId),
    onMutate: (id) => setInstallingId(id),
    onSuccess: () => {
      toast.toast({ title: "Template installed successfully" });
      queryClient.invalidateQueries({ queryKey: ["template-installs"] });
      setSelectedTemplate(null);
    },
    onError: (err: Error) => {
      toast.toast({ title: "Install failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => setInstallingId(null),
  });

  const installedIds = new Set((installs ?? []).map((i) => i.templateId));

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" />
              Template Store
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pre-built company templates — one-click to create your AI team
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                !selectedCategory ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"
              }`}
              onClick={() => setSelectedCategory(null)}
            >
              All
            </button>
            {(categories?.categories ?? []).map((cat) => (
              <button
                key={cat.id}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent"
                }`}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!templates || templates.length === 0 ? (
          <EmptyState
            icon={<LayoutGrid className="h-8 w-8" />}
            title="No templates found"
            description="Try adjusting your search or filters"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                installed={installedIds.has(template.id)}
                onInstall={(id) => installMutation.mutate(id)}
                isInstalling={installingId === template.id}
              />
            ))}
          </div>
        )}
      </div>

      {selectedTemplate && (
        <TemplateDetailPanel
          template={selectedTemplate}
          installed={installedIds.has(selectedTemplate.id)}
          onInstall={(id) => installMutation.mutate(id)}
          isInstalling={installingId === selectedTemplate.id}
          onClose={() => setSelectedTemplate(null)}
        />
      )}
    </div>
  );
}
