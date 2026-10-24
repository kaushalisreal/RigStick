/** Local whisper.cpp transcription (Windows x64 prebuilt binaries). Main process only; the renderer gets progress and a result, never paths. */
const fs = require('node:fs/promises');
const {createWriteStream} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, execFile} = require('node:child_process');

const RELEASES_URL = 'https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=12';
// Known-good fallback when the GitHub API is unreachable or rate limited (v1.9.2 is the newest stable tag that ships binaries).
const FALLBACK = {
  tag: 'v1.9.2',
  cpu: {name: 'whisper-bin-x64.zip', size: 8194445},
  cuda: {name: 'whisper-cublas-12.4.0-bin-x64.zip', size: 670611449},
};
const MODEL_URL = name => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`;
/** Approximate download sizes (bytes) of the ggml weights. */
const MODELS = [
  {name: 'tiny', bytes: 77_700_000, englishOnly: false},
  {name: 'tiny.en', bytes: 77_700_000, englishOnly: true},
  {name: 'base', bytes: 147_950_000, englishOnly: false},
  {name: 'base.en', bytes: 147_960_000, englishOnly: true},
  {name: 'small', bytes: 487_600_000, englishOnly: false},
  {name: 'small.en', bytes: 487_600_000, englishOnly: true},
  {name: 'medium', bytes: 1_533_800_000, englishOnly: false},
  {name: 'medium.en', bytes: 1_533_800_000, englishOnly: true},
  {name: 'large-v3-turbo', bytes: 1_624_550_000, englishOnly: false},
];
const modelInfo = name => MODELS.find(m => m.name === name);
const abortError = () => Object.assign(new Error('Transcription cancelled'), {name: 'AbortError'});
const GPU_TTL = 2000;

/** Pick the Windows x64 zip to install from a GitHub releases payload (newest first). Releases tagged bNNNN carry the binaries; the vN.N.N "latest" often has none. */
function selectAsset(releases, {cuda = false} = {}) {
  const usable = (Array.isArray(releases) ? releases : []).filter(r => r && !r.draft && Array.isArray(r.assets));
  const asset = (release, a, variant) => ({tag: release.tag_name, name: a.name, url: a.browser_download_url, size: a.size, variant});
  if (cuda) for (const release of usable) {
    // Two naming schemes: whisper-bin-win-cuda-12.4.0-x64.zip (new) and whisper-cublas-12.4.0-bin-x64.zip (old). CUDA 12 wins over 11.8 (needs driver 525+ vs 450+, but is faster); x64 only, the 13.x builds are arm64.
    const found = release.assets.map(a => ({a, m: /^whisper-bin-win-cuda-(\d+(?:\.\d+)*)-x64\.zip$/.exec(a.name) || /^whisper-cublas-(\d+(?:\.\d+)*)-bin-x64\.zip$/.exec(a.name)}))
      .filter(x => x.m).sort((x, y) => (Number(y.m[1].split('.')[0]) === 12) - (Number(x.m[1].split('.')[0]) === 12) || parseFloat(y.m[1]) - parseFloat(x.m[1]));
    if (found.length) return asset(release, found[0].a, 'cuda');
  }
  for (const release of usable) {
    const a = release.assets.find(x => x.name === 'whisper-bin-x64.zip');
    if (a) return asset(release, a, 'cpu');
  }
  return null;
}
function fallbackAsset(cuda) {
  const pick = cuda ? FALLBACK.cuda : FALLBACK.cpu;
  return {tag: FALLBACK.tag, name: pick.name, url: `https://github.com/ggml-org/whisper.cpp/releases/download/${FALLBACK.tag}/${pick.name}`, size: pick.size, variant: cuda ? 'cuda' : 'cpu'};
}

/** 16-bit PCM mono WAV from Float32 samples (whisper-cli reads 16 kHz 16-bit mono). */
function encodeWav(samples, rate = 16000) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0, 'ascii'); out.writeUInt32LE(36 + samples.length * 2, 4); out.write('WAVEfmt ', 8, 'ascii');
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii'); out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) { const v = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0; out.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2); }
  return out;
}

/** "progress =  42%" lines from `-pp`; returns 0..1 or null. */
function parseProgress(line) {
  const m = /progress\s*=\s*(\d{1,3})\s*%/.exec(line);
  return m ? Math.min(1, Number(m[1]) / 100) : null;
}

