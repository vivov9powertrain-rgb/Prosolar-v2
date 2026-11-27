import React, { useMemo, useRef, useCallback } from 'react';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/contrib/mhchem';
import type { SourceItem } from '../types';

interface MarkdownRendererProps {
  content: string;
  textSizeLevel?: number;
  sources?: SourceItem[];
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

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, textSizeLevel = 1, sources }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const btn = (e.target as HTMLElement | null)?.closest('button[data-copy-code="1"]') as HTMLButtonElement | null;
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
  }, []);

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

      // 17. Enhance <pre><code ...>...</code></pre> blocks with language tag & Copy button
      html = html.replace(
        /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
        (_, lang, codeInner) => {
          const safeLang = escapeHtml((lang || 'code').trim());
          return `<div class="sol-code-block my-3 rounded-xl border border-zinc-800 bg-[#09090b] overflow-hidden"><div class="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800 text-[11px] font-mono text-zinc-400"><span>${safeLang}</span><button type="button" data-copy-code="1" class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"><span data-copy-label>Copy</span></button></div><pre class="!my-0 !border-0 !rounded-none"><code>${codeInner}</code></pre></div>`;
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
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`study-prose ${levelClass} leading-relaxed break-words`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};
