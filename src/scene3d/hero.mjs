// The 2D hero for 3D shots: a stick-figure rig driven by physics instead of linear keys.
//
// Motion: authored "beats" set target poses; every channel (joint angles, hip position) follows its
// target through a damped spring, so moves start with weight, overshoot a little and settle (follow-
// through and overlap come free: hands lag shoulders because they are softer springs). Feet are
// planted: legs are solved with two-bone IK from the hip to fixed foot positions, so crouching bends the
// knees instead of sliding the feet. A scarf is a verlet rope blown by gusting wind.
//
// Units are texture pixels with the origin between the feet on the ground, y down. Angles are absolute
// screen radians (0 right, π/2 down). Everything is a pure function of time, so any sub-frame can be
// drawn (motion blur) and the same seed always gives the same take.

const PI = Math.PI;
export const RIG = {thigh: 132, shin: 128, torso: 168, neck: 18, head: 52, upper: 112, fore: 104, sword: 250,
  widths: {torso: 42, thigh: 34, shin: 29, upper: 30, fore: 26}};

/** Beats: time (s) → pose targets. Missing channels keep their previous target. */
export const ACTIONS = {
  'sword-raise': [
    {t: 0, hipY: -RIG.thigh - RIG.shin + 6, hipX: 0, lean: 0, head: 0, armS: [1.05, 1.35], armF: [2.0, 1.75]},
    // Settle into a wide hero stance.
    {t: 0.15, hipY: -RIG.thigh - RIG.shin + 18, armS: [1.15, 1.45], armF: [2.15, 1.9]},
    // Anticipation: sink, coil the sword arm down and back, chin down.
    {t: 1.55, hipY: -RIG.thigh - RIG.shin + 46, lean: 0.05, head: 0.18, armS: [1.75, 2.35], armF: [2.35, 2.05]},
    // Explosive raise: drive up, sword overhead, chest open, look up. The upper arm goes out to the side
    // so the arm reads clear of the head and the forearm stands the blade straight up.
    {t: 2.05, hipY: -RIG.thigh - RIG.shin + 4, lean: -0.08, head: -0.32, armS: [-0.85, -1.5], armF: [2.55, 2.3], spring: 'snap'},
    // Hold, breathing.
    {t: 3.0, hipY: -RIG.thigh - RIG.shin + 10, lean: -0.05, head: -0.24},
  ],
  idle: [{t: 0, hipY: -RIG.thigh - RIG.shin + 14, hipX: 0, lean: 0, head: 0, armS: [1.2, 1.5], armF: [1.95, 1.65]}],
};

const STANCE = 78;   // feet planted this far either side of the centre line
const CHANNELS = ['hipX', 'hipY', 'lean', 'head', 'armS0', 'armS1', 'armF0', 'armF1'];
// Stiffness (ω, rad/s) and damping ζ per channel: the core moves stiff and heavy, the hands soft and late.
const SPRING = {hipX: [9, 0.8], hipY: [10, 0.62], lean: [9, 0.7], head: [7, 0.6], armS0: [12, 0.55], armS1: [9, 0.48], armF0: [8, 0.6], armF1: [6.5, 0.5]};
const SNAP = 1.9;   // a "snap" beat stiffens the springs for an explosive move

