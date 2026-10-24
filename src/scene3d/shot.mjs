// 3D shots for RigStick: a real three.js city with the 2D hero (src/scene3d/hero.mjs) standing in it.
//
// The city is generated from a seed: hundreds of towers with lit-window textures, fog, a gradient sky,
// stars and a moon. The hero's own rooftop (parapet, AC units, water tank, antenna) sits at the origin,
// and the hero is a camera-facing card planted on it with a contact shadow, so a moving camera shows true
// perspective and parallax around a flat, hand-drawn character. Camera moves are presets.
//
// Each output frame averages several sub-frames across a 180° shutter (camera, hero, scarf and city all
// move between them), which is real motion blur, then gets a cheap bloom and a vignette.
import * as THREE from './vendor/three.module.js';
import { solveMotion, drawHero, createScarf, skeleton } from './hero.mjs';
import { RIG_AIM, RIG_PPM } from './set3d.mjs';

export const CAMERAS = ['hero-orbit', 'push-in', 'crane-up', 'truck'];
export const SCENES = ['night-rooftop'];
const PX = 0.0034;                       // hero texture pixels → metres (a 532 px figure ≈ 1.8 m)
const CARD = {w: 900, h: 1080, ground: 1030};

function random(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function windowTexture(rand, warm) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, 256, 512);
  for (let y = 12; y < 512; y += 64) for (let x = 10; x < 256; x += 64) {
    const lit = rand();
    if (lit < (warm ? 0.42 : 0.3)) {
      const hue = rand() < 0.75 ? (warm ? [255, 205 + rand() * 40, 120 + rand() * 60] : [140, 210, 255]) : [255, 255, 235];
      ctx.fillStyle = `rgba(${hue.map(Math.round).join(',')},${0.55 + rand() * 0.45})`;
      ctx.fillRect(x, y, 40, 44);
    } else { ctx.fillStyle = 'rgba(40, 50, 90, 0.35)'; ctx.fillRect(x, y, 40, 44); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  return texture;
}

function glowSprite(inner, outer, size) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(0.18, inner); g.addColorStop(0.22, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, transparent: true, depthWrite: false, fog: false}));
  sprite.scale.set(size, size, 1); return sprite;
}

const tag = (object, pass) => { object.userData.pass = pass; return object; };
/**
 * The night city around a rooftop at the origin (roof surface y = 0, street level y = -140). Objects are
 * tagged with the 3D Set layer they belong to: 'sky' (dome, stars, moon) or 'city' (towers, their lights,
 * street haze); buildRooftop tags 'roof'. Lights are untagged: they light every layer.
 */
