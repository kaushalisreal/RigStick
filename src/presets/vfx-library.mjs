// The effects library: ready-made effect groups on RigStick's own engine (vfx-registry.mjs), so a
// sword swing, a dust kick or falling snow is one click (or one AI call) instead of hand-tuned
// parameters. Each entry installs ordinary, editable effects as one effect clip (editor addVfxGroup).
//
// Particle choices are indices into vfx-registry.mjs options: look (0 Soft glow, 1 Spark, 2 Dot, 3 Ring,
// 4 Shard, 5 Smoke, 6 Star, 7 Bokeh, 8 Flame, 9 Cartoon cloud, 10 Cartoon flame, 11 Leaf, 12 Petal,
// 13 Snowflake, 14 Drop, 15 Heart, 16 Cartoon star, 17 Pixel, 18 Lightning, 19 Wisp, 20 Rock, 21 Splat,
// 22 Burst), shape (0 point, 1 circle, 2 body, 3 line), emission (0 continuous, 1 burst), space (0 leave
// a trail, 1 follow target), blend (0 auto, 1 glow, 2 solid), sizeMode (0 auto, 1 grow/shrink, 2 puff,
// 3 pop, 4 flicker), rotation (0 auto, 1 random, 2 follow motion, 3 upright, 4 none).

const spectrum = (...colors) => ({type: 'linear', angle: 0, stops: colors.map((color, i) => ({offset: i / (colors.length - 1), color, opacity: 1}))});
const gradient = (a, b) => ({type: 'linear', angle: 90, stops: [{offset: 0, color: a, opacity: 1}, {offset: 1, color: b, opacity: 1}]});
const particles = params => ['particles', params];
// A scene clip with a line emitter of size 0 emits from the whole stage edge its particles travel away
// from, and starts pre-warmed: rain, snow and speed lines fill the frame from the first frame.
const stageEdge = {shape: 3, radius: 0};

/**
 * Library categories in display order. The library stays out of vfx-presets.mjs VFX_PRESETS on purpose: those
 * presets hold filters only (the Effects panel can apply them into a figure's effect stack, where generators
 * cannot live). Library effects always install as effect clips (ai-tools.mjs effectClip).
 */
export const VFX_LIBRARY_CATEGORIES = ['Action', 'Power', 'Magic', 'Elements', 'Weather', 'Celebrate', 'Explosions', 'Screen looks'];

