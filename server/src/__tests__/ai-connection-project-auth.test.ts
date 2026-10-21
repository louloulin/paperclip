import { afterEach, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as executionTarget from "@paperclipai/adapter-utils/execution-target";
import { assertManagedAiProjectAuth } from "../services/ai-connection-runtime.js";

/**
 * The project-auth guard, on its own: no database, no adapters. What it reads
 * is the account's own configuration layout on the host, which is exactly what
 * a test has to build before asserting anything about it.
 */

const temporaryRoots: string[] = [];
const previousHome = process.env.HOME;

afterEach(async () => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function tree(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pc-auth-boundary-"));
  temporaryRoots.push(root);
  return root;
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

const PROXY_SETTINGS = { env: { ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED" } };

it("reads the project's own settings and refuses the connection they override", async () => {
  const root = await tree();
  const repo = path.join(root, "repo");
  await fs.mkdir(path.join(repo, ".git"), { recursive: true });
  await writeJson(path.join(repo, ".claude", "settings.json"), PROXY_SETTINGS);

  await expect(assertManagedAiProjectAuth({ cwd: repo }, "anthropic")).rejects.toThrow(
    "Project authentication settings conflict",
  );
  // A subdirectory of the same project reaches the same file: the project root
  // is the boundary, not the directory the run starts in.
  const nested = path.join(repo, "packages", "app");
  await fs.mkdir(nested, { recursive: true });
  await expect(assertManagedAiProjectAuth({ cwd: nested }, "anthropic")).rejects.toThrow(
    "Project authentication settings conflict",
  );
});

it("does not read the account's own dotfiles as project configuration", async () => {
  const root = await tree();
  const home = path.join(root, "home");
  // The account configures a provider globally. A managed run never opens it —
  // the harness is handed a disposable config directory — so it is not a
  // conflict, and treating it as one blocks every managed connection on the
  // machine rather than the project.
  await writeJson(path.join(home, ".claude", "settings.json"), PROXY_SETTINGS);
  process.env.HOME = home;

  const repo = path.join(home, "work", "repo");
  await fs.mkdir(path.join(repo, ".git"), { recursive: true });
  await expect(assertManagedAiProjectAuth({ cwd: repo }, "anthropic")).resolves.toBeUndefined();

  // The same holds without a repository marker: the walk reaches the home
  // boundary and stops there.
  const plain = path.join(home, "work", "plain");
  await fs.mkdir(plain, { recursive: true });
  await expect(assertManagedAiProjectAuth({ cwd: plain }, "anthropic")).resolves.toBeUndefined();
});

it("treats a worktree's .git file as the project root", async () => {
  const root = await tree();
  const worktree = path.join(root, "worktree");
  await fs.mkdir(path.join(worktree, ".claude"), { recursive: true });
  // `git worktree add` writes a `.git` file, not a directory.
  await writeFile(path.join(worktree, ".git"), "gitdir: /tmp/pc-main/.git/worktrees/worktree\n");
  await writeJson(path.join(worktree, ".claude", "settings.json"), PROXY_SETTINGS);

  await expect(assertManagedAiProjectAuth({ cwd: worktree }, "anthropic")).rejects.toThrow(
    "Project authentication settings conflict",
  );
});

it("bounds the remote scan the same way, and reports a match as incompatible", async () => {
  const execute = vi.spyOn(executionTarget, "runAdapterExecutionTargetProcess");
  const target = { kind: "remote", transport: "sandbox", remoteCwd: "/workspace/project" } as Parameters<typeof assertManagedAiProjectAuth>[2];
  try {
    execute.mockResolvedValue({ exitCode: 42, stdout: "", stderr: "", signal: null, timedOut: false } as Awaited<ReturnType<typeof executionTarget.runAdapterExecutionTargetProcess>>);
    await expect(assertManagedAiProjectAuth({}, "openai", target)).rejects.toThrow(/project authentication settings/i);
    const args = execute.mock.calls[0][3];
    expect(args).toContain("/workspace/project");
    expect(args).toContain(".codex/config.toml");
    // Stops at the project root, and never enters $HOME.
    const script = args[1] as string;
    expect(script).toContain("$directory/.git");
    expect(script).toContain("$HOME");
    execute.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "", signal: null, timedOut: false } as Awaited<ReturnType<typeof executionTarget.runAdapterExecutionTargetProcess>>);
    await expect(assertManagedAiProjectAuth({}, "openai", target)).resolves.toBeUndefined();
    await expect(assertManagedAiProjectAuth({ args: ["--api-key=override"] }, "xai", target)).rejects.toThrow("overrides");
  } finally {
    execute.mockRestore();
  }
});
