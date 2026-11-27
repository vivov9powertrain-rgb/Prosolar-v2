import {
  PROVIDERS,
  REQUEST_TIMEOUT_MS,
  type CustomProviderSlot,
  type Mode,
  type ModelCapability,
  type ProviderConfig,
  type ProviderId,
} from '../types';
import { ALL_NON_DEFAULT_MODES, deriveCapability, reasonFields } from './reasoning';

export function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const n = text.charCodeAt(i);
    if (n < 32 || n === 127) return true;
  }
  return false;
}

/** A base and its full chat URL describe the same API. Never redirect keys. */
export function apiBase(raw: string): string {
  const text = raw.trim();
  if (text.length > 2048 || text.includes('\\') || hasControlChars(text)) {
    throw new Error('Invalid API URL.');
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Enter a complete HTTP(S) base URL or chat/completions URL.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    /[?#]/.test(text)
  ) {
    throw new Error('Use an HTTP(S) API URL without embedded credentials, a query, or a fragment.');
  }
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/(?:chat\/completions|models)$/, '')
    .replace(/\/+$/, '');
  return url.origin + path;
}

export function canonicalOrEmpty(raw: string): string {
  try {
    return apiBase(raw);
  } catch {
    return '';
  }
}

export function validateCustomBaseUrl(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  const base = apiBase(text);
  const url = new URL(base);
  if (url.protocol !== 'https:') {
    throw new Error('Custom provider base URL must use HTTPS.');
  }
  return base;
}

export function validateCustomName(
  name: string,
  otherName?: string
): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 64 || hasControlChars(trimmed)) {
    throw new Error('Provider name must be between 1 and 64 characters.');
  }
  const lower = trimmed.toLowerCase();
  if (PROVIDERS.some((p) => !p.isCustom && p.label.toLowerCase() === lower)) {
    throw new Error('Choose a distinct name that does not match a built-in provider.');
  }
  if (otherName && otherName.trim().toLowerCase() === lower) {
    throw new Error('Custom provider names must be distinct.');
  }
  return trimmed;
}

export function endpoint(raw: string, resource: 'chat/completions' | 'models'): string {
  return `${apiBase(raw)}/${resource}`;
}

export function providerAt(raw: string): ProviderConfig | undefined {
  const base = canonicalOrEmpty(raw);
  if (!base) return undefined;
  return PROVIDERS.find((p) => !p.isCustom && p.baseUrl === base);
}

const naturalCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function compareModelIds(a: string, b: string): number {
  return naturalCollator.compare(a, b);
}

// ============================================================================
// Text-Output Model Filtering & Live Capability Extraction
// ============================================================================
const GEMINI_NON_TEXT_REGEX =
  /(imagen|veo|lyria|embedding|embed|^aqa$|native-audio|audio-dialog|-tts$|-tts-|-image($|-)|image-preview|image-generation)/i;

const OPENROUTER_NON_TEXT_REGEX =
  /(dall-e|gpt-image|imagen|flux|sdxl|whisper|-tts$|-tts-|^tts-|embedding|embed-)/i;

const GROQ_NON_TEXT_REGEX =
  /(whisper|distil-whisper|playai-tts|orpheus|-tts$|-tts-|embed|rerank|llama-guard|prompt-guard)/i;

const NVIDIA_NON_TEXT_REGEX =
  /(embed|rerank|bge-|e5-|parakeet|canary|whisper|fastpitch|hifigan|-tts|cosmos-|stable-diffusion|sdxl|flux|imagen|veo|edify|trellis|diffdock|molmim|genmol|corrdiff|fourcastnet|streampetr|grounding-dino|nvclip|deplot|paddleocr|nemoretriever-ocr|nemoretriever-parse)/i;

const ZAI_CUSTOM_NON_TEXT_REGEX =
  /(cogview|cogvideo|vidu|glm-asr|glm-tts|embedding|embed-|rerank|imagen|veo|flux|sdxl|sora|dall-e|gpt-image|whisper|-tts)/i;

