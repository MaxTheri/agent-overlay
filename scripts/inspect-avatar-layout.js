'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const avatars = require('../public/overlay-avatar');
const root = path.resolve(__dirname, '..');
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await win.loadURL('about:blank');
    const rows = ['activity/keyboard', 'activity/classic', 'activity/stretch', 'thinking/thought', 'end/intro', 'end/console', 'impact', 'typing'];
    const jobs = rows.flatMap(clip => avatars.animals.map((animal, index) => ({ animal, clip,
      file: clip === 'impact' ? `scenes/impacts/${animal}.png` : clip === 'typing' ? `scenes/reactions/${animal}.png` : `animals/${animal}/${clip}.png`,
      column: clip === 'typing' ? 10 : clip === 'impact' ? 3 : 24,
      desk: avatars.markup(animal, index, clip === 'impact' ? '../scenes/impacts/'+animal+'.png' : clip === 'typing' ? '../scenes/reactions/'+animal+'.png' : animal+'/'+clip+'.png').match(/<svg.*?<\/svg>/)[0],
      placement: avatars.layout(animal, clip === 'impact' ? '../scenes/impacts/'+animal+'.png' : clip === 'typing' ? '../scenes/reactions/'+animal+'.png' : animal+'/'+clip+'.png'),
    })));
    if (process.argv.includes('--measure')) {
      jobs.length = 0;
      for (const [animal, groups] of Object.entries(avatars.catalog.animals)) {
        for (const clip of Object.values(groups).flat()) jobs.push({ animal, file: `animals/${clip.file}` });
        for (const folder of ['reactions', 'impacts', 'departures']) jobs.push({ animal, file: `scenes/${folder}/${animal}.png` });
      }
    }
    for (const job of jobs) job.source = fs.readFileSync(path.join(root, 'public', job.file)).toString('base64');
    if (process.argv.includes('--measure')) {
      const layout = await win.webContents.executeJavaScript(`(async () => {
        const result = {};
        for (const job of ${JSON.stringify(jobs)}) {
          const image = new Image(); image.src = 'data:image/png;base64,' + job.source; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
          const context = canvas.getContext('2d', { willReadFrequently:true });
          const heights = []; let left = 256, right = 0;
          for (let frame=0; frame<image.width/256; frame++) {
            context.clearRect(0,0,256,256); context.drawImage(image,frame*256,0,256,256,0,0,256,256);
            const pixels=context.getImageData(0,0,256,256).data; let top=256,bottom=0;
            for(let y=0;y<256;y++) for(let x=0;x<256;x++) if(pixels[(y*256+x)*4+3]>128) {
              top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);
            }
            heights.push(bottom-top+1);
          }
          heights.sort((a,b)=>a-b); const height=heights[Math.floor(heights.length/2)];
          result[job.file.replace(/^animals\\//,'').replace(/^scenes\\//,'../scenes/')] = { height, left, right, scale: 218/height };
        }
        return result;
      })()`);
      const prior = JSON.parse(fs.readFileSync(path.join(root,'public/animals/layout.json'),'utf8'));
      for (const [file, entry] of Object.entries(layout)) {
        if (prior[file]?.baseline) { entry.baseline=prior[file].baseline; entry.deskY=prior[file].deskY; }
      }
      fs.writeFileSync(path.join(root,'public/animals/layout.json'), JSON.stringify(layout,null,2)+'\n');
      console.log(JSON.stringify({ measured:Object.keys(layout).length }));
      return;
    }
    const result = await win.webContents.executeJavaScript(`(async () => {
      const jobs = ${JSON.stringify(jobs)};
      const output = document.createElement('canvas'); output.width = 1000; output.height = ${rows.length} * 210;
      const ctx = output.getContext('2d'); ctx.fillStyle = '#253040'; ctx.fillRect(0,0,output.width,output.height);
      const metrics = [];
      for (const [index, job] of jobs.entries()) {
        const img = new Image(); img.src = 'data:image/png;base64,' + job.source; await img.decode();
        const cell = document.createElement('canvas'); cell.width = cell.height = 256;
        const c = cell.getContext('2d', { willReadFrequently: true }); c.drawImage(img, job.column*256,0,256,256,0,0,256,256);
        const p = c.getImageData(0,0,256,256).data;
        let left=256, top=256, right=0, bottom=0;
        for(let y=0;y<256;y++) for(let x=0;x<256;x++) if(p[(y*256+x)*4+3]>128) {left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        metrics.push({animal:job.animal,clip:job.clip,left,top,right,bottom,height:bottom-top+1});
        const x=index%4*250+35,y=Math.floor(index/4)*210+25;
        ctx.fillStyle='#fff';ctx.font='13px sans-serif';ctx.fillText(job.animal+' '+job.clip,x-20,y-7);
        const placement=job.placement;
        const drawCharacter=()=>ctx.drawImage(cell,x+(placement.x-40)/256*166,y+placement.y/256*166,placement.size/256*166,placement.size/256*166);
        const gaming=job.clip.startsWith('end/');
        if(!gaming) drawCharacter();
        job.desk=job.desk.replace('class="laptop-open"', 'class="laptop-open" style="display:'+(gaming?'none':'block')+'"').replace('class="laptop-closed"', 'class="laptop-closed" style="display:'+(gaming?'block':'none')+'"');
        const desk=new Image();desk.src='data:image/svg+xml;base64,'+btoa(job.desk.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));await desk.decode();
        ctx.drawImage(desk,x,y,166,166); if(gaming) drawCharacter();
        ctx.strokeStyle='#e88888';ctx.beginPath();ctx.moveTo(x,y+placement.deskY/256*166);ctx.lineTo(x+166,y+placement.deskY/256*166);ctx.stroke();
      }
      return { image:output.toDataURL('image/png'),metrics };
    })()`);
    fs.writeFileSync('/tmp/avatar-layout.png', Buffer.from(result.image.split(',')[1], 'base64'));
    console.log(JSON.stringify(result.metrics));
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { win?.destroy(); app.quit(); }
});
