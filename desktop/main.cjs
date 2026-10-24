'use strict';
// Environment variables used the prefix STYK_ before the app's internal rename; honour them as RIGS_.
for (const [name, value] of Object.entries(process.env)) if (name.startsWith('STYK_') && !(`RIGS_${name.slice(5)}` in process.env)) process.env[`RIGS_${name.slice(5)}`] = value;
const { t, messageError, localization, normalizeLocale } = require('./localization.cjs');


const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session, clipboard, contentTracing, powerSaveBlocker } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { mkdirSync, existsSync } = require('node:fs');
const { startDesktopHost } = require('./web-host.cjs');
const { applyGpuSwitches, relaunchOnX11 } = require('./gpu-switches.cjs');
const { readHardwareSync, writeHardware, applyGpuPreference, hardwareInfo } = require('./hardware.cjs');
const { McpHost, clientConfigs } = require('./mcp-server.cjs');
const { WhisperService } = require('./whisper-service.cjs');
const { readImage, VideoJobs } = require('./ai-media.cjs');
const { RecoveryStore, atomicWrite } = require('./recovery.cjs');
const { FileStreams } = require('./file-streams.cjs');
const { SharedClipboard } = require('./shared-clipboard.cjs');
const { workspaceDirectory } = require('./workspace-instance.cjs');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { WorkspacePreferences } = require('./preferences.cjs');
const { ExportFolder } = require('./export-folder.cjs');
const { SupportService } = require('./support.cjs');
const { ProjectFiles } = require('./project-files.cjs');
const { FontService } = require('./font-service.cjs');
const { VideoExportService } = require('./video-export-service.cjs');
const { AudioService } = require('./audio-service.cjs');
const { VfwExportService } = require('./vfw-export-service.cjs');
const { RecentFiles } = require('./recent-files.cjs');
const { showSplash } = require('./splash.cjs');
const { ProjectLibrary } = require('./project-library.cjs');
const { LibraryStore } = require('./library-store.cjs');
const { PresetStore } = require('./preset-store.cjs');
const { TelemetryService } = require('./telemetry.cjs');
const { UpdateService, updateAvailabilityDetails } = require('./updates.cjs');
const releaseInfo = require('./release-info.json');
const getReleaseHistory = require('./release-history.cjs').createReleaseHistory();
let telemetryBuild = {};
try { telemetryBuild = require('./telemetry-build.json'); } catch { /* Unpackaged/older source has unknown build metadata. */ }
const { RELEASES_URL, DONATE_URL, STORE_APP_URL, STORE_WEB_URL } = require('./release-links.cjs');

// On Wayland the window cannot show WebGPU content, and Chromium picks its display
// backend before this file runs, so start again under XWayland (gpu-switches.cjs).
if (relaunchOnX11(app)) return;

const APP_ROOT = path.resolve(__dirname, '..');
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const fileFilters = () => [
  { name: t('desktop.main.animationAndStickFigures'), extensions: ['rigs', 'rigsmov', 'styk', 'stykmov', 'stkz', 'piv', 'stk', 'json', 'nodes', 'nodemc', 'stknds', 'zip'] },
  { name: t('desktop.main.rigstickMovieclip'), extensions: ['rigsmov', 'stykmov'] },
  { name: t('desktop.main.rigstickFigure'), extensions: ['stkz'] },
  { name: t('desktop.main.pivotAnimation'), extensions: ['piv'] },
  { name: t('desktop.main.pivotStickFigure'), extensions: ['stk'] },
  { name: t('desktop.main.rigstickProject'), extensions: ['rigs', 'styk', 'json'] },
];
let window;
// The logo card shown from launch until the editor window is ready.
let splash = null;
let backend;
// Per-launch secret required by the loopback codec API; never persisted.
const apiToken = randomBytes(32).toString('hex');
let fileStreams;
let videoExports;
let audioImports;
let vfwExports;
let recentFiles;
// RigStick AI: the MCP server and on-device Whisper.
let mcp;
let whisper;
let whisperJob = null;
let aiSequence = 0;
const aiPending = new Map();
let projectLibrary;
let library;
// The person's .rigset / .rigobject files (Documents/RigStick/Presets): My presets in the Library.
let presetStore;
let telemetry;
let telemetryReady;
let telemetryClosed = false;
let updates;
let startupShown = false;
let traceRunning = false;
let pageLoaded = false;
let pendingProtocol = process.argv.find(value => /^rigstick:\/\//i.test(value));
function handleProtocol(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'rigstick:' || url.username || url.password || url.search || url.hash || url.port) return false;
    const root = ['', '/'].includes(url.pathname);
    if (!(root && ['open', 'privacy'].includes(url.hostname))) return false;
    if (!window || !pageLoaded) { pendingProtocol = value; return true; }
    if (window.isMinimized()) window.restore(); window.show(); window.focus();
    if (url.hostname === 'privacy') sendAction('privacy');
    return true;
  } catch { return false; }
}
const projectFiles = new ProjectFiles();
// What the window holds (several projects, one in front): `name` is the project in front, `dirty` is true while
// any open project has unsaved changes, `unsaved` counts them and `unsavedName` names one of them.
let documentState = { name: 'Untitled', dirty: false, unsaved: 0, unsavedName: '' };
let quitting = false;
let pendingFiles = process.argv.slice(app.isPackaged ? 1 : 2).filter((arg) => /\.(rigs|rigsmov|piv|stk|styk|stkz|stykmov|json|nodes|nodemc|stknds|zip)$/i.test(arg));

// Windows and macOS use Chromium's normal driver allowlist. Linux needs the
// Vulkan WebGPU opt-in to reach the GPU; see gpu-switches.cjs.
applyGpuSwitches(app.commandLine);

app.setName('RigStick');
const profileDirectory = process.env.RIGS_USER_DATA_DIR || (!app.isPackaged ? path.join(APP_ROOT, '.desktop-data') : null);
if (profileDirectory) {
  mkdirSync(profileDirectory, { recursive: true });
  app.setPath('userData', profileDirectory);
  app.setPath('sessionData', profileDirectory);
  app.setPath('crashDumps', path.join(profileDirectory, 'crashes'));
}
const primaryInstance = app.requestSingleInstanceLock();
const instanceDirectory = primaryInstance ? app.getPath('userData') : workspaceDirectory(app.getPath('userData'));
if (!primaryInstance) {
  mkdirSync(instanceDirectory, {recursive: true});
  app.setPath('sessionData', instanceDirectory);
  app.setPath('crashDumps', path.join(instanceDirectory, 'crashes'));
}
// Settings → Hardware (hardware.cjs): draw on the dedicated graphics card unless the person chose Windows' default.
// Chromium reads the switch before the app is ready, so a change applies after a restart.
const hardware = readHardwareSync(app.getPath('userData'));
const appliedGpu = applyGpuPreference(app.commandLine, hardware);
if (!primaryInstance && pendingProtocol) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    // Each ordinary launch owns its project. Protocol links still target the
    // primary workspace without opening an extra editor.
    for (const value of argv.filter(arg => /^rigstick:\/\//i.test(arg))) handleProtocol(value);
  });
  app.on('open-url', (event, url) => { event.preventDefault(); handleProtocol(url); });
  app.on('open-file', (event, file) => { event.preventDefault(); queueOpenFile(file); });
  app.whenReady().then(start).catch(async (error) => {
    await splash?.close();
    dialog.showErrorBox(t('desktop.main.rigstickCouldNotStart'), error.message);
    app.quit();
  });
}

function trusted(event) {
  const url = event.senderFrame?.url || '';
  if (!window || event.sender !== window.webContents || !backend || new URL(url).origin !== backend.origin) {
    throw messageError(new Error(''), 'desktop.main.errors.thisOperationIsRestrictedToTheRigStickWorkspace', {});
  }
}

function handle(channel, listener) {
  ipcMain.handle(channel, async (...args) => {
    try { return await listener(...args); }
    catch (error) {
      // Electron only carries an Error's text across invoke; translate at that boundary.
      if (error?.messageKey) { const visible = new Error(t(error.messageKey, error.messageParams), {cause: error}); visible.name = error.name; throw visible; }
      throw error;
    }
  });
}

