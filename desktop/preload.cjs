'use strict';
// BEGIN generated localization diagnostics
const diagnosticEnglish = {
  "desktop.preload.errors.aCallbackIsRequired": "A callback is required.",
  "desktop.preload.errors.uiScaleMustBe75200InStepsOf5": "UI scale must be 75–200 in steps of 5."
};
function diagnosticError(error, source, messageKey, messageParams = {}) {
  if (typeof source !== 'string') throw new TypeError(`Unknown error message: ${messageKey}`);
  messageParams = Object.fromEntries(Object.entries(messageParams).map(([name, value]) => {
    // Only an explicit scalar diagnostic value can accompany a display reference.
    // Original English diagnostics remain stable through worker/IPC round trips.
    if (value && typeof value.messageKey === 'string' && Object.hasOwn(value, 'diagnosticValue'))
      return [name, {messageKey:value.messageKey, diagnosticValue:String(value.diagnosticValue),
        ...(value.messageParams ? {messageParams:Object.fromEntries(Object.entries(value.messageParams).map(([key, scalar]) => [key, typeof scalar === 'number' && Number.isFinite(scalar) ? scalar : String(scalar)]))} : {})}];
    return [name, typeof value === 'number' && Number.isFinite(value) ? value : String(value)];
  }));
  const message = source.replace(/\{([A-Za-z]\w*)\}/g, (token, name) => Object.hasOwn(messageParams, name) ? String(messageParams[name]?.diagnosticValue ?? messageParams[name]) : token);
  Object.defineProperty(error, 'message', {value: message, configurable: true, writable: true});
  error.messageKey = messageKey;
  error.messageParams = messageParams;
  return error;
}
const messageError = (error, key, params) => diagnosticError(error, diagnosticEnglish[key], key, params);
// END generated localization diagnostics


const { contextBridge, ipcRenderer, webFrame } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw messageError(new TypeError(''), 'desktop.preload.errors.aCallbackIsRequired', {});
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Sandboxed preloads cannot require('os'); total memory is a synchronous
// main-process value. Failure degrades to the navigator.deviceMemory hint.
function systemMemoryBytes() {
  try { return ipcRenderer.sendSync('rigs:memory-bytes') || 0; } catch { return 0; }
}

// The loopback codec rejects /api/* requests without this per-launch token.
function apiToken() {
  try { return ipcRenderer.sendSync('rigs:api-token') || ''; } catch { return ''; }
}

// Where this window starts ('home' or 'editor'), when the launch decides it (main.cjs startupView); else null.
function startupView() {
  const value = (process.argv ?? []).find(argument => argument.startsWith('--rigs-startup-view='))?.slice('--rigs-startup-view='.length);
  return value === 'home' || value === 'editor' ? value : null;
}

