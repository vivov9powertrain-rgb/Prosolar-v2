import React, { useState, useEffect } from 'react';
import { X, Terminal, Trash2, Check } from 'lucide-react';

interface SystemPromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  onSave: (prompt: string) => void;
}

export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
  isOpen,
  onClose,
  systemPrompt,
  onSave,
}) => {
  const [draft, setDraft] = useState(systemPrompt);

  useEffect(() => {
    if (isOpen) {
      setDraft(systemPrompt);
    }
  }, [isOpen, systemPrompt]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#09090b] border border-zinc-800 rounded-2xl w-full max-w-2xl p-5 space-y-4 shadow-2xl text-zinc-100 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-zinc-100">System Prompt</h3>
              <p className="text-[11px] text-zinc-500">
                Editable per-user system instruction saved in localStorage and sent with each request
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

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          placeholder="Optional system prompt (leave empty for no system prompt)..."
          className="w-full flex-1 min-h-[200px] p-3.5 rounded-xl bg-black border border-zinc-800 text-xs sm:text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60 resize-y leading-relaxed"
        />

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-zinc-500">
              {draft.length} chars
            </span>
            {draft && (
              <button
                type="button"
                onClick={() => setDraft('')}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
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
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-black flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Prompt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
