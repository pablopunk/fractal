# Research: Integrating opencode-go as an AI SDK / OpenAI-compatible provider

## Summary

OpenCode Go offers a curated set of open-source models (DeepSeek, GLM, Qwen, Kimi, MiniMax, MiMo) via `https://opencode.ai/zen/go/v1` — an API that is **partially OpenAI-compatible** (most models use `/v1/chat/completions`, some use Anthropic-style `/v1/messages`). Authentication uses a subscription-based API key from the OpenCode Zen console. There is also a separate **Go SDK** (`github.com/sst/opencode-sdk-go`) designed for local inter-process communication with the OpenCode TUI — it is **not** an OpenAI-compatible HTTP client for remote model access.

## Findings

1. **What "opencode-go" means** — There are two distinct things under this name:
   - **OpenCode Go subscription service** — A $10/month ($5 first month) plan that gives API access to curated open models via `https://opencode.ai/zen/go/v1`. This is what you'd integrate as an AI provider. [Source](https://opencode.ai/docs/go/)
   - **Go SDK** (`github.com/sst/opencode-sdk-go`) — A generated Go client for the local OpenCode TUI daemon (default base URL: `http://localhost:54321/`). It is **not** an OpenAI-compatible remote client and does not automatically read an API key from env vars. It reads the `OPENCODE_BASE_URL` env var to override the local address. [Source](https://github.com/anomalyco/opencode-sdk-go)

2. **API key environment variable** — The official OpenCode docs guide users to obtain an API key by subscribing via the [Zen console](https://opencode.ai/auth). The env var name is **`OPENCODE_GO_API_KEY`** with fallback to **`OPENCODE_API_KEY`**. However, the Go SDK (`sst/opencode-sdk-go`) does **not** auto-read any API key env var; you must pass the key manually (e.g., `option.WithHeader("Authorization", "Bearer <key>")` or via `WithAPIKey` if using the Jetify AI SDK wrapper). [Source](https://pkg.go.dev/github.com/sst/opencode-sdk-go) | [Source](https://opencode.ai/docs/go/)

3. **Base URL** — For OpenAI-compatible access to OpenCode Go models:
   - **`https://opencode.ai/zen/go/v1`** — primary endpoint (documented directly on opencode.ai)
   - The Go SDK default is `http://localhost:54321/` (local TUI), overridable via `OPENCODE_BASE_URL` — this is **not** relevant for remote OpenAI-compatible usage. [Source](https://opencode.ai/docs/go/) | [Source](https://github.com/anomalyco/opencode-sdk-go/blob/main/client.go)

4. **Model naming** — When used within OpenCode's own config, models use the prefix `opencode-go/<model-id>`. For direct API calls via the OpenAI-compatible endpoint, the raw model ID (without prefix) is used in the request body. Available models include:
   - `deepseek-v4-pro`, `deepseek-v4-flash`
   - `glm-5.2`, `glm-5.1`
   - `kimi-k2.7-code`, `kimi-k2.6`
   - `qwen3.7-max`, `qwen3.7-plus`, `qwen3.6-plus`
   - `minimax-m3`, `minimax-m2.7`, `minimax-m2.5`
   - `mimo-v2.5`, `mimo-v2.5-pro`
   
   Run `https://opencode.ai/zen/go/v1/models` to fetch the live list. [Source](https://opencode.ai/docs/go/)

5. **OpenAI compatibility split** — The API supports two protocols depending on the model:
   - **OpenAI-compatible** (`/v1/chat/completions`): DeepSeek V4, GLM 5.x, Kimi K2.x, MiMo — use `@ai-sdk/openai-compatible` or any standard OpenAI client with `baseURL` set.
   - **Anthropic-compatible** (`/v1/messages`): MiniMax M3/M2.7/M2.5, Qwen3.7 Max/Plus, Qwen3.6 Plus — use `@ai-sdk/anthropic`.
   
   So a single provider config cannot cover all models; the protocol depends on the model family. [Source](https://opencode.ai/docs/go/)

6. **Integration via Jetify AI SDK (Go)** — The community-recommended approach for Go programs is the Jetify AI SDK (`go.jetify.com/ai`) with its `compat` (OpenAI-compatible) provider:
   ```go
   model := compat.Chat("deepseek-v4-flash",
       compat.WithBaseURL("https://opencode.ai/zen/go/v1"),
       compat.WithAPIKey(os.Getenv("OPENCODE_GO_API_KEY")),
   )
   ```
   This approach works for models using the `/v1/chat/completions` path. [Source](https://go.jetify.com/ai)

7. **Pricing and rate limits** — The subscription has dollar-based limits: $12 per 5-hour window, $30 per week, $60 per month. Model costs vary (e.g., DeepSeek V4 Flash is $0.14/$0.28 per 1M input/output tokens; GLM-5.2 is $1.40/$4.40). [Source](https://opencode.ai/docs/go/)

## Sources

### Kept
- **opencode.ai/docs/go/** — Official primary documentation for the OpenCode Go subscription service. Contains base URL, model IDs, pricing, and endpoint info. This is the single most authoritative source. [https://opencode.ai/docs/go/](https://opencode.ai/docs/go/)
- **github.com/anomalyco/opencode-sdk-go** — Official Go SDK source code. Confirms default base URL is localhost, no auto API key reading, and `OPENCODE_BASE_URL` env var. [https://github.com/anomalyco/opencode-sdk-go](https://github.com/anomalyco/opencode-sdk-go)
- **opencode.ai/docs/providers/** — Official providers documentation. Confirms the split between OpenAI-compatible and Anthropic-compatible endpoints per model family, and shows how to configure custom providers. [https://opencode.ai/docs/providers/](https://opencode.ai/docs/providers/)
- **pkg.go.dev/github.com/sst/opencode-sdk-go** — Go package docs for the SDK. Confirms no auto env var for API key, and the SDK's purpose (local TUI IPC). [https://pkg.go.dev/github.com/sst/opencode-sdk-go](https://pkg.go.dev/github.com/sst/opencode-sdk-go)

### Dropped
- **mastra.ai models page** — Third-party aggregator; redundant with official docs.
- **go.jetify.com/ai** — Jetify AI SDK is a community integration approach, not official OpenCode documentation. Useful but not authoritative.
- **Reddit/GitHub issue comments about env vars** — Unverified secondary sources that conflict (`OPENCODE_GO_API_KEY` vs `OPENCODE_API_KEY`). Official docs don't explicitly document an env var name for the Go subscription; they guide users through the `/connect` TUI command.

## Gaps

- **Official env var name**: The OpenCode Go docs do not explicitly state the env var name for the API key. The values `OPENCODE_GO_API_KEY` and `OPENCODE_API_KEY` come from third-party sources and SDK code comments, not from the official first-party documentation.
- **Go SDK as remote client**: It is unclear whether the official Go SDK (`sst/opencode-sdk-go`) is intended to be used as a remote OpenAI-compatible client with a custom base URL, or if it strictly targets local TUI communication. The SDK's API surface (session management, file ops, etc.) suggests the latter.
- **Model-to-protocol mapping**: The official docs show which models use which protocol variant, but the list may change over time. The `/v1/models` endpoint is the source of truth.

## Suggested next steps
1. Subscribe to OpenCode Go at https://opencode.ai/auth, obtain an API key, and test against the `/v1/chat/completions` endpoint with a standard OpenAI client (e.g., `curl https://opencode.ai/zen/go/v1/chat/completions`).
2. Determine whether the intended integration path is raw HTTP (any OpenAI-compatible client) or the Jetify AI SDK in Go — this project's language/ecosystem preference will dictate the choice.
3. If using the official Go SDK, verify whether setting `OPENCODE_BASE_URL` to `https://opencode.ai/zen/go/v1` and adding an auth header works, or if the SDK's API surface is too TUI-specific to be useful.
