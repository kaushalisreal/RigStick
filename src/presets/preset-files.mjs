// RigStick preset files. Every preset (built in, imported or made by the person) can live in a file of its own:
//   .rigset     an animation or effect preset: a character move, a motion, a camera move, an effect, a text animation
//   .rigobject  a thing to drop onto the canvas: an object, a sticker or flipbook, a text look, a saved figure
// Both are ZIP archives (any unzip tool opens them) holding preset.json and the images or figure a preset needs:
//   preset.json  {"format": "rigstick-preset", "version": 1, "presets": [{kind, id, name, group, data, frames?, figure?}]}
//   frames/…     a sticker's images, one per frame (WebP, PNG or JPEG)
//   figure.stkz  a saved figure or movieclip (kind "figure")
// One file usually holds one preset; a file can hold several (a pack). Loading one registers its presets in the
// same registries the built-in library uses, so they drop, apply and reach AI apps exactly like the built-in ones.
import { unpackZip, isZip, crc32 } from '../sticknodes/decoder/archive.mjs';
import { OBJECTS, OBJECT_CATEGORIES } from './objects.mjs';
import { MOTIONS, MOTION_GROUPS, CAMERA_PRESETS, CAMERA_CLIPS } from './motions.mjs';
import { STICKERS, STICKER_GROUPS, stickerFrameUrls } from './stickers.mjs';
import { TEXT_LOOKS, TEXT_LOOK_GROUPS, TEXT_ANIMATIONS, TEXT_ANIMATION_GROUPS } from './text-presets.mjs';
import { MOVE_GROUPS, MOVE_LABELS, moveData, registerMove } from '../ai/moves.mjs';
import { VFX_PRESETS } from '../vfx-presets.mjs';
import { VFX_LIBRARY, EFFECT_CATEGORIES } from './vfx-library.mjs';

export const PRESET_FORMAT = 'rigstick-preset';
export const PRESET_VERSION = 1;
export const RIGSET = '.rigset', RIGOBJECT = '.rigobject';
export const MANIFEST = 'preset.json';
/** Kinds a .rigset holds (they act on something already there) and kinds a .rigobject holds (things you add). */
export const SET_KINDS = Object.freeze(['move', 'motion', 'camera', 'effect', 'textAnimation']);
export const OBJECT_KINDS = Object.freeze(['object', 'sticker', 'textLook', 'figure']);
export const PRESET_FILE = /\.(rigset|rigobject)$/i;
export const extensionFor = kind => SET_KINDS.includes(kind) ? RIGSET : RIGOBJECT;
const IMAGE_TYPES = {webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif'};
const MAX_PRESETS = 500, MAX_FRAMES = 240, MAX_NAME = 80;
const clean = value => JSON.parse(JSON.stringify(value));   // plain JSON: no functions, no shared references
const slug = value => String(value).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'preset';
/** A file name for a preset (Windows-safe). */
export const presetFileName = (name, kind) => `${String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/^\.+|[. ]+$/g, '').slice(0, 100).trim() || 'Preset'}${extensionFor(kind)}`;

// ---- ZIP (stored entries: the images inside are already compressed) ----
const encoder = new TextEncoder();
/** A ZIP archive of [{name, bytes: Uint8Array}] with no compression. */
export function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const {name, bytes} of files) {
    const path = encoder.encode(name), crc = crc32(bytes), local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);   // UTF-8 names
    local.setUint32(14, crc, true); local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true); local.setUint16(26, path.length, true);
    parts.push(new Uint8Array(local.buffer), path, bytes);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, bytes.length, true); entry.setUint32(24, bytes.length, true); entry.setUint16(28, path.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), path);
    offset += 30 + path.length + bytes.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const part of [...parts, ...central, new Uint8Array(end.buffer)]) { out.set(part, at); at += part.length; }
  return out;
}

