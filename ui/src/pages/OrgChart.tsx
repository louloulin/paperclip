import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { Download, Network, Upload } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import { getAdapterLabel } from "../adapters/adapter-display-registry";

// Layout constants
const CARD_W = 200;
const CARD_H = 100;
const GAP_X = 32;
const GAP_Y = 80;
const PADDING = 60;

// ── Tree layout types ───────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  x: number;
  y: number;
  children: LayoutNode[];
}

// ── Layout algorithm ────────────────────────────────────────────────────

/** Compute the width each subtree needs. */
function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

/** Recursively assign x,y positions. */
function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.reports) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + CARD_H + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    x: x + (totalW - CARD_W) / 2,
    y,
    children: layoutChildren,
  };
}

/** Layout all root nodes side by side. */
function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];

  const totalW = roots.reduce((sum, r) => sum + subtreeWidth(r), 0);
  const gaps = (roots.length - 1) * GAP_X;
  let x = PADDING;
  const y = PADDING;

  const result: LayoutNode[] = [];
  for (const root of roots) {
    const w = subtreeWidth(root);
    result.push(layoutTree(root, x, y));
    x += w + GAP_X;
  }

  return result;
}

/** Flatten layout tree to list of nodes. */
function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Collect all parent→child edges. */
function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

// ── Status dot colors ──────────────────────────────────────────────────

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
  pending_approval: "#c084fc",
};
const defaultDotColor = "#a3a3a3";

const roleLabels: Record<string, string> = AGENT_ROLE_LABELS;
function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

