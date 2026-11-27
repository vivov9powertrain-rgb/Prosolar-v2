import {
  PROVIDERS,
  type ApiKeysStore,
  type CascadeConfig,
  type ChatMessage,
  type ChatSession,
  type CustomProviderSlot,
  type ProviderCapabilitiesMap,
  type ProviderId,
  type TavilyConfig,
  type ThinkingLevelsMap,
  type UiSettings,
} from '../types';

export const STORAGE_KEYS = {
  API_KEYS: 'api_keys',
  CUSTOM_PROVIDERS: 'custom_providers',
  PROVIDER_CASCADES: 'provider_cascades',
  THINKING_LEVELS: 'thinking_levels',
  SYSTEM_PROMPT: 'system_prompt',
  UI_SETTINGS: 'ui_settings',
  CHAT_HISTORY: 'chat_history',
  ACTIVE_CHAT_ID: 'active_chat_id',
  MODEL_CAPABILITIES: 'model_capabilities',
} as const;

export const MAX_CHAT_SESSIONS = 10;

export const EMPTY_API_KEYS: ApiKeysStore = {
  gemini: '',
  groq: '',
  openrouter: '',
  nvidia: '',
  zai: '',
  custom1: '',
  custom2: '',
  tavily: '',
};

export const EMPTY_CASCADES: CascadeConfig = {
  gemini: [],
  groq: [],
  openrouter: [],
  nvidia: [],
  zai: [],
  custom1: [],
  custom2: [],
};

export const DEFAULT_THINKING_LEVELS: ThinkingLevelsMap = {
  gemini: 'default',
  groq: 'default',
  openrouter: 'default',
  nvidia: 'default',
  zai: 'default',
  custom1: 'default',
  custom2: 'default',
};

export const DEFAULT_CUSTOM_PROVIDERS: Record<'custom1' | 'custom2', CustomProviderSlot> = {
  custom1: { id: 'custom1', name: 'Custom #1', baseUrl: '', apiKey: '' },
  custom2: { id: 'custom2', name: 'Custom #2', baseUrl: '', apiKey: '' },
};

export const DEFAULT_TAVILY_CONFIG: TavilyConfig = {
  enabled: false,
  strategy: 'always',
  depth: 'basic',
  results: 4,
  instructions: '',
  allowSites: '',
  blockSites: '',
  maxCallsPerChat: 5,
};

export const DEFAULT_UI_SETTINGS: UiSettings = {
  activeProvider: 'gemini',
  surfaceColor: '#09090b',
  accentColor: '#22d3ee',
  textColor: '#f4f4f5',
  historyLimit: 10,
  maxTokens: 8192,
  streaming: true,
  textSizeLevel: 1,
  tavily: DEFAULT_TAVILY_CONFIG,
};

function safeReadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadApiKeys(): ApiKeysStore {
  const saved = safeReadJson<Partial<ApiKeysStore>>(STORAGE_KEYS.API_KEYS);
  return {
    ...EMPTY_API_KEYS,
    ...(saved && typeof saved === 'object' ? saved : {}),
  };
}

export function saveApiKeys(keys: ApiKeysStore): void {
  safeWriteJson(STORAGE_KEYS.API_KEYS, keys);
}

export function loadCustomProviders(): Record<'custom1' | 'custom2', CustomProviderSlot> {
  const saved = safeReadJson<Record<string, any>>(STORAGE_KEYS.CUSTOM_PROVIDERS);
  if (!saved || typeof saved !== 'object') {
    return {
      custom1: { ...DEFAULT_CUSTOM_PROVIDERS.custom1 },
      custom2: { ...DEFAULT_CUSTOM_PROVIDERS.custom2 },
    };
  }

  // Support both slot-keyed { custom1, custom2 } and Universa URL-keyed { [baseUrl]: { name, endpoint, apiKey } }
  if (saved.custom1 || saved.custom2) {
    return {
      custom1: {
        id: 'custom1',
        name: typeof saved.custom1?.name === 'string' ? saved.custom1.name : 'Custom #1',
        baseUrl: typeof saved.custom1?.baseUrl === 'string' ? saved.custom1.baseUrl : '',
        apiKey: typeof saved.custom1?.apiKey === 'string' ? saved.custom1.apiKey : '',
      },
      custom2: {
        id: 'custom2',
        name: typeof saved.custom2?.name === 'string' ? saved.custom2.name : 'Custom #2',
        baseUrl: typeof saved.custom2?.baseUrl === 'string' ? saved.custom2.baseUrl : '',
        apiKey: typeof saved.custom2?.apiKey === 'string' ? saved.custom2.apiKey : '',
      },
    };
  }

  const entries = Object.entries(saved);
  const slot1 = entries[0];
  const slot2 = entries[1];
  return {
    custom1: slot1
      ? {
          id: 'custom1',
          name: typeof slot1[1]?.name === 'string' ? slot1[1].name : 'Custom #1',
          baseUrl: typeof slot1[1]?.endpoint === 'string' ? slot1[1].endpoint : slot1[0],
          apiKey: typeof slot1[1]?.apiKey === 'string' ? slot1[1].apiKey : '',
        }
      : { ...DEFAULT_CUSTOM_PROVIDERS.custom1 },
    custom2: slot2
      ? {
          id: 'custom2',
          name: typeof slot2[1]?.name === 'string' ? slot2[1].name : 'Custom #2',
          baseUrl: typeof slot2[1]?.endpoint === 'string' ? slot2[1].endpoint : slot2[0],
          apiKey: typeof slot2[1]?.apiKey === 'string' ? slot2[1].apiKey : '',
        }
      : { ...DEFAULT_CUSTOM_PROVIDERS.custom2 },
  };
}

