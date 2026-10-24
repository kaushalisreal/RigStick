// RigStick's preset library for AI clients and beginners: everything a scene needs, addressed by name,
// so an AI spends a few tokens on "prop: sword" instead of hundreds on coordinates and code.
//
// Props are drawn once here as strokes and circles in local pixels (origin = where the prop is held or
// stands; y down) and built through the editor's own commands, so every prop is an ordinary rigged
// figure: it poses, animates, takes VFX and joins to a hand like anything else.
import { MOVES } from './moves.mjs';
import { shapeOutline } from '../pen-tool.mjs';

const C = {ink: '#2b2b2b', white: '#ffffff', red: '#e5383b', orange: '#ff7a1a', gold: '#f5b301', yellow: '#ffd23f', green: '#3fa34d', leaf: '#5cc85a',
  brown: '#8a5a33', wood: '#b07a46', sky: '#4fa3ff', grey: '#8d939b', steel: '#d6dde6', blue: '#2f6fe0', pink: '#ff5d8f', black: '#1b1b1f'};

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
const outline = (kind, x0, y0, x1, y1, options) => { const o = shapeOutline(kind, {x: x0, y: y0}, {x: x1, y: y1}, options); return {path: o.anchors.map(p => [p.x, p.y]), bends: o.bends}; };

/** Each prop: a list of parts. path parts are polylines (bends per edge, radians), circle parts are filled discs. */
export const PROPS = {
  ball: {about: 'A bouncy ball (origin: centre).', parts: [{circle: [0, 0, 18], color: C.red}, {path: [[-18, 0], [18, 0]], bends: [0, 0.9], width: 3, color: C.white}]},
  // Authored lowered (blade down along the arm): a held prop turns with the forearm, so raising the arm
  // overhead swings the blade up, as a real sword would.
  sword: {about: 'A sword held at the grip (origin: grip). Held, it hangs blade-down at the side and points up when the arm is raised.', parts: [
    {path: [[0, 14], [0, 110]], width: 7, color: C.steel}, {path: [[-16, 12], [16, 12]], width: 6, color: C.gold}, {path: [[0, -10], [0, 10]], width: 8, color: C.brown}]},
  coin: {about: 'A gold coin (origin: centre).', parts: [{circle: [0, 0, 14], color: C.gold}, {path: [[-6, 0], [6, 0]], width: 3, color: '#c98f00'}]},
  heart: {about: 'A red heart (origin: centre).', parts: [{path: [[0, 22], [-24, -2], [0, -10], [24, -2], [0, 22]], bends: [0, 0.5, 2.6, 2.6, 0.5], fill: C.red, width: 2, color: '#b21f2d'}]},
  star: {about: 'A gold star (origin: centre).', parts: [{...outline('star', 0, 0, 26, 26, {centred: true}), fill: C.yellow, width: 3, color: C.gold}]},
  tree: {about: 'A tree standing on its trunk (origin: base).', parts: [{path: rect(-8, -70, 16, 70), fill: C.brown, width: 2, color: '#5d3a1e'},
    {circle: [0, -95, 42], color: C.green}, {circle: [-26, -78, 26], color: C.leaf}, {circle: [24, -80, 24], color: C.leaf}]},
  house: {about: 'A house (origin: bottom centre).', parts: [{path: rect(-55, -80, 110, 80), fill: '#f4e3c3', width: 3, color: C.ink},
    {path: [[-65, -80], [0, -130], [65, -80], [-65, -80]], fill: C.red, width: 3, color: '#9b2226'}, {path: rect(-14, -44, 28, 44), fill: C.wood, width: 2, color: C.ink},
    {path: rect(22, -66, 22, 20), fill: C.sky, width: 2, color: C.ink}]},
  car: {about: 'A small car (origin: ground under its middle).', parts: [{path: [[-70, -18], [-70, -42], [-40, -44], [-22, -70], [30, -70], [48, -44], [70, -40], [70, -18], [-70, -18]], bends: [0, 0, 0, 0, 0, 0, 0, 0, 0], fill: C.blue, width: 3, color: '#1d3f8f'},
    {path: rect(-16, -64, 40, 20), fill: '#cfe8ff', width: 2, color: '#1d3f8f'}, {circle: [-40, -14, 14], color: C.black}, {circle: [42, -14, 14], color: C.black}]},
  sign: {about: 'A signpost (origin: foot of the post).', parts: [{path: [[0, 0], [0, -90]], width: 7, color: C.wood}, {path: rect(-50, -130, 100, 46), fill: C.white, width: 4, color: C.ink}]},
  bubble: {about: 'A speech bubble (origin: tip of its tail).', parts: [{...outline('ellipse', 30, -80, 150, -10), fill: C.white, width: 3, color: C.ink},
    {path: [[0, 0], [52, -22], [74, -16], [0, 0]], fill: C.white, width: 3, color: C.ink}]},
  cloud: {about: 'A cloud (origin: centre).', parts: [{circle: [-30, 4, 24], color: C.white}, {circle: [0, -8, 32], color: C.white}, {circle: [32, 4, 24], color: C.white}]},
  sun: {about: 'A sun with rays (origin: centre).', parts: [...Array.from({length: 8}, (_, i) => { const a = i * Math.PI / 4; return {path: [[Math.cos(a) * 44, Math.sin(a) * 44], [Math.cos(a) * 64, Math.sin(a) * 64]], width: 6, color: C.orange}; }), {circle: [0, 0, 36], color: C.yellow}]},
  rock: {about: 'A boulder (origin: base).', parts: [{path: [[-50, 0], [-44, -36], [-10, -56], [30, -46], [52, -12], [50, 0], [-50, 0]], bends: [0, 0.5, 0.4, 0.4, 0.5, 0.2, 0], fill: C.grey, width: 3, color: '#5f646b'}]},
  laptop: {about: 'An open laptop (origin: front of the base).', parts: [{path: rect(-44, -64, 88, 56), fill: C.ink, width: 3, color: C.black}, {path: rect(-38, -58, 76, 44), fill: '#7cc7ff', width: 0, color: '#7cc7ff'},
    {path: [[-56, 0], [56, 0], [44, -8], [-44, -8], [-56, 0]], fill: C.grey, width: 2, color: C.ink}]},
  bomb: {about: 'A cartoon bomb (origin: centre).', parts: [{circle: [0, 0, 26], color: C.black}, {path: [[14, -22], [30, -40]], bends: [0, -0.9], width: 4, color: C.wood}, {circle: [32, -44, 6], color: C.orange}]},
  moon: {about: 'A glowing full moon (origin: centre).', parts: [{circle: [0, 0, 46], color: '#fff6d8'}, {circle: [-14, -10, 9], color: '#efe3b8'}, {circle: [12, 14, 6], color: '#efe3b8'}]},
  skyline: {about: 'A row of skyscrapers with lit windows, about 1900px wide (origin: bottom left). Options: depth far|mid|near, seed.', make: skyline},
  rooftop: {about: 'The top of a tall building to stand on: roof edge, parapet, antenna (origin: centre of the roof surface).', make: rooftop},
};

