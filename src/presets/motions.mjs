// Motion presets for any figure, object, sticker or text (entrances, exits, emphasis, loops and paths),
// and keyed camera moves. Each is a list of keys over normalised time u (0..1), relative to where the
// thing already is at the playhead: dx, dy in pixels, s a scale multiplier, r degrees of turn, o opacity
// (absolute 0..1). They are written as ordinary keys on the figure's (or the Camera's) layer with the
// preset's easing, so they show in the timeline and can be edited like hand-made keys.

const wave = (n, make) => Array.from({length: n + 1}, (_, i) => ({u: i / n, ...make(i, i / n)}));

export const MOTION_GROUPS = {
  'Entrances': ['pop-in', 'fade-in', 'slide-in-left', 'slide-in-right', 'slide-in-top', 'slide-in-bottom', 'drop-in', 'zoom-in', 'spin-in', 'grow-in', 'swing-in'],
  'Exits': ['pop-out', 'fade-out', 'slide-out-left', 'slide-out-right', 'fly-away', 'fall-away', 'shrink-out', 'spin-out', 'zoom-out'],
  'Emphasis': ['bounce', 'pulse', 'heartbeat', 'shake', 'wobble', 'tada', 'flash', 'jump-up', 'nudge'],
  'Loops': ['float', 'spin', 'swing', 'blink', 'flicker', 'breathe', 'hover-bob', 'orbit'],
  'Paths': ['arc-throw', 'zigzag', 'hop-across', 'fly-across', 'circle-path', 'boomerang'],
  'Effect stickers': ['hit-pop', 'swoosh', 'ring-out', 'spin-glow'],
};

