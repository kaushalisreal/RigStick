// The object library: everyday things, weapons, food, nature, buildings, vehicles, treasure, sports and
// symbols, drawn as strokes, arcs and filled outlines in local pixels (origin = where the object is held
// or stands; y down). Each one builds into an ordinary RigStick figure through ai/presets.mjs buildProp,
// so it poses, recolours, animates, takes effects and joins to a hand like anything else.
import { shapeOutline } from '../pen-tool.mjs';
import { PROPS } from '../ai/presets.mjs';

const C = {ink: '#2b2b2b', white: '#ffffff', red: '#e5383b', orange: '#ff7a1a', gold: '#f5b301', yellow: '#ffd23f', green: '#3fa34d', leaf: '#5cc85a',
  brown: '#8a5a33', wood: '#b07a46', sky: '#4fa3ff', grey: '#8d939b', steel: '#d6dde6', blue: '#2f6fe0', pink: '#ff5d8f', black: '#1b1b1f', purple: '#8a5cf6',
  cream: '#f4e3c3', dark: '#5d3a1e', teal: '#1fb5a8', silver: '#b8c0ca', skin: '#f1c27d', water: '#7cc7ff'};

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
const shape = (kind, x0, y0, x1, y1, options) => { const o = shapeOutline(kind, {x: x0, y: y0}, {x: x1, y: y1}, options); return {path: o.anchors.map(p => [p.x, p.y]), bends: o.bends}; };
// A null fill draws only the outline.
const oval = (cx, cy, rx, ry, fill, color = C.ink, width = 3) => ({...shape('ellipse', cx - rx, cy - ry, cx + rx, cy + ry), ...(fill ? {fill} : {}), width, color});
const box = (x, y, w, h, fill, color = C.ink, width = 3) => ({path: rect(x, y, w, h), fill, width, color});
const poly = (points, fill, color = C.ink, width = 3) => ({path: [...points, points[0]], fill, width, color});
const line = (points, color = C.ink, width = 4, bends) => ({path: points, width, color, ...(bends ? {bends} : {})});
const disc = (x, y, r, color) => ({circle: [x, y, r], color});
const ring = (count, r, make) => Array.from({length: count}, (_, i) => make(i * 2 * Math.PI / count, r));

/** Category → label, for the Presets panel. */
export const OBJECT_CATEGORIES = {
  weapons: 'Weapons & tools', everyday: 'Everyday', food: 'Food', nature: 'Nature & weather', places: 'Buildings & places',
  vehicles: 'Vehicles', treasure: 'Money & treasure', sports: 'Sports & games', symbols: 'Symbols & reactions', scene: 'Scenery',
};