const NON_TEXT_TYPE_SET = new Set([
  'image',
  'audio',
  'video',
  'embedding',
  'embeddings',
  'rerank',
  'tts',
  'stt',
]);

function checkOutputModalitiesAllowText(row: any): boolean {
  if (!row || typeof row !== 'object') return true;

  const arrayCandidates = [
    row.output_modalities,
    row.architecture?.output_modalities,
    row.modalities?.output,
    Array.isArray(row.modalities) ? row.modalities : null,
  ];
  for (const arr of arrayCandidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      const lower = arr.map((x) => String(x).toLowerCase());
      if (!lower.includes('text')) return false;
    }
  }

  const modalityStr = row.architecture?.modality ?? row.modality;
  if (typeof modalityStr === 'string' && modalityStr.includes('->')) {
    const rhs = modalityStr.split('->').slice(1).join('->').toLowerCase();
    if (rhs && !rhs.includes('text')) return false;
  }

  if (typeof row.type === 'string' && NON_TEXT_TYPE_SET.has(row.type.trim().toLowerCase())) {
    return false;
  }

  return true;
}

export function isTextOutputModel(providerId: ProviderId, id: string, row?: any): boolean {
  const cleanId = id.trim();
  if (!cleanId || cleanId.length > 1024 || hasControlChars(cleanId)) return false;

  if (providerId === 'gemini') {
    if (
      Array.isArray(row?.supportedGenerationMethods) &&
      !row.supportedGenerationMethods.includes('generateContent')
    ) {
      return false;
    }
    if (GEMINI_NON_TEXT_REGEX.test(cleanId)) return false;
    return true;
  }

  if (!checkOutputModalitiesAllowText(row)) return false;

  if (providerId === 'openrouter') {
    return !OPENROUTER_NON_TEXT_REGEX.test(cleanId);
  }
  if (providerId === 'groq') {
    return !GROQ_NON_TEXT_REGEX.test(cleanId);
  }
  if (providerId === 'nvidia') {
    return !NVIDIA_NON_TEXT_REGEX.test(cleanId);
  }
  // Z.AI, Custom #1, Custom #2
  return !ZAI_CUSTOM_NON_TEXT_REGEX.test(cleanId);
}

