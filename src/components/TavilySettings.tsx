import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Globe,
  Server,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  PROVIDERS,
  type ApiKeysStore,
  type CustomProviderSlot,
  type TavilyConfig,
  type TavilyDepth,
  type TavilyStrategy,
} from '../types';
import { validateCustomBaseUrl, validateCustomName } from '../lib/providers';

interface ConnectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: ApiKeysStore;
  onSaveApiKeys: (next: ApiKeysStore) => void;
  customProviders: Record<'custom1' | 'custom2', CustomProviderSlot>;
  onSaveCustomProviders: (next: Record<'custom1' | 'custom2', CustomProviderSlot>) => void;
  tavily: TavilyConfig;
  onSaveTavily: (next: TavilyConfig) => void;
  tavilyCallsUsed: number;
}

export const ConnectionSettingsModal: React.FC<ConnectionSettingsModalProps> = ({
  isOpen,
  onClose,
  apiKeys,
  onSaveApiKeys,
  customProviders,
  onSaveCustomProviders,
  tavily,
  onSaveTavily,
  tavilyCallsUsed,
}) => {
  const [tab, setTab] = useState<'keys' | 'custom' | 'tavily'>('keys');
  const [keysDraft, setKeysDraft] = useState<ApiKeysStore>(apiKeys);
  const [customDraft, setCustomDraft] = useState<Record<'custom1' | 'custom2', CustomProviderSlot>>(customProviders);
  const [tavilyDraft, setTavilyDraft] = useState<TavilyConfig>(tavily);
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setKeysDraft(apiKeys);
      setCustomDraft(customProviders);
      setTavilyDraft(tavily);
      setErrorMsg(null);
      setSavedNotice(false);
    }
  }, [isOpen, apiKeys, customProviders, tavily]);

  if (!isOpen) return null;

  const toggleReveal = (id: string) => {
    setShowKeyMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveAll = () => {
    setErrorMsg(null);
    try {
      const nextCustom: Record<'custom1' | 'custom2', CustomProviderSlot> = {
        custom1: { ...customDraft.custom1 },
        custom2: { ...customDraft.custom2 },
      };

      for (const slotId of ['custom1', 'custom2'] as const) {
        const slot = nextCustom[slotId];
        const otherId = slotId === 'custom1' ? 'custom2' : 'custom1';
        const trimmedUrl = slot.baseUrl.trim();
        if (trimmedUrl) {
          slot.baseUrl = validateCustomBaseUrl(trimmedUrl);
          slot.name = validateCustomName(slot.name || (slotId === 'custom1' ? 'Custom #1' : 'Custom #2'), nextCustom[otherId].name);
        } else {
          slot.baseUrl = '';
          slot.name = slot.name.trim() || (slotId === 'custom1' ? 'Custom #1' : 'Custom #2');
        }
        slot.apiKey = slot.apiKey.trim();
      }

      const nextKeys: ApiKeysStore = {
        gemini: keysDraft.gemini.trim(),
        groq: keysDraft.groq.trim(),
        openrouter: keysDraft.openrouter.trim(),
        nvidia: keysDraft.nvidia.trim(),
        zai: keysDraft.zai.trim(),
        custom1: nextCustom.custom1.apiKey,
        custom2: nextCustom.custom2.apiKey,
        tavily: keysDraft.tavily.trim(),
      };

      const nextTavily: TavilyConfig = {
        ...tavilyDraft,
        results: Math.max(1, Math.min(10, Math.round(Number(tavilyDraft.results) || 4))),
        maxCallsPerChat: Math.max(1, Math.min(25, Math.round(Number(tavilyDraft.maxCallsPerChat) || 5))),
        instructions: tavilyDraft.instructions.slice(0, 600),
        allowSites: tavilyDraft.allowSites.slice(0, 1200),
        blockSites: tavilyDraft.blockSites.slice(0, 1200),
      };

      onSaveCustomProviders(nextCustom);
      onSaveApiKeys(nextKeys);
      onSaveTavily(nextTavily);
      setSavedNotice(true);
      setTimeout(() => {
        setSavedNotice(false);
        onClose();
      }, 350);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Invalid configuration.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#09090b] border border-zinc-800 rounded-2xl w-full max-w-2xl p-4 sm:p-5 space-y-4 shadow-2xl text-zinc-100 max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-zinc-100">
              Connections, Custom Endpoints & Search
            </h3>
            <p className="text-[11px] text-zinc-500">
              All API keys and settings are stored strictly in browser localStorage. Server stays stateless.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setTab('keys')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
              tab === 'keys'
                ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Key className="w-3.5 h-3.5 shrink-0" />
            <span>Built-in API Keys (5)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
              tab === 'custom'
                ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5 shrink-0" />
            <span>Custom Endpoints (2)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('tavily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
              tab === 'tavily'
                ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>Tavily Web Search</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
          {tab === 'keys' && (
            <div className="space-y-3">
              {PROVIDERS.filter((p) => !p.isCustom).map((p) => {
                const keyVal = keysDraft[p.id];
                const revealed = !!showKeyMap[p.id];
                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-zinc-200">{p.label}</label>
                      <span className="text-[10px] font-mono text-zinc-500 truncate">{p.baseUrl}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type={revealed ? 'text' : 'password'}
                        value={keyVal}
                        onChange={(e) =>
                          setKeysDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        placeholder={`Enter ${p.shortLabel} API key...`}
                        autoComplete="off"
                        className="flex-1 px-3 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60"
                      />
                      <button
                        type="button"
                        onClick={() => toggleReveal(p.id)}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        title={revealed ? 'Hide key' : 'Show key'}
                      >
                        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'custom' && (
            <div className="space-y-3">
              <p className="text-[11px] text-zinc-400">
                Configure up to 2 custom OpenAI-compatible HTTPS endpoints (e.g. Arena API <code className="text-zinc-300">https://api.arena.ai/v1</code>). <code className="text-zinc-300">max_tokens</code> is always sent explicitly.
              </p>
              {(['custom1', 'custom2'] as const).map((slotId, index) => {
                const slot = customDraft[slotId];
                const revealed = !!showKeyMap[slotId];
                return (
                  <div
                    key={slotId}
                    className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200">
                        Custom Slot #{index + 1}
                      </span>
                      {slot.baseUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setCustomDraft((prev) => ({
                              ...prev,
                              [slotId]: {
                                id: slotId,
                                name: `Custom #${index + 1}`,
                                baseUrl: '',
                                apiKey: '',
                              },
                            }))
                          }
                          className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                        >
                          Clear slot
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                          Provider Name (1–64 chars)
                        </label>
                        <input
                          type="text"
                          maxLength={64}
                          value={slot.name}
                          onChange={(e) =>
                            setCustomDraft((prev) => ({
                              ...prev,
                              [slotId]: { ...prev[slotId], name: e.target.value },
                            }))
                          }
                          placeholder={index === 0 ? 'e.g. Arena API' : 'e.g. Custom Provider'}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                          HTTPS Base URL
                        </label>
                        <input
                          type="url"
                          value={slot.baseUrl}
                          onChange={(e) =>
                            setCustomDraft((prev) => ({
                              ...prev,
                              [slotId]: { ...prev[slotId], baseUrl: e.target.value },
                            }))
                          }
                          placeholder="https://api.arena.ai/v1"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                        API Key (Bearer)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type={revealed ? 'text' : 'password'}
                          value={slot.apiKey}
                          onChange={(e) =>
                            setCustomDraft((prev) => ({
                              ...prev,
                              [slotId]: { ...prev[slotId], apiKey: e.target.value },
                            }))
                          }
                          placeholder="Enter API key..."
                          autoComplete="off"
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60"
                        />
                        <button
                          type="button"
                          onClick={() => toggleReveal(slotId)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        >
                          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'tavily' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-200">
                    Tavily API Key (localStorage only)
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Chat calls used: {tavilyCallsUsed} / {tavilyDraft.maxCallsPerChat}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type={showKeyMap.tavily ? 'text' : 'password'}
                    value={keysDraft.tavily}
                    onChange={(e) =>
                      setKeysDraft((prev) => ({ ...prev, tavily: e.target.value }))
                    }
                    placeholder="tvly-..."
                    autoComplete="off"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => toggleReveal('tavily')}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {showKeyMap.tavily ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Search Behavior
                  </label>
                  <select
                    value={tavilyDraft.strategy}
                    onChange={(e) =>
                      setTavilyDraft((prev) => ({
                        ...prev,
                        strategy: e.target.value as TavilyStrategy,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="always">Always search</option>
                    <option value="model">Let the model decide</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Search Depth
                  </label>
                  <select
                    value={tavilyDraft.depth}
                    onChange={(e) =>
                      setTavilyDraft((prev) => ({
                        ...prev,
                        depth: e.target.value as TavilyDepth,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="basic">basic</option>
                    <option value="advanced">advanced</option>
                    <option value="fast">fast</option>
                    <option value="ultra-fast">ultra-fast</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Results per Call (1–10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={tavilyDraft.results}
                    onChange={(e) =>
                      setTavilyDraft((prev) => ({
                        ...prev,
                        results: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Calls per Conversation Cap
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={tavilyDraft.maxCallsPerChat}
                    onChange={(e) =>
                      setTavilyDraft((prev) => ({
                        ...prev,
                        maxCallsPerChat: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Search Instructions
                  </label>
                  <textarea
                    rows={2}
                    maxLength={600}
                    value={tavilyDraft.instructions}
                    onChange={(e) =>
                      setTavilyDraft((prev) => ({ ...prev, instructions: e.target.value }))
                    }
                    placeholder="Optional guidance for search query planning & grounding..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                      Trusted Domains (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={tavilyDraft.allowSites}
                      onChange={(e) =>
                        setTavilyDraft((prev) => ({ ...prev, allowSites: e.target.value }))
                      }
                      placeholder="e.g. docs.python.org, arxiv.org"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                      Blocked Domains (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={tavilyDraft.blockSites}
                      onChange={(e) =>
                        setTavilyDraft((prev) => ({ ...prev, blockSites: e.target.value }))
                      }
                      placeholder="e.g. pinterest.com"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-zinc-500">
            Persisted in browser localStorage
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-black flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savedNotice ? 'Saved!' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
