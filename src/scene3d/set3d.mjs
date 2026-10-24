// The 3D Set: a three.js city filmed for a RigStick project, controlled from inside RigStick.
//
// The camera is an ordinary RigStick figure, "3D Camera": a root and four invisible dial segments. Move the
// figure to put the roof (the hero's footing) anywhere in the frame; turn the dials to orbit round the hero,
// tilt the camera up or down, change the lens and zoom. Its keys, easing and timing are RigStick's own, so
// the camera is animated like any figure. Updating the set renders the city from the rig at every frame
// (with sub-frame motion blur) into the Scene layer's per-frame background images.
//
// Pure module: figure definitions and rig maths only. Rendering is in shot.mjs, baking in ai/ai-tools.mjs.

const PI = Math.PI, DEG = PI / 180;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export const CAMERA_RIG_NAME = '3D Camera';
/** The height (m) the 3D Camera rig aims at: the hero's chest, so tilting looks up at him, not at his feet. */
export const RIG_AIM = 1.25;
/** Frame heights per metre at the aim point for zoom 1: a 1.8 m hero is about 60% of the frame height. */
export const RIG_PPM = 0.34;
/** Dial order matters: values are read by segment index. Rest angles give the defaults below. */
export const CAMERA_DIALS = [
  {name: 'Orbit: turn to circle round the hero', length: 150, rest: -PI / 2},
  {name: 'Tilt: turn to raise or lower the camera', length: 120, rest: 0},
  {name: 'Lens: turn to widen or narrow the view', length: 90, rest: 3 * PI / 4},
  {name: 'Zoom: turn to move the camera in or out', length: 105, rest: PI / 4},
];
/** Rig values for neutral dials: in front of the hero, slightly above his chest, a 42° lens, zoom 1. */
export const RIG_DEFAULTS = Object.freeze({orbit: 0, tilt: 0, lens: 42, zoom: 1});

/** Dial angles (absolute screen radians) → camera values. Each dial reads as a clock hand. */
export function rigValues(object) {
  const [orbit = CAMERA_DIALS[0].rest, tilt = CAMERA_DIALS[1].rest, lens = CAMERA_DIALS[2].rest, zoom = CAMERA_DIALS[3].rest] = object.angles ?? [];
  return {
    orbit: unwrap(orbit - CAMERA_DIALS[0].rest),
    tilt: clamp(-unwrap(tilt - CAMERA_DIALS[1].rest), -0.6, 1.45),
    lens: clamp(42 + unwrap(lens - CAMERA_DIALS[2].rest) / DEG * 0.5, 12, 100),
    zoom: clamp(2 ** (unwrap(CAMERA_DIALS[3].rest - zoom) / (PI / 2)), 0.25, 4),
    marker: {x: object.root_x, y: object.root_y},
  };
}
/** Camera values → dial angles, the inverse of rigValues (for presets and the AI). */
export function rigAngles({orbit = 0, tilt = 0, lens = 42, zoom = 1} = {}) {
  return [CAMERA_DIALS[0].rest + orbit, CAMERA_DIALS[1].rest - tilt, CAMERA_DIALS[2].rest + (lens - 42) * 2 * DEG,
    CAMERA_DIALS[3].rest - Math.log2(zoom) * PI / 2];
}
const unwrap = radians => Math.atan2(Math.sin(radians), Math.cos(radians));

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
/** Camera positions (metres, hero at the origin) over normalised time: the 3D Shot studio's moves. */
const CAMERA_PATHS = {
  'hero-orbit': u => { const a = -1.05 + 2.0 * ease(u), r = 5.3 - 0.6 * ease(u); return [Math.sin(a) * r, 0.55 + 0.2 * Math.sin(u * PI), Math.cos(a) * r]; },
  'push-in': u => [0.6, 0.7, 7.5 - 3 * ease(u)],
  'crane-up': u => { const k = ease(u); return [1.2, 0.3 + 2.6 * k, 5.4 - 0.8 * k]; },
  'truck': u => [-3.2 + 6.4 * ease(u), 0.6, 5.2],
};
export const SET_CAMERAS = Object.keys(CAMERA_PATHS);

