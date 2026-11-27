# Solara — Minimalist Stateless Multi-Provider AI Chat

Solara is a stateless, full-stack multi-provider AI chat application built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and an **Express** proxy server (`server.ts`). All user-facing state—API keys, custom endpoints, ordered model cascades, learned model capabilities, thinking-level preferences, system prompts, UI theme settings, and your last 10 conversations—is persisted strictly in browser `localStorage`.

---

## Key Features

- **5 Built-in Providers + 2 Custom OpenAI-Compatible Slots**:
  - **Gemini AI Studio** (`https://generativelanguage.googleapis.com` via `@google/genai` `v1beta`, with automatic OpenAI-compatible fallback to `/v1beta/openai` on non-auth/non-404 transport failures)
  - **Groq** (`https://api.groq.com/openai/v1`)
  - **OpenRouter** (`https://openrouter.ai/api/v1` — supports public catalog discovery & Cloudflare AI PDF parsing plugin)
  - **NVIDIA NIM** (`https://integrate.api.nvidia.com/v1` — supports public catalog discovery)
  - **Z.AI** (`https://api.z.ai/api/paas/v4`)
  - **Custom #1 & Custom #2** — user-defined HTTPS OpenAI-compatible endpoints (e.g., Arena `https://api.arena.ai/v1` or self-hosted gateways)
- **Empty-by-Default Drag-Reorderable Model Cascades**:
  - One ordered fallback cascade per provider (`CascadeEditor.tsx`) using drag-and-drop (`motion/react` `Reorder.Group`), manual model slug entry (`Top` / `End`), live catalog search, and full JSON export/import.
  - Models are called in exact cascade order; HTTP `401`/`402`/`403`/`429` (rate limit), `503`/`5xx` upstream failures, auth/billing/quota/missing-model errors, and empty responses immediately fail over to the next model without wasting parameter retries (emitting `fallback_notice`), while `400`/`422` parameter rejections trigger self-healing retries first.
- **Text-Output-Only Model Filtering**:
  - Both `/api/models` (`server.ts`) and `parseCatalog()` (`src/lib/providers.ts`) filter catalogs to **text-output** chat models while preserving multimodal-input models (image, PDF, audio, video → text). Pure image/video/audio generators, TTS, ASR/STT, embeddings, rerankers, and guard models are excluded.
- **Live Capability Discovery & Runtime Self-Healing Learning**:
  - Reads live provider metadata (`row.thinking`, `outputTokenLimit`, OpenRouter `reasoning.supported_efforts` including `null` and `supported_parameters`, generic `supported_efforts` / boolean flags) and falls back to `'adaptive'` (`supportsThinking: 'unknown'`) when metadata is omitted so brand-new models can always be tested.
  - Emits `learned_capability` and `model_meta` SSE events whenever a parameter retry or fallback repair succeeds (e.g., ceiling/floor clamping, NVIDIA NIM `chat_template_kwargs` ↔ `reasoning_effort` swaps, Gemini `systemInstruction` → user-message folding), caching `learned-runtime` capabilities in `localStorage` and preserving them across catalog refreshes unless overridden by live API metadata.
- **Unified Thinking-Level Control (`src/lib/reasoning.ts`)**:
  - Single shared client/server engine supporting 9 modes (`Default`, `None`, `On`, `Minimal`, `Low`, `Medium`, `High`, `XHigh`, `Max`).
  - Dynamic dropdown option labels preview exact effective behavior for the top model in the active cascade (e.g., `XHigh (→ High)`, `None (mandatory → Low)`, `High (Supported)`).
  - Gemini 3.x / 4.x / 5.x+ and Gemma 4+ use `thinkingConfig.thinkingLevel` (`MINIMAL`, `LOW`, `MEDIUM`, `HIGH`, `XHIGH`, `MAX`) resolved safely via `(ThinkingLevel as any)[key] ?? key`, with step-down retries before cleanly stripping `thinkingConfig`.
