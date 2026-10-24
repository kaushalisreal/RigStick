/** Main-thread wrapper around transformers-worker.mjs. One worker, jobs run one at a time (the worker queues them). */
import {TRANSFORMERS_MODELS} from './transformers-models.mjs';

export class TransformersEngine {
  /** workerUrl: URL of transformers-worker.mjs. moduleUrl: where the app serves transformers.web.js. wasmPaths: prefix string or {mjs, wasm} URLs of the onnxruntime-web files. */
  constructor({workerUrl, moduleUrl, wasmPaths} = {}) {
    if (!workerUrl || !moduleUrl) throw new Error('workerUrl and moduleUrl are required');
    Object.assign(this, {workerUrl, moduleUrl, wasmPaths}); this.worker = null; this.jobs = new Map(); this.next = 1; this.ready = null;
  }
  static models({webgpu = false} = {}) {
    return TRANSFORMERS_MODELS.map(m => ({id: m.id, label: m.label, approxMB: webgpu ? m.approxMB.webgpu : m.approxMB.wasm, englishOnly: m.englishOnly}));
  }
  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const worker = this.worker = new Worker(this.workerUrl, {type: 'module'});
      worker.onmessage = ({data}) => {
        if (data.type === 'ready') return resolve();
        const job = this.jobs.get(data.id);
        if (data.type === 'error' && data.id == null) { reject(new Error(data.message)); this.terminate(); }
        else if (data.type === 'progress') job?.onProgress?.(data);
        else if (data.type === 'result') { this.jobs.delete(data.id); job?.resolve(data.result); }
        else if (data.type === 'error') { this.jobs.delete(data.id); job?.reject(data.cancelled ? Object.assign(new Error(data.message), {name: 'AbortError'}) : new Error(data.message)); }
      };
      worker.onerror = event => { const error = new Error(event.message || 'The transcription worker failed'); reject(error); this.terminate(error); };
      worker.postMessage({type: 'init', moduleUrl: this.moduleUrl, wasmPaths: this.wasmPaths});
    });
    return this.ready;
  }
  terminate(error = new Error('The transcription worker stopped')) {
    this.worker?.terminate(); this.worker = null; this.ready = null;
    for (const job of this.jobs.values()) job.reject(error);
    this.jobs.clear();
  }
  /** pcm: Float32Array, 16 kHz mono (not detached; it is copied to the worker). onProgress gets the worker's {phase, progress, file?, loaded?, total?}. */
  async transcribe({pcm, model, language = 'auto', onProgress, signal} = {}) {
    if (signal?.aborted) throw Object.assign(new Error('Transcription cancelled'), {name: 'AbortError'});
    await this.start();
    const id = this.next++, copy = pcm.slice();
    return new Promise((resolve, reject) => {
      this.jobs.set(id, {resolve, reject, onProgress});
      signal?.addEventListener('abort', () => this.worker?.postMessage({type: 'cancel', id}), {once: true});
      this.worker.postMessage({type: 'transcribe', id, pcm: copy, model, language}, [copy.buffer]);
    });
  }
}