const SPECIAL = /^\[_[A-Z]+_.*\]$|^<\|.*\|>$/;
const NOISE = /^\s*(\[[^\]]*\]|\([^)]*\)|[♪♫\s]+)\s*$/;
/**
 * whisper-cli `-ojf` JSON -> shared result shape. Tokens are merged into words: a token starting with a space (or the first token) opens a word, anything else
 * (sub-word pieces, punctuation) extends it. Times are token offsets in ms. Segments are whisper's own segments, except when the run used `-ml 1` (every segment is one word),
 * in which case they are rebuilt from the words at sentence ends or long gaps.
 */
function parseWhisperJson(json, {model = '', duration = null} = {}) {
  const rows = Array.isArray(json?.transcription) ? json.transcription : [];
  const words = [], pieces = [];
  let current = null;
  const flush = () => { if (current) { const text = current.text.trim(); if (text && !NOISE.test(text)) words.push({start: current.start, end: Math.max(current.start, current.end), text, ...(current.n ? {p: current.p / current.n} : {})}); } current = null; };
  for (const row of rows) {
    const from = (row.offsets?.from ?? 0) / 1000, to = (row.offsets?.to ?? 0) / 1000;
    for (const token of row.tokens || []) {
      const raw = String(token.text ?? '');
      if (!raw || SPECIAL.test(raw.trim())) continue;
      const a = token.offsets ? token.offsets.from / 1000 : from, b = token.offsets ? token.offsets.to / 1000 : to;
      if (!current || /^\s/.test(raw)) { flush(); current = {text: '', start: a, end: b, p: 0, n: 0}; }
      current.text += raw; current.end = Math.max(current.end, b);
      if (typeof token.p === 'number' && raw.trim() && !/^[\s\p{P}]+$/u.test(raw)) { current.p += token.p; current.n++; }
    }
    flush();
    pieces.push({start: from, end: Math.max(from, to), text: String(row.text ?? '').trim()});
  }
  words.sort((x, y) => x.start - y.start || x.end - y.end);
  // whisper.cpp's token-timestamp heuristic sometimes pins several words to one instant; give such runs a share of the gap up to the next word.
  for (let i = 0; i < words.length;) {
    if (words[i].end - words[i].start >= 0.02) { i++; continue; }
    let j = i; while (j < words.length && words[j].end - words[j].start < 0.02) j++;
    const chars = words.slice(i, j).reduce((n, w) => n + w.text.length, 0), from = words[i].start;
    const to = Math.max(from + 0.06 * (j - i), j < words.length ? Math.min(words[j].start, from + 0.4 * (j - i)) : from);
    let at = from;
    for (let k = i; k < j; k++) { const len = (to - from) * words[k].text.length / chars; words[k].start = Math.round(at * 1000) / 1000; at += len; words[k].end = Math.round(at * 1000) / 1000; }
    i = j;
  }
  for (const w of words) if (w.p !== undefined) w.p = Math.round(w.p * 1000) / 1000;
  let segments = pieces.filter(s => s.text && !NOISE.test(s.text));
  if (rows.length > 3 && rows.every(r => String(r.text ?? '').trim().split(/\s+/).length <= 1)) {
    segments = [];
    let open = null;
    for (const w of words) {
      if (open && w.start - open.end > 1.5) { segments.push(open); open = null; }
      if (!open) open = {start: w.start, end: w.end, text: w.text}; else { open.end = Math.max(open.end, w.end); open.text += ' ' + w.text; }
      if (/[.!?…。！？]["')\]]*$/.test(w.text) || open.text.split(' ').length >= 40) { segments.push(open); open = null; }
    }
    if (open) segments.push(open);
  }
  const last = Math.max(0, ...words.map(w => w.end), ...segments.map(s => s.end));
  return {engine: 'whisper.cpp', model: String(model).replace(/^.*ggml-|\.bin$/g, '') || model, language: json?.result?.language ?? json?.params?.language ?? null, duration: duration ?? last, segments, words};
}

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function findFile(dir, names) {
  const queue = [dir];
  while (queue.length) {
    const here = queue.shift(); let entries;
    try { entries = await fs.readdir(here, {withFileTypes: true}); } catch { continue; }
    for (const name of names) { const hit = entries.find(e => e.isFile() && e.name.toLowerCase() === name); if (hit) return path.join(here, hit.name); }
    for (const e of entries) if (e.isDirectory()) queue.push(path.join(here, e.name));
  }
  return null;
}
const kill = child => {
  if (!child.pid) return;
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true}, () => {});
  else try { child.kill('SIGKILL'); } catch { /* already gone */ }
};