function buildCity(scene, seed) {
  const rand = random(seed), street = -140;
  scene.background = new THREE.Color(0x070a1e);
  scene.fog = new THREE.FogExp2(0x241d4a, 0.00085);
  // Sky dome: deep navy overhead, violet then a warm city glow at the horizon.
  scene.add(tag(new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y; vec3 top = vec3(.02,.03,.10), mid = vec3(.10,.08,.27), hor = vec3(.42,.20,.42), glow = vec3(.95,.45,.35);'
      + ' vec3 c = mix(hor, mid, smoothstep(-.02,.18,h)); c = mix(c, top, smoothstep(.18,.7,h)); c += glow * .35 * exp(-abs(h+.02)*18.);'
      + ' gl_FragColor = vec4(c,1.); }'})), 'sky'));
  // Stars.
  const stars = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i++) { const u = rand() * Math.PI * 2, v = 0.12 + rand() * 0.88, r = 2800; stars.set([Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r], i * 3); }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  scene.add(tag(new THREE.Points(starGeometry, new THREE.PointsMaterial({color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85})), 'sky'));
  // Moon with halo.
  const moon = glowSprite('rgba(255,248,225,1)', 'rgba(170,190,255,0.35)', 520); moon.position.set(-900, 760, -2100); scene.add(tag(moon, 'sky'));
  // Light: cold moonlight, a violet sky fill, a warm bounce from the streets.
  scene.add(new THREE.HemisphereLight(0x6a74c8, 0x2a1830, 0.9));
  const moonLight = new THREE.DirectionalLight(0xaec0ff, 1.1); moonLight.position.set(-0.4, 0.5, -1); scene.add(moonLight);
  // Towers.
  const textures = Array.from({length: 6}, (_, i) => windowTexture(rand, i % 3 !== 0));
  const box = new THREE.BoxGeometry(1, 1, 1);
  // The hero's tower is among the tallest: most of the city spreads out below the roof, with a ring of
  // landmark towers rising past it further out, so the camera sees a skyline, not a wall.
  for (let i = 0; i < 900; i++) {
    const angle = rand() * Math.PI * 2, distance = 70 + rand() ** 0.7 * 1500;
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
    const w = 16 + rand() * 34, d = 16 + rand() * 34;
    const landmark = distance > 280 && rand() < 0.14;
    const h = landmark ? 190 + rand() * 230 : 30 + rand() ** 1.8 * (distance < 200 ? 105 : 150);
    const texture = textures[i % textures.length].clone(); texture.repeat.set(Math.max(1, Math.round(w / 16)), Math.max(1, Math.round(h / 28)));
    const material = new THREE.MeshStandardMaterial({color: 0x161a33, roughness: 0.55, metalness: 0.35, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1.25});
    const tower = new THREE.Mesh(box, material); tower.scale.set(w, h, d); tower.position.set(x, street + h / 2, z); scene.add(tag(tower, 'city'));
    if (rand() < 0.3) { const light = glowSprite('rgba(255,70,90,1)', 'rgba(255,40,60,0.3)', 7); light.position.set(x, street + h + 2, z); light.userData.blink = rand() * 6; scene.add(tag(light, 'city')); }
  }
  // Street haze far below.
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({color: 0x4a2c5a, transparent: true, opacity: 0.55}));
  haze.rotation.x = -Math.PI / 2; haze.position.y = street + 20; scene.add(tag(haze, 'city'));
  return {street};
}

/** The hero's rooftop: 26 m square, parapet, machinery, water tank and a blinking antenna. */
function buildRooftop(scene) {
  const concrete = new THREE.MeshStandardMaterial({color: 0x2c2f45, roughness: 0.9}), trim = new THREE.MeshStandardMaterial({color: 0x3c4160, roughness: 0.7});
  const add = (geometry, material, x, y, z) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); scene.add(tag(mesh, 'roof')); return mesh; };
  add(new THREE.BoxGeometry(26, 140, 26), new THREE.MeshStandardMaterial({color: 0x141830, roughness: 0.6, emissive: 0xffffff, emissiveMap: (() => { const t = windowTexture(random(77), true); t.repeat.set(3, 8); return t; })(), emissiveIntensity: 0.9}), 0, -70.05, 0);
  add(new THREE.BoxGeometry(26, 0.1, 26), concrete, 0, 0, 0);
  for (const [w, d, x, z] of [[26.4, 0.4, 0, 13], [26.4, 0.4, 0, -13], [0.4, 26.4, 13, 0], [0.4, 26.4, -13, 0]]) add(new THREE.BoxGeometry(w, 1.1, d), trim, x, 0.55, z);
  add(new THREE.BoxGeometry(3, 1.6, 2), trim, 6, 0.8, -6); add(new THREE.BoxGeometry(2.2, 1.2, 2.2), trim, -7, 0.6, 5);
  add(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 20), trim, -8, 3.4, -8);
  for (const [x, z] of [[-9, -9], [-7, -9], [-9, -7], [-7, -7]]) add(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), trim, x, 0.9, z);
  add(new THREE.CylinderGeometry(0.06, 0.1, 9, 6), trim, 9, 4.5, 8);
  const beacon = glowSprite('rgba(255,60,80,1)', 'rgba(255,40,60,0.35)', 1.6); beacon.position.set(9, 9.1, 8); beacon.userData.blink = 0.4; scene.add(tag(beacon, 'roof'));
}

