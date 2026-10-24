// Projects saved before the internal rename to "rigs" keep opening: the old container magic, the old
// `_styk…` document keys and the old .styk/.stykmov extensions are read as their current names.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContainerV1, buildContainerV2, decodeDocument} from '../src/native-container.mjs';
import {currentFormat, upgradeLegacyJson} from '../src/legacy-names.mjs';

const legacyKeys = {format: 'rigstick', _styk: {layers: {order: ['a']}}, figures: [{name: 'Jo', _stykRig: {ik: true}, note: 'styk stays in values'}]};
const legacyMagic = bytes => { const copy = bytes.slice(); copy.set([0x53, 0x54, 0x59, 0x4b], 0); return copy; };   // "STYK"

test('documents with _styk keys are read with _rigs keys', async () => {
  const {document} = await decodeDocument(new TextEncoder().encode(JSON.stringify(legacyKeys)), 'rigs');
  assert.deepEqual(document._rigs, {layers: {order: ['a']}});
  assert.deepEqual(document.figures[0]._rigsRig, {ik: true});
  assert.equal(document._styk, undefined);
  assert.equal(document.figures[0].note, 'styk stays in values');
});

test('containers with the old STYK magic open (version 1 and 2)', async () => {
  const v1 = legacyMagic(await buildContainerV1(new TextEncoder().encode(JSON.stringify(legacyKeys)), 'rigs'));
  assert.equal(new TextDecoder().decode(v1.subarray(0, 4)), 'STYK');
  assert.deepEqual((await decodeDocument(v1, 'rigs')).document._rigs, legacyKeys._styk);
  const v2 = legacyMagic(await buildContainerV2({format: 'rigstick', _rigs: {big: Array.from({length: 64}, (_, i) => i)}}, 'rigs'));
  assert.equal((await decodeDocument(v2, 'rigs')).document._rigs.big.length, 64);
});

test('new containers are written with the RIGS magic', async () => {
  const bytes = await buildContainerV2({format: 'rigstick', _rigs: {}}, 'rigs');
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'RIGS');
});

test('the old magic only stands in for projects', async () => {
  const movieclip = legacyMagic(await buildContainerV1(new TextEncoder().encode('{}'), 'rigsmov'));
  await assert.rejects(decodeDocument(movieclip, 'rigsmov'), /does not match/);
});

test('old extensions map to the current formats', () => {
  assert.equal(currentFormat('styk'), 'rigs');
  assert.equal(currentFormat('STYKMOV'), 'rigsmov');
  assert.equal(currentFormat('stkz'), 'stkz');
  assert.equal(upgradeLegacyJson('{"a":1}'), '{"a":1}');
});
