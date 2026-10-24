import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

const out = 'artifacts/layer-focus'; await mkdir(out, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.setDefaultTimeout(15000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS', name); };
const point = (uid, part = 'root') => page.evaluate(({uid, part}) => {
  const geometry = [...rigs.editor.geometry.objects.values()].find(entry => entry.obj.unique_id === uid);
  const target = part === 'root' ? geometry.root : geometry.segments[0].end;
  return __focusScreen(target);
}, {uid, part});
const clickFigure = async uid => { const p = await point(uid); await page.mouse.click(p.x, p.y); await settle(); };

try {
  await page.goto(process.env.RIGS_URL || 'http://127.0.0.1:47831'); await page.waitForFunction(() => window.rigs?.ready);
  await page.evaluate(async () => {
    const {emptyDocument, createFrame, createObject} = await import('/src/demo.mjs');
    const {worldToScreen} = await import('/src/renderer.mjs');
    const report = emptyDocument(), figure = report.figure_types[0];
    figure.segments = [{...figure.segments[0], segment_id: 1, parent_id: 0, length: 80, angle_rad: -Math.PI / 2}]; figure.segment_count = 1;
    report.keyframes = [createFrame([createObject(figure, 1, 180, 280), createObject(figure, 2, 450, 280), createObject(figure, 3, 750, 280)], 10)];
    rigs.settingsUI.commit({timelineMode: 'advanced'});
    rigs.editor.load(report, 'Layer focus');
    rigs.editor.createLayer('Hands'); rigs.editor.createLayer('Reference');
    rigs.editor.assignFiguresToLayer([2], 'layer-2'); rigs.editor.assignFiguresToLayer([3], 'layer-3');
    rigs.editor.setLayerLocked('layer-2', true); rigs.editor.select(1); rigs.editor.markSaved();
    rigs.state.handles = true; rigs.state.hidden.clear(); rigs.state.locked.clear();
    rigs.state.settings.showUnselectedHandles = true; rigs.fit();
    globalThis.__focusScreen = position => {
      const projected = worldToScreen(position, {report: rigs.editor.report, frame: rigs.editor.evaluatedFrame, view: rigs.state.view});
      const box = document.querySelector('#viewport').getBoundingClientRect();
      return {x: box.left + projected.x, y: box.top + projected.y};
    };
  });
  await page.keyboard.press('v'); await settle();
  await page.evaluate(() => rigs.timeline.focusSelectedLayers({ids: ['layer-1', 'layer-2']})); await settle();
  await clickFigure(3);
  check('ordinary focus survives a real click on reference artwork', await page.evaluate(() => rigs.editor.selectedUid === 3 && rigs.editor.getLayerFocus().ids.has('layer-1') && rigs.timeline.tracks.filter(row => row.kind === 'layer').length === 2));

  await page.evaluate(() => { rigs.editor.select(1); rigs.timeline.focusSelectedLayers({ids: ['layer-1', 'layer-2'], lock: true}); }); await settle();
  const before = await page.evaluate(() => ({document: JSON.stringify(rigs.editor.serialize()), revision: rigs.editor.revision, history: rigs.editor._undo.length}));
  const p = await point(3); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 24, p.y + 12, {steps: 6}); await page.mouse.up(); await settle();
  check('off-focus handles and artwork cannot start a pose drag', await page.evaluate(before => !rigs.editor.selectedUids.has(3) && JSON.stringify(rigs.editor.serialize()) === before.document && rigs.editor.revision === before.revision && rigs.editor._undo.length === before.history, before));
  await page.screenshot({path: `${out}/focus-and-lock.png`});
  check('reference artwork remains visible while focused locks are temporary', await page.evaluate(() => rigs.editor.evaluatedFrame.objects.length === 3 && rigs.editor.getLayer('layer-3').visible && rigs.editor.getLayer('layer-3').focusLocked && !rigs.editor.getLayer('layer-3').savedLocked));

  await clickFigure(1); const q = await point(1); await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x + 30, q.y, {steps: 6}); await page.mouse.up(); await settle();
  check('focused artwork still edits through the normal pointer gesture', await page.evaluate(history => rigs.editor.selectionFrame.objects.find(object => object.unique_id === 1).root_x > 180 && rigs.editor._undo.length > history, before.history));

  await page.getByRole('button', {name: 'Show all layers', exact: true}).click(); await settle();
  check('Show all restores saved locks and releases the reference layer', await page.evaluate(() => !rigs.editor.getLayerFocus() && rigs.editor.getLayer('layer-2').locked && !rigs.editor.getLayer('layer-3').locked));
  await clickFigure(3); check('reference artwork is selectable after Show all', await page.evaluate(() => rigs.editor.selectedUid === 3));

  for (const lock of [false, true]) {
    await page.evaluate(lock => {
      rigs.timeline.focusSelectedLayers({ids: ['layer-1'], lock});
      const layer = rigs.timeline.newLayer('drawing');
      globalThis.__focusCreatedLayer = layer.id;
    }, lock); await settle();
    check(`timeline drawing creation joins ${lock ? 'Focus and lock' : 'view-only focus'} and remains editable`, await page.evaluate(() => {
      const layer = rigs.editor.getLayer(__focusCreatedLayer);
      return layer.drawing && !layer.locked && !layer.savedLocked && rigs.editor.activeLayerId === layer.id &&
        rigs.editor.getLayerFocus().ids.has(layer.id) && rigs.timeline.tracks.some(row => row.id === layer.id) &&
        rigs.editor.report._rigs.layerSheet.tracks[layer.id].keys.length === 1;
    }));
    await page.keyboard.press('Escape');
  }

  // Every existing drawing is outside the locked focus, so the first paint
  // gesture must create an editable drawing layer rather than reusing one.
  await page.evaluate(() => { rigs.timeline.focusSelectedLayers({ids: ['layer-1'], lock: true}); rigs.editor.selectSheetLayer('layer-1'); });
  const history = await page.evaluate(() => rigs.editor._undo.length);
  await page.locator('[data-workspace-mode="draw"]').click();
  const box = await page.locator('#viewport').boundingBox(), x = box.x + box.width * .4, y = box.y + box.height * .45;
  await page.mouse.move(x, y); await page.mouse.down(); await page.waitForFunction(() => Boolean(rigs.drawing.gesture));
  await page.mouse.move(x + 90, y + 35, {steps: 10}); await page.mouse.up(); await page.waitForFunction(() => !rigs.drawing.gesture);
  await page.evaluate(() => rigs.drawing.barrier()); await settle();
  check('a real first Draw stroke creates focused ink while reference layers remain locked', await page.evaluate(history => {
    const target = rigs.editor.drawingTarget(), layer = rigs.editor.getLayer(target.id), surface = rigs.drawing.owner.entry(target.figure);
    return Boolean(surface?.store?.bounds?.width) && !layer.locked && rigs.editor.getLayerFocus().ids.has(layer.id) &&
      rigs.timeline.tracks.some(row => row.id === layer.id) && rigs.editor.getLayer('layer-3').focusLocked &&
      !rigs.editor.getLayer('layer-3').savedLocked && rigs.editor._undo.length > history;
  }, history));
  await page.screenshot({path: `${out}/focus-first-drawing.png`});
  await page.getByRole('button', {name: 'Animate', exact: true}).click(); await settle();

  await page.evaluate(() => rigs.timeline.focusSelectedLayers({ids: ['layer-1'], lock: true}));
  await page.locator('[data-timeline-mode="simple"]').click(); await settle();
  check('timeline disposal clears temporary focus and preserves saved locks', await page.evaluate(() => !rigs.editor.getLayerFocus() && rigs.editor.getLayer('layer-2').locked && !rigs.editor.getLayer('layer-3').locked));
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({errors, checks}, null, 2));
  console.log(`PASS layer focus browser (${checks.length} checks)`);
} finally { await browser.close(); }
