import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const {WhisperService, MODELS, parseWhisperJson, parseProgress, encodeWav, selectAsset, fallbackAsset} = createRequire(import.meta.url)('../desktop/whisper-service.cjs');

const tok = (text, from, to, p = .9) => ({text, offsets: {from, to}, p});
const row = (from, to, text, tokens) => ({offsets: {from, to}, text, tokens});

test('whisper full JSON becomes words and segments in the shared shape', () => {
  const json = {result: {language: 'en'}, transcription: [
    row(0, 2000, ' Hello RigStick.', [tok('[_BEG_]', 0, 0), tok(' Hello', 100, 500, .8), tok(' Rig', 600, 900, .6), tok('St', 900, 1100, .8), tok('ick', 1100, 1500, 1), tok('.', 1500, 1600, .1), tok('[_TT_100]', 2000, 2000)]),
    row(2500, 3500, ' [MUSIC]', [tok(' [MUSIC]', 2500, 3500)]),
    row(4000, 5000, ' Bye now', [tok(' Bye', 4000, 4400), tok(' now', 4400, 5000)]),
  ]};
  const out = parseWhisperJson(json, {model: 'tiny.en', duration: 6});
  assert.deepEqual(out.words.map(w => [w.text, w.start, w.end]), [['Hello', .1, .5], ['RigStick.', .6, 1.6], ['Bye', 4, 4.4], ['now', 4.4, 5]]);
  assert.equal(out.words[1].p, .8, 'sub-word probabilities average; punctuation does not dilute them');
  assert.deepEqual(out.segments, [{start: 0, end: 2, text: 'Hello RigStick.'}, {start: 4, end: 5, text: 'Bye now'}], 'sound tags are dropped');
  assert.deepEqual([out.engine, out.model, out.language, out.duration], ['whisper.cpp', 'tiny.en', 'en', 6]);
});

test('word-per-segment output is regrouped into sentences and pinned words are spread out', () => {
  const words = [['Hi', 0, 300], [' there.', 300, 800], [' Next', 2500, 2500], [' one', 2500, 2900], [' ok', 2900, 3200], [' go', 3200, 3400]];
  const json = {transcription: words.map(([text, a, b]) => row(a, b, text, [tok(text, a, b)]))};
  const out = parseWhisperJson(json, {model: 'base'});
  assert.deepEqual(out.segments.map(s => s.text), ['Hi there.', 'Next one ok go']);
  for (const w of out.words) assert.ok(w.start <= w.end && w.text === w.text.trim() && w.text);
  assert.ok(out.words.every((w, i) => !i || out.words[i - 1].start <= w.start), 'sorted');
  assert.ok(out.words[2].end > out.words[2].start, 'a zero-length word is given a duration');
  assert.equal(out.duration, 3.4);
});

test('an empty transcript is still a valid result', () => {
  const out = parseWhisperJson({transcription: []}, {model: 'tiny'});
  assert.deepEqual([out.words, out.segments, out.language], [[], [], null]);
});

test('stderr progress lines parse to 0..1', () => {
  assert.equal(parseProgress('whisper_print_progress_callback: progress =  45%'), .45);
  assert.equal(parseProgress('whisper_print_progress_callback: progress = 100%'), 1);
  assert.equal(parseProgress('whisper_init_state: kv self size = 5 MB'), null);
});

test('WAV encoding writes a 16 kHz mono 16-bit PCM header', () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2, NaN, .5]));
  assert.equal(wav.length, 44 + 12);
  assert.deepEqual([wav.toString('ascii', 0, 4), wav.toString('ascii', 8, 16), wav.toString('ascii', 36, 40)], ['RIFF', 'WAVEfmt ', 'data']);
  assert.deepEqual([wav.readUInt32LE(4), wav.readUInt16LE(20), wav.readUInt16LE(22), wav.readUInt32LE(24), wav.readUInt32LE(28), wav.readUInt16LE(32), wav.readUInt16LE(34), wav.readUInt32LE(40)], [48, 1, 1, 16000, 32000, 2, 16, 12]);
  assert.deepEqual([...Array(6)].map((_, i) => wav.readInt16LE(44 + i * 2)), [0, 32767, -32768, 32767, 0, 16384], 'clamped, NaN becomes silence');
});

