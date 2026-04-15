import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ExternalLink } from "lucide-react";

interface ApiStats {
  totalEndpoints: number;
  byMethod: Record<string, number>;
  byTag: Record<string, number>;
  tags: number;
}

export function ApiDocs() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/api-docs/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const methodColors: Record<string, string> = {
    GET: "bg-green-100 text-green-800",
    POST: "bg-blue-100 text-blue-800",
    PATCH: "bg-yellow-100 text-yellow-800",
    PUT: "bg-orange-100 text-orange-800",
    DELETE: "bg-red-100 text-red-800",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with stats */}
      <div className="border-b border-border px-6 py-4 bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
            <div>
              <h1 className="text-xl font-semibold">API Documentation</h1>
              <p className="text-sm text-muted-foreground">
                OpenAPI 3.0 交互式文档 — 自动发现所有 API 端点
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/api-docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              全屏 Swagger UI
            </a>
          </div>
        </div>

        {/* Stats bar */}
        {!loading && stats && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              {stats.totalEndpoints} 个端点
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {stats.tags} 个分组
            </Badge>
            {Object.entries(stats.byMethod).map(([method, count]) => (
              <span
                key={method}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                  methodColors[method] ?? "bg-gray-100 text-gray-800"
                }`}
              >
                {method} ({count})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Embedded Swagger UI */}
      <div className="flex-1">
        <iframe
          ref={iframeRef}
          src="/api/api-docs"
          title="API Documentation"
          className="w-full h-full border-0"
          style={{ minHeight: "calc(100vh - 200px)" }}
        />
      </div>
    </div>
  );
}