- **Adaptive Global Timeout (5 min → 10 min) & True Server-Side Stream Abort**:
  - **5-Minute Initial / Idle Timeout (`300,000 ms`)**: All requests start with a 5-minute ceiling (`REQUEST_TIMEOUT_MS`) while waiting for the upstream model to respond; silent or hung connections fail cleanly at 5 minutes.
  - **10-Minute Active-Stream Promotion (`600,000 ms`)**: Globally across all providers (both in `server.ts` via `createAdaptiveTimeout()` and in `src/App.tsx`), as soon as a model emits real `thought` or text `chunk` output, the request deadline promotes automatically to **10 minutes** (`ACTIVE_STREAM_TIMEOUT_MS`) from request start, backed by `605,000 ms` Node HTTP/Express socket ceilings (`requestTimeout`, `headersTimeout`, `keepAliveTimeout`, `req/res.setTimeout`) so heavy reasoning models are not cut off mid-stream.
  - **Immediate Upstream Cancellation**: Client `AbortController` + `POST /api/chat/abort` backup + Express `res.on('close')` listener abort upstream provider requests immediately so zero extra tokens are consumed after stopping.
- **25 MB File Uploads & Multimodal Attachments**:
  - Paste, drag-and-drop, or pick files up to **25 MB** each (up to 12 files per turn). Small files (`≤ 4 MB` or images) encode inline; larger files stream via `multipart/form-data` (`multer` memory storage) and are stripped before saving chat history to `localStorage`.
- **Tavily Web Search & Native Gemini URL Context**:
  - **Tavily Web Search**: Toggleable per turn across all providers (including Gemini) with `Always` or `Model`-decided query generation, configurable search depth (`basic`, `advanced`, `fast`, `ultra-fast`), result count (`1–10`), allow/block domain lists, per-chat call cap (`1–25`), custom instructions, and clickable `[1]`, `[2]` source citations.
  - **Native Gemini URL Context**: On Gemini models (excluding `gemma*`), if the latest user prompt contains a public `http://` or `https://` URL (filtering out `localhost`/private IPs), `server.ts` automatically attaches `tools: [{ urlContext: {} }]`, with self-healing retry stripping `tools` cleanly if rejected by a specific model.
- **Rich Markdown, Math & Voice UX**:
  - Heavy Markdown + KaTeX math renderer (`MarkdownRenderer.tsx`) with LaTeX auto-healing, syntax-highlighted code blocks with copy buttons, tables, and collapsible live/saved `Thinking Process` blocks.
  - Per-message controls: **Copy Markdown**, **Copy Text**, **Read Aloud** (browser `speechSynthesis` with Play/Pause/Resume/Stop via `speechSanitizer.ts`), **Edit Query & Re-run** (user messages), and **Delete**.
  - Quick-insert **Mini Prompts Drawer** (`MiniPromptDrawer.tsx`), in-chat message filter, configurable **History Limit** (`5..40` in steps of 5), **Max Tokens** (`500..100000`), **Stream ON/OFF** toggle, and live surface/accent/text/prose-size **Appearance** customizer.

---

## Project Structure

```text
├── server.ts                        # Stateless Express API proxy, SSE orchestrator, Vite dev/static host
├── index.html                       # SPA HTML shell (Plus Jakarta Sans font, metadata)
├── metadata.json                    # App manifest & server-side Gemini capability declaration
├── package.json                     # Dependencies & npm scripts (dev, build, start, lint)
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # Vite + Tailwind v4 build config
├── .env.example                     # Optional server environment variables
└── src/
    ├── App.tsx                      # Main chat layout, streaming SSE loop, Tavily flow, localStorage sync
    ├── main.tsx                     # React 19 entry point
    ├── index.css                    # Tailwind CSS v4 styles & utility rules
    ├── types.ts                     # Shared types, ProviderId, Mode, ModelCapability, PROVIDERS config
    ├── lib/
    │   ├── reasoning.ts             # Unified wire-protocol thinking adapter, clamping & runtime learning
    │   ├── providers.ts             # URL normalization, text-output filtering, live capability extraction
    │   └── storage.ts               # Browser localStorage persistence & quota-safe chat compaction
    ├── utils/
    │   └── speechSanitizer.ts       # Markdown/LaTeX sanitization & chunking for Web Speech API
    └── components/
        ├── CascadeEditor.tsx        # Drag-reorderable cascades, catalog search, live/learned badges, JSON I/O
        ├── ChatHistoryDrawer.tsx    # Last-10-sessions switcher & manager
        ├── MarkdownRenderer.tsx     # Marked + KaTeX + code highlighting renderer
        ├── MiniPromptDrawer.tsx     # Quick-insert prompt snippets popover
        ├── ProviderSwitcher.tsx     # Responsive provider selector bar
        ├── SystemPromptEditor.tsx   # Global system prompt editor modal
        └── TavilySettings.tsx       # Connection Settings modal (API keys, Custom #1/#2, Tavily config)
```

