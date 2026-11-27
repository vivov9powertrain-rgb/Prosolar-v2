import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  Download,
  Upload,
  RefreshCw,
  Layers,
  Search,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Reorder } from 'motion/react';
import {
  PROVIDERS,
  type ApiKeysStore,
  type CascadeConfig,
  type CustomProviderSlot,
  type ModelCapability,
  type ProviderCapabilitiesMap,
  type ProviderId,
} from '../types';
import {
  compareModelIds,
  resolveProviderMeta,
  testConnection,
} from '../lib/providers';
import { describeThinkingSupport } from '../lib/reasoning';

interface CatalogCacheEntry {
  listed: boolean;
  ids: string[];
  publicCatalog?: boolean;
  capabilities?: Record<string, ModelCapability>;
  error?: string;
  fetchedAt: number;
}

interface CascadeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider: ProviderId;
  cascades: CascadeConfig;
  onUpdateCascades: (next: CascadeConfig) => void;
  apiKeys: ApiKeysStore;
  customProviders: Record<'custom1' | 'custom2', CustomProviderSlot>;
  capabilitiesCache: ProviderCapabilitiesMap;
  onSaveProviderCapabilities: (
    providerId: ProviderId,
    caps: Record<string, ModelCapability>
  ) => void;
  onOpenSettings: () => void;
}

