import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';
// An import that does not open (docs/PROJECT-TABS.md: a file opens in a tab of its own, so nothing is
// replaced and nothing asks; the one refusal left is the limit of open projects) keeps every open project
// as it was and is recorded as exactly one cancellation.
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();await page.goto(process.env.RIGS_URL||'http://127.0.0.1:47843');await page.waitForFunction(()=>window.rigs?.ready);
  await page.evaluate(async()=>{
    const {emptyDocument}=await import('/src/demo.mjs'),{buildContainerV2}=await import('/src/native-container.mjs');
    const source=emptyDocument();source._rigs={...source._rigs,format:'RigStick',format_version:1};
    window.projectBytes=await buildContainerV2(source,'rigs');rigs.telemetry.configure({analytics:true,diagnostics:true});
    rigs.editor.updateProject({fps:31});
    // An untouched new animation gives its place to the next project, so each one is edited before the next opens.
    for(let guard=0;!rigs.projects.tabs.full&&guard<20;guard++){await rigs.actions.new();rigs.editor.updateProject({fps:20+guard});rigs.editor.markSaved();}
    rigs.editor.updateProject({fps:27});window.beforeImport=rigs.editor.report;
    window.open=rigs.projects.tabs.items.map(item=>item.id).join();
    window.cancelledImport=rigs.importFiles([new File([window.projectBytes],'refused.rigs')]);
  });
  const result=await page.evaluate(async()=>({result:await window.cancelledImport,sameDocument:rigs.editor.report===window.beforeImport,dirty:rigs.editor.dirty,
    sameProjects:rigs.projects.tabs.items.map(item=>item.id).join()===window.open,importing:rigs.state.importing,
    counters:rigs.telemetry.data.counters,outcomes:rigs.telemetry.data.operationContexts.filter(r=>r.operation==='import'&&r.stage==='complete').map(r=>r.outcome)}));
  assert.equal(result.result,false);assert.ok(result.sameDocument&&result.dirty&&result.sameProjects);assert.equal(result.importing,false);
  assert.equal(result.counters.import_started,1);assert.equal(result.counters.import_cancelled,1);assert.equal(result.counters.import_succeeded,undefined);assert.equal(result.counters.import_failed,undefined);assert.deepEqual(result.outcomes,['cancelled']);
  assert.match(await page.locator('#toast').innerText(),/Close a project/);
  console.log('A refused native import preserves every open project and records exactly one cancellation.');
  // Once a project closes, the same file opens beside the others and the edited project keeps its changes.
  const opened=await page.evaluate(async()=>{
    const edited=rigs.projects.tabs.activeId;
    await rigs.projects.close(rigs.projects.tabs.items.find(item=>!item.dirty&&item.session).id);
    const accepted=await rigs.importFiles([new File([window.projectBytes],'accepted.rigs')]);
    return {accepted,name:rigs.editor.name,count:rigs.projects.tabs.size,resting:rigs.projects.tabs.get(edited).dirty&&rigs.projects.tabs.get(edited).session.report===window.beforeImport};
  });
  assert.deepEqual(opened,{accepted:undefined,name:'accepted',count:12,resting:true});
  console.log('With room for it, the file opens beside the edited project.');
}finally{await browser.close();}