const VALID_MODES = new Set<Mode>([
  'default',
  'none',
  'on',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

function normalizeEffortsToModes(efforts: unknown[]): Mode[] {
  const out = new Set<Mode>(['default']);
  for (const e of efforts) {
    const m = String(e || '').trim().toLowerCase() as Mode;
    if (VALID_MODES.has(m)) out.add(m);
  }
  return [...out];
}

const ALL_SUPPORTED_MODES: Mode[] = ['default', ...ALL_NON_DEFAULT_MODES];

export function extractModelCapability(
  providerId: ProviderId,
  id: string,
  row?: any
): ModelCapability {
  const maxOutputTokens =
    typeof row?.outputTokenLimit === 'number'
      ? row.outputTokenLimit
      : typeof row?.top_provider?.max_completion_tokens === 'number'
        ? row.top_provider.max_completion_tokens
        : typeof row?.max_completion_tokens === 'number'
          ? row.max_completion_tokens
          : typeof row?.max_output_tokens === 'number'
            ? row.max_output_tokens
            : undefined;

  if (providerId === 'gemini') {
    const isGemma4 = id.trim().toLowerCase().startsWith('gemma-4');
    if (typeof row?.thinking === 'boolean') {
      if (row.thinking === false) {
        return {
          supportsThinking: false,
          supportedModes: ['default'],
          mandatory: false,
          maxOutputTokens,
          source: 'live-api',
        };
      }
      return {
        supportsThinking: true,
        supportedModes: isGemma4 ? ['default', 'minimal', 'high'] : [...ALL_SUPPORTED_MODES],
        maxOutputTokens,
        source: 'live-api',
      };
    }
    return {
      ...deriveCapability('gemini', id),
      maxOutputTokens,
    };
  }

  if (providerId === 'openrouter') {
    if (Array.isArray(row?.reasoning?.supported_efforts)) {
      const modes = normalizeEffortsToModes(row.reasoning.supported_efforts);
      return {
        supportsThinking: modes.some((m) => m !== 'default'),
        supportedModes: modes,
        mandatory: Boolean(row.reasoning.mandatory),
        maxOutputTokens,
        source: 'live-api',
      };
    }
    if (row?.reasoning && typeof row.reasoning === 'object' && row.reasoning.supported_efforts === null) {
      return {
        supportsThinking: true,
        supportedModes: [...ALL_SUPPORTED_MODES],
        mandatory: Boolean(row.reasoning.mandatory),
        maxOutputTokens,
        source: 'live-api',
      };
    }
    if (Array.isArray(row?.supported_parameters)) {
      const params = row.supported_parameters.map((p: unknown) => String(p).toLowerCase());
      const hasReasoning =
        params.includes('reasoning') || params.includes('include_reasoning');
      if (!hasReasoning) {
        return {
          supportsThinking: false,
          supportedModes: ['default'],
          mandatory: false,
          maxOutputTokens,
          source: 'live-api',
        };
      }
      return {
        supportsThinking: true,
        supportedModes: [...ALL_SUPPORTED_MODES],
        mandatory: Boolean(row?.reasoning?.mandatory),
        maxOutputTokens,
        source: 'live-api',
      };
    }
    return {
      ...deriveCapability('openrouter', id),
      maxOutputTokens,
    };
  }

  // Generic inspection across Groq, NVIDIA NIM, Z.AI, Arena, Custom 1/2
  if (Array.isArray(row?.reasoning?.supported_efforts) || Array.isArray(row?.supported_efforts)) {
    const rawEfforts = Array.isArray(row?.reasoning?.supported_efforts)
      ? row.reasoning.supported_efforts
      : row.supported_efforts;
    const modes = normalizeEffortsToModes(rawEfforts);
    return {
      supportsThinking: modes.some((m) => m !== 'default'),
      supportedModes: modes,
      mandatory: Boolean(row?.reasoning?.mandatory),
      maxOutputTokens,
      source: 'live-api',
    };
  }

  if (Array.isArray(row?.supported_parameters)) {
    const params = row.supported_parameters.map((p: unknown) => String(p).toLowerCase());
    const hasReasoning =
      params.includes('reasoning') ||
      params.includes('include_reasoning') ||
      params.includes('reasoning_effort');
    return {
      supportsThinking: hasReasoning,
      supportedModes: hasReasoning ? [...ALL_SUPPORTED_MODES] : ['default'],
      mandatory: Boolean(row?.reasoning?.mandatory),
      maxOutputTokens,
      source: 'live-api',
    };
  }

  const boolMeta =
    typeof row?.thinking === 'boolean'
      ? row.thinking
      : typeof row?.reasoning === 'boolean'
        ? row.reasoning
        : typeof row?.capabilities?.reasoning === 'boolean'
          ? row.capabilities.reasoning
          : typeof row?.reasoningCapability?.supported === 'boolean'
            ? row.reasoningCapability.supported
            : undefined;

  if (typeof boolMeta === 'boolean') {
    if (!boolMeta) {
      return {
        supportsThinking: false,
        supportedModes: ['default'],
        mandatory: false,
        maxOutputTokens,
        source: 'live-api',
      };
    }
    return {
      supportsThinking: true,
      supportedModes: [...ALL_SUPPORTED_MODES],
      mandatory: false,
      maxOutputTokens,
      source: 'live-api',
    };
  }

  // When /models exposes no thinking metadata, remain adaptive and never block testing new models
  return {
    supportsThinking: 'unknown',
    supportedModes: [...ALL_SUPPORTED_MODES],
    mandatory: false,
    maxOutputTokens,
    source: 'adaptive',
  };
}

export function parseCatalog(
  providerId: ProviderId,
  json: unknown
): { listed: boolean; ids: string[]; capabilities: Record<string, ModelCapability> } {
  const obj = json as { data?: unknown; models?: unknown } | null;
  const rows = Array.isArray(obj?.data)
    ? obj.data
    : Array.isArray(obj?.models)
      ? obj.models
      : null;

  if (!rows) return { listed: false, ids: [], capabilities: {} };

  const isGemini = providerId === 'gemini';
  const ids = new Set<string>();
  const capabilities: Record<string, ModelCapability> = {};

  for (const row of rows as any[]) {
    const rawId = typeof row?.id === 'string' ? row.id : typeof row?.name === 'string' ? row.name : '';
    if (!rawId) continue;
    const id = isGemini ? rawId.trim().replace(/^models\//, '') : rawId.trim();
    if (!isTextOutputModel(providerId, id, row)) continue;
    ids.add(id);
    capabilities[id] = extractModelCapability(providerId, id, row);
  }

  return { listed: true, ids: [...ids].sort(compareModelIds), capabilities };
}

export interface TestConnectionResult {
  listed: boolean;
  ids: string[];
  publicCatalog?: boolean;
  capabilities: Record<string, ModelCapability>;
}

export async function testConnection(
  providerId: ProviderId,
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<TestConnectionResult> {
  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  const res = await fetch('/api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: combinedSignal,
    body: JSON.stringify({
      providerId,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status} while fetching models.`);
  }

  return {
    listed: Boolean(data?.listed),
    ids: Array.isArray(data?.ids) ? [...data.ids].sort(compareModelIds) : [],
    publicCatalog: Boolean(data?.publicCatalog),
    capabilities:
      data?.capabilities && typeof data.capabilities === 'object' ? data.capabilities : {},
  };
}

export function resolveProviderMeta(
  providerId: ProviderId,
  customProviders: Record<'custom1' | 'custom2', CustomProviderSlot>
): { label: string; shortLabel: string; baseUrl: string; isCustom: boolean; publicModels?: boolean } {
  const baseDef = PROVIDERS.find((p) => p.id === providerId)!;
  if (providerId === 'custom1' || providerId === 'custom2') {
    const slot = customProviders[providerId];
    return {
      label: slot?.name?.trim() || baseDef.label,
      shortLabel: slot?.name?.trim() || baseDef.shortLabel,
      baseUrl: canonicalOrEmpty(slot?.baseUrl || ''),
      isCustom: true,
    };
  }
  return {
    label: baseDef.label,
    shortLabel: baseDef.shortLabel,
    baseUrl: baseDef.baseUrl,
    isCustom: false,
    publicModels: baseDef.publicModels,
  };
}

export function buildPayload(options: {
  providerId: ProviderId;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: unknown }>;
  maxTokens: number;
  streaming: boolean;
  thinkingLevel: Mode;
  temperature?: number;
  capability?: ModelCapability;
}) {
  const {
    providerId,
    model,
    messages,
    maxTokens,
    streaming,
    thinkingLevel,
    temperature,
    capability,
  } = options;
  const clampedTokens = Math.max(500, Math.min(100_000, Math.round(maxTokens || 8192)));

  const body: Record<string, unknown> = {
    model: model.trim(),
    messages,
    stream: streaming,
    ...(providerId === 'groq'
      ? { max_completion_tokens: clampedTokens }
      : { max_tokens: clampedTokens }),
    ...reasonFields(providerId, model, thinkingLevel, capability),
  };

  if (typeof temperature === 'number') {
    body.temperature =
      providerId === 'zai' ? Math.max(0.02, Math.min(1.0, temperature)) : temperature;
  }

  return body;
}

export async function abortServerRequest(requestId: string): Promise<void> {
  if (!requestId) return;
  try {
    await fetch('/api/chat/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ requestId }),
    });
  } catch {
    // Ignore abort delivery errors if already closed
  }
}
