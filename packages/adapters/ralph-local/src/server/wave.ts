/**
 * Ralph Wave Dispatch Service (T2.5)
 *
 * Ralph 并行任务分发服务。
 * 提供 Wave Dispatch 功能：
 * - 创建 wave 并分发多个并行任务
 * - 通过 `ralph wave emit <topic> --payloads "p1" "p2" "p3"` 执行
 * - 跟踪 wave 状态和结果
 *
 * 遵循与 RalphBudgetService 相同的 API 调用模式。
 */

import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaveDispatchRequest {
  topic: string;
  payloads: string[];
  workingDir?: string;
}

export interface WaveEventResult {
  id: string;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  agentId?: string;
  runId?: string;
  errorMessage?: string;
  processedAt?: string;
}

export interface WaveResult {
  id: string;
  topic: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  status: "dispatching" | "running" | "completed" | "failed";
  events: WaveEventResult[];
  createdAt: string;
  finishedAt?: string;
}

// ---------------------------------------------------------------------------
// RalphWaveService
// ---------------------------------------------------------------------------

export class RalphWaveService {
  private readonly ralphPath: string;
  private readonly defaultWorkingDir: string;

  constructor(opts?: { ralphPath?: string; workingDir?: string }) {
    this.ralphPath = opts?.ralphPath || "ralph";
    this.defaultWorkingDir = opts?.workingDir || process.cwd();
  }

  /**
   * Dispatch a wave of events via Ralph CLI
   *
   * 执行 `ralph wave emit <topic> --payloads "p1" "p2" "p3"`
   * 每个 payload 创建一个独立的并行执行任务
   */
  async dispatchWave(req: WaveDispatchRequest): Promise<{
    success: boolean;
    waveId?: string;
    error?: string;
    output?: string;
  }> {
    const workingDir = req.workingDir || this.defaultWorkingDir;

    if (!req.topic || req.payloads.length === 0) {
      return { success: false, error: "Topic and at least one payload are required" };
    }

    const payloads = req.payloads.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(" ");
    const cmd = `ralph wave emit "${req.topic.replace(/"/g, '\\"')}" --payloads ${payloads}`;

    try {
      const output = await this.execQuiet(cmd, 60_000, workingDir);
      return {
        success: true,
        output,
        waveId: this.extractWaveId(output),
      };
    } catch (err) {
      return {
        success: false,
        error: String(err),
      };
    }
  }

  /**
   * Check Ralph wave status via Ralph CLI
   */
  async checkWaveStatus(topic: string): Promise<{
    running: number;
    completed: number;
    failed: number;
    output: string;
  }> {
    const cmd = `ralph wave status "${topic.replace(/"/g, '\\"')}"`;

    try {
      const output = await this.execQuiet(cmd, 10_000, this.defaultWorkingDir);
      return this.parseWaveStatus(output);
    } catch {
      return { running: 0, completed: 0, failed: 0, output: "" };
    }
  }

  /**
   * Execute a custom Ralph command
   */
  async execRalphCommand(
    cmd: string,
    timeoutMs: number = 30_000,
    workingDir?: string,
  ): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const output = await this.execQuiet(cmd, timeoutMs, workingDir || this.defaultWorkingDir);
      return { success: true, output };
    } catch (err) {
      return { success: false, output: "", error: String(err) };
    }
  }

  /**
   * 执行命令并返回 stdout (超时后忽略错误)
   */
  private execQuiet(cmd: string, timeoutMs: number, cwd: string): Promise<string> {
    return new Promise((resolve) => {
      let stdout = "";
      const proc = spawn(cmd, {
        shell: true,
        timeout: timeoutMs,
        cwd,
        env: { ...process.env },
      });
      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.on("close", () => resolve(stdout.trim()));
      proc.on("error", () => resolve(""));
      setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // Ignore
        }
        resolve(stdout.trim());
      }, timeoutMs);
    });
  }

  /**
   * 从 ralph 输出中提取 wave ID
   */
  private extractWaveId(output: string): string | undefined {
    // 尝试从输出中找到 wave_id
    const match = output.match(/wave[_-]?id[:\s]+([a-zA-Z0-9-]+)/i);
    if (match) return match[1];

    // 尝试从 "Created wave" 行提取
    const createdMatch = output.match(/created wave[:\s]+([a-zA-Z0-9-]+)/i);
    if (createdMatch) return createdMatch[1];

    // 生成一个临时 ID 用于追踪
    const timestampMatch = output.match(/\d{10,}/);
    if (timestampMatch) return `wave-${timestampMatch[0]}`;

    return undefined;
  }

  /**
   * 解析 wave status 输出
   */
  private parseWaveStatus(output: string): { running: number; completed: number; failed: number; output: string } {
    const runningMatch = output.match(/running[:\s]+(\d+)/i);
    const completedMatch = output.match(/completed[:\s]+(\d+)/i);
    const failedMatch = output.match(/failed[:\s]+(\d+)/i);

    return {
      running: runningMatch ? parseInt(runningMatch[1], 10) : 0,
      completed: completedMatch ? parseInt(completedMatch[1], 10) : 0,
      failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
      output,
    };
  }
}