// ---- Records: one preset as plain data plus its files ----
/**
 * A record is {kind, id, name, group, data, frames?: [Blob], figure?: Blob}. `data` is the registry entry as JSON
 * (motions.mjs, moves.mjs moveData, vfx-library.mjs, stickers.mjs, text-presets.mjs, objects.mjs).
 */
export async function builtinRecord(kind, id, {fetchBlob = url => fetch(url).then(response => response.blob())} = {}) {
  const record = (name, group, data, extra = {}) => ({kind, id, name: String(name), group: String(group ?? ''), data: clean(data), ...extra});
  if (kind === 'motion') { const m = MOTIONS[id] ?? missing(kind, id); return record(m.label, groupOf(MOTION_GROUPS, id) ?? 'Motions', m); }
  if (kind === 'camera') {
    if (CAMERA_PRESETS[id]) return record(CAMERA_PRESETS[id].label, 'Camera moves', CAMERA_PRESETS[id]);
    if (CAMERA_CLIPS[id]) return record(CAMERA_CLIPS[id], 'Camera effects', {label: CAMERA_CLIPS[id], clip: id});
    missing(kind, id);
  }
  if (kind === 'move') { const m = moveData(id); return record(m.label, m.group, m); }
  if (kind === 'effect') { const e = VFX_LIBRARY[id] ?? VFX_PRESETS[id] ?? missing(kind, id); return record(id, e.category, e); }
  if (kind === 'textAnimation') {
    const a = TEXT_ANIMATIONS[id] ?? missing(kind, id);
    // The motion it plays goes along, so the file works where that motion is unknown.
    return record(a.label, a.group, {...a, ...(a.motion && MOTIONS[a.motion] ? {motionData: MOTIONS[a.motion]} : {})});
  }
  if (kind === 'textLook') { const l = TEXT_LOOKS[id] ?? missing(kind, id); return record(l.label, l.group, l); }
  if (kind === 'object') {
    const o = OBJECTS[id] ?? missing(kind, id);
    // Objects drawn by code are stored as the parts they draw at their defaults.
    const parts = o.make ? o.make({depth: 'mid', seed: 4, width: 600}) : o.parts;
    return record(id, OBJECT_CATEGORIES[o.category] ?? o.category, {category: o.category, about: o.about ?? '', parts, ...(o.size ? {size: o.size} : {})});
  }
  if (kind === 'sticker') {
    const s = STICKERS[id] ?? missing(kind, id);
    const frames = s.blobs ?? await Promise.all(stickerFrameUrls(s).map(fetchBlob));
    const {group, label, tint, motion, size, frameTicks, width, height, fit} = s;
    return record(label, group, {group, label, tint, motion, size, frameTicks, width, height, fit}, {frames});
  }
  throw new Error(`Unknown preset kind "${kind}".`);
}
const groupOf = (groups, id) => Object.entries(groups).find(([, names]) => names.includes(id))?.[0];
function missing(kind, id) { throw new Error(`There is no ${kind} preset "${id}".`); }

const extensionOf = blob => ({'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif'}[blob.type] ?? 'webp');
/** The bytes of a .rigset / .rigobject holding `records` (all .rigset kinds or all .rigobject kinds). */
export async function writePresetFile(records) {
  const list = [].concat(records);
  if (!list.length) throw new Error('There is no preset to save.');
  const set = list.every(record => SET_KINDS.includes(record.kind)), object = list.every(record => OBJECT_KINDS.includes(record.kind));
  if (!set && !object) throw new Error('A file holds either animation presets (.rigset) or object presets (.rigobject), not both.');
  const files = [], presets = [];
  for (const [index, record] of list.entries()) {
    const folder = list.length > 1 ? `${String(index + 1).padStart(3, '0')}-${slug(record.id)}/` : '';
    const entry = {kind: record.kind, id: String(record.id), name: String(record.name).slice(0, MAX_NAME), group: String(record.group ?? '').slice(0, MAX_NAME), data: clean(record.data ?? {})};
    if (record.frames?.length) {
      entry.frames = [];
      for (const [i, blob] of record.frames.entries()) {
        const path = `${folder}frames/${String(i).padStart(3, '0')}.${extensionOf(blob)}`;
        files.push({name: path, bytes: new Uint8Array(await blob.arrayBuffer())}); entry.frames.push(path);
      }
    }
    if (record.figure) { entry.figure = `${folder}figure.stkz`; files.push({name: entry.figure, bytes: new Uint8Array(await record.figure.arrayBuffer())}); }
    if (record.thumbnail) { entry.thumbnail = `${folder}thumbnail.png`; files.push({name: entry.thumbnail, bytes: new Uint8Array(await record.thumbnail.arrayBuffer())}); }
    presets.push(entry);
  }
  const manifest = {format: PRESET_FORMAT, version: PRESET_VERSION, app: 'RigStick', presets};
  return new Blob([zipStore([{name: MANIFEST, bytes: encoder.encode(JSON.stringify(manifest, null, 1))}, ...files])], {type: 'application/zip'});
}

