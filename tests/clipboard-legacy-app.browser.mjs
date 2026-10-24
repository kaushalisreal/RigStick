/** Visible native frame Copy/Paste, exact history and real PIV/RIGS downloads. */
import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import backend from '../desktop/backend.cjs';
import {runtimeFingerprint} from './helpers/runtime-fingerprint.mjs';
const runtimeBefore=runtimeFingerprint();
const output=path.resolve('artifacts/clipboard-legacy-app');await mkdir(output,{recursive:true});
const service=await backend.startBackend({appRoot:process.cwd()});
const checks=[],errors=[];let browser,page;
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name);};
async function frameMode() {
  await page.evaluate(()=>{rigs.editor.selectFrame(0);rigs.timeline.setMode('frames');rigs.timeline._setSelectedFrames([0],0);});
  await page.locator('.rigs-timeline-scroll').focus();
}
try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage({viewport:{width:1480,height:960},acceptDownloads:true});
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto(service.origin);await page.waitForFunction(()=>window.rigs?.ready);
  for(const [version,file]of [[2,'walking.piv'],[3,'cursor.piv'],[4,'sprite_demo.piv']]) {
    await page.locator('#file-input').setInputFiles(path.resolve('../Pivot Animator v5/Animations/text_bike.piv'));
    await page.waitForFunction(()=>rigs.editor.name==='text_bike');await frameMode();await page.keyboard.press('Control+c');
    await page.waitForFunction(()=>rigs.editor.clipboardFrameCount===1&&!rigs.editor._frameClipboardCopyPromise&&rigs.editor.lastClipboardTimings?.operation==='copy');
    check(`V${version}: visible timeline Copy captures native text with its assets`,await page.evaluate(()=>rigs.editor.clipboardFrameCount===1&&rigs.editor.frameClipboardDocument().figure_types.some(figure=>figure.text_assets?.length)));
    await page.locator('#file-input').setInputFiles(path.resolve(`../Pivot Animator v5/Animations/Legacy/${file}`));
    await page.waitForFunction(name=>rigs.editor.name===name,file.slice(0,-4));await frameMode();
    const before=await page.evaluate(()=>({report:JSON.stringify(rigs.editor.report),version:rigs.editor.report.version,
      frames:rigs.editor.report.keyframes.reduce((n,frame)=>n+(frame.duration_raw>1?2:1),0)+1,
      index:rigs.editor.report.keyframes[0].duration_raw>1?2:1,sha:rigs.editor.report.source_sha256}));
    assert.equal(before.version,version);
    await page.keyboard.press('Control+v');await page.waitForFunction(()=>rigs.editor.report.version===5&&rigs.editor.lastClipboardTimings?.operation==='paste');
    check(`V${version}: visible Paste upgrades in one undo and selects only the pasted key`,await page.evaluate(({frames,index})=>rigs.editor._undo.length===1&&rigs.editor.report.keyframes.length===frames&&JSON.stringify(rigs.timeline.selectedFrameIndices)===JSON.stringify([index]),before));
    const after=await page.evaluate(()=>JSON.stringify(rigs.editor.report));
    await page.keyboard.press('Control+z');
    check(`V${version}: actual Undo restores the exact legacy report`,await page.evaluate(()=>JSON.stringify(rigs.editor.report))===before.report);
    await page.keyboard.press('Control+Shift+z');
    check(`V${version}: actual Redo restores the complete converted paste`,await page.evaluate(()=>JSON.stringify(rigs.editor.report))===after);
    await page.locator('.titlebar [data-action=export]').click();
    const exportDownload=page.waitForEvent('download');await page.locator('[data-action=export-piv]').click();
    const pivPath=path.join(output,`legacy-v${version}-pasted.piv`);await(await exportDownload).saveAs(pivPath);
    const saveDownload=page.waitForEvent('download');await page.locator('.titlebar [data-action=save]').click();
    const rigsPath=path.join(output,`legacy-v${version}-pasted.rigs`);await(await saveDownload).saveAs(rigsPath);
    for(const [kind,filename]of [['piv',pivPath],['rigs',rigsPath]]) {
      const result=await page.evaluate(async({bytes,kind})=>{
        const {ImportClient}=await import('/src/import-client.mjs'),client=new ImportClient();
        try {const{document:r}=await client.importFile(new File([new Uint8Array(bytes)],`paste.${kind}`));return{
          version:r.version,frames:r.keyframes.length,text:r.figure_types.some(f=>f.text_assets?.length),
          sprite:r.figure_types.some(f=>f.image_assets?.length),source:r._rigsSource?.sha256};}
        finally {client.dispose();}
      },{bytes:Array.from(await readFile(filename)),kind});
      check(`V${version}: actual ${kind.toUpperCase()} download reopens with pasted text and preserved assets`,result.version===5&&result.frames===before.frames&&result.text&&(version!==4||result.sprite)&&(kind!=='rigs'||result.source===before.sha));
    }
  }
  await page.screenshot({path:path.join(output,'legacy-sprite-modern-text.png')});
  check('Legacy upgrade application flows have no uncaught page errors',errors.length===0);
  const runtimeAfter=runtimeFingerprint(),runtimeStable=JSON.stringify(runtimeBefore)===JSON.stringify(runtimeAfter);assert.ok(runtimeStable,'Runtime source stayed stable during the workflow');
  await writeFile(path.join(output,'report.json'),JSON.stringify({date:new Date().toISOString(),checks,errors,runtimeBefore,runtimeAfter,runtimeStable,scope:'Actual root WebGPU application: trusted keyboard frame Copy/Paste, V2/V3/V4 destination upgrade, exact Undo/Redo, selected range and real PIV/RIGS download/worker reopen. Source backend freshly launched. Large conversion throughput is not measured.'},null,2));
} catch(error) {
  await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  await writeFile(path.join(output,'report.json'),JSON.stringify({checks,errors,failure:error.stack},null,2));throw error;
} finally {await browser?.close();service.stop();}
