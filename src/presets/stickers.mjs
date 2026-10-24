// Stickers: CC0 effect art by Kenney (src/presets/art, scripts/build-preset-art.mjs) as ready-to-drop
// sprites. White art is tinted with an effect clip, so one shape serves every colour. Animated stickers
// are flipbooks (one image per frame, the sprite's keyed `image` property). Each sticker plays a motion
// when it lands (motions.mjs), so a slash flashes and fades and an impact star pops, with no setup.

export const STICKER_GROUPS = ['Slashes & swooshes', 'Impacts', 'Magic', 'Fire & smoke', 'Animated'];

const still = (group, label, file, tint, motion, size = 1) => ({group, label, files: [file], tint, motion, size});
const blue = 0x9fdcff, white = 0xffffff, gold = 0xffd23f, orange = 0xff8a2a, purple = 0xc58bff, red = 0xff4d4d, grey = 0x8a8794;

export const STICKERS = {
  // Swooshes: the arc a sword or a kick leaves. Rotate and scale to fit the swing.
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(n => [`swoosh-${n}`, still('Slashes & swooshes', `Streak ${n}`, `trace_0${n}`, n % 2 ? white : blue, 'swoosh', 1.4)])),
  ...Object.fromEntries([1, 2, 3, 4].map(n => [`slash-${n}`, still('Slashes & swooshes', `Slash ${n}`, `slash_0${n}`, n % 2 ? white : blue, 'swoosh', 1.3)])),
  'scratch': still('Slashes & swooshes', 'Claw scratch', 'scratch_01', red, 'hit-pop'),

  'impact-star': still('Impacts', 'Impact star', 'star_04', gold, 'hit-pop'),
  'impact-star-2': still('Impacts', 'Impact star 2', 'star_06', white, 'hit-pop'),
  'impact-star-3': still('Impacts', 'Starburst', 'star_08', gold, 'hit-pop'),
  'spark-1': still('Impacts', 'Spark', 'spark_01', gold, 'hit-pop'),
  'spark-2': still('Impacts', 'Spark burst', 'spark_03', orange, 'hit-pop'),
  'spark-3': still('Impacts', 'Spark lines', 'spark_05', white, 'hit-pop'),
  'spark-4': still('Impacts', 'Spark spray', 'spark_07', gold, 'hit-pop'),
  'muzzle-1': still('Impacts', 'Muzzle flash', 'muzzle_01', orange, 'hit-pop'),
  'muzzle-2': still('Impacts', 'Muzzle flash 2', 'muzzle_03', gold, 'hit-pop'),
  'muzzle-3': still('Impacts', 'Blast', 'muzzle_05', orange, 'hit-pop'),
  'shock-ring': still('Impacts', 'Shock ring', 'circle_01', white, 'ring-out', 1.6),
  'shock-ring-2': still('Impacts', 'Shock ring 2', 'circle_03', blue, 'ring-out', 1.6),
  'shock-ring-3': still('Impacts', 'Soft ring', 'circle_05', white, 'ring-out', 1.6),
  'flare': still('Impacts', 'Lens flare', 'flare_01', white, 'hit-pop', 1.4),
  'light-1': still('Impacts', 'Light burst', 'light_01', gold, 'hit-pop', 1.4),
  'light-2': still('Impacts', 'Light beams', 'light_03', white, 'hit-pop', 1.4),

  'magic-1': still('Magic', 'Magic circle', 'magic_01', purple, 'spin-glow', 1.4),
  'magic-2': still('Magic', 'Magic sigil', 'magic_03', blue, 'spin-glow', 1.4),
  'magic-3': still('Magic', 'Magic burst', 'magic_05', purple, 'hit-pop', 1.4),
  'twirl-1': still('Magic', 'Twirl', 'twirl_01', blue, 'spin-glow'),
  'twirl-2': still('Magic', 'Vortex', 'twirl_02', purple, 'spin-glow'),
  'twirl-3': still('Magic', 'Whirl', 'twirl_03', white, 'spin-glow'),
  'rune-1': still('Magic', 'Rune', 'symbol_01', gold, 'pop-in'),
  'rune-2': still('Magic', 'Rune 2', 'symbol_02', blue, 'pop-in'),
  'twinkle': still('Magic', 'Twinkle', 'star_01', white, 'flicker'),

  'fire': still('Fire & smoke', 'Fire', 'fire_01', orange, 'flicker'),
  'flame-1': still('Fire & smoke', 'Flame', 'flame_01', orange, 'flicker'),
  'flame-2': still('Fire & smoke', 'Flame tongue', 'flame_04', 0xffb347, 'flicker'),
  'smoke-1': still('Fire & smoke', 'Smoke', 'smoke_01', grey, 'fade-in'),
  'smoke-2': still('Fire & smoke', 'Smoke puff', 'smoke_04', 0xdddddd, 'fade-in'),
  'smoke-3': still('Fire & smoke', 'Smoke cloud', 'smoke_07', grey, 'fade-in'),
  'scorch-1': still('Fire & smoke', 'Scorch mark', 'scorch_01', 0x2b2220, 'fade-in'),
  'scorch-2': still('Fire & smoke', 'Burn mark', 'scorch_03', 0x2b2220, 'fade-in'),
  'dirt-1': still('Fire & smoke', 'Dirt splash', 'dirt_01', 0x7a5a3a, 'hit-pop'),
  'dirt-2': still('Fire & smoke', 'Dirt burst', 'dirt_03', 0x7a5a3a, 'hit-pop'),

  // Frame-by-frame sequences, already coloured.
  'explosion': {group: 'Animated', label: 'Explosion', files: Array.from({length: 9}, (_, i) => `explosion-0${i}`), frameTicks: 2, size: 1.6},
  'flash': {group: 'Animated', label: 'Flash', files: Array.from({length: 9}, (_, i) => `flash-0${i}`), frameTicks: 1, size: 1.4},
  'puff': {group: 'Animated', label: 'White puff', files: Array.from({length: 25}, (_, i) => `puff-${String(i).padStart(2, '0')}`), frameTicks: 1, size: 1.2},
  'black-smoke': {group: 'Animated', label: 'Black smoke', files: Array.from({length: 25}, (_, i) => `black-smoke-${String(i).padStart(2, '0')}`), frameTicks: 1, size: 1.4},
};

/** Where a sticker's art lives (served beside this module in the desktop app and the web build). */
export const stickerArtUrl = file => new URL(`./art/${file}.webp`, import.meta.url).href;
/** Every frame's URL: the bundled art's, or an imported preset's own (imported-presets.mjs). */
export const stickerFrameUrls = sticker => sticker.urls ?? sticker.files.map(stickerArtUrl);