/** The records in a .rigset / .rigobject (a File, Blob or bytes). Throws with a sentence a person can act on. */
export async function readPresetFile(input, fileName = 'preset') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());
  if (!isZip(bytes)) throw new Error(`${fileName} is not a RigStick preset file.`);
  let unpacked;
  try { unpacked = await unpackZip(bytes); } catch (error) { throw new Error(`${fileName} could not be read (${error.message}).`); }
  const entries = new Map((unpacked.files ?? unpacked).map(item => [item.name, item.data ?? item.bytes]));
  const text = entries.get(MANIFEST);
  if (!text) throw new Error(`${fileName} has no ${MANIFEST}.`);
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(text)); } catch { throw new Error(`${fileName}: ${MANIFEST} is not valid JSON.`); }
  if (manifest?.format !== PRESET_FORMAT || !Array.isArray(manifest.presets)) throw new Error(`${fileName} is not a RigStick preset file.`);
  if (manifest.version > PRESET_VERSION) throw new Error(`${fileName} was made by a newer RigStick. Update RigStick to open it.`);
  if (manifest.presets.length > MAX_PRESETS) throw new Error(`${fileName} holds more than ${MAX_PRESETS} presets.`);
  const blob = (path, type) => { const data = entries.get(path); if (!data) throw new Error(`${fileName} names ${path}, which it does not contain.`); return new Blob([data], {type}); };
  return manifest.presets.map((entry, index) => {
    const kind = String(entry?.kind);
    if (![...SET_KINDS, ...OBJECT_KINDS].includes(kind)) throw new Error(`Preset ${index + 1} in ${fileName} is of an unknown kind (${kind}).`);
    const frames = Array.isArray(entry.frames) ? entry.frames.slice(0, MAX_FRAMES).map(path => blob(String(path), IMAGE_TYPES[String(path).split('.').at(-1).toLowerCase()] ?? 'image/png')) : undefined;
    return {kind, id: String(entry.id || slug(entry.name || `preset-${index + 1}`)).slice(0, 120), name: String(entry.name || entry.id || 'Preset').slice(0, MAX_NAME),
      group: String(entry.group || '').slice(0, MAX_NAME), data: entry.data && typeof entry.data === 'object' ? entry.data : {},
      ...(frames?.length ? {frames} : {}), ...(entry.figure ? {figure: blob(String(entry.figure), 'application/octet-stream')} : {}),
      ...(entry.thumbnail ? {thumbnail: blob(String(entry.thumbnail), 'image/png')} : {})};
  });
}

// ---- Registering records in the library ----
const urls = new Map();   // registry key -> object URLs of its frames, revoked when it is unregistered
/** Puts `group` into a group list (an array of names) if it is not there. */
const addGroup = (list, group) => { if (group && !list.includes(group)) list.push(group); };
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
/** Figures saved as presets (kind "figure"): key -> {name, group, figure: Blob, thumbnail}. The Library inserts them like My library items. */
export const FIGURE_PRESETS = {};