// Every privileged operation has a narrow handler in main.cjs. No filesystem,
// Node.js, Electron object, or arbitrary IPC channel crosses this boundary.
contextBridge.exposeInMainWorld('rigsDesktop', Object.freeze({
  isDesktop: true,
  apiToken: apiToken(),
  startupView: startupView(),
  // Page zoom keeps CSS layout, pointer coordinates and devicePixelRatio aligned.
  setUIScale: percent => {
    if (!Number.isFinite(percent) || percent < 75 || percent > 200 || percent % 5 !== 0)
      throw messageError(new RangeError(''), 'desktop.preload.errors.uiScaleMustBe75200InStepsOf5', {});
    webFrame.setZoomFactor(percent / 100);
  },
  newWindow: () => ipcRenderer.invoke('rigs:new-window'),
  beginSharedClipboardWrite: () => ipcRenderer.invoke('rigs:shared-clipboard-write-begin'),
  writeSharedClipboardChunk: (token, bytes) => ipcRenderer.invoke('rigs:shared-clipboard-write', token, bytes),
  finishSharedClipboardWrite: token => ipcRenderer.invoke('rigs:shared-clipboard-finish', token),
  beginSharedClipboardRead: id => ipcRenderer.invoke('rigs:shared-clipboard-read-begin', id),
  readSharedClipboardChunk: token => ipcRenderer.invoke('rigs:shared-clipboard-read', token),
  cancelSharedClipboardTransfer: token => ipcRenderer.invoke('rigs:shared-clipboard-cancel', token),
  platform: process.platform,
  memoryBytes: systemMemoryBytes(),
  streamingFileWrite: true,
  importTransport: 'source-bytes-v1',
  getUpdateState: () => ipcRenderer.invoke('rigs:update-state'),
  checkForUpdates: () => ipcRenderer.invoke('rigs:update-check'),
  restartForUpdate: checkpoint => ipcRenderer.invoke('rigs:update-restart', checkpoint),
  openUpdateReleases: () => ipcRenderer.invoke('rigs:update-releases'),
  onUpdateState: callback => subscribe('rigs:update-state-changed', callback),
  getReleaseInfo: (startup = false) => ipcRenderer.invoke('rigs:release-info', Boolean(startup)),
  getReleaseHistory: () => ipcRenderer.invoke('rigs:release-history'),
  openStore: () => ipcRenderer.invoke('rigs:open-store'),
  getHardware: () => ipcRenderer.invoke('rigs:hardware-get'),
  setHardware: value => ipcRenderer.invoke('rigs:hardware-set', value),
  relaunch: () => ipcRenderer.invoke('rigs:relaunch'),
  setExportActive: active => ipcRenderer.invoke('rigs:export-active', Boolean(active)),
  openDonate: () => ipcRenderer.invoke('rigs:donate'),
  getTelemetryState: () => ipcRenderer.invoke('rigs:telemetry-state'),
  getSupportContext: () => ipcRenderer.invoke('rigs:support-context'),
  saveSupportState: value => ipcRenderer.invoke('rigs:support-save-state', value),
  supportRequest: value => ipcRenderer.invoke('rigs:support-request', value),
  connectSupportLive: id => ipcRenderer.invoke('rigs:support-live', id),
  disconnectSupportLive: connection => ipcRenderer.invoke('rigs:support-live-close', connection),
  onSupportLive: callback => subscribe('rigs:support-live-event', callback),
  copySupportAccess: () => ipcRenderer.invoke('rigs:support-copy-access'),
  restoreSupportAccess: key => ipcRenderer.invoke('rigs:support-restore', key),
  downloadSupportFile: value => ipcRenderer.invoke('rigs:support-download', value),
  setTelemetryConsent: value => ipcRenderer.invoke('rigs:telemetry-consent', value),
  recordTelemetry: value => ipcRenderer.invoke('rigs:telemetry-record', value),
  previewTelemetry: () => ipcRenderer.invoke('rigs:telemetry-preview'),
  syncTelemetry: () => ipcRenderer.invoke('rigs:telemetry-sync'),
  exportTelemetry: () => ipcRenderer.invoke('rigs:telemetry-export'),
  deleteTelemetry: () => ipcRenderer.invoke('rigs:telemetry-delete'),
  sendTelemetryFeedback: value => ipcRenderer.invoke('rigs:telemetry-feedback', value),
  openServicePage: page => ipcRenderer.invoke('rigs:service-page', page),
  recordPerformanceTrace: () => ipcRenderer.invoke('rigs:performance-trace'),
  onTelemetryState: callback => subscribe('rigs:telemetry-state-changed', callback),
  // RigStick AI (desktop/main.cjs registerRigStickIpc): MCP, Whisper and system stats.
  mcpStatus: () => ipcRenderer.invoke('rigstick:mcp-status'),
  setMcpEnabled: enabled => ipcRenderer.invoke('rigstick:mcp-set-enabled', enabled === true),
  regenerateMcpToken: () => ipcRenderer.invoke('rigstick:mcp-regenerate-token'),
  onMcpActivity: callback => subscribe('rigstick:mcp-activity', callback),
  onMcpStatus: callback => subscribe('rigstick:mcp-state', callback),
  onAiCall: callback => subscribe('rigstick:ai-call', callback),
  sendAiResult: value => ipcRenderer.send('rigstick:ai-result', value),
  whisperStatus: () => ipcRenderer.invoke('rigstick:whisper-status'),
  prepareWhisper: model => ipcRenderer.invoke('rigstick:whisper-prepare', model),
  transcribeWhisper: options => ipcRenderer.invoke('rigstick:whisper-transcribe', options),
  cancelWhisper: () => ipcRenderer.invoke('rigstick:whisper-cancel'),
  onWhisperProgress: callback => subscribe('rigstick:whisper-progress', callback),
  systemStats: () => ipcRenderer.invoke('rigstick:system-stats'),
  exportVideoBegin: options => ipcRenderer.invoke('rigstick:export-begin', options),
  exportVideoFrame: (token, index, bytes) => ipcRenderer.invoke('rigstick:export-frame', token, index, bytes),
  exportVideoFinish: token => ipcRenderer.invoke('rigstick:export-finish', token),
  exportVideoCancel: token => ipcRenderer.invoke('rigstick:export-cancel', token),
  revealVideo: file => ipcRenderer.invoke('rigstick:export-reveal', file),
  openVideo: file => ipcRenderer.invoke('rigstick:export-open', file),
  listLibrary: folder => ipcRenderer.invoke('rigs:library-list', folder),
  createLibraryFolder: options => ipcRenderer.invoke('rigs:library-mkdir', options),
  getLibraryThumbnail: path => ipcRenderer.invoke('rigs:library-thumbnail', path),
  beginLibrarySave: options => ipcRenderer.invoke('rigs:library-save-begin', options),
  writeLibraryChunk: (token, bytes) => ipcRenderer.invoke('rigs:library-write', token, bytes),
  finishLibrarySave: token => ipcRenderer.invoke('rigs:library-finish', token),
  cancelLibraryTransfer: token => ipcRenderer.invoke('rigs:library-cancel', token),
  beginLibraryRead: path => ipcRenderer.invoke('rigs:library-read-begin', path),
  readLibraryChunk: token => ipcRenderer.invoke('rigs:library-read', token),
  changeLibraryItem: options => ipcRenderer.invoke('rigs:library-change', options),
  revealLibrary: folder => ipcRenderer.invoke('rigs:library-reveal', folder),
  listUserPresets: () => ipcRenderer.invoke('rigs:presets-list'),
  readUserPreset: id => ipcRenderer.invoke('rigs:presets-read', id),
  saveUserPresetFile: value => ipcRenderer.invoke('rigs:presets-save', value),
  removeUserPreset: id => ipcRenderer.invoke('rigs:presets-remove', id),
  revealUserPresets: () => ipcRenderer.invoke('rigs:presets-reveal'),
  trashLibraryItem: path => ipcRenderer.invoke('rigs:library-trash', path),
  cacheLibraryThumbnail: options => ipcRenderer.invoke('rigs:library-thumbnail-cache', options),
  getWorkspacePreferences: () => ipcRenderer.invoke('rigs:workspace-preferences-get'),
  setWorkspacePreferences: (preferences) => ipcRenderer.invoke('rigs:workspace-preferences-set', preferences),
  getEditorSettings: () => ipcRenderer.invoke('rigs:editor-settings-get'),
  setEditorSettings: (settings) => ipcRenderer.invoke('rigs:editor-settings-set', settings),
  getVfxPresets: () => ipcRenderer.invoke('rigs:vfx-presets-get'),
  setVfxPresets: (presets) => ipcRenderer.invoke('rigs:vfx-presets-set', presets),
  listFonts: () => ipcRenderer.invoke('rigs:fonts-list'),
  readFont: (id) => ipcRenderer.invoke('rigs:fonts-read', id),
  readClipboardText: () => ipcRenderer.invoke('rigs:clipboard-text-read'),
  writeClipboardText: text => ipcRenderer.invoke('rigs:clipboard-text-write', text),
  getVideoCapabilities: options => ipcRenderer.invoke('rigs:video-capabilities', options),
  beginVideoExport: options => ipcRenderer.invoke('rigs:video-begin', options),
  writeVideoAudioChunk: (token, bytes) => ipcRenderer.invoke('rigs:video-audio-chunk', token, bytes),
  beginAudioImport: options => ipcRenderer.invoke('rigs:audio-begin', options),
  writeAudioImport: (token, bytes) => ipcRenderer.invoke('rigs:audio-write', token, bytes),
  finishAudioImport: token => ipcRenderer.invoke('rigs:audio-finish', token),
  readAudioImport: token => ipcRenderer.invoke('rigs:audio-read', token),
  cancelAudioImport: token => ipcRenderer.invoke('rigs:audio-cancel', token),
  beginVideoFrame: (token, options) => ipcRenderer.invoke('rigs:video-frame-begin', token, options),
  writeVideoChunk: (token, bytes) => ipcRenderer.invoke('rigs:video-frame-chunk', token, bytes),
  endVideoFrame: token => ipcRenderer.invoke('rigs:video-frame-end', token),
  finishVideoExport: token => ipcRenderer.invoke('rigs:video-finish', token),
  readVideoChunk: token => ipcRenderer.invoke('rigs:video-read', token),
  saveVideoExport: (token, options) => ipcRenderer.invoke('rigs:video-save', token, options),
  getExportFolder: () => ipcRenderer.invoke('rigs:export-folder-get'),
  chooseExportFolder: () => ipcRenderer.invoke('rigs:export-folder-choose'),
  clearExportFolder: () => ipcRenderer.invoke('rigs:export-folder-clear'),
  cancelVideoExport: token => ipcRenderer.invoke('rigs:video-cancel', token),
  getVfwCapabilities: options => ipcRenderer.invoke('rigs:vfw-capabilities', options),
  configureVfwCodec: options => ipcRenderer.invoke('rigs:vfw-configure', options),
  beginVfwExport: options => ipcRenderer.invoke('rigs:vfw-begin', options),
  beginVfwFrame: (token, options) => ipcRenderer.invoke('rigs:vfw-frame-begin', token, options),
  writeVfwChunk: (token, bytes) => ipcRenderer.invoke('rigs:vfw-frame-chunk', token, bytes),
  endVfwFrame: token => ipcRenderer.invoke('rigs:vfw-frame-end', token),
  finishVfwExport: token => ipcRenderer.invoke('rigs:vfw-finish', token),
  readVfwChunk: token => ipcRenderer.invoke('rigs:vfw-read', token),
  saveVfwExport: (token, options) => ipcRenderer.invoke('rigs:vfw-save', token, options),
  cancelVfwExport: token => ipcRenderer.invoke('rigs:vfw-cancel', token),
  activateDocument: (options) => ipcRenderer.invoke('rigs:document-activate', options),
  selectDocument: (documentToken) => ipcRenderer.invoke('rigs:document-select', documentToken),
  releaseDocument: (documentToken) => ipcRenderer.invoke('rigs:document-release', documentToken),
  openFile: () => ipcRenderer.invoke('rigs:open-file'),
  listRecentFiles: () => ipcRenderer.invoke('rigs:recent-list'),
  openRecentFile: id => ipcRenderer.invoke('rigs:recent-open', id),
  clearRecentFiles: () => ipcRenderer.invoke('rigs:recent-clear'),
  listProjects: () => ipcRenderer.invoke('rigs:projects-list'),
  openProject: id => ipcRenderer.invoke('rigs:projects-open', id),
  updateProject: (id, changes) => ipcRenderer.invoke('rigs:projects-update', id, changes),
  removeProject: id => ipcRenderer.invoke('rigs:projects-remove', id),
  revealProject: id => ipcRenderer.invoke('rigs:projects-reveal', id),
  getProjectPreview: id => ipcRenderer.invoke('rigs:projects-preview', id),
  setProjectPreview: options => ipcRenderer.invoke('rigs:projects-preview-set', options),
  changeProjectFolder: change => ipcRenderer.invoke('rigs:projects-folder', change),
  saveFile: (options) => ipcRenderer.invoke('rigs:save-file', options),
  beginFileWrite: (options) => ipcRenderer.invoke('rigs:file-write-begin', options),
  beginProjectWrite: (options) => ipcRenderer.invoke('rigs:project-write-begin', options),
  beginRecoveryWrite: (options) => ipcRenderer.invoke('rigs:recovery-write-begin', options),
  beginClipboardWrite: (options) => ipcRenderer.invoke('rigs:clipboard-write-begin', options),
  beginClipboardRead: () => ipcRenderer.invoke('rigs:clipboard-read-begin'),
  writeFileChunk: (token, bytes) => ipcRenderer.invoke('rigs:file-write-chunk', token, bytes),
  patchFileWrite: (token, offset, bytes) => ipcRenderer.invoke('rigs:file-write-patch', token, offset, bytes),
  finishFileWrite: (token) => ipcRenderer.invoke('rigs:file-write-finish', token),
  cancelFileWrite: (token) => ipcRenderer.invoke('rigs:file-write-cancel', token),
  getRecoveryInfo: () => ipcRenderer.invoke('rigs:recovery-info'),
  listRecoveries: () => ipcRenderer.invoke('rigs:recovery-list'),
  beginRecoveryRead: (id) => ipcRenderer.invoke('rigs:recovery-read-begin', id),
  readFileChunk: (token) => ipcRenderer.invoke('rigs:file-read-chunk', token),
  closeFileRead: (token) => ipcRenderer.invoke('rigs:file-read-close', token),
  saveRecovery: (options) => ipcRenderer.invoke('rigs:recovery-save', options),
  getRecovery: () => ipcRenderer.invoke('rigs:recovery-get'),
  deleteRecovery: (target) => ipcRenderer.invoke('rigs:recovery-delete', target),
  minimize: () => ipcRenderer.invoke('rigs:window', 'minimize'),
  maximize: () => ipcRenderer.invoke('rigs:window', 'maximize'),
  close: checkpoint => ipcRenderer.invoke('rigs:window', 'close', checkpoint),
  getWindowState: () => ipcRenderer.invoke('rigs:window-state'),
  setDocumentState: (state) => ipcRenderer.invoke('rigs:document-state', state),
  onMenuAction: (callback) => subscribe('rigs:menu-action', callback),
  onOpenFile: (callback) => subscribe('rigs:file-opened', callback),
  onWindowState: (callback) => subscribe('rigs:window-state', callback),
  onBackendError: (callback) => subscribe('rigs:backend-error', callback),
}));
