/** What a browser will tell us about the machine, in the shape of the desktop WhisperService.systemStats(). Never throws. */
export async function webStats() {
  const stats = {cpu: {load: null, cores: null}, memory: {used: null, total: null}, gpus: [], process: null};
  try { stats.cpu.cores = globalThis.navigator?.hardwareConcurrency ?? null; } catch { /* hidden by privacy settings */ }
  try {
    stats.memory.used = globalThis.performance?.memory?.usedJSHeapSize ?? null; // Chromium only; the JS heap, not the whole tab
    stats.memory.total = (globalThis.navigator?.deviceMemory ?? 0) * 2 ** 30 || null; // bucketed (max 8 GiB) by design
  } catch { /* ignore */ }
  try {
    const adapter = await globalThis.navigator?.gpu?.requestAdapter();
    if (adapter) {
      const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
      stats.gpus.push({name: info.description || info.device || info.architecture || info.vendor || 'WebGPU adapter', vendor: info.vendor || '', architecture: info.architecture || '', utilization: null, memoryUsed: null, memoryTotal: null});
    }
  } catch { /* no WebGPU */ }
  return stats;
}
