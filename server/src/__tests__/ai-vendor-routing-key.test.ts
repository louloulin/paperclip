import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors.js";
import { validateAiVendorRoutingApiKey } from "../services/ai-api-key-test.js";

function jsonResult(status: number): Response {
  return new Response("{}", { status });
}

describe("validateAiVendorRoutingApiKey", () => {
  it("probes the preset's messages surface with the routing credential", async () => {
    const request = vi.fn(async () => jsonResult(200));
    const applied = await validateAiVendorRoutingApiKey(
      {
        protocol: "messages",
        baseUrl: "https://api.minimax.cn/anthropic",
        models: [{ id: "MiniMax-M3" }],
      },
      "mm-key",
      request as unknown as typeof fetch,
    );
    expect(applied).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.minimax.cn/anthropic/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("mm-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "MiniMax-M3",
      max_tokens: 1,
    });
  });

  it("probes the chat surface with a bearer token on its own host", async () => {
    const request = vi.fn(async () => jsonResult(200));
    const applied = await validateAiVendorRoutingApiKey(
      {
        protocol: "chat",
        baseUrl: "https://api.deepseek.com",
        models: [{ id: "deepseek-v4-pro" }],
      },
      "ds-key",
      request as unknown as typeof fetch,
    );
    expect(applied).toBe(true);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ds-key");
  });

  it("skips a surface/host mismatch without fetching", async () => {
    const request = vi.fn(async () => jsonResult(200));
    const applied = await validateAiVendorRoutingApiKey(
      {
        protocol: "messages",
        // The chat host cannot answer a messages probe.
        baseUrl: "https://api.minimax.cn/v1",
        models: [],
      },
      "mm-key",
      request as unknown as typeof fetch,
    );
    expect(applied).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("skips custom destinations without fetching", async () => {
    const request = vi.fn(async () => jsonResult(200));
    const applied = await validateAiVendorRoutingApiKey(
      {
        protocol: "messages",
        baseUrl: "https://gateway.example.com/anthropic",
        models: [],
      },
      "key",
      request as unknown as typeof fetch,
    );
    expect(applied).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a revoked key", async () => {
    await expect(
      validateAiVendorRoutingApiKey(
        {
          protocol: "messages",
          baseUrl: "https://api.minimax.cn/anthropic",
          models: [{ id: "MiniMax-M3" }],
        },
        "stale",
        (async () => jsonResult(401)) as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      status: 422,
      details: { code: "ai_connection_api_key_rejected" },
    });
  });

  it("falls back to the preset's suggested model when the routing has none", async () => {
    const request = vi.fn(async () => jsonResult(200));
    await validateAiVendorRoutingApiKey(
      { protocol: "messages", baseUrl: "https://api.minimax.cn/anthropic/" },
      "mm-key",
      request as unknown as typeof fetch,
    );
    const [, init] = request.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe("MiniMax-M3.1-Flash");
  });

  it("classifies a network failure as verification failed", async () => {
    await expect(
      validateAiVendorRoutingApiKey(
        {
          protocol: "messages",
          baseUrl: "https://api.minimax.cn/anthropic",
          models: [{ id: "MiniMax-M3" }],
        },
        "mm-key",
        (async () => {
          throw new Error("offline");
        }) as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });
});
