import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {normalizeEditorSettings} from '../src/settings.mjs';

assert.equal(normalizeEditorSettings().fitViewOnPlayback, true);
assert.equal(normalizeEditorSettings({fitViewOnPlayback:'false'}).fitViewOnPlayback, true);
const browser = await chromium.launch({channel:'chrome', headless:true});
const page = await browser.newPage({viewport:{width:1280,height:900}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const customView = {scale:1.7, x:123, y:-87};
const view = () => page.evaluate(() => ({...rigs.state.view}));
const start = () => page.evaluate(custom => {
  rigs.state.view = {...custom};
  rigs.actions.play();
  return rigs.state.playing;
}, customView);
const stop = () => page.evaluate(() => { if (rigs.state.playing) rigs.actions.play(); });
try {
  await page.goto(process.env.RIGS_URL || 'http://127.0.0.1:47831');
  await page.waitForFunction(() => window.rigs?.ready);
  const fitted = await page.evaluate(() => { rigs.fit(); return {...rigs.state.view}; });
  assert.equal(await start(), true);
  assert.deepEqual(await view(), fitted);
  await stop();
  await page.evaluate(() => rigs.settingsUI.open('animation'));
  const checkbox = page.getByRole('checkbox', {name:'Fit view when playback starts', exact:true});
  assert.equal(await checkbox.isChecked(), true);
  await checkbox.uncheck();
  await mkdir('artifacts', {recursive:true});
  await page.screenshot({path:'artifacts/playback-view-settings.png'});
  await page.evaluate(async () => { rigs.settingsUI.close(); await rigs.settingsUI.flush(); });
  assert.equal(await start(), true);
  assert.deepEqual(await view(), customView);
  await stop();
  assert.deepEqual(await view(), customView);
  await page.reload();
  await page.waitForFunction(() => window.rigs?.ready);
  assert.equal(await page.evaluate(() => rigs.state.settings.fitViewOnPlayback), false);
  assert.equal(await start(), true);
  assert.deepEqual(await view(), customView);
  await stop();
  await page.evaluate(() => rigs.settingsUI.open('animation'));
  assert.equal(await checkbox.isChecked(), false);
  await checkbox.check();
  await page.evaluate(() => rigs.settingsUI.close());
  assert.equal(await start(), true);
  assert.deepEqual(await view(), fitted);
  await stop();
  assert.deepEqual(errors, []);
  console.log('PASS: default fit, disabled zoom/pan preservation, pause, reload persistence, re-enabled fit, and no page errors');
} finally {
  await browser.close();
}
