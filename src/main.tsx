import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'katex/dist/katex.min.css';
import 'katex/dist/contrib/mhchem';

// Suppress benign Vite dev server WebSocket disconnect rejections
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = (reason && (reason.message || reason.stack)) || String(reason || '');
  if (msg.includes('WebSocket') || msg.includes('ws://') || msg.includes('wss://')) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
