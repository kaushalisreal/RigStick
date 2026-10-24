import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { builtinRecord, writePresetFile, readPresetFile, registerRecord, unregisterRecord, recordMotion, zipStore, extensionFor, presetFileName, SET_KINDS, OBJECT_KINDS } from '../src/presets/preset-files.mjs';
import { unpackZip } from '../src/sticknodes/decoder/archive.mjs';
import { MOTIONS } from '../src/presets/motions.mjs';
import { STICKERS } from '../src/presets/stickers.mjs';
import { OBJECTS } from '../src/presets/objects.mjs';
import { VFX_LIBRARY } from '../src/presets/vfx-library.mjs';
import { TEXT_LOOKS, TEXT_ANIMATIONS } from '../src/presets/text-presets.mjs';
import { buildMove, MOVE_LABELS } from '../src/ai/moves.mjs';

const fetchBlob = async url => new Blob([await readFile(fileURLToPath(url))], {type: 'image/webp'});

test('stored ZIPs read back byte for byte', async () => {
  const files = [{name: 'a.txt', bytes: new TextEncoder().encode('hello')}, {name: 'dir/b.bin', bytes: Uint8Array.from([0, 1, 2, 255])}];
  const out = await unpackZip(zipStore(files));
  assert.deepEqual(out.map(item => item.name), ['a.txt', 'dir/b.bin']);
  assert.deepEqual([...out[1].bytes], [0, 1, 2, 255]);
});

test('kinds map to .rigset and .rigobject', () => {
  for (const kind of SET_KINDS) assert.equal(extensionFor(kind), '.rigset');
  for (const kind of OBJECT_KINDS) assert.equal(extensionFor(kind), '.rigobject');
  assert.equal(presetFileName('Pop: in?', 'motion'), 'Pop- in-.rigset');
});

test('every kind of built-in preset round-trips through a file and registers under a new name', async () => {
  const cases = [['motion', 'pop-in', MOTIONS], ['move', 'wave', MOVE_LABELS], ['effect', 'Afterimages', VFX_LIBRARY], ['textLook', 'comic', TEXT_LOOKS],
    ['textAnimation', 'typewriter', TEXT_ANIMATIONS], ['object', 'katana', OBJECTS], ['sticker', 'explosion', STICKERS]];
  for (const [kind, id, registry] of cases) {
    const record = await builtinRecord(kind, id, {fetchBlob});
    const [back] = await readPresetFile(await writePresetFile(record), `${id}${extensionFor(kind)}`);
    assert.equal(back.kind, kind); assert.equal(back.name, record.name);
    assert.deepEqual(back.data, record.data);
    if (kind === 'sticker') assert.equal(back.frames.length, record.frames.length);
    const key = `copy-of-${id}`;
    assert.deepEqual(registerRecord(back, {key}), {kind, key});
    assert.ok(registry[key], `${kind} ${key} registered`);
    // A second load of the same key keeps the first.
    assert.equal(registerRecord(back, {key}), null);
    if (kind === 'move') assert.ok(buildMove(key, {intensity: 1.2}).keys.length > 1);
    unregisterRecord(kind, key);
  }
  assert.equal(STICKERS['copy-of-explosion'], undefined);
});

test('a file holds either .rigset or .rigobject kinds', async () => {
  const motion = await builtinRecord('motion', 'fade-in'), look = await builtinRecord('textLook', 'title');
  await assert.rejects(writePresetFile([motion, look]), /either animation presets/);
  const pack = await readPresetFile(await writePresetFile([motion, await builtinRecord('motion', 'bounce')]));
  assert.deepEqual(pack.map(record => record.id), ['fade-in', 'bounce']);
});

test('bad files say what is wrong', async () => {
  await assert.rejects(readPresetFile(new TextEncoder().encode('not a zip'), 'x.rigset'), /not a RigStick preset file/);
  const other = zipStore([{name: 'preset.json', bytes: new TextEncoder().encode('{"format":"something"}')}]);
  await assert.rejects(readPresetFile(other, 'y.rigset'), /not a RigStick preset file/);
});

test('a motion recorded from keys is relative to its first key', () => {
  const at = {0: {x: 100, y: 50, rotation: 0, scale: 1, opacity: 1}, 12: {x: 160, y: 50, rotation: 90, scale: 2, opacity: 0.5}};
  const record = recordMotion({name: 'My slide', from: 0, to: 12, fps: 24, ticks: [0, 12], sample: tick => at[tick]});
  assert.equal(record.data.seconds, 0.5);
  assert.deepEqual(record.data.keys, [{u: 0, o: 1}, {u: 1, dx: 60, r: 90, s: 2, o: 0.5}]);
});
