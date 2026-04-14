---
title: Ralph Local
summary: Ralph Loop Orchestrator adapter — multi-hat parallel execution with memory bank and task management
---

The `ralph_local` adapter wraps the [Ralph Loop Orchestrator](https://github.com/ralph-orchestrator/ralph-cli) as a Paperclip-compatible agent adapter. It brings Ralph's multi-hat parallel execution, memory bank, and task management to Paperclip's control plane.

## Prerequisites

- Ralph CLI installed (`ralph` command available)
- Ralph config at `~/.ralph/config.yml` or `~/.ralph/config.yaml` (optional — uses defaults if absent)
- Ralph hat collections at `.ralph/hats/` in the agent's working directory (optional)

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ralphPath` | string | No | Path to `ralph` binary (default: `"ralph"`) |
| `workingDirectory` | string | Yes | Working directory for Ralph process |
| `hatCollection` | string | No | Hat collection name to use (e.g. `"default"`, `"ceo"`) |
| `defaultHat` | string | No | Default hat name to start with |
| `maxLoops` | number | No | Maximum loop iterations before exit |
| `timeoutSec` | number | No | Process timeout in seconds (default: `300`) |

## How It Works

```
Paperclip Heartbeat
  → RalphAdapterServer.execute()
    → Spawns `ralph run --hat <hat> --prompt <task>`
    → Captures stdout/stderr
    → Reads Ralph memories (T1.5)
    → Writes task status back to Paperclip issues (T1.4)
    → Reads Ralph scratchpad for session resume (T1.7)
    → Returns structured resultJson
```

### T1.4: Task Status Writeback

After Ralph completes, the adapter reads `tasks.jsonl` and syncs completed tasks to Paperclip issues. Task-to-issue mapping uses Ralph task keys:

- `pc:issue-{uuid}` → maps directly to Paperclip issue UUID
- `pc:{uuid}` → shorthand format

Status mapping:
| Ralph | Paperclip |
|-------|-----------|
| `closed` | `done` |
| `failed` | `blocked` |
| `in_progress` | `in_progress` |

A completion comment is added to the Paperclip issue with task details, duration, and executor info.

### T1.5: Memory Bank Sync

Ralph memories (`.ralph/agent/memories.md`) are automatically read after each run. The following memory types are supported:

- **Patterns** (`## Patterns`) — Codebase conventions and patterns
- **Decisions** (`## Decisions`) — Architectural choices and reasoning
- **Fixes** (`## Fixes`) — Problem-solution pairs for recurring errors
- **Context** (`## Context`) — Project-specific knowledge

Memory entries are included in `resultJson.memories` for Paperclip's Knowledge Base integration.

### T1.7: Scratchpad Persistence

Ralph's scratchpad (`.ralph/agent/scratchpad.md`) is read after execution. The adapter returns:
- `scratchpad.content` — scratchpad content (truncated at 50KB)
- `scratchpad.path` — absolute path to scratchpad file
- `scratchpad.modifiedAt` — last modification timestamp

The scratchpad path is stored in `sessionParams` for session resume on the next heartbeat.

## Session Persistence

Ralph's session state is preserved across heartbeats via the `sessionCodec`:

| Session Param | Description |
|--------------|-------------|
| `adapterId` | Ralph adapter instance ID |
| `hatCollection` | Active hat collection name |
| `defaultHat` | Current/default hat |
| `workingDir` | Ralph working directory |
| `maxLoops` | Loop limit |
| `scratchpadPath` | Path to scratchpad file |

On the next wake, Paperclip passes these params back to the adapter, allowing Ralph to resume from its last scratchpad state.

## Skills Framework (T1.6)

Ralph skills are discovered from three sources and unified in Paperclip's Skill System:

| Source | Type | Description |
|--------|------|-------------|
| Built-in | `company_managed` | Core tools: read, edit, write, bash, glob, grep, task, memory |
| Ralph CLI | `external_unknown` | Custom skills from `ralph tools skill list` |
| Filesystem | `user_installed` | Skills in `~/.ralph/skills/` and `~/.claude/skills/` |

Use `listRalphSkills()` to see all available skills, and `syncRalphSkills()` to load custom skills via `ralph tools skill load`.

## Environment Test

The adapter checks:

1. **Ralph CLI installed** — runs `ralph --version`
2. **Working directory accessible** — checks `fs.stat()` on `workingDirectory`
3. **Ralph config found** — scans `~/.ralph/config.{yml,yaml}`

## Result JSON Schema

```typescript
interface RalphExecutionResult {
  stdout: string;              // Ralph CLI stdout (truncated to 10KB)
  stderr: string;              // Ralph CLI stderr (truncated to 1KB)
  exitCode: number | null;     // Ralph process exit code
  scratchpad: string | null;   // Ralph scratchpad content
  scratchpadPath: string | null;
  scratchpadModifiedAt: string | null;
  memories: MemoryEntry[];     // T1.5: Ralph memories synced
  memoriesPath: string | null;
  memoriesModifiedAt: string | null;
  memoriesCount: number;
  taskWriteback: {             // T1.4: Task writeback result
    enabled: boolean;
    processed: number;
    updated: number;
    errors: string[];
  };
}
```

## Benchmark Performance (T1.9)

All adapter overhead is < 0.01ms on average, far below the 5ms target:

| Operation | Avg | p95 | Target |
|-----------|-----|-----|--------|
| `sessionCodec.serialize()` | 0.001ms | 0.001ms | < 5ms ✅ |
| `sessionCodec.deserialize()` | 0.000ms | 0.001ms | < 5ms ✅ |
| `RalphAdapterServer.create()` | 0.000ms | 0.001ms | < 5ms ✅ |
| `RalphSkillLoader.discoverSkills()` (cached) | 0.000ms | 0.001ms | < 5ms ✅ |
| `readRalphMemories()` | 0.001ms | 0.002ms | < 5ms ✅ |
| `searchRalphMemories()` | 0.001ms | 0.002ms | < 5ms ✅ |

> Note: These benchmarks measure adapter overhead only — actual `ralph run` subprocess execution time depends on task complexity and is excluded.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PAPERCLIP_API_KEY` | API key for task writeback (optional — writeback skipped if absent) |
| `PAPERCLIP_SERVER_URL` | Paperclip server URL (default: `http://localhost:3000`) |
| `PAPERCLIP_RUN_ID` | Current run ID (auto-set by Paperclip heartbeat) |
| `PAPERCLIP_AGENT_ID` | Current agent ID (auto-set by Paperclip heartbeat) |
| `PAPERCLIP_COMPANY_ID` | Current company ID (auto-set by Paperclip heartbeat) |

## Example: Register a Ralph Agent

```typescript
import { createServerAdapter } from "@paperclipai/adapter-ralph-local/server";

// Create adapter instance
const adapter = createServerAdapter();

// Execute with Ralph Loop
const result = await adapter.execute({
  runId: "run-123",
  agent: { id: "agent-456", companyId: "company-789" },
  config: {
    workingDirectory: "/path/to/project",
    hatCollection: "default",
    timeoutSec: 300,
  },
  context: {
    task: "Implement user authentication feature",
  },
  runtime: {
    sessionParams: null,
    onLog: async (type, text) => console.log(`[${type}] ${text}`),
    onSpawn: async (info) => console.log(`Ralph PID: ${info.pid}`),
  },
});

console.log(result.resultJson.memories);     // Ralph memories
console.log(result.resultJson.scratchpad);   // Ralph scratchpad
console.log(result.resultJson.taskWriteback); // Task writeback
```
