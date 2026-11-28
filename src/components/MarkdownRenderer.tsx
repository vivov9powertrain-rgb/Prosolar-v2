import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/contrib/mhchem';
import { Download, Check, Play, CheckCircle2, RefreshCw, Copy, X } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SourceItem } from '../types';

interface MarkdownRendererProps {
  content: string;
  textSizeLevel?: number;
  sources?: SourceItem[];
  onOpenCanvas?: (payload: { code: string; language: string }) => void;
}

interface MathItem {
  token: string;
  math: string;
  isBlock: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  python: 'py',
  py: 'py',
  json: 'json',
  jsonc: 'json',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  zsh: 'sh',
  yaml: 'yml',
  yml: 'yml',
  markdown: 'md',
  md: 'md',
  xml: 'xml',
  svg: 'svg',
  csv: 'csv',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  java: 'java',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  php: 'php',
  ruby: 'rb',
  rb: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  kt: 'kt',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'dockerfile',
};

function getExtensionForLanguage(lang?: string): string {
  if (!lang) return 'txt';
  const normalized = lang.trim().toLowerCase().split(/\s+/)[0];
  return LANGUAGE_EXTENSIONS[normalized] || 'txt';
}

function downloadCodeSnippet(rawCode: string, lang?: string) {
  const ext = getExtensionForLanguage(lang);
  const filename = ext === 'dockerfile' ? 'Dockerfile' : `code.${ext}`;
  const blob = new Blob([rawCode], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DOWNLOAD_ICON_HTML = renderToStaticMarkup(
  <Download size={12} strokeWidth={2} aria-hidden="true" />
);
const CHECK_ICON_HTML = renderToStaticMarkup(
  <Check size={12} strokeWidth={2.5} className="text-emerald-400" aria-hidden="true" />
);
const PLAY_ICON_HTML = renderToStaticMarkup(
  <Play size={11} strokeWidth={2.2} className="fill-current" aria-hidden="true" />
);
const JSON_CHECK_ICON_HTML = renderToStaticMarkup(
  <CheckCircle2 size={11} strokeWidth={2.2} aria-hidden="true" />
);
const downloadResetTimers = new WeakMap<HTMLButtonElement, number>();
const CANVAS_LANGUAGES = new Set(['html', 'htm', 'svg', 'jsx', 'tsx', 'react']);

interface OneCompilerTarget {
  slug: string;
  fileName: string;
}

const ONECOMPILER_STATIC_TARGETS: Record<string, OneCompilerTarget> = {
  python: { slug: 'python', fileName: 'Main.py' },
  py: { slug: 'python', fileName: 'Main.py' },
  nodejs: { slug: 'nodejs', fileName: 'index.js' },
  node: { slug: 'nodejs', fileName: 'index.js' },
  typescript: { slug: 'typescript', fileName: 'main.ts' },
  ts: { slug: 'typescript', fileName: 'main.ts' },
  jsx: { slug: 'react', fileName: 'App.js' },
  tsx: { slug: 'react', fileName: 'App.js' },
  react: { slug: 'react', fileName: 'App.js' },
  html: { slug: 'html', fileName: 'index.html' },
  htm: { slug: 'html', fileName: 'index.html' },
  c: { slug: 'c', fileName: 'Main.c' },
  cpp: { slug: 'cpp', fileName: 'Main.cpp' },
  'c++': { slug: 'cpp', fileName: 'Main.cpp' },
  java: { slug: 'java', fileName: 'Main.java' },
  csharp: { slug: 'csharp', fileName: 'HelloWorld.cs' },
  cs: { slug: 'csharp', fileName: 'HelloWorld.cs' },
  'c#': { slug: 'csharp', fileName: 'HelloWorld.cs' },
  go: { slug: 'go', fileName: 'main.go' },
  golang: { slug: 'go', fileName: 'main.go' },
  rust: { slug: 'rust', fileName: 'main.rs' },
  rs: { slug: 'rust', fileName: 'main.rs' },
  php: { slug: 'php', fileName: 'index.php' },
  ruby: { slug: 'ruby', fileName: 'main.rb' },
  rb: { slug: 'ruby', fileName: 'main.rb' },
  kotlin: { slug: 'kotlin', fileName: 'Main.kt' },
  kt: { slug: 'kotlin', fileName: 'Main.kt' },
  swift: { slug: 'swift', fileName: 'main.swift' },
  dart: { slug: 'dart', fileName: 'main.dart' },
  bash: { slug: 'bash', fileName: 'script.sh' },
  sh: { slug: 'bash', fileName: 'script.sh' },
  shell: { slug: 'bash', fileName: 'script.sh' },
  zsh: { slug: 'bash', fileName: 'script.sh' },
  sql: { slug: 'sqlite', fileName: 'queries.sql' },
  sqlite: { slug: 'sqlite', fileName: 'queries.sql' },
  mysql: { slug: 'mysql', fileName: 'queries.sql' },
  postgresql: { slug: 'postgresql', fileName: 'queries.sql' },
  postgres: { slug: 'postgresql', fileName: 'queries.sql' },
  r: { slug: 'r', fileName: 'main.r' },
  lua: { slug: 'lua', fileName: 'main.lua' },
  perl: { slug: 'perl', fileName: 'main.pl' },
  scala: { slug: 'scala', fileName: 'Main.scala' },
  haskell: { slug: 'haskell', fileName: 'Main.hs' },
  elixir: { slug: 'elixir', fileName: 'main.exs' },
  julia: { slug: 'julia', fileName: 'main.jl' },
  zig: { slug: 'zig', fileName: 'main.zig' },
};

function getOneCompilerTarget(lang: string, rawCode: string): OneCompilerTarget | null {
  const normalized = (lang || '').trim().toLowerCase().split(/\s+/)[0];
  if (!normalized) return null;
  if (normalized === 'javascript' || normalized === 'js') {
    const isNode = /\brequire\s*\(|module\.exports\b|\bprocess\.|['"]fs['"]/.test(rawCode);
    return isNode
      ? { slug: 'nodejs', fileName: 'index.js' }
      : { slug: 'javascript', fileName: 'index.js' };
  }
  return ONECOMPILER_STATIC_TARGETS[normalized] || null;
}

// Standard LaTeX command names that KaTeX supports
const KNOWN_LATEX_COMMANDS = new Set([
  'frac', 'dfrac', 'cfrac', 'sqrt', 'text', 'textbf', 'textit', 'textrm', 'mathrm', 'mathbf', 'mathit', 'mathcal', 'mathbb',
  'ce', 'pu', 'times', 'cdot', 'div', 'pm', 'mp', 'leq', 'geq', 'le', 'ge', 'neq', 'approx', 'sim', 'simeq', 'infty',
  'propto', 'sum', 'prod', 'int', 'iint', 'iiint', 'oint', 'lim', 'inf', 'sup', 'min', 'max', 'sin', 'cos', 'tan',
  'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'det', 'dim', 'ker', 'deg', 'partial', 'nabla',
  'd', 'dx', 'dy', 'dt', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon',
  'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'begin', 'end', 'overline', 'underline', 'hat', 'check', 'breve', 'acute',
  'grave', 'tilde', 'bar', 'vec', 'dot', 'ddot', 'arrow', 'rightarrow', 'leftarrow', 'implies', 'iff', 'Rightarrow', 'Leftarrow',
  'longrightarrow', 'longleftarrow', 'to', 'mapsto', 'quad', 'qquad', 'hspace', 'vspace', 'phantom', 'color', 'over', 'atop',
  'degree', 'celcius', 'celsius', 'ohm', 'micro', 'unit', 'circ', 'angle', 'perp', 'parallel', 'therefore', 'because', 'bold', 'cancel'
]);

const KATEX_MACROS = {
  '\\pu': '\\mathrm{#1}',
  '\\d': '\\mathrm{d}',
  '\\degree': '^\\circ',
  '\\celcius': '^\\circ\\mathrm{C}',
  '\\celsius': '^\\circ\\mathrm{C}',
  '\\ohm': '\\Omega',
  '\\micro': '\\mu',
  '\\unit': '\\mathrm{#1}',
  '\\cancel': '\\not{#1}',
  '\\bold': '\\mathbf{#1}',
};

// Auto-heals common model LaTeX syntax slips before falling back
function renderMathWithHealing(rawMath: string, isBlock: boolean): string {
  const tryRender = (m: string) => {
    return katex.renderToString(m, {
      displayMode: isBlock,
      throwOnError: true,
      strict: false,
      output: 'htmlAndMathml',
      trust: false,
      macros: KATEX_MACROS,
    });
  };

  try {
    return tryRender(rawMath);
  } catch (err: any) {
    let healed = rawMath;

    // 1. Balance unclosed braces
    const openBraces = (healed.match(/\{/g) || []).length;
    const closeBraces = (healed.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      healed += '}'.repeat(openBraces - closeBraces);
    } else if (closeBraces > openBraces) {
      healed = '{'.repeat(closeBraces - openBraces) + healed;
    }

    // 2. Fix unknown control sequence from KaTeX error message (e.g., \Take -> \text{Take})
    const undefinedMatch = (err?.message || '').match(/Undefined control sequence:\s*\\([a-zA-Z]+)/);
    if (undefinedMatch) {
      const badCmd = undefinedMatch[1];
      healed = healed.replace(new RegExp('\\\\' + badCmd + '\\b', 'g'), `\\text{${badCmd}}`);
    }

    try {
      return tryRender(healed);
    } catch (_) {
      // 3. Last attempt: strip any remaining backslashes before non-standard commands
      try {
        const sanitized = healed.replace(/\\([a-zA-Z]+)/g, (match, cmd) => {
          return KNOWN_LATEX_COMMANDS.has(cmd) ? match : `\\text{${cmd}}`;
        });
        return tryRender(sanitized);
      } catch (_) {
        // Fallback display
        return `<span class="katex-fallback font-mono text-cyan-300 text-sm bg-zinc-900/70 px-1.5 py-0.5 rounded border border-zinc-800">${escapeHtml(rawMath)}</span>`;
      }
    }
  }
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  textSizeLevel = 1,
  sources,
  onOpenCanvas,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ocIframeRef = useRef<HTMLIFrameElement | null>(null);
  const ocRetryTimersRef = useRef<number[]>([]);
  const ocRunTimerRef = useRef<number | null>(null);
  const ocSyncedRef = useRef(false);
  const ocLoadedRef = useRef(false);

  const [runnerTarget, setRunnerTarget] = useState<{
    code: string;
    slug: string;
    fileName: string;
    langLabel: string;
  } | null>(null);
  const [modalCopied, setModalCopied] = useState(false);

  const clearOcTimers = useCallback(() => {
    ocRetryTimersRef.current.forEach((id) => window.clearTimeout(id));
    ocRetryTimersRef.current = [];
    if (ocRunTimerRef.current !== null) {
      window.clearTimeout(ocRunTimerRef.current);
      ocRunTimerRef.current = null;
    }
  }, []);

  const postPopulateAndRun = useCallback(
    (target: { code: string; slug: string; fileName: string }) => {
      const win = ocIframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        {
          eventType: 'populateCode',
          language: target.slug,
          files: [{ name: target.fileName, content: target.code }],
        },
        '*'
      );
      if (ocRunTimerRef.current !== null) {
        window.clearTimeout(ocRunTimerRef.current);
      }
      ocRunTimerRef.current = window.setTimeout(() => {
        ocIframeRef.current?.contentWindow?.postMessage(
          { eventType: 'triggerRun' },
          '*'
        );
      }, 200);
    },
    []
  );

  const handleIframeLoad = useCallback(() => {
    if (!runnerTarget) return;
    ocLoadedRef.current = true;
    ocSyncedRef.current = false;
    clearOcTimers();
    postPopulateAndRun(runnerTarget);

    const retry400 = window.setTimeout(() => {
      if (!ocSyncedRef.current) {
        postPopulateAndRun(runnerTarget);
      }
    }, 400);
    const retry900 = window.setTimeout(() => {
      if (!ocSyncedRef.current) {
        postPopulateAndRun(runnerTarget);
      }
    }, 900);
    ocRetryTimersRef.current = [retry400, retry900];
  }, [runnerTarget, clearOcTimers, postPopulateAndRun]);

  useEffect(() => {
    if (!runnerTarget) {
      clearOcTimers();
      ocSyncedRef.current = false;
      ocLoadedRef.current = false;
      setModalCopied(false);
      return;
    }

    const onMessage = (e: MessageEvent) => {
      if (!e.origin.includes('onecompiler.com') || !ocLoadedRef.current) return;
      const data = e.data;
      if (!data) return;

      const isCodeEvent =
        data.eventType === 'codeChangeEvent' ||
        data.action === 'codeUpdate' ||
        Array.isArray(data.files);

      if (isCodeEvent) {
        if (
          Array.isArray(data.files) &&
          typeof data.files[0]?.content === 'string' &&
          data.files[0].content !== runnerTarget.code
        ) {
          return;
        }
        ocSyncedRef.current = true;
        ocRetryTimersRef.current.forEach((id) => window.clearTimeout(id));
        ocRetryTimersRef.current = [];
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRunnerTarget(null);
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKeyDown);
      clearOcTimers();
    };
  }, [runnerTarget, clearOcTimers]);

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;

    const canvasBtn = target?.closest('button[data-open-canvas="1"]') as HTMLButtonElement | null;
    if (canvasBtn) {
      const wrapper = canvasBtn.closest('.sol-code-block');
      const codeEl = wrapper?.querySelector('pre code');
      if (!codeEl) return;
      const rawCode = codeEl.textContent || '';
      const lang = (canvasBtn.getAttribute('data-lang') || 'html')
        .trim()
        .toLowerCase()
        .split(/\s+/)[0];
      onOpenCanvas?.({ code: rawCode, language: lang });
      return;
    }

    const runBtn = target?.closest('button[data-run-code="1"]') as HTMLButtonElement | null;
    if (runBtn) {
      const wrapper = runBtn.closest('.sol-code-block');
      const codeEl = wrapper?.querySelector('pre code');
      if (!codeEl) return;
      const rawCode = codeEl.textContent || '';
      const lang = runBtn.getAttribute('data-lang') || '';
      const ocTarget = getOneCompilerTarget(lang, rawCode);
      if (!ocTarget) return;
      setRunnerTarget({
        code: rawCode,
        slug: ocTarget.slug,
        fileName: ocTarget.fileName,
        langLabel: lang || ocTarget.slug,
      });
      return;
    }

    const validateJsonBtn = target?.closest('button[data-validate-json="1"]') as HTMLButtonElement | null;
    if (validateJsonBtn) {
      const wrapper = validateJsonBtn.closest('.sol-code-block');
      const codeEl = wrapper?.querySelector('pre code');
      const statusEl = wrapper?.querySelector('[data-json-status]') as HTMLElement | null;
      if (!codeEl || !statusEl) return;
      const rawCode = codeEl.textContent || '';
      try {
        const parsed = JSON.parse(rawCode);
        let summary = '';
        if (Array.isArray(parsed)) {
          summary = `Valid JSON (${parsed.length} ${parsed.length === 1 ? 'item' : 'items'})`;
        } else if (parsed !== null && typeof parsed === 'object') {
          const count = Object.keys(parsed).length;
          summary = `Valid JSON (${count} ${count === 1 ? 'key' : 'keys'})`;
        } else {
          summary = `Valid JSON (${parsed === null ? 'null' : typeof parsed})`;
        }
        statusEl.textContent = summary;
        statusEl.className =
          'px-3 py-1.5 text-[11px] font-mono border-b border-emerald-800/60 bg-emerald-950/40 text-emerald-300';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        statusEl.textContent = msg;
        statusEl.className =
          'px-3 py-1.5 text-[11px] font-mono border-b border-rose-800/60 bg-rose-950/40 text-rose-300';
      }
      return;
    }

    const downloadBtn = target?.closest('button[data-download-code="1"]') as HTMLButtonElement | null;
    if (downloadBtn) {
      const wrapper = downloadBtn.closest('.sol-code-block');
      const codeEl = wrapper?.querySelector('pre code');
      if (!codeEl) return;
      const rawCode = codeEl.textContent || '';
      const lang = downloadBtn.getAttribute('data-lang') || '';
      downloadCodeSnippet(rawCode, lang);

      const iconEl = downloadBtn.querySelector('[data-download-icon]');
      const labelEl = downloadBtn.querySelector('[data-download-label]');
      if (iconEl) iconEl.innerHTML = CHECK_ICON_HTML;
      if (labelEl) {
        labelEl.textContent = 'Saved';
        labelEl.classList.add('text-emerald-400');
      }

      const prevTimer = downloadResetTimers.get(downloadBtn);
      if (prevTimer) window.clearTimeout(prevTimer);
      const timerId = window.setTimeout(() => {
        if (iconEl) iconEl.innerHTML = DOWNLOAD_ICON_HTML;
        if (labelEl) {
          labelEl.textContent = 'Download';
          labelEl.classList.remove('text-emerald-400');
        }
        downloadResetTimers.delete(downloadBtn);
      }, 1500);
      downloadResetTimers.set(downloadBtn, timerId);
      return;
    }

    const btn = target?.closest('button[data-copy-code="1"]') as HTMLButtonElement | null;
    if (!btn) return;
    const wrapper = btn.closest('.sol-code-block');
    const codeEl = wrapper?.querySelector('pre code');
    if (!codeEl) return;
    const text = codeEl.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const label = btn.querySelector('[data-copy-label]');
      if (label) {
        label.textContent = 'Copied';
        setTimeout(() => {
          label.textContent = 'Copy';
        }, 1600);
      }
    }).catch(() => {});
  }, [onOpenCanvas]);

  const htmlContent = useMemo(() => {
    if (!content) return '';

    try {
      const mathItems: MathItem[] = [];
      let tokenCounter = 0;

      let processed = content.trim();

      // Outer wrapper cleanup: If user quoted a message or wrapped with { ... } or `still didnt fix{ ... }`
      const wrapperMatch = processed.match(/^(?:(?:why\s+is\s+my\s+katex\s+broken[^{]*|still\s+did(?:n'?t)?\s+fix[^{]*)\{|\{)([\s\S]*)\}\s*$/i);
      if (wrapperMatch) {
        processed = wrapperMatch[1].trim();
      }

      // 0. Format inline reasoning blocks (<think>...</think>)
      processed = processed.replace(
        /<think>([\s\S]*?)<\/think>/gi,
        (_, thinkContent) => {
          return `\n\n<details class="deepseek-thought-process my-3 rounded-xl border border-indigo-900/60 bg-indigo-950/25 px-4 py-2.5 text-xs text-indigo-300">\n<summary class="cursor-pointer font-semibold text-indigo-300 hover:text-indigo-200 flex items-center gap-1.5 py-1 select-none">\n<span>🧠 Reasoning Process</span>\n</summary>\n<div class="mt-2 text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap text-[14.5px] border-t border-indigo-900/40 pt-2.5 select-text">\n${thinkContent.trim()}\n</div>\n</details>\n\n`;
        }
      );
      // Handle streaming unclosed <think> tag
      if (processed.includes('<think>')) {
        processed = processed.replace(
          /<think>([\s\S]*)$/gi,
          (_, thinkContent) => {
            return `\n\n<details open class="deepseek-thought-process my-3 rounded-xl border border-indigo-900/60 bg-indigo-950/25 px-4 py-2.5 text-xs text-indigo-300">\n<summary class="cursor-pointer font-semibold text-indigo-300 hover:text-indigo-200 flex items-center gap-1.5 py-1 select-none animate-pulse">\n<span>🧠 Reasoning in progress...</span>\n</summary>\n<div class="mt-2 text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap text-[14.5px] border-t border-indigo-900/40 pt-2.5 select-text">\n${thinkContent.trim()}\n</div>\n</details>\n\n`;
          }
        );
      }

      // 1. Double backslash normalization in LaTeX commands often returned by JSON APIs
      processed = processed.replace(
        /\\\\(frac|sqrt|times|alpha|beta|gamma|delta|theta|lambda|pi|sigma|omega|text|mathbf|mathrm|ce|pu|left|right|begin|end|sum|int|lim|to|infty|approx|pm|cdot|vec|hat|bar|quad|qquad|Delta|nabla)/g,
        '\\$1'
      );

      // 2. Extract markdown math codeblocks ```math ... ``` or ```latex ... ```
      processed = processed.replace(/```(?:math|latex)\s*([\s\S]*?)```/gi, (_, math) => {
        const token = `KATEXMATHBLOCK${tokenCounter++}END`;
        mathItems.push({
          token,
          math: math.trim(),
          isBlock: true,
        });
        return token;
      });

      // 3. Extract display block math $$...$$
      // Note: Preserve line indentation (${indent}) instead of injecting blank lines so Markdown lists don't break into indented code blocks
      processed = processed.replace(/(^[ \t]*)\$\$([\s\S]*?)\$\$/gm, (_, indent, math) => {
        const token = `KATEXMATHBLOCK${tokenCounter++}END`;
        mathItems.push({
          token,
          math: math.trim(),
          isBlock: true,
        });
        return `${indent}${token}`;
      });
      processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
        const token = `KATEXMATHBLOCK${tokenCounter++}END`;
        mathItems.push({
          token,
          math: math.trim(),
          isBlock: true,
        });
        return token;
      });

      // 4. Extract display math \[...\]
      processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
        const token = `KATEXMATHBLOCK${tokenCounter++}END`;
        mathItems.push({
          token,
          math: math.trim(),
          isBlock: true,
        });
        return token;
      });

      // 5. Extract standalone LaTeX environments (align, matrix, cases, etc.)
      processed = processed.replace(
        /\\begin\{(align|aligned|gather|gathered|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|equation|cases|split|eqnarray|array)\*?\}([\s\S]*?)\\end\{\1\*?\}/g,
        (fullMatch) => {
          const token = `KATEXMATHBLOCK${tokenCounter++}END`;
          mathItems.push({
            token,
            math: fullMatch.trim(),
            isBlock: true,
          });
          return token;
        }
      );

      // 6. Extract inline math \(...\)
      processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
        const token = `KATEXMATHINLINE${tokenCounter++}END`;
        mathItems.push({
          token,
          math: math.trim(),
          isBlock: false,
        });
        return token;
      });

      // 7. Extract standalone \ce{...} (Chemistry equations)
      processed = processed.replace(/(?<![\$\\])\\ce\{([^{}]+(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, chem) => {
        const token = `KATEXMATHINLINE${tokenCounter++}END`;
        mathItems.push({
          token,
          math: `\\ce{${chem}}`,
          isBlock: false,
        });
        return token;
      });

      // 8. Extract inline math $...$
      processed = processed.replace(
        /(?<!\\|\$)\$([^\s\$](?:[^\$\n\r]*?[^\s\$])?)\$(?!\$)/g,
        (match, math) => {
          const trimmed = math.trim();
          if (!trimmed) {
            return match;
          }
          const token = `KATEXMATHINLINE${tokenCounter++}END`;
          mathItems.push({
            token,
            math: trimmed,
            isBlock: false,
          });
          return token;
        }
      );

      // 9. Streaming In-Flight Math Auto-Closer:
      const doubleDollarCount = (processed.match(/\$\$/g) || []).length;
      if (doubleDollarCount % 2 !== 0) {
        processed += '\n$$';
      }

      // 10. Auto-separate formulas accidentally fused with English sentences in remaining text:
      // e.g. \text{Area} = \frac{1}{2} \Take a deep breath -> \text{Area} = \frac{1}{2} \n\nTake a deep breath
      processed = processed.replace(
        /(\\(?:text|frac|sqrt|vec|mathrm|mathbf)\{[^}]+\}[^.!?\n]*?=\s*(?:\\frac\{[^}]+\}\{[^}]+\}|\d+(?:\/\d+)?))\s*\\?([A-Z][a-z]+)/g,
        '$1\n\n$2'
      );

      // 11. Fix stray backslashes before regular conversational English words in prose
      processed = processed.replace(/\\([A-Za-z]+)(\s+)/g, (match, cmd, trailingSpace) => {
        if (KNOWN_LATEX_COMMANDS.has(cmd)) {
          return match;
        }
        return `${cmd}${trailingSpace}`;
      });

      // 12. Wrap raw LaTeX display equations on their own lines missing $$ delimiters:
      // e.g. \text{Area}_{\text{top}} = \frac{1}{2} \times (\text{Top} + \text{Bottom}) \times \text{Height}
      const rawLines = processed.split('\n');
      processed = rawLines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (/^KATEXMATH/.test(trimmed)) return line;
          if (/^[#*>\-|]/.test(trimmed)) return line;
          if (/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/.test(trimmed)) return line;
          if (/[!?]/.test(trimmed)) return line;

          const hasLatex = /\\(text|frac|sqrt|vec|mathbf|mathrm|times|cdot|pm|approx|left|right|sum|int|lim)/.test(
            trimmed
          );
          if (!hasLatex) return line;

          const startsMath = /^(\\text\{|\\frac\{|\\sqrt\{|\\vec\{|\\mathbf\{|\\mathrm\{|\\displaystyle|[a-zA-Z\\][a-zA-Z0-9_{}\\]*\s*=)/.test(
            trimmed
          );
          if (startsMath) {
            const token = `KATEXMATHBLOCK${tokenCounter++}END`;
            mathItems.push({
              token,
              math: trimmed,
              isBlock: true,
            });
            return line.replace(trimmed, token);
          }
          return line;
        })
        .join('\n');

      // 13. Auto-wrap naked standalone math symbols in PROSE ONLY (all real math delimiters were already extracted)
      processed = processed.replace(
        /(?<![A-Za-z0-9\\])\\(rightarrow|leftarrow|leftrightarrow|implies|iff)(?![A-Za-z])/g,
        (_, sym) => {
          const token = `KATEXMATHINLINE${tokenCounter++}END`;
          mathItems.push({
            token,
            math: `\\${sym}`,
            isBlock: false,
          });
          return token;
        }
      );

      // 14. Auto-wrap naked fractions in prose
      processed = processed.replace(/(?<![A-Za-z0-9\\])\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, num, den) => {
        const token = `KATEXMATHINLINE${tokenCounter++}END`;
        mathItems.push({
          token,
          math: `\\frac{${num}}{${den}}`,
          isBlock: false,
        });
        return token;
      });

      // 15. Parse standard markdown with marked
      marked.setOptions({
        gfm: true,
        breaks: true,
      });
      let html = marked.parse(processed) as string;

      // 16. Re-inject KaTeX rendered math with auto-healing
      for (const item of mathItems) {
        const renderedMath = renderMathWithHealing(item.math, item.isBlock);

        if (item.isBlock) {
          // If marked wrapped our block token inside a <p>...</p>, replace the paragraph cleanly
          const pRegex = new RegExp(`<p>\\s*${item.token}\\s*<\\/p>`, 'g');
          const blockHtml = `<div class="katex-display-wrapper my-2.5 overflow-x-auto py-2 px-3 rounded-xl bg-zinc-900/70 border border-zinc-800 text-cyan-200">${renderedMath}</div>`;
          if (pRegex.test(html)) {
            html = html.replace(pRegex, blockHtml);
          } else {
            html = html.split(item.token).join(blockHtml);
          }
        } else {
          // Inline math with clean dark-mode styling
          const inlineHtml = `<span class="katex-inline-wrapper font-medium text-cyan-200">${renderedMath}</span>`;
          html = html.split(item.token).join(inlineHtml);
        }
      }

      // 17. Enhance <pre><code ...>...</code></pre> blocks with language tag, Run/Check button, Download button & Copy button
      html = html.replace(
        /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
        (_, lang, codeInner) => {
          const rawLang = (lang || '').trim();
          const normalizedLang = rawLang.toLowerCase().split(/\s+/)[0];
          const safeLang = escapeHtml(rawLang || 'code');
          const safeLangAttr = escapeHtml(rawLang);
          const isJson = normalizedLang === 'json' || normalizedLang === 'jsonc';
          const isRunnable = !isJson && getOneCompilerTarget(rawLang, '') !== null;
          const isCanvasable = CANVAS_LANGUAGES.has(normalizedLang);

          const canvasBtnHtml = isCanvasable
            ? `<button type="button" data-open-canvas="1" data-lang="${safeLangAttr}" title="Preview in Interactive Canvas" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-900/50 hover:bg-cyan-800/70 border border-cyan-600/50 text-cyan-200 transition-colors cursor-pointer"><span class="inline-flex items-center">${PLAY_ICON_HTML}</span><span>Canvas</span></button>`
            : '';

          const actionBtnHtml = isRunnable
            ? `<button type="button" data-run-code="1" data-lang="${safeLangAttr}" title="Run in OneCompiler" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-900/50 hover:bg-emerald-800/70 border border-emerald-700/50 text-emerald-300 transition-colors cursor-pointer"><span class="inline-flex items-center">${PLAY_ICON_HTML}</span><span>Run</span></button>`
            : isJson
            ? `<button type="button" data-validate-json="1" title="Check JSON syntax" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-900/40 hover:bg-amber-800/60 border border-amber-700/50 text-amber-300 transition-colors cursor-pointer"><span class="inline-flex items-center">${JSON_CHECK_ICON_HTML}</span><span>Check</span></button>`
            : '';

          const jsonStatusHtml = isJson ? `<div data-json-status class="hidden"></div>` : '';

          return `<div class="sol-code-block my-3 rounded-xl border border-zinc-800 bg-[#09090b] overflow-hidden"><div class="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800 text-[11px] font-mono text-zinc-400"><span>${safeLang}</span><div class="flex items-center gap-1.5">${canvasBtnHtml}${actionBtnHtml}<button type="button" data-download-code="1" data-lang="${safeLangAttr}" title="Download code" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"><span data-download-icon class="inline-flex items-center">${DOWNLOAD_ICON_HTML}</span><span data-download-label>Download</span></button><button type="button" data-copy-code="1" class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"><span data-copy-label>Copy</span></button></div></div>${jsonStatusHtml}<pre class="!my-0 !border-0 !rounded-none"><code>${codeInner}</code></pre></div>`;
        }
      );

      // 18. Turn inline [1], [2] citation markers into clickable badges when sources exist
      if (sources && sources.length > 0) {
        const byId = new Map<number, SourceItem>();
        sources.forEach((s, idx) => {
          byId.set(s.id || idx + 1, s);
        });
        html = html.replace(/\[(\d{1,2})\](?!\()/g, (full, numStr) => {
          const num = parseInt(numStr, 10);
          const src = byId.get(num);
          if (!src) return full;
          return `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(src.title)}" class="inline-flex items-center justify-center px-1.5 py-0.2 mx-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 hover:text-white hover:bg-cyan-700/60 text-[10px] font-mono font-semibold align-baseline no-underline transition-colors">[${num}]</a>`;
        });
      }

      return html;
    } catch (e) {
      console.error('Markdown & KaTeX parse error:', e);
      try {
        return marked.parse(content) as string;
      } catch (_) {
        return content;
      }
    }
  }, [content, sources]);

  const levelClass =
    textSizeLevel === 3
      ? 'study-prose-level-3'
      : textSizeLevel === 2
      ? 'study-prose-level-2'
      : 'study-prose-level-1';

  return (
    <>
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className={`study-prose ${levelClass} leading-relaxed break-words`}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
      {runnerTarget !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6"
          onClick={() => setRunnerTarget(null)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-[#09090b] shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800">
              <div className="flex items-center gap-2 min-w-0 text-xs font-mono text-zinc-200">
                <Play size={13} className="text-emerald-400 fill-current shrink-0" />
                <span className="truncate">OneCompiler · {runnerTarget.langLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => postPopulateAndRun(runnerTarget)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors cursor-pointer"
                >
                  <RefreshCw size={12} />
                  <span>Re-sync Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(runnerTarget.code)
                      .then(() => {
                        setModalCopied(true);
                        window.setTimeout(() => setModalCopied(false), 1600);
                      })
                      .catch(() => {});
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors cursor-pointer"
                >
                  {modalCopied ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRunnerTarget(null)}
                  title="Close"
                  aria-label="Close"
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <iframe
              ref={ocIframeRef}
              title="OneCompiler Runner"
              src={`https://onecompiler.com/embed/${runnerTarget.slug}?theme=dark&listenToEvents=true&codeChangeEvent=true&hideTitle=true&hideNew=true&hideNewFileOption=true`}
              onLoad={handleIframeLoad}
              className="w-full h-[70vh] min-h-[420px] bg-[#09090b] border-0"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>
      )}
    </>
  );
};
