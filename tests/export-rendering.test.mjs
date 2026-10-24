// Export rendering (docs/EXPORT-RENDERING.md): the GPU/CPU preference picks GPU-backed export canvases and,
// for H.264, a hardware encoder that is proven to work on this machine before it is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {normalizeEditorSettings} from '../src/settings.mjs';

const {VideoExportService, validateConfig, encoderArguments} = createRequire(import.meta.url)('../desktop/video-export-service.cjs');
const base = {format: 'mp4', codec: 'h264', width: 64, height: 48, fps: 24, totalFrames: 2, quality: 0.9};

test('the preference is kept and defaults to automatic', () => {
  assert.equal(normalizeEditorSettings({}).exportDevice, 'auto');
  assert.equal(normalizeEditorSettings({exportDevice: 'gpu'}).exportDevice, 'gpu');
  assert.equal(normalizeEditorSettings({exportDevice: 'cpu'}).exportDevice, 'cpu');
  assert.equal(normalizeEditorSettings({exportDevice: 'quantum'}).exportDevice, 'auto');
  assert.equal(validateConfig(base).device, 'cpu');
  assert.equal(validateConfig({...base, device: 'gpu'}).device, 'gpu');
});

test('H.264 uses the hardware encoder it was given, libx264 otherwise', () => {
  const nvenc = {encoder: 'h264_nvenc', pixelFormat: 'yuv420p', args: (q, b) => b ? ['-b:v', String(b)] : ['-cq', String(q)]};
  const gpu = encoderArguments({...validateConfig({...base, device: 'gpu'}), hardware: nvenc}, '/tmp/out.mp4');
  assert.ok(gpu.includes('h264_nvenc') && gpu.includes('-cq') && !gpu.includes('libx264') && !gpu.includes('zerolatency'));
  const cpu = encoderArguments({...validateConfig(base), hardware: null}, '/tmp/out.mp4');
  assert.ok(cpu.includes('libx264') && cpu.includes('-crf'));
  const vp9 = encoderArguments({...validateConfig({...base, format: 'webm', codec: 'vp9', device: 'gpu'}), hardware: nvenc}, '/tmp/out.webm');
  assert.ok(vp9.includes('libvpx-vp9') && !vp9.includes('h264_nvenc'));
});

async function fakeEncoder(script) {
  const directory = await mkdtemp(path.join(tmpdir(), 'rigs-fake-ffmpeg-')), file = path.join(directory, 'ffmpeg');
  await writeFile(file, `#!/bin/sh\n${script}\n`); await chmod(file, 0o755);
  return {file, cleanup: () => rm(directory, {recursive: true, force: true})};
}

test('a listed encoder without working hardware is skipped', {skip: process.platform === 'win32'}, async () => {
  // Lists NVENC and Quick Sync; only Quick Sync's test encode succeeds.
  const fake = await fakeEncoder(`case "$*" in *-encoders*) echo " V..... h264_nvenc NVIDIA"; echo " V..... h264_qsv Intel"; exit 0;; *h264_qsv*) exit 0;; *) exit 1;; esac`);
  try { assert.equal((await new VideoExportService({encoderPath: fake.file}).hardwareEncoder())?.encoder, 'h264_qsv'); }
  finally { await fake.cleanup(); }
});

test('no usable hardware encoder means libx264', {skip: process.platform === 'win32'}, async () => {
  const fake = await fakeEncoder(`case "$*" in *-encoders*) echo " V..... h264_nvenc NVIDIA"; exit 0;; *) exit 1;; esac`);
  try { assert.equal(await new VideoExportService({encoderPath: fake.file}).hardwareEncoder(), null); }
  finally { await fake.cleanup(); }
});
