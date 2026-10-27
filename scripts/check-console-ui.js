'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const assert=require('assert/strict'), fs=require('fs');
const core=require('../server');
app.whenReady().then(async () => {
  let server,win;
  try {
    server=core.start(0);await new Promise(resolve=>server.once('listening',resolve));
    ipcMain.handle('overlay:snapshot',()=>({agents:[],demo:true}));
    win=new BrowserWindow({width:420,height:620,show:false,transparent:true,frame:false,webPreferences:{preload:require('path').resolve(__dirname,'../desktop/preload.js'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    await win.loadURL(`http://127.0.0.1:${server.address().port}/overlay.html`);
    win.showInactive();
    await win.webContents.executeJavaScript(`(() => {
      const agents=OverlayAvatars.animals.map((animal,i)=>{
        const id='console-'+animal;avatarHistory.set(id,i);
        return {id,name:animal,state:'done',lastTs:Date.now(),text:'Terminé',session:'Console · pieds sur la table'};
      });
      render({agents,demo:true,collapsed:false});
    })()`);
    await new Promise(resolve=>setTimeout(resolve,9000));
    const inspect=()=>win.webContents.executeJavaScript(`(() => [...document.querySelectorAll('.pet')].map(pet=>({
      gaming:pet.classList.contains('gaming'),frame:pet.querySelector('canvas').dataset.frame,
      open:getComputedStyle(pet.querySelector('.laptop-open')).display,
      closed:getComputedStyle(pet.querySelector('.closed-computer')).display,
      characterLayer:getComputedStyle(pet.querySelector('canvas')).zIndex,
      deskLayer:getComputedStyle(pet.querySelector('.fixed-desk')).zIndex,
      computerLayer:getComputedStyle(pet.querySelector('.closed-computer')).zIndex,
      deskY:Number(pet.querySelector('.fixed-desk').dataset.deskY),
      width:pet.getBoundingClientRect().width
    })))()`);
    for(const collapsed of [false,true]) {
      await win.webContents.executeJavaScript(`render({...lastState,collapsed:${collapsed}})`);
      await new Promise(resolve=>setTimeout(resolve,150));
      const info=await inspect();assert.equal(info.length,4);
      fs.writeFileSync(`/tmp/console-${collapsed?'collapsed':'normal'}.png`,(await win.webContents.capturePage()).toPNG());
      console.log(JSON.stringify({collapsed,info,errors:await win.webContents.executeJavaScript('window.overlayErrors')}));
      for(const pet of info) {
        assert.equal(pet.gaming,true);assert.ok(/\/end\/console\.png:/.test(pet.frame));
        assert.equal(pet.open,'none');assert.equal(pet.closed,'block');
        assert.ok(Number(pet.characterLayer)>Number(pet.deskLayer));
        assert.ok(Number(pet.computerLayer)>Number(pet.characterLayer));
        assert.equal(pet.width,collapsed?88:96);
      }
      fs.writeFileSync(`/tmp/console-${collapsed?'collapsed':'normal'}.png`,(await win.webContents.capturePage()).toPNG());
    }
    await win.webContents.executeJavaScript(`render({...lastState,collapsed:false,agents:lastState.agents.map(a=>({...a,state:'working'}))})`);
    await new Promise(resolve=>setTimeout(resolve,500));
    for(const pet of await inspect()) {assert.equal(pet.gaming,false);assert.equal(pet.open,'inline');assert.equal(pet.closed,'none');}
    assert.deepEqual(await win.webContents.executeJavaScript('window.overlayErrors'),[]);
    console.log(JSON.stringify({ok:true,characters:4,normal:true,collapsed:true,resume:true}));
  }catch(error){console.error(error);process.exitCode=1;}
  finally{win?.destroy();server?.close();core.shutdown();app.quit();}
});
