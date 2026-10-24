'use strict';
const { BrowserWindow, screen } = require('electron');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// The logo card shown while the codec host and the editor start, like a desktop editor's splash screen.
// It is a self-contained page (inline logo, no scripts, no network) in a sandboxed, frameless window.
const MIN_VISIBLE_MS = 1200;

function splashPage(version) {
  const logo = readFileSync(path.join(__dirname, 'assets', 'rigstick.png')).toString('base64');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>RigStick</title><style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; user-select: none; }
  body { font: 13px/1.4 "Segoe UI", system-ui, -apple-system, sans-serif; color: #f4f5f7; -webkit-app-region: drag; }
  .card { position: absolute; inset: 0; border-radius: 14px; overflow: hidden;
    background: radial-gradient(120% 90% at 85% 10%, #3b2214 0%, #14161d 55%, #0c0d12 100%);
    border: 1px solid #2a2d36; display: grid; grid-template-columns: 220px 1fr; align-items: center; }
  .art { display: grid; place-items: center; height: 100%; }
  .art img { width: 176px; height: 176px; filter: drop-shadow(0 18px 30px rgba(255, 106, 26, .28)); }
  .text { padding-right: 36px; }
  h1 { margin: 0; font-size: 44px; font-weight: 800; letter-spacing: -1px; }
  h1 span { color: #ff6a1a; }
  .tag { margin: 4px 0 0; color: #a7abb6; font-size: 14px; }
  .version { margin-top: 26px; color: #7d828e; font-size: 12px; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: #1e2028; overflow: hidden; }
  .bar::after { content: ""; position: absolute; top: 0; bottom: 0; width: 34%; background: linear-gradient(90deg, transparent, #ff6a1a, transparent);
    animation: run 1.3s ease-in-out infinite; }
  .status { position: absolute; left: 24px; bottom: 16px; color: #7d828e; font-size: 12px; }
  @keyframes run { from { left: -34%; } to { left: 100%; } }
  @media (prefers-reduced-motion: reduce) { .bar::after { animation: none; left: 0; width: 100%; opacity: .5; } }
</style></head><body><div class="card">
  <div class="art"><img alt="" src="data:image/png;base64,${logo}"></div>
  <div class="text"><h1>Rig<span>Stick</span></h1><p class="tag">Stick figure animation studio</p>
    <p class="version">Version ${String(version).replace(/[^\w.+-]/g, '')}</p></div>
  <div class="status">Starting…</div><div class="bar"></div>
</div></body></html>`;
}

/** Show the splash now; `close()` hides it once it has been up long enough to read (resolves when gone). */
function showSplash({ version, icon }) {
  if (process.env.RIGSTICK_SPLASH === '0') return { close: async () => {} };
  const width = 620, height = 320, area = screen.getPrimaryDisplay().workArea;
  const splash = new BrowserWindow({
    width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2),
    frame: false, transparent: true, resizable: false, movable: true, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: false, alwaysOnTop: true, show: false, title: 'RigStick', icon,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, spellcheck: false },
  });
  const shown = Date.now();
  splash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  splash.webContents.on('will-navigate', event => event.preventDefault());
  splash.once('ready-to-show', () => { if (!splash.isDestroyed()) splash.show(); });
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashPage(version))}`).catch(() => {});
  let closing;
  return {
    close() {
      closing ||= new Promise(resolve => {
        setTimeout(() => { if (!splash.isDestroyed()) splash.destroy(); resolve(); }, Math.max(0, MIN_VISIBLE_MS - (Date.now() - shown)));
      });
      return closing;
    },
  };
}

module.exports = { showSplash, splashPage };
