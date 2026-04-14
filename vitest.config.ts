import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/db",
      "packages/adapters/codex-local",
      "packages/adapters/opencode-local",
      "packages/adapters/ralph-local",
      "server",
      "ui",
      "cli",
    ],
  },
});
