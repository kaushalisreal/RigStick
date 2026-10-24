/** Decode any audio source to the 16 kHz mono Float32 that both transcription engines take. Main thread only (OfflineAudioContext is not in workers). */
export const WHISPER_RATE = 16000;
const aborted = () => new DOMException('Audio decoding cancelled', 'AbortError');
const check = signal => { if (signal?.aborted) throw aborted(); };

/** Blob | ArrayBuffer | AudioBuffer -> Float32Array, 16 kHz, mono (channels are averaged by the Web Audio down-mix). */
export async function toMono16k(input, {signal} = {}) {
  check(signal);
  let buffer = input;
  if (!(typeof AudioBuffer !== 'undefined' && input instanceof AudioBuffer)) {
    const bytes = input instanceof ArrayBuffer ? input : ArrayBuffer.isView(input) ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) : await input.arrayBuffer();
    check(signal);
    // decodeAudioData resamples to the context rate, so a 16 kHz context already does the rate conversion; the render below is then a straight copy plus the mono down-mix.
    buffer = await new OfflineAudioContext(1, 1, WHISPER_RATE).decodeAudioData(bytes);
    check(signal);
  }
  const frames = Math.max(1, Math.ceil(buffer.duration * WHISPER_RATE));
  const context = new OfflineAudioContext(1, frames, WHISPER_RATE), source = context.createBufferSource();
  source.buffer = buffer; source.connect(context.destination); source.start();
  const rendered = await context.startRendering();
  check(signal);
  return rendered.getChannelData(0).slice();
}

/** 16-bit PCM mono WAV bytes (for sending a recording to the desktop whisper.cpp service). */
export function wavBytes(samples, rate = WHISPER_RATE) {
  const out = new Uint8Array(44 + samples.length * 2), view = new DataView(out.buffer);
  const tag = (at, text) => { for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); tag(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const v = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0; view.setInt16(44 + i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true); }
  return out;
}
