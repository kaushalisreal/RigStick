// Presets people import into the Library (its Presets view, the Imported kind): preset packs (.zip), images and
// folders of images. A folder of numbered images is an animated effect (one image per frame); any other image is
// a still. Imported presets are stickers (stickers.mjs) under the key `imported:<id>`, so they drop, play and reach
// AI apps exactly like the built-in ones. They are kept in this browser profile's IndexedDB (the desktop app's own
// profile on the desktop), so they are there in every project.
//
// A pack may describe itself with rigstick-pack.json at its root:
//   {"format": "rigstick-pack", "version": 1, "name": "Ninja VFX",
//    "presets": [{"name": "BOOM", "frames": ["sfx/boom.png"], "motion": "hit-pop", "size": 0.5},
//                {"name": "Slash", "frames": ["slash/00.png", "slash/01.png"], "frameTicks": 1}]}
// Without one, its folders and file names say what is in it (as for a folder).
import { unpackZip, isZip } from '../sticknodes/decoder/archive.mjs';
import { STICKERS } from './stickers.mjs';
import { MOTIONS } from './motions.mjs';
import { writePresetFile, presetFileName } from './preset-files.mjs';

export const IMPORTED_PREFIX = 'imported:';
export const PACK_MANIFEST = 'rigstick-pack.json';
const DB = 'rigstick-imported-presets', STORE = 'presets';
const IMAGE = /\.(png|webp|jpe?g|gif)$/i;
const TYPES = {png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif'};
const MAX_FRAMES = 240, MAX_PRESETS = 500, MAX_SIDE = 4096;
const urls = new Map();   // sticker key -> object URLs, revoked when the preset goes

const typeOf = name => TYPES[name.split('.').at(-1).toLowerCase()] ?? 'image/png';
const baseName = path => path.split('/').at(-1).replace(/\.[^.]+$/, '');
const directory = path => path.split('/').slice(0, -1).join('/');
/** Natural order, so frame-2 sorts before frame-10. */
const natural = (a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
const tidy = name => name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';

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
const all = () => transact('readonly', (store, done) => { const request = store.getAll(); request.onsuccess = () => done(request.result); });

/** Puts every stored preset into the sticker registry (and drops ones no longer stored). Returns the records. */
export async function loadImportedPresets() {
  let records = [];
  try { records = await all(); } catch { return []; }   // no IndexedDB (a private window): nothing imported
  register(records);
  return records;
}
function register(records) {
  const keep = new Set(records.map(record => IMPORTED_PREFIX + record.id));
  for (const key of Object.keys(STICKERS)) if (key.startsWith(IMPORTED_PREFIX) && !keep.has(key)) { for (const url of urls.get(key) ?? []) URL.revokeObjectURL(url); urls.delete(key); delete STICKERS[key]; }
  for (const record of records) {
    const key = IMPORTED_PREFIX + record.id;
    if (!urls.has(key)) urls.set(key, record.frames.map(blob => URL.createObjectURL(blob)));
    STICKERS[key] = {group: record.pack, label: record.name, urls: urls.get(key), blobs: record.frames, width: record.width, height: record.height,
      motion: record.motion ?? null, frameTicks: record.frameTicks ?? 1, ...(record.size ? {size: record.size} : {}), imported: true, pack: record.pack};
  }
}
/** The imported packs: [{pack, keys}], in the order they were imported. */
export function importedPacks() {
  const packs = new Map();
  for (const [key, sticker] of Object.entries(STICKERS)) if (key.startsWith(IMPORTED_PREFIX)) {
    if (!packs.has(sticker.pack)) packs.set(sticker.pack, []);
    packs.get(sticker.pack).push(key);
  }
  return [...packs].map(([pack, keys]) => ({pack, keys}));
}
export async function removeImportedPack(pack) {
  await transact('readwrite', async store => {
    const records = await new Promise(resolve => { const request = store.getAll(); request.onsuccess = () => resolve(request.result); });
    for (const record of records) if (record.pack === pack) store.delete(record.id);
  });
  return loadImportedPresets();
}

/**
 * Imports Files: .zip packs, images, and the files of a chosen folder (their webkitRelativePath keeps the folders).
 * Returns {added, packs} or throws with a message a person can act on.
 */
export async function importPresetFiles(files) {
  const presets = await gatherPresets(files);
  const records = [];
  for (const preset of presets) records.push(await record(preset));
  await transact('readwrite', store => { for (const item of records) store.put(item); });
  await loadImportedPresets();
  return {added: records.length, packs: [...new Set(records.map(item => item.pack))]};
}

/**
 * Packs, images and folders as .rigobject files of sticker presets, one file per pack: what My presets keeps
 * (user-presets.mjs), so they are ordinary files that survive restarts. Returns Files named after their packs.
 */
export async function presetPackFiles(files) {
  const presets = await gatherPresets(files), packs = new Map(), out = [];
  for (const preset of presets) {
    const {width, height} = await record(preset);
    const id = preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    if (!packs.has(preset.pack)) packs.set(preset.pack, []);
    packs.get(preset.pack).push({kind: 'sticker', id, name: preset.name, group: preset.pack, frames: preset.frames,
      data: {width, height, frameTicks: preset.frameTicks, ...(preset.motion ? {motion: preset.motion} : {}), ...(preset.size ? {size: preset.size} : {})}});
  }
  for (const [pack, records] of packs) out.push(new File([await writePresetFile(records)], presetFileName(pack, 'sticker')));
  return out;
}

/** The presets in chosen files: a .zip's (by its rigstick-pack.json or its folders), a folder's, loose images'. */
async function gatherPresets(files) {
  const entries = [];   // {path, blob}: a pack's files, or loose images under one pack
  const packs = [];
  const loose = [];
  for (const file of files) {
    const relative = file.webkitRelativePath || '';
    if (/\.zip$/i.test(file.name) || isZip(new Uint8Array(await file.slice(0, 4).arrayBuffer()))) packs.push(await readZip(file));
    else if (IMAGE.test(file.name)) (relative ? entries : loose).push({path: relative || file.name, blob: file});
  }
  if (entries.length) {
    const top = entries[0].path.split('/')[0];
    packs.push(await describePresetFiles(entries.map(entry => ({...entry, path: entry.path.split('/').slice(1).join('/') || entry.path})), top));
  }
  if (loose.length) packs.push(await describePresetFiles(loose, 'Imported images'));
  const presets = packs.flat();
  if (!presets.length) throw new Error('Choose a preset pack (.zip), images (PNG, WebP, JPEG, GIF) or a folder of images.');
  if (presets.length > MAX_PRESETS) throw new Error(`A pack can hold up to ${MAX_PRESETS} presets.`);
  return presets;
}

async function readZip(file) {
  let unpacked;
  try { unpacked = await unpackZip(new Uint8Array(await file.arrayBuffer())); }
  catch (error) { throw new Error(`${file.name} could not be read as a ZIP preset pack (${error.message}).`); }
  const list = (unpacked.files ?? unpacked).map(item => ({path: item.name, blob: new Blob([item.data ?? item.bytes], {type: typeOf(item.name)})}))
    .filter(item => !item.path.endsWith('/') && !item.path.split('/').some(part => part.startsWith('.') || part === '__MACOSX'));
  // A pack zipped with its folder inside: look at what is under that folder.
  const roots = new Set(list.map(item => item.path.split('/')[0]));
  const nested = roots.size === 1 && list.every(item => item.path.includes('/')) ? [...roots][0] : null;
  const files = nested ? list.map(item => ({...item, path: item.path.slice(nested.length + 1)})) : list;
  return describePresetFiles(files, nested ?? file.name.replace(/\.zip$/i, ''));
}

/** What a set of files holds: from rigstick-pack.json when there is one, else from folders and names. */
export async function describePresetFiles(files, fallbackName) {
  const manifestFile = files.find(item => item.path === PACK_MANIFEST);
  const byPath = new Map(files.map(item => [item.path, item.blob]));
  if (manifestFile) {
    let manifest;
    try { manifest = JSON.parse(await manifestFile.blob.text()); } catch { throw new Error(`${PACK_MANIFEST} is not valid JSON.`); }
    if (manifest?.format !== 'rigstick-pack' || !Array.isArray(manifest.presets)) throw new Error(`${PACK_MANIFEST} is not a RigStick preset pack.`);
    const pack = String(manifest.name || fallbackName).slice(0, 80);
    return manifest.presets.map((preset, index) => {
      const frames = (Array.isArray(preset.frames) ? preset.frames : [preset.file]).filter(Boolean).map(String);
      const missing = frames.find(path => !byPath.has(path));
      if (missing || !frames.length) throw new Error(`Preset ${index + 1} in ${PACK_MANIFEST} names a file the pack does not contain${missing ? `: ${missing}` : ''}.`);
      return {pack, name: String(preset.name || baseName(frames[0])).slice(0, 80), frames: frames.map(path => byPath.get(path)),
        motion: MOTIONS[preset.motion] ? preset.motion : null, frameTicks: Math.max(1, Math.min(12, preset.frameTicks | 0 || 1)),
        size: Number.isFinite(preset.size) && preset.size > 0 ? Math.min(10, preset.size) : null};
    });
  }
  const pack = String(fallbackName).slice(0, 80), presets = [], folders = new Map();
  for (const item of files) if (IMAGE.test(item.path)) {
    const folder = directory(item.path);
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder).push(item);
  }
  for (const [folder, items] of [...folders].sort(([a], [b]) => natural(a, b))) {
    items.sort((a, b) => natural(a.path, b.path));
    // A folder of two or more images whose names end in a number is one animated effect.
    if (folder && items.length > 1 && items.every(item => /\d+$/.test(baseName(item.path)))) {
      presets.push({pack, name: tidy(folder.split('/').at(-1)), frames: items.map(item => item.blob), motion: null, frameTicks: 1, size: null});
    } else for (const item of items) presets.push({pack, name: tidy(baseName(item.path)), frames: [item.blob], motion: 'pop-in', frameTicks: 1, size: null});
  }
  return presets;
}

async function record(preset) {
  if (preset.frames.length > MAX_FRAMES) throw new Error(`${preset.name} has ${preset.frames.length} frames; an animated preset can have up to ${MAX_FRAMES}.`);
  let bitmap;
  try { bitmap = await createImageBitmap(preset.frames[0]); } catch { throw new Error(`${preset.name} is not an image RigStick can read.`); }
  const {width, height} = bitmap; bitmap.close();
  if (width > MAX_SIDE || height > MAX_SIDE) throw new Error(`${preset.name} is ${width} × ${height}; images can be up to ${MAX_SIDE} pixels on a side.`);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return {id, pack: preset.pack, name: preset.name, frames: preset.frames, width, height, motion: preset.motion, frameTicks: preset.frameTicks, size: preset.size, addedAt: Date.now()};
}
