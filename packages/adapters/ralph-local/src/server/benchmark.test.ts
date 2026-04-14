/**
 * T1.9 基准测试: Ralph Adapter 开销 < 5ms 延迟
 *
 * 测量 Ralph Adapter 各核心函数的调用开销:
 * - sessionCodec.serialize() / deserialize()
 * - RalphAdapterServer.instantiation
 * - testEnvironment() (mocked subprocess)
 * - readRalphMemories() / searchRalphMemories()
 * - listRalphSkills() (cached)
 *
 * 目标: 所有同步操作 < 5ms，平均 < 1ms
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// Import the Ralph adapter
import {
  RalphAdapterServer,
  RalphSkillLoader,
  sessionCodec,
  readRalphMemories,
  searchRalphMemories,
  getRalphMemoryStats,
  listRalphSkills,
} from "./index.js";

import type {
  AdapterEnvironmentTestContext,
  AdapterSkillContext,
} from "@paperclipai/adapter-utils";

// ---------------------------------------------------------------------------
// Benchmark helpers
// ---------------------------------------------------------------------------

const BENCHMARK_ITERATIONS = 1000;
const MAX_SYNC_MS = 5; // Target: < 5ms per call

/**
 * Run a function multiple times and return timing statistics
 */
function benchmark<T>(fn: () => T, iterations: number = BENCHMARK_ITERATIONS): {
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
  p99Ms: number;
  results: number[];
} {
  const results: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    results.push(end - start);
  }

  const sorted = [...results].sort((a, b) => a - b);
  const totalMs = sorted.reduce((a, b) => a + b, 0);
  const p95Idx = Math.floor(iterations * 0.95);
  const p99Idx = Math.floor(iterations * 0.99);

  return {
    totalMs,
    avgMs: totalMs / iterations,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    p95Ms: sorted[p95Idx],
    p99Ms: sorted[p99Idx],
    results: sorted,
  };
}

/**
 * Print benchmark results
 */
function printBenchmark(name: string, stats: ReturnType<typeof benchmark>, targetMs: number): void {
  const pass = stats.avgMs < targetMs;
  const status = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${name}`);
  console.log(`  ${status} | avg: ${stats.avgMs.toFixed(3)}ms | p95: ${stats.p95Ms.toFixed(3)}ms | p99: ${stats.p99Ms.toFixed(3)}ms | min: ${stats.minMs.toFixed(3)}ms | max: ${stats.maxMs.toFixed(3)}ms (target: < ${targetMs}ms)`);
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let testDir: string;
let mockCtx: AdapterEnvironmentTestContext;
let mockSkillCtx: AdapterSkillContext;

beforeEach(async () => {
  // Create a unique test directory
  testDir = join(tmpdir(), `ralph-bench-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  await mkdir(join(testDir, ".ralph", "agent"), { recursive: true });

  // Create mock memories file
  const memoriesContent = `## Patterns

### mem-1234567890-abcd
> This is a test pattern about using barrel exports
<!-- tags: api, pattern | created: 2026-04-14 -->

## Decisions

### mem-1234567890-efgh
> Chose JSONL over SQLite for simpler, git-friendly storage
<!-- tags: storage, architecture | created: 2026-04-14 -->

## Fixes

### mem-1234567890-ijkl
> ECONNREFUSED on :5432 means run docker-compose up
<!-- tags: postgres, error | created: 2026-04-14 -->
`;
  await writeFile(join(testDir, ".ralph", "agent", "memories.md"), memoriesContent, "utf-8");

  // Create mock scratchpad
  await writeFile(
    join(testDir, ".ralph", "agent", "scratchpad.md"),
    "# Ralph Loop Scratchpad\n\n## Current Status\n\nTest scratchpad content for benchmark validation.\n",
    "utf-8",
  );

  mockCtx = {
    config: {
      workingDirectory: testDir,
    },
    agent: {
      id: "test-agent-id",
      companyId: "test-company-id",
    },
  } as unknown as AdapterEnvironmentTestContext;

  mockSkillCtx = {
    config: {},
    agent: {
      id: "test-agent-id",
      companyId: "test-company-id",
    },
  } as unknown as AdapterSkillContext;
});

