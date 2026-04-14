/**
 * Ralph Adapter Server
 *
 * Ralph 适配器的服务端实现
 * 处理 Paperclip 与 Ralph 之间的通信
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
  UsageSummary,
  AdapterSkillContext,
  AdapterSkillSnapshot,
  AdapterAgent,
} from "@paperclipai/adapter-utils";

// Re-export Ralph-specific types
export type {
  RalphPaperclipAdapter,
  RalphAdapterConfig,
  HeartbeatEvent,
  RalphRunResult,
  CostEvent,
  Memory,
  RalphExecutionEvent,
  RalphEventHandler,
  HatCollection,
  Hat,
  MemoryBank,
  ScratchpadState,
  IssueUpdate,
  SearchMemoriesOptions,
} from "../types.js";

/**
 * Ralph Adapter Server 实现
 *
 * 提供完整的 Paperclip ↔ Ralph 集成能力：
 * - 任务执行
 * - 环境检测
 * - 技能列表
 */
export class RalphAdapterServer implements ServerAdapterModule {
  readonly adapterId: string;
  readonly version: string = "0.1.0";
  readonly type: string = "ralph_local";

  private ralphPath: string = "ralph";
  private workingDirectory: string = process.cwd();
  private debug: boolean = false;

  constructor() {
    this.adapterId = `ralph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 创建 ServerAdapterModule 实例
   */
  static create(): ServerAdapterModule {
    return new RalphAdapterServer();
  }

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";

    // Extract Ralph configuration from adapter config
    const ralphPath = (ctx.config.ralphPath as string) || "ralph";
    const workingDir = (ctx.config.workingDirectory as string) || this.workingDirectory;
    const hatCollection = (ctx.config.hatCollection as string) || "default";
    const defaultHat = (ctx.config.defaultHat as string) || undefined;
    const maxLoops = (ctx.config.maxLoops as number) || undefined;
    const timeoutSec = (ctx.config.timeoutSec as number) || 300;

    // Build Ralph command arguments
    const ralphArgs: string[] = ["run"];

    if (hatCollection) {
      ralphArgs.push("--hat", hatCollection);
    }

    if (defaultHat) {
      ralphArgs.push("--hat", defaultHat);
    }

    if (maxLoops) {
      ralphArgs.push("--max-loops", String(maxLoops));
    }

    // Add the task prompt from context
    const task = this.extractTaskFromContext(ctx);
    if (task) {
      ralphArgs.push("--prompt", task);
    }

    if (this.debug) {
      ralphArgs.push("--verbose");
    }

    try {
      await ctx.onLog("stdout", `[ralph-local] Executing: ${ralphPath} ${ralphArgs.join(" ")}\n`);

      const result = await this.executeRalphProcess(
        ralphPath,
        ralphArgs,
        workingDir,
        timeoutSec * 1000,
        ctx,
      );

      stdout = result.stdout;
      stderr = result.stderr;

      // Calculate usage (simplified - real implementation would parse Ralph output)
      const usage: UsageSummary = {
        inputTokens: this.estimateTokens(stdout),
        outputTokens: this.estimateTokens(stderr),
      };

      return {
        exitCode: result.exitCode,
        signal: result.signal || null,
        timedOut: result.timedOut,
        errorMessage: result.exitCode !== 0 ? stderr || "Ralph execution failed" : null,
        usage,
        sessionParams: {
          hatCollection,
          defaultHat,
          workingDir,
        },
        sessionDisplayId: this.adapterId,
        provider: "ralph",
        biller: null,
        model: "ralph-loop",
        billingType: null,
        costUsd: null,
        resultJson: {
          stdout: stdout.slice(0, 10000), // Limit size
          stderr: stderr.slice(0, 1000),
          exitCode: result.exitCode,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await ctx.onLog("stderr", `[ralph-local] Error: ${errorMessage}\n`);

      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage,
        errorCode: "RALPH_EXECUTION_ERROR",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
        },
        sessionParams: null,
        sessionDisplayId: this.adapterId,
        provider: "ralph",
        model: "ralph-loop",
        resultJson: { error: errorMessage },
      };
    }
  }

  async testEnvironment(
    ctx: AdapterEnvironmentTestContext,
  ): Promise<AdapterEnvironmentTestResult> {
    const checks: AdapterEnvironmentCheck[] = [];
    let status: "pass" | "warn" | "fail" = "pass";

    // Check if Ralph CLI is installed
    const ralphCheck = await this.checkRalphInstallation();
    checks.push(ralphCheck);
    if (ralphCheck.level === "error") {
      status = "fail";
    } else if (ralphCheck.level === "warn") {
      status = "warn";
    }

    // Check working directory if specified
    const workingDir = ctx.config?.workingDirectory as string | undefined;
    if (workingDir) {
      const dirCheck = await this.checkWorkingDirectory(workingDir);
      checks.push(dirCheck);
      if (dirCheck.level === "error") {
        status = "warn";
      }
    }

    // Check Ralph configuration
    const configCheck = await this.checkRalphConfig();
    checks.push(configCheck);

    return {
      adapterType: "ralph_local",
      status,
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  async listSkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
    // Ralph has built-in tools that can be used as "skills"
    const builtinSkills = [
      { name: "read", description: "Read file contents" },
      { name: "edit", description: "Edit file contents" },
      { name: "write", description: "Write/create files" },
      { name: "bash", description: "Execute shell commands" },
      { name: "glob", description: "Find files by pattern" },
      { name: "grep", description: "Search file contents" },
      { name: "task", description: "Create/subagent tasks" },
      { name: "memory", description: "Memory management" },
    ];

    const entries = builtinSkills.map((skill) => ({
      key: skill.name,
      runtimeName: skill.name,
      desired: true,
      managed: true,
      state: "installed" as const,
      origin: "company_managed" as const,
      originLabel: "Ralph built-in",
      detail: skill.description,
    }));

    return {
      adapterType: "ralph_local",
      supported: true,
      mode: "persistent" as const,
      desiredSkills: builtinSkills.map((s) => s.name),
      entries,
      warnings: [],
    };
  }

  /**
   * Execute Ralph process and return result
   */
  private async executeRalphProcess(
    ralphPath: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    ctx: AdapterExecutionContext,
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
  }> {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const proc = spawn(ralphPath, args, {
        cwd,
        env: {
          ...process.env,
          PAPERCLIP_RUN_ID: ctx.runId,
          PAPERCLIP_AGENT_ID: ctx.agent.id,
          PAPERCLIP_COMPANY_ID: ctx.agent.companyId || "",
        },
        shell: true,
      });

      // Report spawn info
      if (ctx.onSpawn) {
        ctx.onSpawn({
          pid: proc.pid || 0,
          processGroupId: null,
          startedAt: new Date().toISOString(),
        });
      }

      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
      }, timeoutMs);

      proc.stdout?.on("data", async (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        await ctx.onLog("stdout", text);
      });

      proc.stderr?.on("data", async (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        await ctx.onLog("stderr", text);
      });

      proc.on("close", (code, signal) => {
        clearTimeout(timeout);
        resolve({
          stdout,
          stderr,
          exitCode: code,
          signal: signal || null,
          timedOut,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        stderr += err.message;
        resolve({
          stdout,
          stderr,
          exitCode: 1,
          signal: null,
          timedOut: false,
        });
      });
    });
  }

  /**
   * Extract task from execution context
   */
  private extractTaskFromContext(ctx: AdapterExecutionContext): string {
    // Priority 1: Explicit task in context
    if (ctx.context?.task) {
      return String(ctx.context.task);
    }

    // Priority 2: Issue description
    if (ctx.context?.issueDescription) {
      return String(ctx.context.issueDescription);
    }

    // Priority 3: Instructions
    if (ctx.context?.instructions) {
      return String(ctx.context.instructions);
    }

    // Priority 4: Empty prompt - Ralph will use default behavior
    return "";
  }

  /**
   * Check if Ralph CLI is installed
   */
  private async checkRalphInstallation(): Promise<AdapterEnvironmentCheck> {
    return new Promise((resolve) => {
      const proc = spawn("ralph", ["--version"], { shell: true });

      let output = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      proc.on("close", (code) => {
        if (code === 0 && output.includes("ralph")) {
          resolve({
            code: "RALPH_INSTALLED",
            level: "info",
            message: `Ralph CLI is installed: ${output.trim()}`,
          });
        } else {
          resolve({
            code: "RALPH_NOT_INSTALLED",
            level: "error",
            message: "Ralph CLI is not installed or not in PATH",
            hint: "Install Ralph: npm install -g @ralph-orchestrator/ralph-cli",
          });
        }
      });

      proc.on("error", () => {
        resolve({
          code: "RALPH_NOT_FOUND",
          level: "error",
          message: "Could not find Ralph CLI",
          hint: "Install Ralph: npm install -g @ralph-orchestrator/ralph-cli",
        });
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        resolve({
          code: "RALPH_CHECK_TIMEOUT",
          level: "warn",
          message: "Ralph CLI check timed out",
        });
      }, 5000);
    });
  }

  /**
   * Check if working directory exists
   */
  private async checkWorkingDirectory(dir: string): Promise<AdapterEnvironmentCheck> {
    try {
      const { stat } = await import("node:fs/promises");
      const s = await stat(dir);
      if (s.isDirectory()) {
        return {
          code: "WORKING_DIR_OK",
          level: "info",
          message: `Working directory exists: ${dir}`,
        };
      }
      return {
        code: "WORKING_DIR_NOT_DIR",
        level: "error",
        message: `Path exists but is not a directory: ${dir}`,
      };
    } catch {
      return {
        code: "WORKING_DIR_MISSING",
        level: "warn",
        message: `Working directory does not exist: ${dir}`,
        hint: "Ralph will create the directory if possible",
      };
    }
  }

  /**
   * Check Ralph configuration
   */
  private async checkRalphConfig(): Promise<AdapterEnvironmentCheck> {
    try {
      const { stat } = await import("node:fs/promises");
      const configPaths = [
        join(process.env.HOME || "", ".ralph", "config.yml"),
        join(process.env.HOME || "", ".ralph", "config.yaml"),
        join(process.env.HOME || "", ".ralph.yml"),
        join(process.env.HOME || "", ".ralph.yaml"),
      ];

      for (const configPath of configPaths) {
        try {
          await stat(configPath);
          return {
            code: "RALPH_CONFIG_FOUND",
            level: "info",
            message: `Ralph config found: ${configPath}`,
          };
        } catch {
          // Continue to next path
        }
      }

      return {
        code: "RALPH_CONFIG_NOT_FOUND",
        level: "warn",
        message: "No Ralph config file found",
        hint: "Ralph will use default configuration",
      };
    } catch {
      return {
        code: "RALPH_CONFIG_CHECK_ERROR",
        level: "warn",
        message: "Error checking Ralph configuration",
      };
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create Ralph ServerAdapterModule
 */
export function createServerAdapter(): ServerAdapterModule {
  return new RalphAdapterServer();
}