/** {label, seconds, ease ('auto' eases between keys, 'linear' keeps speed), keys: [{u, dx, dy, s, r, o}]}. */
export const MOTIONS = {
  'pop-in': {label: 'Pop in', seconds: 0.5, ease: 'auto', keys: [{u: 0, s: 0.05, o: 0}, {u: 0.6, s: 1.18, o: 1}, {u: 0.8, s: 0.94}, {u: 1, s: 1}]},
  'fade-in': {label: 'Fade in', seconds: 0.6, ease: 'auto', keys: [{u: 0, o: 0}, {u: 1, o: 1}]},
  'slide-in-left': {label: 'Slide in from left', seconds: 0.6, ease: 'auto', keys: [{u: 0, dx: -700, o: 0}, {u: 0.75, dx: 18, o: 1}, {u: 1, dx: 0}]},
  'slide-in-right': {label: 'Slide in from right', seconds: 0.6, ease: 'auto', keys: [{u: 0, dx: 700, o: 0}, {u: 0.75, dx: -18, o: 1}, {u: 1, dx: 0}]},
  'slide-in-top': {label: 'Slide in from top', seconds: 0.6, ease: 'auto', keys: [{u: 0, dy: -500, o: 0}, {u: 0.75, dy: 14, o: 1}, {u: 1, dy: 0}]},
  'slide-in-bottom': {label: 'Slide in from bottom', seconds: 0.6, ease: 'auto', keys: [{u: 0, dy: 500, o: 0}, {u: 0.75, dy: -14, o: 1}, {u: 1, dy: 0}]},
  'drop-in': {label: 'Drop in and bounce', seconds: 0.9, ease: 'linear', keys: [{u: 0, dy: -500, o: 1}, {u: 0.4, dy: 0}, {u: 0.55, dy: -60}, {u: 0.7, dy: 0}, {u: 0.8, dy: -18}, {u: 0.9, dy: 0}, {u: 1, dy: 0}]},
  'zoom-in': {label: 'Zoom in', seconds: 0.5, ease: 'auto', keys: [{u: 0, s: 3, o: 0}, {u: 1, s: 1, o: 1}]},
  'spin-in': {label: 'Spin in', seconds: 0.7, ease: 'auto', keys: [{u: 0, s: 0.05, r: -270, o: 0}, {u: 0.33, s: 0.4, r: -180, o: 0.6}, {u: 0.66, s: 0.8, r: -90, o: 1}, {u: 1, s: 1, r: 0}]},
  'grow-in': {label: 'Grow in', seconds: 0.8, ease: 'auto', keys: [{u: 0, s: 0.05}, {u: 1, s: 1}]},
  'swing-in': {label: 'Swing in', seconds: 0.8, ease: 'auto', keys: [{u: 0, r: -60, o: 0}, {u: 0.45, r: 20, o: 1}, {u: 0.7, r: -10}, {u: 0.85, r: 5}, {u: 1, r: 0}]},

  'pop-out': {label: 'Pop out', seconds: 0.4, ease: 'auto', keys: [{u: 0, s: 1}, {u: 0.35, s: 1.15}, {u: 1, s: 0.05, o: 0}]},
  'fade-out': {label: 'Fade out', seconds: 0.6, ease: 'auto', keys: [{u: 0, o: 1}, {u: 1, o: 0}]},
  'slide-out-left': {label: 'Slide out to left', seconds: 0.5, ease: 'auto', keys: [{u: 0, dx: 0}, {u: 0.25, dx: 20}, {u: 1, dx: -700, o: 0}]},
  'slide-out-right': {label: 'Slide out to right', seconds: 0.5, ease: 'auto', keys: [{u: 0, dx: 0}, {u: 0.25, dx: -20}, {u: 1, dx: 700, o: 0}]},
  'fly-away': {label: 'Fly away up', seconds: 0.8, ease: 'auto', keys: [{u: 0, dy: 0}, {u: 0.2, dy: 16}, {u: 1, dy: -600, s: 0.6, o: 0}]},
  'fall-away': {label: 'Fall away', seconds: 0.9, ease: 'auto', keys: [{u: 0, dy: 0, r: 0}, {u: 0.2, dy: -30, r: -8}, {u: 1, dy: 700, r: 40}]},
  'shrink-out': {label: 'Shrink away', seconds: 0.6, ease: 'auto', keys: [{u: 0, s: 1}, {u: 1, s: 0.05, o: 0}]},
  'spin-out': {label: 'Spin out', seconds: 0.7, ease: 'auto', keys: [{u: 0, r: 0}, {u: 0.33, r: 90, s: 0.8}, {u: 0.66, r: 180, s: 0.4, o: 0.6}, {u: 1, r: 270, s: 0.05, o: 0}]},
  'zoom-out': {label: 'Zoom out (towards camera)', seconds: 0.5, ease: 'auto', keys: [{u: 0, s: 1}, {u: 1, s: 3, o: 0}]},

  'bounce': {label: 'Bounce', seconds: 1, ease: 'auto', keys: [{u: 0, dy: 0}, {u: 0.3, dy: -70}, {u: 0.5, dy: 0}, {u: 0.7, dy: -25}, {u: 0.85, dy: 0}, {u: 1, dy: 0}]},
  'pulse': {label: 'Pulse', seconds: 0.6, ease: 'auto', keys: [{u: 0, s: 1}, {u: 0.5, s: 1.2}, {u: 1, s: 1}]},
  'heartbeat': {label: 'Heartbeat', seconds: 0.9, ease: 'auto', keys: [{u: 0, s: 1}, {u: 0.15, s: 1.18}, {u: 0.3, s: 1}, {u: 0.45, s: 1.25}, {u: 0.7, s: 1}, {u: 1, s: 1}]},
  'shake': {label: 'Shake', seconds: 0.5, ease: 'linear', keys: wave(8, i => ({dx: i % 8 === 0 ? 0 : (i % 2 ? 12 : -12) * (1 - i / 9)}))},
  'wobble': {label: 'Wobble', seconds: 0.8, ease: 'auto', keys: wave(6, i => ({r: i === 0 || i === 6 ? 0 : (i % 2 ? 14 : -14) * (1 - i / 7)}))},
  'tada': {label: 'Ta-da!', seconds: 1, ease: 'auto', keys: [{u: 0, s: 1, r: 0}, {u: 0.15, s: 0.9, r: -4}, {u: 0.3, s: 1.15, r: 4}, {u: 0.45, s: 1.15, r: -4}, {u: 0.6, s: 1.15, r: 4}, {u: 0.75, s: 1.15, r: -4}, {u: 1, s: 1, r: 0}]},
  'flash': {label: 'Flash', seconds: 0.6, ease: 'linear', keys: [{u: 0, o: 1}, {u: 0.25, o: 0}, {u: 0.5, o: 1}, {u: 0.75, o: 0}, {u: 1, o: 1}]},
  'jump-up': {label: 'Jump up', seconds: 0.6, ease: 'auto', keys: [{u: 0, dy: 0}, {u: 0.45, dy: -80}, {u: 1, dy: 0}]},
  'nudge': {label: 'Nudge', seconds: 0.4, ease: 'auto', keys: [{u: 0, dx: 0}, {u: 0.4, dx: 24}, {u: 1, dx: 0}]},

  'float': {label: 'Float', seconds: 3, ease: 'auto', keys: [{u: 0, dy: 0}, {u: 0.25, dy: -14}, {u: 0.5, dy: 0}, {u: 0.75, dy: -14}, {u: 1, dy: 0}]},
  'spin': {label: 'Spin', seconds: 1.2, ease: 'linear', keys: wave(4, i => ({r: i * 90}))},
  'swing': {label: 'Pendulum swing', seconds: 2, ease: 'auto', keys: [{u: 0, r: 0}, {u: 0.25, r: 22}, {u: 0.5, r: 0}, {u: 0.75, r: -22}, {u: 1, r: 0}]},
  'blink': {label: 'Blink', seconds: 1, ease: 'linear', keys: [{u: 0, o: 1}, {u: 0.45, o: 1}, {u: 0.5, o: 0}, {u: 0.95, o: 0}, {u: 1, o: 1}]},
  'flicker': {label: 'Flicker', seconds: 1, ease: 'linear', keys: [0, 1, 0.3, 1, 0.1, 0.9, 0.2, 1, 1].map((o, i, all) => ({u: i / (all.length - 1), o}))},
  'breathe': {label: 'Breathe (scale)', seconds: 2.5, ease: 'auto', keys: [{u: 0, s: 1}, {u: 0.5, s: 1.06}, {u: 1, s: 1}]},
  'hover-bob': {label: 'Hover and tilt', seconds: 2.4, ease: 'auto', keys: [{u: 0, dy: 0, r: 0}, {u: 0.25, dy: -12, r: 4}, {u: 0.5, dy: 0, r: 0}, {u: 0.75, dy: -12, r: -4}, {u: 1, dy: 0, r: 0}]},
  'orbit': {label: 'Orbit', seconds: 2, ease: 'linear', keys: wave(8, (i, u) => ({dx: Math.sin(u * 2 * Math.PI) * 80, dy: -Math.cos(u * 2 * Math.PI) * 50 + 50}))},

  'arc-throw': {label: 'Thrown in an arc', seconds: 1, ease: 'linear', keys: wave(8, (i, u) => ({dx: 500 * u, dy: -260 * 4 * u * (1 - u), r: 360 * u}))},
  'zigzag': {label: 'Zigzag', seconds: 1.2, ease: 'linear', keys: wave(6, (i, u) => ({dx: 480 * u, dy: i % 2 ? -50 : 0}))},
  'hop-across': {label: 'Hop across', seconds: 1.5, ease: 'linear', keys: wave(12, (i, u) => ({dx: 420 * u, dy: -60 * Math.abs(Math.sin(u * 3 * Math.PI))}))},
  'fly-across': {label: 'Fly across', seconds: 1.5, ease: 'auto', keys: [{u: 0, dx: -800}, {u: 0.5, dx: 0, dy: -30}, {u: 1, dx: 800}]},
  'circle-path': {label: 'Circle around', seconds: 2, ease: 'linear', keys: wave(12, (i, u) => ({dx: Math.cos(u * 2 * Math.PI) * 120 - 120, dy: Math.sin(u * 2 * Math.PI) * 120}))},
  // Turns stay under 180° between keys, so each key interpolates the way it spins.
  // Short letter motions for text animations (text-presets.mjs).
  'type-on': {label: 'Type on', seconds: 0.05, ease: 'linear', keys: [{u: 0, o: 0}, {u: 1, o: 1}]},
  'slide-in-bottom-short': {label: 'Rise in', seconds: 0.35, ease: 'auto', keys: [{u: 0, dy: 40, o: 0}, {u: 1, dy: 0, o: 1}]},
  'drop-in-short': {label: 'Drop in', seconds: 0.45, ease: 'auto', keys: [{u: 0, dy: -120, o: 0}, {u: 0.6, dy: 8, o: 1}, {u: 1, dy: 0}]},
  'jump-up-short': {label: 'Hop', seconds: 0.4, ease: 'auto', keys: [{u: 0, dy: 0}, {u: 0.5, dy: -30}, {u: 1, dy: 0}]},
  // How effect stickers land: a hit pops and fades, a swoosh flashes along its arc, a ring expands.
  'hit-pop': {label: 'Hit pop', seconds: 0.4, ease: 'auto', keys: [{u: 0, s: 0.3, o: 1}, {u: 0.3, s: 1.15}, {u: 0.6, s: 1, o: 1}, {u: 1, s: 1.05, o: 0}]},
  'swoosh': {label: 'Swoosh', seconds: 0.35, ease: 'auto', keys: [{u: 0, s: 0.8, r: -25, o: 0}, {u: 0.3, s: 1, r: 0, o: 1}, {u: 1, s: 1.1, r: 12, o: 0}]},
  'ring-out': {label: 'Ring out', seconds: 0.45, ease: 'auto', keys: [{u: 0, s: 0.2, o: 1}, {u: 1, s: 1.6, o: 0}]},
  'spin-glow': {label: 'Spin and glow', seconds: 2, ease: 'linear', keys: wave(8, (i, u) => ({r: 45 * i, o: i === 0 ? 0 : 1, s: i === 0 ? 0.6 : 1}))},
  'boomerang': {label: 'Boomerang', seconds: 1.4, ease: 'linear', keys: wave(12, (i, u) => ({dx: 420 * Math.sin(u * Math.PI), dy: -60 * Math.sin(u * 2 * Math.PI), r: 1440 * u}))},
};

