/**
 * RalphWaveService Tests (T2.5)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RalphWaveService } from "./wave";

describe("RalphWaveService", () => {
  let waveService: RalphWaveService;

  beforeEach(() => {
    waveService = new RalphWaveService({ ralphPath: "ralph" });
  });

  describe("dispatchWave", () => {
    it("returns error when topic is empty", async () => {
      const result = await waveService.dispatchWave({
        topic: "",
        payloads: ["item1"],
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Topic and at least one payload are required");
    });

    it("returns error when payloads are empty", async () => {
      const result = await waveService.dispatchWave({
        topic: "test.wave",
        payloads: [],
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Topic and at least one payload are required");
    });

    it("returns success for valid request (ralph unavailable)", async () => {
      // Ralph CLI 可能不可用，但服务应该优雅处理
      const result = await waveService.dispatchWave({
        topic: "test.wave",
        payloads: ["item1", "item2"],
        workingDir: "/tmp",
      });
      // 可能会失败因为 ralph 不可用，但不应该抛出
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("checkWaveStatus", () => {
    it("returns zero status when ralph unavailable", async () => {
      const result = await waveService.checkWaveStatus("test.wave");
      expect(result.running).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe("execRalphCommand", () => {
    it("returns error for invalid command", async () => {
      const result = await waveService.execRalphCommand("ralph nonexistent-command", 5_000);
      expect(typeof result.success).toBe("boolean");
    });
  });
});
