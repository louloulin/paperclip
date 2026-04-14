/**
 * T2.2: Budget Pre-check Tests
 *
 * 测试 RalphBudgetService 的预算预检功能：
 * 1. 预算预检服务初始化
 * 2. API URL 构建
 * 3. 软警告和硬停止结果解析
 * 4. 预算摘要生成
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RalphBudgetService, type RalphBudgetPrecheckResult } from "./budget.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("RalphBudgetService (T2.2)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.PAPERCLIP_API_KEY;
    delete process.env.PAPERCLIP_API_URL;
    delete process.env.PAPERCLIP_SERVER_URL;
  });

  describe("constructor", () => {
    it("should create service with company and agent IDs", () => {
      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect((service as any).companyId).toBe("company-123");
      expect((service as any).agentId).toBe("agent-456");
    });

    it("should use PAPERCLIP_API_KEY from env", () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect((service as any).apiKey).toBe("test-key");
    });

    it("should use explicit apiUrl over env", () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      process.env.PAPERCLIP_SERVER_URL = "http://localhost:3000";
      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
        apiUrl: "https://custom.api.com/api",
      });
      expect((service as any).apiUrl).toBe("https://custom.api.com/api");
    });

    it("should fall back to PAPERCLIP_SERVER_URL", () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      process.env.PAPERCLIP_SERVER_URL = "http://localhost:3101";
      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect((service as any).apiUrl).toBe("http://localhost:3101/api");
    });

    it("should use localhost:3000 as default", () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect((service as any).apiUrl).toBe("http://localhost:3000/api");
    });
  });

  describe("precheck()", () => {
    it("should return null when no API key", async () => {
      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      const result = await service.precheck();
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should call correct API endpoint", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ companyId: "company-123", agentId: "agent-456" }),
      });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      await service.precheck();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/companies/company-123/agents/agent-456/budget-precheck",
        expect.objectContaining({
          method: "GET",
          headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
        }),
      );
    });

    it("should include projectId as query param when provided", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ companyId: "company-123", agentId: "agent-456" }),
      });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      await service.precheck("project-789");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/companies/company-123/agents/agent-456/budget-precheck?projectId=project-789",
        expect.any(Object),
      );
    });

    it("should return null on non-ok response", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      mockFetch.mockResolvedValueOnce({ ok: false });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      const result = await service.precheck();
      expect(result).toBeNull();
    });

    it("should return null on fetch error", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      const result = await service.precheck();
      expect(result).toBeNull();
    });

    it("should parse and return budget precheck result", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      const mockResult: RalphBudgetPrecheckResult = {
        companyId: "company-123",
        agentId: "agent-456",
        projectId: null,
        checkedAt: "2026-04-14T00:00:00.000Z",
        companyPolicy: {
          policyId: "policy-1",
          scopeType: "company",
          scopeId: "company-123",
          scopeName: "Company",
          metric: "billed_cents",
          windowKind: "calendar_month_utc",
          amount: 100000,
          observedAmount: 75000,
          remainingAmount: 25000,
          utilizationPercent: 75,
          warnPercent: 70,
          hardStopEnabled: true,
          status: "warning",
          windowStart: "2026-04-01T00:00:00.000Z",
          windowEnd: "2026-05-01T00:00:00.000Z",
        },
        agentPolicy: null,
        projectPolicy: null,
        softWarnings: [
          {
            scopeType: "company",
            scopeId: "company-123",
            scopeName: "Company",
            metric: "billed_cents",
            utilizationPercent: 75,
            warnPercent: 70,
            amount: 100000,
            observedAmount: 75000,
            remainingAmount: 25000,
            message: "Company budget is 75% used (warning threshold: 70%)",
          },
        ],
        hardStop: null,
        hasWarnings: true,
        hasHardStop: false,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      const result = await service.precheck();

      expect(result).not.toBeNull();
      expect(result!.companyPolicy!.utilizationPercent).toBe(75);
      expect(result!.softWarnings).toHaveLength(1);
      expect(result!.hasWarnings).toBe(true);
      expect(result!.hasHardStop).toBe(false);
    });

    it("should detect hard stop status", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      const mockResult: RalphBudgetPrecheckResult = {
        companyId: "company-123",
        agentId: "agent-456",
        projectId: null,
        checkedAt: "2026-04-14T00:00:00.000Z",
        companyPolicy: {
          policyId: "policy-1",
          scopeType: "company",
          scopeId: "company-123",
          scopeName: "Company",
          metric: "billed_cents",
          windowKind: "calendar_month_utc",
          amount: 100000,
          observedAmount: 100000,
          remainingAmount: 0,
          utilizationPercent: 100,
          warnPercent: 80,
          hardStopEnabled: true,
          status: "hard_stop",
          windowStart: "2026-04-01T00:00:00.000Z",
          windowEnd: "2026-05-01T00:00:00.000Z",
        },
        agentPolicy: null,
        projectPolicy: null,
        softWarnings: [],
        hardStop: {
          scopeType: "company",
          scopeId: "company-123",
          scopeName: "Company",
          reason: "Company budget hard-stop exceeded (100% used). New work blocked.",
        },
        hasWarnings: false,
        hasHardStop: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      const result = await service.precheck();

      expect(result).not.toBeNull();
      expect(result!.hasHardStop).toBe(true);
      expect(result!.hardStop!.scopeType).toBe("company");
      expect(result!.hardStop!.reason).toContain("hard-stop exceeded");
    });
  });

  describe("hasActivePolicy()", () => {
    it("should return false when no API key", async () => {
      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect(await service.hasActivePolicy()).toBe(false);
    });

    it("should return false when API returns null result", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      mockFetch.mockResolvedValueOnce({ ok: false });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect(await service.hasActivePolicy()).toBe(false);
    });

    it("should return true when company policy exists", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            companyId: "company-123",
            agentId: "agent-456",
            companyPolicy: { policyId: "p1", amount: 100000 } as any,
            agentPolicy: null,
            projectPolicy: null,
          }),
      });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect(await service.hasActivePolicy()).toBe(true);
    });
  });

  describe("getBudgetSummary()", () => {
    it("should return null when no API key", async () => {
      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect(await service.getBudgetSummary()).toBeNull();
    });

    it("should return null when precheck fails", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      mockFetch.mockResolvedValueOnce({ ok: false });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      expect(await service.getBudgetSummary()).toBeNull();
    });

    it("should generate human-readable budget summary with policy info", async () => {
      process.env.PAPERCLIP_API_KEY = "test-key";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            companyId: "company-123",
            agentId: "agent-456",
            projectId: null,
            checkedAt: "2026-04-14T00:00:00.000Z",
            companyPolicy: {
              policyId: "p1",
              scopeType: "company",
              scopeId: "company-123",
              scopeName: "Company",
              metric: "billed_cents",
              windowKind: "calendar_month_utc",
              amount: 50000,
              observedAmount: 35000,
              remainingAmount: 15000,
              utilizationPercent: 70,
              warnPercent: 80,
              hardStopEnabled: true,
              status: "ok",
              windowStart: "2026-04-01T00:00:00.000Z",
              windowEnd: "2026-05-01T00:00:00.000Z",
            },
            agentPolicy: {
              policyId: "p2",
              scopeType: "agent",
              scopeId: "agent-456",
              scopeName: "Agent",
              metric: "billed_cents",
              windowKind: "calendar_month_utc",
              amount: 20000,
              observedAmount: 17000,
              remainingAmount: 3000,
              utilizationPercent: 85,
              warnPercent: 80,
              hardStopEnabled: true,
              status: "warning",
              windowStart: "2026-04-01T00:00:00.000Z",
              windowEnd: "2026-05-01T00:00:00.000Z",
            },
            projectPolicy: null,
            softWarnings: [
              {
                scopeType: "agent",
                scopeId: "agent-456",
                scopeName: "Agent",
                metric: "billed_cents",
                utilizationPercent: 85,
                warnPercent: 80,
                amount: 20000,
                observedAmount: 17000,
                remainingAmount: 3000,
                message: "Agent budget is 85% used (warning threshold: 80%)",
              },
            ],
            hardStop: null,
            hasWarnings: true,
            hasHardStop: false,
          }),
      });

      const service = new RalphBudgetService({
        companyId: "company-123",
        agentId: "agent-456",
      });
      const summary = await service.getBudgetSummary();

      expect(summary).not.toBeNull();
      expect(summary).toContain("Budget Status:");
      expect(summary).toContain("Company: 70% used");
      expect(summary).toContain("Agent: 85% used");
      expect(summary).toContain("soft warning");
      expect(summary).toContain("85% used");
    });
  });
});