const MORE = {
  // Weapons & tools: held at the grip, blade/head down along the arm (see PROPS.sword).
  katana: {category: 'weapons', about: 'A katana (origin: grip).', parts: [line([[0, 16], [0, 128]], C.steel, 6, [0, 0.12]), box(-12, 10, 24, 6, C.gold, C.dark, 2), line([[0, -16], [0, 10]], C.black, 7)]},
  dagger: {category: 'weapons', about: 'A dagger (origin: grip).', parts: [poly([[-5, 12], [5, 12], [0, 62]], C.steel, C.grey, 2), line([[-12, 10], [12, 10]], C.gold, 5), line([[0, -10], [0, 8]], C.brown, 7)]},
  axe: {category: 'weapons', about: 'A battle axe (origin: grip).', parts: [line([[0, -10], [0, 110]], C.wood, 7), {path: [[0, 80], [34, 64], [40, 104], [0, 96], [0, 80]], bends: [0, 0, 0.6, 0, 0], fill: C.steel, width: 2, color: C.grey}]},
  hammer: {category: 'weapons', about: 'A hammer (origin: grip).', parts: [line([[0, -10], [0, 80]], C.wood, 7), box(-22, 80, 44, 22, C.grey, C.ink, 2)]},
  spear: {category: 'weapons', about: 'A spear (origin: grip near the butt).', parts: [line([[0, -40], [0, 160]], C.wood, 5), poly([[-8, 160], [8, 160], [0, 196]], C.steel, C.grey, 2)]},
  bow: {category: 'weapons', about: 'A bow (origin: grip).', parts: [line([[0, -60], [0, 60]], C.wood, 5, [0, -1.2]), line([[0, -60], [0, 60]], C.white, 1.5)]},
  arrow: {category: 'weapons', about: 'An arrow pointing right (origin: centre).', parts: [line([[-50, 0], [44, 0]], C.wood, 3), poly([[44, -6], [58, 0], [44, 6]], C.steel, C.grey, 1), line([[-50, 0], [-60, -8]], C.red, 3), line([[-50, 0], [-60, 8]], C.red, 3)]},
  shield: {category: 'weapons', about: 'A round shield (origin: centre).', parts: [oval(0, 0, 40, 40, C.blue, '#1d3f8f', 4), oval(0, 0, 14, 14, C.gold, C.dark, 2)]},
  staff: {category: 'weapons', about: 'A magic staff with a glowing orb (origin: grip).', parts: [line([[0, 120], [0, -60]], C.wood, 6, [0, 0.15]), disc(0, -72, 14, C.purple), disc(-4, -76, 5, C.white)]},
  gun: {category: 'weapons', about: 'A cartoon blaster pointing right (origin: grip).', parts: [box(-8, -28, 60, 16, C.grey, C.ink, 2), box(-8, -12, 16, 30, C.black, C.ink, 2), box(52, -24, 10, 8, C.red, C.ink, 1)]},
  wrench: {category: 'weapons', about: 'A wrench (origin: handle end).', parts: [line([[0, 0], [0, 80]], C.silver, 9), oval(0, 92, 14, 14, C.silver, C.grey, 2), box(-4, 92, 8, 16, '#ffffff', '#ffffff', 0)]},
  pickaxe: {category: 'weapons', about: 'A pickaxe (origin: grip).', parts: [line([[0, -10], [0, 100]], C.wood, 6), line([[-46, 112], [46, 112]], C.grey, 9, [0, -0.9])]},

  // Everyday.
  phone: {category: 'everyday', about: 'A smartphone (origin: centre).', parts: [box(-18, -34, 36, 68, C.black, C.ink, 2), box(-14, -28, 28, 52, C.water, C.water, 0), disc(0, 29, 2.5, C.grey)]},
  mug: {category: 'everyday', about: 'A coffee mug (origin: base).', parts: [box(-18, -40, 36, 40, C.white, C.ink, 3), line([[18, -32], [18, -10]], C.ink, 4, [0, -2.6]), line([[-6, -48], [-2, -62]], C.grey, 2, [0, 0.8]), line([[6, -48], [10, -62]], C.grey, 2, [0, 0.8])]},
  book: {category: 'everyday', about: 'A closed book (origin: centre).', parts: [box(-28, -36, 56, 72, C.red, '#9b2226', 3), line([[-20, -36], [-20, 36]], '#9b2226', 3), box(-8, -16, 28, 8, C.gold, C.gold, 0)]},
  backpack: {category: 'everyday', about: 'A backpack (origin: base).', parts: [{path: [[-26, 0], [-26, -56], [26, -56], [26, 0], [-26, 0]], bends: [0, 0, 1.2, 0, 0], fill: C.orange, width: 3, color: C.dark}, box(-16, -30, 32, 20, '#ffa65c', C.dark, 2), line([[-10, -66], [10, -66]], C.dark, 4, [0, 1.6])]},
  umbrella: {category: 'everyday', about: 'An open umbrella (origin: handle end).', parts: [{path: [[-60, -90], [60, -90], [0, -90], [-60, -90]], bends: [0, 2.4, 0, 0], fill: C.red, width: 3, color: '#9b2226'}, line([[0, -92], [0, -6]], C.ink, 4), line([[0, -6], [-12, 0]], C.ink, 4, [0, 1.6])]},
  chair: {category: 'everyday', about: 'A wooden chair (origin: floor under it).', parts: [line([[-20, 0], [-20, -90]], C.wood, 6), line([[20, 0], [20, -46]], C.wood, 6), box(-24, -50, 48, 8, C.wood, C.dark, 2), line([[-20, -90], [-20, -50]], C.wood, 6)]},
  table: {category: 'everyday', about: 'A table (origin: floor under its middle).', parts: [box(-70, -64, 140, 10, C.wood, C.dark, 2), line([[-58, -54], [-58, 0]], C.wood, 7), line([[58, -54], [58, 0]], C.wood, 7)]},
  lamp: {category: 'everyday', about: 'A desk lamp (origin: base).', parts: [box(-24, -8, 48, 8, C.grey, C.ink, 2), line([[0, -8], [10, -70]], C.grey, 5), poly([[-14, -76], [30, -60], [30, -90]], C.yellow, C.ink, 2)]},
  tv: {category: 'everyday', about: 'A television (origin: stand foot).', parts: [box(-70, -110, 140, 90, C.black, C.ink, 3), box(-62, -102, 124, 74, '#3b4a75', '#3b4a75', 0), line([[0, -20], [0, 0]], C.ink, 6), line([[-30, 0], [30, 0]], C.ink, 6)]},
  clock: {category: 'everyday', about: 'A wall clock (origin: centre).', parts: [oval(0, 0, 36, 36, C.white, C.ink, 4), line([[0, 0], [0, -24]], C.ink, 4), line([[0, 0], [16, 6]], C.red, 3)]},
  key: {category: 'everyday', about: 'A key (origin: bow centre).', parts: [oval(0, 0, 14, 14, C.gold, C.dark, 3), line([[14, 0], [64, 0]], C.gold, 6), line([[54, 0], [54, 12]], C.gold, 5), line([[64, 0], [64, 10]], C.gold, 5)]},
  camera: {category: 'everyday', about: 'A photo camera (origin: centre).', parts: [box(-36, -24, 72, 48, C.black, C.ink, 2), oval(0, 0, 16, 16, C.grey, C.ink, 3), box(18, -32, 12, 8, C.grey, C.ink, 1)]},
  guitar: {category: 'everyday', about: 'An acoustic guitar (origin: neck grip).', parts: [line([[0, -70], [0, 30]], C.dark, 7), oval(0, 52, 26, 26, C.wood, C.dark, 3), oval(0, 82, 32, 30, C.wood, C.dark, 3), disc(0, 64, 8, C.dark)]},
  balloon: {category: 'everyday', about: 'A balloon on a string (origin: end of the string).', parts: [line([[0, 0], [0, -70]], C.ink, 2, [0, 0.6]), oval(0, -100, 24, 30, C.red, '#9b2226', 2), disc(-8, -112, 4, '#ffb3b8')]},
  gift: {category: 'everyday', about: 'A wrapped gift box (origin: base).', parts: [box(-30, -50, 60, 50, C.purple, '#5b3fb0', 3), box(-34, -60, 68, 12, '#a98bff', '#5b3fb0', 3), line([[0, -60], [0, 0]], C.gold, 6), line([[0, -60], [-14, -76]], C.gold, 5, [0, 1.6]), line([[0, -60], [14, -76]], C.gold, 5, [0, -1.6])]},
  envelope: {category: 'everyday', about: 'A letter envelope (origin: centre).', parts: [box(-40, -26, 80, 52, C.white, C.ink, 3), line([[-40, -26], [0, 6], [40, -26]], C.ink, 3)]},
  pencil: {category: 'everyday', about: 'A pencil (origin: centre).', parts: [box(-50, -7, 84, 14, C.yellow, C.dark, 2), poly([[34, -7], [52, 0], [34, 7]], C.cream, C.dark, 2), box(-58, -7, 8, 14, C.pink, C.dark, 2)]},
  trophy: {category: 'everyday', about: 'A gold trophy (origin: base).', parts: [box(-24, -12, 48, 12, C.dark, C.ink, 2), line([[0, -12], [0, -58]], C.gold, 8), {path: [[-26, -80], [26, -80], [0, -80], [-26, -80]], bends: [0, -2.8, 0, 0], fill: C.gold, width: 2, color: '#c98f00'}, line([[-26, -76], [-38, -60]], C.gold, 4, [0, -1.4]), line([[26, -76], [38, -60]], C.gold, 4, [0, 1.4])]},
  magnifier: {category: 'everyday', about: 'A magnifying glass (origin: handle end).', parts: [line([[0, 0], [-34, -34]], C.dark, 8), oval(-52, -52, 24, 24, '#cfe8ff', C.ink, 5)]},
  battery: {category: 'everyday', about: 'A battery (origin: centre).', parts: [box(-30, -16, 56, 32, C.white, C.ink, 3), box(26, -6, 6, 12, C.ink, C.ink, 0), box(-26, -12, 32, 24, C.green, C.green, 0)]},

  // Food.
  apple: {category: 'food', about: 'A red apple (origin: centre).', parts: [oval(0, 0, 22, 20, C.red, '#9b2226', 2), line([[0, -18], [2, -30]], C.dark, 3), oval(10, -28, 8, 4, C.leaf, C.green, 1)]},
  banana: {category: 'food', about: 'A banana (origin: centre).', parts: [line([[-34, -10], [34, -10]], C.yellow, 12, [0, -1.6]), disc(-36, -12, 3, C.dark)]},
  burger: {category: 'food', about: 'A burger (origin: base).', parts: [box(-34, -12, 68, 12, '#e3a857', C.dark, 2), box(-36, -22, 72, 10, C.dark, C.dark, 0), box(-38, -28, 76, 6, C.leaf, C.green, 1),
    {path: [[-34, -30], [34, -30], [0, -30], [-34, -30]], bends: [0, 2.4, 0, 0], fill: '#e3a857', width: 2, color: C.dark}]},
  pizza: {category: 'food', about: 'A slice of pizza (origin: tip).', parts: [poly([[0, 0], [-34, -80], [34, -80]], C.yellow, '#c98f00'), box(-38, -88, 76, 10, '#e3a857', C.dark, 2), disc(-8, -50, 6, C.red), disc(10, -64, 6, C.red), disc(2, -28, 5, C.red)]},
  icecream: {category: 'food', about: 'An ice cream cone (origin: tip of the cone).', parts: [poly([[0, 0], [-18, -50], [18, -50]], '#e3a857', C.dark, 2), disc(0, -60, 20, C.pink), disc(-4, -82, 14, '#fff4d6')]},
  donut: {category: 'food', about: 'A frosted donut (origin: centre).', parts: [oval(0, 0, 30, 30, '#e3a857', C.dark, 2), oval(0, -2, 26, 24, C.pink, C.pink, 0), disc(0, 0, 9, C.white)]},
  cake: {category: 'food', about: 'A birthday cake with a candle (origin: base).', parts: [box(-40, -40, 80, 40, C.cream, C.dark, 2), box(-40, -48, 80, 10, C.pink, C.pink, 0), line([[0, -48], [0, -70]], C.sky, 5), disc(0, -76, 5, C.orange)]},

  // Nature & weather.
  pine: {category: 'nature', about: 'A pine tree (origin: base).', parts: [box(-6, -20, 12, 20, C.brown, C.dark, 2), poly([[0, -130], [-34, -70], [34, -70]], C.green, '#1f6b2f'), poly([[0, -100], [-44, -20], [44, -20]], C.green, '#1f6b2f')]},
  bush: {category: 'nature', about: 'A bush (origin: base).', parts: [disc(-26, -22, 24, C.green), disc(0, -34, 28, C.leaf), disc(26, -22, 24, C.green)]},
  flower: {category: 'nature', about: 'A flower (origin: base of the stem).', parts: [line([[0, 0], [0, -60]], C.green, 4, [0, 0.3]), ...ring(6, 12, (a, r) => disc(Math.cos(a) * r, -66 + Math.sin(a) * r, 9, C.pink)), disc(0, -66, 8, C.yellow)]},
  grass: {category: 'nature', about: 'A tuft of grass (origin: base).', parts: [-20, -10, 0, 10, 20].map((x, i) => line([[x, 0], [x + (i - 2) * 6, -30 - (i % 2) * 12]], i % 2 ? C.leaf : C.green, 4, [0, 0.4]))},
  mountain: {category: 'nature', about: 'A snowy mountain (origin: base centre).', parts: [poly([[-150, 0], [0, -180], [150, 0]], '#6b7aa1', '#3b4a75'), poly([[-38, -134], [0, -180], [38, -134], [14, -126], [0, -140], [-16, -124]], C.white, C.white, 1)]},
  lightning: {category: 'nature', about: 'A lightning bolt (origin: top).', parts: [poly([[0, 0], [-22, 50], [-4, 50], [-18, 100], [26, 34], [6, 34], [20, 0]], C.yellow, C.orange)]},
  raindrop: {category: 'nature', about: 'A water drop (origin: centre).', parts: [{path: [[0, -26], [16, 6], [-16, 6], [0, -26]], bends: [0, 0.3, 2.8, 0.3], fill: C.water, width: 2, color: C.blue}]},
  fire: {category: 'nature', about: 'A campfire flame (origin: base).', parts: [{path: [[-30, 0], [0, -80], [30, 0], [-30, 0]], bends: [0, -0.5, -0.5, 1.2], fill: C.orange, width: 2, color: C.red}, {path: [[-14, 0], [0, -44], [14, 0], [-14, 0]], bends: [0, -0.4, -0.4, 1], fill: C.yellow, width: 0, color: C.yellow}]},
  snowflake: {category: 'nature', about: 'A snowflake (origin: centre).', parts: ring(6, 26, a => line([[0, 0], [Math.cos(a) * 26, Math.sin(a) * 26]], C.water, 4))},
  rainbow: {category: 'nature', about: 'A rainbow arc (origin: centre of its base).', parts: [C.red, C.orange, C.yellow, C.leaf, C.sky, C.purple].map((color, i) => line([[-110 + i * 9, 0], [110 - i * 9, 0]], color, 9, [0, -Math.PI]))},
  leaf: {category: 'nature', about: 'A leaf (origin: stem).', parts: [{path: [[0, 0], [-15, -25], [0, -52], [15, -25], [0, 0]], bends: [0, 0.45, 0.45, 0.45, 0.45], fill: C.leaf, width: 2, color: C.green}, line([[0, 0], [0, -46]], C.green, 2)]},

  // Buildings & places.
  skyscraper: {category: 'places', about: 'A tall office tower with windows (origin: base centre).', parts: [box(-40, -300, 80, 300, '#3b4a75', '#232c4f'), ...Array.from({length: 9}, (_, row) => ({windows: [-24, -8, 8, 24].filter((_, i) => (row + i) % 3).map(x => [x - 4, -280 + row * 30]), color: '#ffd36b'}))]},
  shop: {category: 'places', about: 'A little shop with an awning (origin: base centre).', parts: [box(-70, -100, 140, 100, C.cream, C.ink), box(-78, -112, 156, 20, C.red, '#9b2226'), box(-56, -70, 50, 40, C.water, C.ink, 2), box(14, -60, 34, 60, C.wood, C.ink, 2)]},
  castle: {category: 'places', about: 'A castle tower (origin: base centre).', parts: [box(-50, -170, 100, 170, C.grey, '#5f646b'), ...[-50, -25, 0, 25].map(x => box(x, -186, 18, 16, C.grey, '#5f646b', 2)), {path: [[-16, 0], [-16, -40], [16, -40], [16, 0]], bends: [0, 0, 0, 0], fill: C.dark, width: 2, color: C.ink}, poly([[0, -240], [0, -186], [0, -240], [30, -228], [0, -216]], C.red, C.red, 2)]},
  door: {category: 'places', about: 'A door (origin: floor at its middle).', parts: [box(-30, -120, 60, 120, C.wood, C.dark), disc(18, -60, 4, C.gold)]},
  window: {category: 'places', about: 'A window (origin: centre).', parts: [box(-40, -40, 80, 80, C.water, C.ink, 5), line([[0, -40], [0, 40]], C.ink, 4), line([[-40, 0], [40, 0]], C.ink, 4)]},
  fence: {category: 'places', about: 'A picket fence (origin: bottom left).', parts: [line([[0, -30], [200, -30]], C.wood, 6), ...[10, 50, 90, 130, 170].map(x => poly([[x, 0], [x, -60], [x + 10, -72], [x + 20, -60], [x + 20, 0]], C.cream, C.dark, 2))]},
  bench: {category: 'places', about: 'A park bench (origin: ground under its middle).', parts: [box(-70, -40, 140, 8, C.wood, C.dark, 2), box(-70, -70, 140, 8, C.wood, C.dark, 2), line([[-60, -32], [-60, 0]], C.ink, 5), line([[60, -32], [60, 0]], C.ink, 5)]},
  streetlamp: {category: 'places', about: 'A street lamp (origin: foot of the post).', parts: [line([[0, 0], [0, -200]], '#3b4a75', 7), line([[0, -200], [34, -210]], '#3b4a75', 5, [0, -0.6]), oval(38, -200, 12, 8, C.yellow, C.gold, 2)]},
  tent: {category: 'places', about: 'A camping tent (origin: ground centre).', parts: [poly([[-70, 0], [0, -80], [70, 0]], C.orange, C.dark), poly([[-16, 0], [0, -36], [16, 0]], C.dark, C.dark, 1)]},

  // Vehicles: facing right, origin on the ground under the middle.
  bike: {category: 'vehicles', about: 'A bicycle (origin: ground under the middle).', parts: [oval(-36, -24, 22, 22, null, C.ink, 4), oval(36, -24, 22, 22, null, C.ink, 4), line([[-36, -24], [-6, -56], [24, -56], [36, -24]], C.red, 4), line([[-6, -56], [0, -24], [-36, -24]], C.red, 4), line([[24, -56], [28, -66]], C.ink, 4)]},
  bus: {category: 'vehicles', about: 'A city bus (origin: ground under the middle).', parts: [box(-110, -90, 220, 72, C.yellow, C.dark), ...[-94, -54, -14, 26].map(x => box(x, -80, 30, 24, C.water, C.ink, 2)), box(66, -80, 30, 44, C.water, C.ink, 2), disc(-70, -16, 16, C.black), disc(70, -16, 16, C.black)]},
  truck: {category: 'vehicles', about: 'A delivery truck (origin: ground under the middle).', parts: [box(-100, -110, 130, 90, C.white, C.ink), box(30, -80, 60, 60, C.red, '#9b2226'), box(48, -74, 34, 22, C.water, C.ink, 2), disc(-64, -16, 16, C.black), disc(56, -16, 16, C.black)]},
  plane: {category: 'vehicles', about: 'A plane flying right (origin: centre).', parts: [oval(0, 0, 90, 16, C.white, C.ink), poly([[-10, -4], [-40, -60], [-20, -60], [20, -4]], C.sky, C.ink, 2), poly([[-78, -6], [-96, -40], [-82, -40], [-62, -6]], C.sky, C.ink, 2), disc(60, -4, 6, C.water)]},
  rocket: {category: 'vehicles', about: 'A rocket pointing up (origin: base).', parts: [{path: [[-20, -20], [-20, -110], [0, -150], [20, -110], [20, -20], [-20, -20]], bends: [0, 0.4, 0.4, 0, 0, 0], fill: C.white, width: 3, color: C.ink}, disc(0, -96, 10, C.water), poly([[-20, -50], [-40, -10], [-20, -20]], C.red, C.ink, 2), poly([[20, -50], [40, -10], [20, -20]], C.red, C.ink, 2)]},
  boat: {category: 'vehicles', about: 'A sailing boat (origin: waterline centre).', parts: [poly([[-70, -20], [70, -20], [50, 10], [-50, 10]], C.wood, C.dark), line([[0, -20], [0, -140]], C.dark, 4), poly([[4, -136], [60, -30], [4, -30]], C.white, C.ink, 2)]},
  ufo: {category: 'vehicles', about: 'A flying saucer (origin: centre).', parts: [oval(0, -14, 26, 22, '#cfe8ff', C.ink, 2), oval(0, 0, 70, 16, C.silver, C.ink), ...[-40, 0, 40].map(x => disc(x, 4, 5, C.yellow))]},
  motorbike: {category: 'vehicles', about: 'A motorbike (origin: ground under the middle).', parts: [disc(-44, -20, 20, C.black), disc(44, -20, 20, C.black), disc(-44, -20, 8, C.grey), disc(44, -20, 8, C.grey), poly([[-44, -20], [-20, -54], [24, -54], [44, -20], [10, -30]], C.red, C.ink, 3), line([[24, -54], [34, -76]], C.ink, 4)]},

  // Money & treasure.
  cash: {category: 'treasure', about: 'A stack of banknotes (origin: centre).', parts: [box(-44, -18, 88, 36, '#86c56b', '#2f6b2a'), oval(0, 0, 10, 10, '#b8e0a8', '#2f6b2a', 2), box(-44, -24, 88, 6, '#9fd486', '#2f6b2a', 2)]},
  moneybag: {category: 'treasure', about: 'A money bag (origin: base).', parts: [oval(0, -34, 34, 32, '#c9a46a', C.dark), line([[-10, -66], [10, -66]], C.dark, 6), poly([[-10, -66], [-18, -80], [18, -80], [10, -66]], '#c9a46a', C.dark, 2), line([[0, -48], [0, -20]], C.green, 4), line([[-8, -42], [8, -26]], C.green, 4, [0, 1.6])]},
  gem: {category: 'treasure', about: 'A cut gemstone (origin: centre).', parts: [poly([[-26, -10], [-14, -24], [14, -24], [26, -10], [0, 26]], C.teal, '#0d7068'), line([[-26, -10], [26, -10]], '#0d7068', 2)]},
  chest: {category: 'treasure', about: 'A treasure chest (origin: base).', parts: [box(-44, -44, 88, 44, C.wood, C.dark), {path: [[-44, -44], [44, -44], [0, -44], [-44, -44]], bends: [0, 2.2, 0, 0], fill: C.wood, width: 3, color: C.dark}, box(-6, -52, 12, 16, C.gold, C.dark, 2), line([[-44, -22], [44, -22]], C.gold, 4)]},
  crown: {category: 'treasure', about: 'A royal crown (origin: base centre).', parts: [poly([[-36, 0], [-40, -40], [-18, -20], [0, -46], [18, -20], [40, -40], [36, 0]], C.gold, '#c98f00'), disc(0, -12, 5, C.red), disc(-20, -10, 4, C.teal), disc(20, -10, 4, C.teal)]},

  // Sports & games.
  football: {category: 'sports', about: 'A soccer ball (origin: centre).', parts: [oval(0, 0, 20, 20, C.white, C.ink), poly([[0, -7], [7, -2], [4, 6], [-4, 6], [-7, -2]], C.ink, C.ink, 1)]},
  basketball: {category: 'sports', about: 'A basketball (origin: centre).', parts: [oval(0, 0, 22, 22, C.orange, C.dark), line([[-22, 0], [22, 0]], C.dark, 2), line([[0, -22], [0, 22]], C.dark, 2)]},
  bat: {category: 'sports', about: 'A baseball bat (origin: grip).', parts: [line([[0, -10], [0, 40]], C.wood, 6), line([[0, 40], [0, 110]], C.wood, 13)]},
  racket: {category: 'sports', about: 'A tennis racket (origin: grip).', parts: [line([[0, 0], [0, 50]], C.ink, 6), oval(0, 82, 24, 32, null, C.red, 5)]},
  dice: {category: 'sports', about: 'A dice (origin: centre).', parts: [box(-20, -20, 40, 40, C.white, C.ink), disc(-10, -10, 4, C.ink), disc(0, 0, 4, C.ink), disc(10, 10, 4, C.ink)]},
  controller: {category: 'sports', about: 'A game controller (origin: centre).', parts: [oval(0, 0, 44, 22, C.grey, C.ink), line([[-26, 0], [-14, 0]], C.ink, 4), line([[-20, -6], [-20, 6]], C.ink, 4), disc(18, -4, 4, C.red), disc(26, 4, 4, C.blue)]},
  goal: {category: 'sports', about: 'A football goal (origin: ground centre).', parts: [line([[-100, 0], [-100, -80], [100, -80], [100, 0]], C.white, 6), ...[-60, -20, 20, 60].map(x => line([[x, -80], [x, 0]], '#d6dde6', 1))]},

  // Symbols & reactions: comic marks that float near a character.
  exclamation: {category: 'symbols', about: 'A big exclamation mark (origin: centre).', parts: [line([[0, -30], [0, 8]], C.red, 10), disc(0, 24, 6, C.red)]},
  question: {category: 'symbols', about: 'A question mark (origin: centre).', parts: [line([[-14, -14], [14, -14], [0, 6]], C.blue, 8, [0, 2.6, 0.8]), disc(0, 24, 5, C.blue)]},
  thought: {category: 'symbols', about: 'A thought bubble (origin: smallest bubble).', parts: [disc(0, 0, 5, C.white), disc(12, -16, 8, C.white), oval(60, -60, 60, 36, C.white, C.ink)]},
  check: {category: 'symbols', about: 'A green tick (origin: centre).', parts: [line([[-24, 0], [-6, 18], [26, -20]], C.green, 10)]},
  cross: {category: 'symbols', about: 'A red cross (origin: centre).', parts: [line([[-20, -20], [20, 20]], C.red, 10), line([[20, -20], [-20, 20]], C.red, 10)]},
  pointer: {category: 'symbols', about: 'A direction arrow pointing right (origin: centre).', parts: [poly([[-40, -12], [10, -12], [10, -28], [44, 0], [10, 28], [10, 12], [-40, 12]], C.orange, C.dark)]},
  anger: {category: 'symbols', about: 'A cartoon anger mark (origin: centre).', parts: [0, 1, 2, 3].map(i => { const a = i * Math.PI / 2 + Math.PI / 4; return line([[Math.cos(a) * 6, Math.sin(a) * 6], [Math.cos(a) * 22, Math.sin(a) * 22]], C.red, 6, [0, 1.2]); })},
  sweat: {category: 'symbols', about: 'A nervous sweat drop (origin: centre).', parts: [{path: [[0, -18], [10, 6], [-10, 6], [0, -18]], bends: [0, 0.3, 2.8, 0.3], fill: '#9fd6ff', width: 2, color: C.blue}]},
  zzz: {category: 'symbols', about: 'Sleeping Zzz (origin: bottom left).', parts: [[0, 0, 14], [20, -24, 18], [46, -54, 24]].map(([x, y, s]) => line([[x, y - s], [x + s, y - s], [x, y], [x + s, y]], C.blue, 4))},
  music: {category: 'symbols', about: 'A music note (origin: centre).', parts: [oval(-8, 16, 10, 8, C.ink, C.ink, 1), line([[2, 16], [2, -24]], C.ink, 4), line([[2, -24], [18, -16]], C.ink, 6, [0, 0.6])]},
  idea: {category: 'symbols', about: 'A light-bulb idea (origin: base of the bulb).', parts: [box(-10, -10, 20, 10, C.grey, C.ink, 2), oval(0, -34, 22, 24, C.yellow, C.gold), ...ring(5, 0, (a) => { const t = -Math.PI / 2 + (a - Math.PI) * 0.35; return line([[Math.cos(t) * 30, -34 + Math.sin(t) * 30], [Math.cos(t) * 42, -34 + Math.sin(t) * 42]], C.gold, 4); })]},
  skull: {category: 'symbols', about: 'A cartoon skull (origin: centre).', parts: [oval(0, -6, 26, 24, C.white, C.ink), box(-14, 14, 28, 12, C.white, C.ink, 2), disc(-10, -6, 7, C.ink), disc(10, -6, 7, C.ink)]},
  target: {category: 'symbols', about: 'A bullseye target (origin: centre).', parts: [oval(0, 0, 40, 40, C.white, C.red, 6), oval(0, 0, 24, 24, C.red, C.red, 1), disc(0, 0, 9, C.white)]},
  burst: {category: 'symbols', about: 'A comic "BOOM" burst shape (origin: centre).', parts: [{...shape('star', 0, 0, 70, 54, {centred: true}), fill: C.yellow, width: 4, color: C.red}, {...shape('star', 0, 0, 40, 30, {centred: true}), fill: C.orange, width: 0, color: C.orange}]},
  speedlines: {category: 'symbols', about: 'Cartoon speed lines trailing left (origin: front of the lines).', parts: [[-10, -20, 80], [-20, 0, 110], [-10, 20, 70]].map(([x, y, l]) => line([[x, y], [x - l, y]], C.ink, 4))},
  heartbreak: {category: 'symbols', about: 'A broken heart (origin: centre).', parts: [{path: [[0, 22], [-24, -2], [0, -10], [24, -2], [0, 22]], bends: [0, 0.5, 2.6, 2.6, 0.5], fill: C.red, width: 2, color: '#b21f2d'}, line([[0, -10], [-6, 2], [6, 8], [0, 22]], C.white, 3)]},
};

// The ai/presets.mjs props, filed by category.
const CATEGORY_OF = {ball: 'sports', sword: 'weapons', coin: 'treasure', heart: 'symbols', star: 'symbols', tree: 'nature', house: 'places', car: 'vehicles', sign: 'places',
  bubble: 'symbols', cloud: 'nature', sun: 'nature', rock: 'nature', laptop: 'everyday', bomb: 'weapons', moon: 'nature', skyline: 'scene', rooftop: 'scene'};

/** Every object by name: {category, about, parts | make}. */
export const OBJECTS = Object.fromEntries([
  ...Object.entries(PROPS).map(([name, prop]) => [name, {category: CATEGORY_OF[name] ?? 'everyday', ...prop}]),
  ...Object.entries(MORE),
]);