---

## Getting Started

### Prerequisites

- **Node.js 20+** (recommended `22.x`)
- **npm**

### Installation

```bash
npm install
```

### Environment Variables (Optional)

Create a `.env` file if you want optional server-side defaults (see `.env.example`). **All provider keys and Tavily keys can be entered directly in the browser UI via Settings and stored strictly in `localStorage`.**

```env
# Optional fallback Gemini AI API key when not supplied per-request from browser settings
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# Optional public URL of this app (used for OpenRouter HTTP-Referer header)
APP_URL="MY_APP_URL"
```

### Running Locally

- **Development mode** (Express + Vite middleware on port `3000`):
  ```bash
  npm run dev
  ```
- **Typecheck & Production Build**:
  ```bash
  npm run lint
  npm run build
  ```
- **Production mode** (serves compiled `dist/` via `tsx server.ts` on port `3000`):
  ```bash
  npm start
  ```

---

## Backend API Reference (`server.ts`)

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Returns `{ status: "ok", stateless: true, timeoutMs: 300000, activeTimeoutMs: 600000 }`. |
| `/api/models` | `POST` | Fetches provider catalog, filters to text-output models, and returns `{ listed, ids, publicCatalog, capabilities }`. |
| `/api/chat/stream` | `POST` | Runs cascade-ordered streaming/non-streaming completions over SSE (`application/json` or `multipart/form-data` up to 25 MB/file) with adaptive 5 min → 10 min active-stream timeout. |
| `/api/chat` | `POST` | Non-streaming cascade completion endpoint (used for Tavily model query-intent planning and direct calls). |
| `/api/chat/abort` | `POST` | Aborts an active `requestId` controller server-side to stop upstream token generation immediately. |
| `/api/upload` | `POST` | Converts up to 12 uploaded files (max 25 MB each) into base64 attachment payloads. |
| `/api/search` | `POST` | Stateless proxy to `https://api.tavily.com/search` supporting depth, result limit, and allow/block domain filters. |

### SSE Event Types (`/api/chat/stream`)

Each chunk is emitted as `data: <JSON>\n\n`:

- `model_init`: `{ type: "model_init", model }` — active model selected from cascade.
- `thinking`: `{ type: "thinking" }` — signals reasoning phase started.
- `thought`: `{ type: "thought", text }` — incremental reasoning/thought delta.
- `chunk`: `{ type: "chunk", text }` — incremental assistant output delta.
- `fallback_notice`: `{ type: "fallback_notice", failedModel, nextModel, reason }` — cascade failed over to next model.
- `learned_capability`: `{ type: "learned_capability", model, capability }` — runtime-learned capability saved to `localStorage`.
- `model_meta`: `{ type: "model_meta", model, requestedMode, appliedSummary, retried, retryReason }` — final applied thinking/reasoning summary.
- `done`: `{ type: "done", modelUsed }` — stream completed cleanly.
- `error`: `{ type: "error", error }` — all models in the cascade failed.

---

## Client Persistence (`localStorage`)

Managed in `src/lib/storage.ts` under the following keys:

| Key | Contents |
| :--- | :--- |
| `api_keys` | Per-provider API keys + Tavily key (all empty on fresh boot). |
| `custom_providers` | Name, HTTPS base URL, and API key for `custom1` and `custom2`. |
| `provider_cascades` | Ordered arrays of model IDs per provider (all empty on fresh boot). |
| `thinking_levels` | Selected `Mode` per provider (`default` initially). |
| `model_capabilities` | Cached `live-api`, `adaptive`, and `learned-runtime` capabilities per provider/model. |
| `system_prompt` | Global system prompt string. |
| `ui_settings` | Active provider, theme colors, prose size, history limit (`5..40`), max tokens (`500..100000`), streaming toggle, and Tavily settings. |
| `chat_history` | Up to 10 most recent chat sessions (with raw binary attachment data stripped). |
| `active_chat_id` | Currently open session ID. |
