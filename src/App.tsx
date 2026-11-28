import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Zap,
  Send,
  Plus,
  History,
  Settings as SettingsIcon,
  Terminal,
  Palette,
  Paperclip,
  Layers,
  Globe,
  Check,
  Copy,
  FileText,
  X,
  Maximize2,
  Trash2,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Edit3,
  Search,
  Square,
  ExternalLink,
  AlertCircle,
  Brain,
  Radio,
} from 'lucide-react';
import {
  ACTIVE_STREAM_TIMEOUT_MS,
  HISTORY_LIMIT_STEPS,
  MAX_FILE_SIZE_BYTES,
  REQUEST_TIMEOUT_MS,
  type ApiKeysStore,
  type AttachmentItem,
  type CascadeConfig,
  type ChatMessage,
  type ChatSession,
  type CustomProviderSlot,
  type Mode,
  type ProviderCapabilitiesMap,
  type ProviderId,
  type SourceItem,
  type ThinkingLevelsMap,
  type UiSettings,
} from './types';
import {
  loadActiveChatId,
  loadApiKeys,
  loadCapabilitiesCache,
  loadCascades,
  loadChatHistory,
  loadCustomProviders,
  loadSystemPrompt,
  loadThinkingLevels,
  loadUiSettings,
  MAX_CHAT_SESSIONS,
  saveActiveChatId,
  saveApiKeys,
  saveCapabilitiesCache,
  saveCascades,
  saveChatHistory,
  saveCustomProviders,
  saveSystemPrompt,
  saveThinkingLevels,
  saveUiSettings,
  stripAttachmentsForStorage,
} from './lib/storage';
import {
  abortServerRequest,
  resolveProviderMeta,
} from './lib/providers';
import { getEffectiveModeInfo, THINKING_MODES } from './lib/reasoning';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { MiniPromptDrawer } from './components/MiniPromptDrawer';
import { ProviderSwitcher } from './components/ProviderSwitcher';
import { CascadeEditor } from './components/CascadeEditor';
import { ChatHistoryDrawer } from './components/ChatHistoryDrawer';
import { SystemPromptEditor } from './components/SystemPromptEditor';
import { ConnectionSettingsModal } from './components/TavilySettings';
import { sanitizeForSpeech, splitIntoSpeechChunks } from './utils/speechSanitizer';
import { extractZipForChat } from './lib/zipExtract';
import { CanvasPanel } from './components/CanvasPanel';

const CANVAS_SYSTEM_INSTRUCTION = `
INTERACTIVE CANVAS MODE ENABLED:
When the user asks for a 3D scene, animation, simulation, visualization, game, or interactive web UI:
1. Output ONE complete, self-contained \`\`\`html code block that runs standalone in a browser.
2. For 3D scenes, use pure Three.js via ES Module <script type="importmap">:
   "three": "https://esm.sh/three@0.170.0"
   "three/addons/": "https://esm.sh/three@0.170.0/examples/jsm/"
3. THREE.JS QUALITY & KINEMATICS RULES:
   - Always add environment reflections using PMREMGenerator + RoomEnvironment from 'three/addons/environments/RoomEnvironment.js' so metallic/glass materials shine realistically.
   - Use ACESFilmicToneMapping and UnrealBloomPass (EffectComposer) subtly for sparks, glow, or sci-fi highlights.
   - Rotate ground PlaneGeometry by -Math.PI / 2 on X, and keep the entire model above y = 0.
   - For rotating/articulated parts (crankshafts, joints, wings), place a pivot Group at the exact joint center and rotate ONLY that Group—never double-transform child coordinates.
   - For fast mechanical cycles (engines/turbines), apply a slow-motion visual time scale (e.g. 0.08x) or include a Speed multiplier so individual strokes/valves are clearly readable.
   - For cutaways, restrict the outer opaque CylinderGeometry thetaLength to Math.PI (back half only) so the front cutaway is genuinely open.
4. Never reference local files or external image/model URLs. Generate textures procedurally with HTML <canvas>.
5. Keep the HUD compact in one corner with a working collapse toggle that doesn't overlap the panel.
`.trim();

function extractLatestCanvasArtifact(
  markdown: string
): { code: string; language: string } | null {
  const regex = /```(html|htm|svg|jsx|tsx|react)\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let last: { code: string; language: string } | null = null;
  while ((match = regex.exec(markdown)) !== null) {
    last = {
      language: match[1].toLowerCase(),
      code: match[2].trim(),
    };
  }
  return last;
}

const ThoughtSection: React.FC<{ thought: string; isLive?: boolean }> = ({
  thought,
  isLive = false,
}) => {
  const [isOpen, setIsOpen] = useState(isLive);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLive) setIsOpen(true);
  }, [isLive]);

  useEffect(() => {
    if (isLive && isOpen && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thought, isLive, isOpen]);

  return (
    <div
      className={`mb-3 rounded-xl border transition-all ${
        isLive
          ? 'border-purple-500/40 bg-purple-950/20 shadow-sm'
          : 'border-zinc-800 bg-zinc-950/40'
      } p-2.5 text-xs text-zinc-400`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 font-medium text-zinc-300 hover:text-white transition-colors w-full text-left cursor-pointer"
      >
        <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span className="text-[11px] uppercase tracking-wider font-semibold flex-1 flex items-center gap-1.5 text-purple-300">
          <span>{isLive ? 'Reasoning Active' : 'Thinking Process'}</span>
          {isLive && <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping inline-block" />}
        </span>
        <span className="text-[10px] text-zinc-500 font-mono">{isOpen ? 'Hide' : 'Show'}</span>
      </button>
      {isOpen && (
        <div
          ref={contentRef}
          className="mt-2.5 pl-3 border-l-2 border-purple-500/50 text-zinc-300 leading-relaxed text-[11px] whitespace-pre-wrap max-h-72 overflow-y-auto font-mono bg-black/30 p-2 rounded-r-lg"
        >
          {thought}
        </div>
      )}
    </div>
  );
};

function stripMarkdownToPlainText(markdown: string): string {
  return markdown
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:[\w-]+)?\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s';
  if (ms >= 60_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = ((ms % 60_000) / 1000).toFixed(1);
    return `${mins}m ${secs}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTtfsShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0.00s';
  if (ms >= 60_000) return formatDurationShort(ms);
  return `${(ms / 1000).toFixed(2)}s`;
}

function estimatePromptTokens(
  effectiveSystemPrompt: string,
  outgoingMessages: Array<{
    role: string;
    text: string;
    attachments?: Array<{ data?: string; mimeType: string; size?: number }>;
  }>,
  historyLimit: number
): number {
  const limit =
    typeof historyLimit === 'number' && historyLimit >= 5 && historyLimit <= 40
      ? Math.round(historyLimit)
      : 10;
  const recent =
    outgoingMessages.length > limit ? outgoingMessages.slice(-limit) : outgoingMessages;
  let totalChars = effectiveSystemPrompt.trim().length;
  let binaryAttachmentTokens = 0;

  for (const m of recent) {
    totalChars += (m.text || '').length + 12;
    if (m.attachments && m.attachments.length > 0) {
      for (const att of m.attachments) {
        const mime = (att.mimeType || '').toLowerCase();
        if (att.data && (mime.startsWith('text/') || mime === 'application/json')) {
          totalChars += Math.floor(att.data.length * 0.75);
        } else if (mime.startsWith('image/')) {
          binaryAttachmentTokens += 258;
        } else {
          binaryAttachmentTokens += Math.min(4000, Math.max(64, Math.ceil((att.size || 0) / 16)));
        }
      }
    }
  }
  return Math.max(1, Math.ceil(totalChars / 4) + binaryAttachmentTokens);
}

function deriveChatTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.text.trim());
  if (!firstUser) return 'New Chat';
  const clean = firstUser.text.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