function sendAction(action) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send('rigs:menu-action', action);
}

function windowState() {
  return { maximized: window?.isMaximized() || false, fullscreen: window?.isFullScreen() || false, focused: window?.isFocused() || false };
}

function nativeMenu() {
  // Editor shortcuts belong to the renderer's customizable, focus-aware dispatcher.
  // Native accelerators would intercept disabled/reassigned keys and text editing.
  const item = (label, action) => ({ label, click: () => sendAction(action) });
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: t('desktop.main.file'), submenu: [
      item(t('menu.newAnimation'), 'new'),
      item(t('desktop.main.newWindow'), 'new-window'),
      item(t('menu.openProject'), 'open'),
      { type: 'separator' },
      item(t('common.save'), 'save'),
      item(t('common.saveAs'), 'save-as'),
      item(t('desktop.main.saveFigure'), 'export-stkz'),
      item(t('common.export'), 'export'),
      { type: 'separator' },
      process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
    ] },
    { label: t('desktop.main.edit'), submenu: [
      item(t('common.undo'), 'undo'), item(t('common.redo'), 'redo'),
      { type: 'separator' },
      item(t('common.cut'), 'cut'), item(t('common.copy'), 'copy'), item(t('common.paste'), 'paste'),
      item(t('common.duplicate'), 'duplicate'), item(t('common.delete'), 'delete'),
      { type: 'separator' }, item(t('desktop.main.selectAll'), 'select-all'),
    ] },
    { label: t('desktop.main.animation'), submenu: [
      item(t('desktop.main.playPause'), 'play'), item(t('timeline.addFrame'), 'add-frame'),
      item(t('desktop.main.previousFrame'), 'previous-frame'), item(t('desktop.main.nextFrame'), 'next-frame'),
      { type: 'separator' }, item(t('timeline.onion'), 'toggle-onion'),
    ] },
    { label: t('desktop.main.view'), submenu: [
      item(t('desktop.main.zoomIn'), 'zoom-in'), item(t('desktop.main.zoomOut'), 'zoom-out'),
      item(t('desktop.main.fitCanvas'), 'zoom-reset'), { type: 'separator' }, { role: 'togglefullscreen', accelerator: '' },
      ...(!app.isPackaged ? [{ role: 'toggleDevTools', accelerator: '' }] : []),
    ] },
    { label: t('desktop.main.help'), submenu: [item(t('menu.shortcuts'), 'help'), item(t('desktop.main.checkForUpdates'), 'check-updates'), item(t('desktop.main.whatSNew'), 'release-notes'), ...(DONATE_URL ? [item(t('desktop.main.supportDevelopment'), 'donate')] : []), item(t('desktop.main.aboutRigStick'), 'about')] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function readImportFile(file) {
  const started = performance.now();
  const extension = path.extname(file).toLowerCase();
  if (!['.rigs', '.rigsmov', '.styk', '.stykmov', '.piv', '.stk', '.stkz', '.json', '.nodes', '.nodemc', '.stknds', '.zip'].includes(extension)) throw messageError(new Error(''), 'desktop.main.errors.chooseARigStickPivotOrStickNodesFile', {});
  const limit = ['.rigs', '.rigsmov', '.styk', '.stykmov', '.stkz', '.json'].includes(extension) ? MAX_FILE_BYTES : 128 * 1024 * 1024;
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw messageError(new Error(''), 'desktop.main.errors.chooseAnAnimationOrStickFigureFile', {});
  if (stat.size > limit) throw messageError(new Error(''), 'desktop.main.errors.thisFileExceedsTheValueMBImportLimit', {value: limit / 1024 / 1024});
  const bytes = await fs.readFile(file);
  if (bytes.length > limit) throw messageError(new Error(''), 'desktop.main.errors.thisFileGrewPastTheImportLimitWhileBeingRead', {});
  app.addRecentDocument(file);
  await rememberRecent(file);
  // The renderer transfers these compact source bytes to its import worker.
  // Expanded JSON is never parsed or transported through Electron main.
  return {
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    filename: path.basename(file),
    nativePath: file,
    openToken: projectFiles.rememberOpen(path.resolve(file)),
    kind: extension === '.stykmov' || extension === '.rigsmov' ? 'rigsmov' : extension === '.stkz' ? 'stkz' : extension === '.stk' ? 'stk' : extension === '.piv' ? 'piv' : 'rigs',
    sourceBytes: bytes.length,
    timings: { native_read_ms: +(performance.now() - started).toFixed(3) },
  };
}

async function rememberRecent(file) {
  if (!recentFiles || !/\.(rigs|rigsmov|piv|stk|styk|stkz|stykmov|json|nodes|nodemc|stknds|zip)$/i.test(file)) return;
  // A damaged preferences directory must not turn a completed save into failure.
  try { await recentFiles.remember(path.resolve(file)); }
  catch (error) { console.warn('Recent files could not be updated:', error.message); }
  // Home's project list (desktop/project-library.cjs) follows the same opens and saves.
  try { await projectLibrary?.remember(path.resolve(file)); }
  catch (error) { console.warn('The project list could not be updated:', error.message); }
}

async function queueOpenFile(file) {
  if (!window || !backend || !pageLoaded) { pendingFiles.push(file); return; }
  try { window.webContents.send('rigs:file-opened', await readImportFile(file)); }
  catch (error) { dialog.showErrorBox(t('desktop.main.unableToOpenFile'), error.message); }
}

// loadURL resolves around did-finish-load while webContents.isLoading() may
// still report true, so opens queued here must be flushed by the load events
// rather than a one-shot drain. did-finish-load also guarantees the renderer's
// module scripts ran, so its onOpenFile/menu-action listeners are registered.
async function flushPendingOpens() {
  if (pendingProtocol) { const value = pendingProtocol; pendingProtocol = null; handleProtocol(value); }
  const files = pendingFiles.splice(0);
  for (const file of files) await queueOpenFile(file);
}

function documentActionCurrent(checkpoint) {
  return checkpoint === undefined || Boolean(checkpoint && typeof checkpoint.revision === 'string' &&
    typeof checkpoint.saved === 'boolean' && checkpoint.revision === documentState.revision &&
    (!checkpoint.saved || !documentState.dirty));
}

/** The question asked before unsaved work is closed: one project by its name, several by their count. */
function unsavedPrompt({ restart = false } = {}) {
  const several = documentState.unsaved > 1;
  return {
    message: several ? t('desktop.main.saveChangesToProjects', {count: documentState.unsaved})
      : t('desktop.main.saveChangesToName', {name: documentState.unsavedName || documentState.name}),
    several,
    buttons: several
      ? [t(restart ? 'desktop.main.saveAllAndRestart' : 'desktop.main.saveAll'), t('desktop.main.cancel'), t(restart ? 'desktop.main.discardAllAndRestart' : 'desktop.main.discardAll')]
      : [t(restart ? 'desktop.main.saveAndRestart' : 'common.save'), t('desktop.main.cancel'), t(restart ? 'desktop.main.discardAndRestart' : 'desktop.main.discard')],
  };
}

/** Runs an editor tool in the workspace window (src/ai/ai-tools.mjs) and resolves to its MCP content. */
async function callEditor(tool, args) {
  // Images an AI names by path or URL are read here (images only, size-capped) and handed over as bytes.
  if (tool === 'rigstick_add_image' && !args.data) { const image = await readImage(args); if (image) args = {...args, ...image, path: undefined, url: undefined}; }
  if (tool === 'rigstick_build_scene' && Array.isArray(args.cast)) args = {...args, cast: await Promise.all(args.cast.map(async member =>
    member?.kind === 'image' && !member.data ? (async image => ({...member, data: image?.data, fileName: image?.name, path: undefined, url: undefined}))(await readImage(member)) : member))};
  if (!window || window.isDestroyed() || !pageLoaded) throw new Error('The RigStick window is not ready. Open RigStick and try again.');
  const id = ++aiSequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { aiPending.delete(id); reject(new Error('RigStick did not answer in time.')); }, 120000);
    aiPending.set(id, {resolve, reject, timer});
    window.webContents.send('rigstick:ai-call', {id, tool, args});
  });
}
const sendToWindow = (channel, value) => { if (window && !window.isDestroyed()) window.webContents.send(channel, value); };
function mcpStatus() {
  const status = mcp.status();
  const stdioScript = app.isPackaged ? path.join(process.resourcesPath, 'app.asar', 'desktop', 'mcp-stdio.cjs') : path.join(__dirname, 'mcp-stdio.cjs');
  return {...status, configs: status.url ? clientConfigs({url: status.url, token: status.token, executable: process.execPath, stdioScript, profile: app.getPath('userData')}) : null};
}

