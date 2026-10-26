# More AI providers (MiniMax China, DeepSeek, Zhipu, Moonshot, DashScope)

Date: 2026-10-19
Status: implemented

## Goal

Let the board connect a wider set of Chinese and third-party LLM vendors from
the **Connect a provider** wall without adding a new adapter, a new billing
provider, or a new Apps catalog entry per vendor.

Initial roster (request from `lin`, MiniMax China first):

| Vendor | Anthropic Messages base | Chat Completions base |
| --- | --- | --- |
| MiniMax (China) | `https://api.minimax.cn/anthropic` | `https://api.minimax.cn/v1` |
| DeepSeek | `https://api.deepseek.com/anthropic` | `https://api.deepseek.com` |
| Zhipu GLM | `https://open.bigmodel.cn/api/anthropic` | `https://open.bigmodel.cn/api/paas/v4` |
| Moonshot Kimi (China) | `https://api.moonshot.cn/anthropic` | `https://api.moonshot.cn/v1` |
| Aliyun DashScope (Qwen) | `https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

## Research evidence

- MiniMax's own quickstart prints `ANTHROPIC_BASE_URL=https://api.minimax.cn/anthropic`
  and `OPENAI_BASE_URL=https://api.minimax.cn/v1` and recommends the Anthropic
  surface for coding agents. Its model list currently leads with
  `MiniMax-M3.1-Flash` and `MiniMax-M3` (M2.7 / M2.5 families are historical).
  Sources: `platform.minimaxi.com/docs/api-reference/text-anthropic-api`,
  `.../text-openai-api`, `.../docs/guides/models-intro.md`.
- DeepSeek documents `base_url (OpenAI) = https://api.deepseek.com` and
  `base_url (Anthropic) = https://api.deepseek.com/anthropic`, with
  `deepseek-v4-pro` and `deepseek-flash` as current model IDs
  (`api-docs.deepseek.com`).
- Zhipu documents the coding path on `open.bigmodel.cn/api/anthropic` and the
  OpenAI-compatible `open.bigmodel.cn/api/paas/v4` surface with the GLM-5.3
  family (`docs.bigmodel.cn`).
- Moonshot/Kimi documents Kimi K3 and Kimi K2.7 Code with
  `api.moonshot.cn/v1`; its Claude-compatible path is `api.moonshot.cn/anthropic`
  (`platform.kimi.com/docs/models`).
- DashScope's OpenAI-compatible mode is
  `dashscope.aliyuncs.com/compatible-mode/v1`; its Claude-compatible proxy is
  `dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy` (`help.aliyun.com/zh/model-studio/models`).
- Every endpoint above was probed unauthenticated: the Anthropic-shaped ones
  answer with an auth error that names the expected `x-api-key`, and the
  OpenAI-shaped ones answer with a bearer auth error, so all five paths exist
  today.
- `models.dev/api.json` agrees on the same hosts and model IDs.

## Why presets instead of new `AiProvider` values

- `opencode_local`/`hermes_local` already speak Chat Completions and
  `claude_local` already speaks Anthropic Messages. The shipped harnesses are the
  transport; only the URL, protocol, and credential placement differ.
- New `AI_PROVIDERS` values would drag in `AI_CONNECTION_CAPABILITIES`,
  subscription/billing rows, provider usage probes, and migration-constrained
  provider columns. Routing already models custom destinations.
- A new Apps catalog entry per vendor would require authentic vendor artwork and
  catalog-growth bookkeeping. Reusing `messages-api` / `chat-completions-api`
  keeps the store honest: the card says which API format you are connecting.

## What changed

1. `packages/shared/src/ai-provider-routing.ts`
   - Added routing `kind: "openai_compatible"` (requires an explicit base URL).
   - `aiConnectionCatalogSlug` maps it to the existing `messages-api` /
     `chat-completions-api` catalog rows by protocol.
   - `AI_VENDOR_PRESETS` is the single source of truth: id, display name, brand
     key, docs URL, documented credential name, suggested model IDs, default
     protocol, and both endpoints. Helpers: `aiVendorPreset`,
     `aiVendorPresetForEndpoint`, `aiVendorProvider`, `aiVendorAuth`.
2. `packages/shared/src/ai-connections.ts`
   - `createAiConnectionSchema` accepts `openai_compatible` routing and keeps the
     provider matched to the wire format (`anthropic` for messages, `openai` for
     chat).
