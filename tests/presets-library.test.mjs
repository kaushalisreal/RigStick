/**
 * The preset library (src/presets): every object draws, every move and motion keys, every effect uses real
 * parameters in range, every sticker has its art, every text look and animation resolves, and the catalog an
 * AI reads names only things that exist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { OBJECTS, OBJECT_CATEGORIES } from '../src/presets/objects.mjs';
import { MOTIONS, MOTION_GROUPS, CAMERA_PRESETS, CAMERA_CLIPS } from '../src/presets/motions.mjs';
import { STICKERS, STICKER_GROUPS } from '../src/presets/stickers.mjs';
import { TEXT_LOOKS, TEXT_LOOK_GROUPS, TEXT_ANIMATIONS, TEXT_ANIMATION_GROUPS, textOptions } from '../src/presets/text-presets.mjs';
import { VFX_LIBRARY, VFX_LIBRARY_CATEGORIES, EFFECT_CATEGORIES } from '../src/presets/vfx-library.mjs';
import { presetCatalog } from '../src/presets/catalog.mjs';
import { MOVES, MOVE_GROUPS, MOVE_LABELS, TRAVELLING_MOVES, buildMove } from '../src/ai/moves.mjs';
import { VFX_PRESETS, PRESET_CATEGORIES } from '../src/vfx-presets.mjs';
import { VFX_REGISTRY } from '../src/vfx-registry.mjs';

const hex = /^#[0-9a-f]{6}$/i;
const finite = value => typeof value === 'number' && Number.isFinite(value);

test('every object draws: closed fills have 4+ points, bends match their path, colours are hex', () => {
  assert.ok(Object.keys(OBJECTS).length >= 100);
  for (const [name, object] of Object.entries(OBJECTS)) {
    assert.ok(OBJECT_CATEGORIES[object.category], `${name} has a category`);
    assert.ok(object.about, `${name} says what it is`);
    const parts = object.make ? object.make({depth: 'mid', seed: 3}) : object.parts;
    assert.ok(parts.length, name);
    for (const part of parts) {
      if (part.circle) { assert.ok(part.circle.every(finite) && part.circle[2] > 0, name); continue; }
      const points = part.path ?? part.windows;
      assert.ok(points?.length >= (part.windows ? 1 : 2) && points.every(([x, y]) => finite(x) && finite(y)), `${name}: points`);
      if (part.bends) assert.equal(part.bends.length, part.path.length, `${name}: one bend per point (bends[i] is the edge ending at point i)`);
      if (part.fill) assert.ok(hex.test(part.fill) && part.path.length >= 4, `${name}: a fill needs a hex colour and 4+ points`);
      if (part.color) assert.ok(hex.test(part.color), `${name}: colour ${part.color}`);
    }
  }
});

test('every character move is grouped, labelled and keys finite poses', () => {
  assert.ok(MOVES.length >= 50);
  assert.deepEqual(new Set(Object.values(MOVE_GROUPS).flat()), new Set(MOVES));
  for (const move of MOVES) {
    assert.ok(MOVE_LABELS[move], move);
    const plan = buildMove(move, {fps: 24});
    assert.ok(plan.keys.length >= 2 && plan.keys[0].frame === 0, move);
    for (const key of plan.keys) assert.ok([key.dx, key.dy, key.rot, ...Object.values(key.joints)].every(finite), move);
    // Whole-body turns stay under 180° between keys, so each key interpolates the way it turns.
    for (let i = 1; i < plan.keys.length; i++) assert.ok(Math.abs(plan.keys[i].rot - plan.keys[i - 1].rot) <= 180, `${move}: turn step`);
  }
  for (const move of TRAVELLING_MOVES) assert.ok(MOVES.includes(move), move);
  const require = createRequire(import.meta.url);
  assert.deepEqual(require('../desktop/ai-tool-catalog.cjs').MOVES, MOVES, 'AI clients may call every move');
});

test('motions and camera moves run from u 0 to 1 with finite values and turns under 180° a step', () => {
  for (const name of Object.values(MOTION_GROUPS).flat()) assert.ok(MOTIONS[name], name);
  for (const [name, motion] of [...Object.entries(MOTIONS), ...Object.entries(CAMERA_PRESETS)]) {
    assert.ok(motion.label && motion.seconds > 0 && ['auto', 'linear'].includes(motion.ease), name);
    assert.equal(motion.keys[0].u, 0, name); assert.equal(motion.keys.at(-1).u, 1, name);
    for (let i = 0; i < motion.keys.length; i++) {
      const key = motion.keys[i];
      assert.ok(Object.values(key).every(finite), name);
      if (key.o !== undefined) assert.ok(key.o >= 0 && key.o <= 1, `${name}: opacity`);
      if (i) { assert.ok(key.u > motion.keys[i - 1].u, `${name}: keys in order`); assert.ok(Math.abs((key.r ?? 0) - (motion.keys[i - 1].r ?? 0)) < 180, `${name}: turn step`); }
    }
  }
  assert.ok(Object.keys(CAMERA_CLIPS).includes('shake'));
});

test('every library effect uses registry parameters within range and never shadows a RigStick look', () => {
  assert.ok(Object.keys(VFX_LIBRARY).length >= 70);
  for (const category of VFX_LIBRARY_CATEGORIES) assert.ok(EFFECT_CATEGORIES.includes(category), category);
  assert.deepEqual(PRESET_CATEGORIES, ['Looks'], 'the Effects panel keeps its filter-only presets');
  for (const [name, preset] of Object.entries(VFX_LIBRARY)) {
    assert.equal(VFX_PRESETS[name], undefined, `${name} keeps a name of its own`);
    assert.ok(VFX_LIBRARY_CATEGORIES.includes(preset.category) && preset.about && preset.duration > 0, name);
    for (const [type, params] of preset.effects) {
      const definition = VFX_REGISTRY[type];
      assert.ok(definition, `${name}: effect ${type}`);
      if (preset.target === 'scene') assert.ok(!definition.generator || ['particles', 'beam', 'explosion', 'smoke'].includes(type), `${name}: ${type} works on the scene`);
      for (const [key, value] of Object.entries(params)) {
        const spec = definition.params[key];
        assert.ok(spec, `${name}: ${type}.${key} exists`);
        if (typeof value === 'number' && spec.type !== 'color') assert.ok(value >= spec.min && value <= spec.max, `${name}: ${type}.${key}=${value} in [${spec.min}, ${spec.max}]`);
      }
    }
  }
});

test('every sticker has its art (CC0, with licences) and a landing motion that exists', () => {
  const art = new URL('../src/presets/art/', import.meta.url);
  assert.ok(fs.existsSync(new URL('LICENSE-kenney-particle-pack.txt', art)) && fs.existsSync(new URL('LICENSE-kenney-smoke-particles.txt', art)));
  for (const [name, sticker] of Object.entries(STICKERS)) {
    assert.ok(STICKER_GROUPS.includes(sticker.group) && sticker.label, name);
    for (const file of sticker.files) assert.ok(fs.existsSync(new URL(`${file}.webp`, art)), `${name}: ${file}.webp`);
    if (sticker.files.length > 1) assert.ok(sticker.frameTicks >= 1, `${name}: frames per image`);
    else assert.ok(MOTIONS[sticker.motion], `${name}: motion ${sticker.motion}`);
  }
});

test('text looks build text options; text animations name real motions and effects', () => {
  for (const [name, look] of Object.entries(TEXT_LOOKS)) {
    assert.ok(TEXT_LOOK_GROUPS.includes(look.group), name);
    const options = textOptions(look, {text: 'Hi'});
    assert.ok(options.fontSize > 0 && options.color.every(Number.isInteger), name);
    for (const value of [look.text.color, look.text.gradient, look.text.outlineColor].filter(Boolean)) assert.ok(hex.test(value), `${name}: ${value}`);
    for (const [type, params] of look.effects ?? []) for (const key of Object.keys(params)) assert.ok(VFX_REGISTRY[type]?.params[key], `${name}: ${type}.${key}`);
  }
  for (const [name, animation] of Object.entries(TEXT_ANIMATIONS)) {
    assert.ok(TEXT_ANIMATION_GROUPS.includes(animation.group) && MOTIONS[animation.motion], name);
    if (animation.effect) assert.ok(VFX_PRESETS[animation.effect] ?? VFX_LIBRARY[animation.effect], name);
  }
});

test('the AI catalog names only presets that exist and stays compact per kind', () => {
  const catalog = presetCatalog(), lookup = {objects: OBJECTS, moves: Object.fromEntries(MOVES.map(m => [m, true])), motions: MOTIONS,
    camera: {...CAMERA_PRESETS, ...CAMERA_CLIPS}, effects: {...VFX_PRESETS, ...VFX_LIBRARY}, stickers: STICKERS, textLooks: TEXT_LOOKS, textAnimations: TEXT_ANIMATIONS};
  for (const [kind, groups] of Object.entries(catalog)) {
    for (const name of Object.values(groups).flat()) assert.ok(lookup[kind][name], `${kind}: ${name}`);
    assert.ok(JSON.stringify(groups).length < 2000, `${kind} is a few hundred tokens`);
  }
});
