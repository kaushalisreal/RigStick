'use strict';
// The person's preset files (.rigset / .rigobject, src/presets/preset-files.mjs): a folder of ordinary files next to
// the library, Documents/RigStick/Presets, so presets can be opened, shared and backed up like any document. The
// renderer names files only by their base name; nothing outside the folder is ever read, written or listed.
const fs = require('node:fs/promises');
const path = require('node:path');
const { atomicWrite } = require('./recovery.cjs');

const PRESET = /\.(rigset|rigobject)$/i;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 2000;

function fileName(value) {
  const name = String(value ?? '');
  if (!name || name.length > 160 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || name.startsWith('.') || /[. ]$/.test(name) || !PRESET.test(name)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) throw new Error('Choose a .rigset or .rigobject file name without \\ / : * ? " < > |.');
  return name;
}

class PresetStore {
  constructor(root) { this.root = path.resolve(root); }
  async init() { await fs.mkdir(this.root, { recursive: true }); return this.root; }
  /** [{id (the file name), name, size, modified}], oldest first, so presets keep their order. */
  async list() {
    await this.init();
    const entries = [];
    for (const item of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!item.isFile() || !PRESET.test(item.name) || item.name.startsWith('.')) continue;
      const stat = await fs.stat(path.join(this.root, item.name)).catch(() => null);
      if (stat && stat.size <= MAX_BYTES) entries.push({ id: item.name, name: item.name, size: stat.size, modified: stat.mtimeMs, created: stat.birthtimeMs || stat.mtimeMs });
      if (entries.length >= MAX_FILES) break;
    }
    return entries.sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
  }
  async read(id) {
    const target = path.join(this.root, fileName(id));
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error(`${id} is not a preset file RigStick can read.`);
    const bytes = await fs.readFile(target);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  /** Writes a new file; a taken name gets " (2)", " (3)"… Returns {id}. */
  async save({ name, bytes }) {
    await this.init();
    const data = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
    if (!data.length || data.length > MAX_BYTES) throw new Error('A preset file can be up to 32 MB.');
    const wanted = fileName(name), extension = path.extname(wanted), stem = wanted.slice(0, -extension.length);
    const taken = new Set((await fs.readdir(this.root)).map(item => item.toLowerCase()));
    let candidate = wanted;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`;
    await atomicWrite(path.join(this.root, candidate), data);
    return { id: candidate };
  }
  async remove(id, trashItem) {
    const target = path.join(this.root, fileName(id));
    await trashItem(target);
    return { removed: true };
  }
}

module.exports = { PresetStore };
