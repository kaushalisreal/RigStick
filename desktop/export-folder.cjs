'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { WorkspacePreferences } = require('./preferences.cjs');

const ILLEGAL = /[\x00-\x1f\x7f\\/:*?"<>|]/g;

/**
 * The folder exports save into, chosen in the export dialog. With a folder chosen, an export writes
 * straight into it (no save dialog when it finishes); without one, each export asks where to save.
 * The folder is only ever set from a native folder picker, never from a renderer-provided path.
 */
class ExportFolder {
  constructor(userData, { defaultFolder = null } = {}) {
    this.preferences = new WorkspacePreferences(userData, { filename: 'export-folder.json' });
    this.defaultFolder = defaultFolder;
  }

  /** {folder: the chosen folder or null (ask each time), defaultFolder: what Change… opens first}. */
  async get() {
    const saved = await this.preferences.get().catch(() => null);
    const folder = typeof saved?.folder === 'string' && path.isAbsolute(saved.folder) ? saved.folder : null;
    return { folder, defaultFolder: this.defaultFolder };
  }

  async set(folder) {
    if (folder !== null && (typeof folder !== 'string' || !path.isAbsolute(folder))) throw new TypeError('The export folder must be an absolute path.');
    await this.preferences.set({ folder });
    return this.get();
  }

  /** A path in the chosen folder for `name` that does not overwrite an existing file: "Name (2).mp4". Null without a folder. */
  async destination(name) {
    const { folder } = await this.get();
    if (!folder) return null;
    await fs.mkdir(folder, { recursive: true });
    // Split on separators by hand: path.basename on Windows reads "a:b" as drive "a:" and drops it.
    const base = String(name || 'Untitled').split(/[\\/]/).pop().replace(ILLEGAL, '_').trim() || 'Untitled';
    const extension = path.extname(base), stem = base.slice(0, base.length - extension.length) || 'Untitled';
    for (let index = 1; index < 10000; index++) {
      const candidate = path.join(folder, index === 1 ? `${stem}${extension}` : `${stem} (${index})${extension}`);
      try { await fs.access(candidate); } catch (error) { if (error.code === 'ENOENT') return candidate; throw error; }
    }
    throw new Error('Too many files with this name in the export folder.');
  }
}

module.exports = { ExportFolder };