export const TEXT_STYLES = {
  title: {size: 64, color: '#1b1b1f'}, subtitle: {size: 36, color: '#3a3a42'}, caption: {size: 28, color: '#1b1b1f'},
  shout: {size: 84, color: '#e5383b'}, label: {size: 22, color: '#5a5a63'}, glow: {size: 56, color: '#ff6a1a'},
};
export const BACKGROUNDS = {white: '#ffffff', paper: '#f6f1e7', sky: '#bfe3ff', sunset: '#ffb38a', night: '#1b2140', grass: '#cdeec0', studio: '#2b2d35', mint: '#d9f5ea'};
export const CAMERA_MOVES = ['follow', 'shake', 'handheld', 'wobble', 'impact', 'zoom-pulse'];
export const VFX_GENERATED = ['explosion', 'smoke', 'aura', 'beam', 'particles'];

/** The whole menu in a few hundred tokens: what an AI reads instead of inventing effects. */
export function catalog(vfxLooks = []) {
  return {
    moves: MOVES, camera: CAMERA_MOVES,
    vfx: {generated: VFX_GENERATED, looks: vfxLooks},
    props: Object.fromEntries(Object.entries(PROPS).map(([name, prop]) => [name, prop.about])),
    textStyles: Object.keys(TEXT_STYLES), backgrounds: Object.keys(BACKGROUNDS),
  };
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** Arc spec from a to b turning by `bend` (same convention as src/pen-tool.mjs arcSpec), scaled. */
function edge(a, b, bend, scale) {
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]) * scale, phi = Math.atan2(b[1] - a[1], b[0] - a[0]);
  bend = Math.max(-1.95 * Math.PI, Math.min(1.95 * Math.PI, bend));
  const length = Math.abs(bend) < 1e-6 ? chord : chord * (bend / 2) / Math.sin(bend / 2);
  return {type: 'line', length, angle: phi - bend / 2, bend};
}