class WhisperService {
  constructor({root, fetchImpl = fetch, platform = process.platform, arch = process.arch} = {}) {
    if (!root || !path.isAbsolute(root)) throw new Error('A whisper folder path is required');
    Object.assign(this, {root, fetchImpl, platform, arch});
    this.pid = null; this.gpuCache = null; this.installing = null; this.downloads = new Map();
  }
  get supported() { return this.platform === 'win32' && this.arch === 'x64'; }
  get modelsDir() { return path.join(this.root, 'models'); }
  async readBinary() {
    try {
      const info = JSON.parse(await fs.readFile(path.join(this.root, 'binary.json'), 'utf8'));
      const exe = path.join(this.root, info.exe);
      return await exists(exe) ? {...info, path: exe} : null;
    } catch { return null; }
  }
  async gpuList() {
    if (this.gpuCache && Date.now() - this.gpuCache.at < GPU_TTL) return this.gpuCache.list;
    let list = [];
    try {
      const si = require('systeminformation'); const g = await si.graphics();
      const mb = v => Number.isFinite(v) && v > 0 ? v * 2 ** 20 : null;
      list = (g.controllers || []).map(c => ({name: c.model || c.name || 'GPU', vendor: c.vendor || '', utilization: Number.isFinite(c.utilizationGpu) ? c.utilizationGpu : null, memoryUsed: mb(c.memoryUsed), memoryTotal: mb(c.memoryTotal ?? c.vram)}));
    } catch { /* graphics probing is best effort */ }
    this.gpuCache = {at: Date.now(), list}; return list;
  }
  async status() {
    const binary = await this.readBinary(), gpus = await this.gpuList(), nv = gpus.find(g => /nvidia/i.test(g.vendor + ' ' + g.name));
    const models = await Promise.all(MODELS.map(async m => {
      try { const s = await fs.stat(path.join(this.modelsDir, `ggml-${m.name}.bin`)); return {name: m.name, installed: true, bytes: s.size, approxBytes: m.bytes, englishOnly: m.englishOnly}; }
      catch { return {name: m.name, installed: false, bytes: m.bytes, approxBytes: m.bytes, englishOnly: m.englishOnly}; }
    }));
    return {supported: this.supported, binary: {installed: !!binary, variant: binary?.variant ?? null, version: binary?.version ?? null}, models, gpu: {nvidia: !!nv, name: nv?.name ?? gpus[0]?.name ?? null}};
  }

