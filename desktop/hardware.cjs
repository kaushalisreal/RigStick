'use strict';
// Settings → Hardware: which graphics card RigStick draws on and which video encoder exports use.
//
// Laptops with two GPUs (an integrated one in the processor and a dedicated card) hand every app the
// integrated GPU unless the app asks otherwise: Chromium's GPU process opens the system's default adapter.
// The `force_high_performance_gpu` switch makes it pick the high-performance adapter instead, so the
// editor, playback and export rendering (WebGPU) all run on the dedicated card. Switches only take effect
// before the app is ready, so the choice is read synchronously at startup and a change asks for a restart.
const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./recovery.cjs');

const FILE = 'hardware.json';
const GPU_CHOICES = ['high-performance', 'system'];
// 'auto' tries every hardware encoder in order; 'software' always uses libx264 (video-export-service.cjs).
const ENCODER_CHOICES = ['auto', 'h264_nvenc', 'h264_amf', 'h264_qsv', 'h264_mf', 'software'];
const DEFAULTS = Object.freeze({ gpu: 'high-performance', videoEncoder: 'auto' });

function normalize(value) {
  return {
    gpu: GPU_CHOICES.includes(value?.gpu) ? value.gpu : DEFAULTS.gpu,
    videoEncoder: ENCODER_CHOICES.includes(value?.videoEncoder) ? value.videoEncoder : DEFAULTS.videoEncoder,
  };
}

/** The saved choices, read synchronously (startup, before app ready). A missing or damaged file gives the defaults. */
function readHardwareSync(directory) {
  try { return normalize(JSON.parse(fs.readFileSync(path.join(directory, FILE), 'utf8'))); }
  catch { return { ...DEFAULTS }; }
}

async function writeHardware(directory, value) {
  const choices = normalize(value);
  await fs.promises.mkdir(directory, { recursive: true });
  await atomicWrite(path.join(directory, FILE), JSON.stringify(choices));
  return choices;
}

/** Applies the GPU choice to Electron's app.commandLine. RIGS_GPU=system|high-performance overrides the file. */
function applyGpuPreference(commandLine, choices, env = process.env) {
  const gpu = GPU_CHOICES.includes(env.RIGS_GPU) ? env.RIGS_GPU : choices.gpu;
  if (gpu === 'high-performance' && !commandLine.hasSwitch('force_low_power_gpu')) commandLine.appendSwitch('force_high_performance_gpu');
  return gpu;
}

/** What Settings → Hardware shows: the graphics cards Chromium sees (which one it uses), the processor and memory. */
async function hardwareInfo(app, os) {
  let gpus = [];
  try {
    // 'complete' marks the device Chromium draws on (active); 'basic' does not, and is the fallback.
    const info = await app.getGPUInfo('complete').catch(() => app.getGPUInfo('basic'));
    gpus = (info?.gpuDevice ?? []).filter(device => device.vendorId !== 0x1414)   // Microsoft Basic Render Driver
      .map((device, index) => ({ name: device.deviceString || `GPU ${device.vendorId.toString(16)}:${device.deviceId.toString(16)}`,
        // Chromium lists the GPU it draws on first (its primary device); 'active' is only filled in some builds.
        active: typeof device.active === 'boolean' && info.gpuDevice.some(item => item.active) ? device.active : index === 0, driver: device.driverVersion || '' }));
  } catch { /* the GPU process is not up yet: no list */ }
  const cpus = os.cpus();
  return { gpus, cpu: cpus[0]?.model?.trim() || '', cores: cpus.length, memoryGB: Math.round(os.totalmem() / 1073741824) };
}

module.exports = { readHardwareSync, writeHardware, applyGpuPreference, hardwareInfo, normalizeHardware: normalize, GPU_CHOICES, ENCODER_CHOICES, HARDWARE_DEFAULTS: DEFAULTS };
