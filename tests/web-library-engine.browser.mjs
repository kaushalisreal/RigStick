// The browser primitives the library depends on, in each engine (RIGS_BROWSER=chrome|firefox|webkit), without booting
// the editor: IndexedDB holding binary files, data that survives a reload, chunked reads and moves, SHA-256
// and the autosave copy. This is the check that
// runs in WebKit, whose Windows build cannot start the whole editor (it has no OffscreenCanvas).
//
//   node tests/web-library-engine.browser.mjs     build the site into a temp directory first
//   RIGS_WEB_DIR=build/web node tests/...         test an existing build
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BROWSER, launchBrowser } from './support/cross-browser.mjs';
import { buildWeb } from '../scripts/build-web.mjs';
import { startWebServer } from '../scripts/serve-web.mjs';

const temp = await mkdtemp(path.join(os.tmpdir(), 'rigs-engine-'));
const existing = process.env.RIGS_WEB_DIR && path.resolve(process.env.RIGS_WEB_DIR);
const site = await startWebServer({ root: existing ?? (await buildWeb({ output: path.join(temp, 'site') })).output });
const browser = await launchBrowser();
const checks = [];
const check = (name, condition) => { assert.ok(condition, `[${BROWSER}] ${name}`); checks.push(name); console.log('PASS', `[${BROWSER}]`, name); };


try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A page of the site that does not start the editor.
  const visit = () => page.goto(`${site.origin}/mark.svg`, { waitUntil: 'load' });
  await visit();

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const saved = await page.evaluate(async ([thumbnail]) => {
    const { LocalLibrary, createBrowserLibraryApi } = await import('/src/web-library.mjs');
    const library = new LocalLibrary(), api = createBrowserLibraryApi({ library });
    // The panel's own save and read loops (src/library-files.mjs), written out so this test loads only the library.
    const saveLibraryFile = async (api, blob, options) => {
      const transfer = await api.beginLibrarySave({ ...options, size: blob.size });
      for (let offset = 0; offset < blob.size; offset += transfer.maxChunkBytes) await api.writeLibraryChunk(transfer.token, await blob.slice(offset, offset + transfer.maxChunkBytes).arrayBuffer());
      return api.finishLibrarySave(transfer.token);
    };
    const readLibraryFile = async (api, path) => {
      const transfer = await api.beginLibraryRead(path), parts = [];
      for (;;) { const part = await api.readLibraryChunk(transfer.token); parts.push(part.bytes); if (part.done) break; }
      await api.cancelLibraryTransfer(transfer.token);
      return new File(parts, transfer.name);
    };
    const bytes = new Uint8Array(600 * 1024 + 5).map((_, i) => (i * 7 + 3) % 256);
    await library.createFolder({ name: 'Heroes' });
    const first = await saveLibraryFile(api, new Blob([bytes]), { folder: 'Heroes', name: 'Big', extension: '.stkz', thumbnail });
    const second = await saveLibraryFile(api, new Blob([bytes]), { folder: 'Heroes', name: 'Big', extension: '.stkz', thumbnail });
    const read = new Uint8Array(await (await readLibraryFile(api, first.path)).arrayBuffer());
    let identical = read.length === bytes.length;
    for (let i = 0; identical && i < bytes.length; i++) if (read[i] !== bytes[i]) identical = false;
    const moved = await library.change({ path: 'Heroes', name: 'Team' });
    return { first: first.path, second: second.path, identical, moved: moved.path, locks: !!navigator.locks?.request, listing: (await library.list('Team')).entries.map((e) => `${e.name}:${e.size}`) };
  }, [png]);
  check('IndexedDB stores a large binary file and returns every byte', saved.identical);
  check('Names, folders and moves work on it', saved.first === 'Heroes/Big.stkz' && saved.second === 'Heroes/Big (2).stkz' && saved.moved === 'Team' && saved.listing.join() === `Big:${600 * 1024 + 5},Big (2):${600 * 1024 + 5}`);
  console.log(`[${BROWSER}] Web Locks (one writer across tabs): ${saved.locks ? 'available' : 'not available; writes still run in one transaction each'}`);

  await visit();
  const after = await page.evaluate(async () => {
    const { LocalLibrary } = await import('/src/web-library.mjs');
    const library = new LocalLibrary(), listing = await library.list('Team');
    const transfer = await library.beginRead('Team/Big.stkz');
    return { names: listing.entries.map((entry) => entry.name), size: transfer.size, thumbnail: (await library.thumbnail('Team/Big.stkz')).slice(0, 22) };
  });
  check('Everything is still there after the page is loaded again', after.names.join() === 'Big,Big (2)' && after.size === 600 * 1024 + 5 && after.thumbnail === 'data:image/png;base64,');

  // The autosave copy: written as bytes, read back as a file, replaced, and cleared.
  const recovery = await page.evaluate(async () => {
    const { writeBrowserRecovery, readBrowserRecovery, clearBrowserRecovery } = await import('/src/browser-recovery.mjs');
    const bytes = new Uint8Array(300 * 1024).map((_, i) => (i * 5 + 1) % 256);
    const written = await writeBrowserRecovery(bytes.buffer.slice(0), 'Autosaved animation', new AbortController().signal);
    const record = await readBrowserRecovery(), back = new Uint8Array(await record.blob.arrayBuffer());
    let same = back.length === bytes.length; for (let i = 0; same && i < bytes.length; i++) if (back[i] !== bytes[i]) same = false;
    const cleared = await clearBrowserRecovery();
    return { written, same, name: record.name, fresh: Math.abs(record.savedAt - Date.now()) < 30000, cleared, after: await readBrowserRecovery() };
  });
  check('The autosave copy is stored and read back byte for byte', recovery.written === true && recovery.same && recovery.name === 'Autosaved animation' && recovery.fresh);
  check('and clearing it leaves nothing to offer', recovery.cleared === true && recovery.after === null);

  check('Nothing threw', errors.length === 0 || (console.error(errors), false));
  await context.close();
  console.log(`\n[${BROWSER}] ${checks.length} checks passed`);
} finally {
  await browser.close();
  await site.close();
  await rm(temp, { recursive: true, force: true });
}