// The export dialog's "Save to" folder: exports write straight into it instead of asking where to save.
// Module scope: registerRigStickIpc() creates it, and registerIpc()'s file and video save handlers use it too.
let exportFolder = null;
/** Where an export saves: a fresh name in the "Save to" folder when one is chosen, else the save dialog's choice (null if cancelled). */
async function exportDestination(options, dialogOptions) {
  if (options?.useExportFolder === true && exportFolder) {
    const destination = await exportFolder.destination(path.basename(String(options.defaultPath || dialogOptions.defaultPath)));
    if (destination) return destination;
  }
  const result = await dialog.showSaveDialog(window, {...dialogOptions, properties: ['createDirectory', 'showOverwriteConfirmation']});
  return result.canceled || !result.filePath ? null : result.filePath;
}

function registerRigStickIpc() {
  mcp = new McpHost({directory: app.getPath('userData'), version: app.getVersion(), callEditor,
    onActivity: entry => sendToWindow('rigstick:mcp-activity', entry)});
  handle('rigstick:mcp-status', event => { trusted(event); return mcpStatus(); });
  handle('rigstick:mcp-set-enabled', async (event, enabled) => { trusted(event); await mcp.setEnabled(enabled === true); return mcpStatus(); });
  handle('rigstick:mcp-regenerate-token', async (event) => { trusted(event); await mcp.regenerateToken(); return mcpStatus(); });
  ipcMain.on('rigstick:ai-result', (event, value) => {
    try { trusted(event); } catch { return; }
    const pending = aiPending.get(value?.id); if (!pending) return;
    aiPending.delete(value.id); clearTimeout(pending.timer);
    if (value.error) pending.reject(new Error(String(value.error))); else pending.resolve(value.content);
  });
  exportFolder = new ExportFolder(app.getPath('userData'), {defaultFolder: path.join(app.getPath('videos'), 'RigStick')});
  handle('rigs:export-folder-get', (event) => { trusted(event); return exportFolder.get(); });
  handle('rigs:export-folder-clear', (event) => { trusted(event); return exportFolder.set(null); });
  handle('rigs:export-folder-choose', async (event) => {
    trusted(event);
    const current = await exportFolder.get();
    const result = await dialog.showOpenDialog(window, {title: t('desktop.main.chooseExportFolder'), defaultPath: current.folder || current.defaultFolder,
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']});
    if (result.canceled || !result.filePaths?.[0]) return current;
    return exportFolder.set(result.filePaths[0]);
  });
  const videoJobs = new VideoJobs({tempRoot: app.getPath('temp'), videosDir: path.join(app.getPath('videos'), 'RigStick'),
    encoder: path.join(app.isPackaged ? process.resourcesPath : path.join(APP_ROOT, 'build'), 'video-encoder', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')});
  handle('rigstick:export-begin', (event, options) => { trusted(event); return videoJobs.begin(options); });
  handle('rigstick:export-frame', (event, token, index, bytes) => { trusted(event); return videoJobs.frame(String(token), index, bytes); });
  handle('rigstick:export-finish', (event, token) => { trusted(event); return videoJobs.finish(String(token)); });
  handle('rigstick:export-cancel', (event, token) => { trusted(event); return videoJobs.cancel(String(token)); });
  handle('rigstick:export-reveal', (event, file) => { trusted(event); shell.showItemInFolder(videoJobs.rendered(file)); return true; });
  handle('rigstick:export-open', async (event, file) => { trusted(event); const error = await shell.openPath(videoJobs.rendered(file)); if (error) throw new Error(error); return true; });
  whisper = new WhisperService({root: path.join(app.getPath('userData'), 'whisper')});
  const progress = value => sendToWindow('rigstick:whisper-progress', value);
  handle('rigstick:whisper-status', event => { trusted(event); return whisper.status(); });
  handle('rigstick:whisper-prepare', async (event, model) => {
    trusted(event);
    await whisper.ensureBinary({onProgress: progress});
    await whisper.ensureModel(String(model), {onProgress: progress});
    return whisper.status();
  });
  handle('rigstick:whisper-transcribe', async (event, options) => {
    trusted(event);
    if (whisperJob) throw new Error('A transcription is already running.');
    const controller = new AbortController(); whisperJob = controller;
    try {
      const pcm = new Float32Array(options.pcm);
      return await whisper.transcribe({pcm, model: String(options.model), language: String(options.language ?? 'auto'), onProgress: progress, signal: controller.signal});
    } finally { whisperJob = null; }
  });
  handle('rigstick:whisper-cancel', event => { trusted(event); whisperJob?.abort(); return true; });
  handle('rigstick:system-stats', event => { trusted(event); return whisper.systemStats(); });
}

function registerIpc() {
  registerRigStickIpc();
  handle('rigs:update-state', event => { trusted(event); return updates.snapshot(); });
  handle('rigs:update-check', event => { trusted(event); void updates.check(); return updates.snapshot(); });
  handle('rigs:update-releases', event => { trusted(event); return shell.openExternal(RELEASES_URL); });
  handle('rigs:donate', event => { trusted(event); return shell.openExternal(DONATE_URL); });
  handle('rigs:release-history', event => { trusted(event); return getReleaseHistory(); });
  handle('rigs:open-store', async event => {
    trusted(event);
    if (process.platform === 'win32') { try { await shell.openExternal(STORE_APP_URL); return; } catch { /* no Store app: the web page */ } }
    await shell.openExternal(STORE_WEB_URL);
  });
  handle('rigs:release-info', (event, startup = false) => {
    trusted(event);
    if (startup && startupShown) return null;
    if (startup) startupShown = true;
    return { ...releaseInfo, version: app.getVersion() };
  });
  handle('rigs:update-restart', (event, checkpoint) => {
    trusted(event);
    if (!documentActionCurrent(checkpoint)) return false;
    return updates.restart(async () => {
      if (!documentActionCurrent(checkpoint)) return false;
      const revision = documentState.revision;
      if (documentState.dirty) {
        const prompt = unsavedPrompt({ restart: true });
        const answer = await dialog.showMessageBox(window, {
          type: 'question', title: t('desktop.main.restartToUpdate'), message: prompt.message,
          detail: t('desktop.main.rigstickWillCloseInstallTheDownloadedUpdateAndReopen'),
          buttons: prompt.buttons, defaultId: 0, cancelId: 1,
        });
        if (answer.response === 0) { sendAction('save-and-update'); return false; }
        if (answer.response !== 2) return false;
      }
      if (telemetry && !telemetryClosed) { await telemetry.close().catch(() => {}); telemetryClosed = true; }
      if (documentState.revision !== revision || !documentActionCurrent(checkpoint)) return false;
      quitting = true;
      return true;
    }, () => { quitting = false; });
  });
  const withTelemetry = handler => async (event, value) => { trusted(event); await telemetryReady; if (!telemetry) throw messageError(new Error(''), 'desktop.main.errors.privacySettingsAreUnavailablePleaseRestartRigStick', {}); return handler(value); };
  const support = new SupportService({ directory: app.getPath('userData'), version: app.getVersion(), development: !app.isPackaged });
  handle('rigs:support-context', event => { trusted(event); return support.context(); });
  handle('rigs:support-live', (event, id) => { trusted(event); return support.connectLive(id, value => { if (!event.sender.isDestroyed()) event.sender.send('rigs:support-live-event', value); }); });
  handle('rigs:support-live-close', (event, connection) => { trusted(event); if (Number.isSafeInteger(connection)) support.closeLive(connection); });
  app.on('browser-window-created', (_event, createdWindow) => createdWindow.on('closed', () => support.closeLive()));
  handle('rigs:support-save-state', (event, value) => { trusted(event); return support.saveState(value); });
  handle('rigs:support-request', (event, value) => { trusted(event); return support.request(value); });
  handle('rigs:support-copy-access', async event => { trusted(event); clipboard.writeText(await support.accessLink()); return { copied: true }; });
  handle('rigs:support-restore', (event, key) => { trusted(event); return support.restore(key); });
  handle('rigs:support-download', async (event, value) => {
    trusted(event);
    if (!/^[a-f0-9]{32}$/.test(value?.threadId || '') || !/^[a-f0-9]{32}$/.test(value?.fileId || '')) throw messageError(new Error(''), 'desktop.main.errors.invalidAttachment', {});
    const result = await support.request({ path: `/threads/${value.threadId}/files/${value.fileId}` });
    if (!result.ok) throw messageError(new Error(''), 'desktop.main.errors.attachmentCouldNotBeDownloaded', {});
    const encoded = /filename\*=UTF-8''([^;]+)/.exec(result.disposition)?.[1];
    let name = 'attachment'; try { if (encoded) name = path.basename(decodeURIComponent(encoded)); } catch { /* Safe fallback. */ }
    const destination = await dialog.showSaveDialog(window, { title: t('desktop.main.saveReportAttachment'), defaultPath: name });
    if (destination.canceled || !destination.filePath) return { saved: false };
    await atomicWrite(destination.filePath, Buffer.from(result.bytes)); return { saved: true };
  });
  handle('rigs:telemetry-state', withTelemetry(() => telemetry.getState()));
  handle('rigs:telemetry-consent', withTelemetry(value => telemetry.setConsent(value)));
  handle('rigs:telemetry-record', withTelemetry(value => telemetry.record(value)));
  handle('rigs:telemetry-preview', withTelemetry(() => telemetry.preview()));
  handle('rigs:telemetry-sync', withTelemetry(async () => { await telemetry.upload(); return telemetry.getState(); }));
  handle('rigs:telemetry-delete', withTelemetry(() => telemetry.deleteData()));
  handle('rigs:telemetry-feedback', withTelemetry(value => telemetry.feedback(value)));
  handle('rigs:telemetry-export', withTelemetry(async () => {
    const result = await dialog.showSaveDialog(window, { title: t('desktop.main.saveOptionalTelemetryReport'), defaultPath: 'RigStick-telemetry.json', filters: [{ name: t('desktop.main.jsonReport'), extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return { saved: false };
    await fs.writeFile(result.filePath, JSON.stringify(telemetry.preview(), null, 2), 'utf8'); return { saved: true };
  }));
  handle('rigs:service-page', withTelemetry(page => {
    const route = { home: '/', download: '/download/' }[page];
    if (!route) throw messageError(new Error(''), 'desktop.main.errors.unknownRigStickPage', {});
    if (!telemetry.siteUrl) throw messageError(new Error(''), 'desktop.main.errors.thePublicWebsiteIsNotConfiguredYetContactAleRipresoGmailCom', {});
    return shell.openExternal(telemetry.siteUrl + route);
  }));
  handle('rigs:performance-trace', async event => {
    trusted(event);
    if (traceRunning) throw messageError(new Error(''), 'desktop.main.errors.aPerformanceRecordingIsAlreadyRunning', {});
    traceRunning = true;
    let temporary;
    try {
      await contentTracing.startRecording({ included_categories: ['v8.execute', 'disabled-by-default-v8.cpu_profiler', 'devtools.timeline'], recording_mode: 'record-until-full', trace_buffer_size_in_kb: 16384 });
      await new Promise(resolve => setTimeout(resolve, !app.isPackaged && process.env.RIGS_TRACE_TEST === '1' ? 2000 : 30000));
      temporary = await contentTracing.stopRecording();
      const result = await dialog.showSaveDialog(window, { title: t('desktop.main.saveLocalPerformanceTraceReviewBeforeSharing'), defaultPath: 'RigStick-performance-trace.json', filters: [{ name: t('desktop.main.chromePerfettoTrace'), extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return { saved: false };
      await fs.copyFile(temporary, result.filePath); return { saved: true };
    } finally { traceRunning = false; if (temporary) await fs.unlink(temporary).catch(() => {}); }
  });
  for (const [channel, method] of [['list','list'], ['mkdir','createFolder'], ['thumbnail','thumbnail'], ['save-begin','beginSave'], ['write','write'], ['finish','finish'], ['cancel','cancel'], ['read-begin','beginRead'], ['read','read'], ['change','change']])
    handle(`rigs:library-${channel}`, (event, ...args) => { trusted(event); return library[method](...args); });
  handle('rigs:library-reveal', async (event, folder = '') => { trusted(event); const error = await shell.openPath(await library.folder(folder)); if (error) throw new Error(error); });
  handle('rigs:library-trash', (event, relative) => { trusted(event); return library.trash(relative, target => shell.trashItem(target)); });
  handle('rigs:library-thumbnail-cache', (event, options) => { trusted(event); return library.cacheThumbnail(options); });
  handle('rigs:presets-list', (event) => { trusted(event); return presetStore.list(); });
  handle('rigs:presets-read', (event, id) => { trusted(event); return presetStore.read(id); });
  handle('rigs:presets-save', (event, value) => { trusted(event); return presetStore.save(value ?? {}); });
  handle('rigs:presets-remove', (event, id) => { trusted(event); return presetStore.remove(id, target => shell.trashItem(target)); });
  handle('rigs:presets-reveal', async (event) => { trusted(event); const error = await shell.openPath(await presetStore.init()); if (error) throw new Error(error); });
  recentFiles = new RecentFiles({directory: app.getPath('userData'), limit: 20});
  handle('rigs:recent-list', event => { trusted(event); return recentFiles.list(); });
  handle('rigs:recent-open', async (event, id) => { trusted(event); return readImportFile(await recentFiles.resolve(id)); });
  handle('rigs:recent-clear', event => { trusted(event); return recentFiles.clear(); });
  // Home's projects (desktop/project-library.cjs): the renderer names a project by its opaque id, never by a path.
  projectLibrary = new ProjectLibrary({directory: path.join(app.getPath('userData'), 'project-library')});
  handle('rigs:projects-list', event => { trusted(event); return projectLibrary.list({open: [...projectFiles.documents.values()]}); });
  handle('rigs:projects-open', async (event, id) => { trusted(event); return readImportFile(await projectLibrary.resolve(id)); });
  handle('rigs:projects-update', (event, id, changes) => { trusted(event); return projectLibrary.update(id, changes && typeof changes === 'object' ? changes : {}); });
  handle('rigs:projects-remove', (event, id) => { trusted(event); return projectLibrary.remove(id); });
  handle('rigs:projects-reveal', async (event, id) => { trusted(event); shell.showItemInFolder(await projectLibrary.location(id)); return true; });
  handle('rigs:projects-preview', (event, id) => { trusted(event); return projectLibrary.preview(id); });
  // The picture and counts of the project in front: its save target is known here, so no path crosses the bridge.
  handle('rigs:projects-preview-set', (event, options) => {
    trusted(event);
    const document = projectFiles.requireCurrent(options?.documentToken);
    return document.filename ? projectLibrary.setPreview(document.filename, {thumbnail: options?.thumbnail, stats: options?.stats}) : {stored: false};
  });
  handle('rigs:projects-folder', (event, change) => {
    trusted(event);
    if (change?.action === 'create') return projectLibrary.createFolder(change.name);
    if (change?.action === 'rename') return projectLibrary.renameFolder(change.name, change.to);
    if (change?.action === 'delete') return projectLibrary.deleteFolder(change.name);
    throw messageError(new Error(''), 'desktop.projectLibrary.errors.unknownFolderChange', {});
  });
  handle('rigs:clipboard-text-read', event => {
    trusted(event); const text = clipboard.readText();
    if (text.length > 100) throw messageError(new Error(''), 'desktop.main.errors.theClipboardDoesNotContainAShortSegmentValue', {});
    return text;
  });
  handle('rigs:clipboard-text-write', (event, text) => {
    trusted(event);
    if (typeof text !== 'string' || text.length > 100) throw messageError(new Error(''), 'desktop.main.errors.segmentClipboardTextMustContainAtMost100Characters', {});
    clipboard.writeText(text); return true;
  });
  const encoderRoot = app.isPackaged ? process.resourcesPath : path.join(APP_ROOT, 'build');
  audioImports = new AudioService({encoderPath: path.join(encoderRoot, 'video-encoder', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), tempRoot: app.getPath('temp')});
  for (const [channel, method] of [['audio-begin','begin'],['audio-write','write'],['audio-finish','finish'],['audio-read','read'],['audio-cancel','cancel']])
    handle(`rigs:${channel}`, (event, ...args) => { trusted(event); return audioImports[method](...args); });
  videoExports = new VideoExportService({encoderPath: path.join(encoderRoot, 'video-encoder', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), tempRoot: app.getPath('temp')});
  videoExports.setEncoderPreference(hardware.videoEncoder);
  // Settings → Hardware: the graphics cards, the processor and memory, and the encoders that really work here.
  handle('rigs:hardware-get', async (event) => {
    trusted(event);
    const [info, encoders] = await Promise.all([hardwareInfo(app, os), videoExports.workingHardwareEncoders().catch(() => [])]);
    const encoder = await videoExports.hardwareEncoder().catch(() => null);
    return {choices: {...hardware}, appliedGpu, ...info, encoders: encoders.map(item => ({id: item.encoder, label: item.label})), exportEncoder: encoder?.label ?? null};
  });
  handle('rigs:hardware-set', async (event, value) => {
    trusted(event);
    Object.assign(hardware, await writeHardware(app.getPath('userData'), {...hardware, ...value}));
    videoExports.setEncoderPreference(hardware.videoEncoder);
    return {choices: {...hardware}, restart: hardware.gpu !== appliedGpu};
  });
  handle('rigs:relaunch', (event) => { trusted(event); app.relaunch(); window?.close(); });
  // An export in progress: no background throttling (a minimized window would render seconds per frame) and no sleep.
  let exportBlocker = null;
  handle('rigs:export-active', (event, active) => {
    trusted(event);
    event.sender.setBackgroundThrottling(!active);
    if (active && exportBlocker === null) exportBlocker = powerSaveBlocker.start('prevent-app-suspension');
    else if (!active && exportBlocker !== null) { powerSaveBlocker.stop(exportBlocker); exportBlocker = null; }
    return {active: Boolean(active)};
  });
  for (const [channel, method] of [
    ['video-capabilities', 'capabilities'], ['video-begin', 'begin'], ['video-frame-begin', 'beginFrame'], ['video-frame-chunk', 'writeFrameChunk'],
    ['video-frame-end', 'endFrame'], ['video-finish', 'finish'], ['video-read', 'read'], ['video-cancel', 'cancel'], ['video-audio-chunk', 'writeAudioChunk'],
  ]) handle(`rigs:${channel}`, (event, ...args) => { trusted(event); return videoExports[method](...args); });
  handle('rigs:video-save', async (event, token, options) => {
    trusted(event);
    const destination = await exportDestination(options, {title: t('desktop.main.saveVideo'), defaultPath: path.basename(String(options?.defaultPath || 'video.webm')), filters: saveFilters(options, 'webm')});
    if (!destination) { await videoExports.cancel(token).catch(() => {}); return { saved: false }; }
    return videoExports.save(token, destination);
  });
  const vfwRoot = app.isPackaged ? path.join(process.resourcesPath, 'vfw') : path.join(APP_ROOT, 'native', 'bin');
  vfwExports = new VfwExportService({helperPaths: {x86: path.join(vfwRoot, 'x86', 'rigs-vfw.exe'), x64: path.join(vfwRoot, 'x64', 'rigs-vfw.exe')}, tempRoot: app.getPath('temp')});
  for (const [channel, method] of [
    ['vfw-capabilities', 'capabilities'], ['vfw-begin', 'begin'], ['vfw-frame-begin', 'beginFrame'], ['vfw-frame-chunk', 'writeFrameChunk'],
    ['vfw-frame-end', 'endFrame'], ['vfw-finish', 'finish'], ['vfw-read', 'read'], ['vfw-cancel', 'cancel'],
  ]) handle(`rigs:${channel}`, (event, ...args) => { trusted(event); return vfwExports[method](...args); });
  handle('rigs:vfw-save', async (event, token, options) => {
    trusted(event);
    const destination = await exportDestination(options, {title: t('desktop.main.saveVideo'), defaultPath: path.basename(String(options?.defaultPath || 'video.avi')), filters: saveFilters(options, 'avi')});
    if (!destination) { await vfwExports.cancel(token).catch(() => {}); return { saved: false }; }
    return vfwExports.save(token, destination);
  });
  handle('rigs:vfw-configure', async (event, options) => {
    trusted(event); const owner = window;
    const handle = owner.getNativeWindowHandle();
    const hwnd = (handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString();
    try { return await vfwExports.configure(options, hwnd); }
    finally { if (!owner.isDestroyed()) { owner.setEnabled(true); owner.focus(); } }
  });
  const recovery = new RecoveryStore(instanceDirectory);
  const sharedClipboard = new SharedClipboard(clipboard);
  for (const [channel, method] of [['write-begin', 'beginWrite'], ['write', 'write'], ['finish', 'finish'], ['read-begin', 'beginRead'], ['read', 'read'], ['cancel', 'cancel']])
    handle(`rigs:shared-clipboard-${channel}`, (event, ...args) => { trusted(event); return sharedClipboard[method](...args); });
  app.on('will-quit', () => sharedClipboard.dispose());
  handle('rigs:new-window', event => {
    trusted(event);
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, app.isPackaged ? [] : [APP_ROOT], {detached: true, stdio: 'ignore', windowsHide: true, env: process.env});
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(true); });
    });
  });
  const preferences = new WorkspacePreferences(app.getPath('userData'));
  const editorSettings = new WorkspacePreferences(app.getPath('userData'), { filename: 'editor-settings.json' });
  // The person's effect presets (src/vfx-user-presets.mjs): their own file, so they never crowd the 16 KB settings.
  const vfxPresets = new WorkspacePreferences(app.getPath('userData'), { filename: 'vfx-presets.json', maxBytes: 1024 * 1024 });
  const fonts = new FontService();
  handle('rigs:fonts-list', event => { trusted(event); return fonts.listFonts(); });
  handle('rigs:fonts-read', async (event, id) => {
    trusted(event); const bytes = await fonts.readFont(id);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  });
  handle('rigs:workspace-preferences-get', (event) => { trusted(event); return preferences.get(); });
  handle('rigs:workspace-preferences-set', (event, value) => { trusted(event); return preferences.set(value); });
  handle('rigs:editor-settings-get', (event) => { trusted(event); return editorSettings.get(); });
  handle('rigs:editor-settings-set', async (event, value) => {
    trusted(event);
    await editorSettings.set(value);
    if (localization.setLocale(normalizeLocale(value?.locale))) nativeMenu();
    return {saved: true};
  });
  handle('rigs:vfx-presets-get', (event) => { trusted(event); return vfxPresets.get(); });
  handle('rigs:vfx-presets-set', (event, value) => { trusted(event); return vfxPresets.set(value); });
  fileStreams = new FileStreams({onCommitError:error=>telemetry?.error(error?.name||'Error','app',null,{code:error?.code||'write_failed',stage:'write'})});
  const clipboardFile = path.join(app.getPath('userData'), 'frame-clipboard.rigs');
  let clipboardWriteToken = null, clipboardControl = Promise.resolve();
  handle('rigs:clipboard-write-begin', (event, options) => {
    trusted(event); fileStreams.validateSize(options?.size);
    if (!options.size) throw messageError(new Error(''), 'desktop.main.errors.theFrameClipboardIsEmpty', {});
    const pending = clipboardControl.then(async () => {
      if (clipboardWriteToken) await fileStreams.cancel(clipboardWriteToken);
      const transfer = await fileStreams.beginWrite({destination: clipboardFile, size: options.size});
      clipboardWriteToken = transfer.token; return transfer;
    });
    clipboardControl = pending.catch(() => {}); return pending;
  });
  handle('rigs:clipboard-read-begin', async event => {
    trusted(event); const transfer = await fileStreams.beginRead(clipboardFile);
    return transfer ? {...transfer, name: 'Copied keyframes'} : null;
  });
  const projectTransfers = new Map();
  let projectRequestPending = false;
  // A save belongs to the project in front: bringing another one there ends what the previous one had in flight.
  const cancelProjectTransfers = async () => {
    const stale = [...projectTransfers.keys()];
    projectTransfers.clear();
    await Promise.all(stale.map((token) => fileStreams.cancel(token)));
  };
  // A recovery copy by the name the renderer was given (`recovery` is the single copy of earlier versions).
  // An open project's copy is never listed, so it can be neither restored twice nor discarded from under it.
  const spareRecovery = async (id) => {
    const slot = id === 'recovery' ? null : id;
    const record = typeof id === 'string' && !projectFiles.recoverySlots.has(slot) ? (await recovery.list()).find(item => item.slot === slot) : null;
    if (!record) throw messageError(new Error(''), 'desktop.recovery.errors.thisRecoveryCopyIsNoLongerAvailable', {});
    return record;
  };
  handle('rigs:document-activate', async (event, options) => {
    trusted(event);
    const restored = options?.recoveryId === undefined || options?.recoveryId === null ? undefined : (await spareRecovery(options.recoveryId)).slot;
    const document = projectFiles.activate(options || {}, { recovery: restored });
    await cancelProjectTransfers();
    return document;
  });
  handle('rigs:document-select', async (event, documentToken) => {
    trusted(event);
    const document = projectFiles.select(documentToken);
    await cancelProjectTransfers();
    return document;
  });
  handle('rigs:document-release', (event, documentToken) => { trusted(event); return projectFiles.release(documentToken); });
  handle('rigs:project-write-begin', async (event, options) => {
    trusted(event);
    fileStreams.validateSize(options?.size);
    const document = projectFiles.requireCurrent(options?.documentToken);
    for (const token of projectTransfers.keys()) if (!fileStreams.jobs.has(token)) projectTransfers.delete(token);
    if (projectRequestPending || projectTransfers.size) throw messageError(new Error(''), 'desktop.main.errors.aProjectSaveIsAlreadyInProgress', {});
    projectRequestPending = true;
    try {
      let destination = document.filename;
      if (options.saveAs || !destination) {
        const result = await dialog.showSaveDialog(window, {
          title: t(options.saveAs ? 'common.saveAs' : 'desktop.main.saveAnimation'),
          defaultPath: destination || path.basename(String(options.defaultPath || 'Untitled.rigs')),
          filters: [{ name: t('desktop.main.rigstickProject'), extensions: ['rigs'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (result.canceled || !result.filePath) return null;
        destination = projectFiles.validateDestination(result.filePath);
      }
      projectFiles.requireCurrent(document.documentToken);
      const transfer = await fileStreams.beginWrite({ destination, size: options.size, onCommit: async () => {
        // A document switch invalidates old capabilities, including pending dialogs.
        if (projectFiles.current?.documentToken === document.documentToken) projectFiles.commit(document.documentToken, destination);
        app.addRecentDocument(destination);
        await rememberRecent(destination);
      } });
      try { projectFiles.requireCurrent(document.documentToken); }
      catch (error) { await fileStreams.cancel(transfer.token); throw error; }
      projectTransfers.set(transfer.token, document.documentToken);
      return { ...transfer, filename: path.basename(destination), documentToken: document.documentToken };
    } finally { projectRequestPending = false; }
  });
  // One write at a time per recovery copy; a newer snapshot of the same project replaces the one in flight.
  const recoveryWrites = new Map();
  const cancelRecoveryWrite = async (slot) => {
    const token = recoveryWrites.get(slot);
    if (token === undefined) return;
    recoveryWrites.delete(slot);
    await fileStreams.cancel(token);
  };
  const forgetRecoveryWrite = (token) => { for (const [slot, value] of recoveryWrites) if (value === token) recoveryWrites.delete(slot); };
  let recoveryControl = Promise.resolve();
  function controlRecovery(operation) {
    const result = recoveryControl.then(operation);
    recoveryControl = result.catch(() => {});
    return result;
  }
  const saveFilters = (options, fallback = 'rigs') => (Array.isArray(options?.filters) ? options.filters.slice(0, 8).map((filter) => ({
    name: String(filter.name || 'File').slice(0, 80),
    extensions: Array.isArray(filter.extensions) ? filter.extensions.filter((ext) => /^[a-z0-9*]{1,12}$/i.test(ext)) : [],
  })).filter((filter) => filter.extensions.length) : [{ name: t('desktop.main.rigstickProject'), extensions: [fallback] }]);
  handle('rigs:file-write-begin', async (event, options) => {
    trusted(event);
    const stream = options?.stream === true;
    if (stream) fileStreams.validateStreamSize(options?.size); else fileStreams.validateSize(options?.size);
    const destination = await exportDestination(options, {title: t('desktop.main.saveAnimation'), defaultPath: path.basename(String(options.defaultPath || 'Untitled.rigs')), filters: saveFilters(options)});
    if (!destination) return null;
    return fileStreams.beginWrite({ destination, size: stream ? (options.size ?? null) : options.size, stream, onCommit: async () => {
      app.addRecentDocument(destination);
      await rememberRecent(destination);
    } });
  });
  handle('rigs:recovery-write-begin', async (event, options) => {
    trusted(event);
    fileStreams.validateSize(options?.size);
    if (!options.size) throw messageError(new Error(''), 'desktop.main.errors.recoveryDataIsEmpty', {});
    // A project's copy is named by its document; without one the write is the single copy of earlier versions.
    const slot = options.documentToken === undefined || options.documentToken === null ? null : projectFiles.require(options.documentToken).recovery;
    return controlRecovery(async () => {
      await cancelRecoveryWrite(slot);
      const result = await fileStreams.beginWrite({ destination: recovery.paths(slot).file, size: options.size, onCommit: async () => {
        await recovery.updateMetadata(options.name, slot);
        await recovery.prune(projectFiles.recoverySlots);
      } });
      recoveryWrites.set(slot, result.token);
      return result;
    });
  });
  handle('rigs:file-write-chunk', (event, token, bytes) => { trusted(event); return fileStreams.write(token, bytes); });
  handle('rigs:file-write-patch', (event, token, offset, bytes) => { trusted(event); return fileStreams.patch(token, offset, bytes); });
  handle('rigs:file-write-finish', async (event, token) => {
    trusted(event);
    const documentToken = projectTransfers.get(token);
    if (documentToken) projectFiles.requireCurrent(documentToken);
    try {
      const result = await fileStreams.finish(token);
      forgetRecoveryWrite(token);
      return documentToken ? { ...result, documentToken, filename: path.basename(result.path) } : result;
    } finally { if (!fileStreams.jobs.has(token)) projectTransfers.delete(token); }
  });
  handle('rigs:file-write-cancel', async (event, token) => {
    trusted(event);
    const result = await fileStreams.cancel(token);
    projectTransfers.delete(token);
    forgetRecoveryWrite(token);
    return result;
  });
  const describeRecovery = ({ slot, ...record }) => ({ id: slot ?? 'recovery', ...record });
  // The newest copy, whoever owns it: what a single-project caller means by "the recovery".
  handle('rigs:recovery-info', async (event) => {
    trusted(event);
    const [newest] = await recovery.list();
    if (!newest) return null;
    const { slot, ...info } = newest;
    return info;
  });
  // The copies no open project owns: what a start after a crash can offer to restore.
  handle('rigs:recovery-list', async (event) => {
    trusted(event);
    const owned = projectFiles.recoverySlots;
    return (await recovery.list()).filter(record => !owned.has(record.slot)).map(describeRecovery);
  });
  handle('rigs:recovery-read-begin', async (event, id) => {
    trusted(event);
    const record = id === undefined || id === null ? (await recovery.list())[0] : await spareRecovery(id);
    if (!record) return null;
    const transfer = await fileStreams.beginRead(recovery.paths(record.slot).file);
    return transfer ? { ...describeRecovery(record), ...transfer } : null;
  });
  handle('rigs:file-read-chunk', (event, token) => { trusted(event); return fileStreams.read(token); });
  handle('rigs:file-read-close', (event, token) => { trusted(event); return fileStreams.closeRead(token); });
  handle('rigs:recovery-save', (event, options) => {
    trusted(event);
    return controlRecovery(async () => {
      await cancelRecoveryWrite(null);
      return recovery.save(options);
    });
  });
  handle('rigs:recovery-get', (event) => { trusted(event); return recovery.get(); });
  // {documentToken}: that open project's copy (it was saved or closed). {id}: a listed copy the person discards.
  // Nothing: every copy, as a single-project caller's "delete the recovery" always meant.
  handle('rigs:recovery-delete', async (event, target) => {
    trusted(event);
    if (target === undefined || target === null) return controlRecovery(async () => {
      for (const slot of [...recoveryWrites.keys()]) await cancelRecoveryWrite(slot);
      return recovery.deleteAll();
    });
    const slot = typeof target.documentToken === 'string' ? projectFiles.require(target.documentToken).recovery : (await spareRecovery(target.id)).slot;
    return controlRecovery(async () => {
      await cancelRecoveryWrite(slot);
      return recovery.delete(slot);
    });
  });
  handle('rigs:open-file', async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(window, { title: t('desktop.main.openAnimationOrStickFigure'), properties: ['openFile'], filters: fileFilters() });
    return result.canceled ? null : readImportFile(result.filePaths[0]);
  });
  handle('rigs:save-file', async (event, options) => {
    trusted(event);
    if (!options || typeof options !== 'object') throw messageError(new Error(''), 'desktop.main.errors.saveOptionsAreRequired', {});
    let data;
    if (typeof options.data === 'string') {
      if (!['base64', 'utf8', undefined].includes(options.encoding)) throw messageError(new Error(''), 'desktop.main.errors.unsupportedFileEncoding', {});
      data = Buffer.from(options.data, options.encoding || 'utf8');
    } else if (options.data instanceof Uint8Array || Array.isArray(options.data)) data = Buffer.from(options.data);
    else throw messageError(new Error(''), 'desktop.main.errors.theFileMustContainTextOrBytes', {});
    if (data.byteLength > MAX_FILE_BYTES) throw messageError(new Error(''), 'desktop.main.errors.thisExportExceedsThe256MBLimit', {});
    const filters = Array.isArray(options.filters) ? options.filters.slice(0, 8).map((filter) => ({
      name: String(filter.name || 'File').slice(0, 80),
      extensions: Array.isArray(filter.extensions) ? filter.extensions.filter((ext) => /^[a-z0-9*]{1,12}$/i.test(ext)) : [],
    })).filter((filter) => filter.extensions.length) : [{ name: t('desktop.main.rigstickProject'), extensions: ['rigs'] }];
    const result = await dialog.showSaveDialog(window, {
      title: t('desktop.main.saveAnimation'),
      defaultPath: path.basename(String(options.defaultPath || 'Untitled.rigs')),
      filters,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return null;
    // Only the path selected by the native dialog is writable through this API.
    await atomicWrite(result.filePath, data);
    app.addRecentDocument(result.filePath);
    await rememberRecent(result.filePath);
    return { saved: true, path: result.filePath };
  });
  handle('rigs:window', (event, action, checkpoint) => {
    trusted(event);
    if (action === 'minimize') window.minimize();
    else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    else if (action === 'close') {
      if (!documentActionCurrent(checkpoint)) return false;
      window.close();
    }
    else throw messageError(new Error(''), 'desktop.main.errors.unknownWindowAction', {});
    return windowState();
  });
  handle('rigs:window-state', (event) => { trusted(event); return windowState(); });
  // Only the trusted workspace frame receives the codec session token.
  ipcMain.on('rigs:api-token', (event) => {
    try { trusted(event); event.returnValue = apiToken; }
    catch { event.returnValue = ''; }
  });
  ipcMain.on('rigs:memory-bytes', (event) => {
    try { trusted(event); event.returnValue = os.totalmem(); }
    catch { event.returnValue = 0; }
  });
  handle('rigs:document-state', (event, state) => {
    trusted(event);
    const name = String(state?.name || 'Untitled').slice(0, 180), dirty = Boolean(state?.dirty);
    const unsaved = Number.isSafeInteger(state?.unsaved) ? Math.max(dirty ? 1 : 0, Math.min(64, state.unsaved)) : dirty ? 1 : 0;
    documentState = { name, dirty, revision: String(state?.revision || '').slice(0, 160), unsaved,
      unsavedName: String(state?.unsavedName || name).slice(0, 180) };
    // The title names the project in front; its dot is that project's own.
    window.setTitle(`${(state?.activeDirty ?? dirty) ? '• ' : ''}${name} — RigStick`);
    window.setDocumentEdited(dirty);
  });
}

/**
 * Where the window starts: 'editor' when it opens with a file (Home would only flash before it), or what
 * RIGS_STARTUP_VIEW says ('home' or 'editor': scripts that drive the editor ask for it). Otherwise the
 * person's setting decides, in the renderer (src/home/home.mjs).
 */
function startupView() {
  const asked = process.env.RIGS_STARTUP_VIEW;
  if (asked === 'home' || asked === 'editor') return asked;
  return pendingFiles.length || pendingProtocol ? 'editor' : null;
}

async function createWindow() {
  const view = startupView();
  window = new BrowserWindow({
    width: 1560, height: 1000, minWidth: 1000, minHeight: 680,
    backgroundColor: '#0a0b0f', show: false,
    title: 'RigStick',
    icon: path.join(__dirname, 'assets', 'rigstick.png'),
    frame: process.platform === 'darwin',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 16 } } : {}),
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      backgroundThrottling: true, spellcheck: false,
      additionalArguments: view ? [`--rigs-startup-view=${view}`] : [],
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(?:github\.com|pivotanimator\.net)\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== backend.origin) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  const editorWindow = window;
  let rendererFailed = false, crashDialogPending = false;
  async function offerRendererRecovery() {
    if (crashDialogPending || editorWindow.isDestroyed()) return;
    crashDialogPending = true;
    try {
      const answer = await dialog.showMessageBox(editorWindow, {
        type: 'error', title: t('desktop.main.editorStopped'), message: t('desktop.main.theAnimationEditorStoppedUnexpectedly'),
        detail: t('desktop.main.savedFilesAndAnyRecoverySnapshotRemainOnDiskReopenTheEditorToUseTheRecoveryOptionOrOpenYourSavedProjectChangesMadeAfterT'),
        buttons: [t('desktop.main.reopenEditor'), t('desktop.main.keepWindowOpen'), t('desktop.main.closeWindow')], defaultId: 0, cancelId: 1,
      });
      if (editorWindow.isDestroyed() || !rendererFailed) return;
      if (answer.response === 0) {
        documentState = { name: 'Untitled', dirty: false, unsaved: 0, unsavedName: '' };
        await editorWindow.loadURL(backend.origin);
      } else if (answer.response === 2) {
        // The dead renderer cannot save. Closing this window must retain the
        // existing recovery file and must not wait for a save acknowledgement.
        documentState.dirty = false;
        rendererFailed = false;
        editorWindow.close();
      }
    } catch (error) {
      console.error('Could not reopen the editor:', error.message);
    } finally { crashDialogPending = false; }
  }
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || quitting) return;
    rendererFailed = true; pageLoaded = false;
    telemetry?.error('RendererCrash', 'renderer', 'renderer_crashes');
    // One bounded, local diagnostic survives even when optional telemetry is
    // disabled. It contains no document contents or user identifiers.
    void atomicWrite(path.join(instanceDirectory, 'last-renderer-crash.json'), Buffer.from(JSON.stringify({
      version: app.getVersion(), occurredAt: new Date().toISOString(), reason: details.reason, exitCode: details.exitCode,
    }))).catch(() => {});
    void offerRendererRecovery();
  });
  window.on('unresponsive', () => telemetry?.error('RendererHang', 'renderer', 'renderer_hangs'));
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur']) {
    window.on(event, () => window.webContents.send('rigs:window-state', windowState()));
  }
  window.on('close', async (event) => {
    if (!quitting && rendererFailed) { event.preventDefault(); void offerRendererRecovery(); return; }
    if (!quitting && documentState.dirty) {
      event.preventDefault();
      const prompt = unsavedPrompt();
      const answer = await dialog.showMessageBox(window, {
        type: 'question', title: t('desktop.main.unsavedAnimation'), message: prompt.message,
        detail: t(prompt.several ? 'desktop.main.theseProjectsHaveChangesThatHaveNotBeenSaved' : 'desktop.main.yourAnimationHasChangesThatHaveNotBeenSaved'),
        buttons: prompt.buttons, defaultId: 0, cancelId: 1,
      });
      if (answer.response === 0) sendAction('save-and-close');
      else if (answer.response === 2) { documentState.dirty = false; window.close(); }
    }
  });
  window.on('closed', () => { window = null; });
  window.once('ready-to-show', async () => {
    await splash?.close();
    splash = null;
    if (window && !window.isDestroyed()) window.show();
  });
  window.webContents.on('did-start-loading', () => { pageLoaded = false; });
  // A page that loads again opens its own documents; the previous page's cannot be written any more.
  window.webContents.on('did-start-navigation', (event, _url, inPlace, mainFrame) => {
    if ((event.isMainFrame ?? mainFrame) && !(event.isSameDocument ?? inPlace)) projectFiles.clear();
  });
  window.webContents.on('did-finish-load', () => { rendererFailed = false; pageLoaded = true; void flushPendingOpens(); });
  await window.loadURL(backend.origin);
  if (process.env.RIGS_DEVTOOLS === '1') window.webContents.openDevTools({ mode: 'detach' });
  await flushPendingOpens();
}

async function start() {
  splash = showSplash({ version: app.getVersion(), icon: path.join(__dirname, 'assets', 'rigstick.png') });
  const saved = await new WorkspacePreferences(app.getPath('userData'), {filename: 'editor-settings.json'}).get();
  localization.setLocale(normalizeLocale(saved.locale));
  const availability = updateAvailabilityDetails({ packaged: app.isPackaged, platform: process.platform,
    appImage: process.env.APPIMAGE, store: Boolean(process.windowsStore),
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR), installed: existsSync(path.join(path.dirname(process.execPath), 'Uninstall RigStick.exe')) });
  const unavailable = availability.message;
  const updater = unavailable ? null : process.platform === 'linux'
    ? new (require('./appimage-updater.cjs').LinuxAppImageUpdater)()
    : require('electron-updater').autoUpdater;
  if (updater && process.platform === 'win32') updater.installDirectory = path.dirname(process.execPath);
  updates = new UpdateService({ updater,
    currentVersion: app.getVersion(), unavailable, unavailableMessageKey: availability.messageKey,
    onState: value => { if (value.status === 'error') quitting = false; if (window && !window.isDestroyed()) window.webContents.send('rigs:update-state-changed', value); },
  });
  if (app.isPackaged) app.setAsDefaultProtocolClient('rigstick');
  telemetryReady = new TelemetryService({ directory: app.getPath('userData'), schemaPath: path.join(app.isPackaged ? path.join(process.resourcesPath, 'web') : APP_ROOT, 'src', 'telemetry-schema.mjs'), version: app.getVersion(), development: !app.isPackaged,
    build: telemetryBuild.build, internal: telemetryBuild.internal === true,
    onState: value => { if (window && !window.isDestroyed()) window.webContents.send('rigs:telemetry-state-changed', value); },
  }).init().then(service => { telemetry = service; return service; }).catch(() => { /* Optional reporting cannot prevent startup. */ });
  const memoryTimer = setInterval(() => {
    if (telemetry?.state.consent.diagnostics && window?.isFocused()) {
      const metrics = app.getAppMetrics();
      const phase=telemetry.resourcePhase||'unknown',epoch=telemetry.epoch;
      telemetry.sampleResources({memory_process:metrics.reduce((sum,item)=>sum+(item.memory?.workingSetSize||0),0)/1024},phase);
      if(backend?.origin)void fetch(backend.origin+'/api/health',{signal:AbortSignal.timeout(1500)}).then(response=>response.json()).then(value=>{
        if(telemetry.epoch===epoch&&window?.isFocused()&&Number.isFinite(value.processMemoryMiB))telemetry.sampleResources({memory_backend:value.processMemoryMiB},phase);
      }).catch(()=>{});
      telemetry.sampleMemory(metrics.reduce((sum, item) => sum + (item.memory?.workingSetSize || 0), 0) / 1024);
      telemetry.record({ epoch: telemetry.epoch, data: { gauges: { process_cpu_percent: metrics.reduce((sum, item) => sum + (item.cpu?.percentCPUUsage || 0), 0) } } });
    }
  }, 60000); memoryTimer.unref();
  library = new LibraryStore(process.env.RIGS_LIBRARY_DIR || path.join(app.getPath('documents'), 'RigStick', 'library'));
  presetStore = new PresetStore(process.env.RIGS_PRESETS_DIR || path.join(app.getPath('documents'), 'RigStick', 'Presets'));
  // A temporarily unavailable Documents volume should not prevent animation work.
  void library.init().catch(error => console.warn('Library initialization:', error.message));
  backend = await startDesktopHost({
    appRoot: APP_ROOT, resourcesPath: process.resourcesPath, packaged: app.isPackaged, token: apiToken,
    log: (message) => { if (process.env.RIGS_DEBUG === '1') process.stderr.write(message); },
    onError: (message) => { telemetry?.error('BackendError', 'backend', 'backend_errors'); if (window && !window.isDestroyed()) window.webContents.send('rigs:backend-error', message); },
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // Each workspace owns a separate Chromium session directory, and each
  // launch gets a new loopback origin. IndexedDB here is temporary worker
  // storage only; native recovery, preferences and library data live in files.
  // Reclaim old-origin undo caches before any editor/worker can use the session.
  await session.defaultSession.clearStorageData({storages:['indexdb']}).catch(error=>console.warn('Temporary drawing cache cleanup:',error.message));
  nativeMenu();
  registerIpc();
  await createWindow();
  updates.start();
  void mcp.start().then(() => sendToWindow('rigstick:mcp-state', mcpStatus())).catch(error => console.warn('MCP server:', error.message));
  app.on('activate', () => { if (!window) createWindow(); });
}

app.on('before-quit', (event) => {
  if (window && documentState.dirty && !quitting) { event.preventDefault(); window.close(); }
  else {
    quitting = true;
    if (telemetry && !telemetryClosed) { event.preventDefault(); telemetryClosed = true; void telemetry.close().catch(() => {}).finally(() => app.quit()); }
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => updates?.dispose());
app.on('will-quit', () => { void mcp?.stop(); whisperJob?.abort(); });
app.on('will-quit', () => { backend?.stop(); library?.dispose().catch(() => {}); fileStreams?.dispose().catch(() => {}); videoExports?.dispose().catch(() => {}); vfwExports?.dispose().catch(() => {}); audioImports?.dispose().catch(() => {}); });
process.on('exit', () => backend?.stop());