/**
 * A camera move as 3D Camera values at normalised time u, for a frame width × height: the same camera
 * position the studio's renderer uses, aimed at the hero's chest, with `marker` where the roof under his
 * feet lands. Keyed every frame, the rig reproduces the studio shot exactly.
 */
export function setCameraAt(move, u, {width = 1280, height = 720, lens = 42} = {}) {
  const [x, y, z] = (CAMERA_PATHS[move] ?? CAMERA_PATHS['hero-orbit'])(Math.min(1, Math.max(0, u)));
  const horizontal = Math.hypot(x, z), dy = y - RIG_AIM, distance = Math.hypot(horizontal, dy), focal = height / (2 * Math.tan(lens * DEG / 2));
  // Where the origin projects: its offset from the aim point, seen down the camera's forward axis.
  const forward = [-x / distance, -dy / distance, -z / distance], toOrigin = [-x, -y, -z];
  const depth = toOrigin[0] * forward[0] + toOrigin[1] * forward[1] + toOrigin[2] * forward[2];
  const upLength = Math.hypot(forward[0] * forward[1], 1 - forward[1] ** 2, forward[2] * forward[1]);
  const up = [-forward[0] * forward[1] / upLength, (1 - forward[1] ** 2) / upLength, -forward[2] * forward[1] / upLength];
  const lift = toOrigin[0] * up[0] + toOrigin[1] * up[1] + toOrigin[2] * up[2];
  return {orbit: Math.atan2(x, z), tilt: Math.atan2(dy, horizontal), lens, zoom: focal / (distance * height * RIG_PPM),
    marker: {x: width / 2, y: height / 2 - lift / depth * focal}};
}

const segment = (id, parent, {name, length, angle, thickness = 0, kind = 'line', color = [255, 122, 26], visible = thickness > 0}) => ({
  segment_id: id, parent_id: parent, length, angle_rad: angle, thickness, bend_rad: 0, primitive_code: kind === 'circleFill' ? 3 : 0, aux_code: 0,
  flags: kind === 'circleFill' ? 3 : 0, segment_type: kind === 'circleFill' ? 'circle' : 'line', segment_kind: kind, color_rgb: color, transparency: 0,
  visible, z_order: id, name,
});
const figure = (name, segments) => ({figure_type_id: 1, name, segment_count: segments.length, segments, polyfills: [], image_assets: [], text_assets: []});

/** The 3D Camera rig: invisible dials (nothing of it is ever drawn or exported), handles to turn. */
export function cameraRigFigure(values = RIG_DEFAULTS) {
  const angles = rigAngles(values);
  return figure(CAMERA_RIG_NAME, CAMERA_DIALS.map((dial, i) => segment(i + 1, 0, {name: dial.name, length: dial.length, angle: angles[i]})));
}
export const isCameraRig = type => type?.name === CAMERA_RIG_NAME && type.segments?.length === CAMERA_DIALS.length;

/** A scarf: a chain of links that tapers, joined at the hero's neck and keyed from the wind simulation. */
export function scarfFigure({links = 8, linkLength = 22, width = 20, color = [229, 56, 59]} = {}) {
  return figure('Scarf', Array.from({length: links}, (_, i) => segment(i + 1, i, {name: `Scarf ${i + 1}`, length: linkLength, angle: PI,
    thickness: Math.max(5, width * (1 - i / links)), color})));
}

/** The 3D Set's own layers, bottom to top above the Scene (the sky): rendered as flipbook sprites. */
export const SET_LAYERS = [{pass: 'city', name: '3D City'}, {pass: 'roof', name: '3D Rooftop'}];

/**
 * A flipbook: one full-frame sprite whose image table holds a frame per tick; the segment's keyed `image`
 * property picks the frame. Its root sits at the frame centre and the image spans the whole frame.
 */
