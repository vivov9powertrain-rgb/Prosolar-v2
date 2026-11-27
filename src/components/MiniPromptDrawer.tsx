import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Trash2, Check } from 'lucide-react';

const STORAGE_KEY = 'solara_mini_prompts';
const MAX_PROMPTS = 10;

const DEFAULT_MINI_PROMPTS = [
  'Explain step-by-step clearly',
  'Summarize the key takeaways',
  'Compare pros, cons, and edge cases',
  'Show a concrete worked example',
];

interface MiniPromptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertPrompt: (snippet: string) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export const MiniPromptDrawer: React.FC<MiniPromptDrawerProps> = ({
  isOpen,
  onClose,
  onInsertPrompt,
  triggerRef,
}) => {
  const [prompts, setPrompts] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(0, MAX_PROMPTS);
      }
    } catch (_) {}
    return DEFAULT_MINI_PROMPTS;
  });

  const [isAdding, setIsAdding] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [newPromptText, setNewPromptText] = useState('');
  const [justAddedIdx, setJustAddedIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    } catch (_) {}
  }, [prompts]);

  // Handle outside clicks to close drawer
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
        setIsAdding(false);
        setIsDeleteMode(false);
        setSelectedIndices(new Set());
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  // Focus input when add mode activated
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  if (!isOpen) return null;

  const handleAddPrompt = () => {
    const text = newPromptText.trim();
    if (!text) return;
    if (prompts.length >= MAX_PROMPTS) return;

    const updated = [...prompts, text];
    setPrompts(updated);
    setNewPromptText('');
    setIsAdding(false);
  };

  const handleToggleSelectItem = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIndices.size === prompts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(prompts.map((_, i) => i)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIndices.size === 0) return;
    const updated = prompts.filter((_, i) => !selectedIndices.has(i));
    setPrompts(updated);
    setSelectedIndices(new Set());
    if (updated.length === 0) {
      setIsDeleteMode(false);
    }
  };

  const handleSelectPrompt = (snippet: string, index: number) => {
    setJustAddedIdx(index);
    onInsertPrompt(snippet);
    setTimeout(() => {
      setJustAddedIdx(null);
    }, 700);
  };

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full -left-10 sm:left-0 mb-2 z-40 w-72 sm:w-84 max-w-[calc(100vw-1.5rem)] bg-[#0c0c0e]/95 backdrop-blur-md border border-zinc-800 rounded-2xl shadow-2xl p-3 text-zinc-100 animate-in fade-in zoom-in-95 duration-150 origin-bottom-left"
    >
      {/* Minimal Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-md bg-zinc-900 border border-zinc-700/80 flex items-center justify-center font-mono text-[11px] text-cyan-400">
            ※
          </span>
          <span className="text-xs font-semibold text-zinc-200 tracking-tight">Mini Prompts</span>
          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800">
            {prompts.length}/{MAX_PROMPTS}
          </span>
        </div>

        {/* Action buttons: Add [+] and Delete [🗑] side by side */}
        <div className="flex items-center gap-1">
          {prompts.length < MAX_PROMPTS && (
            <button
              type="button"
              onClick={() => {
                setIsAdding(!isAdding);
                if (isDeleteMode) {
                  setIsDeleteMode(false);
                  setSelectedIndices(new Set());
                }
              }}
              className={`p-1 rounded-lg text-xs transition-colors cursor-pointer ${
                isAdding
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
              title={isAdding ? 'Cancel adding' : 'Add new mini prompt'}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          {prompts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsDeleteMode(!isDeleteMode);
                setSelectedIndices(new Set());
                if (isAdding) setIsAdding(false);
              }}
              className={`p-1 rounded-lg text-xs transition-colors cursor-pointer ${
                isDeleteMode
                  ? 'bg-rose-950/90 text-rose-300 border border-rose-800/70 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                  : 'text-zinc-400 hover:text-rose-400 hover:bg-zinc-800'
              }`}
              title={isDeleteMode ? 'Exit delete mode' : 'Select prompts to delete'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setIsDeleteMode(false);
              setSelectedIndices(new Set());
              onClose();
            }}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Delete Selection Control Bar (Active when trash button beside + is clicked) */}
      {isDeleteMode && prompts.length > 0 && (
        <div className="mb-2 p-2 rounded-xl bg-rose-950/30 border border-rose-900/60 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-[11px] font-medium text-rose-200">
              {selectedIndices.size === 0
                ? 'Select prompts to delete'
                : `${selectedIndices.size} selected`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {selectedIndices.size === prompts.length ? 'Deselect all' : 'Select all'}
            </button>

            {selectedIndices.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[10px] transition-colors cursor-pointer shadow-sm"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Delete ({selectedIndices.size})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsDeleteMode(false);
                setSelectedIndices(new Set());
              }}
              className="px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Add New Prompt Input Form (Only expands when + clicked) */}
      {isAdding && (
        <div className="mb-2.5 p-2 rounded-xl bg-zinc-900/90 border border-zinc-700/80 space-y-2 animate-in fade-in duration-100">
          <input
            ref={inputRef}
            type="text"
            placeholder="Type prompt snippet..."
            value={newPromptText}
            maxLength={100}
            onChange={(e) => setNewPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddPrompt();
              } else if (e.key === 'Escape') {
                setIsAdding(false);
              }
            }}
            className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>{newPromptText.length}/100</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewPromptText('');
                }}
                className="px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddPrompt}
                disabled={!newPromptText.trim()}
                className="px-2.5 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-black font-semibold transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Adjustable List of Prompts */}
      {prompts.length === 0 ? (
        <div className="py-4 text-center text-xs text-zinc-500 space-y-1">
          <p>No mini prompts saved yet.</p>
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setIsDeleteMode(false);
            }}
            className="text-[11px] text-cyan-400 hover:underline cursor-pointer font-medium"
          >
            + Add your first prompt
          </button>
        </div>
      ) : (
        <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5 scrollbar-thin">
          {prompts.map((snippet, idx) => {
            const isJustAdded = justAddedIdx === idx;
            const isSelected = selectedIndices.has(idx);

            if (isDeleteMode) {
              return (
                <div
                  key={idx}
                  onClick={() => handleToggleSelectItem(idx)}
                  className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer border select-none ${
                    isSelected
                      ? 'bg-rose-950/50 border-rose-600/70 text-rose-200 shadow-sm'
                      : 'bg-zinc-900/60 hover:bg-rose-950/20 border-zinc-800/60 hover:border-rose-900/40 text-zinc-300 hover:text-rose-100'
                  }`}
                  title={isSelected ? 'Click to deselect' : 'Click to select for deletion'}
                >
                  <div className="flex items-center gap-2 truncate flex-1">
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-rose-600 border-rose-500 text-white'
                          : 'border-zinc-700 bg-zinc-950'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <span className="truncate text-[11px] leading-tight">
                      {snippet}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-rose-400/80 shrink-0">
                    {isSelected ? 'selected' : ''}
                  </span>
                </div>
              );
            }

            // Normal Mode: Clean prompt item with NO delete button nearby to prevent accidental clicks
            return (
              <div
                key={idx}
                onClick={() => handleSelectPrompt(snippet, idx)}
                className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer border select-none ${
                  isJustAdded
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                    : 'bg-zinc-900/60 hover:bg-zinc-800/80 border-zinc-800/60 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100'
                }`}
                title="Click to insert into query"
              >
                <div className="flex items-center gap-2 truncate flex-1">
                  <span className="text-[10px] text-zinc-600 group-hover:text-cyan-400 transition-colors">
                    {isJustAdded ? '✓' : '•'}
                  </span>
                  <span className="truncate text-[11px] leading-tight">
                    {snippet}
                  </span>
                </div>

                {isJustAdded && (
                  <span className="text-[9px] text-cyan-400 font-mono font-semibold animate-in fade-in shrink-0">
                    Added
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer subtle tip */}
      <div className="mt-2 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
        <span>
          {isDeleteMode ? 'Select items to delete' : 'Click prompt to append to query'}
        </span>
        <span>Local & Persistent</span>
      </div>
    </div>
  );
};