export function saveCustomProviders(slots: Record<'custom1' | 'custom2', CustomProviderSlot>): void {
  safeWriteJson(STORAGE_KEYS.CUSTOM_PROVIDERS, slots);
}

export function loadCascades(): CascadeConfig {
  const saved = safeReadJson<Partial<Record<ProviderId, unknown>>>(STORAGE_KEYS.PROVIDER_CASCADES);
  const result: CascadeConfig = { ...EMPTY_CASCADES };
  for (const p of PROVIDERS) {
    const arr = saved?.[p.id];
    result[p.id] = Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
  }
  return result;
}

export function saveCascades(cascades: CascadeConfig): void {
  safeWriteJson(STORAGE_KEYS.PROVIDER_CASCADES, cascades);
}

export function loadThinkingLevels(): ThinkingLevelsMap {
  const saved = safeReadJson<Partial<ThinkingLevelsMap>>(STORAGE_KEYS.THINKING_LEVELS);
  return {
    ...DEFAULT_THINKING_LEVELS,
    ...(saved && typeof saved === 'object' ? saved : {}),
  };
}

export function saveThinkingLevels(levels: ThinkingLevelsMap): void {
  safeWriteJson(STORAGE_KEYS.THINKING_LEVELS, levels);
}

export function loadSystemPrompt(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) ?? '';
  } catch {
    return '';
  }
}

export function saveSystemPrompt(prompt: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, prompt);
  } catch {
    // Ignore
  }
}

export function loadUiSettings(): UiSettings {
  const saved = safeReadJson<Partial<UiSettings>>(STORAGE_KEYS.UI_SETTINGS);
  const validHistorySteps = [5, 10, 15, 20, 25, 30, 35, 40];
  const rawLimit = typeof saved?.historyLimit === 'number' ? saved.historyLimit : 10;
  const historyLimit = validHistorySteps.includes(rawLimit) ? rawLimit : 10;
  const rawMaxTokens = typeof saved?.maxTokens === 'number' ? saved.maxTokens : 8192;
  const maxTokens = Math.max(500, Math.min(100_000, Math.round(rawMaxTokens)));

  return {
    ...DEFAULT_UI_SETTINGS,
    ...(saved && typeof saved === 'object' ? saved : {}),
    historyLimit,
    maxTokens,
    tavily: {
      ...DEFAULT_TAVILY_CONFIG,
      ...(saved?.tavily && typeof saved.tavily === 'object' ? saved.tavily : {}),
      results: Math.max(1, Math.min(10, Math.round(saved?.tavily?.results ?? 4))),
      maxCallsPerChat: Math.max(1, Math.min(25, Math.round(saved?.tavily?.maxCallsPerChat ?? 5))),
    },
  };
}

export function saveUiSettings(settings: UiSettings): void {
  safeWriteJson(STORAGE_KEYS.UI_SETTINGS, settings);
}

/** Strip raw base64/dataUrl/File blobs from messages before saving to localStorage so QuotaExceededError never occurs. */
export function stripAttachmentsForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.attachments && m.attachments.length > 0
      ? {
          ...m,
          attachments: m.attachments.map(({ id, name, mimeType, size }) => ({
            id,
            name,
            mimeType,
            size,
          })),
        }
      : m
  );
}

export function loadChatHistory(): ChatSession[] {
  const saved = safeReadJson<unknown>(STORAGE_KEYS.CHAT_HISTORY);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(
      (s): s is ChatSession =>
        Boolean(s) &&
        typeof s === 'object' &&
        typeof s.id === 'string' &&
        Array.isArray(s.messages)
    )
    .slice(0, MAX_CHAT_SESSIONS);
}

export function saveChatHistory(sessions: ChatSession[]): void {
  const pruned = sessions
    .slice(0, MAX_CHAT_SESSIONS)
    .map((s) => ({
      ...s,
      messages: stripAttachmentsForStorage(s.messages),
    }));
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(pruned));
  } catch {
    // Emergency compaction: trim older sessions if still too large
    for (let len = pruned.length - 1; len >= 1; len--) {
      try {
        localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(pruned.slice(0, len)));
        return;
      } catch {
        // continue trimming
      }
    }
  }
}

export function loadActiveChatId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT_ID) || null;
  } catch {
    return null;
  }
}

export function saveActiveChatId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT_ID, id);
    else localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHAT_ID);
  } catch {
    // Ignore
  }
}

export function loadCapabilitiesCache(): ProviderCapabilitiesMap {
  const saved = safeReadJson<ProviderCapabilitiesMap>(STORAGE_KEYS.MODEL_CAPABILITIES);
  return saved && typeof saved === 'object' ? saved : {};
}

export function saveCapabilitiesCache(caps: ProviderCapabilitiesMap): void {
  safeWriteJson(STORAGE_KEYS.MODEL_CAPABILITIES, caps);
}