3. `ui/src/components/ai-connections/AiProviderSetup.tsx`
   - The vendor cards fill URL, API format, and suggested model IDs; the API
     format select switches between the vendor's two endpoints; authentication is
     derived (bearer for chat, `x-api-key` for messages) with a docs link.
   - Reconnect identifies the vendor from the saved endpoint, so the preset and
     model list come back even after a hand edit elsewhere.
4. `ui/src/components/ai-connections/ManagedAiConnectionDetails.tsx`
   - The account row names the vendor and its format instead of showing a bare URL.
5. Server projection needed no change: `managedProviderRouting` already maps
   `claude_local` + `messages` to `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY` and
   `opencode_local`/`hermes_local` + `chat` to the Paperclip provider stanza.
   Custom destinations still skip control-plane key validation (no credential is
   sent to a caller-supplied URL); **Run test** in the execution environment is
   the proof.
6. Docs: `doc/connections/AI-CONNECTIONS.md` gains a vendor-preset section with
   the endpoint table and the “model IDs are suggestions, not an allowlist” note.

## Follow-ups (2026-10-20)

7. First-run onboarding entry (`ui/src/components/OnboardingWizard.tsx`)
   - **Connect a model → Other providers** opens the same vendor cards. The
     host renders only vendor cards and only the Claude wire format, because
     onboarding hires Claude and has no model picker to resolve a Chat
     Completions vendor's model.
   - A completed vendor setup fixes the adapter to `claude_local`, takes the
     first suggested model ID, and hands the binding to the same environment
     test and hire a saved account uses. Picking a native source tile or
     switching credential mode clears it, and the step's own footer steps
     aside while the sheet is open so one screen has one Connect.
   - `AiProviderSetup` gained `vendorOnly`, `protocols`, and a result context
     (`vendorId`, `protocol`, `models`) for hosts that need them.
8. Project-auth guard boundary (`server/src/services/ai-connection-runtime.ts`)
   - The check that refuses a connection whose project settings carry
     credentials walked from the run's directory to `/`, so a globally
     configured provider (`~/.claude/settings.json`, `~/.codex/config.toml`)
     blocked every managed connection in any project under the account's home.
   - It now stops at the project root (nearest ancestor holding `.git`, a file
     in a worktree) and never enters the home directory: a managed run hands
     the harness a disposable config directory and never opens those files.
     Project-owned settings still refuse the connection.

## Follow-ups (2026-10-26): Pi and more onboarding harnesses

9. `pi_local` joins the managed connection surface
   - `isAiRoutingCompatible` accepts Pi for Messages and Chat Completions
     (never Responses/Bedrock), and `aiRoutingHarness` maps the ACPX `pi` agent
     to it. `AI_CONNECTION_CAPABILITIES` lists `pi_local` on every native
     `api_key` method Pi already reads (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
     `GEMINI_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`).
   - `managedProviderRouting` projects a routed connection into Pi's own
     `models.json` shape (`PAPERCLIP_PI_PROVIDERS`, `api` = `anthropic-messages`
     or `openai-completions`) under the managed `paperclip` provider, and names
     the agent model `paperclip/<id>`. An OpenRouter connection keeps Pi's
     built-in provider and `openrouter/<id>` IDs. Pi models are always
     `provider/model`, so the projected model is normalized even when the saved
     value was bare.
   - `PAPERCLIP_PI_PROVIDERS` is stripped from inherited/configured env and
     redacted from session identities, matching the OpenCode provider config.
     It is also redacted by name in the invocation env written to run metadata:
     the value embeds the provider key, and the generic key/token/secret
     pattern never matched it. `OPENCODE_CONFIG_CONTENT` and
     `OPENCODE_AUTH_JSON` carry credentials the same way and are redacted
     alongside it.
   - The project-auth guard now scans only the harness's own settings files, so
     a Pi run is not refused for `.claude/settings.json` it never opens.
   - The environment test materializes the same registry: locally it writes the
     managed `models.json` into a probe-only temp dir; a remote target cannot
     see a host temp dir, so the same bytes are shipped into the environment
     (`PI_CODING_AGENT_DIR` inside it) and removed once the probe is done.
     Without it the hello turn would report every configured model as missing.
10. Onboarding offers more harnesses
   - The recommended row is unchanged (Claude, Codex). A collapsed
     **More harnesses** row exposes Pi, Gemini, Kimi, OpenCode, Cursor and Grok;
     no-sign-in harnesses default to the API-key card.
   - Pi has no default model, so its key card asks for an explicit
     `provider/model`; the step will not advance without one. The other added
     harnesses keep their adapter defaults.
   - **Other providers** follows the selected harness instead of always hiring
     Claude: Claude keeps Messages, OpenCode takes Chat Completions, and Pi takes
     either. A harness that cannot run a preset hides the entry.

