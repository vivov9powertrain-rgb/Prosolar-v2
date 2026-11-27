# Solara — Minimalist Stateless Multi-Provider AI Chat

try for yourself at (https://prosolar-v2.onrender.com/) 
note :its byok so u need ur own api keys , get a free one 

refer to (https://free-llm.com/free-api)

Solara is a production-grade, stateless, full-stack multi-provider AI chat platform engineered with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and an **Express** proxy server (`server.ts`). 

Solara requires **zero databases, zero server-side user tracking, and zero cloud storage accounts**. All personal configurations—API keys, custom endpoints, drag-and-drop model cascades, learned model reasoning capabilities, system prompts, theme styles, and session histories—are stored strictly within your browser's `localStorage`.


the current password is "password" 


host it yourself on render. com  ( choose webservice) 

 npm install && npm run build
 
 npm run start
 
 NODE_ENV = production
 
---

## Table of Contents

1. [Architecture & Design Principles](#architecture--design-principles)
2. [Security & Access Control (Password Gate)](#security--access-control-password-gate)
3. [Multi-Provider Engine & Model Cascades](#multi-provider-engine--model-cascades)
4. [Audio-Only YouTube Understanding (Gemini)](#audio-only-youtube-understanding-gemini)
5. [Unified Thinking & Reasoning Engine](#unified-thinking--reasoning-engine)
6. [Interactive Markdown, KaTeX & Code Execution](#interactive-markdown-katex--code-execution)
7. [Multimodal Files & 25 MB Upload Pipeline](#multimodal-files--25-mb-upload-pipeline)
8. [Tavily Web Search & Native Gemini URL Context](#tavily-web-search--native-gemini-url-context)
9. [Long-Stream Resilience & Overlap Resume Protocol](#long-stream-resilience--overlap-resume-protocol)
10. [Text-to-Speech (Web Speech API)](#text-to-speech-web-speech-api)
11. [Client-Side State & Storage Schema](#client-side-state--storage-schema)
12. [Backend API Reference](#backend-api-reference)
13. [Getting Started & Local Development](#getting-started--local-development)
14. [Deployment](#deployment)

---

## Architecture & Design Principles

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Client Browser (React 19)                       │
│  - 100% LocalStorage State (Keys, Cascades, History, Appearance)       │
│  - Marked + KaTeX + OneCompiler Runner Modal + Audio Synthesizer       │
│  - Overlapping SSE Consumer with Auto-Reconnection & Sequence Tracking │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         HTTP / SSE / Multipart
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                  Stateless Express Proxy (server.ts)                   │
│  - Solara Cookie Gate (solara_key HttpOnly authentication)             │
│  - Text-Only Catalog Filtering & Dynamic Capability Inspection         │
│  - Self-Healing Parameter Retries & Instant Error-Based Failover       │
│  - Long-Lived Stream Job Registry & Seamless Handoff at 250s           │
│  - Native YouTube Audio Layer & URL Context Grounding                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
        ┌──────────────┬────────────┼─────────────┬─────────────┐
        ▼              ▼            ▼             ▼             ▼
  Gemini Studio       Groq      OpenRouter    NVIDIA NIM      Z.AI & Custom
  (@google/genai)   (OpenAI)     (OpenAI)      (OpenAI)     (OpenAI Slots)
```

- **Stateless Server Architecture**: The backend acts as a high-performance proxy and stream coordinator. It never logs prompts, never saves conversations, and requires no external database.
- **Client Sovereignty**: Your credentials, keys, preferences, and conversations never leave your device except as direct, transit-encrypted headers sent to the respective AI provider.
- **Fail-Soft Self-Healing**: Upstream API changes, unrecognized parameters, and experimental flags are automatically caught, repaired, or stripped on the fly.
- **Zero Lock-In**: Complete cascade configurations can be exported to and imported from portable JSON files at any time.

---

## Security & Access Control (Password Gate)

Solara includes an integrated **Password Gate** at the network middleware layer to safeguard instances deployed to public URLs or container runtimes:

- **Cookie-Based Session**: Successful authentication injects a secure, 7-day `solara_key` `HttpOnly` cookie with `SameSite=None; Secure; Partitioned` attributes (on HTTPS) or `SameSite=Lax` (on HTTP).
- **API Guarding**: Any `/api/*` request without a valid cookie instantly returns HTTP `401 Unauthorized` with `{ "requiresPassword": true }`.
- **Minimal Standalone Unlock UI**: Visitors without the cookie receive an inlined, lightweight authentication prompt with zero external asset dependencies.
- **Password Rotation**: Configurable directly in `server.ts` (`PW` and matching `KEY`).

---

## Multi-Provider Engine & Model Cascades

### Supported Providers

| Provider | Default Base URL | Wire Protocol | Distinctive Capabilities |
| :--- | :--- | :--- | :--- |
| **Gemini AI Studio** | `https://generativelanguage.googleapis.com` | `@google/genai` (v1beta) | Native multimodal inputs, YouTube audio layers, URL context grounding, thinking level control, auto-fallback to `/v1beta/openai` |
| **Groq** | `https://api.groq.com/openai/v1` | OpenAI Compatible | Ultra-low latency inference, LPU hardware acceleration, `max_completion_tokens` handling |
| **OpenRouter** | `https://openrouter.ai/api/v1` | OpenAI Compatible | Public catalog browsing without an API key, Cloudflare AI PDF parsing plugin, extensive open-source reasoning models |
| **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | OpenAI Compatible | Public catalog discovery, high-throughput enterprise inference, adaptive `chat_template_kwargs` / `reasoning_effort` |
| **Z.AI** | `https://api.z.ai/api/paas/v4` | OpenAI Compatible | High-performance GLM models with custom thinking configurations |
| **Custom #1 & #2** | User-defined HTTPS URL | OpenAI Compatible | Fully configurable slots for self-hosted gateways (e.g., vLLM, Ollama, LM Studio, LiteLLM) or services like Arena (`https://api.arena.ai/v1`) |

### Drag-Reorderable Cascades

Each provider features an independent model cascade managed in `CascadeEditor.tsx`:
- **Drag-and-Drop Reordering**: Powered by `motion/react` `Reorder.Group` for smooth visual rearrangement.
- **Top / End Insertion**: Add models directly to the top (priority) or bottom (fallback) of your list.
- **Live Catalog Discovery**: Search thousands of upstream models with real-time text-output filtering.
- **JSON Import / Export**: Back up and restore your exact cascades across browsers with animated celebration feedback.

### Strict Two-Tier Error Triage & Failover

When Solara executes a prompt, it applies intelligent error categorization:

1. **Immediate Failover (Zero Retries Wasted)**:
   - Triggered on: HTTP `401` (Unauthorized), `402` (Payment Required), `403` (Forbidden), `404` (Model Not Found), `429` (Rate Limited), `5xx` (Upstream Outage), quota exhaustion, or empty completion responses.
   - Action: Solara instantly emits a `fallback_notice` SSE event and transfers execution to the next model in the cascade with 0ms delay.
2. **Self-Healing In-Place Retries (HTTP 400 / 422)**:
   - Triggered on parameter rejections: unsupported `thinkingConfig`, disallowed `systemInstruction`, rejected tools, unrecognized `reasoning_effort`, or temperature conflicts.
   - Action: Solara automatically adjusts the parameters (e.g., stripping the thinking configuration, folding the system prompt into a user message, or stepping down video layers) and retries on the **same model** before attempting cascade failover.

---

## Audio-Only YouTube Understanding (Gemini)

Solara includes specialized, cost-effective YouTube audio comprehension for Gemini models:

- **Audio Layer Isolation (`contentLayers: ['AUDIO']`)**:
  When a YouTube URL is provided in the prompt, Solara attaches the video part using `{ fileData: { fileUri }, videoMetadata: { contentLayers: ['AUDIO'] } }`.
- **Token Efficiency**:
  Extracting only the audio track consumes **~19,200 tokens** for a 10-minute video, compared to **~180,000 tokens** when sampling full video frames. This allows long videos to process comfortably within Free Tier Rate Limits (TPM).
- **Supported URL Formats**:
  Detects standard video links (`youtube.com/watch?v=...`), shortlinks (`youtu.be/...`), YouTube Shorts (`youtube.com/shorts/...`), and Live broadcasts (`youtube.com/live/...`).
- **Conflict Prevention**:
  YouTube URLs are automatically excluded from Google's `urlContext` grounding tool to prevent 400 parameter errors (since `urlContext` does not process YouTube media).
- **Latest-Turn Only**:
  Attachments are injected strictly for the latest user message, preventing prior turns from repeatedly consuming video quotas on follow-up questions.
- **Multi-Stage Self-Healing**:
  If a model or region rejects the audio content layer, Solara automatically steps down through `audio` → `low_res` → `plain` → `none` before failing over.

---

## Unified Thinking & Reasoning Engine

Solara features a unified client and server reasoning adapter (`src/lib/reasoning.ts`) supporting 9 distinct modes:

```
Default ──► None ──► Minimal ──► Low ──► Medium ──► High ──► XHigh ──► Max ──► On
```

### Protocol Translations

| Provider / Model Family | Wire Protocol Translation |
| :--- | :--- |
| **Gemini 3.x / 4.x / 5.x+** | Maps to `thinkingConfig.thinkingLevel` (`MINIMAL`, `LOW`, `MEDIUM`, `HIGH`, `XHIGH`). |
| **OpenAI / Groq / OpenRouter** | Maps to `reasoning_effort` (`low`, `medium`, `high`) or `max_completion_tokens`. |
| **DeepSeek (OpenRouter / Groq)** | Maps to `include_reasoning: true` or `chat_template_kwargs: { reasoning_effort: ... }`. |
| **NVIDIA NIM** | Dynamically adapts between `chat_template_kwargs` and native parameters based on model family. |
| **Z.AI (GLM)** | Translates to Z.AI custom thinking tokens and parameters. |

### Runtime Capability Learning

When a model successfully responds after a parameter adjustment (such as down-stepping thinking levels or folding system instructions), Solara emits a `learned_capability` SSE event. This learned behavior is stored in the browser's `model_capabilities` cache, ensuring subsequent requests execute with optimal configurations on the first attempt.

---

## Interactive Markdown, KaTeX & Code Execution

Rendered via `MarkdownRenderer.tsx` with high performance and zero external web fonts:

### Advanced KaTeX & Chemical Equations

- **Display & Inline Math**: Supports `$$...$$`, `\[...\]`, `\(...\)`, `$...$`, and fenced ````math` / ````latex` blocks.
- **Standard LaTeX Environments**: Accurately renders `align`, `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `cases`, `equation`, `split`, `eqnarray`, and `array`.
- **Chemistry (`mhchem`)**: Native chemical formula rendering via `\ce{...}` and physical units via `\pu{...}`.
- **Auto-Healing Parser**: Automatically recovers unclosed braces, repairs undefined control sequences (e.g., `\Take` → `\text{Take}`), auto-closes streaming unclosed `$$` delimiters, and separates formulas concatenated into English prose.
- **Reasoning Blocks**: Formats `<think>...</think>` tags into collapsible, DeepSeek-style reasoning callouts with animated pulsing indicators during active streaming.

### Code Block Actions

Every rendered code block features a dedicated header toolbar:

1. **Language Badge**: Displays the detected syntax tag.
2. **Download Code Button**:
   - Maps over 35 language identifiers (`python`, `typescript`, `tsx`, `javascript`, `jsx`, `html`, `css`, `sql`, `bash`, `rust`, `go`, `cpp`, `dockerfile`, etc.) to accurate file extensions.
   - Uses mobile-safe `Blob` downloads with automatic object URL revocation.
   - Provides temporary `Saved` checkmark feedback.
3. **On-Demand Code Execution (OneCompiler Embed)**:
   - Available on 25+ runnable languages (`python`, `javascript`/`nodejs`, `typescript`, `react`, `html`, `c`, `cpp`, `java`, `csharp`, `go`, `rust`, `php`, `ruby`, `kotlin`, `swift`, `dart`, `bash`, `sqlite`, `mysql`, `postgresql`, `r`, `lua`, `perl`, `scala`, `haskell`, `elixir`, `julia`, `zig`).
   - Automatically differentiates browser JavaScript from Node.js (detects `require`, `module.exports`, `process.`, `'fs'`).
   - **Lazy-Mounted Modal**: Loads zero iframe resources until clicked, completely freeing system memory when closed.
   - **Two-Way Synchronization**: Automatically injects code using OneCompiler's `populateCode` postMessage protocol, schedules retries at 400ms and 900ms, and automatically issues `triggerRun`. Includes manual **Re-sync Code**, **Copy**, and **Close** controls.
4. **Local JSON Integrity Check**:
   - Fenced `json` and `jsonc` blocks render a fast **Check** button.
   - Evaluates `JSON.parse()` locally in 0ms, displaying key/item counts or exact line/character syntax error details in an inline pill.
5. **Copy Button**: Instant clipboard copy with confirmation state.

---

## Multimodal Files & 25 MB Upload Pipeline

Solara supports comprehensive multimodal input attachments:

- **Generous Limits**: Upload up to 12 files per message, up to **25 MB** each.
- **Flexible Ingestion**: Paste images from your clipboard, drag and drop files onto the chat interface, or use the file picker.
- **Automatic Storage Optimization**: To prevent browser `QUOTA_EXCEEDED_ERR` errors in `localStorage`, heavy binary attachments are retained during active session streaming but cleanly stripped when persisting session records.
- **Format Support**:
  - **Images**: PNG, JPEG, WEBP, GIF, SVG (sent as inline data or multimodal image parts).
  - **Text & Source Code**: Source code files, CSV, TSV, Markdown, JSON, YAML, XML, and logs are cleanly decoded and formatted into syntax-highlighted code fences.
  - **PDF Documents**: Routed through OpenRouter's Cloudflare AI file-parser plugin or provided natively to Gemini multimodal endpoints.
  - **ZIP Archives**: Automatically decompressed client-side via `JSZip` (`zipExtract.ts`), extracting nested files directly into the conversation.

---

## Tavily Web Search & Native Gemini URL Context

### Tavily Web Search Proxy (`/api/search`)

- **Configurable Search Depth**: Choose between `basic`, `advanced`, `fast`, and `ultra-fast` modes.
- **Flexible Execution Modes**:
  - `Always`: Executes a search query on every user turn.
  - `Model Decided`: Prompts the AI model to determine whether fresh internet data is required and generate optimal query keywords.
- **Domain Controls**: Configure allowed and blocked domain lists to constrain search scope.
- **Clickable Sources**: Search results generate interactive `[1]`, `[2]` citation badges in the chat response that link directly to referenced sources.

### Native Gemini URL Context

When interacting with Gemini models:
- If a user prompt contains a public HTTP/HTTPS link, Solara automatically attaches `{ tools: [{ urlContext: {} }] }` to allow Gemini to inspect the webpage directly.
- Private addresses (`localhost`, `127.0.0.1`, RFC 1918 subnets, `.local`, `.internal`) are automatically filtered out.
- If a model rejects the tool parameter, Solara automatically strips the tool and retries in the same execution leg.

---

## Long-Stream Resilience & Overlap Resume Protocol

To prevent Cloud Run, reverse proxy, or mobile network disconnects from severing long-running reasoning sessions, Solara implements an **Overlapping SSE Resumption Protocol**:

```
Leg 1 (0s - 250s)   ═══════════════════════════════════════► [Handoff Event] ──► (Closed at 280s)
                                                                 │
                                                       (Overlapped Resume)
                                                                 ▼
Leg 2 (250s - 500s)                                    ═══════════════════════════► (Active...)
```

- **Global Adaptive Timeouts**:
  - **Initial / Idle Timeout (`600,000 ms` / 10 min)**: Time allowed before the model emits its first token.
  - **Active Stream Promotion (`1,200,000 ms` / 20 min)**: The deadline automatically promotes to 20 minutes as soon as the first thought or text token arrives.
- **Seamless Cloud Run Handoff**:
  - At 250s (`HANDOFF_LEG_MS`), `server.ts` emits a `handoff` event with the current `jobId` and `afterSeq`.
  - The client opens a secondary SSE stream to `/api/chat/resume?jobId=...&afterSeq=...` **before** the old connection terminates.
  - Buffered tokens are replayed with zero character loss, and the upstream LLM connection continues generating without interruption.
- **True Instant Abort**:
  - Pressing the **Stop** button triggers `POST /api/chat/abort`, immediately aborting the upstream HTTP connection via `AbortController` to prevent unnecessary token consumption.

---

## Text-to-Speech (Web Speech API)

Solara includes an in-browser voice reader designed for technical content:

- **Audio Sanitization (`speechSanitizer.ts`)**: Cleans LaTeX mathematical equations, markdown table formatting, code fences, and symbols into natural, readable English prose.
- **Sentence Chunking**: Splits responses into natural conversational phrases to prevent browser audio buffer timeouts on long answers.
- **Interactive Controls**: Per-message Play, Pause, Resume, and Stop controls with real-time audio progress indicators.

---

## Client-Side State & Storage Schema

All application state is saved under organized keys in browser `localStorage`:

| Storage Key | Data Structure | Purpose |
| :--- | :--- | :--- |
| `solara_api_keys` | `Record<ProviderId, string>` | Stored API credentials for providers and Tavily. |
| `solara_custom_providers`| `Record<'custom1' \| 'custom2', CustomProviderSlot>` | Custom OpenAI-compatible endpoints and credentials. |
| `solara_cascades` | `Record<ProviderId, string[]>` | Ordered fallback model arrays for each provider. |
| `solara_thinking_levels`| `Record<ProviderId, Mode>` | Reasoning depth preferences (`default`, `high`, etc.). |
| `solara_capabilities` | `Record<ProviderId, Record<string, ModelCapability>>` | Cached provider metadata and runtime-learned capabilities. |
| `solara_system_prompt` | `string` | Global system instructions applied across conversations. |
| `solara_ui_settings` | `UiSettings` | Theme settings, text scale, max tokens, history depth, Tavily options. |
| `solara_chat_history` | `ChatSession[]` (Max 10) | Recent chat sessions, message histories, and source citations. |
| `solara_active_chat_id` | `string` | ID of the currently selected conversation. |

---

## Backend API Reference

### Proxy & Chat Endpoints

- `GET /api/health`
  Returns server status, stateless configuration, and timeout limits.
- `POST /api/unlock`
  Validates instance access password and issues the `solara_key` session cookie.
- `POST /api/models`
  Queries provider catalogs, applies text-only filtering, and extracts capability metadata.
- `POST /api/chat/stream`
  Executes cascade streaming completions over SSE. Accepts either `application/json` or `multipart/form-data`.
- `GET /api/chat/resume`
  Resumes an in-flight streaming job after a network handoff without token loss.
- `POST /api/chat/abort`
  Cancels upstream model generation for a specific `requestId`.
- `POST /api/upload`
  Parses binary files up to 25 MB into base64 payload attachments.
- `POST /api/search`
  Stateless proxy executing Tavily web searches with domain filtering.

### Server-Sent Event (SSE) Protocol

| Event | Payload | Description |
| :--- | :--- | :--- |
| `model_init` | `{ model: string }` | Identifies the active model chosen from the cascade. |
| `thinking` | `{}` | Emitted when reasoning/thought generation begins. |
| `thought` | `{ text: string }` | Incremental reasoning stream delta. |
| `chunk` | `{ text: string }` | Incremental assistant response delta. |
| `fallback_notice`| `{ failedModel: string, nextModel: string, reason: string }` | Notifies that a model failed and execution transitioned to the next fallback. |
| `learned_capability` | `{ model: string, capability: ModelCapability }` | Emits newly discovered parameter adaptations. |
| `model_meta` | `{ model: string, appliedSummary: string, retried: boolean }` | Summarizes applied thinking and retry metrics. |
| `handoff` | `{ jobId: string, afterSeq: number }` | Signals client to initiate an overlapping connection before connection closure. |
| `done` | `{ modelUsed: string }` | Confirms full completion of the response stream. |
| `error` | `{ error: string }` | Emitted when all models in the cascade fail. |

---

## Getting Started & Local Development

### Prerequisites

- **Node.js**: Version 20.x or 22.x (recommended)
- **Package Manager**: `npm`

### Installation

```bash
git clone <repository-url>
cd solara
npm install
```

### Environment Configuration (Optional)

Create a `.env` file in the root directory for optional defaults:

```env
# Optional fallback Gemini API key
GEMINI_API_KEY="your-gemini-key"

# Optional public application URL (used for OpenRouter HTTP-Referer headers)
APP_URL="https://your-domain.com"

# Optional custom handoff timings for Cloud Run proxies (defaults: 250000 and 280000)
HANDOFF_LEG_MS=250000
LEG_HARD_CAP_MS=280000
```

*Note: All API keys and settings can be entered directly in the browser UI via Settings and stored in `localStorage`.*

### Development Server

Starts the Vite development server with Express backend middleware on port 3000:

```bash
npm run dev
```

### Code Validation & Production Build

```bash
# Typecheck application without emitting files
npm run lint

# Compile client bundle and build assets
npm run build
```

---

## Deployment

### Production Execution

To run the production build using the compiled assets and Express server:

```bash
npm run build
npm start
```

### Container & Cloud Run Deployment

Solara is optimized for containerized environments (such as Google Cloud Run, AWS App Runner, or Docker):
- The Express server serves both the API endpoints and pre-compiled client assets in `dist/`.
- The connection handoff protocol automatically accommodates Cloud Run's 300-second maximum request timeout.
- The password gate prevents unauthorized public traffic from consuming your upstream API quotas.
