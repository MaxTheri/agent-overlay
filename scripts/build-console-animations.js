'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show:false, webPreferences:{ sandbox:true } });
    await win.loadURL('about:blank');
    const layouts = JSON.parse(fs.readFileSync(path.join(root,'public/animals/layout.json'),'utf8'));
    for (const animal of ['ratel','renard','firefox','capybara']) {
      const source = fs.readFileSync(path.join(root,`assets/scenes-source/console-${animal}-16.png`)).toString('base64');
      const result = await win.webContents.executeJavaScript(`(async () => {
        const image = new Image(); image.src='data:image/png;base64,${source}'; await image.decode();
        const output = {};
        const cell=document.createElement('canvas');cell.width=cell.height=256;
        const c=cell.getContext('2d',{willReadFrequently:true}); const feet=[];
        for(let i=8;i<16;i++) {
          c.clearRect(0,0,256,256);c.drawImage(image,i*256,0,256,256,0,0,256,256);
          const p=c.getImageData(0,0,256,256).data;let bottom=0;
          for(let y=80;y<256;y++)for(let x=0;x<60;x++)if(p[(y*256+x)*4+3]>128)bottom=Math.max(bottom,y);
          feet.push(bottom);
        }
        feet.sort((a,b)=>a-b);
        for(const [name,start] of [['intro',0],['console',8]]) {
          const canvas=document.createElement('canvas');canvas.width=16384;canvas.height=256;
          const context=canvas.getContext('2d');
          for(let i=0;i<64;i++)context.drawImage(image,(start+Math.floor(i/8))*256,0,256,256,i*256,0,256,256);
          output[name]=canvas.toDataURL('image/png');
        }
        return {output,deskY:feet[4]-18};
      })()`);
      for (const [name,data] of Object.entries(result.output)) {
        const file=`${animal}/end/${name}.png`;
        fs.writeFileSync(path.join(root,'public/animals',file),Buffer.from(data.split(',')[1],'base64'));
        layouts[file] = {...layouts[file], scale:1, baseline:224, deskY:result.deskY, height:218};
        const obsolete=path.join(root,'public/animals',animal,'end',name+'.gif');
        if(fs.existsSync(obsolete)) fs.unlinkSync(obsolete);
      }
      console.log(JSON.stringify({animal,frames:64,deskY:result.deskY}));
    }
    fs.writeFileSync(path.join(root,'public/animals/layout.json'),JSON.stringify(layouts,null,2)+'\n');
  } catch(e) { console.error(e);process.exitCode=1; }
  finally {win?.destroy();app.quit();}
});