export default function App() {
  // Persistent localStorage state
  const [apiKeys, setApiKeys] = useState<ApiKeysStore>(loadApiKeys);
  const [customProviders, setCustomProviders] = useState<
    Record<'custom1' | 'custom2', CustomProviderSlot>
  >(loadCustomProviders);
  const [cascades, setCascades] = useState<CascadeConfig>(loadCascades);
  const [capabilitiesCache, setCapabilitiesCache] = useState<ProviderCapabilitiesMap>(loadCapabilitiesCache);
  const [thinkingLevels, setThinkingLevels] = useState<ThinkingLevelsMap>(loadThinkingLevels);
  const [systemPrompt, setSystemPrompt] = useState<string>(loadSystemPrompt);
  const [uiSettings, setUiSettings] = useState<UiSettings>(loadUiSettings);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>(loadChatHistory);
  const [activeChatId, setActiveChatId] = useState<string | null>(loadActiveChatId);

  // Active conversation messages (empty on fresh boot)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const savedId = loadActiveChatId();
    const sessions = loadChatHistory();
    if (savedId) {
      const found = sessions.find((s) => s.id === savedId);
      if (found) return found.messages;
    }
    return [];
  });

  // Composer & Streaming State
  const [inputPrompt, setInputPrompt] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStreamingText, setActiveStreamingText] = useState('');
  const [activeStreamingThought, setActiveStreamingThought] = useState('');
  const [isThinkingActive, setIsThinkingActive] = useState(false);
  const [activeModelUsed, setActiveModelUsed] = useState<string>('');
  const [activeThinkingMeta, setActiveThinkingMeta] = useState<string>('');
  const [liveTelemetry, setLiveTelemetry] = useState<{
    elapsedMs: number;
    ttfsMs?: number;
    inputTokens: number;
    outputTokens: number;
    thoughtsTokens?: number;
  } | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [searchCallsUsed, setSearchCallsUsed] = useState<{ exa: number; tavily: number }>({
    exa: 0,
    tavily: 0,
  });

  // Modals & UI popovers
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCascadesOpen, setIsCascadesOpen] = useState(false);
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isMiniPromptOpen, setIsMiniPromptOpen] = useState(false);
  const [canvasArtifact, setCanvasArtifact] = useState<{
    code: string;
    language: string;
  } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Message actions state
  const [copiedState, setCopiedState] = useState<{ id: string; mode: 'md' | 'txt' } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [maxTokensInput, setMaxTokensInput] = useState<string>(String(uiSettings.maxTokens));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const miniPromptTriggerRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string>('');
  const isUserAbortedRef = useRef<boolean>(false);

  // Sync localStorage stores
  useEffect(() => saveApiKeys(apiKeys), [apiKeys]);
  useEffect(() => saveCustomProviders(customProviders), [customProviders]);
  useEffect(() => saveCascades(cascades), [cascades]);
  useEffect(() => saveCapabilitiesCache(capabilitiesCache), [capabilitiesCache]);
  useEffect(() => saveThinkingLevels(thinkingLevels), [thinkingLevels]);
  useEffect(() => saveSystemPrompt(systemPrompt), [systemPrompt]);
  useEffect(() => saveUiSettings(uiSettings), [uiSettings]);
  useEffect(() => saveChatHistory(chatHistory), [chatHistory]);
  useEffect(() => saveActiveChatId(activeChatId), [activeChatId]);

  useEffect(() => {
    setMaxTokensInput(String(uiSettings.maxTokens));
  }, [uiSettings.maxTokens]);

  // Persist active chat messages into chatHistory (max 10 sessions)
  const syncSessionMessages = (nextMessages: ChatMessage[], chatId: string | null): string | null => {
    if (nextMessages.length === 0) return chatId;
    const targetId = chatId || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session: ChatSession = {
      id: targetId,
      title: deriveChatTitle(nextMessages),
      messages: stripAttachmentsForStorage(nextMessages),
      updatedAt: Date.now(),
    };
    setChatHistory((prev) => {
      const rest = prev.filter((s) => s.id !== targetId);
      return [session, ...rest].slice(0, MAX_CHAT_SESSIONS);
    });
    if (targetId !== activeChatId) {
      setActiveChatId(targetId);
    }
    return targetId;
  };

  // Speech synthesis setup & cleanup
  const speechQueueRef = useRef<{
    messageId: string;
    chunks: string[];
    currentIndex: number;
  }>({ messageId: '', chunks: [], currentIndex: 0 });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const handleVoicesChanged = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      window.speechSynthesis.getVoices();
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        window.speechSynthesis.cancel();
      };
    }
  }, []);

  const playSpeechChunk = (index: number, chunks: string[], id: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (index >= chunks.length || speechQueueRef.current.messageId !== id) {
      setSpeakingMessageId(null);
      setIsPaused(false);
      speechQueueRef.current = { messageId: '', chunks: [], currentIndex: 0 };
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.rate = 1.05;
    utterance.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(
        (v) =>
          /samantha|victoria|karen|moira|zira|aria|jenny|google us english|en-us/i.test(v.name) &&
          v.lang.startsWith('en')
      ) ||
      voices.find((v) => v.lang.startsWith('en-US')) ||
      voices.find((v) => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      if (speechQueueRef.current.messageId === id) {
        speechQueueRef.current.currentIndex = index + 1;
        playSpeechChunk(index + 1, chunks, id);
      }
    };
    utterance.onerror = (e: any) => {
      if (e?.error === 'canceled' || e?.error === 'interrupted') return;
      if (speechQueueRef.current.messageId === id) {
        speechQueueRef.current.currentIndex = index + 1;
        playSpeechChunk(index + 1, chunks, id);
      }
    };
    window.speechSynthesis.speak(utterance);
  };

  const handleReadAloud = (rawText: string, id: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingMessageId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      setIsPaused(false);
      speechQueueRef.current = { messageId: '', chunks: [], currentIndex: 0 };
      return;
    }
    window.speechSynthesis.cancel();
    setIsPaused(false);
    const cleanText = sanitizeForSpeech(rawText);
    if (!cleanText) return;
    const chunks = splitIntoSpeechChunks(cleanText);
    if (!chunks.length) return;
    speechQueueRef.current = { messageId: id, chunks, currentIndex: 0 };
    setSpeakingMessageId(id);
    playSpeechChunk(0, chunks, id);
  };

  const handlePauseResume = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (window.speechSynthesis.paused || isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const activeProvider = uiSettings.activeProvider;
  const activeMeta = resolveProviderMeta(activeProvider, customProviders);
  const activeCascade = cascades[activeProvider] || [];
  const activeProviderCaps = capabilitiesCache[activeProvider];
  const activePrimaryModel = activeCascade[0] || '';
  const activePrimaryModelCap = activePrimaryModel
    ? activeProviderCaps?.[activePrimaryModel]
    : undefined;
  const activeThinkingMode = thinkingLevels[activeProvider] || 'default';
  const activeApiKey =
    apiKeys[activeProvider] ||
    (activeProvider === 'custom1'
      ? customProviders.custom1.apiKey
      : activeProvider === 'custom2'
        ? customProviders.custom2.apiKey
        : '');

  const historySliderIndex = useMemo(() => {
    const idx = HISTORY_LIMIT_STEPS.indexOf(uiSettings.historyLimit as any);
    return idx >= 0 ? idx : 1;
  }, [uiSettings.historyLimit]);

  // New Chat & History actions
  const handleNewChat = () => {
    if (isLoading) handleStopStreaming();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
    setIsPaused(false);

    if (messages.length > 0) {
      syncSessionMessages(messages, activeChatId);
    }
    setMessages([]);
    setActiveChatId(null);
    setInputPrompt('');
    setPendingAttachments([]);
    setSearchCallsUsed({ exa: 0, tavily: 0 });
    setStatusBanner(null);
    setFallbackNotice(null);
    setCanvasArtifact(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleSelectChat = (sessionId: string) => {
    if (isLoading) handleStopStreaming();
    if (messages.length > 0 && activeChatId !== sessionId) {
      syncSessionMessages(messages, activeChatId);
    }
    const target = chatHistory.find((s) => s.id === sessionId);
    if (!target) return;
    setActiveChatId(target.id);
    setMessages(target.messages);
    setSearchCallsUsed({ exa: 0, tavily: 0 });
    setStatusBanner(null);
    setFallbackNotice(null);
    setCanvasArtifact(null);
  };

  const handleDeleteChat = (sessionId: string) => {
    setChatHistory((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeChatId === sessionId) {
      setActiveChatId(null);
      setMessages([]);
    }
  };

  // File processing (up to 25 MB per file; unpacks .zip archives safely in browser)
  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setStatusBanner(`"${file.name}" exceeds the 25 MB per-file limit.`);
        continue;
      }

      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const mime =
        file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain');

      if (
        file.name.toLowerCase().endsWith('.zip') ||
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed'
      ) {
        try {
          setStatusBanner(`Unpacking ${file.name} in browser...`);
          const extracted = await extractZipForChat(file);
          setPendingAttachments((prev) => [
            ...prev,
            {
              id,
              name: `${file.name} (${extracted.extractedCount} files${extracted.truncated ? ', partial' : ''})`,
              mimeType: 'text/plain',
              data: extracted.base64Data,
              size: extracted.byteSize,
              // Intentionally omit `file` so raw .zip is NEVER uploaded to Cloud Run
            },
          ]);
          setStatusBanner(null);
        } catch (err: any) {
          setStatusBanner(err?.message || `Failed to unpack "${file.name}".`);
        }
        continue;
      }

      if (mime.startsWith('image/') || file.size <= 4 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = (e.target?.result as string) || '';
          const base64Data = dataUrl.split(',')[1] || '';
          setPendingAttachments((prev) => [
            ...prev,
            {
              id,
              name: file.name,
              mimeType: mime,
              data: base64Data,
              dataUrl: mime.startsWith('image/') ? dataUrl : undefined,
              size: file.size,
              file,
            },
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        // Large files (>4 MB up to 25 MB) keep raw File reference for FormData binary upload without reading huge base64 into React state
        setPendingAttachments((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            mimeType: mime,
            size: file.size,
            file,
          },
        ]);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      processFiles(e.clipboardData.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  const handleInsertMiniPrompt = (snippet: string) => {
    setInputPrompt((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${snippet}` : snippet;
    });
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
      }
    }, 10);
  };

  // True Server-Side Stream Abort
  const handleStopStreaming = () => {
    isUserAbortedRef.current = true;
    const reqId = activeRequestIdRef.current;
    if (reqId) {
      abortServerRequest(reqId);
      activeRequestIdRef.current = '';
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Copy helpers
  const handleCopy = (text: string, id: string, mode: 'md' | 'txt') => {
    const out = mode === 'md' ? text : stripMarkdownToPlainText(text);
    navigator.clipboard.writeText(out).then(() => {
      setCopiedState({ id, mode });
      setTimeout(() => setCopiedState(null), 1600);
    });
  };

  // Edit user query & re-run
  const handleSaveAndResend = (msgId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;

    if (isLoading) handleStopStreaming();
    setIsLoading(false);

    const updatedMsg: ChatMessage = {
      ...messages[idx],
      text: trimmed,
      timestamp: Date.now(),
    };
    const truncated = [...messages.slice(0, idx), updatedMsg];
    setMessages(truncated);
    setEditingMessageId(null);
    setEditText('');

    setTimeout(() => {
      sendMessage(trimmed, truncated);
    }, 50);
  };

  // Web search preparation (Exa AI MCP or Tavily)
  const runWebSearchLookup = async (
    queryText: string,
    signal: AbortSignal
  ): Promise<{
    sources: SourceItem[];
    webQuery?: string;
    webLookup?: 'exa' | 'tavily' | 'skipped' | 'no-sources';
    groundingNote?: string;
  }> => {
    const tavilyCfg = uiSettings.tavily;
    if (!tavilyCfg.enabled) return { sources: [] };

    const activeEngine = uiSettings.searchEngine || 'exa';
    const exaCfg = uiSettings.exa;

    if (activeEngine === 'tavily' && !apiKeys.tavily.trim()) {
      throw new Error(
        'Web search is ON (Tavily), but no Tavily API key is set in Settings — or switch to keyless Exa MCP.'
      );
    }

    const callsUsed = activeEngine === 'exa' ? searchCallsUsed.exa : searchCallsUsed.tavily;
    const maxCalls = activeEngine === 'exa' ? exaCfg.maxCallsPerChat : tavilyCfg.maxCallsPerChat;
    if (callsUsed >= maxCalls) {
      return {
        sources: [],
        webLookup: 'skipped',
        groundingNote: undefined,
      };
    }

    let searchQuery = queryText.trim().slice(0, 400);
    if (!searchQuery) {
      return { sources: [], webLookup: 'skipped' };
    }

    const activeStrategy = activeEngine === 'exa' ? exaCfg.strategy : tavilyCfg.strategy;
    const activeInstructions =
      activeEngine === 'exa' ? exaCfg.instructions : tavilyCfg.instructions;

    if (activeStrategy === 'model') {
      setStatusBanner(
        activeEngine === 'exa'
          ? 'Deciding whether to search with Exa MCP...'
          : 'Deciding whether to search with Tavily...'
      );
      const decidePrompt = [
        'Decide if web search is needed for the user query. Reply ONLY with strict JSON:',
        '{"search":false} OR {"search":true,"query":"short standalone search query"}',
        activeInstructions ? `User search instructions: ${activeInstructions}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const decideRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            providerId: activeProvider,
            baseUrl: activeMeta.baseUrl,
            apiKey: activeApiKey,
            cascade: activeCascade,
            capabilities: activeProviderCaps,
            systemPrompt: decidePrompt,
            messages: [{ role: 'user', text: queryText.slice(0, 2000) }],
            thinkingLevel: 'none',
            historyLimit: 5,
            maxTokens: 500,
            streaming: false,
          }),
        });
        if (decideRes.ok) {
          const decideData = await decideRes.json();
          if (decideData?.learnedCapability && decideData?.modelUsed) {
            setCapabilitiesCache((prev) => ({
              ...prev,
              [activeProvider]: {
                ...(prev[activeProvider] || {}),
                [decideData.modelUsed]: decideData.learnedCapability,
              },
            }));
          }
          const rawJson = String(decideData?.text || '').match(/\{[\s\S]*\}/)?.[0];
          if (rawJson) {
            const parsed = JSON.parse(rawJson);
            if (parsed.search === false) {
              return { sources: [], webLookup: 'skipped' };
            }
            if (typeof parsed.query === 'string' && parsed.query.trim()) {
              searchQuery = parsed.query.trim().slice(0, 400);
            }
          }
        }
      } catch (err: any) {
        if (signal.aborted) throw err;
        // Fallback to direct query search if decision step fails
      }
    }

    setStatusBanner(
      activeEngine === 'exa'
        ? `Searching Exa MCP: "${searchQuery}"...`
        : `Searching Tavily: "${searchQuery}"...`
    );

    const activeMaxTokens = Math.max(
      300,
      Math.min(25_000, Math.round(activeEngine === 'exa' ? exaCfg.maxTokens : tavilyCfg.maxTokens))
    );

    const searchRes =
      activeEngine === 'exa'
        ? await fetch('/api/search/exa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              query: searchQuery,
              exaKey: apiKeys.exa,
              numResults: exaCfg.numResults,
              maxTokens: activeMaxTokens,
              type: exaCfg.type,
              livecrawl: exaCfg.livecrawl,
            }),
          })
        : await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              query: searchQuery,
              tavilyKey: apiKeys.tavily,
              depth: tavilyCfg.depth,
              results: tavilyCfg.results,
              maxTokens: activeMaxTokens,
              allowSites: tavilyCfg.allowSites,
              blockSites: tavilyCfg.blockSites,
            }),
          });

    const searchData = await searchRes.json().catch(() => ({}));
    if (!searchRes.ok) {
      throw new Error(
        searchData?.error || (activeEngine === 'exa' ? 'Exa MCP search failed.' : 'Tavily search failed.')
      );
    }

    setSearchCallsUsed((prev) => ({
      ...prev,
      [activeEngine]: prev[activeEngine] + 1,
    }));
    const sources: SourceItem[] = Array.isArray(searchData?.sources) ? searchData.sources : [];
    if (sources.length === 0) {
      return { sources: [], webQuery: searchQuery, webLookup: 'no-sources' };
    }

    const totalCharBudget = activeMaxTokens * 4;
    const totalContentChars = sources.reduce((sum, s) => sum + (s.content?.length || 0), 0);
    let budgetedSources = sources;

    if (totalContentChars > totalCharBudget) {
      const indexed = sources.map((s, idx) => ({ idx, len: s.content?.length || 0 }));
      indexed.sort((a, b) => a.len - b.len);
      const allocations = new Array<number>(sources.length).fill(0);
      let remainingBudget = totalCharBudget;
      let remainingCount = indexed.length;
      for (const item of indexed) {
        const share = Math.floor(remainingBudget / remainingCount);
        if (item.len <= share) {
          allocations[item.idx] = item.len;
          remainingBudget -= item.len;
        } else {
          allocations[item.idx] = share;
          remainingBudget -= share;
        }
        remainingCount--;
      }
      budgetedSources = sources.map((s, idx) => {
        const cap = allocations[idx];
        const raw = s.content || '';
        if (raw.length <= cap) return s;
        return {
          ...s,
          content: cap > 1 ? `${raw.slice(0, cap - 1).trimEnd()}…` : raw.slice(0, cap),
        };
      });
    }

    const excerptBlock = budgetedSources
      .map((s) => `[${s.id}] ${s.title} (${s.url})\n${s.content || ''}`)
      .join('\n\n');

    const groundingNote = `[Web Search Results for "${searchQuery}" — cite inline as [1], [2] when used]\n${excerptBlock}${
      activeInstructions ? `\n\nSearch Instructions: ${activeInstructions}` : ''
    }`;

    return {
      sources: budgetedSources,
      webQuery: searchQuery,
      webLookup: activeEngine,
      groundingNote,
    };
  };

  // Main Send Handler
  const sendMessage = async (textOverride?: string, historyOverride?: ChatMessage[]) => {
    const prompt = (textOverride ?? inputPrompt).trim();
    const attachmentsToSend = textOverride !== undefined ? [] : [...pendingAttachments];

    if ((!prompt && attachmentsToSend.length === 0) || isLoading) return;

    if (activeMeta.isCustom && !activeMeta.baseUrl) {
      setStatusBanner('Configure your Custom Provider Base URL in Settings first.');
      setIsSettingsOpen(true);
      return;
    }
    if (activeCascade.length === 0) {
      setStatusBanner(`No models in ${activeMeta.shortLabel} cascade. Open Cascades to add a model.`);
      setIsCascadesOpen(true);
      return;
    }

    if (textOverride === undefined) {
      setInputPrompt('');
      setPendingAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: Date.now(),
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
    };

    const nextHistory = historyOverride ? [...historyOverride] : [...messages, userMsg];
    if (!historyOverride) {
      setMessages(nextHistory);
    }

    const currentChatId = syncSessionMessages(nextHistory, activeChatId);

    setIsLoading(true);
    setActiveStreamingText('');
    setActiveStreamingThought('');
    setIsThinkingActive(false);
    setActiveModelUsed(activeCascade[0] || '');
    setActiveThinkingMeta('');
    setStatusBanner(null);
    setFallbackNotice(null);

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeRequestIdRef.current = requestId;
    const userController = new AbortController();
    abortControllerRef.current = userController;
    isUserAbortedRef.current = false;

    const timeoutController = new AbortController();
    const requestStartedAt = Date.now();
    let timeoutPromoted = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timeoutController.abort(
        new DOMException('Request timed out after 10 minutes.', 'TimeoutError')
      );
    }, REQUEST_TIMEOUT_MS);

    const promoteTimeoutToActive = () => {
      if (timeoutPromoted || timeoutController.signal.aborted) return;
      timeoutPromoted = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const remaining = Math.max(1000, ACTIVE_STREAM_TIMEOUT_MS - (Date.now() - requestStartedAt));
      timeoutTimer = setTimeout(() => {
        timeoutController.abort(
          new DOMException('Active response timed out after 20 minutes.', 'TimeoutError')
        );
      }, remaining);
    };

    const combinedSignal = AbortSignal.any([
      userController.signal,
      timeoutController.signal,
    ]);

    let accumulatedText = '';
    let accumulatedThought = '';
    let resolvedModel = activeCascade[0] || '';
    let resolvedThinkingMeta = '';
    let searchSources: SourceItem[] = [];
    let webQuery: string | undefined;
    let webLookup: 'exa' | 'tavily' | 'skipped' | 'no-sources' | undefined;
    let streamStartedAt = 0;
    let ttfsBaseline = 0;
    let firstTokenAt: number | null = null;
    let estimatedInputTokens = 0;
    let serverUsage: {
      inputTokens?: number;
      outputTokens?: number;
      thoughtsTokens?: number;
    } | undefined;
    let telemetryTimer: ReturnType<typeof setInterval> | null = null;

    const buildFinalTelemetry = () => {
      const now = Date.now();
      const elapsedMs = streamStartedAt > 0 ? Math.max(0, now - streamStartedAt) : undefined;
      const ttfsMs =
        firstTokenAt !== null && ttfsBaseline > 0
          ? Math.max(0, firstTokenAt - ttfsBaseline)
          : undefined;
      const hasExactInput = typeof serverUsage?.inputTokens === 'number';
      const hasExactOutput = typeof serverUsage?.outputTokens === 'number';
      const outChars = accumulatedText.length + accumulatedThought.length;
      const estOut = outChars > 0 ? Math.max(1, Math.ceil(outChars / 4)) : 0;
      const thoughtsEst =
        accumulatedThought.length > 0
          ? Math.max(1, Math.ceil(accumulatedThought.length / 4))
          : undefined;
      return {
        ttfsMs,
        elapsedMs,
        inputTokens: hasExactInput ? serverUsage!.inputTokens! : estimatedInputTokens,
        outputTokens: hasExactOutput ? serverUsage!.outputTokens! : estOut,
        thoughtsTokens:
          typeof serverUsage?.thoughtsTokens === 'number'
            ? serverUsage.thoughtsTokens
            : thoughtsEst,
        tokensEstimated: !(hasExactInput && hasExactOutput),
      };
    };

    try {
      // Optional web search lookup (Exa MCP or Tavily) before answering
      let outgoingMessages = nextHistory.map((m) => ({
        role: m.role,
        text: m.text,
        attachments: m.attachments?.map(({ id, name, mimeType, data, size }) => ({
          id,
          name,
          mimeType,
          data,
          size,
        })),
      }));

      if (uiSettings.tavily.enabled && prompt) {
        const lookup = await runWebSearchLookup(prompt, combinedSignal);
        searchSources = lookup.sources;
        webQuery = lookup.webQuery;
        webLookup = lookup.webLookup;
        if (lookup.groundingNote && outgoingMessages.length > 0) {
          const lastIdx = outgoingMessages.length - 1;
          outgoingMessages[lastIdx] = {
            ...outgoingMessages[lastIdx],
            text: `${outgoingMessages[lastIdx].text}\n\n---\n${lookup.groundingNote}`,
          };
        }
        setStatusBanner(null);
      }

      // Check if we have raw File objects (use multipart/form-data to handle up to 25 MB per file cleanly)
      const rawFiles = attachmentsToSend
        .map((a) => a.file)
        .filter((f): f is File => Boolean(f));

      const rawFileAttachmentIds = new Set(
        attachmentsToSend.filter((a) => Boolean(a.file)).map((a) => a.id)
      );

      const effectiveSystemPrompt = uiSettings.canvasMode
        ? [systemPrompt.trim(), CANVAS_SYSTEM_INSTRUCTION].filter(Boolean).join('\n\n')
        : systemPrompt;

      estimatedInputTokens = estimatePromptTokens(
        effectiveSystemPrompt,
        outgoingMessages,
        uiSettings.historyLimit
      );

      const payloadObj = {
        requestId,
        providerId: activeProvider,
        baseUrl: activeMeta.baseUrl,
        apiKey: activeApiKey,
        cascade: activeCascade,
        capabilities: activeProviderCaps,
        systemPrompt: effectiveSystemPrompt,
        thinkingLevel: activeThinkingMode,
        historyLimit: uiSettings.historyLimit,
        maxTokens: uiSettings.maxTokens,
        streaming: uiSettings.streaming,
        messages: outgoingMessages.map((m, idx) =>
          idx === outgoingMessages.length - 1 && rawFiles.length > 0
            ? {
                ...m,
                attachments: m.attachments?.filter(
                  (a) => a.id && !rawFileAttachmentIds.has(a.id)
                ),
              } // Keep inline-only attachments (e.g. unpacked .zip) while raw Files upload via FormData
            : m
        ),
      };

      let fetchInit: RequestInit;
      if (rawFiles.length > 0) {
        const formData = new FormData();
        formData.append('payload', JSON.stringify(payloadObj));
        for (const f of rawFiles) {
          formData.append('files', f, f.name);
        }
        fetchInit = {
          method: 'POST',
          body: formData,
          signal: combinedSignal,
        };
      } else {
        fetchInit = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadObj),
          signal: combinedSignal,
        };
      }

      streamStartedAt = Date.now();
      ttfsBaseline = streamStartedAt;
      const syncLiveTelemetry = () => {
        const now = Date.now();
        const outChars = accumulatedText.length + accumulatedThought.length;
        setLiveTelemetry({
          elapsedMs: Math.max(0, now - streamStartedAt),
          ttfsMs: firstTokenAt !== null ? Math.max(0, firstTokenAt - ttfsBaseline) : undefined,
          inputTokens: estimatedInputTokens,
          outputTokens: outChars > 0 ? Math.max(1, Math.ceil(outChars / 4)) : 0,
          thoughtsTokens:
            accumulatedThought.length > 0
              ? Math.max(1, Math.ceil(accumulatedThought.length / 4))
              : undefined,
        });
      };
      syncLiveTelemetry();
      telemetryTimer = setInterval(syncLiveTelemetry, 100);

      const response = await fetch('/api/chat/stream', fetchInit);
      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        throw new Error(errJson?.error || `HTTP ${response.status} from chat server.`);
      }
      if (!response.body) {
        throw new Error('No response stream returned from server.');
      }

      let lastProcessedSeq = 0;
      const activeJobId = requestId;
      let terminalEventSeen = false;
      let currentResponse: Response | null = response;
      let reconnectAttempts = 0;
      let thinkingUiActive = false;
      const RECONNECT_BACKOFFS = [400, 1000, 2000, 3000];

      let uiFlushTimer: ReturnType<typeof setTimeout> | null = null;
      let dirtyThought = false;
      let dirtyText = false;

      const flushStreamingUi = () => {
        if (uiFlushTimer) {
          clearTimeout(uiFlushTimer);
          uiFlushTimer = null;
        }
        if (dirtyThought) {
          dirtyThought = false;
          setActiveStreamingThought(accumulatedThought);
        }
        if (dirtyText) {
          dirtyText = false;
          setActiveStreamingText(accumulatedText);
        }
      };

      const scheduleStreamingUiFlush = () => {
        if (uiFlushTimer) return;
        uiFlushTimer = setTimeout(() => {
          uiFlushTimer = null;
          flushStreamingUi();
        }, 50);
      };

      const waitWithSignal = (ms: number) =>
        new Promise<void>((resolve, reject) => {
          if (combinedSignal.aborted) {
            reject(combinedSignal.reason || new DOMException('Aborted', 'AbortError'));
            return;
          }
          const t = setTimeout(() => {
            combinedSignal.removeEventListener('abort', onAbort);
            resolve();
          }, ms);
          const onAbort = () => {
            clearTimeout(t);
            reject(combinedSignal.reason || new DOMException('Aborted', 'AbortError'));
          };
          combinedSignal.addEventListener('abort', onAbort, { once: true });
        });

      const readStreamLeg = async (
        resp: Response
      ): Promise<{ handoffResponse: Response | null }> => {
        if (!resp.body) {
          throw new Error('No response stream returned from server.');
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              sseBuffer += decoder.decode();
            } else {
              sseBuffer += decoder.decode(value, { stream: true });
            }

            const lines = sseBuffer.split('\n');
            sseBuffer = done ? '' : lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr || jsonStr === '[DONE]') continue;

              let evt: any = null;
              try {
                evt = JSON.parse(jsonStr);
              } catch {
                continue;
              }

              if (typeof evt._seq === 'number') {
                if (evt._seq <= lastProcessedSeq) continue;
                lastProcessedSeq = evt._seq;
              }

              if (evt.type === 'handoff') {
                flushStreamingUi();
                const handoffJobId =
                  typeof evt.jobId === 'string' && evt.jobId ? evt.jobId : activeJobId;
                const afterSeq = lastProcessedSeq;
                const resumeUrl = `/api/chat/resume?jobId=${encodeURIComponent(handoffJobId)}&afterSeq=${afterSeq}`;
                const nextRes = await fetch(resumeUrl, {
                  signal: combinedSignal,
                  cache: 'no-store',
                  headers: { Accept: 'text/event-stream' },
                });
                if (!nextRes.ok || !nextRes.body) {
                  const errJson = await nextRes.json().catch(() => null);
                  throw new Error(errJson?.error || `Stream handoff failed (HTTP ${nextRes.status}).`);
                }
                reader.cancel().catch(() => {});
                reconnectAttempts = 0;
                return { handoffResponse: nextRes };
              }

              if (evt.type === 'model_init') {
                resolvedModel = evt.model;
                setActiveModelUsed(resolvedModel);
              } else if (evt.type === 'learned_capability') {
                if (evt.model && evt.capability && typeof evt.capability === 'object') {
                  setCapabilitiesCache((prev) => ({
                    ...prev,
                    [activeProvider]: {
                      ...(prev[activeProvider] || {}),
                      [evt.model]: evt.capability,
                    },
                  }));
                }
              } else if (evt.type === 'model_meta') {
                if (typeof evt.appliedSummary === 'string' && evt.appliedSummary.trim()) {
                  resolvedThinkingMeta =
                    evt.retried && !evt.appliedSummary.includes('retried')
                      ? `${evt.appliedSummary.trim()} (retried)`
                      : evt.appliedSummary.trim();
                  setActiveThinkingMeta(resolvedThinkingMeta);
                }
              } else if (evt.type === 'thinking') {
                if (!thinkingUiActive) {
                  thinkingUiActive = true;
                  setIsThinkingActive(true);
                }
              } else if (evt.type === 'thought') {
                promoteTimeoutToActive();
                if (firstTokenAt === null) {
                  firstTokenAt = Date.now();
                }
                reconnectAttempts = 0;
                if (!thinkingUiActive) {
                  thinkingUiActive = true;
                  setIsThinkingActive(true);
                }
                accumulatedThought += evt.text || '';
                dirtyThought = true;
                scheduleStreamingUiFlush();
              } else if (evt.type === 'chunk') {
                promoteTimeoutToActive();
                if (firstTokenAt === null) {
                  firstTokenAt = Date.now();
                }
                reconnectAttempts = 0;
                if (thinkingUiActive) {
                  thinkingUiActive = false;
                  setIsThinkingActive(false);
                }
                accumulatedText += evt.text || '';
                dirtyText = true;
                scheduleStreamingUiFlush();
              } else if (evt.type === 'fallback_notice') {
                if (uiFlushTimer) {
                  clearTimeout(uiFlushTimer);
                  uiFlushTimer = null;
                }
                dirtyThought = false;
                dirtyText = false;
                accumulatedText = '';
                accumulatedThought = '';
                resolvedThinkingMeta = '';
                firstTokenAt = null;
                ttfsBaseline = Date.now();
                serverUsage = undefined;
                thinkingUiActive = false;
                setIsThinkingActive(false);
                setActiveStreamingText('');
                setActiveStreamingThought('');
                setActiveThinkingMeta('');
                resolvedModel = evt.nextModel || resolvedModel;
                setActiveModelUsed(resolvedModel);
                setFallbackNotice(
                  `Switched from ${evt.failedModel} → ${evt.nextModel} (${evt.reason || 'fallback'})`
                );
              } else if (evt.type === 'done') {
                flushStreamingUi();
                terminalEventSeen = true;
                if (evt.usage && typeof evt.usage === 'object') {
                  serverUsage = evt.usage;
                }
                if (evt.modelUsed) {
                  resolvedModel = evt.modelUsed;
                  setActiveModelUsed(resolvedModel);
                }
                return { handoffResponse: null };
              } else if (evt.type === 'error') {
                flushStreamingUi();
                terminalEventSeen = true;
                throw new Error(evt.error || 'Upstream model error.');
              }
            }

            if (done) break;
          }

          flushStreamingUi();
          return { handoffResponse: null };
        } finally {
          reader.cancel().catch(() => {});
        }
      };

      try {
        while (currentResponse && !terminalEventSeen) {
          if (combinedSignal.aborted) {
            throw combinedSignal.reason || new DOMException('Aborted', 'AbortError');
          }

          try {
            const { handoffResponse } = await readStreamLeg(currentResponse);
            if (handoffResponse) {
              currentResponse = handoffResponse;
              reconnectAttempts = 0;
              continue;
            }
            currentResponse = null;
            if (terminalEventSeen) break;
            throw new Error('Stream closed before completion.');
          } catch (legErr: any) {
            if (
              terminalEventSeen ||
              isUserAbortedRef.current ||
              combinedSignal.aborted ||
              legErr?.name === 'AbortError' ||
              legErr?.name === 'TimeoutError'
            ) {
              throw legErr;
            }

            let resumedResp: Response | null = null;
            let lastResumeErr: any = legErr;

            while (reconnectAttempts < RECONNECT_BACKOFFS.length) {
              const delayMs = RECONNECT_BACKOFFS[reconnectAttempts++];
              await waitWithSignal(delayMs);
              try {
                const resumeUrl = `/api/chat/resume?jobId=${encodeURIComponent(activeJobId)}&afterSeq=${lastProcessedSeq}`;
                const candidateResp = await fetch(resumeUrl, {
                  signal: combinedSignal,
                  cache: 'no-store',
                  headers: { Accept: 'text/event-stream' },
                });
                if (candidateResp.status === 404) {
                  const expiredErr = new Error('Stream session expired on server.') as Error & {
                    fatal?: boolean;
                  };
                  expiredErr.fatal = true;
                  throw expiredErr;
                }
                if (!candidateResp.ok || !candidateResp.body) {
                  const errJson = await candidateResp.json().catch(() => null);
                  throw new Error(errJson?.error || `Resume failed (HTTP ${candidateResp.status}).`);
                }
                resumedResp = candidateResp;
                break;
              } catch (retryErr: any) {
                if (
                  retryErr?.fatal ||
                  isUserAbortedRef.current ||
                  combinedSignal.aborted ||
                  retryErr?.name === 'AbortError' ||
                  retryErr?.name === 'TimeoutError'
                ) {
                  throw retryErr;
                }
                lastResumeErr = retryErr;
              }
            }

            if (!resumedResp) {
              throw lastResumeErr;
            }
            currentResponse = resumedResp;
          }
        }
      } finally {
        if (uiFlushTimer) {
          clearTimeout(uiFlushTimer);
          uiFlushTimer = null;
        }
      }

      if (!accumulatedText.trim() && accumulatedThought.trim()) {
        accumulatedText = accumulatedThought;
      }

      if (!accumulatedText.trim()) {
        throw new Error('Empty response received from model.');
      }

      const finalTelemetry = buildFinalTelemetry();
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        text: accumulatedText,
        thought: accumulatedThought || undefined,
        timestamp: Date.now(),
        modelUsed: `${activeMeta.shortLabel} · ${resolvedModel}`,
        thinkingMeta: resolvedThinkingMeta || undefined,
        sources: searchSources.length > 0 ? searchSources : undefined,
        webQuery,
        webLookup,
        ...finalTelemetry,
      };

      const finalHistory = [...nextHistory, aiMsg];
      setMessages(finalHistory);
      syncSessionMessages(finalHistory, currentChatId);
      if (uiSettings.canvasMode) {
        const detectedArtifact = extractLatestCanvasArtifact(accumulatedText);
        if (detectedArtifact && detectedArtifact.code.length > 120) {
          setCanvasArtifact(detectedArtifact);
        }
      }
    } catch (err: any) {
      if (isUserAbortedRef.current || err?.name === 'AbortError') {
        const partial = accumulatedText.trim();
        const stoppedTelemetry = buildFinalTelemetry();
        const stoppedMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'model',
          text: partial ? `${partial}\n\n*(Stopped)*` : '*(Stopped)*',
          thought: accumulatedThought || undefined,
          timestamp: Date.now(),
          modelUsed: `${activeMeta.shortLabel} · ${resolvedModel}`,
          thinkingMeta: resolvedThinkingMeta || undefined,
          sources: searchSources.length > 0 ? searchSources : undefined,
          webQuery,
          webLookup,
          ...stoppedTelemetry,
          tokensEstimated: true,
        };
        const finalHistory = [...nextHistory, stoppedMsg];
        setMessages(finalHistory);
        syncSessionMessages(finalHistory, currentChatId);
        return;
      }

      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        text: `**Request failed:** ${err?.message || 'Unknown error'}`,
        timestamp: Date.now(),
        modelUsed: activeMeta.shortLabel,
      };
      const finalHistory = [...nextHistory, errMsg];
      setMessages(finalHistory);
      syncSessionMessages(finalHistory, currentChatId);
    } finally {
      if (telemetryTimer) {
        clearInterval(telemetryTimer);
        telemetryTimer = null;
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      setIsLoading(false);
      setActiveStreamingText('');
      setActiveStreamingThought('');
      setIsThinkingActive(false);
      setActiveThinkingMeta('');
      setLiveTelemetry(null);
      setStatusBanner(null);
      setFallbackNotice(null);
      abortControllerRef.current = null;
      activeRequestIdRef.current = '';
      isUserAbortedRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filteredMessages = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        (m.thought || '').toLowerCase().includes(q) ||
        (m.modelUsed || '').toLowerCase().includes(q)
    );
  }, [messages, chatSearchQuery]);

  const themeStyle = {
    '--sol-surface': uiSettings.surfaceColor,
    '--sol-accent': uiSettings.accentColor,
    '--sol-text': uiSettings.textColor,
    color: uiSettings.textColor,
  } as React.CSSProperties;

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={themeStyle}
      className="flex flex-col h-[100dvh] w-full max-w-full bg-black overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]"
    >
      {/* Top Header */}
      <header
        style={{ backgroundColor: uiSettings.surfaceColor }}
        className="shrink-0 min-h-14 border-b border-zinc-800 px-2.5 sm:px-5 py-2 md:py-0 flex flex-wrap md:flex-nowrap items-center justify-between gap-x-2 gap-y-2 z-30"
      >
        {/* Left: Brand + New Chat + Chat History */}
        <div className="order-1 flex items-center gap-1.5 sm:gap-2 min-w-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div
              style={{ borderColor: `${uiSettings.accentColor}55`, color: uiSettings.accentColor }}
              className="w-8 h-8 rounded-lg bg-zinc-900 border flex items-center justify-center shrink-0"
            >
              <Zap className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm sm:text-base tracking-tight hidden sm:inline">
              Solara
            </span>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer shrink-0"
            title="Start a new chat (current chat saved to history)"
          >
            <Plus className="w-3.5 h-3.5" style={{ color: uiSettings.accentColor }} />
            <span className="hidden md:inline">New Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 transition-colors cursor-pointer shrink-0"
            title="Chat History (last 10 chats)"
          >
            <History className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden lg:inline">History</span>
            <span className="text-[10px] font-mono text-zinc-500">({chatHistory.length})</span>
          </button>
        </div>

        {/* Center (Row 2 on mobile, centered on desktop): Horizontal Scrollable Provider Switcher */}
        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 min-w-0 flex justify-start md:justify-center pt-1.5 md:pt-0 border-t border-zinc-800/70 md:border-t-0">
          <ProviderSwitcher
            activeProvider={activeProvider}
            onSelectProvider={(id) =>
              setUiSettings((prev) => ({ ...prev, activeProvider: id }))
            }
            cascades={cascades}
            customProviders={customProviders}
            accentColor={uiSettings.accentColor}
          />
        </div>

        {/* Right: System Prompt + Theme Customizer + Settings */}
        <div className="order-2 md:order-3 flex items-center gap-1.5 shrink-0 relative">
          <button
            type="button"
            onClick={() => setIsSystemPromptOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              systemPrompt.trim()
                ? 'bg-zinc-900 border-cyan-500/40 text-cyan-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
            }`}
            title="Edit System Prompt"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">System Prompt</span>
          </button>

          <button
            type="button"
            onClick={() => setIsThemeOpen((v) => !v)}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Theme & Color Customizer"
          >
            <Palette className="w-4 h-4" style={{ color: uiSettings.accentColor }} />
          </button>

          {isThemeOpen && (
            <>
              <div
                onClick={() => setIsThemeOpen(false)}
                className="fixed inset-0 z-40"
                aria-hidden="true"
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-12 right-0 w-72 max-w-[calc(100vw-1.5rem)] bg-[#09090b] border border-zinc-800 rounded-2xl shadow-2xl p-4 z-50 space-y-3"
              >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-xs font-bold text-zinc-100">Appearance</span>
                <button
                  type="button"
                  onClick={() => setIsThemeOpen(false)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <label className="space-y-1">
                  <span className="text-zinc-400 block">Surface</span>
                  <input
                    type="color"
                    value={uiSettings.surfaceColor}
                    onChange={(e) =>
                      setUiSettings((prev) => ({ ...prev, surfaceColor: e.target.value }))
                    }
                    className="w-full h-8 rounded bg-black border border-zinc-800 cursor-pointer"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400 block">Accent</span>
                  <input
                    type="color"
                    value={uiSettings.accentColor}
                    onChange={(e) =>
                      setUiSettings((prev) => ({ ...prev, accentColor: e.target.value }))
                    }
                    className="w-full h-8 rounded bg-black border border-zinc-800 cursor-pointer"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400 block">Text</span>
                  <input
                    type="color"
                    value={uiSettings.textColor}
                    onChange={(e) =>
                      setUiSettings((prev) => ({ ...prev, textColor: e.target.value }))
                    }
                    className="w-full h-8 rounded bg-black border border-zinc-800 cursor-pointer"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-zinc-400">Prose Size</span>
                <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                  {[1, 2, 3].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() =>
                        setUiSettings((prev) => ({ ...prev, textSizeLevel: lvl }))
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        uiSettings.textSizeLevel === lvl
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {lvl}x
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setUiSettings((prev) => ({
                    ...prev,
                    surfaceColor: '#09090b',
                    accentColor: '#22d3ee',
                    textColor: '#f4f4f5',
                    textSizeLevel: 1,
                  }))
                }
                className="w-full py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 cursor-pointer"
              >
                Reset Dark Defaults
              </button>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
            title="Connections, API Keys, Custom Providers & Tavily Search"
          >
            <SettingsIcon className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* Slim Secondary Bar: Horizontally scrollable on narrow viewports */}
      <div className="shrink-0 px-3 sm:px-6 py-1.5 bg-zinc-950/90 border-b border-zinc-800/80 flex items-center justify-between gap-3 flex-nowrap overflow-x-auto no-scrollbar text-[11px] text-zinc-400">
        <div className="flex items-center gap-3 sm:gap-4 flex-nowrap shrink-0">
          {/* History Limit Slider (steps 5..40) */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-zinc-500 font-medium whitespace-nowrap">History:</span>
            <input
              type="range"
              min={0}
              max={HISTORY_LIMIT_STEPS.length - 1}
              step={1}
              value={historySliderIndex}
              onChange={(e) => {
                const nextVal = HISTORY_LIMIT_STEPS[Number(e.target.value)] ?? 10;
                setUiSettings((prev) => ({ ...prev, historyLimit: nextVal }));
              }}
              className="w-20 sm:w-24 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
              title={`Send last ${uiSettings.historyLimit} messages`}
            />
            <span className="font-mono text-zinc-200 w-6 text-right">{uiSettings.historyLimit}</span>
          </div>

          {/* Max Tokens Input (500-100000) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-zinc-500 font-medium whitespace-nowrap">Max Tokens:</span>
            <input
              type="number"
              min={500}
              max={100000}
              step={256}
              value={maxTokensInput}
              onChange={(e) => setMaxTokensInput(e.target.value)}
              onBlur={() => {
                const parsed = parseInt(maxTokensInput, 10);
                const clamped = Number.isFinite(parsed)
                  ? Math.max(500, Math.min(100000, parsed))
                  : 8192;
                setUiSettings((prev) => ({ ...prev, maxTokens: clamped }));
                setMaxTokensInput(String(clamped));
              }}
              className="w-20 px-2 py-0.5 rounded bg-black border border-zinc-800 text-zinc-200 font-mono text-[11px] focus:outline-none focus:border-cyan-500/60"
            />
          </div>
        </div>

        {/* Active Cascade Indicator & In-Chat Search */}
        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          <button
            type="button"
            onClick={() => setIsCascadesOpen(true)}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 cursor-pointer shrink-0"
            title="Edit cascade for active provider"
          >
            <Layers className="w-3 h-3 shrink-0" style={{ color: uiSettings.accentColor }} />
            <span className="font-mono truncate max-w-[170px] sm:max-w-[220px]">
              {activeCascade.length === 0
                ? `${activeMeta.shortLabel}: empty cascade`
                : `${activeMeta.shortLabel}: ${activeCascade[0]}${
                    activeCascade.length > 1 ? ` (+${activeCascade.length - 1})` : ''
                  }`}
            </span>
          </button>

          {isChatSearchOpen ? (
            <div className="flex items-center gap-1 bg-black border border-zinc-800 rounded-md px-2 py-0.5 shrink-0">
              <Search className="w-3 h-3 text-zinc-500 shrink-0" />
              <input
                type="text"
                autoFocus
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                placeholder="Filter chat..."
                className="w-28 bg-transparent text-[11px] text-zinc-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setChatSearchQuery('');
                  setIsChatSearchOpen(false);
                }}
                className="text-zinc-500 hover:text-zinc-200 cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsChatSearchOpen(true)}
              className="p-1 rounded hover:bg-zinc-900 text-zinc-500 hover:text-zinc-200 cursor-pointer shrink-0"
              title="Search messages in current chat"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status / Fallback Notice */}
      {(statusBanner || fallbackNotice) && (
        <div className="shrink-0 px-4 py-1.5 bg-zinc-900/90 border-b border-zinc-800 text-xs flex items-center justify-between gap-2 text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{statusBanner || fallbackNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatusBanner(null);
              setFallbackNotice(null);
            }}
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Workspace: Chat on Left, Interactive Canvas on Right */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Main Chat Canvas */}
          <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && !isLoading ? (
            <div className="py-16 text-center space-y-4">
              <div
                style={{ borderColor: `${uiSettings.accentColor}44`, color: uiSettings.accentColor }}
                className="w-12 h-12 rounded-2xl bg-zinc-950 border mx-auto flex items-center justify-center"
              >
                <Zap className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h1 className="text-lg font-bold tracking-tight">Stateless Multi-Provider Chat</h1>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  All API keys, cascades, custom endpoints, system prompts, and your last 10 chats live strictly in browser <code className="text-zinc-300">localStorage</code>.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <SettingsIcon className="w-3.5 h-3.5" style={{ color: uiSettings.accentColor }} />
                  <span>Add API Keys</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCascadesOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" style={{ color: uiSettings.accentColor }} />
                  <span>Configure Model Cascades</span>
                </button>
              </div>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {/* Meta Header */}
                  <div className="flex items-center justify-between gap-2 mb-1 px-1 text-[11px] text-zinc-500 w-full max-w-[94%] sm:max-w-[85%] min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                      <span className="font-semibold text-zinc-400 shrink-0">
                        {isUser ? 'You' : 'Assistant'}
                      </span>
                      {msg.modelUsed && !isUser && (
                        <span className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[10px] truncate max-w-[180px] sm:max-w-xs">
                          {msg.modelUsed}
                        </span>
                      )}
                      {msg.thinkingMeta && !isUser && (
                        <span
                          className="px-1.5 py-0.2 rounded bg-purple-950/35 border border-purple-500/30 text-purple-300/90 text-[10px] truncate max-w-[210px] sm:max-w-sm"
                          title={msg.thinkingMeta}
                        >
                          {msg.thinkingMeta}
                        </span>
                      )}
                      {msg.webQuery && (
                        <span className="px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[10px] truncate max-w-[160px] sm:max-w-xs">
                          Web: {msg.webQuery}
                        </span>
                      )}
                      <span className="shrink-0">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Delete message */}
                    <div className="flex items-center gap-1 shrink-0">
                      {deletingMessageId === msg.id ? (
                        <div className="flex items-center gap-1 bg-rose-950/90 border border-rose-500/50 px-2 py-0.5 rounded text-[10px] text-rose-200">
                          <span>Delete?</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = messages.filter((m) => m.id !== msg.id);
                              setMessages(updated);
                              setDeletingMessageId(null);
                              syncSessionMessages(updated, activeChatId);
                            }}
                            className="text-white font-bold px-1.5 bg-rose-600 rounded cursor-pointer"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingMessageId(null)}
                            className="text-zinc-300 px-1.5 bg-zinc-800 rounded cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingMessageId(msg.id)}
                          className="opacity-40 hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer"
                          title="Delete message"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message Bubble */}
                  <div
                    style={{
                      backgroundColor: isUser ? undefined : uiSettings.surfaceColor,
                    }}
                    className={`relative p-3.5 sm:p-5 rounded-2xl max-w-[94%] sm:max-w-[85%] min-w-0 transition-all ${
                      isUser
                        ? 'bg-zinc-900 border border-zinc-800 rounded-tr-sm'
                        : 'border border-zinc-800/90 rounded-tl-sm'
                    }`}
                  >
                    {/* Attachments Preview */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {msg.attachments.map((att) => {
                          const isImg = att.mimeType.startsWith('image/') && att.dataUrl;
                          return (
                            <div
                              key={att.id}
                              className="relative group/att rounded-xl overflow-hidden border border-zinc-800 bg-black max-w-[200px]"
                            >
                              {isImg ? (
                                <div
                                  onClick={() => setPreviewImage(att.dataUrl!)}
                                  className="cursor-pointer relative overflow-hidden"
                                >
                                  <img
                                    src={att.dataUrl}
                                    alt={att.name}
                                    className="h-28 w-full object-cover rounded-lg group-hover/att:scale-105 transition-transform"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/att:opacity-100 flex items-center justify-center transition-opacity">
                                    <Maximize2 className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2.5 flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                                  <div className="text-[11px] truncate">
                                    <p className="font-semibold text-zinc-200 truncate">{att.name}</p>
                                    <p className="text-zinc-500 text-[10px]">
                                      {Math.max(1, Math.round((att.size || 0) / 1024))} KB
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Message Body or Inline Edit */}
                    {isUser && editingMessageId === msg.id ? (
                      <div className="space-y-2.5">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              handleSaveAndResend(msg.id);
                            } else if (e.key === 'Escape') {
                              setEditingMessageId(null);
                            }
                          }}
                          rows={Math.max(2, Math.min(8, editText.split('\n').length + 1))}
                          className="w-full p-2.5 bg-black border border-cyan-500/70 rounded-xl text-sm text-zinc-100 focus:outline-none resize-y"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingMessageId(null)}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveAndResend(msg.id)}
                            disabled={!editText.trim()}
                            className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-black flex items-center gap-1 cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Save & Re-run</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {!isUser && msg.thought && <ThoughtSection thought={msg.thought} />}
                        <MarkdownRenderer
                          content={msg.text}
                          textSizeLevel={uiSettings.textSizeLevel}
                          sources={msg.sources}
                          onOpenCanvas={setCanvasArtifact}
                        />
                      </div>
                    )}

                    {/* Tavily Cited Sources */}
                    {!isUser && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-zinc-800/70 space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Sources
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src) => (
                            <a
                              key={src.id}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/70 hover:bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 hover:text-cyan-300 transition-colors max-w-[260px]"
                            >
                              <span className="font-mono text-[10px] text-cyan-400">
                                [{src.id}]
                              </span>
                              <span className="truncate">{src.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Per-Message Action Bar */}
                    <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center flex-wrap gap-1.5 text-xs text-zinc-400">
                      {isUser && editingMessageId !== msg.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMessageId(msg.id);
                            setEditText(msg.text);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-cyan-300 text-[11px] cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Query</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopy(msg.text, msg.id, 'md')}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                      >
                        {copiedState?.id === msg.id && copiedState.mode === 'md' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied MD</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Markdown</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(msg.text, msg.id, 'txt')}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                      >
                        {copiedState?.id === msg.id && copiedState.mode === 'txt' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied Text</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-3 h-3" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReadAloud(msg.text, msg.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                      >
                        {speakingMessageId === msg.id ? (
                          <>
                            <VolumeX className="w-3 h-3 text-rose-400" />
                            <span className="text-rose-400">Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3 text-cyan-400" />
                            <span>Read Aloud</span>
                          </>
                        )}
                      </button>

                      {speakingMessageId === msg.id && (
                        <button
                          type="button"
                          onClick={handlePauseResume}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                        >
                          {isPaused ? (
                            <>
                              <Play className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Resume</span>
                            </>
                          ) : (
                            <>
                              <Pause className="w-3 h-3 text-amber-400" />
                              <span className="text-amber-400">Pause</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {!isUser &&
                      (msg.ttfsMs !== undefined ||
                        msg.inputTokens !== undefined ||
                        msg.outputTokens !== undefined ||
                        msg.elapsedMs !== undefined) && (
                        <div className="mt-2 pt-1.5 border-t border-zinc-800/50 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-mono text-zinc-500">
                          {msg.ttfsMs !== undefined && (
                            <span>TTFS {formatTtfsShort(msg.ttfsMs)}</span>
                          )}
                          {msg.inputTokens !== undefined && (
                            <>
                              {msg.ttfsMs !== undefined && <span className="text-zinc-700">·</span>}
                              <span>
                                In {msg.tokensEstimated ? '~' : ''}
                                {msg.inputTokens.toLocaleString()}
                              </span>
                            </>
                          )}
                          {msg.outputTokens !== undefined && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span
                                title={
                                  msg.thoughtsTokens !== undefined
                                    ? `Includes ${msg.tokensEstimated ? '~' : ''}${msg.thoughtsTokens.toLocaleString()} thinking tokens`
                                    : undefined
                                }
                              >
                                Out {msg.tokensEstimated ? '~' : ''}
                                {msg.outputTokens.toLocaleString()}
                              </span>
                            </>
                          )}
                          {msg.elapsedMs !== undefined && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span>{formatDurationShort(msg.elapsedMs)}</span>
                            </>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              );
            })
          )}

          {/* Active Streaming Bubble */}
          {isLoading && (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2 flex-wrap mb-1 px-1 text-[11px] text-zinc-500">
                <span className="font-semibold text-cyan-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Streaming</span>
                </span>
                <span className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[10px]">
                  {activeMeta.shortLabel} · {activeModelUsed || activeCascade[0]}
                </span>
                {activeThinkingMeta && (
                  <span
                    className="px-1.5 py-0.2 rounded bg-purple-950/35 border border-purple-500/30 text-purple-300/90 text-[10px] truncate max-w-[220px] sm:max-w-sm"
                    title={activeThinkingMeta}
                  >
                    {activeThinkingMeta}
                  </span>
                )}
              </div>

              <div
                style={{ backgroundColor: uiSettings.surfaceColor }}
                className="relative p-4 sm:p-5 rounded-2xl max-w-[94%] sm:max-w-[85%] border border-cyan-500/30 rounded-tl-sm shadow-xl"
              >
                {activeStreamingThought && (
                  <ThoughtSection thought={activeStreamingThought} isLive />
                )}
                {isThinkingActive && !activeStreamingThought && !activeStreamingText && (
                  <div className="flex items-center gap-2 text-xs text-purple-300 animate-pulse mb-2">
                    <Brain className="w-3.5 h-3.5" />
                    <span>Reasoning...</span>
                  </div>
                )}
                {activeStreamingText ? (
                  <MarkdownRenderer
                    content={activeStreamingText}
                    textSizeLevel={uiSettings.textSizeLevel}
                    onOpenCanvas={setCanvasArtifact}
                  />
                ) : (
                  !activeStreamingThought && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      <span>Waiting for first token...</span>
                    </div>
                  )
                )}

                {liveTelemetry && (
                  <div className="mt-3 pt-2 border-t border-zinc-800/50 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-mono text-zinc-500">
                    <span>
                      TTFS{' '}
                      {liveTelemetry.ttfsMs !== undefined
                        ? formatTtfsShort(liveTelemetry.ttfsMs)
                        : '…'}
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span>In ~{liveTelemetry.inputTokens.toLocaleString()}</span>
                    <span className="text-zinc-700">·</span>
                    <span>Out ~{liveTelemetry.outputTokens.toLocaleString()}</span>
                    <span className="text-zinc-700">·</span>
                    <span>{formatDurationShort(liveTelemetry.elapsedMs)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Composer */}
      <footer className="shrink-0 p-2.5 sm:p-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] bg-black border-t border-zinc-800 z-20">
        <div className="max-w-4xl mx-auto space-y-2 min-w-0">
          {/* Composer Toolbar (Horizontally scrollable on narrow viewports) */}
          <div className="flex items-center justify-between gap-2 flex-nowrap overflow-x-auto no-scrollbar text-xs">
            <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
              {/* Streaming Toggle */}
              <button
                type="button"
                onClick={() =>
                  setUiSettings((prev) => ({ ...prev, streaming: !prev.streaming }))
                }
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                  uiSettings.streaming
                    ? 'bg-zinc-900 border-emerald-500/40 text-emerald-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                }`}
                title="Toggle streaming SSE responses"
              >
                <Radio className="w-3 h-3" />
                <span>Stream: {uiSettings.streaming ? 'ON' : 'OFF'}</span>
              </button>

              {/* Canvas / 3D Mode Toggle */}
              <button
                type="button"
                onClick={() =>
                  setUiSettings((prev) => ({ ...prev, canvasMode: !prev.canvasMode }))
                }
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                  uiSettings.canvasMode
                    ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
                title="Instructs the model to output standalone Three.js / HTML Canvas apps"
              >
                <Layers className="w-3 h-3" />
                <span>Canvas: {uiSettings.canvasMode ? 'ON' : 'OFF'}</span>
              </button>

              {/* Universal Thinking Level Selector */}
              <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-0.5 shrink-0 whitespace-nowrap">
                <Brain className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="text-[11px] text-zinc-400">Thinking:</span>
                <select
                  value={activeThinkingMode}
                  onChange={(e) => {
                    const mode = e.target.value as Mode;
                    setThinkingLevels((prev) => ({ ...prev, [activeProvider]: mode }));
                  }}
                  title={
                    activePrimaryModel
                      ? `Top model (${activePrimaryModel}): ${
                          getEffectiveModeInfo(
                            activeProvider,
                            activePrimaryModel,
                            activeThinkingMode,
                            activePrimaryModelCap
                          ).optionLabel
                        }`
                      : 'Select thinking level'
                  }
                  className="bg-transparent text-[11px] font-semibold text-zinc-200 focus:outline-none cursor-pointer py-0.5 max-w-[190px] sm:max-w-[240px]"
                >
                  {THINKING_MODES.map((m) => {
                    const info = getEffectiveModeInfo(
                      activeProvider,
                      activePrimaryModel,
                      m.value,
                      activePrimaryModelCap
                    );
                    return (
                      <option key={m.value} value={m.value} className="bg-zinc-950 text-zinc-100">
                        {info.optionLabel}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Web Search Toggle + Engine Switcher */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setUiSettings((prev) => ({
                      ...prev,
                      tavily: { ...prev.tavily, enabled: !prev.tavily.enabled },
                    }))
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                    uiSettings.tavily.enabled
                      ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400'
                  }`}
                  title={
                    uiSettings.searchEngine === 'exa'
                      ? 'Toggle Exa MCP Web Search (no API key required)'
                      : apiKeys.tavily.trim()
                        ? 'Toggle Tavily Web Search'
                        : 'Toggle Web Search (configure Tavily key in Settings)'
                  }
                >
                  <Globe className="w-3 h-3" />
                  <span>Web Search</span>
                </button>

                <div
                  className="inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 shrink-0 whitespace-nowrap"
                  role="group"
                  aria-label="Search engine"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setUiSettings((prev) => ({ ...prev, searchEngine: 'exa' }))
                    }
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer transition-colors ${
                      uiSettings.searchEngine === 'exa'
                        ? 'bg-cyan-950/80 text-cyan-200 border border-cyan-500/40'
                        : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                    }`}
                    title="Use Exa AI MCP (no API key required)"
                  >
                    Exa MCP
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setUiSettings((prev) => ({ ...prev, searchEngine: 'tavily' }))
                    }
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer transition-colors ${
                      uiSettings.searchEngine === 'tavily'
                        ? 'bg-cyan-950/80 text-cyan-200 border border-cyan-500/40'
                        : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                    }`}
                    title="Use Tavily Search"
                  >
                    Tavily
                  </button>
                </div>
              </div>
            </div>

            {/* Cascades Button */}
            <button
              type="button"
              onClick={() => setIsCascadesOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Layers className="w-3 h-3" style={{ color: uiSettings.accentColor }} />
              <span>Cascades</span>
            </button>
          </div>

          {/* Pending Attachments Preview Strip */}
          {pendingAttachments.length > 0 && (
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-wrap gap-2 items-center max-h-24 overflow-y-auto">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 p-1.5 pl-2 rounded-lg bg-black border border-zinc-800 text-xs text-zinc-200 max-w-full"
                >
                  {att.mimeType.startsWith('image/') && att.dataUrl ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="w-6 h-6 object-cover rounded shrink-0"
                    />
                  ) : (
                    <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                  )}
                  <span className="max-w-[140px] truncate text-[11px] font-medium">
                    {att.name}
                  </span>
                  <span className="text-[10px] text-zinc-500 shrink-0">
                    {Math.max(1, Math.round(att.size / 1024))}KB
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((p) => p.id !== att.id))
                    }
                    className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 cursor-pointer shrink-0"
                    title="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Box */}
          <div
            style={{ backgroundColor: uiSettings.surfaceColor }}
            className="relative flex items-end gap-1.5 sm:gap-2 border border-zinc-800 rounded-2xl p-1.5 sm:p-2 focus-within:border-zinc-600 min-w-0"
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={(e) => {
                if (e.target.files) processFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0 cursor-pointer"
              title="Attach files (up to 25 MB each)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <div className="relative shrink-0">
              <button
                ref={miniPromptTriggerRef}
                type="button"
                onClick={() => setIsMiniPromptOpen((prev) => !prev)}
                className={`p-2 rounded-xl border transition-all shrink-0 cursor-pointer flex items-center justify-center font-mono select-none ${
                  isMiniPromptOpen
                    ? 'bg-cyan-950/70 border-cyan-500/80 text-cyan-300'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-cyan-300'
                }`}
                title="Mini Prompts"
              >
                <span className="text-[12px] leading-none font-bold">※</span>
              </button>

              <MiniPromptDrawer
                isOpen={isMiniPromptOpen}
                onClose={() => setIsMiniPromptOpen(false)}
                onInsertPrompt={handleInsertMiniPrompt}
                triggerRef={miniPromptTriggerRef}
              />
            </div>

            <textarea
              ref={textareaRef}
              value={inputPrompt}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={`Message ${activeMeta.shortLabel}...`}
              rows={1}
              className="flex-1 min-w-0 w-full max-h-40 bg-transparent text-sm px-1.5 sm:px-2 py-1.5 focus:outline-none resize-none leading-relaxed placeholder-zinc-500"
            />

            {isLoading ? (
              <button
                type="button"
                onClick={handleStopStreaming}
                className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/70 text-rose-300 transition-all shrink-0 cursor-pointer flex items-center justify-center"
                title="Stop generation (aborts upstream stream)"
              >
                <Square className="w-4 h-4 fill-rose-300" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!inputPrompt.trim() && pendingAttachments.length === 0}
                style={{
                  backgroundColor:
                    inputPrompt.trim() || pendingAttachments.length > 0
                      ? uiSettings.accentColor
                      : undefined,
                }}
                className="p-2.5 rounded-xl bg-zinc-800 disabled:opacity-30 text-black font-bold transition-all shrink-0 cursor-pointer"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </footer>
        </div>

        {canvasArtifact && (
          <CanvasPanel
            code={canvasArtifact.code}
            language={canvasArtifact.language}
            accentColor={uiSettings.accentColor}
            onClose={() => setCanvasArtifact(null)}
            onChangeCode={(newCode) =>
              setCanvasArtifact((prev) => (prev ? { ...prev, code: newCode } : null))
            }
            onFixError={(errorText, _currentCode) => {
              if (isLoading) return;
              sendMessage(
                `The Canvas preview threw this runtime error:\n\`\`\`\n${errorText}\n\`\`\`\n\nPlease fix the issue and output the complete updated \`\`\`${canvasArtifact.language} code block.`
              );
            }}
          />
        )}
      </div>

      {/* Drawers & Modals */}
      <ChatHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={chatHistory}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onNewChat={handleNewChat}
      />

      <CascadeEditor
        isOpen={isCascadesOpen}
        onClose={() => setIsCascadesOpen(false)}
        activeProvider={activeProvider}
        cascades={cascades}
        onUpdateCascades={setCascades}
        apiKeys={apiKeys}
        customProviders={customProviders}
        capabilitiesCache={capabilitiesCache}
        onSaveProviderCapabilities={(providerId, caps) =>
          setCapabilitiesCache((prev) => {
            const existing = prev[providerId] || {};
            const merged = { ...caps };
            for (const [modelId, prevCap] of Object.entries(existing)) {
              if (
                prevCap?.source === 'learned-runtime' &&
                merged[modelId]?.source !== 'live-api'
              ) {
                merged[modelId] = {
                  ...prevCap,
                  maxOutputTokens: merged[modelId]?.maxOutputTokens ?? prevCap.maxOutputTokens,
                };
              }
            }
            return { ...prev, [providerId]: merged };
          })
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SystemPromptEditor
        isOpen={isSystemPromptOpen}
        onClose={() => setIsSystemPromptOpen(false)}
        systemPrompt={systemPrompt}
        onSave={setSystemPrompt}
      />

      <ConnectionSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKeys={apiKeys}
        onSaveApiKeys={setApiKeys}
        customProviders={customProviders}
        onSaveCustomProviders={setCustomProviders}
        searchEngine={uiSettings.searchEngine}
        onSaveSearchEngine={(nextEngine) =>
          setUiSettings((prev) => ({ ...prev, searchEngine: nextEngine }))
        }
        exa={uiSettings.exa}
        onSaveExa={(nextExa) =>
          setUiSettings((prev) => ({ ...prev, exa: nextExa }))
        }
        exaCallsUsed={searchCallsUsed.exa}
        tavily={uiSettings.tavily}
        onSaveTavily={(nextTavily) =>
          setUiSettings((prev) => ({ ...prev, tavily: nextTavily }))
        }
        tavilyCallsUsed={searchCallsUsed.tavily}
      />

      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={previewImage}
              alt="Attachment preview"
              className="max-w-full max-h-[85vh] object-contain rounded-xl border border-zinc-800 shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-zinc-300 hover:text-white border border-zinc-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
