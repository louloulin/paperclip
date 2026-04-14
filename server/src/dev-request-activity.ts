const DEFAULT_DEV_REQUEST_QUIET_WINDOW_MS = 10_000;

let activeRequestCount = 0;
let lastRequestFinishedAtMs: number | null = null;

function normalizeRequestPath(pathname: string | null | undefined): string {
  const value = String(pathname ?? "").trim();
  if (!value) return "";
  const [pathOnly] = value.split("?", 1);
  return pathOnly || "";
}

export function shouldTrackDevRequestActivity(pathname: string | null | undefined): boolean {
  if (!process.env.PAPERCLIP_DEV_SERVER_STATUS_FILE) return false;
  const normalized = normalizeRequestPath(pathname);
  if (!normalized) return false;
  if (normalized === "/api/health") return false;
  return true;
}

export function beginDevRequestActivity(pathname: string | null | undefined): (() => void) | null {
  if (!shouldTrackDevRequestActivity(pathname)) return null;

  activeRequestCount += 1;
  let finished = false;

  return () => {
    if (finished) return;
    finished = true;
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    lastRequestFinishedAtMs = Date.now();
  };
}

export type DevRequestActivityStatus = {
  activeRequestCount: number;
  recentRequestActivity: boolean;
  lastRequestFinishedAt: string | null;
  quietWindowMs: number;
};

export function getDevRequestActivityStatus(opts?: {
  nowMs?: number;
  quietWindowMs?: number;
}): DevRequestActivityStatus {
  const quietWindowMs = Math.max(0, opts?.quietWindowMs ?? DEFAULT_DEV_REQUEST_QUIET_WINDOW_MS);
  const nowMs = opts?.nowMs ?? Date.now();
  const lastRequestFinishedAt =
    lastRequestFinishedAtMs === null ? null : new Date(lastRequestFinishedAtMs).toISOString();
  const recentRequestActivity =
    activeRequestCount > 0
    || (lastRequestFinishedAtMs !== null && nowMs - lastRequestFinishedAtMs < quietWindowMs);

  return {
    activeRequestCount,
    recentRequestActivity,
    lastRequestFinishedAt,
    quietWindowMs,
  };
}

export function resetDevRequestActivityForTest(): void {
  activeRequestCount = 0;
  lastRequestFinishedAtMs = null;
}