/** Keyed camera moves on the Camera layer: dx, dy (pixels), zoom (multiplier) and roll (degrees). */
export const CAMERA_PRESETS = {
  'push-in': {label: 'Push in', seconds: 2, ease: 'auto', keys: [{u: 0, zoom: 1}, {u: 1, zoom: 1.3}]},
  'pull-out': {label: 'Pull out', seconds: 2, ease: 'auto', keys: [{u: 0, zoom: 1.3}, {u: 1, zoom: 1}]},
  'crash-zoom': {label: 'Crash zoom', seconds: 0.35, ease: 'auto', keys: [{u: 0, zoom: 1}, {u: 1, zoom: 1.9}]},
  'pan-left': {label: 'Pan left', seconds: 2, ease: 'auto', keys: [{u: 0, dx: 0}, {u: 1, dx: -240}]},
  'pan-right': {label: 'Pan right', seconds: 2, ease: 'auto', keys: [{u: 0, dx: 0}, {u: 1, dx: 240}]},
  'tilt-up': {label: 'Tilt up', seconds: 2, ease: 'auto', keys: [{u: 0, dy: 0}, {u: 1, dy: -160}]},
  'tilt-down': {label: 'Tilt down', seconds: 2, ease: 'auto', keys: [{u: 0, dy: 0}, {u: 1, dy: 160}]},
  'whip-pan': {label: 'Whip pan', seconds: 0.3, ease: 'auto', keys: [{u: 0, dx: 0}, {u: 1, dx: 900}]},
  'dutch-tilt': {label: 'Dutch tilt', seconds: 1, ease: 'auto', keys: [{u: 0, roll: 0}, {u: 1, roll: 10}]},
  'drift': {label: 'Slow drift', seconds: 4, ease: 'auto', keys: [{u: 0, dx: 0, zoom: 1}, {u: 1, dx: 60, zoom: 1.06}]},
  'reveal-up': {label: 'Crane reveal', seconds: 3, ease: 'auto', keys: [{u: 0, dy: 140, zoom: 1.2}, {u: 1, dy: 0, zoom: 1}]},
  'zoom-punch': {label: 'Zoom punch', seconds: 0.5, ease: 'auto', keys: [{u: 0, zoom: 1}, {u: 0.3, zoom: 1.25}, {u: 1, zoom: 1}]},
  'roll-in': {label: 'Roll in', seconds: 1, ease: 'auto', keys: [{u: 0, roll: -25, zoom: 1.4}, {u: 1, roll: 0, zoom: 1}]},
};
/** The camera's procedural motion clips (camera-motion.mjs), offered beside the keyed moves. */
export const CAMERA_CLIPS = {shake: 'Shake', handheld: 'Handheld', impact: 'Impact punch', pulse: 'Zoom pulse', wobble: 'Wobble', follow: 'Follow figure'};