export const CascadeEditor: React.FC<CascadeEditorProps> = ({
  isOpen,
  onClose,
  activeProvider,
  cascades,
  onUpdateCascades,
  apiKeys,
  customProviders,
  capabilitiesCache,
  onSaveProviderCapabilities,
  onOpenSettings,
}) => {
  const [selectedTab, setSelectedTab] = useState<ProviderId>(activeProvider);
  const [manualInput, setManualInput] = useState('');
  const [addPosition, setAddPosition] = useState<'top' | 'end'>('end');
  const [catalogFilter, setCatalogFilter] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [catalogCache, setCatalogCache] = useState<Partial<Record<ProviderId, CatalogCacheEntry>>>({});
  const [fetchingProvider, setFetchingProvider] = useState<ProviderId | null>(null);
  const [isCatalogExpanded, setIsCatalogExpanded] = useState(true);
  const providerImportInputRef = useRef<HTMLInputElement>(null);
  const importAllInputRef = useRef<HTMLInputElement>(null);

  // Sync tab when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedTab(activeProvider);
      setNotice(null);
      setCatalogFilter('');
      setIsCatalogExpanded(true);
    }
  }, [isOpen, activeProvider]);

  const meta = resolveProviderMeta(selectedTab, customProviders);
  const currentCascade = cascades[selectedTab] || [];
  const currentCatalog = catalogCache[selectedTab];
  const currentCapabilities = capabilitiesCache[selectedTab] || currentCatalog?.capabilities || {};
  const providerKey = apiKeys[selectedTab] || (selectedTab === 'custom1' ? customProviders.custom1.apiKey : selectedTab === 'custom2' ? customProviders.custom2.apiKey : '');

  const filteredCatalogIds = useMemo(() => {
    const ids = currentCatalog?.ids || [];
    const q = catalogFilter.trim().toLowerCase();
    const sorted = [...ids].sort(compareModelIds);
    return q ? sorted.filter((id) => id.toLowerCase().includes(q)) : sorted;
  }, [currentCatalog, catalogFilter]);

  if (!isOpen) return null;

  const handleFetchModels = async (targetId: ProviderId = selectedTab) => {
    const targetMeta = resolveProviderMeta(targetId, customProviders);
    const key =
      apiKeys[targetId] ||
      (targetId === 'custom1'
        ? customProviders.custom1.apiKey
        : targetId === 'custom2'
          ? customProviders.custom2.apiKey
          : '');

    if (targetMeta.isCustom && !targetMeta.baseUrl) {
      setCatalogCache((prev) => ({
        ...prev,
        [targetId]: {
          listed: false,
          ids: [],
          error: 'Configure this custom provider Base URL in Connection Settings first.',
          fetchedAt: Date.now(),
        },
      }));
      return;
    }

    setFetchingProvider(targetId);
    setNotice(null);
    try {
      const res = await testConnection(targetId, targetMeta.baseUrl, key);
      setIsCatalogExpanded(true);
      onSaveProviderCapabilities(targetId, res.capabilities || {});
      setCatalogCache((prev) => ({
        ...prev,
        [targetId]: {
          listed: res.listed,
          ids: res.ids,
          publicCatalog: res.publicCatalog,
          capabilities: res.capabilities,
          fetchedAt: Date.now(),
        },
      }));
    } catch (err: any) {
      setCatalogCache((prev) => ({
        ...prev,
        [targetId]: {
          listed: false,
          ids: [],
          error: err?.message || 'Could not fetch models.',
          fetchedAt: Date.now(),
        },
      }));
    } finally {
      setFetchingProvider(null);
    }
  };

  const addModelId = (rawId: string) => {
    const trimmed =
      selectedTab === 'gemini'
        ? rawId.trim().replace(/^models\//i, '')
        : rawId.trim();
    if (!trimmed) return;
    if (currentCascade.includes(trimmed)) {
      setNotice(`"${trimmed}" is already in ${meta.shortLabel}'s cascade.`);
      return;
    }
    const nextList =
      addPosition === 'top' ? [trimmed, ...currentCascade] : [...currentCascade, trimmed];
    onUpdateCascades({
      ...cascades,
      [selectedTab]: nextList,
    });
    setManualInput('');
    setNotice(`Added "${trimmed}" to ${meta.shortLabel} (${addPosition}).`);
  };

  const removeModelId = (modelId: string) => {
    onUpdateCascades({
      ...cascades,
      [selectedTab]: currentCascade.filter((m) => m !== modelId),
    });
    setNotice(`Removed "${modelId}" from ${meta.shortLabel}.`);
  };

  const clearProviderCascade = () => {
    onUpdateCascades({
      ...cascades,
      [selectedTab]: [],
    });
    setNotice(`Cleared ${meta.shortLabel} cascade.`);
  };

  const handleReorder = (nextOrder: string[]) => {
    onUpdateCascades({
      ...cascades,
      [selectedTab]: nextOrder,
    });
  };

  const cleanModelList = (rawList: unknown[], targetId: ProviderId): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of rawList) {
      if (typeof item !== 'string') continue;
      const cleaned =
        targetId === 'gemini' ? item.trim().replace(/^models\//i, '') : item.trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      out.push(cleaned);
    }
    return out;
  };

  const triggerJsonDownload = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportProvider = () => {
    try {
      const slug = meta.shortLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const payload = {
        version: 3,
        scope: 'provider',
        providerId: selectedTab,
        providerLabel: meta.label,
        ...(meta.baseUrl ? { baseUrl: meta.baseUrl } : {}),
        models: currentCascade,
        exportedAt: new Date().toISOString(),
      };
      const dateStr = new Date().toISOString().slice(0, 10);
      const namePart = slug && slug !== selectedTab ? `${selectedTab}-${slug}` : selectedTab;
      triggerJsonDownload(payload, `solara-${namePart}-cascade-${dateStr}.json`);
      setNotice(`Exported ${currentCascade.length} model(s) from ${meta.shortLabel}.`);
    } catch {
      setNotice(`Failed to export ${meta.shortLabel} cascade.`);
    }
  };

  const handleExportAll = () => {
    try {
      const payload = {
        version: 2,
        cascades,
        exportedAt: new Date().toISOString(),
      };
      triggerJsonDownload(payload, `solara-cascades-${new Date().toISOString().slice(0, 10)}.json`);
      setNotice('Exported all provider cascades as JSON.');
    } catch {
      setNotice('Failed to export all cascades.');
    }
  };

  const handleImportProvider = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      let rawModels: unknown[] | null = null;

      if (Array.isArray(parsed)) {
        // Bare string[] array of model IDs
        rawModels = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.models)) {
          // Version 3 single-provider export ({ version: 3, providerId, models: [...] })
          rawModels = parsed.models;
        } else {
          const source =
            parsed.cascades && typeof parsed.cascades === 'object' ? parsed.cascades : parsed;
          if (source && typeof source === 'object' && !Array.isArray(source)) {
            const tabArr = Array.isArray(source[selectedTab]) ? source[selectedTab] : null;
            const nonEmptyTabs = PROVIDERS.filter(
              (p) => Array.isArray(source[p.id]) && source[p.id].length > 0
            );

            if (tabArr && tabArr.length > 0) {
              rawModels = tabArr;
            } else if (nonEmptyTabs.length === 1) {
              // e.g. importing a single-populated-provider v2 backup into custom1 or custom2
              rawModels = source[nonEmptyTabs[0].id];
            } else if (tabArr) {
              rawModels = tabArr;
            } else if (nonEmptyTabs.length > 1) {
              setNotice(
                `This file has cascades for ${nonEmptyTabs.length} providers. Select a matching tab or use "Import All".`
              );
              return;
            }
          }
        }
      }

      if (!rawModels) {
        setNotice(`Invalid JSON: expected a model array or ${meta.shortLabel} cascade export.`);
        return;
      }

      const cleaned = cleanModelList(rawModels, selectedTab);
      onUpdateCascades({
        ...cascades,
        [selectedTab]: cleaned,
      });
      setNotice(`Loaded ${cleaned.length} model(s) into ${meta.shortLabel}.`);
    } catch {
      setNotice('Invalid JSON file.');
    }
  };

  const handleImportAll = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Array.isArray(parsed.models) &&
        typeof parsed.providerId === 'string' &&
        PROVIDERS.some((p) => p.id === parsed.providerId)
      ) {
        const targetId = parsed.providerId as ProviderId;
        const cleaned = cleanModelList(parsed.models, targetId);
        onUpdateCascades({
          ...cascades,
          [targetId]: cleaned,
        });
        setNotice(`Imported ${cleaned.length} model(s) into ${targetId}.`);
        return;
      }

      const source = parsed?.cascades && typeof parsed.cascades === 'object' ? parsed.cascades : parsed;
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        setNotice('Invalid JSON: expected a cascades object.');
        return;
      }
      const next: CascadeConfig = { ...cascades };
      let importedCount = 0;
      for (const p of PROVIDERS) {
        if (Array.isArray(source[p.id])) {
          next[p.id] = cleanModelList(source[p.id], p.id);
          importedCount++;
        }
      }
      if (importedCount === 0) {
        setNotice('No matching provider cascade arrays found in JSON.');
        return;
      }
      onUpdateCascades(next);
      setNotice(`Imported cascades for ${importedCount} provider(s).`);
    } catch {
      setNotice('Invalid JSON file.');
    }
  };

  const catalogStatusText = (() => {
    if (fetchingProvider === selectedTab) return 'Fetching model catalog...';
    if (!currentCatalog) {
      return meta.isCustom && !meta.baseUrl
        ? 'Custom endpoint URL not configured yet.'
        : 'Click Refresh Models to fetch live catalog, or enter any model ID manually below.';
    }
    if (currentCatalog.error) return currentCatalog.error;
    if (currentCatalog.ids.length > 0) {
      return `${currentCatalog.ids.length} ${currentCatalog.ids.length === 1 ? 'model' : 'models'} listed${currentCatalog.publicCatalog ? ' · public catalog' : ''}.`;
    }
    return currentCatalog.listed
      ? 'The provider returned an empty model list. You can still enter a model ID.'
      : 'This endpoint does not expose a model list. Enter a model ID.';
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#09090b] border border-zinc-800 rounded-2xl w-full max-w-3xl p-4 sm:p-5 space-y-3 sm:space-y-4 shadow-2xl text-zinc-100 max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="font-bold text-zinc-100 text-sm sm:text-base">
                Provider Model Cascades
              </h3>
              <p className="text-[11px] text-zinc-500">
                One ordered cascade per provider. Drag cards to reorder fallback priority.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap shrink-0">
          {PROVIDERS.map((p) => {
            const pMeta = resolveProviderMeta(p.id, customProviders);
            const count = (cascades[p.id] || []).length;
            const active = selectedTab === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedTab(p.id);
                  setCatalogFilter('');
                  setNotice(null);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  active
                    ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{pMeta.shortLabel}</span>
                <span className="text-[10px] font-mono px-1.5 rounded bg-black/50 text-zinc-300">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Middle Body: Catalog Discovery + Manual Entry + Chosen Cascade List */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5 scrollbar-thin">
          {/* Catalog Discovery + Manual Entry Box */}
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-zinc-200">{meta.label}</span>
                  {meta.baseUrl ? (
                    <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[220px] sm:max-w-[260px]">
                      {meta.baseUrl}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSettings();
                      }}
                      className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                    >
                      Configure URL & key in Settings →
                    </button>
                  )}
                </div>
                <p
                  className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                    currentCatalog?.error ? 'text-rose-400' : 'text-zinc-400'
                  }`}
                >
                  {currentCatalog?.error && <AlertCircle className="w-3 h-3 shrink-0" />}
                  <span>{catalogStatusText}</span>
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {currentCatalog && currentCatalog.ids.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsCatalogExpanded((v) => !v)}
                    className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                  >
                    {isCatalogExpanded ? 'Hide catalog' : `Show catalog (${currentCatalog.ids.length})`}
                  </button>
                )}
                <button
                  type="button"
                  disabled={fetchingProvider === selectedTab || (meta.isCustom && !meta.baseUrl)}
                  onClick={() => handleFetchModels(selectedTab)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-700 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-cyan-400 ${fetchingProvider === selectedTab ? 'animate-spin' : ''}`}
                  />
                  <span>{fetchingProvider === selectedTab ? 'Fetching...' : 'Refresh Models'}</span>
                </button>
              </div>
            </div>

            {/* Fetched Catalog Picker (when listed models exist) */}
            {currentCatalog && currentCatalog.ids.length > 0 && isCatalogExpanded && (
              <div className="p-2.5 rounded-xl bg-black/70 border border-zinc-800/80 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={catalogFilter}
                      onChange={(e) => setCatalogFilter(e.target.value)}
                      placeholder={`Filter ${currentCatalog.ids.length} listed models...`}
                      className="w-full pl-8 pr-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60"
                    />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                    {filteredCatalogIds.length} shown
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1.5 pr-1 scrollbar-thin">
                  {filteredCatalogIds.slice(0, 120).map((id) => {
                    const inCascade = currentCascade.includes(id);
                    const capHint = describeThinkingSupport(selectedTab, id, currentCapabilities[id]);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => (inCascade ? removeModelId(id) : addModelId(id))}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono border transition-colors cursor-pointer flex items-center gap-1 max-w-full ${
                          inCascade
                            ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-200'
                            : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                        }`}
                        title={`${inCascade ? 'Click to remove from cascade' : 'Click to add to cascade'} · Thinking: ${capHint}`}
                      >
                        {inCascade ? (
                          <Check className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                        ) : (
                          <Plus className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                        )}
                        <span className="truncate">{id}</span>
                      </button>
                    );
                  })}
                  {filteredCatalogIds.length > 120 && (
                    <span className="text-[10px] text-zinc-500 px-1 py-0.5">
                      +{filteredCatalogIds.length - 120} more (type to filter)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Manual Model Slug Entry (always available) */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualInput.trim()) {
                    e.preventDefault();
                    addModelId(manualInput);
                  }
                }}
                placeholder="Enter a model ID manually (e.g. exact provider slug)..."
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={addPosition}
                  onChange={(e) => setAddPosition(e.target.value as 'top' | 'end')}
                  className="px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 focus:outline-none"
                  title="Insert position"
                >
                  <option value="top">Top</option>
                  <option value="end">End</option>
                </select>
                <button
                  type="button"
                  disabled={!manualInput.trim()}
                  onClick={() => addModelId(manualInput)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold text-black transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {!providerKey && selectedTab !== 'openrouter' && selectedTab !== 'nvidia' && (
              <p className="text-[11px] text-amber-400/90">
                Note: No API key saved for {meta.shortLabel} in localStorage yet. Add one in Settings before sending chat requests.
              </p>
            )}
            {notice && <p className="text-[11px] text-cyan-300">{notice}</p>}
          </div>

          {/* Drag-Reorderable Chosen Cascade Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Chosen Cascade ({currentCascade.length})
              </span>
              {currentCascade.length > 1 && (
                <span className="text-[10px] text-zinc-500">Drag handle to reorder</span>
              )}
            </div>

            {currentCascade.length === 0 ? (
              <div className="p-5 rounded-xl bg-zinc-950 border border-dashed border-zinc-800 text-center space-y-1.5">
                <p className="text-xs font-semibold text-zinc-300">
                  {meta.shortLabel} cascade is empty
                </p>
                <p className="text-[11px] text-zinc-500">
                  Add one or more model IDs above (either from Refresh Models or manual slug entry). Models are called in exact list order.
                </p>
              </div>
            ) : (
              <Reorder.Group
                axis="y"
                values={currentCascade}
                onReorder={handleReorder}
                layoutScroll
                className="flex flex-col gap-1.5"
              >
                {currentCascade.map((modelId, idx) => {
                  const cap = currentCapabilities[modelId];
                  const supportLabel = describeThinkingSupport(selectedTab, modelId, cap);
                  const isLive = cap?.source === 'live-api';
                  const isLearned = cap?.source === 'learned-runtime';
                  return (
                    <Reorder.Item
                      key={modelId}
                      value={modelId}
                      whileDrag={{
                        scale: 1.015,
                        zIndex: 20,
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
                      }}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 transition-colors cursor-grab active:cursor-grabbing select-none"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <GripVertical className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        <span className="text-[10px] font-mono text-zinc-500 w-5 text-right shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <span className="font-mono text-xs text-zinc-100 truncate">{modelId}</span>
                          <span
                            className={`inline-block w-fit max-w-full truncate px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${
                              isLearned
                                ? 'bg-emerald-950/40 border-emerald-500/35 text-emerald-300'
                                : isLive
                                  ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-300'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                            }`}
                            title={supportLabel}
                          >
                            {supportLabel}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => removeModelId(modelId)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
                        title={`Remove ${modelId}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {currentCascade.length > 0 && (
              <button
                type="button"
                onClick={clearProviderCascade}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-rose-500/40 text-[11px] sm:text-xs font-medium text-rose-300 transition-colors cursor-pointer"
              >
                Clear {meta.shortLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleExportProvider}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] sm:text-xs font-medium text-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5"
              title={`Export only ${meta.shortLabel}'s cascade as JSON`}
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export {meta.shortLabel}</span>
            </button>
            <input
              ref={providerImportInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportProvider}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => providerImportInputRef.current?.click()}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] sm:text-xs font-medium text-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5"
              title={`Load a saved provider cascade JSON directly into ${meta.shortLabel} without affecting other providers`}
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Import → {meta.shortLabel}</span>
            </button>
            <input
              ref={importAllInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportAll}
              className="hidden"
            />
            <div className="flex items-center gap-1 pl-1 border-l border-zinc-800/80">
              <button
                type="button"
                onClick={handleExportAll}
                className="px-2 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] sm:text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                title="Export full backup of all 7 provider cascades"
              >
                Export All
              </button>
              <button
                type="button"
                onClick={() => importAllInputRef.current?.click()}
                className="px-2 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] sm:text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                title="Restore full multi-provider cascades backup JSON"
              >
                Import All
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 sm:px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-100 transition-colors cursor-pointer shrink-0 ml-auto"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
