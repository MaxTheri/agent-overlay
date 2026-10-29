'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),core=require('../server');
app.whenReady().then(async()=>{
 let server,win;
 try{
  server=core.start(0);await new Promise(r=>server.once('listening',r));
  ipcMain.handle('overlay:snapshot',()=>({agents:[],demo:true}));
  win=new BrowserWindow({width:420,height:400,show:false,transparent:true,frame:false,webPreferences:{preload:path.resolve(__dirname,'../desktop/preload.js'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  await win.loadURL('http://127.0.0.1:'+server.address().port+'/overlay.html');
  const inspect=async(elapsed,animal='renard',collapsed=false,state='departing')=>win.webContents.executeJavaScript(`(async()=>{
   const image=new Image();image.src='/scenes/departures/${animal}.png';await image.decode();
   avatarHistory.set('departure-test',OverlayAvatars.animals.indexOf(${JSON.stringify(animal)}));
   render({agents:[{id:'departure-test',name:${JSON.stringify(animal)},state:${JSON.stringify(state)},text:'Terminé',lastTs:Date.now()-120000-${elapsed},departureAt:Date.now()-${elapsed}}],demo:true,collapsed:${collapsed}});
   await new Promise(r=>setTimeout(r,200));
   const pet=document.querySelector('.pet'),canvas=pet.querySelector('canvas'),bubble=document.querySelector('.bubble'),paper=pet.querySelector('.departure-paper');
   return{stage:pet.closest('.agent').dataset.departure,frame:canvas.dataset.frame,gesture:canvas.dataset.gesture,
    paperVisible:!!paper&&!paper.hidden,paperForm:paper?.dataset.form,paperWidth:paper?.offsetWidth,paperFill:paper?.querySelector('stop')?.getAttribute('stop-color'),bubbleOpacity:getComputedStyle(bubble).opacity,bubbleDisplay:getComputedStyle(bubble).display,bubbleTransform:bubble.style.transform,laptop:!!document.querySelector('.tossed-computer'),
    open:getComputedStyle(pet.querySelector('.laptop-open')).display,canvasLeft:canvas.getBoundingClientRect().left,
    deskLeft:pet.querySelector('.fixed-desk').getBoundingClientRect().left,translated:canvas.style.translate,width:document.documentElement.scrollWidth,errors:window.overlayErrors};
  })()`);
  fs.mkdirSync('/tmp/agent-overlay-departure',{recursive:true});
  for(const animal of ['ratel','renard','firefox','capybara'])for(const collapsed of [false,true]){
   for(const [stage,time] of [['standing',0],['grabbing',1900],['crumpling',3200],['crumpling',4200],['throwing',4900],['throwing',5800],['leaving',8200]]){
    const info=await inspect(time,animal,collapsed);assert.equal(info.stage,stage);
    assert.equal(info.gesture,'departure');assert.ok(info.frame.startsWith('../scenes/'+(stage==='leaving'?'walks':'departures')+'/'+animal+'.png:'));
    assert.equal(info.laptop,false);assert.equal(info.open,'block');assert.equal(info.bubbleDisplay,'block');assert.equal(info.bubbleOpacity,time>=2600?'0':'1');assert.equal(info.paperVisible,time>=2600&&time<6200);
    if(time>=4200&&time<6200){assert.equal(info.paperForm,'ball');assert.ok(info.paperWidth<=20);assert.equal(info.paperFill,'#30343b');}
    assert.ok(info.width<=420);assert.deepEqual(info.errors,[]);
    if(stage==='leaving')assert.ok(info.canvasLeft>info.deskLeft);
    if(!collapsed)fs.writeFileSync('/tmp/agent-overlay-departure/'+animal+'-'+stage+'-'+time+'.png',(await win.webContents.capturePage()).toPNG());
   }
  }
  const resumed=await inspect(0,'renard',false,'working');assert.equal(resumed.laptop,false);assert.equal(resumed.translated,'');assert.equal(resumed.bubbleTransform,'');assert.equal(resumed.paperVisible,false);assert.equal(resumed.bubbleOpacity,'1');
  for(const collapsed of [false,true]) {
   const positions=await win.webContents.executeJavaScript(`(async()=>{
    const agents=[{id:'one',name:'One',state:'working',text:'Travail'}, {id:'two',name:'Two',state:'done',text:'Terminé',lastTs:Date.now()}];
    render({agents,demo:true,collapsed:${collapsed}});
    const before=document.querySelector('.agent').getBoundingClientRect();
    agents[1]={...agents[1],state:'departing',departureAt:Date.now()};
    render({agents,demo:true,collapsed:${collapsed}});
    const after=document.querySelector('.agent').getBoundingClientRect();
    return {before:{x:before.x,y:before.y,width:before.width,height:before.height},after:{x:after.x,y:after.y,width:after.width,height:after.height}};
   })()`);
   assert.deepEqual(positions.after,positions.before);
  }
  const gone=await inspect(15000);assert.equal(gone.laptop,false);
  console.log(JSON.stringify({ok:true,characters:4,stages:5,collapsed:true,cancel:true}));
 }catch(e){console.error(e);process.exitCode=1;}
 finally{win?.destroy();server?.close();core.shutdown();app.quit();}
});