## Tests

- `server/src/__tests__/ai-provider-routing.test.ts`: every preset parses as a
  full create payload for both protocols, the MiniMax endpoints project through
  `claude_local` (`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, model) and through
  `opencode_local`, and presets stay in the existing catalog rows.
- `ui/src/components/ai-connections/AiProviderSetup.test.tsx`: cards render,
  MiniMax saves as `anthropic` + `messages` + `x-api-key`, switching to Chat
  Completions swaps the URL and auth, and reconnect restores the preset.
- `ui/src/components/OnboardingWizard.test.tsx`: the “Other providers” entry
  reaches the vendor wall, and a completed vendor setup hires `claude_local`
  with the vendor model and the vendor connection binding.
- `server/src/__tests__/ai-connection-project-auth.test.ts`: project settings
  refuse the connection (from the project root and from a subdirectory, and in
  a worktree whose `.git` is a file), the account's home is not read as
  project configuration, and the remote scan carries the same boundaries. A
  Pi run ignores the Claude/Codex files it never opens while still refusing
  explicit `--api-key` overrides.
- `server/src/__tests__/ai-provider-routing.test.ts`: a Messages vendor preset
  projects into `PAPERCLIP_PI_PROVIDERS` with `paperclip/<id>`; a Chat preset
  switches the Pi provider's `api`; a native OpenRouter connection keeps
  `openrouter/` IDs; Responses and the ACPX `pi` harness mapping are asserted.
- `ui/src/components/OnboardingWizard.test.tsx`: Pi stays off the recommended
  row, appears behind **More harnesses**, requires a `provider/model`, and
  hires `pi_local` through an OpenRouter account.
- `packages/adapters/pi-local/src/server/test.test.ts`: the environment test
  materializes `PAPERCLIP_PI_PROVIDERS` into a managed `models.json` for model
  discovery and the hello probe (and removes the probe-only dir), and ships the
  same registry into a remote environment, pointing the probe at it and
  cleaning it up afterwards.

## Out of scope

- Subscription / OAuth flows for these vendors (API key only).
- Vendor usage probes in the account detail (no documented allowance endpoint).
- Authentic vendor brand marks; the cards fall back to the deterministic letter
  tile until artwork with provenance is added.
- Automatic model-catalog discovery from these vendors (the control plane never
  fetches a caller-supplied URL).

## Verification

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

Then a live smoke: **Connect a model → MiniMax (China)**, paste a key, save, run
an agent on Claude; switch the same preset to **Chat Completions** and run an
agent on OpenCode.

Pi smoke: **Connect a model → More harnesses → Pi**, enter an OpenRouter key
and `openrouter/<model>`, and hire; then switch the Pi agent's AI connection to
a **MiniMax** vendor preset in agent settings (Messages) and run a task. The
runtime config should carry `PAPERCLIP_PI_PROVIDERS` with a `paperclip`
provider, and `adapterConfig.model` should be `paperclip/<id>`. A Chat
Completions preset uses the same provider with `api: "openai-completions"`.

Onboarding reaches the same presets from **Connect a model → Other providers**.
With no source picked yet the sheet keeps the Claude Messages path; after a
source is picked it follows that harness (Claude Messages, Pi either surface,
OpenCode Chat Completions). A connection saved there is proved by
`POST /api/companies/{companyId}/adapters/{adapterType}/test-environment` with
that connection's binding: `status: pass` plus `ai_connection_api_key_reverified`.
Preset endpoints are fixed vendor hosts, so both the save and the environment
test verify the key with one cheap one-token call to the routing's own surface
(`POST {base}/v1/messages` for Messages, `{base}/chat/completions` for Chat) —
never a caller-supplied URL. They do not run the Claude CLI hello probe: its
45–90s CLI boot plus model round-trip bought the same verdict, which made
configuring a vendor preset sit on "Connect" while native API keys finished in
seconds. Custom gateways keep the CLI probe, because the control plane never
fetches an arbitrary destination.

### Local environment note

`packages/db` tests need the embedded PostgreSQL binaries. A pnpm install that
loses the unversioned symlinks in
`node_modules/@embedded-postgres/darwin-arm64/native/lib` (for example
`libicudata.77.dylib`) makes `initdb` abort, and every database-backed suite
fails at bootstrap with "Postgres init script exited with code null". The
working set is the one the published CLI ships: recreate the missing links
from the versioned files next to them, or reinstall the package.
