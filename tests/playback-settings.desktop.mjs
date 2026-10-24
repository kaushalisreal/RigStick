import {_electron as electron} from './support/playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('.'),output=path.join(root,'artifacts/playback-settings');
await mkdir(output,{recursive:true});
const app=await electron.launch({args:[root],cwd:root,env:{...process.env,RIGS_USER_DATA_DIR:path.join(output,`profile-${Date.now()}`)}});
try {
  const page=await app.firstWindow(),errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>window.rigs?.ready);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.setIgnoreMouseEvents(true);w.setFocusable(false);w.showInactive();});
  await page.evaluate(async()=>{
    for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
    const {emptyDocument,createFrame,createObject}=await import('/src/demo.mjs');
    const {PlaybackMetrics}=await import('/src/playback-metrics.mjs');
    const {createRenderer}=await import('/src/renderer.mjs');
    const fallback=await createRenderer(document.createElement('canvas'),{forceCanvas2D:true});
    fallback.resize(1,1,.25);
    if(fallback.canvas.width!==1||fallback.canvas.height!==1)throw new Error('Draft preview must retain a nonempty software surface');
    fallback.destroy();
    const report=emptyDocument(),figure=report.figure_types[0],colors=[0xffff4040,0xff40ff40,0xff4040ff];
    report.keyframes=Array.from({length:180},(_,i)=>({...createFrame([createObject(figure,1,300+i%50,230)]),_rigsBackgroundColor:colors[i%3]}));
    rigs.editor.load(report,'Playback settings');rigs.editor.setFPS(60);rigs.editor.markSaved();rigs.fit();rigs.state.loop=true;
    const r=rigs.state.renderer,render=r.renderPrepared.bind(r);
    window.probe={ticks:[],wrongPixels:[],gpuErrors:[],starts:[],runs:[],colors,baseDpr:r.dpr,revision:rigs.editor.revision,history:rigs.editor.historySize};
    r.device.addEventListener('uncapturederror',event=>probe.gpuErrors.push(event.error.message));
    const snapshot=PlaybackMetrics.prototype.snapshot;
    PlaybackMetrics.prototype.snapshot=function(...args){return {...snapshot.apply(this,args),fps:0};};
    const copy=new OffscreenCanvas(1,1),ctx=copy.getContext('2d',{willReadFrequently:true});
    r.renderPrepared=(...args)=>{
      const ok=render(...args);if(!ok||!rigs.state.playing)return ok;
      const tick=rigs.editor.tick;if(probe.ticks.at(-1)!==tick)probe.ticks.push(tick);
      const view=rigs.state.view,x=Math.round((view.x+20*view.scale)*r.dpr),y=Math.round((view.y+20*view.scale)*r.dpr);
      ctx.clearRect(0,0,1,1);ctx.drawImage(r.canvas,x,y,1,1,0,0,1,1);
      const pixel=[...ctx.getImageData(0,0,1,1).data],c=colors[tick%3],expected=[(c>>>16)&255,(c>>>8)&255,c&255,255];
      if(pixel.some((n,i)=>Math.abs(n-expected[i])>1))probe.wrongPixels.push({tick,pixel,expected});
      return ok;
    };
    rigs.settingsUI.open('animation');
  });
  assert.equal(await page.getByRole('combobox',{name:'Playback quality',exact:true}).inputValue(),'normal');
  await page.screenshot({path:path.join(output,'settings.png')});
  for(const [quality,index]of [['normal',0],['medium',1],['low',2],['draft',3]]){
    await page.getByRole('combobox',{name:'Playback quality',exact:true}).selectOption(quality);
    await page.evaluate(async()=>{await rigs.settingsUI.flush();rigs.settingsUI.close();});
    assert.equal(await page.evaluate(()=>rigs.state.renderer.dpr),await page.evaluate(()=>probe.baseDpr),'Paused editing keeps full density');
    await page.evaluate(()=>{
      probe.ticks=[];const at=performance.now();rigs.actions.play();probe.starts.push(performance.now()-at);
      Object.assign(rigs.state.previewGovernor,{lowSince:performance.now()-10000,changedAt:-10000});
    });
    await page.waitForFunction(index=>probe.ticks.length>=20&&rigs.state.renderer.dpr===probe.baseDpr*[1,.75,.5,.25][index]&&rigs.state.renderer.msaaCount===(index?1:4),index);
    assert.equal(await page.evaluate(()=>rigs.state.previewGovernor.index),index,'Fixed preference ignores forced low FPS samples');
    await page.evaluate(()=>{probe.runs.push([...probe.ticks]);rigs.actions.play();});
    await page.waitForFunction(()=>!rigs.state.editablePreparing&&rigs.state.renderer.dpr===probe.baseDpr&&rigs.state.renderer.msaaCount===4);
    assert.equal(await page.evaluate(async()=>(await rigsDesktop.getEditorSettings()).playbackQuality),quality);
    await page.evaluate(()=>rigs.settingsUI.open('animation'));
  }
  // Changing a preference while playing uses the same atomic quality transition.
  await page.evaluate(()=>{rigs.settingsUI.close();probe.ticks=[];rigs.actions.play();});
  await page.waitForFunction(()=>probe.ticks.length>=8);
  for(const [quality,index]of [['medium',1],['normal',0],['low',2],['draft',3]]){
    const count=await page.evaluate(quality=>{rigs.settingsUI.commit({playbackQuality:quality});return probe.ticks.length;},quality);
    await page.waitForFunction(({index,count})=>probe.ticks.length>=count+8&&rigs.state.renderer.dpr===probe.baseDpr*[1,.75,.5,.25][index]&&rigs.state.renderer.msaaCount===(index?1:4),{index,count});
  }
  await page.evaluate(()=>{probe.runs.push([...probe.ticks]);rigs.actions.play();});
  await page.waitForFunction(()=>!rigs.state.editablePreparing&&rigs.state.renderer.msaaCount===4);
  const result=await page.evaluate(()=>({...probe,revisionAfter:rigs.editor.revision,historyAfter:rigs.editor.historySize}));
  assert.deepEqual(result.gpuErrors,[]);assert.deepEqual(result.wrongPixels,[]);assert.deepEqual(errors,[]);
  for(const ticks of result.runs)for(let i=1;i<ticks.length;i++)assert.equal(ticks[i],(ticks[i-1]+1)%180);
  assert.equal(result.revisionAfter,result.revision);assert.equal(result.historyAfter,result.history);
  await writeFile(path.join(output,'report.json'),JSON.stringify({...result,errors},null,2));
  console.log(JSON.stringify({runs:result.runs.map(x=>x.length),startActionMs:result.starts,errors,wrongPixels:result.wrongPixels}));
} finally {await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
