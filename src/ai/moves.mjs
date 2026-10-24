// Ready-made motions ("Moves") for beginners and AI clients: each move is a short list of poses over
// normalised time 0..1, in absolute screen degrees (0 right, 90 down, -90 up) for a figure facing right.
// Poses name body roles, not joints; `resolveRoles` maps roles onto a figure's joints by their names, so
// the stock figure and most hand-built ones work. Facing left mirrors every angle and offset.

export const MOVES = ['walk', 'run', 'jump', 'wave', 'cheer', 'sit', 'fall', 'idle', 'nod', 'punch', 'kick', 'shrug', 'bow', 'raise', 'hover',
  'sneak', 'dash', 'climb', 'fly', 'swim', 'roll', 'backflip', 'slash', 'uppercut', 'combo', 'block', 'dodge', 'jumpkick', 'hit', 'shoot', 'throw', 'cast', 'charge',
  'point', 'pointup', 'clap', 'salute', 'think', 'facepalm', 'stretch', 'help', 'lookaround', 'kneel', 'pray', 'push', 'pull', 'lift', 'laugh', 'cry', 'scared', 'angry',
  'sad', 'tired', 'victory', 'sleep', 'getup', 'dance', 'groove'];

const ROLE_PATTERNS = [
  ['head', /head|neck|skull/i],
  ['torso', /torso|body|spine|chest|trunk/i],
  ['armAUpper', /^(?=.*\bleft\b)(?=.*(upper arm|shoulder|\barm\b))(?!.*(fore|lower|hand))/i],
  ['armALower', /^(?=.*\bleft\b)(?=.*(forearm|lower arm|hand))/i],
  ['armBUpper', /^(?=.*\bright\b)(?=.*(upper arm|shoulder|\barm\b))(?!.*(fore|lower|hand))/i],
  ['armBLower', /^(?=.*\bright\b)(?=.*(forearm|lower arm|hand))/i],
  ['legAUpper', /^(?=.*\bleft\b)(?=.*(thigh|upper leg|\bleg\b))(?!.*(lower|shin|calf|foot))/i],
  ['legALower', /^(?=.*\bleft\b)(?=.*(shin|lower leg|calf|foot))/i],
  ['legBUpper', /^(?=.*\bright\b)(?=.*(thigh|upper leg|\bleg\b))(?!.*(lower|shin|calf|foot))/i],
  ['legBLower', /^(?=.*\bright\b)(?=.*(shin|lower leg|calf|foot))/i],
];

/** Role → segment index for a figure definition; roles the figure lacks are left out. */
export function resolveRoles(segments) {
  const roles = {};
  for (const [role, pattern] of ROLE_PATTERNS) {
    const index = segments.findIndex((segment, i) => pattern.test(segment.name ?? '') && !Object.values(roles).includes(i));
    if (index >= 0) roles[role] = index;
  }
  return roles;
}

const STAND = {torso: -90, head: -90, armAUpper: 98, armALower: 92, armBUpper: 82, armBLower: 88, legAUpper: 96, legALower: 92, legBUpper: 84, legBLower: 88};
const pose = (patch = {}) => ({...STAND, ...patch});
const cycle = (count, steps, make) => Array.from({length: count * steps + 1}, (_, i) => {
  const t = i / (count * steps), phase = (i % steps) / steps;
  return {t, ...make(Math.sin(phase * 2 * Math.PI), Math.cos(phase * 2 * Math.PI), t)};
});

function stride({amp, arm, lean, bend, bob, distance, steps, seconds}) {
  const count = Math.max(1, Math.round(seconds * steps / 2));   // two steps per cycle
  return cycle(count, 8, (s, c, t) => ({
    joints: pose({torso: -90 + lean, head: -90 + lean * 0.6,
      legAUpper: 90 + amp * s, legALower: 90 + amp * s + Math.max(0, -c) * bend,
      legBUpper: 90 - amp * s, legBLower: 90 - amp * s + Math.max(0, c) * bend,
      armAUpper: 90 - arm * s, armALower: 90 - arm * s - bend * 0.6,
      armBUpper: 90 + arm * s, armBLower: 90 + arm * s - bend * 0.6}),
    dx: distance * t, dy: -Math.abs(s) * bob,
  }));
}

