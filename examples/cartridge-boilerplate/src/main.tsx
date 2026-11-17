import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { onHostConfig } from './sdk/mnemo-sdk';
// The default look: liquid glass on every button, field and card (see the file's header).
import './glass.css';

// Inside a Mnemosyne OS window, before the first paint: the window paints the
// ground and the page stays transparent (`html.in-host` in glass.css).
if (window.parent !== window) document.documentElement.classList.add('in-host');

// Inherit the host shell's look: the OS broadcasts its theme + LIVE design
// tokens (the user's custom accent included) on load and on every change.
// After this line, style with the shell's own variables — var(--accent),
// var(--bg-panel), var(--text-primary), var(--border-subtle), … — and the
// cartridge follows the user's theme with zero code of its own.
onHostConfig();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
