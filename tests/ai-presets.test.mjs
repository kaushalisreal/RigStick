/**
 * RigStick's preset library (src/ai/presets.mjs): the catalogue an AI reads, and the props it builds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PROPS, catalog, TEXT_STYLES, BACKGROUNDS} from '../src/ai/presets.mjs';
import {MOVES} from '../src/ai/moves.mjs';

test('the catalogue lists every preset by name and stays small', () => {
  const menu = catalog(['Power up', 'Impact']);
  assert.deepEqual(menu.moves, MOVES);
  assert.deepEqual(Object.keys(menu.props), Object.keys(PROPS));
  assert.deepEqual(menu.textStyles, Object.keys(TEXT_STYLES));
  assert.deepEqual(menu.backgrounds, Object.keys(BACKGROUNDS));
  assert.deepEqual(menu.vfx.looks, ['Power up', 'Impact']);
  assert.ok(JSON.stringify(menu).length < 2500, 'the whole menu is a few hundred tokens');
});

test('every prop is drawable: paths have two or more points, circles a radius, windows points', () => {
  for (const [name, prop] of Object.entries(PROPS)) {
    const parts = prop.make ? prop.make({depth: 'mid', seed: 4}) : prop.parts;
    assert.ok(parts.length > 0, name);
    for (const part of parts) {
      if (part.circle) assert.ok(part.circle[2] > 0, name);
      else if (part.windows) assert.ok(part.windows.length > 0, name);
      else assert.ok(part.path.length >= 2 && part.path.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), name);
    }
  }
});

test('a skyline is deterministic per seed, fills its width, and its layers differ', () => {
  const a = PROPS.skyline.make({depth: 'near', seed: 9, width: 3000}), b = PROPS.skyline.make({depth: 'near', seed: 9, width: 3000});
  assert.deepEqual(a, b);
  const right = Math.max(...a.filter(part => part.path).flatMap(part => part.path.map(([x]) => x)));
  assert.ok(right >= 2900, 'buildings run to the requested width');
  assert.notDeepEqual(PROPS.skyline.make({depth: 'far', seed: 9}), PROPS.skyline.make({depth: 'near', seed: 9}));
});
