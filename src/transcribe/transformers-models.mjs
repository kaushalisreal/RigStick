/**
 * Whisper checkpoints for transformers.js that expose cross-attentions, which `return_timestamps: 'word'` needs (the plain onnx-community/whisper-* exports do not).
 * Per-session dtypes: on WebGPU the encoder stays fp32 and the merged decoder is 4-bit; on wasm everything is 8-bit. approxMB is the download for the default device.
 */
export const TRANSFORMERS_MODELS = [
  {id: 'onnx-community/whisper-tiny.en_timestamped', label: 'Tiny (English)', englishOnly: true, approxMB: {webgpu: 120, wasm: 41}},
  {id: 'onnx-community/whisper-tiny_timestamped', label: 'Tiny', englishOnly: false, approxMB: {webgpu: 120, wasm: 41}},
  {id: 'onnx-community/whisper-base.en_timestamped', label: 'Base (English)', englishOnly: true, approxMB: {webgpu: 206, wasm: 77}},
  {id: 'onnx-community/whisper-base_timestamped', label: 'Base', englishOnly: false, approxMB: {webgpu: 206, wasm: 77}},
  {id: 'onnx-community/whisper-small.en_timestamped', label: 'Small (English)', englishOnly: true, approxMB: {webgpu: 586, wasm: 249}},
  {id: 'onnx-community/whisper-small_timestamped', label: 'Small', englishOnly: false, approxMB: {webgpu: 586, wasm: 249}},
  // The fp32 turbo encoder is ~2.5 GB of external data, so WebGPU uses the fp16 encoder; not run-tested here.
  {id: 'onnx-community/whisper-large-v3-turbo_timestamped', label: 'Large v3 turbo (experimental)', englishOnly: false, approxMB: {webgpu: 1100, wasm: 1085}, dtype: {webgpu: {encoder_model: 'fp16', decoder_model_merged: 'q4'}}},
];
export const DEFAULT_DTYPE = {webgpu: {encoder_model: 'fp32', decoder_model_merged: 'q4'}, wasm: 'q8'};
export const dtypeFor = (id, device) => TRANSFORMERS_MODELS.find(m => m.id === id)?.dtype?.[device] ?? DEFAULT_DTYPE[device];
export const isEnglishOnly = id => TRANSFORMERS_MODELS.find(m => m.id === id)?.englishOnly ?? /\.en(_|$)/.test(id);
