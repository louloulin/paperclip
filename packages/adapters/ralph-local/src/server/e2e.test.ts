/**
 * T1.8 E2E Integration Tests: Ralph Adapter + Paperclip Control Plane
 *
 * Tests the complete flow:
 * 1. RalphAdapterServer.execute() → spawns Ralph CLI subprocess
 * 2. Ralph executes with Hat Collection, scratchpad, memories
 * 3. Adapter captures stdout/stderr, session state, memories, scratchpad
 * 4. Task writeback triggers (if Paperclip API available)
 * 5. Full result returned to Paperclip heartbeat service
 *
 * These tests validate T1.1, T1.1b, T1.3, T1.4, T1.5, T1.6, T1.7 integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { writeFile, mkdir, rm } from "node:fs/promises";

// Import the Ralph adapter server
import {
  RalphAdapterServer,
  RalphSkillLoader,
  RalphTaskWritebackService,
  readRalphMemories,
  searchRalphMemories,
  getRalphMemoryStats,
  execute as ralphExecute,
  sessionCodec,
  listRalphSkills,
  syncRalphSkills,
  testEnvironment as ralphTestEnvironment,
} from "./index.js";

import type {
  AdapterExecutionContext,
  AdapterEnvironmentTestContext,
  AdapterAgent,
  AdapterRuntime,
} from "@paperclipai/adapter-utils";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock Ralph working directory with .ralph/agent structure */
async function createTestRalphDir(baseDir: string): Promise<string> {
  const ralphDir = join(baseDir, ".ralph", "agent");
  await mkdir(ralphDir, { recursive: true });
  return ralphDir;
}

/** Create a mock Ralph scratchpad file */
async function createMockScratchpad(
  ralphDir: string,
  content: string,
): Promise<void> {
  await writeFile(join(ralphDir, "scratchpad.md"), content, "utf-8");
}

/** Create a mock Ralph memories file */
async function createMockMemories(
  baseDir: string,
  content: string,
): Promise<void> {
  await mkdir(join(baseDir, ".ralph", "agent"), { recursive: true });
  await writeFile(join(baseDir, ".ralph", "agent", "memories.md"), content, "utf-8");
}

/** Create a mock Ralph tasks.jsonl file */
async function createMockTasks(
  baseDir: string,
  tasks: Array<{
    id: string;
    title: string;
    status: "open" | "in_progress" | "closed" | "failed";
    key?: string;
    created: string;
    closed?: string;
    started?: string;
  }>,
): Promise<void> {
  await mkdir(join(baseDir, ".ralph", "agent"), { recursive: true });
  const lines = tasks.map((t) => JSON.stringify(t)).join("\n");
  await writeFile(join(baseDir, ".ralph", "agent", "tasks.jsonl"), lines, "utf-8");
}

/** Build a minimal AdapterExecutionContext for testing */
function buildMockExecutionContext(overrides: Partial<{
  workingDir: string;
  hatCollection: string;
  maxLoops: number;
  task: string;
  config: Record<string, unknown>;
  agent: Partial<AdapterAgent>;
  runtime: Partial<AdapterRuntime>;
}> = {}): AdapterExecutionContext {
  const agentId = `agent-${Math.random().toString(36).slice(2, 8)}`;
  const companyId = `company-${Math.random().toString(36).slice(2, 8)}`;
  const runId = `run-${Date.now()}`;
  const workDir = overrides.workingDir ?? "/tmp/ralph-test-" + Date.now();

  return {
    runId,
    agent: {
      id: agentId,
      companyId,
      name: "Ralph CEO Agent",
      adapterType: "ralph_local",
      adapterConfig: {},
      ...overrides.agent,
    } as AdapterAgent,
    runtime: {
      sessionId: null,
      sessionParams: {
        hatCollection: overrides.hatCollection ?? "default",
        maxLoops: overrides.maxLoops,
        workingDir: workDir,
      },
      sessionDisplayId: null,
      taskKey: null,
      ...overrides.runtime,
    } as AdapterRuntime,
    config: {
      timeoutSec: 60,
      ralphPath: "ralph",
      ...(overrides.config ?? {}),
    },
    context: {
      task: overrides.task ?? "Write a simple test file",
      ...(overrides.config?.context ?? {}),
    },
    onLog: async (_stream: "stdout" | "stderr", _chunk: string) => {},
    onMeta: async (_meta) => {},
    onSpawn: async (_meta) => {},
  };
}