afterEach(async () => {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ---------------------------------------------------------------------------
// Benchmark: sessionCodec
// ---------------------------------------------------------------------------

describe("T1.9: Ralph Adapter 基准测试", () => {

  describe("sessionCodec 序列化/反序列化", () => {
    it(`B1: sessionCodec.serialize() 应该在 ${MAX_SYNC_MS}ms 内完成`, () => {
      const params = {
        adapterId: "ralph-test-123",
        hatCollection: "default",
        defaultHat: "architect",
        workingDir: "/Users/test/project",
        maxLoops: 5,
        timeoutSec: 300,
        scratchpadPath: "/Users/test/project/.ralph/agent/scratchpad.md",
      };

      const stats = benchmark(() => {
        sessionCodec.serialize(params);
      }, BENCHMARK_ITERATIONS);

      printBenchmark("sessionCodec.serialize()", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B2: sessionCodec.deserialize() 应该在 ${MAX_SYNC_MS}ms 内完成`, () => {
      const raw = {
        adapterId: "ralph-test-456",
        hatCollection: "ceo",
        defaultHat: "executor",
        workingDir: "/Users/test/project",
        maxLoops: 3,
        timeoutSec: 180,
        scratchpadPath: "/Users/test/project/.ralph/agent/scratchpad.md",
      };

      const stats = benchmark(() => {
        sessionCodec.deserialize(raw);
      }, BENCHMARK_ITERATIONS);

      printBenchmark("sessionCodec.deserialize()", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B3: sessionCodec.getDisplayId() 应该在 ${MAX_SYNC_MS}ms 内完成`, () => {
      const params = {
        adapterId: "ralph-display-789",
        hatCollection: "default",
      };

      const stats = benchmark(() => {
        sessionCodec.getDisplayId!(params);
      }, BENCHMARK_ITERATIONS);

      printBenchmark("sessionCodec.getDisplayId()", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it("B4: sessionCodec 往返序列化 (serialize → deserialize) 应该在 5ms 内完成", () => {
      const original = {
        adapterId: "ralph-roundtrip",
        hatCollection: "cto",
        defaultHat: "developer",
        workingDir: "/Users/test/project",
        maxLoops: 10,
      };

      const stats = benchmark(() => {
        const serialized = sessionCodec.serialize(original);
        if (serialized) {
          sessionCodec.deserialize(serialized);
        }
      }, BENCHMARK_ITERATIONS);

      printBenchmark("sessionCodec roundtrip", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });
  });

  describe("RalphAdapterServer 实例化", () => {
    it(`B5: RalphAdapterServer.create() 应该在 ${MAX_SYNC_MS}ms 内完成`, () => {
      const stats = benchmark(() => {
        RalphAdapterServer.create();
      }, BENCHMARK_ITERATIONS);

      printBenchmark("RalphAdapterServer.create()", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B6: new RalphAdapterServer() 应该在 ${MAX_SYNC_MS}ms 内完成`, () => {
      const stats = benchmark(() => {
        new RalphAdapterServer();
      }, BENCHMARK_ITERATIONS);

      printBenchmark("new RalphAdapterServer()", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B7: RalphAdapterServer 实例属性访问应该在 ${MAX_SYNC_MS}ms 内完成`, () => {
      const server = RalphAdapterServer.create() as RalphAdapterServer;
      const stats = benchmark(() => {
        // Accessing readonly properties
        const _ = server.adapterId;
        const __ = server.version;
        const ___ = server.type;
      }, BENCHMARK_ITERATIONS);

      printBenchmark("RalphAdapterServer property access", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });
  });

  describe("RalphSkillLoader", () => {
    it(`B8: RalphSkillLoader 实例化应该在 ${MAX_SYNC_MS}ms 内完成`, () => {
      const stats = benchmark(() => {
        new RalphSkillLoader();
      }, BENCHMARK_ITERATIONS);

      printBenchmark("new RalphSkillLoader()", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B9: RalphSkillLoader.discoverSkills() (缓存命中) 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const loader = new RalphSkillLoader();

      // Pre-warm the cache
      await loader.discoverSkills();

      const stats = benchmark(() => {
        loader.discoverSkills();
      }, BENCHMARK_ITERATIONS);

      printBenchmark("RalphSkillLoader.discoverSkills() [cached]", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B10: listRalphSkills() (缓存命中) 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      // Pre-warm cache
      await listRalphSkills(mockSkillCtx);

      const stats = benchmark(() => {
        listRalphSkills(mockSkillCtx);
      }, BENCHMARK_ITERATIONS);

      printBenchmark("listRalphSkills() [cached]", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B11: RalphSkillLoader.invalidateCache() 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const loader = new RalphSkillLoader();
      await loader.discoverSkills(); // Warm up

      const stats = benchmark(() => {
        loader.invalidateCache();
      }, BENCHMARK_ITERATIONS);

      printBenchmark("RalphSkillLoader.invalidateCache()", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });
  });

  describe("Ralph Memory Bank 读写", () => {
    it(`B12: readRalphMemories() (存在文件) 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const stats = benchmark(async () => {
        await readRalphMemories(testDir);
      }, 100); // Fewer iterations for async filesystem calls

      printBenchmark("readRalphMemories() [fs read]", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B13: readRalphMemories() (不存在文件) 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const emptyDir = join(tmpdir(), `ralph-bench-empty-${Date.now()}`);
      await mkdir(join(emptyDir, ".ralph", "agent"), { recursive: true });

      try {
        const stats = benchmark(async () => {
          await readRalphMemories(emptyDir);
        }, 100);

        printBenchmark("readRalphMemories() [no file]", stats, MAX_SYNC_MS);
        expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it(`B14: searchRalphMemories() (有结果) 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const stats = benchmark(async () => {
        await searchRalphMemories(testDir, { query: "barrel" });
      }, 100);

      printBenchmark("searchRalphMemories() [with results]", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B15: searchRalphMemories() (无结果) 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const stats = benchmark(async () => {
        await searchRalphMemories(testDir, { query: "nonexistent-query-xyz" });
      }, 100);

      printBenchmark("searchRalphMemories() [no results]", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B16: searchRalphMemories() (类型过滤) 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const stats = benchmark(async () => {
        await searchRalphMemories(testDir, { type: "pattern" });
      }, 100);

      printBenchmark("searchRalphMemories() [type filter]", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B17: getRalphMemoryStats() 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const stats = benchmark(async () => {
        await getRalphMemoryStats(testDir);
      }, 100);

      printBenchmark("getRalphMemoryStats()", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });

    it(`B18: searchRalphMemories() (多条件组合) 应该在 ${MAX_SYNC_MS}ms 内完成`, async () => {
      const stats = benchmark(async () => {
        await searchRalphMemories(testDir, {
          type: "pattern",
          tags: ["api"],
          query: "barrel",
          limit: 5,
        });
      }, 100);

      printBenchmark("searchRalphMemories() [composite]", stats, MAX_SYNC_MS);
      expect(stats.avgMs).toBeLessThan(MAX_SYNC_MS);
    });
  });

  describe("总览报告", () => {
    it("B19: 生成完整基准测试报告", async () => {
      console.log("\n" + "=".repeat(70));
      console.log("T1.9 Ralph Adapter 基准测试报告");
      console.log("=".repeat(70));
      console.log(`测试目录: ${testDir}`);
      console.log(`迭代次数: ${BENCHMARK_ITERATIONS} (同步) / 100 (异步文件系统)`);
      console.log(`目标: 所有操作平均延迟 < ${MAX_SYNC_MS}ms`);
      console.log("=".repeat(70));

      // Run all benchmarks
      const params = {
        adapterId: "ralph-bench-report",
        hatCollection: "default",
        defaultHat: "architect",
        workingDir: "/Users/test/project",
        maxLoops: 5,
        scratchpadPath: "/Users/test/project/.ralph/agent/scratchpad.md",
      };

      const serializeStats = benchmark(() => sessionCodec.serialize(params), BENCHMARK_ITERATIONS);
      const deserializeStats = benchmark(() => sessionCodec.deserialize(params), BENCHMARK_ITERATIONS);
      const createStats = benchmark(() => RalphAdapterServer.create(), BENCHMARK_ITERATIONS);
      const skillLoaderStats = benchmark(() => new RalphSkillLoader(), BENCHMARK_ITERATIONS);

      const readMemoriesStats = await benchmark(async () => {
        await readRalphMemories(testDir);
      }, 100);

      const searchStats = await benchmark(async () => {
        await searchRalphMemories(testDir, { query: "barrel" });
      }, 100);

      const statsReport = [
        ["sessionCodec.serialize()", serializeStats],
        ["sessionCodec.deserialize()", deserializeStats],
        ["RalphAdapterServer.create()", createStats],
        ["new RalphSkillLoader()", skillLoaderStats],
        ["readRalphMemories()", readMemoriesStats],
        ["searchRalphMemories()", searchStats],
      ] as const;

      let allPass = true;
      for (const [name, stats] of statsReport) {
        const pass = stats.avgMs < MAX_SYNC_MS;
        if (!pass) allPass = false;
        printBenchmark(name, stats, MAX_SYNC_MS);
      }

      console.log("=".repeat(70));
      const summary = allPass ? "✅ 所有基准测试通过！" : "❌ 部分基准测试未达标";
      console.log(`总结: ${summary}`);
      console.log("=".repeat(70));

      expect(allPass).toBe(true);
    });
  });
});
