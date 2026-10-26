import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const observations = vi.hoisted(() => ({
  discoveryEnv: undefined as Record<string, string> | undefined,
  modelsJson: undefined as unknown,
  probeEnv: undefined as Record<string, string> | undefined,
  shellCommands: [] as string[],
  shellEnv: undefined as Record<string, string> | undefined,
}));

vi.mock("./models.js", () => ({
  discoverPiModelsCached: vi.fn(async (input: { env?: Record<string, string> }) => {
    observations.discoveryEnv = input.env;
    const dir = input.env?.PI_CODING_AGENT_DIR;
    if (dir) {
      observations.modelsJson = JSON.parse(
        await fs.readFile(path.join(dir, "models.json"), "utf8"),
      );
    }
    return [{ id: "paperclip/demo", label: "paperclip/demo" }];
  }),
}));

vi.mock("./parse.js", () => ({
  parsePiJsonl: () => ({ errors: [], finalMessage: "hello", messages: ["hello"], usage: {} }),
}));

vi.mock("@paperclipai/adapter-utils/execution-target", async () => {
  const actual = await vi.importActual<typeof import("@paperclipai/adapter-utils/execution-target")>(
    "@paperclipai/adapter-utils/execution-target",
  );
  return {
    ...actual,
    ensureAdapterExecutionTargetDirectory: vi.fn(async () => undefined),
    maybeRunSandboxInstallCommand: vi.fn(async () => null),
    ensureAdapterExecutionTargetCommandResolvable: vi.fn(async () => undefined),
    runAdapterExecutionTargetShellCommand: vi.fn(async (
      _runId: string,
      _target: unknown,
      command: string,
      options: { env?: Record<string, string> },
    ) => {
      observations.shellCommands.push(command);
      observations.shellEnv = options.env;
      return { exitCode: 0, stdout: "", stderr: "", signal: null, timedOut: false };
    }),
    runAdapterExecutionTargetProcess: vi.fn(async (
      _runId: string,
      _target: unknown,
      _command: string,
      _args: string[],
      options: { env?: Record<string, string> },
    ) => {
      observations.probeEnv = options.env;
      return { exitCode: 0, stdout: "hello", stderr: "", signal: null, timedOut: false };
    }),
  };
});

import { testEnvironment } from "./test.js";

const providers = {
  paperclip: {
    baseUrl: "https://api.minimax.cn/anthropic",
    apiKey: "mm-key",
    api: "anthropic-messages",
    models: [{ id: "demo", name: "demo" }],
  },
};

describe("pi testEnvironment provider config", () => {
  it("materializes PAPERCLIP_PI_PROVIDERS for model discovery and the hello probe", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "pi_local",
      config: {
        model: "paperclip/demo",
        env: { PAPERCLIP_PI_PROVIDERS: JSON.stringify(providers) },
      },
    });

    expect(result.status).toBe("pass");
    const agentConfigDir = observations.discoveryEnv?.PI_CODING_AGENT_DIR;
    expect(agentConfigDir, "discovery must see the managed provider registry").toBeTruthy();
    expect(observations.modelsJson).toEqual({ providers });
    expect(observations.probeEnv?.PI_CODING_AGENT_DIR).toBe(agentConfigDir);
    // Probe-only temp dir: it must not outlive the test.
    await expect(fs.access(agentConfigDir!)).rejects.toThrow();
  });

  it("ships the provider registry into a remote environment and points the probe at it", async () => {
    observations.shellCommands = [];
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "pi_local",
      executionTarget: {
        kind: "remote",
        transport: "ssh",
        remoteCwd: "/srv/paperclip/workspace",
        spec: {
          host: "ssh.example.test",
          port: 22,
          username: "ssh-user",
          remoteCwd: "/srv/paperclip/workspace",
        },
      } as never,
      config: {
        model: "paperclip/demo",
        env: { PAPERCLIP_PI_PROVIDERS: JSON.stringify(providers) },
      },
    });

    expect(result.status).toBe("pass");
    const write = observations.shellCommands.find((command) => command.includes("models.json"));
    expect(write, "the registry must be written into the environment").toBeTruthy();
    expect(write).toContain("mkdir -p");
    expect(write).toContain("paperclip");
    const agentConfigDir = observations.probeEnv?.PI_CODING_AGENT_DIR;
    expect(agentConfigDir).toBeTruthy();
    expect(agentConfigDir).toContain(".paperclip-pi-agent-config-");
    // The probe-only copy is removed once the probe is done.
    expect(
      observations.shellCommands.some(
        (command) => command.startsWith("rm -rf") && command.includes(agentConfigDir!),
      ),
    ).toBe(true);
  });
});
