/** Draw exit must settle before Build binds a figure or chooses its tool. */
import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem('rigstick.editor.settings.v1', JSON.stringify({rendererMode: 'canvas', locale: 'en'})));
const mode = async name => {
  await page.locator(`.workspace-switch [data-workspace-mode="${name}"]`).click();
  await page.waitForFunction(name => document.querySelector('.workspace').dataset.mode === name, name);
};
async function drawSegment(x, y, dx = 65, dy = 30) {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, {steps: 5}); await page.mouse.up();
}
try {
  await page.goto(process.env.RIGS_URL || 'http://127.0.0.1:47911');
  await page.waitForFunction(() => window.rigs?.ready);
  // This flow authors a new figure. Draw restores the selection it was entered
  // with, so explicitly deselect the starter instead of binding it on return.
  await page.evaluate(() => rigs.editor.select(null));
  await mode('draw');
  await page.locator('#open-insert').click();
  const viewport = await page.locator('#viewport').boundingBox();
  const x = viewport.x + viewport.width * .5, y = viewport.y + viewport.height * .5;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.waitForFunction(() => Boolean(rigs.drawing.gesture));
  await page.mouse.move(x + 90, y + 40, {steps: 8}); await page.mouse.up();
  await page.evaluate(() => rigs.drawing.barrier());
  await page.locator('[data-tool="drawing-transform"]').click();
  await page.evaluate(() => {
    window.drawingLayer = rigs.editor.activeLayerId;
    window.drawingBefore = JSON.stringify(rigs.editor.drawingTarget().figure);
  });
  await mode('rig');
  assert.deepEqual(await page.evaluate(() => ({active: rigs.drawing.active, tool: rigs.state.tool,
    bound: rigs.builder.session.typeId, drawingLayer: Boolean(rigs.editor.getLayer(rigs.editor.activeLayerId).drawing)})),
  {active: false, tool: 'line', bound: null, drawingLayer: false});
  let box = await page.locator('#viewport').boundingBox();
  const start = {x: box.x + box.width * .45, y: box.y + box.height * .5};
  await drawSegment(start.x, start.y);
  await page.waitForFunction(() => rigs.editor.figure?.segments.length === 1);
  await drawSegment(start.x + 65, start.y + 30, 50, -35);
  await page.waitForFunction(() => rigs.editor.figure?.segments.length === 2);
  assert.equal(await page.evaluate(() => JSON.stringify(rigs.editor.drawingTarget(drawingLayer).figure) === drawingBefore), true);
  await page.evaluate(() => rigs.editor.undo());
  assert.equal(await page.evaluate(() => rigs.editor.figure.segments.length), 1);
  await page.evaluate(() => rigs.editor.redo());
  assert.equal(await page.evaluate(() => rigs.editor.figure.segments.length), 2);
  await page.locator('#builder-done').click(); await page.locator('#builder-exit-import').click();
  console.log('PASS Draw cel stays unchanged; Build selects a figure layer, draws and extends segments, undoes and redoes');

  for (const latest of ['rig', 'draw', 'animate']) {
    await page.evaluate(() => rigs.editor.select(null));
    await mode('draw');
    await page.evaluate(() => {
      const original = rigs.drawing.settle.bind(rigs.drawing);
      const gate = new Promise(resolve => { window.releaseDrawExit = resolve; });
      rigs.drawing.settle = options => {
        rigs.drawing.settle = original;
        return Promise.resolve(original(options)).then(() => gate);
      };
    });
    await page.locator('.workspace-switch [data-workspace-mode="rig"]').click();
    assert.equal(await page.evaluate(() => rigs.builder.active), false, 'Build waits for Draw');
    if (latest !== 'rig') await page.locator(`.workspace-switch [data-workspace-mode="${latest}"]`).click();
    await page.evaluate(() => releaseDrawExit());
    await page.waitForFunction(name => document.querySelector('.workspace').dataset.mode === name, latest);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => rigs.builder.active), latest === 'rig');
    if (latest === 'rig') {
      assert.equal(await page.evaluate(() => rigs.state.tool), 'line');
      await page.locator('#builder-done').click();
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS Pending drawing operations finish before Build; rapid workspace changes keep the latest choice');
} finally { await browser.close(); }
