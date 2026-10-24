// The export dialog's "Save to" folder (desktop/export-folder.cjs): remembered, and never overwrites a file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const {ExportFolder} = createRequire(import.meta.url)('../desktop/export-folder.cjs');

test('no folder means ask each time; a chosen folder is remembered', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'rigs-export-folder-'));
  try {
    const store = new ExportFolder(userData, {defaultFolder: '/videos/RigStick'});
    assert.deepEqual(await store.get(), {folder: null, defaultFolder: '/videos/RigStick'});
    assert.equal(await store.destination('Clip.mp4'), null);
    const folder = path.join(userData, 'Exports');
    await store.set(folder);
    assert.equal((await new ExportFolder(userData).get()).folder, folder);
    await store.set(null);
    assert.equal((await store.get()).folder, null);
    await assert.rejects(store.set('relative/path'), /absolute/);
  } finally { await rm(userData, {recursive: true, force: true}); }
});

test('exports get a fresh name in the folder instead of replacing a file', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'rigs-export-folder-'));
  try {
    const store = new ExportFolder(userData), folder = path.join(userData, 'Out');
    await store.set(folder);
    assert.equal(await store.destination('Duel.mp4'), path.join(folder, 'Duel.mp4'));
    await writeFile(path.join(folder, 'Duel.mp4'), 'x');
    assert.equal(await store.destination('Duel.mp4'), path.join(folder, 'Duel (2).mp4'));
    await writeFile(path.join(folder, 'Duel (2).mp4'), 'x');
    assert.equal(await store.destination('Duel.mp4'), path.join(folder, 'Duel (3).mp4'));
    assert.equal(path.dirname(await store.destination('../../escape.gif')), folder);
    assert.equal(path.basename(await store.destination('a:b*c.png')), 'a_b_c.png');
  } finally { await rm(userData, {recursive: true, force: true}); }
});
