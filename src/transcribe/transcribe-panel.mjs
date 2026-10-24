// The Transcribe panel: pick an audio track, press Transcribe, and RigStick downloads Whisper on
// first use and writes a word-timed transcript the user (and AI clients, via rigstick_get_transcript)
// can use to time animation. Two engines: whisper.cpp in the desktop app on Windows (native, GPU when
// the CUDA build fits) and Transformers.js everywhere else (in-page, WebGPU when available).
// While it works, live meters show CPU, memory and GPU use.
import { el, svg } from '../ai/ai-panel.mjs';
import { toMono16k } from './audio-pcm.mjs';
import { TransformersEngine } from './transformers-engine.mjs';
import { TRANSFORMERS_MODELS } from './transformers-models.mjs';
import { webStats } from './web-stats.mjs';

const SIZES = [
  {id: 'tiny', label: 'Tiny — fastest', cpp: 'tiny', web: 'onnx-community/whisper-tiny_timestamped'},
  {id: 'base', label: 'Base — balanced', cpp: 'base', web: 'onnx-community/whisper-base_timestamped'},
  {id: 'small', label: 'Small — accurate', cpp: 'small', web: 'onnx-community/whisper-small_timestamped'},
  {id: 'medium', label: 'Medium — very accurate (slow)', cpp: 'medium', web: null},
  {id: 'turbo', label: 'Large v3 turbo — best', cpp: 'large-v3-turbo', web: 'onnx-community/whisper-large-v3-turbo_timestamped'},
];
const LANGUAGES = [['auto', 'Detect language'], ['en', 'English'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'],
  ['ar', 'Arabic'], ['bn', 'Bengali'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ru', 'Russian'], ['it', 'Italian'], ['tr', 'Turkish'], ['ur', 'Urdu']];
export const ORT_VERSION = '1.31.0-dev.20260914-8d85527a0';
const bytes = value => value == null ? '—' : value >= 2 ** 30 ? `${(value / 2 ** 30).toFixed(1)} GB` : `${Math.round(value / 2 ** 20)} MB`;
const percent = value => value == null ? '—' : `${Math.round(value)}%`;
const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function assetBlob(asset) {
  const parts = asset.chunks.map(chunk => Uint8Array.from(atob(chunk.data_base64), c => c.charCodeAt(0)));
  return new Blob(parts);
}

export class TranscribePanel {
  constructor({root, editor, desktop, audioEngine, notify = () => {}}) {
    Object.assign(this, {root, editor, desktop, audioEngine, notify});
    this.track = null; this.size = 'base'; this.language = 'auto'; this.engineChoice = 'auto';
    this.running = null; this.statsTimer = null; this.visible = false;
    this.native = Boolean(desktop?.transcribeWhisper);
    root.classList.add('ai-panel', 'transcribe-panel');
    this.render();
    editor.addEventListener?.('change', () => { if (this.visible && !this.running) this.renderTracks(); });
    desktop?.onWhisperProgress?.(value => this.progress(value));
    if (this.native) desktop.whisperStatus().then(status => { this.nativeStatus = status; this.renderEngine(); }).catch(() => {});
  }

  /** Every saved transcript: [{track, name, offset, result}] (also read by the AI tools). */
  transcripts() {
    const store = this.editor.report._rigs?.rigstickTranscripts ?? {};
    return Object.entries(store).map(([track, item]) => ({track, ...item}));
  }
  get tracks() { return this.editor.report._rigs?.audio?.tracks ?? []; }

  render() {
    const select = (options, value, onchange) => {
      const node = el('select', {className: 'ui-field-input', onchange: () => onchange(node.value)}, options.map(([id, label]) => el('option', {value: id, textContent: label})));
      node.value = value; return node;
    };
    this.trackList = el('div', {className: 'transcribe-tracks', role: 'radiogroup', ariaLabel: 'Audio track'});
    this.engineSelect = select([['auto', 'Automatic'], ['cpp', 'whisper.cpp (native)'], ['web', 'In-app (Transformers.js)']], this.engineChoice, value => { this.engineChoice = value; this.renderEngine(); });
    this.sizeSelect = select(SIZES.map(size => [size.id, size.label]), this.size, value => { this.size = value; this.renderEngine(); });
    this.languageSelect = select(LANGUAGES, this.language, value => { this.language = value; });
    this.engineNote = el('p', {className: 'ai-hint'});
    this.start = el('button', {type: 'button', className: 'ui-button', dataset: {variant: 'primary'}, onclick: () => this.running ? this.cancel() : this.transcribe()}, svg('music'), el('span', {textContent: 'Transcribe'}));
    this.phase = el('p', {className: 'ai-text transcribe-phase'});
    this.bar = el('progress', {className: 'transcribe-bar', max: 1, value: 0, hidden: true});
    this.meters = el('dl', {className: 'transcribe-meters'});
    this.result = el('div', {className: 'transcribe-result'});
    const field = (label, control) => el('label', {className: 'transcribe-field'}, el('span', {textContent: label}), control);
    this.root.replaceChildren(
      el('section', {className: 'ai-card'},
        el('h3', {className: 'ai-title', textContent: 'Transcribe audio'}),
        el('p', {className: 'ai-text', textContent: 'Turn a voiceover into word-by-word timings. Whisper runs on this device; nothing is uploaded.'}),
        this.trackList,
        field('Engine', this.engineSelect), field('Model', this.sizeSelect), field('Language', this.languageSelect),
        this.engineNote, this.start, this.phase, this.bar),
      el('section', {className: 'ai-card'}, el('h3', {className: 'ai-title', textContent: 'This device'}), this.meters),
      el('section', {className: 'ai-card'}, el('h3', {className: 'ai-title', textContent: 'Transcript'}), this.result));
    this.renderTracks(); this.renderEngine(); this.renderResult(); this.renderMeters(null);
  }

  panelVisible(visible) {
    this.visible = visible;
    clearInterval(this.statsTimer); this.statsTimer = null;
    if (visible) { this.renderTracks(); this.pollStats(); this.statsTimer = setInterval(() => this.pollStats(), this.running ? 1000 : 3000); }
  }
  async pollStats() {
    try { this.renderMeters(this.native ? await this.desktop.systemStats() : await webStats()); } catch { this.renderMeters(null); }
  }
  renderMeters(stats) {
    const row = (label, value, fill) => [el('dt', {textContent: label}), el('dd', {}, el('span', {textContent: value}),
      fill == null ? null : el('meter', {min: 0, max: 100, value: Math.max(0, Math.min(100, fill)), low: 60, high: 85, optimum: 20}))];
    if (!stats) { this.meters.replaceChildren(el('dt', {textContent: 'Reading…'})); return; }
    const memory = stats.memory ?? {}, cpu = stats.cpu ?? {};
    const rows = [
      row('CPU', cpu.load == null ? `${cpu.cores ?? '?'} cores` : `${percent(cpu.load)} of ${cpu.cores} cores`, cpu.load),
      row('Memory', memory.total ? `${bytes(memory.used)} of ${bytes(memory.total)}` : bytes(memory.used), memory.total && memory.used ? memory.used / memory.total * 100 : null),
      ...(stats.gpus ?? []).slice(0, 2).map(gpu => row(gpu.name ?? 'GPU',
        [gpu.utilization == null ? null : `${percent(gpu.utilization)} busy`, gpu.memoryTotal ? `${bytes(gpu.memoryUsed)} of ${bytes(gpu.memoryTotal)} VRAM` : null].filter(Boolean).join(' · ') || 'Usage not reported by this GPU',
        gpu.utilization)),
    ];
    if (stats.process) rows.push(row('Whisper', `${percent(stats.process.cpu)} CPU · ${bytes(stats.process.memory)}`, stats.process.cpu));
    this.meters.replaceChildren(...rows.flat());
  }

  renderTracks() {
    const tracks = this.tracks, done = new Set(this.transcripts().map(item => item.track));
    if (!tracks.length) {
      this.trackList.replaceChildren(el('p', {className: 'ai-hint', textContent: 'No audio yet. Open the timeline’s Audio (♪) view and import a voiceover, then come back here.'}));
      this.track = null; this.start.disabled = true; return;
    }
    if (!tracks.some(track => track.id === this.track)) this.track = tracks.find(track => track.clips.length)?.id ?? tracks[0].id;
    this.trackList.replaceChildren(...tracks.map(track => {
      const length = Math.max(0, ...track.clips.map(clip => clip.start + clip.duration));
      return el('label', {className: 'transcribe-track'},
        el('input', {type: 'radio', name: 'transcribe-track', value: track.id, checked: track.id === this.track, disabled: !track.clips.length, onchange: () => { this.track = track.id; this.renderResult(); }}),
        el('span', {className: 'transcribe-track-name', textContent: track.name}),
        el('span', {className: 'ai-hint', textContent: `${track.clips.length} clip${track.clips.length === 1 ? '' : 's'} · ${time(length)}${done.has(track.id) ? ' · transcribed' : ''}`}));
    }));
    this.start.disabled = !this.running && !tracks.find(track => track.id === this.track)?.clips.length;
  }

  engineFor() {
    const cppOk = this.native && this.nativeStatus?.supported !== false;
    if (this.engineChoice === 'cpp') return cppOk ? 'cpp' : 'web';
    if (this.engineChoice === 'web') return 'web';
    return cppOk ? 'cpp' : 'web';
  }
  renderEngine() {
    const engine = this.engineFor(), size = SIZES.find(item => item.id === this.size);
    if (engine === 'cpp') {
      const model = this.nativeStatus?.models?.find(item => item.name === size.cpp), binary = this.nativeStatus?.binary;
      const needs = [!binary?.installed ? 'whisper.cpp' : null, !model?.installed ? `the ${size.cpp} model (${bytes(model?.bytes)})` : null].filter(Boolean);
      this.engineNote.textContent = `whisper.cpp${binary?.installed ? ` ${binary.version ?? ''} (${binary.variant === 'cuda' ? 'NVIDIA GPU' : 'CPU'})` : ''}. ${needs.length ? `First run downloads ${needs.join(' and ')}.` : 'Ready.'}`;
    } else {
      const model = TRANSFORMERS_MODELS.find(item => item.id === size.web);
      this.engineNote.textContent = model
        ? `Runs inside RigStick${navigator.gpu ? ' on the GPU (WebGPU) when it can' : ''}. First run downloads about ${model.approxMB[navigator.gpu ? 'webgpu' : 'wasm']} MB, then it is cached.${this.native && this.nativeStatus?.supported === false ? ' (whisper.cpp builds are published for Windows only.)' : ''}`
        : 'This size is only available with whisper.cpp in the Windows desktop app. Pick Small or Large v3 turbo.';
    }
    this.start.disabled = !this.running && (engine === 'web' && !size.web || !this.tracks.find(track => track.id === this.track)?.clips.length);
  }

  progress(value) {
    if (!this.running) return;
    const names = {binary: 'Downloading whisper.cpp', extract: 'Unpacking whisper.cpp', model: 'Downloading the model', transcribe: 'Transcribing', decode: 'Reading the audio'};
    const fraction = value.progress ?? (value.total ? value.received / value.total : null);
    this.phase.textContent = `${names[value.phase] ?? 'Working'}${value.file ? ` (${value.file.split('/').pop()})` : ''}${fraction == null ? '…' : ` ${Math.round(fraction * 100)}%`}${this.running.clip ? ` · clip ${this.running.clip}` : ''}`;
    this.bar.hidden = false; if (fraction == null) this.bar.removeAttribute('value'); else this.bar.value = fraction;
  }

  async transcribe() {
    const track = this.tracks.find(item => item.id === this.track);
    if (!track?.clips.length) return;
    const engine = this.engineFor(), size = SIZES.find(item => item.id === this.size), controller = new AbortController();
    this.running = {controller, clip: 0};
    this.start.lastChild.textContent = 'Cancel'; this.start.dataset.variant = 'outline';
    this.panelVisible(this.visible);
    try {
      if (engine === 'cpp') { this.progress({phase: 'binary'}); this.nativeStatus = await this.desktop.prepareWhisper(size.cpp); this.renderEngine(); }
      const words = [], segments = []; let result = null;
      for (const [index, clip] of [...track.clips].sort((a, b) => a.start - b.start).entries()) {
        if (controller.signal.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
        this.running.clip = track.clips.length > 1 ? `${index + 1}/${track.clips.length}` : 0;
        this.progress({phase: 'decode'});
        const asset = this.editor.report._rigs.audio.assets[clip.assetId];
        // The desktop decodes any length through FFmpeg; the browser decodes the original file itself.
        const wav = this.native && this.audioEngine?.decode ? await this.audioEngine.decode(assetBlob(asset), controller.signal) : assetBlob(asset);
        const full = await toMono16k(wav, {signal: controller.signal});
        const pcm = full.subarray(Math.floor(clip.offset * 16000), Math.min(full.length, Math.ceil((clip.offset + clip.duration) * 16000)));
        result = engine === 'cpp'
          ? await this.desktop.transcribeWhisper({pcm: pcm.slice().buffer, model: size.cpp, language: this.language})
          : await (this.web ??= new TransformersEngine(this.webOptions())).transcribe({pcm, model: size.web, language: this.language, signal: controller.signal, onProgress: value => this.progress(value)});
        const shift = clip.start;
        words.push(...result.words.map(word => ({...word, start: word.start + shift, end: word.end + shift})));
        segments.push(...result.segments.map(segment => ({...segment, start: segment.start + shift, end: segment.end + shift})));
      }
      const store = this.editor.report._rigs.rigstickTranscripts ??= {};
      store[track.id] = {name: track.name, offset: 0, at: Date.now(), result: {...result, words, segments, duration: Math.max(0, ...words.map(word => word.end))}};
      this.phase.textContent = `Done: ${words.length} words.`; this.notify(`Transcribed ${track.name}: ${words.length} words.`);
    } catch (error) {
      this.phase.textContent = error.name === 'AbortError' ? 'Cancelled.' : `Could not transcribe: ${error.message}`;
      if (error.name !== 'AbortError') this.notify(error.message, true);
    } finally {
      this.running = null; this.bar.hidden = true;
      this.start.lastChild.textContent = 'Transcribe'; this.start.dataset.variant = 'primary';
      this.panelVisible(this.visible); this.renderTracks(); this.renderResult();
    }
  }
  cancel() { this.running?.controller.abort(); if (this.engineFor() === 'cpp') this.desktop.cancelWhisper(); }

  webOptions() {
    const base = new URL('../../vendor/transformers/', import.meta.url);
    // The wasm is too large for the web host, so it comes from jsDelivr, pinned to the onnxruntime
    // build transformers.js bundles (bump ORT_VERSION with @huggingface/transformers).
    return {workerUrl: new URL('./transformers-worker.mjs', import.meta.url), moduleUrl: new URL('transformers.js', base).href,
      wasmPaths: {mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', base).href, wasm: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort-wasm-simd-threaded.asyncify.wasm`}};
  }

  renderResult() {
    const item = this.transcripts().find(entry => entry.track === this.track);
    if (!item) { this.result.replaceChildren(el('p', {className: 'ai-hint', textContent: 'The transcript appears here. Click a word to jump to it on the timeline.'})); return; }
    const fps = this.editor.report.fps || 24;
    const words = el('p', {className: 'transcribe-words'}, item.result.words.map(word => el('button', {type: 'button', className: 'transcribe-word', textContent: word.text,
      title: `${word.start.toFixed(2)} s · frame ${Math.floor(word.start * fps) + 1}`, onclick: () => { this.editor.seek(Math.floor(word.start * fps)); }})));
    const copy = el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm', variant: 'outline'}, onclick: () => navigator.clipboard.writeText(item.result.segments.map(segment => segment.text).join(' '))}, svg('clipboard'), el('span', {textContent: 'Copy text'}));
    const clear = el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm', variant: 'ghost'}, textContent: 'Remove', onclick: () => { delete this.editor.report._rigs.rigstickTranscripts[item.track]; this.renderTracks(); this.renderResult(); }});
    this.result.replaceChildren(
      el('p', {className: 'ai-hint', textContent: `${item.result.engine} · ${item.result.model} · ${item.result.language ?? 'auto'} · ${item.result.words.length} words. Connected AI apps can read it with rigstick_get_transcript.`}),
      words, el('div', {className: 'ai-row'}, copy, clear));
  }
}
