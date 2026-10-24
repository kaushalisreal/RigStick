# Export rendering: GPU or CPU

**Settings → Canvas → Graphics → Export rendering** chooses where exports are drawn and encoded:

| Choice | Frames | MP4 (H.264) video |
| --- | --- | --- |
| **Automatic** (default) | GPU when the editor runs on a hardware GPU (WebGPU), otherwise CPU | A working hardware encoder if there is one, otherwise libx264 |
| **GPU (graphics card)** | GPU | A working hardware encoder if there is one, otherwise libx264 |
| **CPU (most compatible)** | CPU | libx264 |

## Frames

Export frames are drawn by the export worker (`src/export-frame-worker.mjs`) on an `OffscreenCanvas`.
On the CPU the canvas is created with `willReadFrequently: true`, which keeps it in system memory; on the GPU
it is created without it, so Chromium rasterizes paths, images and canvas filters on the graphics card and
reads each finished frame back once (`src/export-canvas.mjs`, `setExportDevice`). The drawing code is the
same either way, and both produce identical pixels. The 1-pixel presentation canvas in the page stays as it was.

## Video encoding

The desktop app's FFmpeg (`desktop/video-export-service.cjs`) tries hardware H.264 encoders in this order:
NVIDIA NVENC (`h264_nvenc`), Intel Quick Sync (`h264_qsv`), AMD AMF (`h264_amf`). The bundled Windows
FFmpeg includes all three; the Linux build has none, so Linux encodes with libx264. An encoder being listed
does not mean the machine can use it, so each is proven with a one-frame test encode before the first
export and the result is cached for the session. The export dialog's quality maps to the hardware encoder's
constant-quality setting the way it maps to libx264's CRF; a target bitrate is passed as a bitrate.
WebM (VP9), AVI and WMV keep their software encoders.