/** Integrates the springs once at 1/600 s and keeps the samples, so pose(t) is cheap and exact. */
export function solveMotion(action = 'sword-raise', seconds = 6) {
  const beats = ACTIONS[action] ?? ACTIONS.idle, dt = 1 / 600, steps = Math.ceil(seconds / dt) + 2;
  const flat = beat => ({...beat, armS0: beat.armS?.[0], armS1: beat.armS?.[1], armF0: beat.armF?.[0], armF1: beat.armF?.[1]});
  const keys = beats.map(flat), samples = new Float32Array(steps * CHANNELS.length);
  const value = {}, velocity = {}, target = {};
  for (const name of CHANNELS) { value[name] = keys[0][name] ?? 0; velocity[name] = 0; target[name] = value[name]; }
  let beat = 0, snap = 1;
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    while (beat < keys.length && keys[beat].t <= t) { for (const name of CHANNELS) if (keys[beat][name] !== undefined) target[name] = keys[beat][name]; snap = keys[beat].spring === 'snap' ? SNAP : 1; beat++; }
    snap += (1 - snap) * dt * 0.8;
    CHANNELS.forEach((name, c) => {
      const [w0, zeta] = SPRING[name], w = w0 * snap;
      velocity[name] += (w * w * (target[name] - value[name]) - 2 * zeta * w * velocity[name]) * dt;
      value[name] += velocity[name] * dt;
      samples[i * CHANNELS.length + c] = value[name];
    });
  }
  return t => {
    const f = Math.max(0, Math.min(steps - 1.001, t / dt)), i = Math.floor(f), k = f - i, out = {};
    CHANNELS.forEach((name, c) => { out[name] = samples[i * CHANNELS.length + c] * (1 - k) + samples[(i + 1) * CHANNELS.length + c] * k; });
    // Breathing and a faint idle sway ride on top of the solved motion.
    out.hipY += Math.sin(t * 2.1) * 2.2; out.lean += Math.sin(t * 1.3) * 0.012;
    return out;
  };
}

/**
 * The solved motion as keys for a RigStick stickman: every `every` frames, absolute joint angles by Moves
 * role (armA = the sword arm, screen right; legA = the screen-right leg) and the hip's offset from the point
 * between the feet, for a figure whose own thigh and shin lengths are given (feet stay planted through
 * two-bone IK at that figure's size). Units are the figure's own pixels; multiply by its scale on screen.
 */
export function stickmanKeys(action = 'sword-raise', {seconds = 6, fps = 24, every = 2, thigh = 66, shin = 63} = {}) {
  const motion = solveMotion(action, seconds + 1), k = (thigh + shin) / (RIG.thigh + RIG.shin), stance = STANCE * k;
  const reach = Math.sqrt((thigh + shin - 0.5) ** 2 - stance ** 2), total = Math.round(seconds * fps), keys = [];
  for (let tick = 0; tick < total; tick += every) keys.push(keyAt(tick));
  if ((total - 1) % every) keys.push(keyAt(total - 1));
  return keys;
  function keyAt(tick) {
    const p = motion(tick / fps), up = -PI / 2 + p.lean, hip = {x: p.hipX * k, y: Math.max(p.hipY * k, -reach)};
    const footA = {x: stance, y: 0}, footB = {x: -stance, y: 0}, kneeA = knee(hip, footA, thigh, shin), kneeB = knee(hip, footB, thigh, shin);
    const angle = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
    return {tick, hip, joints: {torso: up, head: up + p.head, armAUpper: p.armS0, armALower: p.armS1, armBUpper: p.armF0, armBLower: p.armF1,
      legAUpper: angle(hip, kneeA), legALower: angle(kneeA, footA), legBUpper: angle(hip, kneeB), legBLower: angle(kneeB, footB)}};
  }
}

/** The scarf as joint angles for a chain figure joined at the neck, sampled every `every` frames. */
export function scarfKeys(action = 'sword-raise', {seconds = 6, fps = 24, every = 2, links = 8, linkLength = 22, lead = 1.5} = {}) {
  const motion = solveMotion(action, seconds + lead + 1), scarf = createScarf({segments: links + 1, length: linkLength});
  const neckAt = t => skeleton(motion(Math.max(0, t - lead))).neck, total = Math.round(seconds * fps), keys = [];
  for (let tick = 0; tick < total; tick += every) {
    const points = scarf.at(neckAt, tick / fps + lead);
    keys.push({tick, angles: points.slice(1).map((point, i) => Math.atan2(point.y - points[i].y, point.x - points[i].x))});
  }
  return keys;
}

/** Two-bone IK in 2D: knee position for hip→foot with bone lengths a, b, bending forward (+x). */
function knee(hip, foot, a, b) {
  const dx = foot.x - hip.x, dy = foot.y - hip.y, d = Math.min(Math.hypot(dx, dy), a + b - 0.01);
  const angle = Math.atan2(dy, dx), bend = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  // Both knees point the way he faces, as in a three-quarter view; bowing them apart reads as an O.
  const [one, two] = [bend, -bend].map(side => ({x: hip.x + Math.cos(angle + side) * a, y: hip.y + Math.sin(angle + side) * a}));
  return one.x >= two.x ? one : two;
}

