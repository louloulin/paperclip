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
  AdapterSessionCodec,
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
  ScratchpadReadResult,
  IssueUpdate,
  SearchMemoriesOptions,
  MemorySyncResult,
  MemoryEntry,
  MemorySearchOptions,
} from "../types.js";

// Re-export budget types for external use
export type {
  RalphBudgetPrecheckResult,
  BudgetPolicyInfo,
  BudgetSoftWarning,
  BudgetHardStop,
} from "./budget.js";

// Re-export wave service for T2.5
export { RalphWaveService } from "./wave.js";
export type {
  WaveDispatchRequest,
  WaveEventResult,
  WaveResult,
} from "./wave.js";

// ---------------------------------------------------------------------------
// Ralph Skill Loader — T1.6: 统一 Skill 加载框架
// ---------------------------------------------------------------------------

/**
 * Ralph Skill 条目 — 从文件系统或 CLI 发现
 */
interface RalphSkillEntry {
  name: string;
  description: string;
  source: "builtin" | "ralph_cli" | "filesystem";
  sourcePath?: string;
  enabled?: boolean;
}

/**
 * RalphSkillLoader — 统一 Ralph Skills 加载框架
 *
 * 负责从多个来源发现和加载 Ralph Skills：
 * 1. Built-in Skills (内存中定义)
 * 2. Ralph CLI (`ralph tools skill list`)
 * 3. 文件系统 (`.ralph/skills/` 和 `~/.ralph/skills/`)
 *
 * 实现 Paperclip Skill System ↔ Ralph Tools Framework 统一加载。
 */
export class RalphSkillLoader {
  private cachedSkills: RalphSkillEntry[] | null = null;
  private cacheTime: number = 0;
  private readonly cacheTtlMs: number = 30_000; // 30s 缓存

  /**
   * 获取所有可用的 Ralph Skills
   * 合并 Built-in + CLI 发现 + 文件系统
   */
  async discoverSkills(): Promise<RalphSkillEntry[]> {
    const now = Date.now();
    if (this.cachedSkills && now - this.cacheTime < this.cacheTtlMs) {
      return this.cachedSkills;
    }

    const skills: RalphSkillEntry[] = [...BUILTIN_SKILL_ENTRIES.map((s) => ({
      name: s.name,
      description: s.description,
      source: "builtin" as const,
    }))];

    // 从 CLI 发现自定义 Skills
    const cliSkills = await this.discoverFromCLI();
    for (const skill of cliSkills) {
      if (!skills.find((s) => s.name === skill.name)) {
        skills.push(skill);
      }
    }

    // 从文件系统发现 Skills
    const fsSkills = await this.discoverFromFilesystem();
    for (const skill of fsSkills) {
      if (!skills.find((s) => s.name === skill.name)) {
        skills.push(skill);
      }
    }

    this.cachedSkills = skills;
    this.cacheTime = now;
    return skills;
  }

