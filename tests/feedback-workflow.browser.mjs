import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from './support/playwright.mjs';
await mkdir('artifacts/feedback-workflow',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{
  await page.goto(process.env.RIGS_URL??'http://127.0.0.1:47831');await page.waitForFunction(()=>window.rigs?.ready);
  await page.evaluate(async()=>{
    const {emptyDocument,createFrame,createObject}=await import('/src/demo.mjs');
    const r=emptyDocument(),f=r.figure_types[0];
    f.segments=[{...f.segments[0],segment_id:1,parent_id:0,segment_kind:'squareLine',segment_type:'line',length:200,thickness:90,angle_rad:0,aux_code:1,is_static:true,color_rgb:[240,60,60]}];f.segment_count=1;
    r.keyframes=[createFrame([createObject(f,1,100,160),createObject(f,2,300,160,{join:{target_object_slot:0,target_unique_id:1,target_handle_id:1}})],20)];
    rigs.editor.load(r);rigs.editor.select(null);rigs.state.handles=true;rigs.fit();
    window.feedbackPoint=async point=>{const {worldToScreen}=await import('/src/renderer-geometry.mjs'),b=document.querySelector('#viewport').getBoundingClientRect(),p=worldToScreen(point,{report:rigs.editor.report,frame:rigs.editor.evaluatedFrame,view:rigs.state.view,cameraEnabled:false});return{x:b.x+p.x,y:b.y+p.y};};
  });await settle();await page.keyboard.press('v');
  const p=await page.evaluate(()=>feedbackPoint({x:400,y:160}));
  await page.mouse.click(p.x,p.y);await settle();
  assert.deepEqual(await page.evaluate(()=>[rigs.editor.selectedUid,rigs.editor.selectedJoint,Boolean(rigs.editor.object.join)]),[2,-1,true]);
  const before=await page.evaluate(()=>JSON.stringify(rigs.editor.serialize()));
  await page.mouse.click(p.x,p.y,{button:'right'});
  await page.getByText('Unjoin figure',{exact:true}).click();await settle();
  assert.equal(await page.evaluate(()=>Boolean(rigs.editor.object.join)),false);
  await page.evaluate(()=>rigs.editor.undo());assert.equal(await page.evaluate(()=>JSON.stringify(rigs.editor.serialize())),before);
  await page.screenshot({path:'artifacts/feedback-workflow/artwork-selection.png'});
  console.log('PASS artwork click selects joined root; context-menu unjoin and exact undo');

  const picks=await page.evaluate(async()=>{
    const {pickCanvasArtwork}=await import('/src/canvas-artwork-pick.mjs'),e=rigs.editor,p={x:400,y:160};
    return [pickCanvasArtwork(e.geometry,p)?.uid,pickCanvasArtwork(e.geometry,p,{hiddenUids:new Set([2])})?.uid??null,
      pickCanvasArtwork(e.geometry,p,{lockedUids:new Set([2])})?.uid??null,pickCanvasArtwork(e.geometry,{x:400,y:260})?.uid??null];
  });assert.deepEqual(picks,[2,null,null,null]);
  await page.evaluate(()=>rigs.settingsUI.open('canvas'));await page.getByLabel('Pasted figure depth',{exact:true}).selectOption('front');
  assert.equal(await page.evaluate(()=>rigs.state.settings.pasteDepth),'front');
  await page.screenshot({path:'artifacts/feedback-workflow/paste-setting.png'});
  await page.evaluate(()=>{rigs.settingsUI.close();rigs.editor.select(1);rigs.editor.copySelection();document.activeElement?.blur();});
  await page.keyboard.press('Control+v');await settle();
  assert.equal(await page.evaluate(()=>rigs.editor.object._rigsZIndex),1);
  console.log('PASS Canvas setting reaches keyboard paste');

  await page.evaluate(async()=>{
    const {emptyDocument,createFrame,createObject}=await import('/src/demo.mjs');
    const r=emptyDocument(),f=r.figure_types[0];r.keyframes=[createFrame([createObject(f,1,200,220)],30),createFrame([],30)];
    rigs.settingsUI.commit({timelineMode:'advanced'});rigs.editor.load(r);rigs.editor.disableFrameDrafts();
    for(let i=0;i<9;i++)rigs.editor.createLayer(`Layer ${i+2}`);
    rigs.editor.select(1);rigs.editor.addVfxClip({kind:'figure',uid:1},'glow',{start:0,duration:20});
    rigs.editor._vfxTimelineVisible=true;rigs.editor._vfxTimelineScene=false;rigs.editor._emit('vfx-selection');
    rigs.timeline.scroll.scrollTop=10000;
  });await settle();
  const initial=await page.evaluate(()=>{const t=rigs.timeline;return{ids:t.tracks.map(r=>r.id),scroll:t.scroll.scrollTop,y:t.rowY(t.tracks.findIndex(r=>r.id==='layer-1'))};});
  const cell=async tick=>page.evaluate(tick=>{const t=rigs.timeline,b=t.scroll.getBoundingClientRect(),i=t.tracks.findIndex(r=>r.id==='layer-1');return{x:b.x+(tick+.5)*t.pxPerTick,y:b.y+t.rowY(i)+t.rowSize(i)/2};},tick);
  const a=await cell(3),b=await cell(35);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();await settle();
  const after=await page.evaluate(()=>{const t=rigs.timeline;return{ids:t.tracks.map(r=>r.id),scroll:t.scroll.scrollTop,y:t.rowY(t.tracks.findIndex(r=>r.id==='layer-1')),start:t.start,end:t.end};});
  assert.deepEqual(after.ids,initial.ids);assert.equal(after.scroll,initial.scroll);assert.equal(after.y,initial.y);assert.equal(after.start,3);assert.equal(after.end,35);
  await page.screenshot({path:'artifacts/feedback-workflow/timeline-range.png'});
  // Reindexing structural data must not temporarily shrink and clamp scroll.
  await page.evaluate(()=>{rigs.timeline._reindex();rigs.editor.seek(0);});await settle();
  assert.equal(await page.evaluate(()=>rigs.timeline.scroll.scrollTop),initial.scroll);
  await page.evaluate(()=>{rigs.editor.select(null);rigs.editor._vfxTimelineScene=true;rigs.editor._emit('vfx-target');});await settle();
  assert.equal(await page.evaluate(()=>rigs.timeline.tracks.filter(r=>r.kind==='vfx').length),0);
  assert.deepEqual(errors,[]);console.log('PASS VFX lanes and scroll stay fixed across range selection, seeks and reindex; explicit selection refreshes');
}finally{await browser.close();}
