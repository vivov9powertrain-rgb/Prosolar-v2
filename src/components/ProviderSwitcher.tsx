import React from 'react';
import { PROVIDERS, type CascadeConfig, type CustomProviderSlot, type ProviderId } from '../types';
import { resolveProviderMeta } from '../lib/providers';

interface ProviderSwitcherProps {
  activeProvider: ProviderId;
  onSelectProvider: (id: ProviderId) => void;
  cascades: CascadeConfig;
  customProviders: Record<'custom1' | 'custom2', CustomProviderSlot>;
  accentColor: string;
}

export const ProviderSwitcher: React.FC<ProviderSwitcherProps> = ({
  activeProvider,
  onSelectProvider,
  cascades,
  customProviders,
  accentColor,
}) => {
  return (
    <div
      className="flex items-center gap-1 flex-nowrap overflow-x-auto no-scrollbar scroll-smooth max-w-full py-1 px-1 rounded-xl bg-zinc-900/80 border border-zinc-800"
      role="tablist"
      aria-label="Provider switcher"
    >
      {PROVIDERS.map((p) => {
        const meta = resolveProviderMeta(p.id, customProviders);
        const isActive = activeProvider === p.id;
        const count = (cascades[p.id] || []).length;
        const isConfiguredCustom = !p.isCustom || Boolean(meta.baseUrl);

        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectProvider(p.id)}
            title={`${meta.label}${meta.baseUrl ? ` (${meta.baseUrl})` : ' (Configure URL in Settings)'} · ${count} model${count === 1 ? '' : 's'} in cascade`}
            style={
              isActive
                ? {
                    borderColor: accentColor,
                    color: accentColor,
                  }
                : undefined
            }
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer border ${
              isActive
                ? 'bg-zinc-800 shadow-sm'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            } ${!isConfiguredCustom && !isActive ? 'opacity-60' : ''}`}
          >
            <span>{meta.shortLabel}</span>
            <span
              className={`text-[9px] font-mono px-1 rounded ${
                isActive
                  ? 'bg-black/50 text-zinc-200'
                  : count > 0
                    ? 'bg-zinc-800 text-zinc-400'
                    : 'bg-zinc-950 text-zinc-600'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