/** Camera presets: position and look-at over normalised time u, around a hero at the origin. */
function cameraAt(preset, u, target) {
  const look = new THREE.Vector3(0, target, 0);
  if (preset === 'push-in') { const r = 7.5 - 3 * ease(u); return {pos: new THREE.Vector3(0.6, 0.7, r), look}; }
  if (preset === 'crane-up') { const k = ease(u); return {pos: new THREE.Vector3(1.2, 0.3 + 2.6 * k, 5.4 - 0.8 * k), look: new THREE.Vector3(0, target + 0.2 * k, 0)}; }
  if (preset === 'truck') { const x = -3.2 + 6.4 * ease(u); return {pos: new THREE.Vector3(x, 0.6, 5.2), look: new THREE.Vector3(x * 0.15, target, 0)}; }
  // hero-orbit: a low-angle arc around him from his left to his right, easing in, closing in a little.
  // A low angle looking up at him: the city towers behind, the roof edge drops away below.
  // Framed so his feet on the roof and the raised sword tip both stay in shot all the way round.
  const a = -1.05 + 2.0 * ease(u), r = 5.3 - 0.6 * ease(u);
  return {pos: new THREE.Vector3(Math.sin(a) * r, 0.55 + 0.2 * Math.sin(u * Math.PI), Math.cos(a) * r), look: new THREE.Vector3(0, target + 0.2, 0)};
}


/**
 * Points a three.js camera from 3D Camera rig values: orbit (radians around the hero, 0 = in front), tilt
 * (radians above the aim point), lens (vertical field of view, degrees) and zoom (scale at the aim point).
 * The view is then offset so the world origin lands exactly on `marker` (frame pixels).
 */
export function placeRigCamera(camera, {orbit = 0, tilt = 0.1, lens = 42, zoom = 1, marker}, width, height) {
  camera.clearViewOffset();
  camera.fov = Math.max(8, Math.min(110, lens)); camera.aspect = width / height; camera.updateProjectionMatrix();
  const ppm = height * RIG_PPM * zoom, distance = height / (2 * ppm * Math.tan(camera.fov * Math.PI / 360));
  const aim = new THREE.Vector3(0, RIG_AIM, 0);
  camera.position.set(Math.sin(orbit) * Math.cos(tilt) * distance, RIG_AIM + Math.sin(tilt) * distance, Math.cos(orbit) * Math.cos(tilt) * distance);
  camera.lookAt(aim); camera.updateMatrixWorld();
  const origin = new THREE.Vector3(0, 0, 0).project(camera), sx = (origin.x + 1) / 2 * width, sy = (1 - origin.y) / 2 * height;
  const target = marker ?? {x: width / 2, y: height * 0.85};
  camera.setViewOffset(width, height, sx - target.x, sy - target.y, width, height);
  return {distance, ppm};
}

/**
 * A loaded shot: the city and rooftop are built once (per seed and size), and `frame()` draws any frame of
 * any take (camera, action, colour, length and blur can change between calls), so a live preview can scrub
 * and play without rebuilding the world. Returns the finished 2D canvas, reused for every frame.
 */
