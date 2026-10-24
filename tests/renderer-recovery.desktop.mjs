import {_electron as electron} from './support/playwright.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
const root=path.resolve('.'),output=path.join(root,'artifacts/renderer-recovery-desktop');
await mkdir(output,{recursive:true});
const env={...process.env,RIGS_USER_DATA_DIR:path.join(output,`profile-${Date.now()}`)};
await mkdir(env.RIGS_USER_DATA_DIR,{recursive:true});
await writeFile(path.join(env.RIGS_USER_DATA_DIR,'telemetry-state.json'),JSON.stringify({decided:true,consent:{analytics:false,diagnostics:false,policyVersion:'2026-09-10',updatedAt:Date.now()}}));
delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[root],cwd:root,timeout:45000,env}),results=[];
try {
  const page=await app.firstWindow(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>window.rigs?.ready,undefined,{timeout:30000});
  await page.evaluate(()=>{
    const e=rigs.editor;e.select(e.frame.objects[0].unique_id);e.updateObject({root_x:e.object.root_x+10});
    window.recoveryProbe={report:e.report,revision:e.revision,history:e.historySize,root:e.object.root_x};
    e.markSaved();
  });
  for(let loss=1;loss<=3;loss++){
    await page.evaluate(()=>{recoveryProbe.old=rigs.state.renderer;recoveryProbe.started=performance.now();recoveryProbe.old.device.destroy();});
    await page.waitForFunction(()=>rigs.state.renderer!==recoveryProbe.old&&document.querySelector('#renderer-error').hidden&&!rigs.state.dirtyRender,undefined,{timeout:20000});
    const result=await page.evaluate(()=>({elapsedMs:performance.now()-recoveryProbe.started,backend:rigs.state.renderer.stats.backend,
      sameDocument:rigs.editor.report===recoveryProbe.report,sameRevision:rigs.editor.revision===recoveryProbe.revision,sameHistory:rigs.editor.historySize===recoveryProbe.history}));
    results.push({loss,...result});
    assert.equal(result.backend,loss<3?'WebGPU':'Canvas 2D fallback');
    assert.ok(result.sameDocument&&result.sameRevision&&result.sameHistory);
    if(loss===3)assert.ok(result.elapsedMs<5000,'Exhausted retries must not wait 15 seconds before software fallback');
  }
  assert.equal(await page.evaluate(()=>{const e=rigs.editor;e.undo();const changed=e.object.root_x!==recoveryProbe.root;e.redo();e.markSaved();return changed&&e.object.root_x===recoveryProbe.root;}),true);
  await page.waitForFunction(()=>!rigs.state.dirtyRender&&!rigs.state.editablePreparing);
  await page.evaluate(()=>{for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();});
  await page.screenshot({path:path.join(output,'fallback.png')});
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally {await app.close();}
