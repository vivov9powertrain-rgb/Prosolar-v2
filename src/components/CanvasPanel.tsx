import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Play,
  Edit3,
  RefreshCw,
  Download,
  Maximize2,
  Copy,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';

interface CanvasPanelProps {
  code: string;
  language: string;
  accentColor?: string;
  onClose: () => void;
  onChangeCode: (newCode: string) => void;
  onFixError: (errorText: string, currentCode: string) => void;
}

const ERROR_CATCHER_SCRIPT = `
<script>
  (function() {
    function sendErr(msg) {
      try {
        window.parent.postMessage({ type: 'PROSOLAR_CANVAS_ERROR', message: String(msg) }, '*');
      } catch (_) {}
    }
    window.addEventListener('error', function(e) {
      var loc = e.lineno ? ' (line ' + e.lineno + ')' : '';
      sendErr((e.message || 'Script error') + loc);
    });
    window.addEventListener('unhandledrejection', function(e) {
      var reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
      sendErr('Unhandled Promise: ' + reason);
    });
    var origErr = console.error;
    console.error = function() {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        try {
          parts.push(typeof a === 'object' ? JSON.stringify(a) : String(a));
        } catch (_) {
          parts.push(String(a));
        }
      }
      sendErr(parts.join(' '));
      if (origErr) origErr.apply(console, arguments);
    };
  })();
</script>`;

function buildSrcDoc(rawCode: string, language: string): string {
  const lang = language.toLowerCase();

  if (lang === 'svg') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${ERROR_CATCHER_SCRIPT}
  <style>
    html, body { margin: 0; height: 100%; background: #09090b; display: grid; place-items: center; overflow: auto; }
    svg { max-width: 95vw; max-height: 95vh; }
  </style>
</head>
<body>${rawCode}</body>
</html>`;
  }

  if (lang === 'jsx' || lang === 'tsx' || lang === 'react') {
    const safeCode = JSON.stringify(rawCode);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${ERROR_CATCHER_SCRIPT}
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
      "three": "https://esm.sh/three@0.170.0",
      "lucide-react": "https://esm.sh/lucide-react@0.460.0?external=react"
    }
  }
  </script>
  <style>html, body, #root { margin: 0; min-height: 100%; background: #09090b; color: #f4f4f5; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    try {
      const source = ${safeCode};
      const transformed = Babel.transform(source, {
        presets: ['react', 'typescript'],
        filename: 'App.tsx'
      }).code;
      const blob = new Blob([transformed], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const mod = await import(url);
      URL.revokeObjectURL(url);
      const Comp = mod.default || mod.App || Object.values(mod).find(v => typeof v === 'function');
      if (!Comp) throw new Error('No default or App React component exported.');
      createRoot(document.getElementById('root')).render(React.createElement(Comp));
    } catch (err) {
      console.error(err && err.message ? err.message : String(err));
    }
  </script>
</body>
</html>`;
  }

  // Standard HTML / Three.js single-file document
  if (/<head[\s>]/i.test(rawCode)) {
    return rawCode.replace(/<head([^>]*)>/i, `<head$1>${ERROR_CATCHER_SCRIPT}`);
  }
  if (/<html[\s>]/i.test(rawCode)) {
    return rawCode.replace(/<html([^>]*)>/i, `<html$1><head>${ERROR_CATCHER_SCRIPT}</head>`);
  }
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${ERROR_CATCHER_SCRIPT}
  <style>html, body { margin: 0; padding: 0; background: #09090b; color: #f4f4f5; font-family: system-ui, sans-serif; }</style>
</head>
<body>
${rawCode}
</body>
</html>`;
}

export const CanvasPanel: React.FC<CanvasPanelProps> = ({
  code,
  language,
  accentColor = '#22d3ee',
  onClose,
  onChangeCode,
  onFixError,
}) => {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [runId, setRunId] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setErrors([]);
  }, [code, language, runId]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === 'PROSOLAR_CANVAS_ERROR' && e.data?.message) {
        setErrors((prev) =>
          prev.includes(e.data.message) ? prev : [...prev, e.data.message]
        );
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const srcDoc = useMemo(() => buildSrcDoc(code, language), [code, language]);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  const handleDownload = () => {
    const ext = language === 'svg' ? 'svg' : 'html';
    const contentToSave = language === 'svg' ? code : srcDoc;
    const blob = new Blob([contentToSave], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prosolar-canvas-${Date.now()}.${ext}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <aside
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-[#09090b] text-zinc-100'
          : 'fixed inset-0 z-40 lg:static lg:z-auto w-full lg:w-[50%] xl:w-[52%] h-full flex flex-col bg-[#09090b] border-l border-zinc-800 text-zinc-100 shrink-0'
      }
    >
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900/90 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 font-mono text-[10px] uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {language || 'html'}
          </span>
          <div className="flex items-center rounded-lg bg-zinc-950 border border-zinc-800 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setTab('preview')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                tab === 'preview'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Play className="w-3 h-3" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('code')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                tab === 'code'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              <span>Code</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setRunId((n) => n + 1)}
            title="Reload preview"
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy code"
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            title="Download file"
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close Canvas"
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/70 text-zinc-300 hover:text-rose-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative bg-black">
        {tab === 'preview' ? (
          <iframe
            key={runId}
            ref={iframeRef}
            title="Prosolar Interactive Canvas"
            srcDoc={srcDoc}
            // IMPORTANT: No allow-same-origin so untrusted code cannot touch localStorage API keys
            sandbox="allow-scripts allow-modals allow-pointer-lock"
            className="w-full h-full border-0 bg-[#09090b]"
          />
        ) : (
          <textarea
            value={code}
            onChange={(e) => onChangeCode(e.target.value)}
            spellCheck={false}
            className="w-full h-full p-4 bg-[#09090b] text-emerald-300 font-mono text-xs leading-relaxed resize-none focus:outline-none"
          />
        )}
      </div>

      {/* Runtime Error Bar */}
      {errors.length > 0 && (
        <div className="shrink-0 px-3 py-2 bg-rose-950/80 border-t border-rose-800/70 flex items-center justify-between gap-2 text-xs text-rose-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="font-mono text-[11px] truncate">
              {errors[errors.length - 1]}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onFixError(errors.join('\n'), code)}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold cursor-pointer"
          >
            Fix with AI
          </button>
        </div>
      )}
    </aside>
  );
};