export function createShot({width = 1280, height = 720, seed = 7} = {}) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, alpha: true});
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(), view = new THREE.PerspectiveCamera(42, width / height, 0.1, 6000);
  buildCity(scene, seed); buildRooftop(scene);
  const skyColor = scene.background;
  const blinkers = []; scene.traverse(object => { if (object.userData.blink !== undefined) blinkers.push(object); });

  // The hero card: a camera-facing plane whose canvas is redrawn every sub-frame.
  const card = document.createElement('canvas'); card.width = CARD.w; card.height = CARD.h;
  const cardContext = card.getContext('2d'), cardTexture = new THREE.CanvasTexture(card); cardTexture.colorSpace = THREE.SRGBColorSpace;
  const heroGeometry = new THREE.PlaneGeometry(CARD.w * PX, CARD.h * PX); heroGeometry.translate(0, (CARD.h / 2 - (CARD.h - CARD.ground)) * PX, 0);
  const hero = new THREE.Mesh(heroGeometry, new THREE.MeshBasicMaterial({map: cardTexture, transparent: true, depthWrite: false, toneMapped: false, fog: false}));
  hero.renderOrder = 2; scene.add(hero);
  // Contact shadow under his feet, and a light the sword throws when it powers up.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
  const sc = shadowCanvas.getContext('2d'), sg = sc.createRadialGradient(64, 64, 0, 64, 64, 64); sg.addColorStop(0, 'rgba(0,0,0,0.85)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); sc.fillStyle = sg; sc.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.06; scene.add(tag(shadow, 'roof'));
  const swordLight = new THREE.PointLight(0x8fd4ff, 0, 18, 1.6); scene.add(swordLight);

  const accum = document.createElement('canvas'); accum.width = width; accum.height = height;
  const ac = accum.getContext('2d');
  const small = document.createElement('canvas'); small.width = Math.round(width / 4); small.height = Math.round(height / 4);
  const sm = small.getContext('2d');
  // The solved motion and the scarf belong to one take; a new action or length re-solves them.
  let take = null;
  const takeFor = (action, seconds) => {
    if (take?.action === action && take.seconds === seconds) return take;
    const motion = solveMotion(action, seconds + 1);
    const neckAt = t => skeleton(motion(t)).neck;
    return take = {action, seconds, motion, neckAt, scarf: createScarf()};
  };
  // The scarf runs a second and a half ahead, so frame 0 already shows it hanging in the wind, not rigid.
  const SCARF_LEAD = 1.5;
  const glowAt = (action, t) => action === 'sword-raise' ? smooth(1.98, 2.18, t) * (0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.1)) + 0.9 * Math.exp(-((t - 2.12) ** 2) / 0.006) : 0;

  return {
    canvas: accum, width, height, seed,
    /** Draws frame `index` of a take. blur = sub-frames across a 180° shutter (1 = off). */
    // hero: false leaves an empty rooftop, a moving 3D backdrop for the user's own figures.
    frame(index, {seconds = 6, fps = 24, camera = 'hero-orbit', action = 'sword-raise', color = '#ff7a1a', blur = 6, hero: showHero = true} = {}) {
      const {motion, neckAt, scarf} = takeFor(action, seconds), shutter = 0.5, samples = Math.max(1, Math.round(blur));
      hero.visible = shadow.visible = showHero;
      ac.globalCompositeOperation = 'source-over'; ac.globalAlpha = 1;
      for (let j = 0; j < samples; j++) {
        const t = (index + (samples > 1 ? (j + 0.5) / samples * shutter - shutter / 2 : 0)) / fps, u = Math.max(0, Math.min(1, t / seconds));
        const shot = cameraAt(camera, u, 1.05);
        view.position.copy(shot.pos); view.lookAt(shot.look);
        hero.rotation.y = Math.atan2(view.position.x, view.position.z); shadow.rotation.z = hero.rotation.y;
        for (const blinker of blinkers) blinker.material.opacity = 0.25 + 0.75 * (Math.sin((t + blinker.userData.blink) * 3.2) > 0.6 ? 1 : 0.15);
        const pose = motion(t), glow = showHero ? Math.min(1.4, glowAt(action, t)) : 0;
        cardContext.clearRect(0, 0, CARD.w, CARD.h); cardContext.save(); cardContext.translate(CARD.w / 2, CARD.ground);
        const marks = drawHero(cardContext, pose, {color, scarf: scarf.at(time => neckAt(time - SCARF_LEAD), Math.max(0, t) + SCARF_LEAD), glow: Math.min(1, glow)});
        cardContext.restore(); cardTexture.needsUpdate = true;
        // The sword light sits at the blade tip, in world space on the card.
        const tip = new THREE.Vector3(marks.tip.x * PX, -marks.tip.y * PX, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), hero.rotation.y);
        swordLight.position.copy(tip); swordLight.intensity = 26 * glow;
        renderer.render(scene, view);
        ac.globalAlpha = 1 / (j + 1); ac.drawImage(canvas, 0, 0);
      }
      // Bloom: a quarter-size blurred copy of the bright parts, screened back on top.
      sm.clearRect(0, 0, small.width, small.height); sm.filter = 'brightness(0.9) contrast(2.2) blur(6px)'; sm.drawImage(accum, 0, 0, small.width, small.height); sm.filter = 'none';
      ac.globalAlpha = 0.55; ac.globalCompositeOperation = 'screen'; ac.drawImage(small, 0, 0, width, height);
      // A flash and vignette. The flash is screened, not painted over, so it lifts the lights instead of
      // washing the frame grey.
      const t = index / fps, flash = showHero && action === 'sword-raise' ? 0.16 * Math.exp(-((t - 2.12) ** 2) / 0.002) : 0;
      if (flash > 0.01) { ac.save(); ac.globalCompositeOperation = 'screen'; ac.globalAlpha = flash; ac.fillStyle = '#cfe8ff'; ac.fillRect(0, 0, width, height); ac.restore(); }
      ac.globalCompositeOperation = 'multiply'; ac.globalAlpha = 1;
      const vignette = ac.createRadialGradient(width / 2, height * 0.48, height * 0.35, width / 2, height / 2, width * 0.72);
      vignette.addColorStop(0, '#ffffff'); vignette.addColorStop(1, '#3a3550'); ac.fillStyle = vignette; ac.fillRect(0, 0, width, height);
      ac.globalCompositeOperation = 'source-over';
      return accum;
    },
    /**
     * The 3D Set for a RigStick project: the city alone (the hero is a RigStick figure drawn on top),
     * filmed by RigStick's 3D Camera rig. Each view is one sub-frame of the shutter: {orbit, tilt, lens,
     * zoom, marker: {x, y}, time}; the world origin (the roof under the hero's feet) lands on `marker`.
     * `shadow` keeps the contact shadow on the roof at the origin; `bloom` adds the city glow.
     */
    view(views, {shadow: withShadow = true, bloom = true, pass = 'all'} = {}) {
      hero.visible = false; swordLight.intensity = 0;
      // One 3D Set layer at a time: only its objects draw, over transparency unless it is the sky.
      scene.traverse(object => { if (object.userData.pass) object.visible = pass === 'all' || object.userData.pass === pass; });
      shadow.visible = withShadow && (pass === 'all' || pass === 'roof');
      const opaque = pass === 'all' || pass === 'sky';
      scene.background = opaque ? skyColor : null; renderer.setClearColor(0x000000, opaque ? 1 : 0);
      ac.globalCompositeOperation = 'source-over'; ac.globalAlpha = 1; ac.clearRect(0, 0, width, height);
      views.forEach((spec, j) => {
        placeRigCamera(view, spec, width, height);
        shadow.rotation.z = Math.atan2(view.position.x, view.position.z);
        for (const blinker of blinkers) blinker.material.opacity = 0.25 + 0.75 * (Math.sin((spec.time + blinker.userData.blink) * 3.2) > 0.6 ? 1 : 0.15);
        renderer.render(scene, view);
        // Premultiplied sum of equal weights: an exact average, alpha included.
        ac.globalCompositeOperation = 'lighter'; ac.globalAlpha = 1 / views.length; ac.drawImage(canvas, 0, 0);
      });
      ac.globalCompositeOperation = 'source-over'; ac.globalAlpha = 1;
      scene.traverse(object => { if (object.userData.pass) object.visible = true; });
      scene.background = skyColor; renderer.setClearColor(0x000000, 1);
      view.clearViewOffset();
      if (bloom) {
        sm.clearRect(0, 0, small.width, small.height); sm.filter = 'brightness(0.9) contrast(2.2) blur(6px)'; sm.drawImage(accum, 0, 0, small.width, small.height); sm.filter = 'none';
        ac.globalAlpha = 0.5; ac.globalCompositeOperation = 'screen'; ac.drawImage(small, 0, 0, width, height);
      }
      ac.globalCompositeOperation = 'source-over'; ac.globalAlpha = 1;
      return accum;
    },
    dispose() {
      scene.traverse(object => {
        object.geometry?.dispose?.();
        for (const material of [object.material].flat()) { material?.map?.dispose?.(); material?.emissiveMap?.dispose?.(); material?.dispose?.(); }
      });
      renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}

/**
 * Renders a shot frame by frame. `onFrame(canvas, index)` receives each finished 2D canvas (await it).
 * Options: seconds, fps, width, height, camera, action, color, blur (sub-frames, 1 = off), seed, frames
 * (only these indices) and shouldStop() (checked between frames, to cancel).
 */
export async function renderShot({seconds = 6, fps = 24, width = 1280, height = 720, camera = 'hero-orbit', action = 'sword-raise', color = '#ff7a1a',
  blur = 6, seed = 7, hero = true, frames = null, shouldStop = () => false}, onFrame) {
  const shot = createShot({width, height, seed}), take = {seconds, fps, camera, action, color, blur, hero};
  const list = frames ?? Array.from({length: Math.round(seconds * fps)}, (_, i) => i);
  try {
    for (const index of list) { if (shouldStop()) break; await onFrame(shot.frame(index, take), index); }
  } finally { shot.dispose(); }
  return {frames: list.length, width, height, fps};
}
