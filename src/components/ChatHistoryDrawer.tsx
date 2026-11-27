import React from 'react';
import { X, Plus, Trash2, MessageSquare, Clock } from 'lucide-react';
import type { ChatSession } from '../types';

interface ChatHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onNewChat: () => void;
}

export const ChatHistoryDrawer: React.FC<ChatHistoryDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  activeChatId,
  onSelectChat,
  onDeleteChat,
  onNewChat,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-start bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-80 max-w-[85vw] h-full bg-[#09090b] border-r border-zinc-800 flex flex-col shadow-2xl text-zinc-100"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-zinc-100">Chat History</h3>
            <p className="text-[11px] text-zinc-500">
              Last {sessions.length}/10 chats saved in localStorage
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

        <div className="p-3 border-b border-zinc-800/80">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-100 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
          {sessions.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500 space-y-1">
              <MessageSquare className="w-6 h-6 mx-auto text-zinc-700 mb-2" />
              <p>No saved chats yet.</p>
              <p className="text-[11px] text-zinc-600">
                Start a conversation or click New Chat to save sessions here.
              </p>
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeChatId;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    onSelectChat(s.id);
                    onClose();
                  }}
                  className={`group flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-zinc-900 border-cyan-500/60 text-zinc-100'
                      : 'bg-zinc-950/70 hover:bg-zinc-900 border-zinc-800/80 text-zinc-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{s.title || 'Untitled Chat'}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                      <span>{s.messages.length} msgs</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(s.updatedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(s.id);
                    }}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
                    title="Delete chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
