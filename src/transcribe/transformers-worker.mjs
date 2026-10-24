/**
 * Module worker: Whisper through transformers.js (WebGPU, else wasm). Protocol, all messages {type, id?, ...}:
 *   in : init {moduleUrl, wasmPaths}  (first; wasmPaths is a prefix string or {mjs, wasm})
 *        transcribe {id, pcm: Float32Array 16 kHz mono, model, language: 'auto'|code}   cancel {id}
 *   out: ready | progress {id, phase: 'model'|'transcribe', progress 0..1, file?, loaded?, total?} | result {id, result} | error {id, message, cancelled?}
 * Models must be the `*_timestamped` ONNX exports (see transformers-models.mjs): only those emit the cross-attentions word timestamps are aligned from.
 */
import {dtypeFor, isEnglishOnly} from './transformers-models.mjs';

const RATE = 16000, PIECE_S = 60, SEARCH_S = 4;
/** Cut points near every PIECE_S seconds, each moved to the quietest 50 ms inside +-SEARCH_S so no word is split; lets progress and cancel work between pieces. */
export function splitAtSilence(pcm, pieceSeconds = PIECE_S) {
  const cuts = [0], hop = RATE / 20;
  while (pcm.length - cuts.at(-1) > pieceSeconds * 1.5 * RATE) {
    const target = cuts.at(-1) + pieceSeconds * RATE, lo = Math.max(cuts.at(-1) + RATE, target - SEARCH_S * RATE), hi = Math.min(pcm.length - RATE, target + SEARCH_S * RATE);
    let best = target, quiet = Infinity;
    for (let at = lo; at + hop <= hi; at += hop) { let sum = 0; for (let i = at; i < at + hop; i += 4) sum += pcm[i] * pcm[i]; if (sum < quiet) { quiet = sum; best = at + (hop >> 1); } }
    cuts.push(Math.round(best));
  }
  cuts.push(pcm.length);
  return cuts.slice(1).map((end, i) => [cuts[i], end]);
}

/** Pipeline word chunks [{text, timestamp:[s, e|null]}] -> shared words, shifted by `offset` seconds. */
export function wordsFromChunks(chunks, offset = 0) {
  const words = [];
  for (const chunk of chunks || []) {
    const text = String(chunk.text ?? '').trim();
    if (!text || /^(\[[^\]]*\]|\([^)]*\)|[♪♫\s]+)$/.test(text)) continue;
    const start = (chunk.timestamp?.[0] ?? 0) + offset, end = chunk.timestamp?.[1] ?? null;
    words.push({start, end: end === null || end < chunk.timestamp[0] ? start : end + offset, text});
  }
  return words.sort((a, b) => a.start - b.start || a.end - b.end);
}
/** Sentences for display: break after terminal punctuation, on a >1.5 s pause, or at 40 words. */
export function segmentsFromWords(words) {
  const segments = []; let open = null;
  for (const w of words) {
    if (open && w.start - open.end > 1.5) { segments.push(open); open = null; }
    if (!open) open = {start: w.start, end: w.end, text: w.text, n: 1}; else { open.end = Math.max(open.end, w.end); open.text += ' ' + w.text; open.n++; }
    if (/[.!?…。！？]["')\]]*$/.test(w.text) || open.n >= 40) { segments.push(open); open = null; }
  }
  if (open) segments.push(open);
  return segments.map(({start, end, text}) => ({start, end, text}));
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  let lib, wasmPaths, pipe = null, pipeKey = '', cancelled = new Set(), queue = Promise.resolve();
  const post = message => self.postMessage(message);
  const wasAborted = id => cancelled.has(id);

  async function webgpuAvailable() { try { return !!(await navigator.gpu?.requestAdapter()); } catch { return false; } }
  async function load(id, model, device) {
    const key = `${model}|${device}`;
    if (pipe && pipeKey === key) return pipe;
    await pipe?.dispose?.(); pipe = null; pipeKey = '';
    const files = new Map();
    const progress_callback = e => {
      if (e.status !== 'progress' && e.status !== 'done') return;
      const f = files.get(e.file) ?? {loaded: 0, total: 0};
      if (e.status === 'progress') { f.loaded = e.loaded; f.total = e.total; } else f.loaded = f.total ||= f.loaded;
      files.set(e.file, f);
      let loaded = 0, total = 0; for (const v of files.values()) { loaded += v.loaded; total += v.total; }
      post({type: 'progress', id, phase: 'model', file: e.file, loaded, total, progress: total ? Math.min(1, loaded / total) : 0});
    };
    pipe = await lib.pipeline('automatic-speech-recognition', model, {device, dtype: dtypeFor(model, device), progress_callback});
    pipeKey = key; return pipe;
  }
  async function run({id, pcm, model, language}) {
    if (!lib) throw new Error('The transcription worker was not initialised');
    if (!/^[\w.-]+\/[\w.-]+$/.test(model || '')) throw new Error(`Unsupported model id: ${model}`);
    const wanted = (await webgpuAvailable()) ? 'webgpu' : 'wasm';
    let transcriber;
    try { transcriber = await load(id, model, wanted); }
    catch (error) { if (wanted === 'wasm') throw error; transcriber = await load(id, model, 'wasm'); } // WebGPU adapter exists but the session failed
    post({type: 'progress', id, phase: 'model', progress: 1});
    const options = {return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5};
    if (!isEnglishOnly(model)) { options.task = 'transcribe'; if (language && language !== 'auto') options.language = language; } // English-only checkpoints reject task/language
    const pieces = splitAtSilence(pcm), words = [];
    for (let i = 0; i < pieces.length; i++) {
      if (wasAborted(id)) throw Object.assign(new Error('Transcription cancelled'), {cancelled: true});
      const [a, b] = pieces[i];
      const out = await transcriber(pcm.subarray(a, b), options);
      words.push(...wordsFromChunks(out.chunks, a / RATE));
      post({type: 'progress', id, phase: 'transcribe', progress: (i + 1) / pieces.length});
    }
    return {engine: 'transformers.js', model, language: isEnglishOnly(model) ? 'en' : options.language ?? null, duration: pcm.length / RATE, segments: segmentsFromWords(words), words};
  }

  self.onmessage = ({data}) => {
    if (data?.type === 'init') {
      queue = queue.then(async () => {
        try {
          lib = await import(data.moduleUrl); const env = lib.env;
          env.allowLocalModels = false; env.allowRemoteModels = true; env.useBrowserCache = true;
          wasmPaths = data.wasmPaths; if (wasmPaths) env.backends.onnx.wasm.wasmPaths = wasmPaths;
          post({type: 'ready'});
        } catch (error) { post({type: 'error', id: null, message: `Could not load transformers.js: ${error?.message || error}`}); }
      });
    } else if (data?.type === 'cancel') cancelled.add(data.id);
    else if (data?.type === 'transcribe') {
      queue = queue.then(async () => {
        try { post({type: 'result', id: data.id, result: await run(data)}); }
        catch (error) { post({type: 'error', id: data.id, message: error?.message || String(error), cancelled: !!error?.cancelled}); }
        finally { cancelled.delete(data.id); }
      });
    }
  };
}
