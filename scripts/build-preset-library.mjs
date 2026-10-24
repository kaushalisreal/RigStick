// Writes RigStick's preset library as files: one .rigset / .rigobject per preset in src/presets/library, and
// src/presets/library/index.json listing them. Built-in presets (src/presets/*.mjs, src/ai/moves.mjs) are written
// from their registries; packs are built from folders of WebP art (see PACKS). The app loads the packs' files at
// startup (library-files.mjs); the built-in ones are there so every preset has its file, to open, share or edit.
//
//   node scripts/build-preset-library.mjs [--ninja <folder of the Ninja VFX Pack converted to WebP>]
// The Ninja pack's WebP folder is made from the pack's PNGs by scripts/ninja-pack-webp.py (quality 88, sides <= 4096):
//   python -I scripts/ninja-pack-webp.py <Ninja-VFX-Pack folder> <webp folder>
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinRecord, writePresetFile, presetFileName } from '../src/presets/preset-files.mjs';
import { OBJECTS } from '../src/presets/objects.mjs';
import { MOTIONS, CAMERA_PRESETS, CAMERA_CLIPS } from '../src/presets/motions.mjs';
import { STICKERS } from '../src/presets/stickers.mjs';
import { TEXT_LOOKS, TEXT_ANIMATIONS } from '../src/presets/text-presets.mjs';
import { MOVES } from '../src/ai/moves.mjs';
import { VFX_PRESETS } from '../src/vfx-presets.mjs';
import { VFX_LIBRARY } from '../src/presets/vfx-library.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'presets', 'library');
const arg = name => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
const fetchBlob = async url => new Blob([await readFile(fileURLToPath(url))], {type: 'image/webp'});
const folderName = value => String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').trim() || 'Other';
const KIND_FOLDERS = {object: 'Objects', move: 'Characters', motion: 'Motion', camera: 'Camera', effect: 'Effects', sticker: 'Stickers', textLook: 'Text looks', textAnimation: 'Text animations'};

const files = [];
async function save(record, folder, {builtin}) {
  const directory = path.join(OUT, folder, folderName(record.group || 'Other'));
  await mkdir(directory, {recursive: true});
  // File names stay ASCII (installers and zip tools); the display name inside keeps its own script.
  const base = record.name.replace(/[^\x20-\x7e]+/g, ' ').replace(/^[\s!.,:;-]+|\s+$/g, '').replace(/\s+/g, ' ') || record.id;
  let name = presetFileName(base, record.kind), n = 2;
  while (files.some(file => file.path === path.relative(OUT, path.join(directory, name)).split(path.sep).join('/'))) name = presetFileName(`${base} (${n++})`, record.kind);
  const target = path.join(directory, name);
  await writeFile(target, new Uint8Array(await (await writePresetFile(record)).arrayBuffer()));
  files.push({path: path.relative(OUT, target).split(path.sep).join('/'), kind: record.kind, id: record.id, name: record.name, group: record.group, ...(builtin ? {builtin: true} : {pack: folder})});
}