/**
 * Registers a record under `key` (default: its id) unless a preset of that kind and key exists already.
 * Returns {kind, key} for the panel (kind as the panel names it: 'object', 'sticker', 'textLook', 'textAnimation'…),
 * or null when it was already there. `source` tags where it came from ('library', 'user').
 */
export function registerRecord(record, {key = record.id, source = 'user'} = {}) {
  const {kind, name, group, data} = record;
  const tag = {source, file: true};
  if (kind === 'motion') {
    if (MOTIONS[key]) return null;
    const keys = (data.keys ?? []).filter(k => Number.isFinite(k?.u));
    if (keys.length < 2) throw new Error(`${name} has fewer than two keys.`);
    MOTIONS[key] = {label: name, seconds: number(data.seconds, 1, 0.05, 60), ease: data.ease === 'linear' ? 'linear' : 'auto', keys, ...tag};
    (MOTION_GROUPS[group || 'My motions'] ??= []).push(key);
    return {kind, key};
  }
  if (kind === 'camera') {
    if (CAMERA_PRESETS[key] || CAMERA_CLIPS[key]) return null;
    if (data.clip) return null;   // camera effects are code: only the built-in ones exist
    const keys = (data.keys ?? []).filter(k => Number.isFinite(k?.u));
    if (keys.length < 2) throw new Error(`${name} has fewer than two keys.`);
    CAMERA_PRESETS[key] = {label: name, seconds: number(data.seconds, 2, 0.05, 60), ease: data.ease === 'linear' ? 'linear' : 'auto', keys, ...tag};
    return {kind, key};
  }
  if (kind === 'move') { if (MOVE_LABELS[key]) return null; registerMove(key, {...data, label: name, group: group || 'My moves'}); return {kind, key}; }
  if (kind === 'effect') {
    if (VFX_LIBRARY[key] || VFX_PRESETS[key]) return null;
    if (!Array.isArray(data.effects) && !Array.isArray(data.clips)) throw new Error(`${name} has no effects.`);
    const category = group || data.category || 'My effects';
    VFX_LIBRARY[key] = {...data, category, ...tag};
    addGroup(EFFECT_CATEGORIES, category);
    return {kind, key};
  }
  if (kind === 'textAnimation') {
    if (TEXT_ANIMATIONS[key]) return null;
    let motion = data.motion;
    if (motion && !MOTIONS[motion] && data.motionData) { MOTIONS[motion] = {...data.motionData, ...tag}; }
    if (!motion || !MOTIONS[motion]) throw new Error(`${name} needs a motion this file does not include.`);
    const animationGroup = TEXT_ANIMATION_GROUPS.includes(group) ? group : data.letters ? 'Letter by letter' : 'Whole text';
    TEXT_ANIMATIONS[key] = {...data, motionData: undefined, label: name, group: animationGroup, ...tag};
    return {kind, key};
  }
  if (kind === 'textLook') {
    if (TEXT_LOOKS[key]) return null;
    if (!data.text || typeof data.text.color !== 'string') throw new Error(`${name} has no text style.`);
    const lookGroup = group || 'My text looks';
    TEXT_LOOKS[key] = {...data, label: name, group: lookGroup, ...tag};
    addGroup(TEXT_LOOK_GROUPS, lookGroup);
    return {kind, key};
  }
  if (kind === 'object') {
    if (OBJECTS[key]) return null;
    if (!Array.isArray(data.parts) || !data.parts.length) throw new Error(`${name} has no shapes.`);
    let category = Object.entries(OBJECT_CATEGORIES).find(([id, label]) => id === data.category || label === group)?.[0];
    if (!category) { category = slug(group || 'My objects'); OBJECT_CATEGORIES[category] = group || 'My objects'; }
    OBJECTS[key] = {category, about: String(data.about ?? name), parts: data.parts, ...(data.size ? {size: data.size} : {}), ...tag};
    return {kind, key};
  }
  if (kind === 'sticker') {
    if (STICKERS[key]) return null;
    if (!record.frames?.length) throw new Error(`${name} has no images.`);
    const frameUrls = record.frames.map(blob => URL.createObjectURL(blob));
    urls.set(`sticker:${key}`, frameUrls);
    const stickerGroup = group || data.group || 'My stickers';
    STICKERS[key] = {group: stickerGroup, label: name, urls: frameUrls, blobs: record.frames, ...(Number.isFinite(data.tint) ? {tint: data.tint} : {}), motion: MOTIONS[data.motion] ? data.motion : null,
      frameTicks: number(data.frameTicks, 1, 1, 12), ...(Number.isFinite(data.size) ? {size: number(data.size, 1, 0.05, 20)} : {}),
      ...(data.width ? {width: number(data.width, 256, 1, 8192), height: number(data.height, 256, 1, 8192)} : {}), ...(data.fit ? {fit: String(data.fit)} : {}), ...tag};
    addGroup(STICKER_GROUPS, stickerGroup);
    return {kind, key};
  }
  if (kind === 'figure') {
    if (FIGURE_PRESETS[key]) return null;
    if (!record.figure) throw new Error(`${name} has no figure.`);
    FIGURE_PRESETS[key] = {name, group: group || 'My objects', figure: record.figure, thumbnail: record.thumbnail ? URL.createObjectURL(record.thumbnail) : null, ...tag};
    return {kind, key};
  }
  return null;
}