// ── Main component ──────────────────────────────────────────────────────

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart" }]);
  }, [setBreadcrumbs]);

  // Layout computation
  const layout = useMemo(() => layoutForest(orgTree ?? []), [orgTree]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);

  // Compute SVG bounds
  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  // Pan & zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Card drag state
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const dragCardOffset = useRef({ x: 0, y: 0 });
  const isDraggingCard = useRef(false);

  // Move mutation
  const moveMutation = useMutation({
    mutationFn: ({ agentId, newReportsTo }: { agentId: string; newReportsTo: string | null }) =>
      agentsApi.moveReportsTo(selectedCompanyId!, agentId, newReportsTo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
    },
    onError: (err) => {
      console.error("Move failed:", err);
    },
  });

  // Convert screen coordinates to chart coordinates
  const screenToChart = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // Check if a chart coordinate is inside a card
  const cardAtPoint = useCallback((chartX: number, chartY: number): string | null => {
    for (const node of allNodes) {
      if (
        chartX >= node.x &&
        chartX <= node.x + CARD_W &&
        chartY >= node.y &&
        chartY <= node.y + CARD_H
      ) {
        return node.id;
      }
    }
    return null;
  }, [allNodes]);

  // Container mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-org-card]")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingCard.current) {
      const chartPos = screenToChart(e.clientX, e.clientY);
      setGhostPos({
        x: chartPos.x - dragCardOffset.current.x,
        y: chartPos.y - dragCardOffset.current.y,
      });
      const hitId = cardAtPoint(chartPos.x, chartPos.y);
      setDropTargetId(hitId && hitId !== draggingCardId ? hitId : null);
      return;
    }
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
  }, [isPanning, draggingCardId, screenToChart, cardAtPoint]);

  const handleMouseUp = useCallback(() => {
    if (isDraggingCard.current && dropTargetId && draggingCardId) {
      moveMutation.mutate({ agentId: draggingCardId, newReportsTo: dropTargetId });
    }
    isDraggingCard.current = false;
    setDraggingCardId(null);
    setDropTargetId(null);
    setIsPanning(false);
  }, [draggingCardId, dropTargetId, moveMutation]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);
    const scale = newZoom / zoom;
    setPan({ x: mouseX - scale * (mouseX - pan.x), y: mouseY - scale * (mouseY - pan.y) });
    setZoom(newZoom);
  }, [zoom, pan]);

  // Card drag start
  const handleCardMouseDown = useCallback((e: React.MouseEvent, cardId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const node = allNodes.find(n => n.id === cardId);
    if (!node) return;
    const chartPos = screenToChart(e.clientX, e.clientY);
    dragCardOffset.current = { x: chartPos.x - node.x, y: chartPos.y - node.y };
    isDraggingCard.current = true;
    setDraggingCardId(cardId);
    setGhostPos({ x: node.x, y: node.y });
  }, [allNodes, screenToChart]);

  // Center the chart on first load
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    hasInitialized.current = true;
    const container = containerRef.current;
    const scaleX = (container.clientWidth - 40) / bounds.width;
    const scaleY = (container.clientHeight - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    setZoom(fitZoom);
    setPan({
      x: (container.clientWidth - bounds.width * fitZoom) / 2,
      y: (container.clientHeight - bounds.height * fitZoom) / 2,
    });
  }, [allNodes, bounds]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a company to view the org chart." />;
  }
  if (isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }
  if (orgTree && orgTree.length === 0) {
    return <EmptyState icon={Network} message="No organizational hierarchy defined." />;
  }

  const draggingNode = draggingCardId ? allNodes.find(n => n.id === draggingCardId) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Link to="/company/import">
            <Button variant="outline" size="sm">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import company
            </Button>
          </Link>
          <Link to="/company/export">
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export company
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Drag agents to reorganize reporting structure
        </p>
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className="w-full flex-1 min-h-0 overflow-hidden relative bg-muted/20 border border-border rounded-lg"
        style={{ cursor: isDraggingCard.current ? "grabbing" : isPanning ? "grabbing" : "default" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
            onClick={() => {
              const container = containerRef.current;
              if (!container) return;
              const newZoom = Math.min(zoom * 1.2, 2);
              const cx = container.clientWidth / 2, cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
              setZoom(newZoom);
            }}
            aria-label="Zoom in"
          >+</button>
          <button
            className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
            onClick={() => {
              const container = containerRef.current;
              if (!container) return;
              const newZoom = Math.max(zoom * 0.8, 0.2);
              const cx = container.clientWidth / 2, cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
              setZoom(newZoom);
            }}
            aria-label="Zoom out"
          >&minus;</button>
          <button
            className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-[10px] hover:bg-accent transition-colors"
            onClick={() => {
              const container = containerRef.current;
              if (!container) return;
              const scaleX = (container.clientWidth - 40) / bounds.width;
              const scaleY = (container.clientHeight - 40) / bounds.height;
              const fitZoom = Math.min(scaleX, scaleY, 1);
              setZoom(fitZoom);
              setPan({ x: (container.clientWidth - bounds.width * fitZoom) / 2, y: (container.clientHeight - bounds.height * fitZoom) / 2 });
            }}
            title="Fit to screen"
            aria-label="Fit chart"
          >Fit</button>
        </div>

        {/* SVG edge layer */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {edges.map(({ parent, child }) => {
              const x1 = parent.x + CARD_W / 2, y1 = parent.y + CARD_H;
              const x2 = child.x + CARD_W / 2, y2 = child.y;
              const midY = (y1 + y2) / 2;
              const isHighlighted = (
                (draggingCardId === parent.id && dropTargetId === child.id) ||
                (draggingCardId === child.id && dropTargetId === parent.id)
              );
              return (
                <path
                  key={`${parent.id}-${child.id}`}
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke={isHighlighted ? "#8b5cf6" : "var(--border)"}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                />
              );
            })}
          </g>
        </svg>

        {/* Card layer */}
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          {/* Ghost card during drag */}
          {draggingCardId && draggingNode && (
            <div
              className="absolute pointer-events-none opacity-50 rounded-lg border-2 border-dashed border-violet-400 bg-violet-100 dark:bg-violet-900"
              style={{ left: ghostPos.x, top: ghostPos.y, width: CARD_W, minHeight: CARD_H }}
            />
          )}

          {allNodes.map((node) => {
            if (node.id === draggingCardId) return null; // Hide original while dragging
            const agent = agentMap.get(node.id);
            const dotColor = statusDotColor[node.status] ?? defaultDotColor;
            const isDropTarget = node.id === dropTargetId;
            const isPending = agent?.status === "pending_approval";

            return (
              <div
                key={node.id}
                data-org-card
                className={`
                  absolute rounded-lg border-2 transition-[box-shadow,border-color] duration-100 select-none
                  ${isDropTarget
                    ? "border-violet-400 border-dashed shadow-lg shadow-violet-200 dark:shadow-violet-900 cursor-pointer"
                    : "border-border bg-card hover:shadow-md hover:border-foreground/20 cursor-grab active:cursor-grabbing"
                  }
                  ${isPending ? "opacity-70" : ""}
                `}
                style={{ left: node.x, top: node.y, width: CARD_W, minHeight: CARD_H }}
                onMouseDown={(e) => handleCardMouseDown(e, node.id)}
                onClick={() => !draggingCardId && navigate(agent ? agentUrl(agent) : `/agents/${node.id}`)}
              >
                <div className="flex items-center px-4 py-3 gap-3">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                      <AgentIcon icon={agent?.icon} className="h-4.5 w-4.5 text-foreground/70" />
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                      style={{ backgroundColor: dotColor }}
                    />
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-sm font-semibold text-foreground leading-tight">
                      {node.name}
                      {isPending && " ⏳"}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                      {agent?.title ?? roleLabel(node.role)}
                    </span>
                    {agent && (
                      <span className="text-[10px] text-muted-foreground/60 font-mono leading-tight mt-1">
                        {getAdapterLabel(agent.adapterType)}
                      </span>
                    )}
                  </div>
                </div>
                {/* Drop indicator */}
                {isDropTarget && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xs font-medium text-violet-600 dark:text-violet-300 bg-violet-100 dark:bg-violet-900 px-2 py-1 rounded">
                      Drop here
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
