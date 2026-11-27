export type BuiltInProviderId = 'gemini' | 'groq' | 'openrouter' | 'nvidia' | 'zai';
export type CustomProviderId = 'custom1' | 'custom2';
export type ProviderId = BuiltInProviderId | CustomProviderId;

export type Mode =
  | 'default'
  | 'none'
  | 'on'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export interface AttachmentItem {
  id: string;
  name: string;
  mimeType: string;
  data?: string; // base64 without header (transient in-memory only)
  dataUrl?: string; // full data url for preview (transient in-memory only)
  size: number;
  file?: File; // original File object for multipart/form-data upload up to 25 MB
}

export interface SourceItem {
  id: number;
  title: string;
  url: string;
  content?: string;
  score?: number;
}

export interface ModelCapability {
  supportsThinking: boolean | 'unknown';
  supportedModes: Mode[]; // e.g. ['default', 'low', 'medium', 'high', 'xhigh', 'max']
  mandatory?: boolean;
  maxOutputTokens?: number;
  preferredStyle?: 'effort' | 'nim-switch' | 'zai-53' | 'zai-toggle';
  systemAsUser?: boolean;
  source: 'live-api' | 'provider-rules' | 'adaptive' | 'learned-runtime';
}

export type ProviderCapabilitiesMap = Partial<Record<ProviderId, Record<string, ModelCapability>>>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  attachments?: AttachmentItem[];
  thought?: string;
  modelUsed?: string;
  thinkingMeta?: string;
  sources?: SourceItem[];
  webQuery?: string;
  webLookup?: 'tavily' | 'skipped' | 'no-sources';
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  shortLabel: string;
  baseUrl: string;
  isCustom?: boolean;
  publicModels?: boolean;
}

export interface CustomProviderSlot {
  id: CustomProviderId;
  name: string;
  baseUrl: string;
  apiKey: string;
}

export type CascadeConfig = Record<ProviderId, string[]>;

export type ThinkingLevelsMap = Record<ProviderId, Mode>;

export interface ApiKeysStore {
  gemini: string;
  groq: string;
  openrouter: string;
  nvidia: string;
  zai: string;
  custom1: string;
  custom2: string;
  tavily: string;
}

export type TavilyDepth = 'basic' | 'advanced' | 'fast' | 'ultra-fast';
export type TavilyStrategy = 'always' | 'model';

export interface TavilyConfig {
  enabled: boolean;
  strategy: TavilyStrategy;
  depth: TavilyDepth;
  results: number; // 1-10
  instructions: string;
  allowSites: string;
  blockSites: string;
  maxCallsPerChat: number;
}

export interface UiSettings {
  activeProvider: ProviderId;
  surfaceColor: string;
  accentColor: string;
  textColor: string;
  historyLimit: number; // 5,10,15,20,25,30,35,40
  maxTokens: number; // 500-100000
  streaming: boolean;
  textSizeLevel: number; // 1 | 2 | 3
  tavily: TavilyConfig;
}

export interface Settings {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  cascade: string[];
  thinkingLevel: Mode;
  maxTokens: number;
  streaming: boolean;
  historyLimit: number;
  systemPrompt: string;
}

export const HISTORY_LIMIT_STEPS = [5, 10, 15, 20, 25, 30, 35, 40] as const;

export const REQUEST_TIMEOUT_MS = 600_000; // 10 minutes (idle / initial)
export const ACTIVE_STREAM_TIMEOUT_MS = 1_200_000; // 20 minutes (when actively answering)
export const ACTIVE_REQUEST_TIMEOUT_MS = ACTIVE_STREAM_TIMEOUT_MS; // 20 minutes alias
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini',
    label: 'Gemini AI Studio',
    shortLabel: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  {
    id: 'groq',
    label: 'Groq',
    shortLabel: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    shortLabel: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    publicModels: true,
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    shortLabel: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    publicModels: true,
  },
  {
    id: 'zai',
    label: 'Z.AI',
    shortLabel: 'Z.AI',
    baseUrl: 'https://api.z.ai/api/paas/v4',
  },
  {
    id: 'custom1',
    label: 'Custom #1',
    shortLabel: 'Custom 1',
    baseUrl: '',
    isCustom: true,
  },
  {
    id: 'custom2',
    label: 'Custom #2',
    shortLabel: 'Custom 2',
    baseUrl: '',
    isCustom: true,
  },
];
