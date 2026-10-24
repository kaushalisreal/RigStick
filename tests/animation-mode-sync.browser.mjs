import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const check=(label,value)=>{assert.ok(value,label);checks.push(label);console.log('PASS',label);};
const mode=async value=>{
  await page.evaluate(()=>rigs.settingsUI.open('interface'));
  await page.locator(`[data-setting="timelineMode"][value="${value}"]`).check();
  await page.keyboard.press('Escape');
  await page.waitForFunction(value=>rigs.state.settings.timelineMode===value,value);
};
try {
  await page.goto(process.env.RIGS_URL??'http://127.0.0.1:47831');
  await page.waitForFunction(()=>window.rigs?.ready);
  await page.evaluate(async()=>{
    const {emptyDocument,createFrame,createObject}=await import('/src/demo.mjs');
    const report=emptyDocument();report.keyframes=[100,200,300].map(x=>createFrame([createObject(report.figure_types[0],1,x,240)],5));
    rigs.editor.load(report);rigs.editor.selectFrame(2);rigs.editor.select(1);
    rigs.editor.addAnimationKeys([{target:{kind:'figure',uid:1},property:'x',tick:0,value:100},
      {target:{kind:'figure',uid:1},property:'x',tick:10,value:300}]);
    rigs.fit();
  });
  await mode('simple');
  check('Settings mounts Simple using the current Advanced pose',await page.evaluate(()=>rigs.editor.evaluatedFrame.objects[0].root_x===300&&Boolean(document.querySelector('.sheet-filmstrip'))));
  await page.evaluate(async()=>{
    const {beginNativePropertyEdit,previewNativePropertyEdit,commitNativePropertyEdit}=await import('/src/native-property-edit.mjs');
    const token=beginNativePropertyEdit(rigs.editor,'root_x');previewNativePropertyEdit(token,420);commitNativePropertyEdit(token);
  });
  check('Simple writes the pose edit straight into the layer sheet',await page.evaluate(()=>!rigs.editor.frameDraft&&rigs.editor.evaluatedFrame.objects[0].root_x===420&&rigs.editor.animationChannels.length===0));
  await page.locator('.sheet-add-frame').click();
  await mode('advanced');
  check('The filmstrip edit and added key remain in Advanced',await page.evaluate(()=>rigs.editor.evaluatedFrame.objects[0].root_x===420&&!rigs.editor.frameDraft));
  await page.evaluate(()=>rigs.editor.undo());
  check('Advanced undo removes the added key',await page.evaluate(()=>rigs.editor.evaluatedFrame.objects[0].root_x===420));
  await page.evaluate(()=>rigs.editor.redo());
  await mode('simple');
  await page.evaluate(async()=>{
    const {beginNativePropertyEdit,previewNativePropertyEdit,commitNativePropertyEdit}=await import('/src/native-property-edit.mjs');
    const token=beginNativePropertyEdit(rigs.editor,'root_x');previewNativePropertyEdit(token,500);commitNativePropertyEdit(token);
  });
  await mkdir('artifacts/animation-mode-sync',{recursive:true});
  await page.waitForFunction(()=>document.querySelectorAll('.sheet-preview canvas').length>=3);
  await page.screenshot({path:'artifacts/animation-mode-sync/simple.png'});
  await mode('advanced');
  check('Switching back to Advanced preserves the authored pose and sheet',await page.evaluate(async()=>{
    const e=rigs.editor;
    return Boolean(e.report._rigs.layerSheet)&&e.evaluatedFrame.objects[0].root_x===500;
  }));
  await page.evaluate(()=>rigs.editor.seek(rigs.editor.totalTicks-1));
  check('The final playback tick holds the authored pose',await page.evaluate(()=>rigs.editor.evaluatedFrame.objects[0].root_x===500));
  const sheetBefore=await page.evaluate(()=>JSON.stringify(rigs.editor.report._rigs.layerSheet));
  for(let i=0;i<3;i++){await mode('simple');await mode('advanced');}
  check('Repeated mode switches retain the sheet, clear obsolete ranges, and mount one timeline',await page.evaluate(before=>JSON.stringify(rigs.editor.report._rigs.layerSheet)===before&&rigs.state.rangeIndices.length===0&&rigs.state.loopRange===null&&!document.querySelector('.sheet-filmstrip'),sheetBefore));
  await page.screenshot({path:'artifacts/animation-mode-sync/advanced.png'});
  await mode('simple');
  await page.evaluate(()=>{
    rigs.editor.select(rigs.editor.evaluatedFrame.objects[0].unique_id);
    window.modeBefore={timeline:rigs.timeline,revision:rigs.editor.revision};
    rigs.settingsUI.open('interface');
  });
  await page.locator('[data-setting="timelineMode"][value="advanced"]').click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>rigs.state.settings.timelineMode==='advanced');
  check('A mode switch replaces the timeline and keeps the document revision',await page.evaluate(()=>{
    const e=rigs.editor;
    return rigs.state.settings.timelineMode==='advanced'&&rigs.timeline!==modeBefore.timeline&&e.revision===modeBefore.revision;
  }));
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/animation-mode-sync/report.json',JSON.stringify({checks,errors},null,2));
} finally {await browser.close();}