  /** Stream `url` to `file` via a .part sibling; verifies the byte count against Content-Length. */
  async download(url, file, phase, {onProgress, signal, expect} = {}) {
    if (signal?.aborted) throw abortError();
    await fs.mkdir(path.dirname(file), {recursive: true});
    const part = file + '.part';
    let response;
    try { response = await this.fetchImpl(url, {signal, headers: {'User-Agent': 'RigStick', 'Accept-Encoding': 'identity'}}); }
    catch (error) { throw signal?.aborted ? abortError() : error; }
    if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${new URL(url).host}`);
    const length = Number(response.headers.get('content-length')), total = Number.isFinite(length) && length > 0 ? length : expect || 0;
    const out = createWriteStream(part); let received = 0, last = 0;
    const closed = new Promise((resolve, reject) => { out.once('close', resolve); out.once('error', reject); });
    try {
      const reader = response.body.getReader();
      for (;;) {
        if (signal?.aborted) throw abortError();
        const {done, value} = await reader.read(); if (done) break;
        if (!out.write(value)) await new Promise(resolve => out.once('drain', resolve));
        received += value.length;
        if (onProgress && Date.now() - last > 100) { last = Date.now(); onProgress({phase, received, total}); }
      }
      out.end(); await closed;
      if (total && received !== total) throw new Error(`Download incomplete: got ${received} of ${total} bytes`);
      await fs.rename(part, file); onProgress?.({phase, received, total: total || received});
    } catch (error) { out.destroy(); await closed.catch(() => {}); await fs.rm(part, {force: true}); throw signal?.aborted ? abortError() : error; }
  }

  async resolveAsset(cuda) {
    try {
      const res = await this.fetchImpl(RELEASES_URL, {headers: {'User-Agent': 'RigStick', Accept: 'application/vnd.github+json'}});
      if (res.ok) { const pick = selectAsset(await res.json(), {cuda}); if (pick) return pick; }
    } catch { /* fall through to the pinned tag */ }
    return fallbackAsset(cuda);
  }
  /** Install whisper-cli. Picks CUDA when an NVIDIA GPU is present. An existing install is kept unless `variant`/`force` asks for another. */
  async ensureBinary({onProgress, signal, variant, force = false} = {}) {
    if (!this.supported) throw new Error('Prebuilt whisper.cpp binaries are only published for Windows x64');
    const have = await this.readBinary();
    if (have && !force && (!variant || variant === have.variant)) return {installed: true, variant: have.variant, version: have.version, path: have.path};
    if (this.installing) return this.installing;
    this.installing = this.install({onProgress, signal, variant}).finally(() => { this.installing = null; });
    return this.installing;
  }
  async install({onProgress, signal, variant}) {
    const gpus = await this.gpuList();
    const cuda = variant ? variant === 'cuda' : gpus.some(g => /nvidia/i.test(g.vendor + ' ' + g.name));
    const asset = await this.resolveAsset(cuda);
    const work = path.join(this.root, 'download'); await fs.rm(work, {recursive: true, force: true}); await fs.mkdir(work, {recursive: true});
    const zip = path.join(work, asset.name), unpacked = path.join(work, 'unpacked');
    try {
      await this.download(asset.url, zip, 'binary', {onProgress, signal, expect: asset.size});
      onProgress?.({phase: 'extract', received: 0, total: 0});
      await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:WS_ZIP -DestinationPath $env:WS_DEST -Force'],
        {windowsHide: true, env: {...process.env, WS_ZIP: zip, WS_DEST: unpacked}, signal, maxBuffer: 1 << 20}, error => error ? reject(signal?.aborted ? abortError() : error) : resolve()));
      const exe = await findFile(unpacked, ['whisper-cli.exe', 'main.exe']);
      if (!exe) throw new Error('The whisper.cpp archive did not contain whisper-cli.exe');
      const target = path.join(this.root, 'bin');
      await fs.rm(target, {recursive: true, force: true}); await fs.rename(path.dirname(exe), target);
      const info = {version: asset.tag, variant: asset.variant, asset: asset.name, exe: path.join('bin', path.basename(exe)), installedAt: new Date().toISOString()};
      await fs.writeFile(path.join(this.root, 'binary.json'), JSON.stringify(info, null, 2));
      return {installed: true, variant: info.variant, version: info.version, path: path.join(this.root, info.exe)};
    } finally { await fs.rm(work, {recursive: true, force: true}).catch(() => {}); }
  }
  async ensureModel(name, {onProgress, signal} = {}) {
    if (!modelInfo(name)) throw new Error(`Unknown whisper model: ${name}`);
    const file = path.join(this.modelsDir, `ggml-${name}.bin`);
    if (await exists(file)) return {name, path: file};
    if (!this.downloads.has(name)) this.downloads.set(name, this.download(MODEL_URL(name), file, 'model', {onProgress, signal, expect: modelInfo(name).bytes}).finally(() => this.downloads.delete(name)));
    await this.downloads.get(name); return {name, path: file};
  }

  /**
   * Word timing: run with `--max-len 1 --split-on-word`. Without --max-len whisper.cpp does not compute token timestamps at all (the -ojf token offsets are then just the
   * segment's), and DTW (-dtw) only has presets for some models and needs flash-attention off. With max-len 1 every segment is one whole word with timestamps
   * from whisper's token-timestamp heuristic, and the full JSON still carries per-token probabilities, which are averaged into `p`. Sentence segments are rebuilt in parseWhisperJson.
   */
  async transcribe({pcm, model, language = 'auto', onProgress, signal} = {}) {
    const binary = await this.readBinary();
    if (!binary) throw new Error('whisper.cpp is not installed yet');
    const modelPath = path.join(this.modelsDir, `ggml-${model}.bin`);
    if (!modelInfo(model) || !await exists(modelPath)) throw new Error(`The whisper model "${model}" is not downloaded`);
    if (!(pcm instanceof Float32Array) || !pcm.length) throw new Error('No audio to transcribe');
    if (this.pid) throw new Error('A transcription is already running');
    if (signal?.aborted) throw abortError();
    const lang = modelInfo(model).englishOnly ? 'en' : (/^[a-z]{2,3}$/i.test(language) ? language.toLowerCase() : 'auto');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rigstick-whisper-')), wav = path.join(dir, 'input.wav'), base = path.join(dir, 'out');
    let child, onAbort;
    try {
      await fs.writeFile(wav, encodeWav(pcm));
      const threads = Math.max(1, os.cpus().length - 1);
      const args = ['-m', modelPath, '-f', wav, '-l', lang, '-ojf', '-of', base, '-pp', '-t', String(threads), '--max-len', '1', '--split-on-word'];
      await new Promise((resolve, reject) => {
        child = spawn(binary.path, args, {windowsHide: true, cwd: path.dirname(binary.path), stdio: ['ignore', 'ignore', 'pipe']});
        this.pid = child.pid;
        let tail = '', carry = '', lastP = -1;
        onAbort = () => { kill(child); reject(abortError()); };
        signal?.addEventListener('abort', onAbort, {once: true});
        child.stderr.on('data', bytes => {
          const text = carry + bytes; const lines = text.split(/\r?\n|\r/); carry = lines.pop();
          for (const line of lines) { const p = parseProgress(line); if (p !== null && p !== lastP) { lastP = p; onProgress?.({phase: 'transcribe', progress: p}); } }
          tail = (tail + bytes).slice(-2048);
        });
        child.once('error', error => reject(new Error(`whisper-cli could not start: ${error.message}`)));
        child.once('close', code => code === 0 ? resolve() : reject(new Error(`whisper-cli exited with code ${code}: ${tail.trim().split(/\r?\n/).slice(-3).join(' | ')}`)));
      });
      onProgress?.({phase: 'transcribe', progress: 1});
      const json = JSON.parse(await fs.readFile(base + '.json', 'utf8'));
      return parseWhisperJson(json, {model, duration: pcm.length / 16000});
    } finally {
      signal?.removeEventListener('abort', onAbort); if (child && child.exitCode === null) kill(child);
      this.pid = null; await fs.rm(dir, {recursive: true, force: true}).catch(() => {});
    }
  }

  /** pidusage shells out to PowerShell on Windows (~1 s per call), so serve the last reading and refresh it behind the caller. cpu is % of the whole machine (pidusage's per-core figure / cores). */
  async processStats() {
    const pid = this.pid; if (!pid) { this.procCache = null; return null; }
    const cache = this.procCache?.pid === pid ? this.procCache : (this.procCache = {pid, at: 0, value: null, pending: null});
    if (!cache.pending && Date.now() - cache.at > 1000) cache.pending = require('pidusage')(pid)
      .then(stat => { cache.value = {pid, cpu: Math.round(stat.cpu / os.cpus().length * 10) / 10, memory: stat.memory}; }, () => {}) /* process just exited */
      .finally(() => { cache.at = Date.now(); cache.pending = null; });
    if (!cache.value && cache.pending) await cache.pending;
    return this.pid === pid ? cache.value : null;
  }
  async systemStats() {
    const si = require('systeminformation');
    const [load, mem, gpus] = await Promise.all([si.currentLoad().catch(() => null), si.mem().catch(() => null), this.gpuList()]);
    const proc = await this.processStats();
    return {
      cpu: {load: load ? Math.round(load.currentLoad * 10) / 10 : null, cores: os.cpus().length},
      memory: mem ? {used: mem.total - mem.available, total: mem.total} : {used: os.totalmem() - os.freemem(), total: os.totalmem()},
      gpus: gpus.map(g => ({...g})), process: proc,
    };
  }
}

module.exports = {WhisperService, MODELS, parseWhisperJson, parseProgress, encodeWav, selectAsset, fallbackAsset};