/** Takes a registered file preset out of the library (a removed user preset). Built-in presets are never removed. */
export function unregisterRecord(kind, key) {
  const registry = {motion: MOTIONS, camera: CAMERA_PRESETS, effect: VFX_LIBRARY, textAnimation: TEXT_ANIMATIONS, textLook: TEXT_LOOKS, object: OBJECTS, sticker: STICKERS, figure: FIGURE_PRESETS}[kind];
  if (kind === 'move') { for (const names of Object.values(MOVE_GROUPS)) { const at = names.indexOf(key); if (at >= 0) names.splice(at, 1); } return; }
  if (!registry?.[key]?.file) return;
  if (kind === 'motion') for (const names of Object.values(MOTION_GROUPS)) { const at = names.indexOf(key); if (at >= 0) names.splice(at, 1); }
  for (const url of urls.get(`${kind}:${key}`) ?? []) URL.revokeObjectURL(url);
  urls.delete(`${kind}:${key}`);
  if (kind === 'figure' && registry[key].thumbnail) URL.revokeObjectURL(registry[key].thumbnail);
  delete registry[key];
}

// ---- Recording presets from the editor ----
/**
 * A motion recorded from a figure's keys between `from` and `to` (ticks): its position, turn, size and opacity
 * relative to the first key, over normalised time. `sample(tick)` returns {x, y, rotation (degrees), scale, opacity}.
 */
export function recordMotion({name, from, to, fps, ticks, sample}) {
  if (!(to > from)) throw new Error('Key the figure over at least two frames first.');
  const start = sample(from), keys = [];
  for (const tick of [...new Set([from, ...ticks.filter(t => t > from && t < to), to])].sort((a, b) => a - b)) {
    const now = sample(tick), u = (tick - from) / (to - from), key = {u: Math.round(u * 1000) / 1000};
    const dx = Math.round(now.x - start.x), dy = Math.round(now.y - start.y), r = Math.round((now.rotation - start.rotation) * 10) / 10;
    const s = start.scale ? Math.round(now.scale / start.scale * 1000) / 1000 : 1, o = Math.round(now.opacity * 100) / 100;
    if (dx) key.dx = dx; if (dy) key.dy = dy; if (r) key.r = r; if (s !== 1) key.s = s;
    key.o = o;
    keys.push(key);
  }
  return {kind: 'motion', id: slug(name), name, group: 'My motions', data: {label: name, seconds: Math.round((to - from) / fps * 100) / 100, ease: 'auto', keys}};
}
