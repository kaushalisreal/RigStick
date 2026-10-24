import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentsFromWords, splitAtSilence, wordsFromChunks} from '../src/transcribe/transformers-worker.mjs';
import {wavBytes} from '../src/transcribe/audio-pcm.mjs';
import {TransformersEngine} from '../src/transcribe/transformers-engine.mjs';
import {webStats} from '../src/transcribe/web-stats.mjs';

test('word chunks are trimmed, shifted and made well formed', () => {
  const words = wordsFromChunks([{text: ' Hi', timestamp: [0.2, 0.5]}, {text: ' ', timestamp: [0.5, 0.6]}, {text: ' [MUSIC]', timestamp: [0.6, 1]}, {text: ' there.', timestamp: [0.5, null]}, {text: ' odd', timestamp: [2, 1.5]}], 10);
  assert.deepEqual(words, [{start: 10.2, end: 10.5, text: 'Hi'}, {start: 10.5, end: 10.5, text: 'there.'}, {start: 12, end: 12, text: 'odd'}]);
});

test('sentences break at punctuation, long pauses and 40 words', () => {
  const w = (text, start, end) => ({text, start, end});
  assert.deepEqual(segmentsFromWords([w('Hello', 0, .4), w('there.', .4, .8), w('Next', 1, 1.4), w('one', 3, 3.4)]).map(s => s.text), ['Hello there.', 'Next', 'one']);
  assert.equal(segmentsFromWords(Array.from({length: 90}, (_, i) => w('x', i, i + .5))).length, 3);
});

test('audio is split near a minute at the quietest point, never inside speech', () => {
  const rate = 16000, pcm = new Float32Array(rate * 140).fill(.5);
  pcm.fill(0, rate * 57, rate * 58); // the only silence within reach of the 60 s target
  const pieces = splitAtSilence(pcm);
  assert.equal(pieces.length, 2);
  assert.ok(pieces[0][1] >= rate * 57 && pieces[0][1] <= rate * 58, 'cut lands in the silence');
  assert.deepEqual([pieces[0][0], pieces.at(-1)[1]], [0, pcm.length]);
  assert.deepEqual(splitAtSilence(new Float32Array(rate * 80)), [[0, rate * 80]], 'short audio is one piece');
});

test('wavBytes writes a mono 16-bit header', () => {
  const wav = wavBytes(new Float32Array([0, 1, -1]), 16000), view = new DataView(wav.buffer);
  assert.equal(wav.length, 50);
  assert.deepEqual([view.getUint32(24, true), view.getUint16(22, true), view.getUint16(34, true), view.getUint32(40, true)], [16000, 1, 16, 6]);
  assert.deepEqual([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)], [0, 32767, -32768]);
});

test('the engine lists its models and web stats never throw outside a browser', async () => {
  assert.ok(TransformersEngine.models().every(m => /_timestamped$/.test(m.id) && m.approxMB > 0));
  assert.ok(TransformersEngine.models({webgpu: true})[0].approxMB > TransformersEngine.models()[0].approxMB);
  const stats = await webStats();
  assert.deepEqual(Object.keys(stats), ['cpu', 'memory', 'gpus', 'process']);
});
