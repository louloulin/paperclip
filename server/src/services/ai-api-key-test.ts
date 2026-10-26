import type { AiProvider } from "@paperclipai/shared";
import { aiVendorPresetForEndpoint } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";

/** Fixed provider endpoints; credentials are never sent to a caller-supplied URL or through a redirect. */
export async function validateAiApiKey(
  provider: AiProvider,
  key: string,
  request: typeof fetch = fetch,
) {
  const endpoints = {
    anthropic: "https://api.anthropic.com/v1/models?limit=1",
    openai: "https://api.openai.com/v1/models",
    openrouter: "https://openrouter.ai/api/v1/key",
    xai: "https://api.x.ai/v1/models",
    google: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
  };
  let response: Response;
  try {
    response = await request(endpoints[provider], {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers:
        provider === "google" ? { "x-goog-api-key": key } : provider === "anthropic"
          ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
          : { Authorization: `Bearer ${key}` },
    });
  } catch {
    throw unprocessable("Could not verify the account. Try again.", { code: "ai_connection_verification_failed" });
  }
  await response.body?.cancel();
  if (!response.ok)
    throw unprocessable(
      response.status === 401 || response.status === 403
        ? "The provider rejected this API key."
        : "The provider could not verify this account. Try again.",
      { code: response.status === 401 || response.status === 403 ? "ai_connection_api_key_rejected" : "ai_connection_verification_failed" },
    );
}

/** Cheap live check for a routing connection whose endpoint is one of the shipped
 *  vendor presets. Returns false when the routing does not name a known vendor —
 *  the caller keeps its existing (slower) verification path. Custom destinations
 *  are never fetched here: they are exercised inside the execution environment,
 *  and only the fixed preset hosts qualify for a control-plane call. The probe is
 *  a one-token completion on the routing's own surface, so it verifies the key,
 *  the endpoint, and the configured model in one round-trip. */
export async function validateAiVendorRoutingApiKey(
  routing: { protocol?: unknown; baseUrl?: unknown; models?: unknown },
  key: string,
  request: typeof fetch = fetch,
): Promise<boolean> {
  if (routing.protocol !== "messages" && routing.protocol !== "chat") return false;
  const baseUrl = typeof routing.baseUrl === "string" ? routing.baseUrl : "";
  const preset = aiVendorPresetForEndpoint(baseUrl);
  if (!preset) return false;
  // A preset serves both surfaces from different hosts; only the host that owns
  // the routing's wire format may answer the probe.
  const normalized = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  const surface = routing.protocol === "messages" ? "messages" : "chat";
  if (normalized !== preset.endpoints[surface].toLowerCase()) return false;
  const firstModel = Array.isArray(routing.models)
    ? (routing.models[0] as { id?: unknown } | undefined)
    : undefined;
  const model =
    typeof firstModel?.id === "string" && firstModel.id.trim()
      ? firstModel.id.trim()
      : preset.models[0];
  let response: Response;
  try {
    response = await request(
      `${normalized}/${surface === "messages" ? "v1/messages" : "chat/completions"}`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          "content-type": "application/json",
          ...(surface === "messages"
            ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
            : { authorization: `Bearer ${key}` }),
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      },
    );
  } catch {
    throw unprocessable("Could not verify the account. Try again.", { code: "ai_connection_verification_failed" });
  }
  await response.body?.cancel();
  if (!response.ok)
    throw unprocessable(
      response.status === 401 || response.status === 403
        ? "The provider rejected this API key."
        : "The provider could not verify this account. Try again.",
      { code: response.status === 401 || response.status === 403 ? "ai_connection_api_key_rejected" : "ai_connection_verification_failed" },
    );
  return true;
}