  /**
   * 从 Ralph CLI 发现 Skills
   * 执行 `ralph tools skill list` 并解析输出
   */
  private async discoverFromCLI(): Promise<RalphSkillEntry[]> {
    const skills: RalphSkillEntry[] = [];
    const configPaths = [
      join(process.env.HOME || "", ".ralph", "config.yml"),
      join(process.env.HOME || "", ".ralph", "config.yaml"),
    ];

    let ralphPath = "ralph";
    // 尝试从配置中发现 ralph 路径
    for (const configPath of configPaths) {
      try {
        const { readFile } = await import("node:fs/promises");
        const content = await readFile(configPath, "utf-8");
        const match = content.match(/ralph_path:\s*(.+)/);
        if (match) {
          ralphPath = match[1].trim();
          break;
        }
      } catch {
        // Continue
      }
    }

    try {
      const output = await this.execQuiet(`${ralphPath} tools skill list --format json`, 10_000);
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          skills.push({
            name: item.name || item.id || String(item),
            description: item.description || item.detail || "",
            source: "ralph_cli",
            sourcePath: item.sourcePath || item.path || undefined,
          });
        }
      }
    } catch {
      // Ralph CLI 不可用或输出非 JSON，忽略
    }

    return skills;
  }

  /**
   * 从文件系统发现 Skills
   * 扫描 `.ralph/skills/` 和 `~/.ralph/skills/` 目录
   */
  private async discoverFromFilesystem(): Promise<RalphSkillEntry[]> {
    const skills: RalphSkillEntry[] = [];
    const dirs = [
      join(process.env.HOME || "", ".ralph", "skills"),
      join(process.env.HOME || "", ".claude", "skills"),
    ];

    for (const dir of dirs) {
      try {
        const { readdir, readFile } = await import("node:fs/promises");
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillDir = join(dir, entry.name);

          // 尝试读取 skill.md 或 README.md 获取描述
          let description = `Ralph skill: ${entry.name}`;
          for (const mdFile of ["skill.md", "README.md", "description.md"]) {
            try {
              const mdPath = join(skillDir, mdFile);
              const { readFile: rf } = await import("node:fs/promises");
              const content = await rf(mdPath, "utf-8");
              // 取第一行作为描述
              const firstLine = content.split("\n").find((l) => l.trim() && !l.startsWith("#"));
              if (firstLine) {
                description = firstLine.trim().slice(0, 200);
                break;
              }
            } catch {
              // Continue
            }
          }

          skills.push({
            name: entry.name,
            description,
            source: "filesystem",
            sourcePath: skillDir,
          });
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return skills;
  }

  /**
   * 加载指定 Skill
   * 执行 `ralph tools skill load <name>`
   */
  async loadSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const output = await this.execQuiet(`ralph tools skill load ${skillName}`, 15_000);
      this.invalidateCache();
      return { success: output.includes("loaded") || output.includes("Loaded") || true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * 检查 Skill 是否可用
   */
  async isSkillAvailable(skillName: string): Promise<boolean> {
    const skills = await this.discoverSkills();
    return skills.some((s) => s.name === skillName);
  }

  /**
   * 获取 Skill 详情
   */
  async getSkillInfo(skillName: string): Promise<RalphSkillEntry | null> {
    const skills = await this.discoverSkills();
    return skills.find((s) => s.name === skillName) || null;
  }

  /**
   * 使缓存失效
   */
  invalidateCache(): void {
    this.cachedSkills = null;
    this.cacheTime = 0;
  }

  /**
   * 执行命令并返回 stdout (超时后忽略错误)
   */
  private execQuiet(cmd: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve) => {
      let stdout = "";
      const proc = spawn(cmd, { shell: true, timeout: timeoutMs });
      proc.stdout?.on("data", (chunk: Buffer) => {
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
}

/**
 * 全局 Skill Loader 实例 (单例)
 */
const globalSkillLoader = new RalphSkillLoader();

// ---------------------------------------------------------------------------
// Standalone skill functions (exported for server registry)
// ---------------------------------------------------------------------------

const BUILTIN_SKILL_ENTRIES: { name: string; description: string }[] = [
  { name: "read", description: "Read file contents" },
  { name: "edit", description: "Edit file contents" },
  { name: "write", description: "Write/create files" },
  { name: "bash", description: "Execute shell commands" },
  { name: "glob", description: "Find files by pattern" },
  { name: "grep", description: "Search file contents" },
  { name: "task", description: "Create/subagent tasks" },
  { name: "memory", description: "Memory management" },
];

/**
 * 构建 Ralph Skill Snapshot
 * 合并 Built-in Skills 和动态发现的 Custom Skills
 */
async function buildRalphSkillSnapshotWithDiscovery(
  desiredSkills: string[],
): Promise<AdapterSkillSnapshot> {
  // 获取动态发现的 Skills (包含 CLI 和文件系统来源)
  const discovered = await globalSkillLoader.discoverSkills();

  const entries: import("@paperclipai/adapter-utils").AdapterSkillEntry[] = [];
  const warnings: string[] = [];
  const builtinSet = new Set(BUILTIN_SKILL_ENTRIES.map((s) => s.name));
  const discoveredNames = new Set(discovered.map((s) => s.name));

  // Built-in Skills (始终安装)
  for (const skill of BUILTIN_SKILL_ENTRIES) {
    entries.push({
      key: skill.name,
      runtimeName: skill.name,
      desired: desiredSkills.includes(skill.name),
      managed: true,
      state: "installed" as const,
      origin: "company_managed" as const,
      originLabel: "Ralph built-in",
      detail: skill.description,
    });
  }

  // Custom Skills (从 CLI/文件系统发现)
  for (const skill of discovered) {
    if (builtinSet.has(skill.name)) continue; // 跳过 builtin
    entries.push({
      key: skill.name,
      runtimeName: skill.source === "builtin" ? skill.name : null,
      desired: desiredSkills.includes(skill.name),
      managed: skill.source === "filesystem",
      state: skill.enabled !== false ? "available" as const : "missing" as const,
      origin: skill.source === "ralph_cli" ? "external_unknown" as const : "user_installed" as const,
      originLabel: skill.source === "ralph_cli" ? "Ralph CLI" : skill.sourcePath || "Filesystem",
      detail: skill.description,
      sourcePath: skill.sourcePath || null,
    });
  }

  // 检查 desiredSkills 中是否有未发现的 Skill
  for (const skill of desiredSkills) {
    if (!discoveredNames.has(skill) && !builtinSet.has(skill)) {
      warnings.push(
        `Skill "${skill}" is not available — install with \`ralph tools skill load ${skill}\``,
      );
    }
  }

  return {
    adapterType: "ralph_local",
    supported: true,
    mode: "persistent" as const,
    desiredSkills,
    entries,
    warnings,
  };
}

export async function listRalphSkills(
  _ctx: AdapterSkillContext,
): Promise<AdapterSkillSnapshot> {
  return buildRalphSkillSnapshotWithDiscovery(BUILTIN_SKILL_ENTRIES.map((s) => s.name));
}

export async function syncRalphSkills(
  ctx: AdapterSkillContext,
  desiredSkills: string[],
): Promise<AdapterSkillSnapshot> {
  // T1.6: 尝试加载请求的 custom skills via Ralph CLI
  const discovered = await globalSkillLoader.discoverSkills();
  const builtinSet = new Set(BUILTIN_SKILL_ENTRIES.map((s) => s.name));

  for (const skillName of desiredSkills) {
    if (builtinSet.has(skillName)) continue; // 内置 Skill 不需要加载
    const isAvailable = await globalSkillLoader.isSkillAvailable(skillName);
    if (!isAvailable) {
      // 尝试通过 CLI 加载
      await globalSkillLoader.loadSkill(skillName);
    }
  }

  return buildRalphSkillSnapshotWithDiscovery(desiredSkills);
}

// ---------------------------------------------------------------------------
// Ralph Memory Bank → Paperclip Knowledge Base 同步 (T1.5)
// ---------------------------------------------------------------------------

/**
 * Ralph memories.md 文件路径
 * Ralph 将记忆存储在 .ralph/agent/memories.md
 */
function getRalphMemoriesPath(workingDir: string): string {
  return join(workingDir, ".ralph", "agent", "memories.md");
}

/**
 * 解析 Ralph memories.md 文件
 * 格式:
 * ## Patterns
 * ### mem-xxx
 * > content
 * <!-- tags: tag1, tag2 | created: YYYY-MM-DD -->
 */
function parseRalphMemoriesFile(
  content: string,
): Array<{ id: string; type: "pattern" | "decision" | "fix" | "context"; content: string; tags: string[]; createdAt: string }> {
  const memories: Array<{
    id: string;
    type: "pattern" | "decision" | "fix" | "context";
    content: string;
    tags: string[];
    createdAt: string;
  }> = [];

  // 定义各记忆类型的标题
  const sectionMap: Record<string, "pattern" | "decision" | "fix" | "context"> = {
    Patterns: "pattern",
    Decisions: "decision",
    Fixes: "fix",
    Context: "context",
  };

  // 按 ## 标题分割内容
  const sections = content.split(/(?=^##\s+)/m);

  for (const section of sections) {
    const sectionMatch = section.match(/^##\s+(\w+)\s*\n/);
    if (!sectionMatch) continue;

    const sectionTitle = sectionMatch[1] as keyof typeof sectionMap;
    const sectionType = sectionMap[sectionTitle];
    if (!sectionType) continue;

    // 提取该 section 下的所有记忆块
    // 格式: ### mem-id\n> content\n<!-- tags: ... | created: ... -->
    const memoryBlocks = section.slice(section.indexOf("\n", section.indexOf(sectionMatch[0])));

    // 匹配所有记忆块: ### mem-xxx\n> content\n<!-- tags: ... -->
    const blockRegex = /###\s+(mem-\d+-\w+)\s*\n>\s*([\s\S]*?)\n<!--\s*tags:\s*([^|]*?)\s*\|\s*created:\s*([^>]+?)\s*-->/gm;
    let match;

    while ((match = blockRegex.exec(memoryBlocks)) !== null) {
      const id = match[1].trim();
      const rawContent = match[2].trim();
      const tagsStr = match[3].trim();
      const createdAt = match[4].trim();

      // 清理内容: 移除引用标记 >
      const content = rawContent.replace(/^>\s*/gm, "").trim();

      // 解析标签
      const tags = tagsStr
        ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      memories.push({ id, type: sectionType, content, tags, createdAt });
    }
  }

  return memories;
}

/**
 * 读取 Ralph 记忆银行
 *
 * 从 .ralph/agent/memories.md 读取所有记忆条目，
 * 解析后返回结构化的 MemorySyncResult。
 *
 * @param workingDir Ralph 工作目录
 * @returns 记忆同步结果，包含所有记忆条目
 */
export async function readRalphMemories(
  workingDir: string,
): Promise<{
  memoriesPath: string;
  modifiedAt: string | null;
  entries: Array<{
    id: string;
    type: "pattern" | "decision" | "fix" | "context";
    content: string;
    tags: string[];
    createdAt: string;
  }>;
} | null> {
  const { readFile, stat } = await import("node:fs/promises");

  const memoriesPath = getRalphMemoriesPath(workingDir);

  try {
    const content = await readFile(memoriesPath, "utf-8");
    const stats = await stat(memoriesPath);

    const entries = parseRalphMemoriesFile(content);

    return {
      memoriesPath,
      modifiedAt: stats.mtime.toISOString(),
      entries,
    };
  } catch {
    // memories.md 不存在 - Ralph 还未创建任何记忆
    return null;
  }
}

/**
 * 搜索 Ralph 记忆
 *
 * 在 Ralph Memory Bank 中搜索符合条件的记忆条目。
 * 支持类型过滤、标签过滤和关键词搜索。
 *
 * @param workingDir Ralph 工作目录
 * @param options 搜索选项
 * @returns 符合条件的记忆条目
 */
export async function searchRalphMemories(
  workingDir: string,
  options: {
    type?: "pattern" | "decision" | "fix" | "context";
    tags?: string[];
    query?: string;
    limit?: number;
  } = {},
): Promise<
  Array<{
    id: string;
    type: "pattern" | "decision" | "fix" | "context";
    content: string;
    tags: string[];
    createdAt: string;
  }>
> {
  const memoriesData = await readRalphMemories(workingDir);

  if (!memoriesData) return [];

  let results = memoriesData.entries;

  // 类型过滤
  if (options.type) {
    results = results.filter((m) => m.type === options.type);
  }

  // 标签过滤
  if (options.tags && options.tags.length > 0) {
    const tagSet = new Set(options.tags.map((t) => t.toLowerCase()));
    results = results.filter((m) =>
      m.tags.some((t) => tagSet.has(t.toLowerCase()))
    );
  }

  // 关键词搜索
  if (options.query) {
    const queryLower = options.query.toLowerCase();
    results = results.filter(
      (m) =>
        m.content.toLowerCase().includes(queryLower) ||
        m.id.toLowerCase().includes(queryLower) ||
        m.tags.some((t) => t.toLowerCase().includes(queryLower)),
    );
  }

  // 数量限制
  if (typeof options.limit === "number" && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}

/**
 * 获取 Ralph 记忆统计摘要
 *
 * 返回各类型记忆的数量统计。
 *
 * @param workingDir Ralph 工作目录
 * @returns 记忆统计
 */
export async function getRalphMemoryStats(
  workingDir: string,
): Promise<{
  patterns: number;
  decisions: number;
  fixes: number;
  context: number;
  total: number;
} | null> {
  const memoriesData = await readRalphMemories(workingDir);

  if (!memoriesData) return null;

  const counts = { patterns: 0, decisions: 0, fixes: 0, context: 0 };

  for (const entry of memoriesData.entries) {
    if (entry.type === "pattern") counts.patterns++;
    else if (entry.type === "decision") counts.decisions++;
    else if (entry.type === "fix") counts.fixes++;
    else if (entry.type === "context") counts.context++;
  }

  return { ...counts, total: memoriesData.entries.length };
}

// ---------------------------------------------------------------------------
// RalphAdapterServer class
// ---------------------------------------------------------------------------

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

    // Merge sessionParams (from codec/resume) with config, sessionParams wins
    const sessionParams = ctx.runtime.sessionParams ?? {};
    const config = ctx.config ?? {};

    const ralphPath = (config.ralphPath as string) || "ralph";
    const workingDir =
      (sessionParams.workingDir as string) ||
      (config.workingDirectory as string) ||
      (ctx.context?.paperclipWorkspace as Record<string, unknown>)?.cwd as string ||
      this.workingDirectory;
    const hatCollection =
      (sessionParams.hatCollection as string) || (config.hatCollection as string) || "";
    const defaultHat =
      (sessionParams.defaultHat as string) || (config.defaultHat as string) || undefined;
    const maxLoops =
      (sessionParams.maxLoops as number) || (config.maxLoops as number) || undefined;
    const timeoutSec = (config.timeoutSec as number) || 300;

    // T2.2: Budget pre-check before Ralph execution
    // (Hard-stop is handled by Paperclip Heartbeat's getInvocationBlock,
    // this returns soft warnings and utilization info for Ralph's awareness)
    let budgetPrecheck: import("./budget.js").RalphBudgetPrecheckResult | null = null;
    if (process.env.PAPERCLIP_API_KEY && ctx.agent.companyId && ctx.agent.id) {
      try {
        const { RalphBudgetService } = await import("./budget.js");
        const budgetService = new RalphBudgetService({
          companyId: ctx.agent.companyId,
          agentId: ctx.agent.id,
        });
        budgetPrecheck = await budgetService.precheck(
          ctx.context?.projectId as string | null ?? null,
        );
      } catch {
        // Non-critical - budget check failure should not block execution
      }
    }

    // Build Ralph command arguments
    const ralphArgs: string[] = ["run"];

    if (hatCollection) {
      ralphArgs.push("--hats", hatCollection);
    }

    if (maxLoops) {
      ralphArgs.push("--max-loops", String(maxLoops));
    }

    // Add the task prompt from context
    let task = this.extractTaskFromContext(ctx);

    // If no prompt from context, try to fetch issue description from Paperclip
    if (!task && ctx.context?.issueId) {
      const issueId = String(ctx.context.issueId);
      const companyId = ctx.agent.companyId || "";
      if (companyId && process.env.PAPERCLIP_API_KEY) {
        const issueDescription = await this.fetchIssueDescription(issueId, companyId);
        if (issueDescription) {
          task = issueDescription;
          await ctx.onLog("stdout", `[ralph-local] Using issue description as prompt (issueId: ${issueId})\n`);
        }
      }
    }

    // If still no prompt, try to read PROMPT.md from the workspace directory
    if (!task) {
      const promptFromFile = await this.readPromptFile(workingDir);
      if (promptFromFile) {
        task = promptFromFile;
        await ctx.onLog("stdout", `[ralph-local] Using PROMPT.md from workspace\n`);
      }
    }

    // Write prompt to temp file to avoid shell escaping issues
    let promptFilePath: string | null = null;
    if (task) {
      try {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const { tmpdir } = await import("node:os");
        const promptDir = join(tmpdir(), "ralph-prompts");
        await mkdir(promptDir, { recursive: true });
        promptFilePath = join(promptDir, `prompt-${ctx.runId}.md`);
        await writeFile(promptFilePath, task, "utf-8");
        ralphArgs.push("--prompt-file", promptFilePath);
      } catch {
        // Fallback to inline prompt (may have escaping issues)
        ralphArgs.push("--prompt", task);
      }
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

      // Read Ralph scratchpad after execution
      const scratchpadData = await this.readRalphScratchpad(workingDir);

      // T1.5: Read Ralph memories for Paperclip Knowledge Base sync
      const memoriesData = await readRalphMemories(workingDir);

      // T1.4: Ralph → Paperclip task status writeback
      const writebackResult = await this.writebackTasksToPaperclip(
        workingDir,
        ctx.agent.companyId || "",
        ctx.agent.id,
        ctx.runId,
      );

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
          adapterId: this.adapterId,
          hatCollection,
          defaultHat,
          workingDir,
          scratchpadPath: scratchpadData?.path || null,
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
          scratchpad: scratchpadData?.content || null,
          scratchpadPath: scratchpadData?.path || null,
          scratchpadModifiedAt: scratchpadData?.modifiedAt || null,
          // T1.5: Ralph Memory Bank → Paperclip Knowledge Base sync data
          memories: memoriesData?.entries || [],
          memoriesPath: memoriesData?.memoriesPath || null,
          memoriesModifiedAt: memoriesData?.modifiedAt || null,
          memoriesCount: memoriesData?.entries.length ?? 0,
          // T1.4: Ralph → Paperclip task writeback result
          taskWriteback: writebackResult,
          // T2.2: Budget pre-check — soft warnings + utilization info (hard-stop handled by heartbeat)
          budgetCheck: budgetPrecheck,
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
   * Read Ralph scratchpad after execution
   * Ralph stores scratchpad in .ralph/agent/scratchpad.md relative to working directory
   */
  private async readRalphScratchpad(
    workingDir: string,
  ): Promise<{ content: string; path: string; modifiedAt: string } | null> {
    const { join } = await import("node:path");
    const { readFile, stat } = await import("node:fs/promises");

    const scratchpadPath = join(workingDir, ".ralph", "agent", "scratchpad.md");

    try {
      const content = await readFile(scratchpadPath, "utf-8");
      const stats = await stat(scratchpadPath);

      // Truncate scratchpad content to avoid bloating result
      const maxLength = 50000; // 50KB max
      const truncatedContent =
        content.length > maxLength
          ? content.slice(0, maxLength) + "\n\n[...scratchpad truncated...]"
          : content;

      return {
        content: truncatedContent,
        path: scratchpadPath,
        modifiedAt: stats.mtime.toISOString(),
      };
    } catch {
      // Scratchpad doesn't exist yet - this is normal for first run
      return null;
    }
  }

  /**
   * Read PROMPT.md file from workspace directory
   * Used as fallback when no prompt is provided in context
   */
  private async readPromptFile(workingDir: string): Promise<string | null> {
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const promptPath = join(workingDir, "PROMPT.md");
      const content = await readFile(promptPath, "utf-8");
      return content.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch issue description from Paperclip API
   * Used when no prompt is provided in context but an issueId is available
   */
  private async fetchIssueDescription(issueId: string, companyId: string): Promise<string | null> {
    const apiUrl =
      process.env.PAPERCLIP_API_URL ||
      `${process.env.PAPERCLIP_SERVER_URL || "http://localhost:3000"}/api`;
    const apiKey = process.env.PAPERCLIP_API_KEY;
    if (!apiKey) return null;

    try {
      const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/issues/${encodeURIComponent(issueId)}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) return null;
      const issue = await response.json() as { description?: string | null; title?: string | null; body?: string | null };
      return issue.description || issue.body || issue.title || null;
    } catch {
      return null;
    }
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

  /**
   * T1.4: Ralph → Paperclip 任务状态回写
   *
   * 在 Ralph 执行完成后，读取 Ralph 的任务文件，
   * 将完成的任务同步到 Paperclip Issue 系统。
   *
   * @param workingDir Ralph 工作目录
   * @param companyId Paperclip 公司 ID
   * @param agentId Paperclip Agent ID
   * @param runId Paperclip Run ID
   * @returns 回写结果摘要
   */
  private async writebackTasksToPaperclip(
    workingDir: string,
    companyId: string,
    agentId: string,
    runId: string,
  ): Promise<{
    enabled: boolean;
    processed: number;
    updated: number;
    errors: string[];
  }> {
    // 如果没有 Paperclip API Key，跳过回写
    if (!process.env.PAPERCLIP_API_KEY || !companyId) {
      return {
        enabled: false,
        processed: 0,
        updated: 0,
        errors: [],
      };
    }

    try {
      const writebackService = new RalphTaskWritebackService({
        workingDir,
        companyId,
        agentId,
        runId,
      });

      const result = await writebackService.writeback();

      return {
        enabled: true,
        processed: result.processed,
        updated: result.updated,
        errors: result.errors,
      };
    } catch (err) {
      // 回写失败不应该影响执行结果 — 记录错误并返回
      return {
        enabled: true,
        processed: 0,
        updated: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }
}

/**
 * Create Ralph ServerAdapterModule
 */
export function createServerAdapter(): ServerAdapterModule {
  return new RalphAdapterServer();
}

// ---------------------------------------------------------------------------
// Ralph → Paperclip 任务状态回写 (T1.4)
// ---------------------------------------------------------------------------

/**
 * Ralph 任务条目 — 从 tasks.jsonl 读取
 */
export interface RalphTaskEntry {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "closed" | "failed";
  key?: string;
  priority?: number;
  blocked_by?: string[];
  loop_id?: string;
  created: string;
  started?: string;
  closed?: string;
}

/**
 * Paperclip Issue 状态映射
 * 将 Ralph 任务状态映射到 Paperclip Issue 状态
 */
function mapRalphStatusToPaperclip(
  status: RalphTaskEntry["status"],
): "done" | "in_progress" | "blocked" | "backlog" | "in_review" {
  switch (status) {
    case "closed":
      return "done";
    case "in_progress":
      return "in_progress";
    case "failed":
      return "blocked";
    default:
      return "backlog";
  }
}

/**
 * 从 Ralph task key 中提取 Paperclip Issue ID
 * 支持格式: pc:issue-{uuid}, spec:{key}, task:{key}
 *
 * - `pc:issue-{uuid}`: 显式映射到 Paperclip Issue UUID
 * - `spec:{key}`: 映射到 spec:{key} 格式的 Issue
 * - 其他格式暂不支持
 */
function extractPaperclipIssueId(task: RalphTaskEntry): string | null {
  const key = task.key;
  if (!key) return null;

  // 格式: pc:issue-{uuid} — 直接映射到 Paperclip Issue UUID
  const pcMatch = key.match(/^pc:issue-([0-9a-f-]{36,})$/i);
  if (pcMatch) return pcMatch[1];

  // 格式: pc:{uuid} — 简写格式
  const pcShortMatch = key.match(/^pc:([0-9a-f-]{36,})$/i);
  if (pcShortMatch) return pcShortMatch[1];

  return null;
}

/**
 * Ralph Task Writeback Service
 *
 * 负责在 Ralph 执行完成后，将任务状态回写到 Paperclip。
 *
 * 工作流程:
 * 1. 读取 Ralph tasks.jsonl 获取已完成任务
 * 2. 与上次处理记录对比，找出新增完成的任务
 * 3. 对每个任务，调用 Paperclip API:
 *    - 更新 Issue 状态 (done/blocked/in_progress)
 *    - 添加任务结果评论
 * 4. 更新处理进度记录
 *
 * 任务→Issue 映射通过 task key 实现:
 * - `pc:issue-{uuid}`: 直接映射到 Paperclip Issue UUID
 */
export class RalphTaskWritebackService {
  private apiUrl: string;
  private apiKey: string;
  private companyId: string;
  private agentId: string;
  private runId: string;
  private workingDir: string;

  /**
   * 创建 Task Writeback Service
   * 从环境变量读取 Paperclip API 配置
   */
  constructor(options: {
    workingDir: string;
    apiUrl?: string;
    apiKey?: string;
    companyId: string;
    agentId: string;
    runId?: string;
  }) {
    this.workingDir = options.workingDir;
    this.apiUrl =
      options.apiUrl ||
      process.env.PAPERCLIP_API_URL ||
      `${process.env.PAPERCLIP_SERVER_URL || "http://localhost:3000"}/api`;
    this.apiKey =
      options.apiKey || process.env.PAPERCLIP_API_KEY || "";
    this.companyId = options.companyId;
    this.agentId = options.agentId;
    this.runId = options.runId || process.env.PAPERCLIP_RUN_ID || "";
  }

  /**
   * 获取任务回写 marker 文件路径
   * 存储上次处理的最新任务 ID，用于断点续传
   */
  private getMarkerPath(): string {
    const { join } = require("node:path");
    return join(this.workingDir, ".ralph", "agent", ".task_writeback_marker.json");
  }

  /**
   * 读取上次处理的进度
   * 返回上次已处理的最新任务关闭时间戳
   */
  private async readMarker(): Promise<string | null> {
    try {
      const { readFile } = await import("node:fs/promises");
      const markerPath = this.getMarkerPath();
      const content = await readFile(markerPath, "utf-8");
      const marker = JSON.parse(content);
      return marker.lastProcessedAt || null;
    } catch {
      return null;
    }
  }

  /**
   * 保存处理进度
   */
  private async writeMarker(lastProcessedAt: string): Promise<void> {
    try {
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      const markerPath = this.getMarkerPath();
      await mkdir(dirname(markerPath), { recursive: true });
      await writeFile(markerPath, JSON.stringify({ lastProcessedAt, updatedAt: new Date().toISOString() }), "utf-8");
    } catch {
      // Ignore write errors - non-critical
    }
  }

  /**
   * 读取 Ralph 任务文件
   * 返回所有已完成的任务（状态: closed, failed）
   */
  private async readCompletedTasks(): Promise<RalphTaskEntry[]> {
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const tasksPath = join(this.workingDir, ".ralph", "agent", "tasks.jsonl");

      const content = await readFile(tasksPath, "utf-8");
      const lines = content.split("\n").filter((l: string) => l.trim());

      const tasks: RalphTaskEntry[] = [];
      for (const line of lines) {
        try {
          const task = JSON.parse(line) as RalphTaskEntry;
          if (task.status === "closed" || task.status === "failed") {
            tasks.push(task);
          }
        } catch {
          // Skip malformed lines
        }
      }

      // 按关闭时间排序，最新的在前
      tasks.sort((a, b) => {
        const aTime = a.closed ? new Date(a.closed).getTime() : 0;
        const bTime = b.closed ? new Date(b.closed).getTime() : 0;
        return bTime - aTime;
      });

      return tasks;
    } catch {
      return [];
    }
  }

  /**
   * 调用 Paperclip API
   */
  private async paperclipRequest(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error("PAPERCLIP_API_KEY not available — cannot write back to Paperclip");
    }

    const url = new URL(path, this.apiUrl.replace(/\/+$/, ""));
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (this.runId) {
      headers["X-Paperclip-Run-Id"] = this.runId;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      const errorMsg =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as Record<string, unknown>).error)
          : `${method} ${path} failed with ${response.status}`;
      throw new Error(errorMsg);
    }

    return parsed;
  }

  /**
   * 更新 Paperclip Issue 状态
   */
  private async updateIssueStatus(
    issueId: string,
    status: ReturnType<typeof mapRalphStatusToPaperclip>,
    task: RalphTaskEntry,
  ): Promise<void> {
    const updateBody: Record<string, unknown> = { status };

    await this.paperclipRequest("PATCH", `/issues/${encodeURIComponent(issueId)}`, updateBody);
  }

  /**
   * 向 Paperclip Issue 添加评论
   */
  private async addIssueComment(
    issueId: string,
    task: RalphTaskEntry,
  ): Promise<void> {
    const closedAt = task.closed ? new Date(task.closed).toLocaleString() : "unknown";
    const duration = this.calcDuration(task.started, task.closed);

    const body = [
      `## Ralph 任务完成报告`,
      ``,
      `**任务**: ${task.title}`,
      `**状态**: ${task.status === "closed" ? "✅ 完成" : "❌ 失败"}`,
      `**完成时间**: ${closedAt}`,
      duration ? `**执行时长**: ${duration}` : "",
      task.description ? `**描述**: ${task.description}` : "",
      ``,
      `> 此评论由 Ralph Adapter 自动生成 (task: ${task.id})`,
    ]
      .filter(Boolean)
      .join("\n");

    await this.paperclipRequest("POST", `/issues/${encodeURIComponent(issueId)}/comments`, { body });
  }

  /**
   * 计算任务执行时长
   */
  private calcDuration(started?: string, closed?: string): string | null {
    if (!started || !closed) return null;
    try {
      const start = new Date(started).getTime();
      const end = new Date(closed).getTime();
      const ms = end - start;
      if (ms < 0) return null;
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    } catch {
      return null;
    }
  }

  /**
   * 报告 Ralph 执行成本到 Paperclip
   * 通过 POST /api/cost-events
   */
  private async reportCost(
    task: RalphTaskEntry,
    issueId?: string,
  ): Promise<void> {
    if (!issueId) return;

    const costEvent = {
      issueId,
      agentId: this.agentId,
      companyId: this.companyId,
      eventId: `ralph-task-${task.id}-${Date.now()}`,
      costType: "compute",
      amount: 1,
      currency: "tasks",
      timestamp: task.closed || new Date().toISOString(),
      breakdown: {
        computeSeconds: this.calcDurationSeconds(task.started, task.closed),
      },
    };

    try {
      await this.paperclipRequest("POST", "/cost-events", costEvent);
    } catch {
      // Cost reporting is best-effort — don't fail the writeback
    }
  }

  private calcDurationSeconds(started?: string, closed?: string): number {
    if (!started || !closed) return 0;
    try {
      const start = new Date(started).getTime();
      const end = new Date(closed).getTime();
      return Math.max(0, Math.floor((end - start) / 1000));
    } catch {
      return 0;
    }
  }

  /**
   * 执行任务回写
   * 扫描新完成的任务，同步到 Paperclip
   *
   * @returns 回写的任务数量
   */
  async writeback(): Promise<{
    processed: number;
    updated: number;
    errors: string[];
  }> {
    if (!this.apiKey) {
      return { processed: 0, updated: 0, errors: ["No API key — skipped"] };
    }

    const tasks = await this.readCompletedTasks();
    if (tasks.length === 0) {
      return { processed: 0, updated: 0, errors: [] };
    }

    const markerTime = await this.readMarker();
    const errors: string[] = [];
    let updated = 0;

    for (const task of tasks) {
      // Skip tasks already processed (compare by closed timestamp)
      if (markerTime && task.closed) {
        const taskTime = new Date(task.closed).getTime();
        const markerTimestamp = new Date(markerTime).getTime();
        if (taskTime <= markerTimestamp) continue;
      }

      // Extract Paperclip Issue ID from task key
      const issueId = extractPaperclipIssueId(task);
      if (!issueId) {
        // No mapping — skip (task doesn't have a linked Paperclip Issue)
        continue;
      }

      try {
        // Update issue status
        const paperclipStatus = mapRalphStatusToPaperclip(task.status);
        await this.updateIssueStatus(issueId, paperclipStatus, task);

        // Add completion comment
        await this.addIssueComment(issueId, task);

        // Report cost
        await this.reportCost(task, issueId);

        updated++;
      } catch (err) {
        const msg = `Task ${task.id} → Issue ${issueId}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
      }

      // Update marker after each successful writeback
      if (task.closed) {
        await this.writeMarker(task.closed);
      }
    }

    return { processed: tasks.length, updated, errors };
  }
}

/**
 * 创建 Task Writeback Service 实例
 * 从执行上下文和环境变量初始化
 */
function createWritebackService(options: {
  workingDir: string;
  companyId: string;
  agentId: string;
  runId?: string;
}): RalphTaskWritebackService {
  return new RalphTaskWritebackService({
    workingDir: options.workingDir,
    companyId: options.companyId,
    agentId: options.agentId,
    runId: options.runId,
  });
}

// ---------------------------------------------------------------------------
// Standalone server functions (exported for Paperclip server registry)
// Matches the same signature as other adapters (claude-local, codex-local, etc.)
// ---------------------------------------------------------------------------

/**
 * Ralph adapter execute function — wraps RalphAdapterServer.execute()
 * This is the main entry point called by Paperclip's heartbeat service
 * when running a Ralph agent.
 */
export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  return createServerAdapter().execute(ctx);
}

/**
 * Ralph adapter testEnvironment function — wraps RalphAdapterServer.testEnvironment()
 * Validates that Ralph CLI is installed and the working directory is accessible.
 */
export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  return createServerAdapter().testEnvironment(ctx);
}

/**
 * Helper to read a non-empty string from an unknown value, trying multiple keys.
 */
function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Session codec for Ralph adapter.
 * Serializes/deserializes Ralph-specific session params:
 * - hatCollection: Hat Collection name
 * - defaultHat: Default Hat name
 * - workingDir: Working directory
 * - maxLoops: Max loop iterations
 * - adapterId: Ralph adapter instance ID
 * - scratchpadPath: Path to Ralph scratchpad file
 */
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const adapterId =
      readNonEmptyString(record.adapterId) ?? readNonEmptyString(record.adapter_id);
    if (!adapterId) return null;

    const hatCollection =
      readNonEmptyString(record.hatCollection) ??
      readNonEmptyString(record.hat_collection);
    const defaultHat =
      readNonEmptyString(record.defaultHat) ?? readNonEmptyString(record.default_hat);
    const workingDir =
      readNonEmptyString(record.workingDir) ??
      readNonEmptyString(record.working_dir) ??
      readNonEmptyString(record.cwd);
    const maxLoops = record.maxLoops ?? record.max_loops;
    const timeoutSec = record.timeoutSec ?? record.timeout_sec;
    const scratchpadPath = readNonEmptyString(record.scratchpadPath);

    return {
      adapterId,
      ...(hatCollection ? { hatCollection } : {}),
      ...(defaultHat ? { defaultHat } : {}),
      ...(workingDir ? { workingDir } : {}),
      ...(typeof maxLoops === "number" ? { maxLoops } : {}),
      ...(typeof timeoutSec === "number" ? { timeoutSec } : {}),
      ...(scratchpadPath ? { scratchpadPath } : {}),
    };
  },

  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const adapterId =
      readNonEmptyString(params.adapterId) ?? readNonEmptyString(params.adapter_id);
    if (!adapterId) return null;

    const hatCollection =
      readNonEmptyString(params.hatCollection) ??
      readNonEmptyString(params.hat_collection);
    const defaultHat =
      readNonEmptyString(params.defaultHat) ?? readNonEmptyString(params.default_hat);
    const workingDir =
      readNonEmptyString(params.workingDir) ??
      readNonEmptyString(params.working_dir) ??
      readNonEmptyString(params.cwd);
    const maxLoops = params.maxLoops ?? params.max_loops;
    const timeoutSec = params.timeoutSec ?? params.timeout_sec;
    const scratchpadPath = readNonEmptyString(params.scratchpadPath);

    return {
      adapterId,
      ...(hatCollection ? { hatCollection } : {}),
      ...(defaultHat ? { defaultHat } : {}),
      ...(workingDir ? { workingDir } : {}),
      ...(typeof maxLoops === "number" ? { maxLoops } : {}),
      ...(typeof timeoutSec === "number" ? { timeoutSec } : {}),
      ...(scratchpadPath ? { scratchpadPath } : {}),
    };
  },

  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return (
      readNonEmptyString(params.adapterId) ??
      readNonEmptyString(params.adapter_id) ??
      null
    );
  },
};
