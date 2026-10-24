import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/playback-background-fix');
await mkdir(output, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const errors = [], runs = [];
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 850}});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.RIGS_URL || 'http://127.0.0.1:47831');
  await page.waitForFunction(() => window.rigs?.ready);
  await page.evaluate(async () => {
    const {emptyDocument, createFrame, createObject} = await import('/src/demo.mjs');
    const {createRenderer} = await import('/src/renderer.mjs');
    const {evaluatedFrame} = await import('/src/pivot/geometry.mjs');
    const report = emptyDocument(); report.fps = 8; report.canvas_width = 320; report.canvas_height = 240;
    report.backgrounds = [{background_id: 1, kind: 2, color: 0xff80c6f0,
      paint: {type: 'linear', angle: 25, stops: [{offset: 0, color: [128, 198, 240], opacity: 1}, {offset: 1, color: [80, 110, 180], opacity: 1}]}}];
    report.keyframes = Array.from({length: 12}, (_, tick) => {
      const frame = createFrame([createObject(report.figure_types[0], 1, 120 + tick * 4, 160, {scale: .6})]);
      frame.background_id = 1;
      if (tick >= 4 && tick < 8) frame.camera = {x: 10, y: 15, scale: .8, angle_rad: .1};
      return frame;
    });
    rigs.editor.markSaved();
    await rigs.acceptImport({document: report, kind: 'piv'}, 'Playback background regression.piv');
    rigs.editor.seek(0);
    const renderer = rigs.state.renderer;
    if (!renderer.device) throw new Error('This regression requires WebGPU.');
    const gpuErrors = [], samples = [];
    renderer.device.addEventListener('uncapturederror', event => gpuErrors.push(event.error.message));
    const reference = await createRenderer(document.createElement('canvas'), {resources: renderer.resources});
    reference.resize(renderer.width, renderer.height, renderer.dpr);
    const renderPrepared = renderer.renderPrepared.bind(renderer);
    renderer.renderPrepared = (key, options) => {
      const rendered = renderPrepared(key, options);
      if (rigs.state.playing && rendered) {
        const actual = renderer.canvas.toDataURL();
        reference.render({report: rigs.editor.report, frame: evaluatedFrame(rigs.editor.report, rigs.editor.tick), view: rigs.state.view, cameraEnabled: true});
        samples.push({tick: rigs.editor.tick, matches: actual === reference.canvas.toDataURL(), key});
      }
      return rendered;
    };
    window.backgroundProbe = {gpuErrors, samples, reference};
  });
  for (const start of [0, 2, 0]) {
    await page.waitForFunction(() => !rigs.state.editablePreparing);
    const from = await page.evaluate(start => {
      rigs.editor.seek(start); return backgroundProbe.samples.length;
    }, start);
    await page.locator('#play-button').click();
    await page.waitForFunction(from => backgroundProbe.samples.length >= from + 14, from);
    await page.screenshot({path: path.join(output, `app-playing-${runs.length}.png`)});
    await page.locator('#play-button').click();
    await page.waitForFunction(() => !rigs.state.playing && !rigs.state.editablePreparing);
    const run = await page.evaluate(from => {
      const samples = backgroundProbe.samples.slice(from);
      return {samples, gpuErrors: [...backgroundProbe.gpuErrors], preparedCache: {...rigs.state.renderer.preparedFrames.stats}};
    }, from);
    assert.deepEqual(run.gpuErrors, []);
    assert.ok(run.samples.every(sample => sample.matches), 'Actual playback pixels differ from independent rendering.');
    runs.push(run);
  }
  await page.evaluate(() => backgroundProbe.reference.destroy());
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'app.json'), JSON.stringify({runs, errors}, null, 2));
  console.log(JSON.stringify({runs: runs.map(run => ({frames: run.samples.length, differingFrames: run.samples.filter(sample => !sample.matches).length,
    textureUploads: run.preparedCache.textureUploads, gpuErrors: run.gpuErrors})), errors}, null, 2));
} finally {await browser.close();}
