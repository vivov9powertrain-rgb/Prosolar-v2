import type { Mode, ModelCapability, ProviderId } from '../types';

export type ReasoningStyle =
  | 'gemini'
  | 'gemma4'
  | 'effort'
  | 'groq-oss'
  | 'groq-qwen'
  | 'openrouter'
  | 'nim-switch'
  | 'zai-53'
  | 'zai-52'
  | 'zai-toggle';

export interface ReasoningRule {
  style: ReasoningStyle;
  modes: readonly Mode[];
  mandatory?: boolean;
}

export const THINKING_MODES: { value: Mode; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Provider default (no override)' },
  { value: 'none', label: 'None', description: 'Disable reasoning / thinking' },
  { value: 'minimal', label: 'Minimal', description: 'Fastest light reasoning' },
  { value: 'low', label: 'Low', description: 'Low reasoning effort' },
  { value: 'medium', label: 'Medium', description: 'Balanced reasoning effort' },
  { value: 'high', label: 'High', description: 'Deep reasoning effort' },
  { value: 'xhigh', label: 'XHigh', description: 'Extended deep reasoning' },
  { value: 'max', label: 'Max', description: 'Maximum supported depth' },
];

export const ALL_NON_DEFAULT_MODES: Mode[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

const ALL_MODES_WITH_DEFAULT: Mode[] = ['default', ...ALL_NON_DEFAULT_MODES];
const LEVELS: Mode[] = ['low', 'medium', 'high'];

const effort = (
  modes: readonly Mode[] = LEVELS,
  style: ReasoningStyle = 'effort',
  mandatory = false
): ReasoningRule => ({
  style,
  modes,
  mandatory,
});

/**
 * Resolves the wire-protocol style and nominal mode bounds for a provider/model family.
 * Uses only protocol/family patterns (never hardcoded individual model allowlists)
 * and honors any runtime-learned capability preferences.
 */
export function reasonRule(
  providerId: ProviderId,
  model: string,
  capability?: ModelCapability
): ReasoningRule | undefined {
  const m = model.trim().toLowerCase().replace(/^models\//, '');
  if (!m) return undefined;

  if (capability?.preferredStyle) {
    if (capability.preferredStyle === 'nim-switch') {
      return effort(['none', 'on'], 'nim-switch', Boolean(capability.mandatory));
    }
    if (capability.preferredStyle === 'zai-53') {
      return effort(['low', 'high', 'max'], 'zai-53', true);
    }
    if (capability.preferredStyle === 'zai-toggle') {
      return effort(['none', 'on'], 'zai-toggle', Boolean(capability.mandatory));
    }
    return effort(
      capability.supportedModes.filter((x) => x !== 'default'),
      'effort',
      Boolean(capability.mandatory)
    );
  }

  if (providerId === 'gemini') {
    if (m.startsWith('gemma-4')) return effort(['minimal', 'high'], 'gemma4', false);
    if (m.startsWith('gemma')) return undefined; // Pre-Gemma-4 models have no thinkingLevel
    if (/^gemini-5/.test(m)) {
      return effort([...LEVELS, 'xhigh', 'max'], 'gemini', true);
    }
    if (m.includes('hydrogen') || m.includes('neon')) {
      return effort([...LEVELS, 'xhigh'], 'gemini', true);
    }
    if (
      m.includes('carbon') ||
      m.includes('argon') ||
      m.includes('3.8-flash') ||
      m.includes('3.1-pro')
    ) {
      return effort(LEVELS, 'gemini', true);
    }
    if (m.includes('3-pro')) {
      return effort(['low', 'high'], 'gemini', true);
    }
    if (m.includes('flash')) {
      return effort(['minimal', ...LEVELS], 'gemini', false);
    }
    // Future/unknown Gemini models: allow full range and self-heal on parameter rejection
    return effort(ALL_NON_DEFAULT_MODES, 'gemini', false);
  }

  if (providerId === 'groq') {
    if (m.includes('gpt-oss')) return effort(LEVELS, 'groq-oss');
    if (m.includes('qwen3.6-27b') || m.includes('qwen3-32b')) {
      return effort(['none', 'on'], 'groq-qwen');
    }
    if (m.includes('qwen3')) return effort(['none', ...LEVELS], 'groq-qwen');
    if (m.includes('muse')) return effort([...LEVELS, 'xhigh'], 'effort');
    return undefined;
  }

  if (providerId === 'openrouter') {
    return effort(ALL_NON_DEFAULT_MODES, 'openrouter');
  }

  if (providerId === 'nvidia') {
    if (m.includes('glm-5.3')) return effort(['low', 'high', 'max'], 'effort', true);
    if (m.includes('muse')) return effort([...LEVELS, 'xhigh'], 'effort');
    if (
      m.includes('gpt-oss') ||
      m.includes('mistral-large-4') ||
      m.includes('sarvam') ||
      m.includes('deepseek-v4-pro')
    ) {
      return effort(LEVELS, 'effort');
    }
    if (
      m.includes('nemotron-3') ||
      m.includes('gemma-4') ||
      m.includes('qwen') ||
      m.includes('deepseek') ||
      m.includes('glm') ||
      m.includes('minimax') ||
      m.includes('granite')
    ) {
      return effort(['none', 'on'], 'nim-switch');
    }
    return undefined;
  }

  if (providerId === 'zai') {
    if (m.includes('glm-5.3')) {
      return effort(['low', 'high', 'max'], 'zai-53', true);
    }
    if (m.includes('glm-5.2')) {
      return effort(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'], 'zai-52');
    }
    return effort(['none', 'on'], 'zai-toggle');
  }

  // Custom #1 / Custom #2 (e.g. Arena API)
  return effort(ALL_NON_DEFAULT_MODES, 'effort');
}

export function deriveCapability(
  providerId: ProviderId,
  model: string,
  liveCap?: ModelCapability
): ModelCapability {
  if (
    liveCap &&
    (liveCap.source === 'learned-runtime' || liveCap.source === 'live-api')
  ) {
    return liveCap;
  }

  const rule = reasonRule(providerId, model, liveCap);

  if (providerId === 'custom1' || providerId === 'custom2') {
    return {
      supportsThinking: 'unknown',
      supportedModes: ALL_MODES_WITH_DEFAULT,
      mandatory: false,
      maxOutputTokens: liveCap?.maxOutputTokens,
      source: 'adaptive',
    };
  }

  if (!rule) {
    // Unknown/unclassified models on Groq, NVIDIA, etc. remain testable via adaptive mode
    const m = model.trim().toLowerCase();
    if (providerId === 'gemini' && m.startsWith('gemma') && !m.startsWith('gemma-4')) {
      return {
        supportsThinking: false,
        supportedModes: ['default'],
        mandatory: false,
        maxOutputTokens: liveCap?.maxOutputTokens,
        source: 'provider-rules',
      };
    }
    return {
      supportsThinking: 'unknown',
      supportedModes: ALL_MODES_WITH_DEFAULT,
      mandatory: false,
      maxOutputTokens: liveCap?.maxOutputTokens,
      source: 'adaptive',
    };
  }

  return {
    supportsThinking: true,
    supportedModes: ['default', ...rule.modes],
    mandatory: Boolean(rule.mandatory),
    maxOutputTokens: liveCap?.maxOutputTokens,
    source: 'provider-rules',
  };
}

const MODE_ORDER: Mode[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export function clampModeToModes(
  requestedMode: Mode,
  supportedModes: readonly Mode[],
  mandatory = false,
  style?: ReasoningStyle
): Mode {
  if (requestedMode === 'default') return 'default';

  const nonDefault: Mode[] = supportedModes.filter((m) => m !== 'default');
  if (nonDefault.length === 0) return 'default';
  if (nonDefault.includes(requestedMode)) return requestedMode;

  if (nonDefault.includes('on')) {
    if (requestedMode === 'none') {
      return nonDefault.includes('none') ? 'none' : 'on';
    }
    return 'on';
  }

  if (requestedMode === 'medium' && style === 'zai-53' && nonDefault.includes('high')) {
    return 'high';
  }

  if (requestedMode === 'none') {
    if (mandatory) {
      return nonDefault.find((m) => m !== 'none') ?? nonDefault[0];
    }
    if (nonDefault.includes('minimal')) return 'minimal';
    if (nonDefault.includes('low')) return 'low';
    return nonDefault[0];
  }

  const reqRank = MODE_ORDER.indexOf(requestedMode);
  if (reqRank >= 0) {
    for (let r = reqRank; r >= 0; r--) {
      if (nonDefault.includes(MODE_ORDER[r])) {
        return MODE_ORDER[r];
      }
    }
    for (let r = reqRank + 1; r < MODE_ORDER.length; r++) {
      if (nonDefault.includes(MODE_ORDER[r])) {
        return MODE_ORDER[r];
      }
    }
  }

  return nonDefault[nonDefault.length - 1];
}

export function clampModeToRule(mode: Mode, rule?: ReasoningRule): Mode {
  if (mode === 'default') return 'default';
  if (!rule) return mode;
  return clampModeToModes(mode, rule.modes, rule.mandatory, rule.style);
}

export function modeFor(
  providerId: ProviderId,
  model: string,
  choices?: Partial<Record<ProviderId, Mode>>
): Mode {
  const chosen = choices?.[providerId] ?? 'default';
  if (chosen === 'default') return 'default';
  const cap = deriveCapability(providerId, model);
  if (cap.supportsThinking === false) return 'default';
  const rule = reasonRule(providerId, model, cap);
  return clampModeToModes(chosen, cap.supportedModes, cap.mandatory, rule?.style);
}

function capitalizeMode(m: Mode): string {
  if (m === 'xhigh') return 'XHigh';
  if (m === 'on') return 'On';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export type GeminiLevelString = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' | 'MAX';

/**
 * Resolves the effective normalized Gemini mode + Gemini thinkingLevel string,
 * combining live-api / learned-runtime capabilities with wire-protocol norms.
 */
function resolveGeminiTarget(
  model: string,
  requestedMode: Mode,
  capability?: ModelCapability
): {
  cap: ModelCapability;
  effectiveMode: Mode;
  level: GeminiLevelString;
  includeThoughts: boolean;
  isMandatory: boolean;
} {
  const cap = deriveCapability('gemini', model, capability);
  const m = model.trim().toLowerCase().replace(/^models\//, '');
  const rule = reasonRule('gemini', model, cap);

  // Use narrowed learned modes directly if learned at runtime; otherwise intersect with protocol rule when available
  const effectiveModes =
    cap.source === 'learned-runtime' || !rule
      ? cap.supportedModes
      : (['default', ...rule.modes] as Mode[]);
  const isMandatory =
    cap.source === 'learned-runtime'
      ? Boolean(cap.mandatory)
      : Boolean(cap.mandatory ?? rule?.mandatory);

  const effectiveMode = clampModeToModes(requestedMode, effectiveModes, isMandatory, rule?.style);

  let level: GeminiLevelString = 'HIGH';
  if (effectiveMode === 'minimal') level = 'MINIMAL';
  else if (effectiveMode === 'low') level = 'LOW';
  else if (effectiveMode === 'medium') level = 'MEDIUM';
  else if (effectiveMode === 'high') level = 'HIGH';
  else if (effectiveMode === 'xhigh') level = 'XHIGH';
  else if (effectiveMode === 'max') {
    level = /^gemini-5/.test(m) ? 'MAX' : 'XHIGH';
  } else if (effectiveMode === 'none') {
    level = effectiveModes.includes('minimal') && !isMandatory ? 'MINIMAL' : 'LOW';
  }

  // Enforce Gemma 4 MINIMAL/HIGH level mapping
  if (m.startsWith('gemma-4')) {
    level = level === 'MINIMAL' || level === 'LOW' ? 'MINIMAL' : 'HIGH';
  }

  // Enforce Pro/Carbon/Argon/3.8-flash floor of LOW (never MINIMAL)
  if (
    level === 'MINIMAL' &&
    !m.startsWith('gemma-4') &&
    (isMandatory || m.includes('pro') || m.includes('carbon') || m.includes('argon') || m.includes('3.8-flash'))
  ) {
    level = 'LOW';
  }

  // For known 3.x / 4-carbon / 4-argon without learned MAX/XHIGH support, cap to HIGH
  if (
    (level === 'MAX' || level === 'XHIGH') &&
    cap.source !== 'learned-runtime' &&
    (m.includes('carbon') || m.includes('argon') || /^gemini-3/.test(m))
  ) {
    level = 'HIGH';
  }

  // For 4-hydrogen / 4-neon (not gemini-5+), cap MAX to XHIGH
  if (level === 'MAX' && cap.source !== 'learned-runtime' && !/^gemini-5/.test(m)) {
    level = 'XHIGH';
  }

  const normalizedMode: Mode =
    level === 'MINIMAL'
      ? 'minimal'
      : level === 'LOW'
        ? 'low'
        : level === 'MEDIUM'
          ? 'medium'
          : level === 'HIGH'
            ? 'high'
            : level === 'XHIGH'
              ? 'xhigh'
              : 'max';

  const includeThoughts = !(requestedMode === 'none' && !isMandatory && level === 'MINIMAL');

  return {
    cap,
    effectiveMode: normalizedMode,
    level,
    includeThoughts,
    isMandatory,
  };
}

export interface EffectiveModeInfo {
  effectiveMode: Mode;
  clamped: boolean;
  supported: boolean;
  mandatory: boolean;
  optionLabel: string;
}

export function getEffectiveModeInfo(
  providerId: ProviderId,
  model: string | undefined,
  requestedMode: Mode,
  capability?: ModelCapability
): EffectiveModeInfo {
  const baseLabel = capitalizeMode(requestedMode);
  if (!model || !model.trim()) {
    return {
      effectiveMode: requestedMode,
      clamped: false,
      supported: true,
      mandatory: false,
      optionLabel: baseLabel,
    };
  }

  const cap = deriveCapability(providerId, model, capability);

  if (requestedMode === 'default') {
    return {
      effectiveMode: 'default',
      clamped: false,
      supported: true,
      mandatory: Boolean(cap.mandatory),
      optionLabel: 'Default',
    };
  }

  if (cap.supportsThinking === false) {
    return {
      effectiveMode: 'default',
      clamped: true,
      supported: false,
      mandatory: false,
      optionLabel: `${baseLabel} (Standard / no thinking)`,
    };
  }

  if (providerId === 'gemini') {
    const resolved = resolveGeminiTarget(model, requestedMode, capability);
    if (requestedMode === 'none' && resolved.isMandatory) {
      return {
        effectiveMode: resolved.effectiveMode,
        clamped: true,
        supported: true,
        mandatory: true,
        optionLabel: `None (mandatory → ${capitalizeMode(resolved.effectiveMode)})`,
      };
    }
    if (resolved.effectiveMode !== requestedMode) {
      if (requestedMode === 'none' && resolved.effectiveMode === 'minimal') {
        return {
          effectiveMode: 'minimal',
          clamped: true,
          supported: true,
          mandatory: false,
          optionLabel: 'None (→ Minimal)',
        };
      }
      return {
        effectiveMode: resolved.effectiveMode,
        clamped: true,
        supported: true,
        mandatory: resolved.isMandatory,
        optionLabel: `${baseLabel} (→ ${capitalizeMode(resolved.effectiveMode)})`,
      };
    }
    return {
      effectiveMode: resolved.effectiveMode,
      clamped: false,
      supported: true,
      mandatory: resolved.isMandatory,
      optionLabel: `${baseLabel} (Supported)`,
    };
  }

  const rule = reasonRule(providerId, model, cap);
  const effectiveModes =
    cap.source === 'learned-runtime' || !rule
      ? cap.supportedModes
      : (['default', ...rule.modes] as Mode[]);
  const isMandatory =
    cap.source === 'learned-runtime'
      ? Boolean(cap.mandatory)
      : Boolean(cap.mandatory ?? rule?.mandatory);

  const clampedMode = clampModeToModes(requestedMode, effectiveModes, isMandatory, rule?.style);

  if (cap.supportsThinking === 'unknown' && !rule) {
    if (clampedMode !== requestedMode) {
      return {
        effectiveMode: clampedMode,
        clamped: true,
        supported: true,
        mandatory: isMandatory,
        optionLabel: `${baseLabel} (→ ${capitalizeMode(clampedMode)})`,
      };
    }
    return {
      effectiveMode: clampedMode,
      clamped: false,
      supported: true,
      mandatory: false,
      optionLabel: `${baseLabel} (Adaptive)`,
    };
  }

  if (requestedMode === 'none' && isMandatory) {
    return {
      effectiveMode: clampedMode,
      clamped: true,
      supported: true,
      mandatory: true,
      optionLabel: `None (mandatory → ${capitalizeMode(clampedMode)})`,
    };
  }

  if (clampedMode !== requestedMode) {
    return {
      effectiveMode: clampedMode,
      clamped: true,
      supported: true,
      mandatory: isMandatory,
      optionLabel: `${baseLabel} (→ ${capitalizeMode(clampedMode)})`,
    };
  }

  return {
    effectiveMode: clampedMode,
    clamped: false,
    supported: true,
    mandatory: isMandatory,
    optionLabel: `${baseLabel} (Supported)`,
  };
}

// ============================================================================
// Gemini Native Thinking Config Resolver (3.x / 4.x / 5.x+ / Gemma 4+ ONLY)
// ============================================================================
export interface GeminiThinkingAttempt {
  thinkingConfig?: { thinkingLevel: GeminiLevelString; includeThoughts: boolean };
  appliedLevel?: GeminiLevelString;
  includeMaxTokens: boolean;
  effectiveMode: Mode;
  summary: string;
}

const GEMINI_STEP_DOWN: Record<GeminiLevelString, GeminiLevelString[]> = {
  MAX: ['XHIGH', 'HIGH', 'MEDIUM', 'LOW'],
  XHIGH: ['HIGH', 'MEDIUM', 'LOW'],
  HIGH: ['MEDIUM', 'LOW'],
  MEDIUM: ['LOW'],
  LOW: [],
  MINIMAL: ['LOW'],
};

export function buildGeminiThinkingAttempts(
  model: string,
  requestedMode: Mode,
  capability?: ModelCapability
): GeminiThinkingAttempt[] {
  const cap = deriveCapability('gemini', model, capability);
  const m = model.trim().toLowerCase().replace(/^models\//, '');

  if (cap.supportsThinking === false || requestedMode === 'default') {
    const label =
      requestedMode !== 'default' && cap.supportsThinking === false
        ? `Thinking: ${capitalizeMode(requestedMode)} → Standard (no thinking)`
        : 'Thinking: Default';
    return [
      { includeMaxTokens: true, effectiveMode: 'default', summary: label },
      { includeMaxTokens: false, effectiveMode: 'default', summary: label },
    ];
  }

  const resolved = resolveGeminiTarget(model, requestedMode, capability);
  const primaryLevel = resolved.level;

  if (m.startsWith('gemma-4')) {
    if (requestedMode === 'none') {
      return [
        { includeMaxTokens: true, effectiveMode: 'none', summary: 'Thinking: None' },
        { includeMaxTokens: false, effectiveMode: 'none', summary: 'Thinking: None' },
      ];
    }
    const gemmaLevel: GeminiLevelString = primaryLevel === 'MINIMAL' ? 'MINIMAL' : 'HIGH';
    return [
      {
        thinkingConfig: { thinkingLevel: gemmaLevel, includeThoughts: true },
        appliedLevel: gemmaLevel,
        includeMaxTokens: true,
        effectiveMode: gemmaLevel.toLowerCase() as Mode,
        summary: `Thinking: ${capitalizeMode(requestedMode)} → ${gemmaLevel}`,
      },
      {
        includeMaxTokens: true,
        effectiveMode: 'default',
        summary: 'Standard (thinkingConfig omitted on retry)',
      },
    ];
  }

  const clampedNote =
    resolved.effectiveMode !== requestedMode
      ? ` (${capitalizeMode(resolved.effectiveMode)} clamped)`
      : '';

  const attempts: GeminiThinkingAttempt[] = [
    {
      thinkingConfig: {
        thinkingLevel: primaryLevel,
        includeThoughts: resolved.includeThoughts,
      },
      appliedLevel: primaryLevel,
      includeMaxTokens: true,
      effectiveMode: resolved.effectiveMode,
      summary:
        requestedMode === 'none' && !resolved.includeThoughts
          ? 'Thinking: None → MINIMAL (thoughts hidden)'
          : `Thinking: ${capitalizeMode(requestedMode)} → ${primaryLevel}${clampedNote}`,
    },
  ];

  for (const nextLevel of GEMINI_STEP_DOWN[primaryLevel]) {
    if (nextLevel === 'MEDIUM' && m.includes('3-pro')) continue;
    attempts.push({
      thinkingConfig: { thinkingLevel: nextLevel, includeThoughts: true },
      appliedLevel: nextLevel,
      includeMaxTokens: true,
      effectiveMode: nextLevel.toLowerCase() as Mode,
      summary: `Thinking: ${capitalizeMode(requestedMode)} → ${nextLevel} (stepped down on retry)`,
    });
  }

  attempts.push({
    includeMaxTokens: true,
    effectiveMode: 'default',
    summary: 'Standard (thinkingConfig omitted on retry)',
  });

  return attempts;
}

export type OpenAIReasoningFields = {
  reasoning_effort?: string;
  include_reasoning?: boolean;
  reasoning_format?: 'hidden' | 'parsed' | 'raw';
  chat_template_kwargs?: { enable_thinking?: boolean; thinking?: boolean };
  reasoning?: { effort: string; exclude?: boolean };
  thinking?: { type: 'enabled' | 'disabled' } | boolean;
};

/**
 * Produces provider-specific reasoning parameters for OpenAI-compatible endpoints.
 * Clamps unsupported levels safely against live/learned capabilities or wire-protocol rules.
 */
export function reasonFields(
  providerId: ProviderId,
  model: string,
  requestedMode: Mode,
  capability?: ModelCapability
): OpenAIReasoningFields {
  if (requestedMode === 'default') return {};

  const cap = deriveCapability(providerId, model, capability);
  if (cap.supportsThinking === false) return {};

  const rule = reasonRule(providerId, model, cap);
  const effectiveModes =
    cap.source === 'learned-runtime' || !rule
      ? cap.supportedModes
      : (['default', ...rule.modes] as Mode[]);
  const isMandatory =
    cap.source === 'learned-runtime'
      ? Boolean(cap.mandatory)
      : Boolean(cap.mandatory ?? rule?.mandatory);

  const mode = clampModeToModes(requestedMode, effectiveModes, isMandatory, rule?.style);

  if (providerId === 'custom1' || providerId === 'custom2') {
    if (mode === 'none') return { reasoning_effort: 'none' };
    const effortVal = mode === 'on' ? 'medium' : mode;
    return { reasoning_effort: effortVal };
  }

  if (providerId === 'openrouter' || rule?.style === 'openrouter') {
    if (mode === 'none') {
      return { reasoning: { effort: 'none', exclude: true } };
    }
    const effortVal = mode === 'max' ? 'xhigh' : mode === 'on' ? 'medium' : mode;
    return {
      reasoning: { effort: effortVal, exclude: false },
    };
  }

  // Unknown/adaptive models on Groq, NVIDIA, etc.: try standard reasoning_effort
  if (!rule) {
    if (mode === 'none') return {};
    return {
      reasoning_effort: mode === 'on' ? 'medium' : mode,
    };
  }

  if (rule.style === 'nim-switch') {
    return { chat_template_kwargs: { enable_thinking: mode !== 'none' } };
  }

  if (rule.style === 'zai-53') {
    const effortVal =
      mode === 'none' || mode === 'minimal'
        ? 'low'
        : mode === 'medium' || mode === 'on'
          ? 'high'
          : mode === 'xhigh'
            ? 'max'
            : mode;
    return {
      thinking: { type: 'enabled' },
      reasoning_effort: effortVal,
    };
  }

  if (rule.style === 'zai-52') {
    if (mode === 'none') {
      return { thinking: { type: 'disabled' } };
    }
    const effortVal = mode === 'on' ? 'medium' : mode === 'max' ? 'xhigh' : mode;
    return {
      thinking: { type: 'enabled' },
      reasoning_effort: effortVal,
    };
  }

  if (rule.style === 'zai-toggle') {
    return {
      thinking: { type: mode === 'none' ? 'disabled' : 'enabled' },
    };
  }

  if (rule.style === 'groq-oss') {
    if (mode === 'none') return {};
    const effortVal =
      mode === 'xhigh' || mode === 'max' ? 'high' : mode === 'minimal' ? 'low' : mode;
    return {
      reasoning_effort: effortVal,
      include_reasoning: true,
    };
  }

  if (rule.style === 'groq-qwen') {
    if (mode === 'none') return { reasoning_effort: 'none', reasoning_format: 'parsed' };
    const effortVal =
      mode === 'on' ? 'default' : mode === 'xhigh' || mode === 'max' ? 'high' : mode;
    return {
      reasoning_effort: effortVal,
      reasoning_format: 'parsed',
    };
  }

  // Standard effort style
  if (mode === 'none') return {};
  return {
    reasoning_effort: mode === 'on' ? 'medium' : mode,
  };
}

/**
 * Computes an updated learned-runtime ModelCapability after a retry attempt succeeds.
 */
export function buildLearnedCapability(options: {
  providerId: ProviderId;
  model: string;
  requestedMode: Mode;
  priorCapability?: ModelCapability;
  succeededMode: Mode;
  strippedThinking: boolean;
  swappedStyle?: 'effort' | 'nim-switch' | 'zai-53' | 'zai-toggle';
  systemAsUser?: boolean;
}): ModelCapability {
  const {
    providerId,
    model,
    requestedMode,
    priorCapability,
    succeededMode,
    strippedThinking,
    swappedStyle,
    systemAsUser,
  } = options;

  const base = deriveCapability(providerId, model, priorCapability);

  if (strippedThinking) {
    return {
      supportsThinking: false,
      supportedModes: ['default'],
      mandatory: false,
      maxOutputTokens: base.maxOutputTokens,
      systemAsUser: systemAsUser ?? base.systemAsUser,
      source: 'learned-runtime',
    };
  }

  let modes = [...base.supportedModes];
  let mandatory = Boolean(base.mandatory);

  if (swappedStyle === 'nim-switch') {
    modes = ['default', 'none', 'on'];
  } else if (swappedStyle === 'zai-toggle') {
    modes = ['default', 'none', 'on'];
  } else if (succeededMode !== requestedMode && succeededMode !== 'default') {
    const reqIdx = MODE_ORDER.indexOf(requestedMode);
    const sucIdx = MODE_ORDER.indexOf(succeededMode);
    if (requestedMode === 'none' && sucIdx > 0) {
      // 'none' rejected -> floor is succeededMode, thinking is mandatory
      mandatory = true;
      modes = modes.filter((m) => m === 'default' || MODE_ORDER.indexOf(m) >= sucIdx);
    } else if (requestedMode === 'minimal' && sucIdx > 1) {
      modes = modes.filter((m) => m === 'default' || m === 'none' || MODE_ORDER.indexOf(m) >= sucIdx);
    } else if (reqIdx > sucIdx && sucIdx >= 0) {
      // Ceiling hit -> cap supportedModes at succeededMode
      modes = modes.filter((m) => m === 'default' || MODE_ORDER.indexOf(m) <= sucIdx);
    }
    if (!modes.includes(succeededMode)) modes.push(succeededMode);
  }

  return {
    supportsThinking: true,
    supportedModes: modes,
    mandatory,
    maxOutputTokens: base.maxOutputTokens,
    preferredStyle: swappedStyle ?? base.preferredStyle,
    systemAsUser: systemAsUser ?? base.systemAsUser,
    source: 'learned-runtime',
  };
}

export function describeAppliedOpenAIThinking(
  providerId: ProviderId,
  model: string,
  requestedMode: Mode,
  fields: OpenAIReasoningFields,
  capability?: ModelCapability,
  retried = false
): string {
  if (requestedMode === 'default') return 'Reasoning: Default';
  const cap = deriveCapability(providerId, model, capability);
  if (cap.supportsThinking === false) {
    return `Reasoning: ${capitalizeMode(requestedMode)} → Standard (no thinking)`;
  }
  const hasAny = Object.keys(fields).length > 0;
  if (!hasAny) {
    return retried ? 'Standard (reasoning omitted on retry)' : 'Reasoning: Default';
  }
  const rule = reasonRule(providerId, model, cap);
  const effective = clampModeToModes(requestedMode, cap.supportedModes, cap.mandatory, rule?.style);

  if (fields.reasoning?.effort) {
    const suffix =
      fields.reasoning.effort !== requestedMode
        ? ` → ${capitalizeMode(fields.reasoning.effort as Mode)} (clamped)`
        : '';
    return `Reasoning: ${capitalizeMode(requestedMode)}${suffix}${retried ? ' (retried)' : ''}`;
  }
  if (fields.reasoning_effort) {
    const suffix =
      fields.reasoning_effort !== requestedMode
        ? ` → ${capitalizeMode(fields.reasoning_effort as Mode)} (clamped)`
        : '';
    return `Reasoning: ${capitalizeMode(requestedMode)}${suffix}${retried ? ' (retried)' : ''}`;
  }
  if (fields.chat_template_kwargs) {
    const enabled =
      fields.chat_template_kwargs.enable_thinking ?? fields.chat_template_kwargs.thinking;
    return `Thinking: ${enabled ? 'Enabled' : 'Disabled'}${retried ? ' (retried)' : ''}`;
  }
  if (fields.thinking && typeof fields.thinking === 'object') {
    return `Thinking: ${fields.thinking.type === 'enabled' ? 'Enabled' : 'Disabled'}${retried ? ' (retried)' : ''}`;
  }
  if (effective !== requestedMode) {
    return `Reasoning: ${capitalizeMode(requestedMode)} → ${capitalizeMode(effective)} (clamped)`;
  }
  return `Reasoning: ${capitalizeMode(requestedMode)}`;
}

export function describeThinkingSupport(
  providerId: ProviderId,
  model: string,
  capability?: ModelCapability
): string {
  const m = model.trim();
  if (!m) return 'No model configured';
  const cap = deriveCapability(providerId, m, capability);
  if (cap.supportsThinking === false) {
    if (cap.source === 'live-api') return 'Standard (live API: no thinking)';
    if (cap.source === 'learned-runtime') return 'Standard (learned: no thinking)';
    return 'Standard (no thinking)';
  }
  const modes = cap.supportedModes.filter((x) => x !== 'default');
  if (modes.length === 0) return 'Standard';
  const tag =
    cap.source === 'live-api'
      ? ' · live'
      : cap.source === 'learned-runtime'
        ? ' · learned'
        : cap.source === 'adaptive'
          ? ' · adaptive'
          : '';
  return `${modes.join(' / ')}${cap.mandatory ? ' (mandatory)' : ''}${tag}`;
}