const asset = (name, size = 1) => ({name, size, browser_download_url: `https://example.test/${name}`});
const releases = [
  {tag_name: 'v1.9.5', assets: []},
  {tag_name: 'b5454', assets: [asset('whisper-bin-win-cuda-11.8.0-x64.zip'), asset('whisper-bin-win-cuda-12.4.0-x64.zip'), asset('whisper-bin-win-cuda-13.4-arm64.zip'), asset('whisper-bin-x64.zip'), asset('whisper-bin-Win32.zip'), asset('whisper-blas-bin-x64.zip')]},
  {tag_name: 'b5130', assets: [asset('whisper-cublas-12.4.0-bin-x64.zip'), asset('whisper-bin-x64.zip')]},
];
test('asset selection picks the CPU or CUDA zip from the newest release that has one', () => {
  assert.deepEqual([selectAsset(releases).tag, selectAsset(releases).name, selectAsset(releases).variant], ['b5454', 'whisper-bin-x64.zip', 'cpu']);
  assert.deepEqual([selectAsset(releases, {cuda: true}).name, selectAsset(releases, {cuda: true}).variant], ['whisper-bin-win-cuda-12.4.0-x64.zip', 'cuda']);
  assert.equal(selectAsset(releases, {cuda: true}).url, 'https://example.test/whisper-bin-win-cuda-12.4.0-x64.zip');
  assert.equal(selectAsset([{tag_name: 'v1.9.2', assets: [asset('whisper-cublas-11.8.0-bin-x64.zip'), asset('whisper-cublas-12.4.0-bin-x64.zip'), asset('whisper-bin-x64.zip')]}], {cuda: true}).name, 'whisper-cublas-12.4.0-bin-x64.zip', 'old naming, CUDA 12 preferred');
  assert.equal(selectAsset([{tag_name: 'x', assets: [asset('whisper-bin-x64.zip')]}], {cuda: true}).variant, 'cpu', 'no CUDA build anywhere: CPU');
  assert.equal(selectAsset([{tag_name: 'x', draft: true, assets: [asset('whisper-bin-x64.zip')]}]), null);
  assert.equal(selectAsset({message: 'rate limited'}), null);
  assert.match(fallbackAsset(true).url, /releases\/download\/v1\.9\.2\/whisper-cublas-12\.4\.0-bin-x64\.zip$/);
});

test('status reports unsupported platforms and the model catalogue without touching the network', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ws-test-'));
  try {
    const service = new WhisperService({root, platform: 'linux', arch: 'x64', fetchImpl: () => { throw new Error('network'); }});
    const status = await service.status();
    assert.equal(status.supported, false);
    assert.deepEqual(status.binary, {installed: false, variant: null, version: null});
    assert.deepEqual(status.models.map(m => m.name), MODELS.map(m => m.name));
    assert.ok(status.models.every(m => !m.installed && m.bytes > 0));
    await assert.rejects(service.ensureBinary(), /Windows/);
    await assert.rejects(service.ensureModel('../evil'), /Unknown whisper model/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('model downloads stream to a .part file, verify length and report progress', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ws-test-'));
  try {
    const bytes = Buffer.alloc(300000, 7), seen = [];
    const fetchImpl = async () => new Response(new ReadableStream({start(c) { c.enqueue(bytes.subarray(0, 100000)); c.enqueue(bytes.subarray(100000)); c.close(); }}), {headers: {'content-length': String(bytes.length)}});
    const service = new WhisperService({root, fetchImpl});
    const {path: file} = await service.ensureModel('tiny.en', {onProgress: p => seen.push(p)});
    assert.deepEqual(await readFile(file), bytes);
    assert.deepEqual(seen.at(-1), {phase: 'model', received: bytes.length, total: bytes.length});
    assert.deepEqual(await readdir(path.dirname(file)), ['ggml-tiny.en.bin']);
    assert.equal((await service.status()).models.find(m => m.name === 'tiny.en').bytes, bytes.length);

    const short = new WhisperService({root, fetchImpl: async () => new Response(new ReadableStream({start(c) { c.enqueue(bytes.subarray(0, 10)); c.close(); }}), {headers: {'content-length': '999'}})});
    await assert.rejects(short.ensureModel('base'), /incomplete/);
    assert.deepEqual(await readdir(path.dirname(file)), ['ggml-tiny.en.bin'], 'a failed download leaves no partial file');

    const ctl = new AbortController(); ctl.abort();
    await assert.rejects(short.ensureModel('small', {signal: ctl.signal}), {name: 'AbortError'});
  } finally { await rm(root, {recursive: true, force: true}); }
});
