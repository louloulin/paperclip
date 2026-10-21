import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverPiModelsCached,
  ensurePiModelConfiguredAndAvailable,
  listPiModels,
  resetPiModelsCacheForTests,
} from "./models.js";

describe("pi models", () => {
  afterEach(() => {
    delete process.env.PAPERCLIP_PI_COMMAND;
    resetPiModelsCacheForTests();
  });

  it("returns an empty list when discovery command is unavailable", async () => {
    process.env.PAPERCLIP_PI_COMMAND = "__paperclip_missing_pi_command__";
    await expect(listPiModels()).resolves.toEqual([]);
  });

  it("rejects when model is missing", async () => {
    await expect(
      ensurePiModelConfiguredAndAvailable({ model: "" }),
    ).rejects.toThrow("Pi requires `adapterConfig.model`");
  });

  it("rejects when discovery cannot run for configured model", async () => {
    process.env.PAPERCLIP_PI_COMMAND = "__paperclip_missing_pi_command__";
    await expect(
      ensurePiModelConfiguredAndAvailable({
        model: "xai/grok-4",
      }),
    ).rejects.toThrow();
  });

  it("does not embed the model catalogue when the configured model is unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "paperclip-pi-models-"));
    const command = join(directory, "pi");
    const modelIds = Array.from({ length: 13 }, (_, index) => `provider/model-${index}`);
    await writeFile(
      command,
      `#!/bin/sh\nprintf 'provider  model\\n';\n${modelIds
        .map((id) => {
          const [provider, model] = id.split("/");
          return `printf '${provider}  ${model}\\n'`;
        })
        .join(";\n")}\n`,
    );
    await chmod(command, 0o755);

    try {
      await expect(
        ensurePiModelConfiguredAndAvailable({
          command,
          model: "provider/missing",
        }),
      ).rejects.toMatchObject({
        message:
          "Configured Pi model is unavailable: provider/missing. 13 models are available; list them with `pi --list-models`.",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("parses context window and max output tokens from `pi --list-models`", async () => {
    const directory = await mkdtemp(join(tmpdir(), "paperclip-pi-models-"));
    const command = join(directory, "pi");
    // Reproduce pi's columnar `--list-models` output: provider, model,
    // context window, max-out, thinking level, image support.
    await writeFile(
      command,
      [
        "#!/bin/sh",
        "printf 'provider  model  context  max-out  thinking  images\\n'",
        "printf 'anthropic  claude-sonnet-4-6  200,000  64,000  high  yes\\n'",
        "printf 'xai  grok-4-fast  128000  32000  low  no\\n'",
        "printf 'openai  gpt-5  -  -  medium  no\\n'",
      ].join("\n"),
    );
    await chmod(command, 0o755);

    try {
      // discoverPiModelsCached() honors the explicit `command` argument, so
      // it points at our mock script rather than the default "pi" binary.
      const models = await discoverPiModelsCached({
        command,
        cwd: process.cwd(),
        env: {},
      });
      const byId = new Map(models.map((model) => [model.id, model]));

      const sonnet = byId.get("anthropic/claude-sonnet-4-6");
      expect(sonnet?.contextWindow).toBe(200_000);
      expect(sonnet?.maxTokens).toBe(64_000);

      const grok = byId.get("xai/grok-4-fast");
      expect(grok?.contextWindow).toBe(128_000);
      expect(grok?.maxTokens).toBe(32_000);

      // Unknown values (the "-" placeholders pi prints) must not surface
      // as 0 or NaN; the UI treats absence as "fall back to runtime size".
      const gpt = byId.get("openai/gpt-5");
      expect(gpt?.contextWindow).toBeUndefined();
      expect(gpt?.maxTokens).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