/** Joint positions for a solved pose. */
export function skeleton(p) {
  // The hip can rise only until the planted legs are straight; past that the shins would have to stretch.
  const reach = Math.sqrt((RIG.thigh + RIG.shin - 1) ** 2 - (STANCE - Math.abs(p.hipX)) ** 2);
  const hip = {x: p.hipX, y: Math.max(p.hipY, -reach)}, up = -PI / 2 + p.lean;
  const neck = {x: hip.x + Math.cos(up) * RIG.torso, y: hip.y + Math.sin(up) * RIG.torso};
  const shoulder = {x: hip.x + Math.cos(up) * RIG.torso * 0.86, y: hip.y + Math.sin(up) * RIG.torso * 0.86};
  const headAngle = up + p.head, head = {x: neck.x + Math.cos(headAngle) * (RIG.neck + RIG.head), y: neck.y + Math.sin(headAngle) * (RIG.neck + RIG.head)};
  const limb = (from, a0, a1, l0, l1) => { const mid = {x: from.x + Math.cos(a0) * l0, y: from.y + Math.sin(a0) * l0}; return [mid, {x: mid.x + Math.cos(a1) * l1, y: mid.y + Math.sin(a1) * l1}]; };
  const [elbowS, handS] = limb(shoulder, p.armS0, p.armS1, RIG.upper, RIG.fore);
  const [elbowF, handF] = limb(shoulder, p.armF0, p.armF1, RIG.upper, RIG.fore);
  // A wide stance: feet stay planted while the hip rises and sinks.
  const footL = {x: -STANCE, y: 0}, footR = {x: STANCE, y: 0};
  return {hip, neck, shoulder, head, headAngle, elbowS, handS, elbowF, handF, footL, footR,
    kneeL: knee(hip, footL, RIG.thigh, RIG.shin), kneeR: knee(hip, footR, RIG.thigh, RIG.shin)};
}

/** A scarf: verlet rope from the neck, gravity, and gusting wind toward +x. Deterministic by time. */
export function createScarf({segments = 14, length = 22, wind = 1} = {}) {
  let points = null, last = 0;
  const step = (anchor, t, dt) => {
    if (!points) points = Array.from({length: segments}, (_, i) => ({x: anchor.x - i * length, y: anchor.y + i * 2, px: anchor.x - i * length, py: anchor.y + i * 2}));
    const gust = wind * (520 + 260 * Math.sin(t * 1.7) + 140 * Math.sin(t * 4.3 + 1) + 90 * Math.sin(t * 9.1));
    for (const [i, p] of points.entries()) {
      if (!i) continue;
      const vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985;
      p.px = p.x; p.py = p.y;
      const flutter = Math.sin(t * 13 + i * 0.9) * 140 * (i / segments);
      p.x += vx + gust * dt * dt; p.y += vy + (260 + flutter) * dt * dt;
    }
    points[0].x = anchor.x; points[0].y = anchor.y;
    for (let k = 0; k < 6; k++) for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, diff = (d - length) / d;
      if (i - 1) { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; } b.x -= dx * diff * (i - 1 ? 0.5 : 1); b.y -= dy * diff * (i - 1 ? 0.5 : 1);
    }
  };
  return {
    /** Advances to time t (sub-stepped; replays from 0 if asked to go back) and returns the points. */
    at(anchorAt, t) {
      if (t < last || !points) { points = null; last = 0; }
      const dt = 1 / 240;
      while (last < t) { last = Math.min(t, last + dt); step(anchorAt(last), last, dt); }
      if (!points) step(anchorAt(0), 0, dt);
      return points.map(p => ({x: p.x, y: p.y}));
    },
  };
}