// ---- Packs: art that ships as files only (registered from them when the app starts) ----
const NINJA = 'Ninja VFX Pack';
const label = value => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
async function webpSize(file) {
  // VP8X (extended, with alpha) carries the canvas size at bytes 24..29; simple VP8/VP8L files carry it in their frame header.
  const b = await readFile(file), chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return {width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3)};
  if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return {width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff)}; }
  return {width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff};
}
async function ninjaPack(dir) {
  const blob = async file => new Blob([await readFile(file)], {type: 'image/webp'});
  const sticker = async (id, name, group, frames, data) => {
    const {width, height} = await webpSize(frames[0]);
    await save({kind: 'sticker', id: `ninja-${id}`, name, group, data: {width, height, frameTicks: 1, ...data}, frames: await Promise.all(frames.map(blob))}, NINJA, {builtin: false});
  };
  const list = async sub => (await readdir(path.join(dir, sub))).filter(name => name.endsWith('.webp')).sort();
  const SFX = {'sfx-don': 'ドーン! Boom', 'sfx-baan': 'バーン! Bam', 'sfx-zuba': 'ズバッ! Slash', 'sfx-kakiin': 'カキーン! Sword clang', 'sfx-shu': 'シュッ Whoosh',
    'sfx-doka': 'ドカッ! Hit', 'sfx-gogo': 'ゴゴゴゴ Menacing', 'sfx-zan': '斬! Cut', 'title-shoubu': '勝負! Duel', 'title-kecchaku': '決着 It’s settled'};
  for (const file of await list('sfx-japanese')) {
    const id = file.replace('.webp', '');
    await sticker(id, SFX[id] ?? label(id), 'Manga sound effects', [path.join(dir, 'sfx-japanese', file)], {motion: id.startsWith('title') ? 'pop-in' : 'hit-pop'});
  }
  const FX = {'fx-dust': 'Ground dust', 'fx-explosion': 'Explosion', 'fx-gleam': 'Blade gleam', 'fx-impact': 'Impact burst', 'fx-impact-blue': 'Impact burst (blue)',
    'fx-shockwave': 'Shockwave ring', 'fx-slash-cyan': 'Slash arc (cyan)', 'fx-slash-red': 'Slash arc (red)', 'fx-slash-white': 'Slash arc (white)', 'fx-smoke': 'Ninja smoke puff',
    'fx-sparks': 'Clash sparks', 'fx-speedlines': 'Anime speed lines', 'fx-wind': 'Wind gust'};
  for (const folder of (await readdir(path.join(dir, 'vfx-flipbooks'))).sort()) {
    const frames = (await list(`vfx-flipbooks/${folder}`)).map(file => path.join(dir, 'vfx-flipbooks', folder, file));
    await sticker(folder, FX[folder] ?? label(folder), 'Ninja VFX (animated)', frames, folder === 'fx-speedlines' ? {fit: 'stage'} : {});
  }
  await sticker('shuriken', 'Shuriken', 'Ninja props', [path.join(dir, 'props', 'fx-shuriken.webp')], {motion: 'spin'});
  await sticker('shuriken-trail', 'Shuriken trail', 'Ninja props', [path.join(dir, 'props', 'fx-shuriken-trail.webp')], {motion: 'swoosh'});
  const CARS = {bus: 'Bus', kei: 'Kei car', red: 'Red car', taxi: 'Taxi', teal: 'Teal car', van: 'Delivery van', white: 'White car'};
  for (const file of await list('cars')) {
    const [, kind, side] = file.match(/^car-(\w+)-([lr])\.webp$/) ?? [];
    if (!kind) continue;
    await sticker(`car-${kind}-${side}`, `${CARS[kind] ?? label(kind)} (facing ${side === 'l' ? 'left' : 'right'})`, 'Japanese traffic', [path.join(dir, 'cars', file)], {});
  }
  // Depth plates, far to near: they fill the stage's height, ready for a parallax camera.
  const PLATES = ['sky', 'clouds', 'mountains', 'farcity', 'midcity', 'neartown', 'highway', 'rooftops', 'foreground'];
  const PLATE_NAMES = {sky: '1 Sky', clouds: '2 Clouds', mountains: '3 Mountains (Fuji)', farcity: '4 Far city', midcity: '5 Mid city', neartown: '6 Near town', highway: '7 Highway', rooftops: '8 Rooftops', foreground: '9 Foreground'};
  for (const plate of PLATES) await sticker(`plate-${plate}`, `Golden-hour Tokyo: ${PLATE_NAMES[plate]}`, 'Tokyo backgrounds', [path.join(dir, 'backgrounds', `${plate}.webp`)], {fit: 'height'});
}

await rm(OUT, {recursive: true, force: true});
await mkdir(OUT, {recursive: true});
const builtins = [
  ...Object.keys(OBJECTS).map(id => ['object', id]),
  ...MOVES.map(id => ['move', id]),
  ...Object.keys(MOTIONS).map(id => ['motion', id]),
  ...[...Object.keys(CAMERA_PRESETS), ...Object.keys(CAMERA_CLIPS)].map(id => ['camera', id]),
  ...Object.keys({...VFX_PRESETS, ...VFX_LIBRARY}).filter(id => !id.startsWith('Test ')).map(id => ['effect', id]),
  ...Object.keys(STICKERS).filter(id => !STICKERS[id].urls).map(id => ['sticker', id]),
  ...Object.keys(TEXT_LOOKS).map(id => ['textLook', id]),
  ...Object.keys(TEXT_ANIMATIONS).map(id => ['textAnimation', id]),
];
for (const [kind, id] of builtins) await save(await builtinRecord(kind, id, {fetchBlob}), KIND_FOLDERS[kind], {builtin: true});
const ninja = arg('--ninja');
if (ninja) await ninjaPack(path.resolve(ninja));
await writeFile(path.join(OUT, 'index.json'), JSON.stringify({format: 'rigstick-preset-library', version: 1, files}, null, 1) + '\n');
const count = kind => files.filter(file => file.kind === kind).length;
console.log(`${files.length} preset files in src/presets/library: ${Object.keys(KIND_FOLDERS).map(kind => `${count(kind)} ${kind}`).join(', ')}${ninja ? ` (${files.filter(file => file.pack).length} in packs)` : ''}.`);
