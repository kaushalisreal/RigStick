'use strict';
// Media for RigStick's MCP tools, in the main process: reading the image an AI asks to place (a local
// file or an https URL, images only, size-capped) and turning rendered frames into an MP4 with FFmpeg
// (the bundled encoder when packaged, else the one on PATH).
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const MAX_IMAGE = 25 * 1024 * 1024;
const SIGNATURES = [[0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff], [0x52, 0x49, 0x46, 0x46], [0x47, 0x49, 0x46, 0x38]];
const isImage = bytes => SIGNATURES.some(signature => signature.every((value, i) => bytes[i] === value));

/** {data: base64, name} for rigstick_add_image's path or url. */
async function readImage({path: file, url}) {
  let bytes, name;
  if (file) {
    const resolved = path.resolve(String(file));
    if (!IMAGE.test(resolved)) throw new Error('Only png, jpg, webp and gif images can be added.');
    const stat = await fsp.stat(resolved);
    if (stat.size > MAX_IMAGE) throw new Error('That image is larger than 25 MB.');
    bytes = await fsp.readFile(resolved); name = path.basename(resolved);
  } else if (url) {
    const target = new URL(String(url));
    if (target.protocol !== 'https:') throw new Error('Image URLs must use https.');
    const response = await fetch(target, {redirect: 'follow', signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`The image could not be downloaded (${response.status}).`);
    if (Number(response.headers.get('content-length')) > MAX_IMAGE) throw new Error('That image is larger than 25 MB.');
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE) throw new Error('That image is larger than 25 MB.');
    name = path.basename(target.pathname) || 'image.png';
    if (!IMAGE.test(name)) name += '.png';
  } else return null;
  if (!isImage(bytes)) throw new Error('That file is not a png, jpg, webp or gif image.');
  return {data: bytes.toString('base64'), name};
}

class VideoJobs {
  constructor({tempRoot, encoder, videosDir}) { Object.assign(this, {tempRoot, encoder, videosDir}); this.jobs = new Map(); this.finished = new Set(); }
  /** Only videos this app rendered can be revealed or opened from the renderer. */
  rendered(file) { const output = path.resolve(String(file)); if (!this.finished.has(output)) throw new Error('That video was not rendered by RigStick.'); return output; }
  async begin({path: target, fps = 24, name = 'RigStick'} = {}) {
    const token = crypto.randomBytes(12).toString('hex'), dir = await fsp.mkdtemp(path.join(this.tempRoot, 'rigstick-export-'));
    const safe = String(name).replace(/[^\w.-]+/g, '-').slice(0, 60) || 'RigStick';
    const output = target ? path.resolve(String(target)) : path.join(this.videosDir, `${safe}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.mp4`);
    if (!/\.mp4$/i.test(output)) throw new Error('Export to a .mp4 file.');
    this.jobs.set(token, {dir, output, fps: Math.max(1, Math.min(120, Number(fps) || 24)), frames: 0});
    return {token, output};
  }
  async frame(token, index, bytes) {
    const job = this.jobs.get(token); if (!job) throw new Error('That export has ended.');
    if (!Number.isInteger(index) || index < 0 || index > 200000) throw new Error('Bad frame index.');
    await fsp.writeFile(path.join(job.dir, `f${String(index).padStart(6, '0')}.png`), Buffer.from(bytes));
    job.frames = Math.max(job.frames, index + 1);
  }
  async cancel(token) { const job = this.jobs.get(token); this.jobs.delete(token); if (job) await fsp.rm(job.dir, {recursive: true, force: true}); }
  async finish(token) {
    const job = this.jobs.get(token); if (!job) throw new Error('That export has ended.');
    this.jobs.delete(token);
    try {
      await fsp.mkdir(path.dirname(job.output), {recursive: true});
      const encoder = fs.existsSync(this.encoder) ? this.encoder : 'ffmpeg';
      await new Promise((resolve, reject) => {
        const child = spawn(encoder, ['-y', '-loglevel', 'error', '-framerate', String(job.fps), '-i', path.join(job.dir, 'f%06d.png'),
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', job.output], {windowsHide: true});
        let error = ''; child.stderr.on('data', chunk => { error += chunk; });
        child.on('error', () => reject(new Error('FFmpeg was not found. Install it or use the packaged RigStick app.')));
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed: ${error.slice(-400)}`)));
      });
      this.finished.add(job.output);
      return {path: job.output, frames: job.frames};
    } finally { await fsp.rm(job.dir, {recursive: true, force: true}); }
  }
}

module.exports = {readImage, VideoJobs, isImage};