export const VFX_LIBRARY = {
  // Action: motion that reads as speed and force. Put trails on the moving thing (a sword, a fist, a foot).
  'Afterimages': {icon: 'particles', category: 'Action', target: 'figure', duration: 12, about: 'Glowing afterimages left behind a fast blade or limb (anime style): put it on the sword. For a clean air slash, add a Slash sticker.',
    effects: [particles({emission: 0, rate: 160, life: 6, look: 0, color: gradient([255, 255, 255], [120, 200, 255]), size: 5, speed: 0, spread: 0, shape: 2, endSize: 0.2, sizeMode: 1,
      space: 0, blend: 1, fade: 1, glow: 0.4, variation: 0.15})]},
  'Fire trail': {icon: 'particles', category: 'Action', target: 'figure', duration: 14, about: 'A burning streak behind a swing or a kick.',
    effects: [particles({emission: 0, rate: 30, life: 10, look: 8, color: spectrum([255, 240, 160], [255, 140, 40], [200, 40, 20]), size: 16, speed: 0.5, spread: 40, direction: -90, shape: 2, space: 0, blend: 1, fade: 0.8, glow: 0.6})]},
  'Speed lines': {icon: 'particles', category: 'Action', target: 'scene', duration: 36, about: 'Anime speed lines streaming across the frame.',
    effects: [particles({emission: 0, rate: 6, life: 10, look: 1, color: 0xffffff, size: 2, speed: 70, direction: 180, spread: 0, stretch: 14, ...stageEdge, blend: 2, fade: 0.6, variation: 0.6})]},
  'Impact burst': {icon: 'explosion', category: 'Action', target: 'figure', duration: 14, about: 'Sparks and a ring where a hit lands.',
    effects: [particles({emission: 1, count: 28, life: 10, look: 1, color: gradient([255, 255, 255], [255, 210, 80]), size: 4, speed: 18, spread: 360, stretch: 6, drag: 0.15, blend: 1, glow: 0.6}),
      particles({emission: 1, count: 2, life: 9, look: 3, color: 0xffffff, size: 30, endSize: 4, speed: 0, sizeMode: 1, blend: 1, fade: 1})]},
  'Hit sparks': {icon: 'particles', category: 'Action', target: 'figure', duration: 10, about: 'A quick spray of hot sparks.',
    effects: [particles({emission: 1, count: 18, life: 12, look: 1, color: spectrum([255, 255, 220], [255, 170, 40]), size: 3, speed: 14, spread: 120, direction: -60, gravity: 0.6, stretch: 5, blend: 1})]},
  'Dust kick': {icon: 'smoke', category: 'Action', target: 'figure', duration: 30, about: 'A puff of dust at the feet: for a jump, a landing or a dash.',
    effects: [['smoke', {style: 4, color: 0xb49a7c, emission: 1, count: 14, size: 22, rise: 0.4, wind: 0, life: 30, spread: 60, growth: 2.5, space: 0}]]},
  'Air burst': {icon: 'shockwave', category: 'Action', target: 'figure', duration: 16, about: 'A ring of air and wind streaks at the peak of a move.',
    effects: [particles({emission: 1, count: 3, life: 12, look: 3, color: 0xdff4ff, size: 40, endSize: 5, speed: 0, sizeMode: 1, blend: 1, fade: 1}),
      particles({emission: 1, count: 16, life: 12, look: 19, color: 0xffffff, size: 10, speed: 10, spread: 360, drag: 0.1, blend: 1, rotation: 2, fade: 1})]},
  'Ground crack': {icon: 'explosion', category: 'Action', target: 'figure', duration: 30, about: 'Rocks and dust bursting from a heavy landing.',
    effects: [particles({emission: 1, count: 16, life: 26, look: 20, color: 0x7a6a5a, size: 8, speed: 10, spread: 100, direction: -90, gravity: 0.7, ground: 1, blend: 2}),
      ['smoke', {style: 4, color: 0xa08a70, emission: 1, count: 12, size: 30, rise: 0.3, life: 36, spread: 80, growth: 2.2}]]},
  'Footsteps dust': {icon: 'smoke', category: 'Action', target: 'figure', duration: 48, about: 'Little puffs behind a runner.',
    effects: [['smoke', {style: 4, color: 0xc8b49a, amount: 0.6, size: 14, rise: 0.3, wind: -0.6, life: 26, spread: 20, space: 0}]]},
  'Motion smear': {icon: 'blur', category: 'Action', target: 'figure', duration: 12, about: 'A directional blur for a very fast move.',
    effects: [['blur', {mode: 1, radius: 10, angle: 0}]]},

  // Power: auras and charging up.
  'Fire aura': {icon: 'aura', category: 'Power', target: 'figure', duration: 72, about: 'A burning aura.', effects: [['aura', {style: 0, color: 0xffc93c}]]},
  'Electric aura': {icon: 'aura', category: 'Power', target: 'figure', duration: 72, about: 'Crackling blue electricity.', effects: [['aura', {style: 1, color: 0x6fd8ff}]]},
  'Shadow aura': {icon: 'aura', category: 'Power', target: 'figure', duration: 72, about: 'A dark, villainous aura.', effects: [['aura', {style: 2, color: 0x8a4dff}]]},
  'Holy aura': {icon: 'aura', category: 'Power', target: 'figure', duration: 72, about: 'A warm, glowing holy light.', effects: [['aura', {style: 3, color: 0xffe7a0}]]},
  'Ice aura': {icon: 'aura', category: 'Power', target: 'figure', duration: 72, about: 'A cold, frosty aura.', effects: [['aura', {style: 4, color: 0x9fe6ff}]]},
  'Wind aura': {icon: 'aura', category: 'Power', target: 'figure', duration: 72, about: 'Swirling wind.', effects: [['aura', {style: 5, color: 0xb8f0d0}]]},
  'Super aura': {icon: 'aura', category: 'Power', target: 'figure', duration: 72, about: 'A golden super-power aura with a ground blast.', effects: [['aura', {style: 6, color: 0xffb000, intensity: 1.4, dust: 1}]]},
  'Spirit aura': {icon: 'aura', category: 'Power', target: 'figure', duration: 72, about: 'A ghostly spirit aura.', effects: [['aura', {style: 7, color: 0x7fd7ff}]]},
  'Charge up': {icon: 'particles', category: 'Power', target: 'figure', duration: 48, about: 'Energy gathering into the body before a power move.',
    effects: [particles({emission: 0, rate: 14, life: 18, look: 0, color: gradient([200, 240, 255], [80, 160, 255]), size: 5, speed: 0, shape: 1, radius: 160, swirl: 8, flow: 80, space: 1, blend: 1, twinkle: 0.5}),
      ['glow', {color: 0x66ccff, radius: 18, intensity: 1.2}]]},
  'Power glow': {icon: 'glow', category: 'Power', target: 'figure', duration: 48, about: 'A strong glow around the figure.', effects: [['glow', {color: 0xffd23f, radius: 24, intensity: 1.6, coreColor: 0xffffff, coreMix: 0.3}]]},
  'Energy beam': {icon: 'beam', category: 'Power', target: 'figure', duration: 48, about: 'A charged energy blast from the hand.', effects: [['beam', {style: 0}]]},
  'Laser': {icon: 'beam', category: 'Power', target: 'figure', duration: 36, about: 'A thin red laser.', effects: [['beam', {style: 1}]]},
  'Lightning bolt': {icon: 'beam', category: 'Power', target: 'figure', duration: 30, about: 'A crooked bolt of lightning.', effects: [['beam', {style: 4}]]},
  'Fire breath': {icon: 'beam', category: 'Power', target: 'figure', duration: 48, about: 'A stream of fire.', effects: [['beam', {style: 5}]]},
  'Spiral beam': {icon: 'beam', category: 'Power', target: 'figure', duration: 48, about: 'A twisting magic beam.', effects: [['beam', {style: 3}]]},

  // Magic.
  'Sparkles': {icon: 'particles', category: 'Magic', target: 'figure', duration: 48, about: 'Twinkling stars around a figure or object.',
    effects: [particles({emission: 0, rate: 3, life: 30, look: 16, color: spectrum([255, 240, 120], [255, 255, 255]), size: 9, speed: 0.4, spread: 360, shape: 2, twinkle: 0.7, blend: 1, rotation: 1})]},
  'Magic dust': {icon: 'particles', category: 'Magic', target: 'figure', duration: 48, about: 'Glittering dust drifting up.',
    effects: [particles({emission: 0, rate: 6, life: 40, look: 0, color: spectrum([255, 130, 240], [140, 120, 255], [120, 230, 255]), colorMode: 1, size: 4, speed: 0.8, direction: -90, spread: 50, shape: 2, turbulence: 30, twinkle: 0.6, blend: 1})]},
  'Healing': {icon: 'particles', category: 'Magic', target: 'figure', duration: 60, about: 'Green healing light rising.',
    effects: [particles({emission: 0, rate: 5, life: 36, look: 0, color: 0x7dff9a, size: 7, speed: 1.2, direction: -90, spread: 20, shape: 2, blend: 1, twinkle: 0.4}), ['glow', {color: 0x7dff9a, radius: 14, intensity: 0.9}]]},
  'Poison cloud': {icon: 'smoke', category: 'Magic', target: 'figure', duration: 72, about: 'A sickly green cloud with bubbles.', effects: [['smoke', {style: 0, color: 0x7ac943, amount: 1.5, size: 30, rise: 0.4, life: 60}],
    particles({emission: 0, rate: 2, life: 30, look: 3, color: 0x9dff60, size: 6, speed: 1, direction: -90, spread: 30, shape: 2})]},
  'Hearts': {icon: 'particles', category: 'Magic', target: 'figure', duration: 60, about: 'Hearts floating up: love, a crush, a happy moment.',
    effects: [particles({emission: 0, rate: 1.2, life: 40, look: 15, color: 0xff5d8f, size: 14, speed: 1.4, direction: -90, spread: 40, turbulence: 20, rotation: 3, blend: 2, outline: 1})]},
  'Teleport flash': {icon: 'dissolve', category: 'Magic', target: 'figure', duration: 24, about: 'Dissolve away in a flash of blue.', effects: [['dissolve', {progress: 0.4, color: gradient([30, 240, 255], [100, 80, 255]), edge: 0.12}], ['glow', {color: 0x49dcff, intensity: 1.4, radius: 10}]]},
  'Portal swirl': {icon: 'particles', category: 'Magic', target: 'scene', duration: 72, about: 'A swirling ring of magic: a portal opening.',
    effects: [particles({emission: 0, rate: 24, life: 30, look: 0, color: spectrum([180, 90, 255], [90, 220, 255]), size: 6, speed: 0, shape: 1, radius: 110, swirl: 10, blend: 1, x: 0.5, y: 0.5, fade: 0.8})]},

  // Elements: fire, water, earth.
  'Burning': {icon: 'particles', category: 'Elements', target: 'figure', duration: 72, about: 'The figure is on fire.',
    effects: [particles({emission: 0, rate: 10, life: 22, look: 10, color: spectrum([255, 240, 140], [255, 130, 30], [210, 40, 20]), size: 18, speed: 1.6, direction: -90, spread: 25, shape: 2, blend: 1, sizeMode: 2})]},
  'Campfire': {icon: 'particles', category: 'Elements', target: 'figure', duration: 96, about: 'Flames and embers rising from an object (use the fire or a log).',
    effects: [particles({emission: 0, rate: 8, life: 26, look: 8, color: spectrum([255, 240, 140], [255, 130, 30], [200, 40, 20]), size: 22, speed: 1.5, direction: -90, spread: 15, blend: 1}),
      particles({emission: 0, rate: 2, life: 50, look: 1, color: 0xffa040, size: 2, speed: 2, direction: -90, spread: 30, turbulence: 30, blend: 1, stretch: 2})]},
  'Embers': {icon: 'particles', category: 'Elements', target: 'scene', duration: 96, about: 'Glowing embers drifting up across the scene.',
    effects: [particles({emission: 0, rate: 2, life: 260, fade: 0.12, look: 0, color: 0xff8a2a, size: 3, speed: 3, direction: -90, spread: 30, turbulence: 40, twinkle: 0.4, blend: 1, ...stageEdge})]},
  'Smoke (soft)': {icon: 'smoke', category: 'Elements', target: 'figure', duration: 72, about: 'Soft grey smoke.', effects: [['smoke', {style: 0}]]},
  'Smoke (thick)': {icon: 'smoke', category: 'Elements', target: 'figure', duration: 72, about: 'Thick dark smoke.', effects: [['smoke', {style: 1}]]},
  'Steam': {icon: 'smoke', category: 'Elements', target: 'figure', duration: 72, about: 'White steam (a hot drink, a kettle, an angry head).', effects: [['smoke', {style: 2, amount: 1, size: 14, rise: 1}]]},
  'Cartoon smoke': {icon: 'smoke', category: 'Elements', target: 'figure', duration: 72, about: 'Puffy cartoon smoke clouds.', effects: [['smoke', {style: 3}]]},
  'Water splash': {icon: 'particles', category: 'Elements', target: 'figure', duration: 24, about: 'Droplets splashing up and falling.',
    effects: [particles({emission: 1, count: 24, life: 26, look: 14, color: 0x7cc7ff, size: 7, speed: 9, direction: -90, spread: 90, gravity: 0.6, rotation: 2, blend: 2})]},
  'Bubbles': {icon: 'particles', category: 'Elements', target: 'scene', duration: 120, about: 'Bubbles rising (under water).',
    effects: [particles({emission: 0, rate: 1.5, life: 260, fade: 0.12, look: 3, color: 0xcfefff, size: 8, speed: 3, direction: -90, spread: 10, turbulence: 30, blend: 2, ...stageEdge})]},
  'Lightning flash': {icon: 'lightSweep', category: 'Elements', target: 'scene', duration: 10, about: 'A white flash of lightning over the scene.', effects: [['grade', {exposure: 1.4, contrast: 1.2}], ['tint', {color: 0xdfe8ff, mix: 0.25}]]},

  // Weather (scene).
  'Rain': {icon: 'particles', category: 'Weather', target: 'scene', duration: 120, about: 'Steady rain.',
    effects: [particles({emission: 0, rate: 60, life: 30, look: 14, color: 0x9fc8ff, size: 3, speed: 26, direction: 100, spread: 2, stretch: 6, rotation: 2, blend: 2, fade: 0.2, ...stageEdge})]},
  'Storm': {icon: 'particles', category: 'Weather', target: 'scene', duration: 120, about: 'Heavy slanted rain with wind.',
    effects: [particles({emission: 0, rate: 120, life: 24, look: 14, color: 0xb0c8e8, size: 3, speed: 34, direction: 115, spread: 4, stretch: 8, rotation: 2, blend: 2, ...stageEdge}), ['grade', {exposure: -0.4, saturation: 0.7}]]},
  'Snow': {icon: 'particles', category: 'Weather', target: 'scene', duration: 120, about: 'Gently falling snow.',
    effects: [particles({emission: 0, rate: 12, life: 100, fade: 0.12, look: 13, color: 0xffffff, size: 6, speed: 8, direction: 96, spread: 20, turbulence: 30, rotation: 1, spin: 2, blend: 2, ...stageEdge})]},
  'Blizzard': {icon: 'particles', category: 'Weather', target: 'scene', duration: 120, about: 'Driving snow in a strong wind.',
    effects: [particles({emission: 0, rate: 30, life: 120, look: 2, color: 0xffffff, size: 3, speed: 12, direction: 160, spread: 20, wind: -1, turbulence: 40, blend: 2, ...stageEdge})]},
  'Falling leaves': {icon: 'particles', category: 'Weather', target: 'scene', duration: 120, about: 'Autumn leaves drifting down.',
    effects: [particles({emission: 0, rate: 3, life: 110, fade: 0.12, look: 11, color: spectrum([230, 120, 30], [200, 60, 30], [240, 190, 60]), colorMode: 1, size: 12, speed: 7, direction: 100, spread: 30, turbulence: 50, rotation: 1, spin: 4, blend: 2, ...stageEdge})]},
  'Cherry petals': {icon: 'particles', category: 'Weather', target: 'scene', duration: 120, about: 'Pink cherry-blossom petals on the breeze.',
    effects: [particles({emission: 0, rate: 5, life: 110, fade: 0.12, look: 12, color: 0xffb7d5, size: 8, speed: 7, direction: 106, spread: 30, turbulence: 40, rotation: 1, spin: 5, blend: 2, ...stageEdge})]},
  'Wind streaks': {icon: 'particles', category: 'Weather', target: 'scene', duration: 96, about: 'Wind lines blowing across the frame.',
    effects: [particles({emission: 0, rate: 2, life: 80, look: 19, color: 0xffffff, size: 12, speed: 18, direction: 0, spread: 4, rotation: 2, fade: 0.8, blend: 1, ...stageEdge})]},
  'Fireflies': {icon: 'particles', category: 'Weather', target: 'scene', duration: 120, about: 'Fireflies blinking in the dark.',
    effects: [particles({emission: 0, rate: 0.6, life: 300, fade: 0.15, look: 0, color: 0xd8ff6a, size: 4, speed: 4.5, direction: 5, spread: 30, turbulence: 60, twinkle: 0.9, glow: 1, blend: 1, ...stageEdge})]},
  'Dust motes': {icon: 'particles', category: 'Weather', target: 'scene', duration: 120, about: 'Dust floating in a sunbeam.',
    effects: [particles({emission: 0, rate: 1.5, life: 300, fade: 0.15, look: 2, color: 0xfff1c8, size: 2, speed: 4.5, direction: 10, spread: 30, turbulence: 40, twinkle: 0.5, blend: 1, ...stageEdge}), ['lightSweep', {position: 0.3, angle: 30, width: 0.25, intensity: 0.4, color: 0xfff1c8}]]},

  // Celebrate.
  'Confetti': {icon: 'particles', category: 'Celebrate', target: 'scene', duration: 72, about: 'A burst of colourful confetti.',
    effects: [particles({emission: 1, count: 120, life: 70, look: 4, color: spectrum([255, 80, 120], [255, 200, 60], [90, 220, 130], [70, 170, 255], [190, 110, 255]), colorMode: 1, size: 7, speed: 14, direction: -90, spread: 70, gravity: 0.3, drag: 0.04, rotation: 1, spin: 12, blend: 2, x: 0.5, y: 0.9})]},
  'Confetti rain': {icon: 'particles', category: 'Celebrate', target: 'scene', duration: 120, about: 'Confetti falling from above.',
    effects: [particles({emission: 0, rate: 6, life: 280, fade: 0.12, look: 4, color: spectrum([255, 80, 120], [255, 200, 60], [90, 220, 130], [70, 170, 255]), colorMode: 1, size: 7, speed: 3, direction: 90, spread: 20, turbulence: 30, rotation: 1, spin: 10, blend: 2, ...stageEdge})]},
  'Fireworks': {icon: 'explosion', category: 'Celebrate', target: 'scene', duration: 60, about: 'A firework bursting in the sky.', effects: [['explosion', {style: 5, x: 0.5, y: 0.3}]]},
  'Star burst': {icon: 'particles', category: 'Celebrate', target: 'figure', duration: 30, about: 'Cartoon stars bursting out: a win, a reveal.',
    effects: [particles({emission: 1, count: 14, life: 24, look: 16, color: 0xffd23f, size: 14, speed: 8, spread: 360, drag: 0.08, rotation: 1, spin: 6, outline: 1, blend: 2})]},
  'Money rain': {icon: 'particles', category: 'Celebrate', target: 'scene', duration: 96, about: 'Gold coins raining down.',
    effects: [particles({emission: 0, rate: 3, life: 200, fade: 0.12, look: 2, color: 0xf5b301, size: 10, speed: 4, direction: 90, spread: 10, rotation: 1, outline: 1, outlineColor: 0xb07a00, blend: 2, ...stageEdge})]},

  // Explosions (one per explosion style).
  ...Object.fromEntries(['Fireball', 'Cartoon', 'Plasma', 'Smoke bomb', 'Mushroom cloud', 'Electric', 'Magic', 'Dust', 'Pixel'].map((name, i) => [`Explosion: ${name}`,
    {icon: 'explosion', category: 'Explosions', duration: 36, about: `A ${name.toLowerCase()} explosion.`, effects: [['explosion', {style: i >= 5 ? i + 1 : i}]]}])),

  // Screen looks: whole-frame grades and styles (also work on one figure where the effect allows).
  'Dream': {icon: 'blur', category: 'Screen looks', duration: 96, about: 'Soft and glowing, like a memory.', effects: [['blur', {radius: 2}], ['bloom', {threshold: 0.5, intensity: 1.1, radius: 24}], ['grade', {saturation: 0.85, temperature: 0.2}]]},
  'Old film': {icon: 'noise', category: 'Screen looks', target: 'scene', duration: 96, about: 'Faded old film with grain and a vignette.', effects: [['grade', {saturation: 0.35, temperature: 0.35, contrast: 0.9}], ['noise', {amount: 0.18}], ['vignette', {amount: 0.6}]]},
  'Noir': {icon: 'grade', category: 'Screen looks', target: 'scene', duration: 96, about: 'Black and white with hard contrast.', effects: [['grade', {saturation: 0, contrast: 1.5}], ['vignette', {amount: 0.55}]]},
  'Night vision': {icon: 'tint', category: 'Screen looks', target: 'scene', duration: 96, about: 'Green night-vision goggles.', effects: [['tint', {color: 0x5cff6a, mix: 0.8}], ['noise', {amount: 0.2}], ['vignette', {amount: 0.7}]]},
  'Glitch': {icon: 'rgbSplit', category: 'Screen looks', target: 'scene', duration: 24, about: 'A digital glitch.', effects: [['rgbSplit', {amount: 12, angle: 0}], ['noise', {amount: 0.15}], ['wave', {strength: 6, wavelength: 18}]]},
  'Heat haze': {icon: 'turbulence', category: 'Screen looks', target: 'scene', duration: 96, about: 'Shimmering hot air.', effects: [['turbulence', {amount: 4, size: 60}], ['grade', {temperature: 0.4}]]},
  'Underwater': {icon: 'wave', category: 'Screen looks', target: 'scene', duration: 96, about: 'Blue, wavy underwater light.', effects: [['tint', {color: 0x2a9dff, mix: 0.35}], ['wave', {strength: 4, wavelength: 90}], ['lightSweep', {intensity: 0.4, angle: 70, color: 0xbfe8ff}]]},
  'Cold blue': {icon: 'grade', category: 'Screen looks', target: 'scene', duration: 96, about: 'A cold, bluish grade.', effects: [['grade', {temperature: -0.5, saturation: 0.9}]]},
  'Warm sunset': {icon: 'grade', category: 'Screen looks', target: 'scene', duration: 96, about: 'Warm orange sunset light.', effects: [['grade', {temperature: 0.6, saturation: 1.1}], ['bloom', {threshold: 0.7, intensity: 0.6}]]},
  'Comic outline': {icon: 'outline', category: 'Screen looks', target: 'figure', duration: 96, about: 'A thick black comic-book outline.', effects: [['outline', {color: 0x111111, width: 6}]]},
  'Drop shadow': {icon: 'shadow', category: 'Screen looks', target: 'figure', duration: 96, about: 'A soft drop shadow.', effects: [['shadow', {opacity: 0.45, radius: 10, offsetX: 10, offsetY: 12}]]},
  'Flash white': {icon: 'lightSweep', category: 'Screen looks', duration: 4, about: 'A two-frame white flash, for a hit or a cut.', effects: [['tint', {color: 0xffffff, mix: 1}]]},
  'Shockwave': {icon: 'shockwave', category: 'Screen looks', target: 'scene', duration: 12, about: 'A ripple through the whole frame.', effects: [['shockwave', {radius: 220, thickness: 40, strength: 24}]]},
};

/** Effect categories in display order: RigStick's looks first, then the library. */
export const EFFECT_CATEGORIES = ['Looks', ...VFX_LIBRARY_CATEGORIES];