const BUILDERS = {
  walk: ({intensity: k, distance = 220, seconds}) => stride({amp: 26 * k, arm: 22 * k, lean: 4, bend: 32 * k, bob: 4 * k, distance, steps: 2, seconds}),
  run: ({intensity: k, distance = 480, seconds}) => stride({amp: 44 * k, arm: 50 * k, lean: 16, bend: 70 * k, bob: 10 * k, distance, steps: 3, seconds}),
  jump: ({intensity: k, distance = 0}) => [
    {t: 0, joints: pose(), dx: 0, dy: 0},
    {t: 0.22, joints: pose({torso: -70, head: -75, legAUpper: 40, legALower: 125, legBUpper: 45, legBLower: 130, armAUpper: 150, armALower: 140, armBUpper: 140, armBLower: 130}), dx: distance * 0.05, dy: 24 * k},
    {t: 0.45, joints: pose({armAUpper: -110, armALower: -100, armBUpper: -70, armBLower: -80, legAUpper: 100, legALower: 95, legBUpper: 80, legBLower: 85}), dx: distance * 0.5, dy: -150 * k},
    {t: 0.7, joints: pose({legAUpper: 60, legALower: 110, legBUpper: 65, legBLower: 115, armAUpper: 30, armBUpper: 150}), dx: distance * 0.9, dy: -20 * k},
    {t: 0.82, joints: pose({torso: -72, legAUpper: 45, legALower: 125, legBUpper: 50, legBLower: 128}), dx: distance, dy: 18 * k},
    {t: 1, joints: pose(), dx: distance, dy: 0},
  ],
  wave: ({intensity: k, seconds}) => cycle(Math.max(2, Math.round(seconds * 2)), 2, (s, c) => ({joints: pose({armBUpper: -55, armBLower: -95 + 32 * k * (c > 0 ? 1 : -1)})})),
  cheer: ({intensity: k, seconds}) => cycle(Math.max(2, Math.round(seconds * 1.5)), 4, s => ({
    joints: pose({armAUpper: -115, armALower: -105 - 10 * s, armBUpper: -65, armBLower: -75 + 10 * s, legAUpper: 98 + 6 * s, legBUpper: 82 - 6 * s}), dy: -Math.max(0, s) * 26 * k})),
  sit: ({intensity: k}) => [
    {t: 0, joints: pose(), dy: 0},
    {t: 0.45, joints: pose({torso: -80, legAUpper: 30, legALower: 110, legBUpper: 35, legBLower: 112}), dy: 20 * k},
    {t: 1, joints: pose({torso: -88, legAUpper: 2, legALower: 90, legBUpper: 6, legBLower: 92, armAUpper: 60, armALower: 15, armBUpper: 70, armBLower: 20}), dy: 42 * k},
  ],
  fall: ({intensity: k}) => [
    {t: 0, joints: pose(), rot: 0, dy: 0},
    {t: 0.25, joints: pose({armAUpper: -40, armBUpper: -140, armALower: -20, armBLower: -160}), rot: -12 * k, dy: -6},
    {t: 0.7, joints: pose({armAUpper: -150, armBUpper: -30, legAUpper: 60, legBUpper: 120}), rot: 70 * k, dy: 30},
    {t: 0.85, joints: pose({armAUpper: -170, armBUpper: -10}), rot: 92, dy: 58},
    {t: 1, joints: pose({armAUpper: 180, armALower: 175, armBUpper: 0, armBLower: 5}), rot: 90, dy: 60},
  ],
  idle: ({intensity: k, seconds}) => cycle(Math.max(1, Math.round(seconds / 2)), 4, s => ({joints: pose({torso: -90 + 2 * s * k, head: -90 + 3 * s * k, armAUpper: 98 + 3 * s * k, armBUpper: 82 - 3 * s * k}), dy: Math.max(0, s) * 1.5 * k})),
  nod: ({intensity: k, seconds}) => cycle(Math.max(2, Math.round(seconds * 1.5)), 2, (s, c) => ({joints: pose({head: c > 0 ? -90 : -90 + 24 * k})})),
  punch: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.3, joints: pose({torso: -96, armBUpper: 150, armBLower: 20, armAUpper: 60, armALower: -10}), dx: -6},
    {t: 0.45, joints: pose({torso: -78, armBUpper: 2, armBLower: -2, armAUpper: 120, armALower: 60, legAUpper: 110, legBUpper: 70}), dx: 18 * k},
    {t: 0.75, joints: pose({torso: -82, armBUpper: 10, armBLower: 0}), dx: 16 * k},
    {t: 1, joints: pose(), dx: 0},
  ],
  kick: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.3, joints: pose({torso: -100, legBUpper: 30, legBLower: 120, armAUpper: 150, armBUpper: 30})},
    {t: 0.5, joints: pose({torso: -112, legBUpper: -8 * k, legBLower: -4 * k, armAUpper: 170, armBUpper: 10})},
    {t: 0.75, joints: pose({torso: -100, legBUpper: 40, legBLower: 110})},
    {t: 1, joints: pose()},
  ],
  shrug: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.35, joints: pose({head: -82, armAUpper: 120 - 10 * k, armALower: 20, armBUpper: 60 + 10 * k, armBLower: 160}), dy: -4 * k},
    {t: 0.7, joints: pose({head: -82, armAUpper: 120 - 10 * k, armALower: 20, armBUpper: 60 + 10 * k, armBLower: 160}), dy: -4 * k},
    {t: 1, joints: pose()},
  ],
  // Raise the right (sword) arm slowly overhead, chest open, and hold it there: a hero pose.
  raise: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.35, joints: pose({torso: -92, head: -94, armBUpper: 30 - 40 * k, armBLower: -20 - 30 * k, armAUpper: 120, armALower: 100})},
    {t: 0.7, joints: pose({torso: -96, head: -100, armBUpper: -88, armBLower: -92, armAUpper: 135, armALower: 120, legAUpper: 100, legBUpper: 78})},
    {t: 1, joints: pose({torso: -95, head: -99, armBUpper: -90, armBLower: -91, armAUpper: 132, armALower: 118, legAUpper: 100, legBUpper: 78})},
  ],
  // Float: a slow bob with loose, slightly trailing legs.
  hover: ({intensity: k, seconds}) => cycle(Math.max(1, Math.round(seconds / 1.6)), 4, (s, c) => ({
    joints: pose({legAUpper: 100 + 6 * s, legALower: 108 + 8 * s, legBUpper: 86 - 4 * s, legBLower: 100 - 6 * s, armAUpper: 110 + 5 * c, armALower: 100}),
    dy: -14 * k + 8 * k * s})),
  bow: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.45, joints: pose({torso: -90 + 70 * k, head: -90 + 80 * k, armAUpper: 95 + 40 * k, armBUpper: 85 + 40 * k})},
    {t: 0.65, joints: pose({torso: -90 + 70 * k, head: -90 + 80 * k, armAUpper: 95 + 40 * k, armBUpper: 85 + 40 * k})},
    {t: 1, joints: pose()},
  ],

  // Getting around.
  sneak: ({intensity: k, distance = 140, seconds}) => cycle(Math.max(1, Math.round(seconds * 1.2)), 8, (s, c, t) => ({
    joints: pose({torso: -72, head: -80, legAUpper: 70 + 22 * s * k, legALower: 120 + 10 * Math.max(0, -c), legBUpper: 70 - 22 * s * k, legBLower: 120 + 10 * Math.max(0, c),
      armAUpper: 30, armALower: -60, armBUpper: 40, armBLower: -50}), dx: distance * t, dy: 22})),
  dash: ({intensity: k, distance = 360}) => [
    {t: 0, joints: pose()},
    {t: 0.2, joints: pose({torso: -60, head: -70, legAUpper: 40, legALower: 110, legBUpper: 140, legBLower: 150, armAUpper: 160, armALower: 170, armBUpper: 150, armBLower: 160}), dx: distance * 0.1, dy: 14},
    {t: 0.7, joints: pose({torso: -55, head: -66, legAUpper: 50, legALower: 100, legBUpper: 150, legBLower: 140, armAUpper: 165, armALower: 175, armBUpper: 155, armBLower: 165}), dx: distance * 0.9, dy: 16},
    {t: 1, joints: pose({torso: -80, legAUpper: 70, legALower: 110, legBUpper: 110, legBLower: 100}), dx: distance, dy: 10 * k},
  ],
  climb: ({intensity: k, distance = 160, seconds}) => cycle(Math.max(1, Math.round(seconds)), 4, (s, c, t) => ({
    joints: pose({torso: -90, armAUpper: -100 + 30 * s, armALower: -95 + 30 * s, armBUpper: -80 - 30 * s, armBLower: -85 - 30 * s, legAUpper: 70 + 30 * s, legALower: 110, legBUpper: 70 - 30 * s, legBLower: 110}),
    dy: -distance * t * k})),
  fly: ({intensity: k, distance = 420}) => [
    {t: 0, joints: pose(), rot: 0},
    {t: 0.15, joints: pose({legAUpper: 60, legALower: 130, legBUpper: 70, legBLower: 140, armAUpper: 130, armBUpper: 120}), dy: 16, rot: 0},
    {t: 0.35, joints: pose({armAUpper: -90, armALower: -90, armBUpper: -80, armBLower: -80}), dy: -90 * k, dx: distance * 0.2, rot: 40},
    {t: 0.6, joints: pose({armAUpper: -88, armALower: -88, armBUpper: -84, armBLower: -84, legAUpper: 98, legBUpper: 92}), dy: -140 * k, dx: distance * 0.6, rot: 75},
    {t: 1, joints: pose({armAUpper: -88, armALower: -88, armBUpper: -84, armBLower: -84, legAUpper: 98, legBUpper: 92}), dy: -150 * k, dx: distance, rot: 80},
  ],
  swim: ({intensity: k, distance = 220, seconds}) => cycle(Math.max(1, Math.round(seconds * 1.2)), 4, (s, c, t) => ({
    joints: pose({armAUpper: -90 + 180 * (t * 4 % 1), armALower: -90 + 180 * (t * 4 % 1), armBUpper: 90 + 180 * (t * 4 % 1), armBLower: 90 + 180 * (t * 4 % 1), legAUpper: 92 + 12 * s, legBUpper: 88 - 12 * s}),
    dx: distance * t, dy: 4 * s, rot: 80 * k})),
  roll: ({intensity: k, distance = 200}) => [
    {t: 0, joints: pose(), rot: 0},
    {t: 0.15, joints: pose({torso: -40, head: -20, legAUpper: 20, legALower: 120, legBUpper: 30, legBLower: 130, armAUpper: 40, armBUpper: 30}), dy: 40, dx: distance * 0.1, rot: 0},
    {t: 0.35, joints: pose({torso: -40, head: -20, legAUpper: 20, legALower: 140, legBUpper: 30, legBLower: 150, armAUpper: 40, armBUpper: 30}), dy: 60, dx: distance * 0.35, rot: 90 * k},
    {t: 0.55, joints: pose({torso: -40, head: -20, legAUpper: 20, legALower: 140, legBUpper: 30, legBLower: 150, armAUpper: 40, armBUpper: 30}), dy: 64, dx: distance * 0.6, rot: 180 * k},
    {t: 0.75, joints: pose({torso: -40, head: -20, legAUpper: 20, legALower: 140, legBUpper: 30, legBLower: 150, armAUpper: 40, armBUpper: 30}), dy: 60, dx: distance * 0.85, rot: 270 * k},
    {t: 1, joints: pose(), dx: distance, rot: 360 * k},
  ],
  backflip: ({intensity: k}) => [
    {t: 0, joints: pose(), rot: 0},
    {t: 0.15, joints: pose({torso: -80, legAUpper: 40, legALower: 120, legBUpper: 45, legBLower: 125, armAUpper: 150, armBUpper: 140}), dy: 26, rot: 0},
    {t: 0.3, joints: pose({armAUpper: -100, armALower: -100, armBUpper: -80, armBLower: -80}), dy: -110 * k, dx: -20, rot: -90},
    {t: 0.45, joints: pose({legAUpper: 10, legALower: 120, legBUpper: 15, legBLower: 125, armAUpper: 40, armBUpper: 30}), dy: -170 * k, dx: -40, rot: -180},
    {t: 0.6, joints: pose({legAUpper: 20, legALower: 120, legBUpper: 25, legBLower: 125}), dy: -110 * k, dx: -60, rot: -270},
    {t: 0.8, joints: pose({torso: -80, legAUpper: 40, legALower: 120, legBUpper: 45, legBLower: 125, armAUpper: -40, armBUpper: -20}), dy: 20, dx: -70, rot: -360},
    {t: 1, joints: pose({armAUpper: -60, armALower: -70, armBUpper: -120, armBLower: -110}), dx: -70, rot: -360},
  ],
  // Combat.
  slash: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.3, joints: pose({torso: -100, head: -96, armBUpper: -140, armBLower: -165, armAUpper: 120, armALower: 100, legAUpper: 100, legBUpper: 70}), dx: -6},
    {t: 0.48, joints: pose({torso: -78, head: -84, armBUpper: -10 + 20 * k, armBLower: 10 + 30 * k, armAUpper: 150, armALower: 170, legAUpper: 120, legBUpper: 55}), dx: 22 * k},
    {t: 0.7, joints: pose({torso: -74, head: -82, armBUpper: 70, armBLower: 100, armAUpper: 150, armALower: 170, legAUpper: 120, legBUpper: 55}), dx: 26 * k},
    {t: 1, joints: pose(), dx: 20 * k},
  ],
  uppercut: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.3, joints: pose({torso: -70, legAUpper: 60, legALower: 120, legBUpper: 110, legBLower: 130, armBUpper: 100, armBLower: -40}), dy: 26},
    {t: 0.5, joints: pose({torso: -98, head: -100, armBUpper: -80, armBLower: -95, armAUpper: 130, armALower: 60}), dy: -18 * k, dx: 8},
    {t: 1, joints: pose(), dx: 8},
  ],
  combo: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.15, joints: pose({torso: -80, armBUpper: 0, armBLower: 0, armAUpper: 120, armALower: 50}), dx: 12 * k},
    {t: 0.3, joints: pose({torso: -86, armBUpper: 120, armBLower: 40, armAUpper: 4, armALower: 0}), dx: 20 * k},
    {t: 0.45, joints: pose({torso: -100, armBUpper: 160, armBLower: 140, armAUpper: 140, armALower: 100, legBUpper: 40, legBLower: 120}), dx: 22 * k},
    {t: 0.6, joints: pose({torso: -112, armBUpper: 170, armBLower: 160, armAUpper: 160, armALower: 130, legBUpper: -6, legBLower: -2}), dx: 26 * k},
    {t: 1, joints: pose(), dx: 26 * k},
  ],
  block: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.3, joints: pose({torso: -96, head: -100, armBUpper: -10, armBLower: -100, armAUpper: 20, armALower: -110, legAUpper: 110, legBUpper: 70}), dx: -10 * k},
    {t: 0.8, joints: pose({torso: -98, head: -104, armBUpper: -10, armBLower: -100, armAUpper: 20, armALower: -110, legAUpper: 110, legBUpper: 70}), dx: -14 * k},
    {t: 1, joints: pose(), dx: -14 * k},
  ],
  dodge: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.3, joints: pose({torso: -130, head: -140, armAUpper: -170, armBUpper: 160, legAUpper: 70, legALower: 110, legBUpper: 110}), dx: -30 * k, dy: 14},
    {t: 0.6, joints: pose({torso: -126, head: -136, armAUpper: -170, armBUpper: 160, legAUpper: 70, legALower: 110, legBUpper: 110}), dx: -34 * k, dy: 14},
    {t: 1, joints: pose(), dx: -34 * k},
  ],
  jumpkick: ({intensity: k, distance = 160}) => [
    {t: 0, joints: pose()},
    {t: 0.2, joints: pose({torso: -80, legAUpper: 40, legALower: 120, legBUpper: 45, legBLower: 125, armAUpper: 150, armBUpper: 140}), dy: 22},
    {t: 0.45, joints: pose({torso: -120, legBUpper: 0, legBLower: 0, legAUpper: 120, legALower: 160, armAUpper: -150, armBUpper: 160}), dy: -90 * k, dx: distance * 0.6, rot: -10},
    {t: 0.7, joints: pose({torso: -118, legBUpper: 2, legBLower: 2, legAUpper: 120, legALower: 160}), dy: -50 * k, dx: distance, rot: -10},
    {t: 1, joints: pose({legAUpper: 60, legALower: 120, legBUpper: 120, legBLower: 110}), dx: distance, dy: 10},
  ],
  hit: ({intensity: k}) => [
    {t: 0, joints: pose(), rot: 0},
    {t: 0.15, joints: pose({torso: -120, head: -150, armAUpper: -150, armBUpper: -40, legBUpper: 50}), dx: -40 * k, dy: -10, rot: -20},
    {t: 0.45, joints: pose({torso: -130, head: -160, armAUpper: -170, armBUpper: -20, legAUpper: 40, legBUpper: 60}), dx: -110 * k, dy: -30 * k, rot: -50},
    {t: 0.75, joints: pose({armAUpper: 180, armBUpper: -10, legAUpper: 30, legBUpper: 50}), dx: -150 * k, dy: 40, rot: -85},
    {t: 1, joints: pose({armAUpper: 180, armALower: 180, armBUpper: 0, armBLower: 0}), dx: -160 * k, dy: 58, rot: -90},
  ],
  shoot: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.3, joints: pose({armBUpper: 0, armBLower: 0, armAUpper: 20, armALower: 0, head: -86})},
    {t: 0.45, joints: pose({armBUpper: -14 * k, armBLower: -24 * k, armAUpper: 6, armALower: -14, head: -88, torso: -96}), dx: -6 * k},
    {t: 0.65, joints: pose({armBUpper: 0, armBLower: 0, armAUpper: 20, armALower: 0, head: -86})},
    {t: 1, joints: pose({armBUpper: 0, armBLower: 0, armAUpper: 20, armALower: 0, head: -86})},
  ],
  throw: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.35, joints: pose({torso: -104, armBUpper: -160, armBLower: -150, armAUpper: 30, armALower: 0, legAUpper: 110, legBUpper: 70}), dx: -10},
    {t: 0.55, joints: pose({torso: -76, armBUpper: -20, armBLower: -10, armAUpper: 140, armALower: 120, legAUpper: 120, legBUpper: 60}), dx: 18 * k},
    {t: 0.75, joints: pose({torso: -74, armBUpper: 50, armBLower: 70, armAUpper: 150, armALower: 130, legAUpper: 120, legBUpper: 60}), dx: 20 * k},
    {t: 1, joints: pose(), dx: 16 * k},
  ],
  cast: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.4, joints: pose({torso: -96, armBUpper: 150, armBLower: 60, armAUpper: 130, armALower: 60, legAUpper: 110, legBUpper: 70}), dy: 8},
    {t: 0.6, joints: pose({torso: -80, armBUpper: -6, armBLower: -10, armAUpper: 6, armALower: -4, legAUpper: 120, legBUpper: 60}), dx: 14 * k},
    {t: 1, joints: pose({torso: -80, armBUpper: -6, armBLower: -10, armAUpper: 6, armALower: -4, legAUpper: 120, legBUpper: 60}), dx: 14 * k},
  ],
  charge: ({intensity: k, seconds}) => cycle(Math.max(4, Math.round(seconds * 8)), 2, s => ({
    joints: pose({torso: -82, head: -70, armAUpper: 110 + 3 * s, armALower: 40, armBUpper: 70 - 3 * s, armBLower: 140, legAUpper: 60, legALower: 110, legBUpper: 120, legBLower: 100}),
    dy: 24 * k + 2 * s, dx: 2 * s * k})),

  // Gestures.
  point: ({intensity: k}) => [{t: 0, joints: pose()}, {t: 0.4, joints: pose({armBUpper: -10 * k, armBLower: -12 * k, head: -88})}, {t: 1, joints: pose({armBUpper: -10 * k, armBLower: -12 * k, head: -88})}],
  pointup: () => [{t: 0, joints: pose()}, {t: 0.4, joints: pose({armBUpper: -80, armBLower: -95, head: -110})}, {t: 1, joints: pose({armBUpper: -80, armBLower: -95, head: -110})}],
  clap: ({seconds}) => cycle(Math.max(2, Math.round(seconds * 2.5)), 2, (s, c) => ({joints: pose({armAUpper: 40, armALower: c > 0 ? -40 : -10, armBUpper: 60, armBLower: c > 0 ? -140 : -170})})),
  salute: () => [{t: 0, joints: pose()}, {t: 0.4, joints: pose({armBUpper: -40, armBLower: -150, head: -92})}, {t: 1, joints: pose({armBUpper: -40, armBLower: -150, head: -92})}],
  think: ({seconds}) => [{t: 0, joints: pose()}, {t: 0.3, joints: pose({head: -80, armBUpper: 70, armBLower: -110, armAUpper: 70, armALower: 170})},
    ...Array.from({length: Math.max(1, Math.round(seconds))}, (_, i) => ({t: 0.3 + 0.7 * (i + 1) / Math.max(1, Math.round(seconds)), joints: pose({head: i % 2 ? -80 : -74, armBUpper: 70, armBLower: -110, armAUpper: 70, armALower: 170})}))],
  facepalm: () => [{t: 0, joints: pose()}, {t: 0.35, joints: pose({head: -70, armBUpper: 30, armBLower: -120, torso: -84})}, {t: 1, joints: pose({head: -66, armBUpper: 34, armBLower: -116, torso: -82})}],
  stretch: () => [{t: 0, joints: pose()}, {t: 0.4, joints: pose({torso: -100, head: -104, armAUpper: -100, armALower: -95, armBUpper: -80, armBLower: -85}), dy: -8},
    {t: 0.7, joints: pose({torso: -110, head: -114, armAUpper: -120, armALower: -110, armBUpper: -100, armBLower: -100}), dy: -8}, {t: 1, joints: pose()}],
  help: ({seconds}) => cycle(Math.max(2, Math.round(seconds * 2)), 2, (s, c) => ({joints: pose({armAUpper: c > 0 ? -60 : -120, armALower: c > 0 ? -70 : -130, armBUpper: c > 0 ? -120 : -60, armBLower: c > 0 ? -130 : -70}), dy: c > 0 ? -10 : 0})),
  lookaround: ({seconds}) => cycle(Math.max(1, Math.round(seconds / 2)), 4, (s, c) => ({joints: pose({head: -90 + 16 * s, torso: -90 + 4 * s})})),
  kneel: () => [{t: 0, joints: pose()}, {t: 0.5, joints: pose({torso: -86, legAUpper: 30, legALower: 90, legBUpper: 100, legBLower: 170}), dy: 50},
    {t: 1, joints: pose({torso: -88, head: -80, legAUpper: 20, legALower: 92, legBUpper: 96, legBLower: 175, armAUpper: 60, armALower: 40, armBUpper: 50, armBLower: 20}), dy: 62}],
  pray: () => [{t: 0, joints: pose()}, {t: 0.5, joints: pose({head: -74, armAUpper: 50, armALower: -70, armBUpper: 30, armBLower: -110})}, {t: 1, joints: pose({head: -72, armAUpper: 50, armALower: -70, armBUpper: 30, armBLower: -110})}],
  push: ({distance = 60, seconds}) => cycle(Math.max(1, Math.round(seconds * 1.2)), 4, (s, c, t) => ({
    joints: pose({torso: -60, head: -64, armAUpper: -10, armALower: -10, armBUpper: 0, armBLower: 0, legAUpper: 60 + 15 * s, legALower: 80, legBUpper: 140 - 15 * s, legBLower: 120}), dx: distance * t, dy: 10})),
  pull: ({distance = 60, seconds}) => cycle(Math.max(1, Math.round(seconds * 1.2)), 4, (s, c, t) => ({
    joints: pose({torso: -120, head: -116, armAUpper: 10, armALower: 0, armBUpper: 0, armBLower: -6, legAUpper: 60 + 10 * s, legALower: 70, legBUpper: 110 - 10 * s, legBLower: 120}), dx: -distance * t, dy: 10})),
  lift: () => [{t: 0, joints: pose()}, {t: 0.3, joints: pose({torso: -70, legAUpper: 50, legALower: 120, legBUpper: 130, legBLower: 110, armAUpper: 100, armALower: 100, armBUpper: 80, armBLower: 80}), dy: 40},
    {t: 0.6, joints: pose({armAUpper: -100, armALower: -100, armBUpper: -80, armBLower: -80, legAUpper: 100, legBUpper: 80}), dy: 0}, {t: 1, joints: pose({armAUpper: -100, armALower: -100, armBUpper: -80, armBLower: -80, legAUpper: 100, legBUpper: 80})}],

  // Emotions.
  laugh: ({seconds}) => cycle(Math.max(2, Math.round(seconds * 3)), 2, (s, c) => ({joints: pose({torso: -100, head: c > 0 ? -120 : -112, armAUpper: 70, armALower: 170, armBUpper: 110, armBLower: 10}), dy: c > 0 ? 0 : 4})),
  cry: ({seconds}) => cycle(Math.max(2, Math.round(seconds * 3)), 2, (s, c) => ({joints: pose({torso: -82, head: c > 0 ? -66 : -60, armAUpper: 40, armALower: -150, armBUpper: 60, armBLower: -120}), dy: c > 0 ? 2 : 6})),
  scared: ({seconds}) => cycle(Math.max(4, Math.round(seconds * 8)), 2, (s, c) => ({joints: pose({torso: -102, head: -112, armAUpper: -20, armALower: -130, armBUpper: -30, armBLower: -120, legAUpper: 104, legBUpper: 76}), dx: c > 0 ? -2 : 2, dy: 8})),
  angry: ({seconds}) => cycle(Math.max(2, Math.round(seconds * 2)), 2, (s, c) => ({joints: pose({torso: -84, head: -76, armAUpper: 110, armALower: 60, armBUpper: 70, armBLower: 120,
    legAUpper: c > 0 ? 70 : 96, legALower: c > 0 ? 120 : 92}), dy: c > 0 ? -6 : 0})),
  sad: () => [{t: 0, joints: pose()}, {t: 0.5, joints: pose({torso: -78, head: -50, armAUpper: 96, armBUpper: 84}), dy: 6}, {t: 1, joints: pose({torso: -76, head: -46, armAUpper: 95, armBUpper: 85}), dy: 8}],
  tired: ({seconds}) => cycle(Math.max(1, Math.round(seconds / 2)), 4, s => ({joints: pose({torso: -74 + 3 * s, head: -40 + 6 * s, armAUpper: 100, armALower: 96, armBUpper: 84, armBLower: 88}), dy: 10 + 2 * s})),
  victory: ({intensity: k}) => [
    {t: 0, joints: pose()},
    {t: 0.2, joints: pose({legAUpper: 50, legALower: 120, legBUpper: 60, legBLower: 125, armBUpper: 90, armBLower: 140}), dy: 20},
    {t: 0.45, joints: pose({armBUpper: -95, armBLower: -100, armAUpper: -60, armALower: -80, legAUpper: 80, legALower: 120, legBUpper: 100, legBLower: 140}), dy: -90 * k},
    {t: 0.7, joints: pose({armBUpper: -90, armBLower: -95, armAUpper: 120, armALower: 100}), dy: 0},
    {t: 1, joints: pose({armBUpper: -92, armBLower: -96, armAUpper: 110, armALower: 100})},
  ],
  sleep: ({intensity: k}) => [
    {t: 0, joints: pose(), rot: 0},
    {t: 0.4, joints: pose({torso: -100, legAUpper: 50, legALower: 120, legBUpper: 60, legBLower: 125}), dy: 30, rot: 0},
    {t: 1, joints: pose({head: -96, armAUpper: 80, armALower: 60, armBUpper: 100, armBLower: 80}), dy: 70 * k, rot: -90},
  ],
  getup: () => [
    {t: 0, joints: pose({armAUpper: 180, armALower: 175, armBUpper: 0, armBLower: 5}), rot: 90, dy: 60},
    {t: 0.4, joints: pose({torso: -40, armAUpper: 120, armALower: 100, legAUpper: 20, legALower: 120, legBUpper: 30, legBLower: 130}), rot: 40, dy: 40},
    {t: 0.7, joints: pose({torso: -70, legAUpper: 50, legALower: 120, legBUpper: 120, legBLower: 110}), rot: 0, dy: 20},
    {t: 1, joints: pose(), rot: 0, dy: 0},
  ],
  // Fun.
  dance: ({seconds}) => cycle(Math.max(2, Math.round(seconds * 2)), 4, (s, c) => ({
    joints: pose({torso: -90 + 8 * s, head: -90 + 12 * s, armBUpper: c > 0 ? -70 : 40, armBLower: c > 0 ? -80 : 60, armAUpper: c > 0 ? 130 : 160, armALower: c > 0 ? 100 : 170,
      legAUpper: 96 - 14 * s, legALower: 92 + 20 * Math.max(0, s), legBUpper: 84 + 6 * s}), dy: 6 * Math.abs(s), dx: 8 * s})),
  groove: ({seconds}) => cycle(Math.max(2, Math.round(seconds * 2)), 4, (s, c) => ({
    joints: pose({torso: -90 + 10 * s, head: -90 - 10 * s, armAUpper: 150 + 20 * s, armALower: 120 + 30 * s, armBUpper: 30 + 20 * s, armBLower: 60 + 30 * s, legAUpper: 100 + 6 * s, legBUpper: 80 + 6 * s}),
    dy: 4 + 4 * Math.abs(c)})),
};

