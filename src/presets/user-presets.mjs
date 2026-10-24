// The presets that live in files (preset-files.mjs): the library's packs, shipped as .rigset / .rigobject files in
// src/presets/library (index.json lists them), and the person's own, imported or saved from the Library (My presets).
// In the desktop app the person's files are ordinary files in Documents/RigStick/Presets (desktop/preset-store.cjs),
// so they survive restarts, can be opened in Explorer, shared and backed up. The web build keeps them in its
// IndexedDB. Either way they are there in every project, and Export gives back the same bytes.
import { readPresetFile, writePresetFile, registerRecord, unregisterRecord, presetFileName, PRESET_FILE } from './preset-files.mjs';

const LIBRARY_INDEX = new URL('./library/index.json', import.meta.url);
const DB = 'rigstick-user-presets', STORE = 'files';
const MAX_FILE_BYTES = 32 * 1024 * 1024;

/** What the Library shows under My presets: [{id, name, presets: [{kind, key, name}]}], in the order they were added. */
export const userPresetFiles = [];
/** The packs that ship as files: {pack: [{kind, key, name}]}. */
export const libraryPacks = {};

// ---- Where the person's files are kept ----
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact(mode, run) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode), store = tx.objectStore(STORE);
      let result; Promise.resolve(run(store, value => { result = value; })).catch(reject);
      tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
const zip = bytes => new Blob([bytes], {type: 'application/zip'});
const desktop = () => globalThis.rigsDesktop?.listUserPresets ? globalThis.rigsDesktop : null;
/** {all() → [{id, name, blob}], put({id, name, blob}) → the stored id, get(id) → {name, blob}, remove(id)}. */
const storage = () => desktop() ? {
  async all() {
    const files = desktop();
    return (await Promise.all((await files.listUserPresets()).map(async entry => {
      try { return {id: entry.id, name: entry.name, blob: zip(await files.readUserPreset(entry.id))}; } catch { return null; }
    }))).filter(Boolean);
  },
  async put(item) { return (await desktop().saveUserPresetFile({name: item.name, bytes: await item.blob.arrayBuffer()})).id; },
  async get(id) { return {name: id, blob: zip(await desktop().readUserPreset(id))}; },
  remove: id => desktop().removeUserPreset(id),
} : {
  async all() { return (await transact('readonly', (store, done) => { const request = store.getAll(); request.onsuccess = () => done(request.result); })).sort((a, b) => a.addedAt - b.addedAt); },
  async put(item) { await transact('readwrite', store => { store.put({...item, addedAt: Date.now()}); }); return item.id; },
  get: id => transact('readonly', (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result); }),
  remove: id => transact('readwrite', store => { store.delete(id); }),
};
/** The folder of the person's preset files can be shown (desktop app only). */
export const canRevealUserPresets = () => Boolean(globalThis.rigsDesktop?.revealUserPresets);
export const revealUserPresets = () => globalThis.rigsDesktop?.revealUserPresets?.();

// ---- The library's packs ----
let packsLoading = null;
/** Registers the library's pack files (once). A missing or damaged file only costs its own presets. */
export function loadLibraryPacks({fetchFile = url => fetch(url)} = {}) {
  packsLoading ??= (async () => {
    let index;
    try { index = await (await fetchFile(LIBRARY_INDEX)).json(); } catch { return libraryPacks; }
    await Promise.all((index.files ?? []).filter(file => file.pack).map(async file => {
      try {
        const response = await fetchFile(new URL(`./library/${file.path.split('/').map(encodeURIComponent).join('/')}`, import.meta.url));
        if (!response.ok) return;
        for (const record of await readPresetFile(await response.blob(), file.path)) {
          const added = registerRecord(record, {source: 'library'});
          if (added) (libraryPacks[file.pack] ??= []).push({...added, name: record.name, group: record.group, path: file.path});
        }
      } catch { /* a damaged pack file: leave it out */ }
    }));
    // Files load in parallel; keep each pack in the order its index lists it.
    const order = new Map((index.files ?? []).map((file, i) => [file.path, i]));
    for (const list of Object.values(libraryPacks)) list.sort((a, b) => order.get(a.path) - order.get(b.path));
    return libraryPacks;
  })();
  return packsLoading;
}

// ---- The person's presets ----
const taken = (kind, key) => userPresetFiles.some(file => file.presets.some(preset => preset.kind === kind && preset.key === key));
/** A registry key for a record: user:<its id>, numbered when another of your presets has it. */
function freeKey(record, also = new Set()) {
  let key = `user:${record.id}`, n = 2;
  while (taken(record.kind, key) || also.has(key)) key = `user:${record.id}-${n++}`;
  return key;
}
async function registerFile({id, name, blob}) {
  const records = await readPresetFile(blob, name), presets = [], keys = new Set();
  for (const record of records) {
    const key = freeKey(record, keys); keys.add(key);
    registerRecord(record, {key, source: 'user'});
    presets.push({kind: record.kind, key, name: record.name, group: record.group});
  }
  const entry = {id, name, presets};
  const at = userPresetFiles.findIndex(file => file.id === id);
  if (at >= 0) userPresetFiles[at] = entry; else userPresetFiles.push(entry);
  return entry;
}

let userLoading = null;
/** Registers every stored file (once). Returns userPresetFiles. */
export function loadUserPresets() {
  userLoading ??= (async () => {
    let stored = [];
    try { stored = await storage().all(); } catch { return userPresetFiles; }
    for (const item of stored) { try { await registerFile(item); } catch { /* unreadable now: leave it out, keep the file */ } }
    return userPresetFiles;
  })();
  return userLoading;
}

/** Adds .rigset / .rigobject files (Files, or Blobs with a name) to My presets. Returns the entries; throws a sentence a person can act on. */
export async function addUserPresetFiles(files) {
  await loadUserPresets();
  const added = [];
  for (const file of files) {
    const name = file.name ?? 'Preset.rigset';
    if (!PRESET_FILE.test(name)) throw new Error(`${name} is not a .rigset or .rigobject preset file.`);
    if (file.size > MAX_FILE_BYTES) throw new Error(`${name} is larger than ${MAX_FILE_BYTES / 1048576} MB.`);
    const blob = zip(await file.arrayBuffer());
    await readPresetFile(blob, name);   // checked before anything is stored
    const id = await storage().put({id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name, blob});
    added.push(await registerFile({id, name: desktop() ? id : name, blob}));
  }
  return added;
}

/** Saves records as a new file in My presets (Save as preset). Returns the entry. */
export async function saveUserPreset(records, name) {
  const list = [].concat(records);
  return (await addUserPresetFiles([new File([await writePresetFile(list)], name ?? presetFileName(list[0].name, list[0].kind))]))[0];
}

/** A file of My presets as it is stored, for Save as file. */
export async function userPresetBlob(id) {
  const item = await storage().get(id);
  return item ? new File([item.blob], item.name, {type: 'application/zip'}) : null;
}

export async function removeUserPresetFile(id) {
  const at = userPresetFiles.findIndex(file => file.id === id);
  if (at < 0) return;
  await storage().remove(id);
  for (const preset of userPresetFiles[at].presets) unregisterRecord(preset.kind, preset.key);
  userPresetFiles.splice(at, 1);
}
