import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@paperclipai/db";
import { healthRoutes } from "../routes/health.js";
import * as devServerStatus from "../dev-server-status.js";
import * as devRequestActivity from "../dev-request-activity.js";
import { serverVersion } from "../version.js";

describe("GET /health", () => {
  beforeEach(() => {
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue(undefined);
    vi.spyOn(devRequestActivity, "getDevRequestActivityStatus").mockReturnValue({
      activeRequestCount: 0,
      recentRequestActivity: false,
      lastRequestFinishedAt: null,
      quietWindowMs: 10_000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with status ok", async () => {
    const devServerStatus = await import("../dev-server-status.js");
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue(undefined);
    const { healthRoutes } = await import("../routes/health.js");
    const app = express();
    app.use("/health", healthRoutes());

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", version: serverVersion });
  });

  it("returns 200 when the database probe succeeds", async () => {
    const devServerStatus = await import("../dev-server-status.js");
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue(undefined);
    const { healthRoutes } = await import("../routes/health.js");
    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as Db;
    const app = express();
    app.use("/health", healthRoutes(db));

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", version: serverVersion });
  });

  it("returns 503 when the database probe fails", async () => {
    const devServerStatus = await import("../dev-server-status.js");
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue(undefined);
    const { healthRoutes } = await import("../routes/health.js");
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    } as unknown as Db;
    const app = express();
    app.use("/health", healthRoutes(db));

    const res = await request(app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: "unhealthy",
      version: serverVersion,
      error: "database_unreachable",
    });
  });

  it("surfaces recent request activity in dev health state", async () => {
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue({
      dirty: true,
      lastChangedAt: "2026-03-20T12:00:00.000Z",
      changedPathCount: 1,
      changedPathsSample: ["server/src/app.ts"],
      pendingMigrations: [],
      lastRestartAt: "2026-03-20T11:30:00.000Z",
    });
    vi.spyOn(devRequestActivity, "getDevRequestActivityStatus").mockReturnValue({
      activeRequestCount: 0,
      recentRequestActivity: true,
      lastRequestFinishedAt: "2026-03-20T12:00:08.000Z",
      quietWindowMs: 10_000,
    });
    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            then: vi.fn(async () => [{ count: 0 }]),
          })),
        })),
      })),
    } as unknown as Db;
    const app = express();
    app.use("/health", healthRoutes(db));

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.devServer).toMatchObject({
      activeRunCount: 0,
      activeRequestCount: 0,
      recentRequestActivity: true,
      lastRequestFinishedAt: "2026-03-20T12:00:08.000Z",
      waitingForIdle: true,
    });
  });
});