/** Deterministic pseudo-random numbers, so a seed always builds the same city. */
function random(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

/** Skyscrapers side by side, tallest in front: far = hazy and dim, near = dark with bright windows. */
function skyline({depth = 'mid', seed = 7, width = 1900} = {}) {
  const look = {far: {body: '#3b4a75', glass: '#7e8fc4', lit: 0.25, min: 160, max: 300, gap: 6},
    mid: {body: '#232c4f', glass: '#ffd36b', lit: 0.45, min: 220, max: 400, gap: 10},
    near: {body: '#141a33', glass: '#ffe08a', lit: 0.6, min: 300, max: 520, gap: 16}}[depth] ?? {body: '#232c4f', glass: '#ffd36b', lit: 0.45, min: 220, max: 400, gap: 10};
  const rand = random(seed + depth.length * 101), parts = [];
  for (let x = 0; x < width;) {
    const w = 70 + Math.round(rand() * 90), h = look.min + Math.round(rand() * (look.max - look.min));
    parts.push({path: rect(x, -h, w, h), fill: look.body, width: 0, color: look.body});
    if (rand() < 0.35) parts.push({path: [[x + w / 2, -h], [x + w / 2, -h - 30 - rand() * 40]], width: 3, color: look.body});
    // Window rows: each row is one chain of lit and unlit panes (thickness 0 between panes).
    for (let y = -h + 18; y < -14; y += 22) {
      const row = [];
      for (let wx = x + 10; wx + 10 < x + w - 6; wx += 16) if (rand() < look.lit) row.push([wx, y]);
      if (row.length) parts.push({windows: row, color: look.glass});
    }
    x += w + look.gap;
  }
  return parts;
}

/** A rooftop: the building's top floors, a parapet, a water tank and an antenna. */
function rooftop() {
  return [{path: rect(-170, 0, 340, 260), fill: '#10142a', width: 0, color: '#10142a'},
    {path: rect(-185, -10, 370, 14), fill: '#2a3157', width: 0, color: '#2a3157'},
    {path: rect(110, -60, 44, 50), fill: '#39406b', width: 0, color: '#39406b'},
    {path: [[-120, -10], [-120, -120]], width: 4, color: '#5b628c'}, {circle: [-120, -124, 5], color: '#ff4d6d'},
    {windows: [[-140, 40], [-100, 40], [-20, 40], [60, 40], [120, 40], [-120, 90], [-40, 90], [20, 90], [100, 90]], color: '#ffd36b'}];
}

/**
 * Builds prop `name` as a new figure whose root sits at (x, y) in ONE addSegments call (call it inside a
 * batch): every part hangs off the root by an invisible link, colours ride on the segments, and closed
 * parts get a polygon fill. Generated props (make) take `options`. Returns the new figure's uid.
 */
export function buildProp(editor, name, {x, y, scale = 1, tint, options = {}, definition} = {}) {
  // `definition`: a prop from another library (src/presets/objects.mjs) drawn the same way.
  const prop = definition ?? PROPS[name];
  if (!prop) throw new Error(`Unknown prop "${name}". Props: ${Object.keys(PROPS).join(', ')}.`);
  const paint = hex => rgb(tint && hex !== C.white && hex !== C.black ? tint : hex);
  const parts = prop.make ? prop.make(options) : prop.parts, specs = [], fills = [];
  for (const part of parts) {
    const first = part.circle ? [part.circle[0] - part.circle[2], part.circle[1]] : part.windows ? part.windows[0] : part.path[0];
    const linkIndex = specs.length;
    specs.push({...edge([0, 0], first, 0, scale), thickness: 0, parentId: 0, color: paint(part.color ?? C.ink)});
    if (part.circle) specs.push({type: 'circleFill', length: part.circle[2] * 2 * scale, angle: 0, thickness: 0, color: paint(part.color ?? C.ink)});
    else if (part.windows) {
      part.windows.forEach((point, i) => {
        if (i) specs.push({...edge(part.windows[i - 1], point, 0, scale), thickness: 0, color: paint(part.color)});
        specs.push({...edge(point, [point[0] + 8, point[1]], 0, scale), thickness: 10 * scale, color: paint(part.color)});
        specs.push({...edge([point[0] + 8, point[1]], point, 0, scale), thickness: 0, color: paint(part.color)});
      });
    } else {
      for (let i = 1; i < part.path.length; i++) specs.push({...edge(part.path[i - 1], part.path[i], part.bends?.[i] ?? 0, scale), thickness: (part.width ?? 4) * scale, color: paint(part.color ?? C.ink)});
      if (part.fill && part.path.length >= 4) fills.push({link: linkIndex, count: part.path.length - 1, color: part.fill});
    }
  }
  editor.select(null);
  specs[0].start = {x, y};
  const added = editor.addSegments(specs), uid = editor.selectedUid;
  for (const fill of fills) {
    const own = added.slice(fill.link, fill.link + fill.count + 1);
    editor.select(uid, editor.figure.segments.findIndex(segment => segment.segment_id === own[1].segment_id));
    editor.addPolygon(own.map(segment => segment.segment_id), {color: tint && fill.color !== C.white ? tint : fill.color, opacity: 1});
  }
  editor.select(uid, -1);
  return uid;
}