const strokeLimb = (ctx, a, b, width) => { ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
/** A smooth limb through its middle joint (no corner at elbows and knees). */
const strokeCurve = (ctx, a, m, b, w0, w1) => {
  ctx.lineWidth = (w0 + w1) / 2; ctx.beginPath(); ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(2 * m.x - (a.x + b.x) / 2, 2 * m.y - (a.y + b.y) / 2, b.x, b.y); ctx.stroke();
};

/**
 * Draws the hero (and his sword and scarf) on a 2D context whose origin is between his feet.
 * `glow` 0..1 powers the sword's energy.
 */
export function drawHero(ctx, pose, {color = '#ff7a1a', shade = '#c4520c', scarf = null, scarfColor = '#e5383b', glow = 0} = {}) {
  const s = skeleton(pose);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Scarf behind the body.
  if (scarf) {
    ctx.strokeStyle = scarfColor;
    for (let i = 1; i < scarf.length; i++) { ctx.lineWidth = 22 * (1 - i / scarf.length) + 6; ctx.beginPath(); ctx.moveTo(scarf[i - 1].x, scarf[i - 1].y); ctx.lineTo(scarf[i].x, scarf[i].y); ctx.stroke(); }
  }
  // Far limbs a touch darker for depth.
  ctx.strokeStyle = shade;
  strokeCurve(ctx, s.shoulder, s.elbowF, s.handF, RIG.widths.upper, RIG.widths.fore);
  strokeCurve(ctx, s.hip, s.kneeL, s.footL, RIG.widths.thigh, RIG.widths.shin);
  ctx.strokeStyle = color;
  strokeCurve(ctx, s.hip, s.kneeR, s.footR, RIG.widths.thigh, RIG.widths.shin);
  strokeLimb(ctx, s.hip, s.neck, RIG.widths.torso);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(s.head.x, s.head.y, RIG.head, 0, PI * 2); ctx.fill();
  // Sword: from the hand along the forearm.
  const forearm = Math.atan2(s.handS.y - s.elbowS.y, s.handS.x - s.elbowS.x), tip = {x: s.handS.x + Math.cos(forearm) * RIG.sword, y: s.handS.y + Math.sin(forearm) * RIG.sword};
  const guardA = {x: s.handS.x + Math.cos(forearm) * 14 + Math.cos(forearm + PI / 2) * 26, y: s.handS.y + Math.sin(forearm) * 14 + Math.sin(forearm + PI / 2) * 26};
  const guardB = {x: s.handS.x + Math.cos(forearm) * 14 - Math.cos(forearm + PI / 2) * 26, y: s.handS.y + Math.sin(forearm) * 14 - Math.sin(forearm + PI / 2) * 26};
  if (glow > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [width, alpha] of [[70, 0.12], [40, 0.22], [20, 0.45]]) { ctx.strokeStyle = `rgba(120, 210, 255, ${alpha * glow})`; strokeLimb(ctx, s.handS, tip, width); }
    const flare = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 120 * glow + 10);
    flare.addColorStop(0, `rgba(255, 255, 255, ${0.9 * glow})`); flare.addColorStop(0.3, `rgba(140, 220, 255, ${0.5 * glow})`); flare.addColorStop(1, 'rgba(80, 160, 255, 0)');
    ctx.fillStyle = flare; ctx.beginPath(); ctx.arc(tip.x, tip.y, 120 * glow + 10, 0, PI * 2); ctx.fill(); ctx.restore();
  }
  const blade = ctx.createLinearGradient(s.handS.x, s.handS.y, tip.x, tip.y);
  blade.addColorStop(0, '#9aa6b5'); blade.addColorStop(0.5, '#f4f8ff'); blade.addColorStop(1, '#cfe4ff');
  ctx.strokeStyle = blade; strokeLimb(ctx, s.handS, tip, 11);
  ctx.strokeStyle = '#f5b301'; strokeLimb(ctx, guardA, guardB, 10);
  ctx.strokeStyle = color; strokeCurve(ctx, s.shoulder, s.elbowS, s.handS, RIG.widths.upper, RIG.widths.fore);
  ctx.restore();
  return {head: s.head, tip, hip: s.hip, neck: s.neck};
}
