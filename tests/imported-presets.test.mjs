// Imported presets (src/presets/imported-presets.mjs): what a pack, a folder or loose images hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import {describePresetFiles, PACK_MANIFEST} from '../src/presets/imported-presets.mjs';

const image = path => ({path, blob: new Blob([path], {type: 'image/png'})});

test('a folder of numbered images is one animated preset; other images are stills', async () => {
  const presets = await describePresetFiles([image('slash/frame-10.png'), image('slash/frame-2.png'), image('slash/frame-1.png'),
    image('sfx/boom.png'), image('sfx/baam.png'), image('logo.png')], 'My pack');
  const slash = presets.find(preset => preset.name === 'slash');
  assert.equal(slash.frames.length, 3);
  assert.deepEqual(await Promise.all(slash.frames.map(blob => blob.text())), ['slash/frame-1.png', 'slash/frame-2.png', 'slash/frame-10.png'], 'frames in natural order');
  assert.deepEqual(presets.filter(preset => preset.frames.length === 1).map(preset => preset.name).sort(), ['baam', 'boom', 'logo']);
  assert.ok(presets.every(preset => preset.pack === 'My pack'));
});

test('rigstick-pack.json names the presets, their frames and how they land', async () => {
  const manifest = {format: 'rigstick-pack', version: 1, name: 'Ninja VFX', presets: [
    {name: 'BOOM', frames: ['a.png'], motion: 'pop-in', size: 0.5},
    {name: 'Slash', frames: ['s/0.png', 's/1.png'], frameTicks: 2, motion: 'not-a-motion'}]};
  const files = [{path: PACK_MANIFEST, blob: new Blob([JSON.stringify(manifest)])}, image('a.png'), image('s/0.png'), image('s/1.png')];
  const [boom, slash] = await describePresetFiles(files, 'fallback');
  assert.deepEqual([boom.pack, boom.name, boom.motion, boom.size, boom.frames.length], ['Ninja VFX', 'BOOM', 'pop-in', 0.5, 1]);
  assert.deepEqual([slash.name, slash.frameTicks, slash.motion, slash.frames.length], ['Slash', 2, null, 2]);
});

test('a manifest that names a missing file or is not a pack is refused', async () => {
  const missing = {format: 'rigstick-pack', presets: [{name: 'Gone', frames: ['nope.png']}]};
  await assert.rejects(describePresetFiles([{path: PACK_MANIFEST, blob: new Blob([JSON.stringify(missing)])}], 'x'), /does not contain: nope\.png/);
  await assert.rejects(describePresetFiles([{path: PACK_MANIFEST, blob: new Blob(['{"presets": 5}'])}], 'x'), /not a RigStick preset pack/);
  await assert.rejects(describePresetFiles([{path: PACK_MANIFEST, blob: new Blob(['{oops'])}], 'x'), /not valid JSON/);
});
