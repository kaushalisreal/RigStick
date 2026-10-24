import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.RIGS_PREPARATION_ARTIFACTS||'artifacts/drawing-preparation';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS',name);};
try{
  await page.goto(process.env.RIGS_URL||'http://127.0.0.1:47839');await page.waitForFunction(()=>window.rigs?.ready);await page.locator('[data-workspace-mode="draw"]').click();
  await page.evaluate(async()=>{
    const {emptyDocument}=await import('/src/demo.mjs');rigs.state.settings.autosaveSeconds=0;
    window.startFixture=()=>{
      // Worker preparation serves the stroke worker and history replay; GPU
      // strokes prepare during read-back (tests/drawing-gpu.browser.mjs).
      const e=rigs.editor,d=rigs.drawing;e.load(emptyDocument());e.createDrawingLayer();d.tool='brush';d.gpuBrushDisabled=true;Object.assign(d.settings,{size:700,resolution:1,color:'#203ed8',hardness:1,opacity:1,pressureSize:false,pressureOpacity:false,stabilization:0});
      window.fixtureRevision=e.revision;window.fixtureUndo=e._undo.length;window.preparationHeld=false;window.barrierSettled=false;
      const request=d.owner.worker.request.bind(d.owner.worker);window.preparationCount=0;
      d.owner.worker.request=(kind,payload,options)=>{if(kind==='prepare-tiles')window.preparationCount++;return request(kind,payload,options);};
    };
    window.snapshot=()=>[...rigs.drawing.owner.entry(rigs.editor.drawingTarget().figure).store].map(t=>{let hash=2166136261;for(const v of t.pixels)hash=Math.imul(hash^v,16777619)>>>0;return[t.tx,t.ty,hash];});
    startFixture();
  });
  const rect=await page.locator('#viewport').boundingBox(),point={x:rect.x+rect.width*.45,y:rect.y+rect.height*.45};
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.up();
  await page.evaluate(()=>rigs.drawing.barrier());
  check('a large resident stroke commits once without copying its tiles through preparation',await page.evaluate(()=>preparationCount===0&&rigs.editor._undo.length===fixtureUndo+1&&!rigs.drawing.operation&&!rigs.drawing.gesture&&[...rigs.drawing.owner.entries.values()].every(e=>!e.preparing)));
  await page.evaluate(async()=>{window.expected=snapshot();await rigs.drawing.owner.history?.pumping;await rigs.drawing.history('undo');window.redoRevision=rigs.editor.revision;window.redoCommand=rigs.editor._redo.at(-1);const d=rigs.drawing,request=d.owner.worker.request.bind(d.owner.worker);let batches=0;d.owner.worker.request=(kind,payload,options)=>{const pending=request(kind,payload,options);if(kind==='prepare-tiles'&&++batches===2)d.cancel();return pending;};window.redoError=await d.history('redo').then(()=>null,error=>error.name);d.owner.worker.request=request;});
  check('Escape during real worker preparation leaves warm redo and its cursor untouched',await page.evaluate(()=>redoError==='AbortError'&&rigs.editor.revision===redoRevision&&rigs.editor._redo.at(-1)===redoCommand&&!rigs.editor.drawingTarget().figure&&!rigs.drawing.operation&&[...rigs.drawing.owner.entries.values()].every(e=>!e.preparing)));
  await page.evaluate(()=>rigs.drawing.history('redo'));
  check('retrying the cancelled redo restores every exact tile',await page.evaluate(()=>JSON.stringify(snapshot())===JSON.stringify(expected)));
  await page.evaluate(async()=>{
    await rigs.drawing.history('undo');
    const d=rigs.drawing,request=d.owner.worker.request.bind(d.owner.worker);let held=false;
    d.owner.worker.request=async(kind,payload,options)=>{if(kind==='prepare-tiles'&&!held){held=true;window.preparationHeld=true;await new Promise(resolve=>window.releasePreparation=resolve);}return request(kind,payload,options);};
    window.pendingRedo=d.history('redo').catch(error=>error.name);
  });
  await page.waitForFunction(()=>preparationHeld);
  await page.evaluate(async()=>{const {emptyDocument}=await import('/src/demo.mjs');window.closedOwner=rigs.drawing.owner;rigs.editor.load(emptyDocument());releasePreparation();await pendingRedo;});
  check('replacing the document disposes pending preparation without publishing it',await page.evaluate(()=>closedOwner.disposed&&closedOwner.workingBytes===0&&!rigs.drawing.gesture&&rigs.editor.report.figure_types.every(f=>!f._rigs?.drawing)));
  check('no uncaught browser errors',errors.length===0);await writeFile(output+'/preparation.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