export function flipbookFigure(name, frames, width, height) {
  return {...figure(name, [{segment_id: 1, parent_id: 0, length: width / 2, angle_rad: 0, thickness: 0, bend_rad: 0, primitive_code: 2, aux_code: 0, flags: 2,
    segment_type: 'image', segment_kind: 'image', color_rgb: [0, 0, 0], transparency: 0, extra_u16: 0, extra_u8_a: 0, extra_u8_b: 0, extra: [0, 0, 0], visible: true, z_order: 1, name: 'Frames'}]),
    image_assets: frames.map((frame, i) => ({kind: 'image', asset_index: i, table_index: i, mime_type: frame.mime_type, width, height, data_url: frame.data_url,
      anchor_start: {x: width / 2, y: height / 2}, anchor_end: {x: width, y: height / 2}, anchor_length: width / 2, anchor_angle_rad: 0}))};
}
export const isFlipbook = (type, name) => type?.name === name && type.segments?.length === 1 && type.segments[0].segment_kind === 'image';

/** Metres per hero unit: hero.mjs RIG units, so a figure built from RIG stands about 1.87 m. */
export const HERO_UNIT_M = 0.0034;
const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
const darker = rgb => rgb.map(channel => Math.round(channel * 0.77));

/**
 * The 3D shot's hero as a RigStick figure, in hero.mjs RIG units and proportions: a long torso with the
 * shoulders below its top, a small head, thick limbs, and the far arm and leg a shade darker and behind the
 * body. Joint names follow Moves (Left = the sword arm and the screen-right leg), so Moves work on him.
 */
export function heroFigure(rig, color = '#ff7a1a') {
  const near = hex(color), far = darker(near), arm = (rig.widths.upper + rig.widths.fore) / 2, leg = (rig.widths.thigh + rig.widths.shin) / 2;
  const shoulder = rig.torso * 0.86, up = -PI / 2, down = PI / 2;
  const parts = [
    // Far limbs first: lower z, drawn behind the body.
    [7, 1, 'Right upper arm', rig.upper, 2.1, arm, far], [8, 7, 'Right forearm', rig.fore, 1.75, arm, far],
    [11, 0, 'Right thigh', rig.thigh, 2.0, leg, far], [12, 11, 'Right lower leg', rig.shin, 1.8, leg, far],
    [9, 0, 'Left thigh', rig.thigh, 1.15, leg, near], [10, 9, 'Left lower leg', rig.shin, 1.35, leg, near],
    [1, 0, 'Torso', shoulder, up, rig.widths.torso, near], [2, 1, 'Chest', rig.torso - shoulder, up, rig.widths.torso, near],
    [3, 2, 'Collar', rig.neck, up, 0, near], [4, 3, 'Head', rig.head * 2, up, 0, near, 'circleFill'],
    [5, 1, 'Left upper arm', rig.upper, 1.05, arm, near], [6, 5, 'Left forearm', rig.fore, 1.35, arm, near],
  ];
  const segments = parts.map(([id, parent, name, length, angle, thickness, rgb, kind = 'line'], z) =>
    ({...segment(id, parent, {name, length, angle, thickness, kind, color: rgb, visible: thickness > 0 || kind === 'circleFill'}), z_order: z + 1}));
  return figure('Hero', segments.sort((a, b) => a.segment_id - b.segment_id));
}

/**
 * The hero's sword (RIG units): a blade along +y from the hand (point it along the forearm by rotating the
 * figure), a gold guard a little way up it. Held at its root, joined to the hand.
 */
export function swordFigure(rig) {
  const blade = [236, 244, 255], gold = [245, 179, 1];
  return figure('Sword', [
    segment(1, 0, {name: 'Blade', length: rig.sword, angle: PI / 2, thickness: 11, color: blade}),
    segment(2, 0, {name: 'Guard mount', length: 14, angle: PI / 2}),
    segment(3, 2, {name: 'Guard', length: 26, angle: PI, thickness: 10, color: gold}),
    segment(4, 2, {name: 'Guard (other side)', length: 26, angle: 0, thickness: 10, color: gold}),
  ]);
}