const DEFAULT_SECONDS = {walk: 2, run: 2, jump: 1, wave: 1.5, cheer: 1.5, sit: 1, fall: 1, idle: 4, nod: 1, punch: 0.6, kick: 0.7, shrug: 1, bow: 1.4, raise: 1.5, hover: 4,
  sneak: 2.5, dash: 0.6, climb: 2, fly: 2, swim: 3, roll: 1, backflip: 1.1, slash: 0.6, uppercut: 0.6, combo: 1.2, block: 1, dodge: 0.8, jumpkick: 0.9, hit: 1, shoot: 0.8,
  throw: 0.8, cast: 1, charge: 2, point: 1, pointup: 1, clap: 1.5, salute: 1.2, think: 2, facepalm: 1.2, stretch: 2, help: 1.5, lookaround: 2, kneel: 1, pray: 1.5, push: 2,
  pull: 2, lift: 1.5, laugh: 1.5, cry: 2, scared: 1.5, angry: 1.5, sad: 1.5, tired: 3, victory: 1.2, sleep: 1.5, getup: 1.2, dance: 2, groove: 2};

/** Moves by group, for the Presets panel. */
export const MOVE_GROUPS = {
  'Getting around': ['walk', 'run', 'sneak', 'dash', 'jump', 'climb', 'fly', 'swim', 'roll', 'backflip', 'hover'],
  Combat: ['punch', 'kick', 'slash', 'uppercut', 'combo', 'jumpkick', 'block', 'dodge', 'hit', 'shoot', 'throw', 'cast', 'charge', 'raise'],
  Gestures: ['wave', 'point', 'pointup', 'clap', 'salute', 'think', 'facepalm', 'shrug', 'nod', 'bow', 'help', 'lookaround', 'stretch', 'kneel', 'pray', 'push', 'pull', 'lift'],
  Emotions: ['cheer', 'victory', 'laugh', 'cry', 'sad', 'scared', 'angry', 'tired', 'idle'],
  'Everyday & fun': ['sit', 'sleep', 'getup', 'fall', 'dance', 'groove'],
};
export const MOVE_LABELS = {walk: 'Walk', run: 'Run', jump: 'Jump', wave: 'Wave', cheer: 'Cheer', sit: 'Sit down', fall: 'Fall over', idle: 'Breathe', nod: 'Nod', punch: 'Punch',
  kick: 'Kick', shrug: 'Shrug', bow: 'Bow', raise: 'Raise sword', hover: 'Hover', sneak: 'Sneak', dash: 'Dash', climb: 'Climb', fly: 'Fly', swim: 'Swim', roll: 'Roll',
  backflip: 'Backflip', slash: 'Sword slash', uppercut: 'Uppercut', combo: 'Combo', block: 'Block', dodge: 'Dodge', jumpkick: 'Flying kick', hit: 'Get hit', shoot: 'Shoot',
  throw: 'Throw', cast: 'Cast spell', charge: 'Power up', point: 'Point', pointup: 'Point up', clap: 'Clap', salute: 'Salute', think: 'Think', facepalm: 'Facepalm',
  stretch: 'Stretch', help: 'Wave for help', lookaround: 'Look around', kneel: 'Kneel', pray: 'Pray', push: 'Push', pull: 'Pull', lift: 'Lift', laugh: 'Laugh', cry: 'Cry',
  scared: 'Scared', angry: 'Angry stomp', sad: 'Sad', tired: 'Tired', victory: 'Victory', sleep: 'Lie down', getup: 'Get up', dance: 'Dance', groove: 'Groove'};