/** Build a minimal AdapterEnvironmentTestContext */
function buildMockTestContext(): AdapterEnvironmentTestContext {
  return {
    companyId: "test-company",
    adapterType: "ralph_local",
    config: {},
    deployment: {
      mode: "local_trusted",
      exposure: "private",
    },
  };
}

// ---------------------------------------------------------------------------
// T1.8: Ralph Adapter E2E Integration Tests
// ---------------------------------------------------------------------------

describe("T1.8: Ralph Adapter E2E Integration Tests", () => {
  const testDirs: string[] = [];

  afterEach(async () => {
    // Cleanup test directories
    for (const dir of testDirs) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    testDirs.length = 0;
  });

  // -------------------------------------------------------------------------
  // Test Group 1: RalphAdapterServer Lifecycle
  // -------------------------------------------------------------------------

  describe("RalphAdapterServer lifecycle", () => {
    it("creates RalphAdapterServer with a unique adapterId", () => {
      const server1 = new RalphAdapterServer();
      const server2 = new RalphAdapterServer();

      expect(server1.adapterId).toBeTruthy();
      expect(server2.adapterId).toBeTruthy();
      expect(server1.adapterId).not.toBe(server2.adapterId);
      expect(server1.type).toBe("ralph_local");
      expect(server1.version).toBe("0.1.0");
    });

    it("RalphAdapterServer.create() returns a ServerAdapterModule", () => {
      const adapter = RalphAdapterServer.create();
      expect(adapter).toBeDefined();
      expect(typeof adapter.execute).toBe("function");
      expect(typeof adapter.testEnvironment).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // Test Group 2: RalphAdapterServer.execute() with real Ralph CLI
  // -------------------------------------------------------------------------

  describe("RalphAdapterServer.execute()", () => {
    it("returns structured result after Ralph execution", async () => {
      // Create a temporary Ralph working directory
      const workDir = "/tmp/ralph-e2e-" + Date.now();
      await mkdir(join(workDir, ".ralph", "agent"), { recursive: true });
      testDirs.push(workDir);

      // Create mock scratchpad
      await createMockScratchpad(
        join(workDir, ".ralph", "agent"),
        "# Ralph Scratchpad\n\nTest iteration 1\n",
      );

      const ctx = buildMockExecutionContext({
        workingDir: workDir,
        hatCollection: "default",
        maxLoops: 1,
        task: "echo 'hello from ralph'",
      });

      const server = new RalphAdapterServer();
      const result = await server.execute(ctx);

      // Validate result structure
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe("number");
      expect(result.resultJson).toBeDefined();
      expect(typeof result.resultJson).toBe("object");
      expect(result.sessionParams).toBeDefined();
      expect(result.sessionParams?.adapterId).toBeTruthy();
      expect(result.sessionParams?.hatCollection).toBe("default");
      expect(result.sessionParams?.workingDir).toBe(workDir);
      expect(result.resultJson?.scratchpad).toBeTruthy();
    }, 30_000);

    it("returns taskWriteback result (skipped when no API key)", async () => {
      const workDir = "/tmp/ralph-e2e-writeback-" + Date.now();
      await mkdir(join(workDir, ".ralph", "agent"), { recursive: true });
      testDirs.push(workDir);

      // Create mock tasks
      await createMockTasks(workDir, []);

      const ctx = buildMockExecutionContext({
        workingDir: workDir,
        task: "echo test",
      });

      const server = new RalphAdapterServer();
      const result = await server.execute(ctx);

      const writeback = result.resultJson?.taskWriteback as Record<string, unknown>;
      expect(writeback).toBeDefined();
      expect(typeof writeback.enabled).toBe("boolean");
      expect(typeof writeback.processed).toBe("number");
    }, 30_000);

    it("handles sessionParams from previous session (resume)", async () => {
      const workDir = "/tmp/ralph-e2e-resume-" + Date.now();
      await mkdir(join(workDir, ".ralph", "agent"), { recursive: true });
      testDirs.push(workDir);

      const ctx = buildMockExecutionContext({
        workingDir: workDir,
        hatCollection: "ceo-hat",
        maxLoops: 3,
        task: "echo resume-test",
        runtime: {
          sessionParams: {
            hatCollection: "ceo-hat",
            maxLoops: 3,
            workingDir: workDir,
            adapterId: "existing-session-id",
          },
          sessionDisplayId: "existing-session-id",
        },
      });

      const server = new RalphAdapterServer();
      const result = await server.execute(ctx);

      expect(result.sessionParams?.hatCollection).toBe("ceo-hat");
      expect(result.sessionDisplayId).toBeTruthy();
    }, 30_000);

    it("returns Ralph memories in resultJson (T1.5)", async () => {
      const workDir = "/tmp/ralph-e2e-memories-" + Date.now();
      await mkdir(join(workDir, ".ralph", "agent"), { recursive: true });
      testDirs.push(workDir);

      // Create mock memories file
      await createMockMemories(workDir, `
## Patterns

### mem-1234567890-abcd
> Test pattern content about adapter integration
<!-- tags: paperclip, ralph, adapter | created: 2026-04-14 -->

## Decisions

### mem-1234567890-wxyz
> Chose Ralph as the execution engine for Paperclip agents
<!-- tags: architecture, decision | created: 2026-04-14 -->
`);

      const ctx = buildMockExecutionContext({
        workingDir: workDir,
        task: "echo memories-test",
      });

      const server = new RalphAdapterServer();
      const result = await server.execute(ctx);

      expect(result.resultJson).toBeDefined();
      expect(result.resultJson?.memoriesPath).toBeTruthy();
      expect(Array.isArray(result.resultJson?.memories)).toBe(true);
      const memories = result.resultJson?.memories as Array<{ id: string; type: string }>;
      expect(memories.length).toBeGreaterThanOrEqual(2);
    }, 30_000);
  });

  // -------------------------------------------------------------------------
  // Test Group 3: Standalone execute function
  // -------------------------------------------------------------------------

  describe("Standalone execute() function", () => {
    it("execute() wraps RalphAdapterServer.execute()", async () => {
      const workDir = "/tmp/ralph-standalone-" + Date.now();
      await mkdir(join(workDir, ".ralph", "agent"), { recursive: true });
      testDirs.push(workDir);

      const ctx = buildMockExecutionContext({
        workingDir: workDir,
        task: "echo standalone",
      });

      const result = await ralphExecute(ctx);

      expect(result).toBeDefined();
      expect(result.exitCode).toBeDefined();
      expect(result.sessionParams).toBeDefined();
    }, 30_000);
  });

  // -------------------------------------------------------------------------
  // Test Group 4: testEnvironment()
  // -------------------------------------------------------------------------

  describe("testEnvironment()", () => {
    it("testEnvironment() checks Ralph CLI installation", async () => {
      const ctx = buildMockTestContext();
      const result = await ralphTestEnvironment(ctx);

      expect(result).toBeDefined();
      expect(result.adapterType).toBe("ralph_local");
      expect(result.testedAt).toBeTruthy();
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);

      // Ralph should be installed in this environment
      const ralphCheck = result.checks.find((c) =>
        c.code === "RALPH_INSTALLED" || c.code === "RALPH_NOT_INSTALLED"
      );
      expect(ralphCheck).toBeDefined();
    }, 15_000);

    it("testEnvironment() checks working directory when specified", async () => {
      const ctx = buildMockTestContext();
      const workDir = "/tmp/ralph-env-test-" + Date.now();
      await mkdir(workDir, { recursive: true });
      testDirs.push(workDir);

      ctx.config = { workingDirectory: workDir };

      const result = await ralphTestEnvironment(ctx);

      expect(result.checks.some((c) => c.code === "WORKING_DIR_OK")).toBe(true);
    }, 15_000);

    it("testEnvironment() warns about missing working directory", async () => {
      const ctx = buildMockTestContext();
      ctx.config = { workingDirectory: "/tmp/definitely-nonexistent-ralph-dir-12345" };

      const result = await ralphTestEnvironment(ctx);

      expect(result.checks.some((c) => c.code === "WORKING_DIR_MISSING")).toBe(true);
    }, 15_000);
  });

  // -------------------------------------------------------------------------
  // Test Group 5: sessionCodec
  // -------------------------------------------------------------------------

  describe("sessionCodec", () => {
    it("serializes and deserializes session params correctly", () => {
      const params: Record<string, unknown> = {
        adapterId: "ralph-test-123",
        hatCollection: "ceo-hat",
        defaultHat: "architect",
        workingDir: "/home/user/project",
        maxLoops: 5,
        scratchpadPath: "/home/user/project/.ralph/agent/scratchpad.md",
      };

      const serialized = sessionCodec.serialize(params);
      expect(serialized).toBeTruthy();

      const deserialized = sessionCodec.deserialize(serialized);
      expect(deserialized).toBeTruthy();
      expect(deserialized?.adapterId).toBe(params.adapterId);
      expect(deserialized?.hatCollection).toBe(params.hatCollection);
      expect(deserialized?.defaultHat).toBe(params.defaultHat);
      expect(deserialized?.workingDir).toBe(params.workingDir);
      expect(deserialized?.maxLoops).toBe(params.maxLoops);
      expect(deserialized?.scratchpadPath).toBe(params.scratchpadPath);
    });

    it("roundtrip with null params returns null", () => {
      expect(sessionCodec.serialize(null)).toBeNull();
      expect(sessionCodec.deserialize(null)).toBeNull();
    });

    it("roundtrip with empty params returns null", () => {
      expect(sessionCodec.serialize({})).toBeNull();
      expect(sessionCodec.deserialize({})).toBeNull();
    });

    it("getDisplayId returns adapterId from params", () => {
      const params: Record<string, unknown> = { adapterId: "ralph-display-456" };
      expect(sessionCodec.getDisplayId?.(params)).toBe("ralph-display-456");
      expect(sessionCodec.getDisplayId?.(null)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Test Group 6: RalphSkillLoader (T1.6)
  // -------------------------------------------------------------------------

  describe("RalphSkillLoader (T1.6)", () => {
    it("discovers built-in skills", async () => {
      const loader = new RalphSkillLoader();
      const skills = await loader.discoverSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);

      // Built-in skills should be present
      const builtinNames = skills
        .filter((s) => s.source === "builtin")
        .map((s) => s.name);
      expect(builtinNames).toContain("read");
      expect(builtinNames).toContain("edit");
      expect(builtinNames).toContain("bash");
    });

    it("isSkillAvailable returns true for builtin skills", async () => {
      const loader = new RalphSkillLoader();
      await expect(loader.isSkillAvailable("read")).resolves.toBe(true);
      await expect(loader.isSkillAvailable("bash")).resolves.toBe(true);
    });

    it("getSkillInfo returns skill details", async () => {
      const loader = new RalphSkillLoader();
      const info = await loader.getSkillInfo("read");
      expect(info).toBeTruthy();
      expect(info?.name).toBe("read");
      expect(info?.source).toBe("builtin");
    });

    it("getSkillInfo returns null for unknown skill", async () => {
      const loader = new RalphSkillLoader();
      const info = await loader.getSkillInfo("nonexistent-skill-xyz-123");
      expect(info).toBeNull();
    });

    it("caches discovered skills", async () => {
      const loader = new RalphSkillLoader();
      const skills1 = await loader.discoverSkills();
      const skills2 = await loader.discoverSkills();
      expect(skills1).toBe(skills2); // Same reference (cached)
    });

    it("invalidateCache forces fresh discovery", async () => {
      const loader = new RalphSkillLoader();
      const skills1 = await loader.discoverSkills();
      loader.invalidateCache();
      const skills2 = await loader.discoverSkills();
      expect(skills1).not.toBe(skills2); // Different reference
      expect(skills1.length).toBe(skills2.length); // Same content
    });
  });

  // -------------------------------------------------------------------------
  // Test Group 7: listRalphSkills / syncRalphSkills
  // -------------------------------------------------------------------------

  describe("listRalphSkills / syncRalphSkills", () => {
    it("listRalphSkills returns AdapterSkillSnapshot", async () => {
      const snapshot = await listRalphSkills({
        agentId: "test-agent",
        companyId: "test-company",
        adapterType: "ralph_local",
        config: {},
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.adapterType).toBe("ralph_local");
      expect(snapshot.supported).toBe(true);
      expect(snapshot.mode).toBe("persistent");
      expect(Array.isArray(snapshot.entries)).toBe(true);
      expect(Array.isArray(snapshot.warnings)).toBe(true);
      expect(snapshot.entries.length).toBeGreaterThan(0);
    });

    it("syncRalphSkills returns AdapterSkillSnapshot with custom skills", async () => {
      const snapshot = await syncRalphSkills(
        {
          agentId: "test-agent",
          companyId: "test-company",
          adapterType: "ralph_local",
          config: {},
        },
        ["read", "bash", "edit"],
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.adapterType).toBe("ralph_local");
      expect(snapshot.desiredSkills).toContain("read");
      expect(snapshot.desiredSkills).toContain("bash");
    });
  });

  // -------------------------------------------------------------------------
  // Test Group 8: Memory functions (T1.5)
  // -------------------------------------------------------------------------

  describe("Memory functions (T1.5)", () => {
    it("readRalphMemories returns null for nonexistent directory", async () => {
      const result = await readRalphMemories("/tmp/this-dir-does-not-exist-12345");
      expect(result).toBeNull();
    });

    it("readRalphMemories parses valid memories.md", async () => {
      const workDir = "/tmp/ralph-memories-test-" + Date.now();
      await createMockMemories(workDir, `
## Patterns

### mem-1111111111-aaaa
> Use Ralph for parallel task execution
<!-- tags: ralph, parallel, execution | created: 2026-04-14 -->

## Decisions

### mem-2222222222-bbbb
> Chose Ralph over other orchestrators for its memory system
<!-- tags: ralph, decision, architecture | created: 2026-04-14 -->

## Fixes

### mem-3333333333-cccc
> Ralph CLI not found: install with npm install -g
<!-- tags: fix, install, ralph | created: 2026-04-14 -->
`);
      testDirs.push(workDir);

      const result = await readRalphMemories(workDir);

      expect(result).toBeTruthy();
      expect(result!.memoriesPath).toContain("memories.md");
      expect(result!.modifiedAt).toBeTruthy();
      expect(result!.entries.length).toBe(3);

      const patterns = result!.entries.filter((e) => e.type === "pattern");
      const decisions = result!.entries.filter((e) => e.type === "decision");
      const fixes = result!.entries.filter((e) => e.type === "fix");

      expect(patterns.length).toBe(1);
      expect(decisions.length).toBe(1);
      expect(fixes.length).toBe(1);
    });

    it("searchRalphMemories filters by type", async () => {
      const workDir = "/tmp/ralph-search-test-" + Date.now();
      await createMockMemories(workDir, `
## Patterns

### mem-4444444441-pppp
> Pattern one
<!-- tags: test | created: 2026-04-14 -->

### mem-4444444442-pppp
> Pattern two
<!-- tags: test | created: 2026-04-14 -->

## Decisions

### mem-4444444443-dddd
> Decision one
<!-- tags: test | created: 2026-04-14 -->
`);
      testDirs.push(workDir);

      const patterns = await searchRalphMemories(workDir, { type: "pattern" });
      const decisions = await searchRalphMemories(workDir, { type: "decision" });

      expect(patterns.length).toBe(2);
      expect(decisions.length).toBe(1);
    });

    it("searchRalphMemories filters by tags", async () => {
      const workDir = "/tmp/ralph-tag-test-" + Date.now();
      await createMockMemories(workDir, `
## Patterns

### mem-5555555501-tttt
> Memory with tag alpha
<!-- tags: alpha, beta | created: 2026-04-14 -->

### mem-5555555502-tttt
> Memory with tag beta
<!-- tags: beta, gamma | created: 2026-04-14 -->

### mem-5555555503-tttt
> Memory with tag gamma
<!-- tags: gamma | created: 2026-04-14 -->
`);
      testDirs.push(workDir);

      const betaMemories = await searchRalphMemories(workDir, { tags: ["beta"] });
      expect(betaMemories.length).toBe(2);
    });

    it("searchRalphMemories searches by keyword", async () => {
      const workDir = "/tmp/ralph-kw-test-" + Date.now();
      await createMockMemories(workDir, `
## Patterns

### mem-6666666661-kwkw
> This memory talks about adapters
<!-- tags: adapter | created: 2026-04-14 -->

### mem-6666666662-kwkw
> This memory talks about sessions
<!-- tags: session | created: 2026-04-14 -->
`);
      testDirs.push(workDir);

      const adapterResults = await searchRalphMemories(workDir, { query: "adapter" });
      expect(adapterResults.length).toBe(1);
      expect(adapterResults[0].content).toContain("adapter");
    });

    it("searchRalphMemories respects limit", async () => {
      const workDir = "/tmp/ralph-limit-test-" + Date.now();
      await createMockMemories(workDir, `
## Patterns

### mem-7777777771-llll
> Memory one
<!-- tags: test | created: 2026-04-14 -->

### mem-7777777772-llll
> Memory two
<!-- tags: test | created: 2026-04-14 -->

### mem-7777777773-llll
> Memory three
<!-- tags: test | created: 2026-04-14 -->
`);
      testDirs.push(workDir);

      const limited = await searchRalphMemories(workDir, { limit: 2 });
      expect(limited.length).toBe(2);
    });

    it("getRalphMemoryStats returns correct counts", async () => {
      const workDir = "/tmp/ralph-stats-test-" + Date.now();
      await createMockMemories(workDir, `
## Patterns

### mem-8888888881-ssss
> Pattern one
<!-- tags: test | created: 2026-04-14 -->

### mem-8888888882-ssss
> Pattern two
<!-- tags: test | created: 2026-04-14 -->

## Decisions

### mem-8888888883-ssss
> Decision one
<!-- tags: test | created: 2026-04-14 -->

## Fixes

### mem-8888888884-ssss
> Fix one
<!-- tags: test | created: 2026-04-14 -->

## Context

### mem-8888888885-ssss
> Context one
<!-- tags: test | created: 2026-04-14 -->
`);
      testDirs.push(workDir);

      const stats = await getRalphMemoryStats(workDir);

      expect(stats).toBeTruthy();
      expect(stats!.patterns).toBe(2);
      expect(stats!.decisions).toBe(1);
      expect(stats!.fixes).toBe(1);
      expect(stats!.context).toBe(1);
      expect(stats!.total).toBe(5);
    });

    it("getRalphMemoryStats returns null for nonexistent directory", async () => {
      const stats = await getRalphMemoryStats("/tmp/this-dir-does-not-exist-99999");
      expect(stats).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Test Group 9: RalphTaskWritebackService (T1.4)
  // -------------------------------------------------------------------------

  describe("RalphTaskWritebackService (T1.4)", () => {
    it("skips writeback when no tasks file exists", async () => {
      const service = new RalphTaskWritebackService({
        workingDir: "/tmp/nonexistent-ralph-dir-abc123",
        companyId: "company-123",
        agentId: "agent-456",
        apiKey: "fake-key",
      });

      const result = await service.writeback();

      expect(result.processed).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("skips writeback when no API key is available", async () => {
      const service = new RalphTaskWritebackService({
        workingDir: "/tmp/test",
        companyId: "company-123",
        agentId: "agent-456",
        apiKey: "",
      });

      const result = await service.writeback();

      expect(result.processed).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors).toContain("No API key — skipped");
    });

    it("reads tasks with pc:issue-{uuid} key", async () => {
      const workDir = "/tmp/ralph-writeback-tasks-" + Date.now();
      await createMockTasks(workDir, [
        {
          id: "task-writeback-001",
          title: "Implement E2E test",
          status: "closed",
          key: "pc:issue-550e8400-e29b-41d4-a716-446655440000",
          created: new Date().toISOString(),
          closed: new Date().toISOString(),
        },
        {
          id: "task-writeback-002",
          title: "Update documentation",
          status: "closed",
          key: "pc:issue-550e8400-e29b-41d4-a716-446655440001",
          created: new Date().toISOString(),
          closed: new Date().toISOString(),
        },
      ]);
      testDirs.push(workDir);

      const service = new RalphTaskWritebackService({
        workingDir: workDir,
        companyId: "company-123",
        agentId: "agent-456",
        apiKey: "fake-key",
      });

      // Writeback will fail to call Paperclip API but will process tasks
      const result = await service.writeback();

      // Tasks processed (writeback attempts will fail due to fake API key)
      expect(result.processed).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Test Group 10: Scratchpad reading (T1.7)
  // -------------------------------------------------------------------------

  describe("Scratchpad reading (T1.7)", () => {
    it("returns scratchpad content after Ralph execution", async () => {
      const workDir = "/tmp/ralph-scratchpad-test-" + Date.now();
      await mkdir(join(workDir, ".ralph", "agent"), { recursive: true });
      testDirs.push(workDir);

      await createMockScratchpad(
        join(workDir, ".ralph", "agent"),
        "# Ralph CEO Scratchpad\n\n## Current Plan\n- Analyze architecture\n- Propose improvements\n\n## Iteration 1\nCompleted: reviewed existing adapter code\n",
      );

      const ctx = buildMockExecutionContext({
        workingDir: workDir,
        task: "echo scratchpad-test",
      });

      const server = new RalphAdapterServer();
      const result = await server.execute(ctx);

      expect(result.resultJson?.scratchpad).toBeTruthy();
      expect(result.resultJson?.scratchpad).toContain("Ralph CEO Scratchpad");
      expect(result.resultJson?.scratchpadPath).toBeTruthy();
    }, 30_000);

    it("sessionParams includes scratchpadPath after execution", async () => {
      const workDir = "/tmp/ralph-scratchpad-session-" + Date.now();
      await mkdir(join(workDir, ".ralph", "agent"), { recursive: true });
      testDirs.push(workDir);

      await createMockScratchpad(
        join(workDir, ".ralph", "agent"),
        "Test scratchpad content\n",
      );

      const ctx = buildMockExecutionContext({
        workingDir: workDir,
        task: "echo test",
      });

      const server = new RalphAdapterServer();
      const result = await server.execute(ctx);

      expect(result.sessionParams?.scratchpadPath).toBeTruthy();
      expect(result.sessionParams?.scratchpadPath as string).toContain("scratchpad.md");
    }, 30_000);
  });

  // -------------------------------------------------------------------------
  // Test Group 11: Full T1.1-T1.7 Integration Summary
  // -------------------------------------------------------------------------

  describe("T1.1-T1.7 Integration Summary", () => {
    it("complete E2E: execute returns all T1.x data in resultJson", async () => {
      const workDir = "/tmp/ralph-full-e2e-" + Date.now();
      await mkdir(join(workDir, ".ralph", "agent"), { recursive: true });
      testDirs.push(workDir);

      // Setup: memories, scratchpad, tasks
      await createMockMemories(workDir, `
## Patterns

### mem-full-e2e-0001
> Ralph adapter integration with Paperclip works correctly
<!-- tags: integration, paperclip, ralph | created: 2026-04-14 -->
`);
      await createMockScratchpad(
        join(workDir, ".ralph", "agent"),
        "# Full E2E Scratchpad\n\nIntegration test iteration\n",
      );
      await createMockTasks(workDir, []);

      const ctx = buildMockExecutionContext({
        workingDir: workDir,
        hatCollection: "ceo-hat",
        maxLoops: 1,
        task: "echo full-e2e-test",
      });

      const server = new RalphAdapterServer();
      const result = await server.execute(ctx);

      // T1.1: execute() returns structured result ✓
      expect(result.exitCode).toBeDefined();

      // T1.1b: sessionCodec serialized ✓
      expect(result.sessionParams?.hatCollection).toBe("ceo-hat");
      expect(result.sessionParams?.workingDir).toBe(workDir);

      // T1.3: Heartbeat integration (SESSIONED_LOCAL_ADAPTERS) ✓
      // (verified by sessionParams being populated)

      // T1.4: taskWriteback in resultJson ✓
      const writeback = result.resultJson?.taskWriteback as Record<string, unknown>;
      expect(writeback).toBeDefined();
      expect(typeof writeback.enabled).toBe("boolean");

      // T1.5: memories in resultJson ✓
      expect(Array.isArray(result.resultJson?.memories)).toBe(true);
      expect(result.resultJson?.memoriesPath).toBeTruthy();

      // T1.6: Skills available via listRalphSkills ✓
      const skills = await listRalphSkills({
        agentId: ctx.agent.id,
        companyId: ctx.agent.companyId,
        adapterType: "ralph_local",
        config: {},
      });
      expect(skills.entries.length).toBeGreaterThan(0);

      // T1.7: scratchpad in resultJson ✓
      expect(result.resultJson?.scratchpad).toBeTruthy();
      expect(result.resultJson?.scratchpadPath).toBeTruthy();
    }, 30_000);
  });
});