/** The keys a move is made of at its defaults ({label, group, seconds, travels, keys: [{t, joints, dx, dy, rot}]}): what a .rigset file stores. */
export function moveData(move) {
  const builder = BUILDERS[move];
  if (!builder) throw new Error(`Unknown move "${move}".`);
  const seconds = DEFAULT_SECONDS[move] ?? 1.5;
  const group = Object.entries(MOVE_GROUPS).find(([, names]) => names.includes(move))?.[0] ?? 'My moves';
  return {label: MOVE_LABELS[move] ?? move, group, seconds, travels: TRAVELLING_MOVES.has(move), keys: builder({seconds, intensity: 1})};
}
/**
 * Adds a move from data (a .rigset file, or one recorded from a figure). Its keys play as stored; Strength scales each
 * joint's turn away from standing, Length stretches it. A move already built in keeps its own builder.
 */
export function registerMove(name, {label = name, group = 'My moves', seconds = 1.5, travels = false, keys = []} = {}) {
  if (BUILDERS[name]) return name;
  const clean = keys.filter(key => Number.isFinite(key?.t) && key.joints && typeof key.joints === 'object')
    .map(key => ({t: Math.min(1, Math.max(0, key.t)), joints: Object.fromEntries(Object.entries(key.joints).filter(([role, value]) => role in STAND && Number.isFinite(value))),
      dx: Number(key.dx) || 0, dy: Number(key.dy) || 0, rot: Number(key.rot) || 0})).sort((a, b) => a.t - b.t);
  if (clean.length < 2) throw new Error(`${label} has fewer than two keys.`);
  BUILDERS[name] = ({intensity: k = 1}) => clean.map(key => ({...key, joints: pose(Object.fromEntries(Object.entries(key.joints).map(([role, value]) => [role, STAND[role] + (value - STAND[role]) * k])))}));
  DEFAULT_SECONDS[name] = Math.min(30, Math.max(0.2, Number(seconds) || 1.5));
  MOVE_LABELS[name] = String(label).slice(0, 80);
  (MOVE_GROUPS[group] ??= []).push(name);
  if (!MOVES.includes(name)) MOVES.push(name);
  if (travels) TRAVELLING_MOVES.add(name);
  return name;
}
/** Moves that travel: they take a Direction and stop short of the canvas edge. */
export const TRAVELLING_MOVES = new Set(['walk', 'run', 'jump', 'punch', 'kick', 'sneak', 'dash', 'fly', 'swim', 'roll', 'backflip', 'slash', 'combo', 'jumpkick', 'hit', 'throw', 'push', 'pull', 'dodge']);
const mirror = degrees => 180 - degrees;

/**
 * The keyed poses of a move: [{frame (0-based offset), joints {role: degrees}, dx, dy, rot}].
 * `fps` turns `seconds` into frames; keys never share a frame.
 */
export function buildMove(move, {fps = 24, seconds, direction = 'right', distance, intensity = 1} = {}) {
  const builder = BUILDERS[move];
  if (!builder) throw new Error(`Unknown move "${move}". Choose one of: ${MOVES.join(', ')}.`);
  seconds = seconds ?? DEFAULT_SECONDS[move];
  const frames = Math.max(2, Math.round(seconds * fps));
  const keys = builder({seconds, distance, intensity: Math.min(2, Math.max(0.2, intensity))});
  const left = direction === 'left', seen = new Set(), out = [];
  for (const key of keys) {
    const frame = Math.round(key.t * (frames - 1));
    if (seen.has(frame)) continue; seen.add(frame);
    const joints = Object.fromEntries(Object.entries(key.joints).map(([role, value]) => [role, left ? mirror(value) : value]));
    out.push({frame, joints, dx: (key.dx ?? 0) * (left ? -1 : 1), dy: key.dy ?? 0, rot: (key.rot ?? 0) * (left ? -1 : 1)});
  }
  return {frames, keys: out};
}
