'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  let win;
  try {
    const files = [
      'assets/scenes-source/renard-combat-back-hop-source.png',
      'assets/scenes-source/renard-combat-frames-normalized.png',
      'assets/scenes-source/renard-combat-intermediates-normalized.png',
    ];
    const urls = files.map(file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'));
    win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    await win.loadURL('about:blank');
    const result = await win.webContents.executeJavaScript(`(async () => {
      const urls = ${JSON.stringify(urls)}, cell = 256;
      const load = async url => { const image = new Image(); image.src = url; await image.decode(); return image; };
      const [sheet, key, between] = await Promise.all(urls.map(load));
      const getBox = (data, w, h) => {
        const p = data.data, labels = new Int32Array(w * h), queue = new Int32Array(w * h), comps = [];
        let label = 0;
        for (let at = 0; at < w * h; at++) {
          if (labels[at] || p[at * 4 + 3] < 48) continue;
          label++; let start = 0, end = 1; queue[0] = at; labels[at] = label;
          let left = w, top = h, right = -1, bottom = -1, ax = 0, an = 0;
          while (start < end) {
            const q = queue[start++], x = q % w, y = Math.floor(q / w);
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy, n = ny * w + nx;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h && !labels[n] && p[n * 4 + 3] >= 48) { labels[n] = label; queue[end++] = n; }
            }
          }
          const band = Math.max(top, bottom - Math.max(2, Math.round((bottom - top + 1) * .025)));
          for (let y = band; y <= bottom; y++) for (let x = left; x <= right; x++) if (labels[y * w + x] === label) { ax += x; an++; }
          comps.push({ label, size: end, left, top, right, bottom, anchorX: ax / an });
        }
        const main = comps.reduce((best, c) => !best || c.size > best.size ? c : best, null);
        if (!main) throw new Error('Missing fox drawing');
        return { ...main, width: main.right - main.left + 1, height: main.bottom - main.top + 1, data, w, h,
          mask: Array.from(labels, value => value === main.label) };
      };
      const inspectStrip = image => {
        const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        ctx.canvas.width = image.width; ctx.canvas.height = image.height; ctx.drawImage(image, 0, 0);
        return Array.from({ length: 20 }, (_,i) => {
          const d = ctx.getImageData(i * cell, 0, cell, cell), p = d.data;
          let left=cell,top=cell,right=-1,bottom=-1,ax=0,an=0;
          for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)if(p[(y*cell+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
          const band=Math.max(top,bottom-Math.max(2,Math.round((bottom-top+1)*.025)));
          for(let y=band;y<=bottom;y++)for(let x=left;x<=right;x++)if(p[(y*cell+x)*4+3]>128){ax+=x;an++;}
          return {height:bottom-top+1,width:right-left+1,top,bottom,anchorX:ax/an};
        });
      };
      const baseBoxes=[...inspectStrip(key),...inspectStrip(between)].map(b=>b.height).sort((a,b)=>a-b);
      const targetHeight=(baseBoxes[19]+baseBoxes[20])/2;
      const sctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
      sctx.canvas.width=sheet.width;sctx.canvas.height=sheet.height;sctx.drawImage(sheet,0,0);
      const boxes=[];
      for(let i=0;i<12;i++){
        const col=i%4,row=Math.floor(i/4),x0=Math.floor(col*sheet.width/4),x1=Math.round((col+1)*sheet.width/4),y0=Math.floor(row*sheet.height/3),y1=Math.round((row+1)*sheet.height/3);
        boxes.push(getBox(sctx.getImageData(x0,y0,x1-x0,y1-y0),x1-x0,y1-y0));
      }
      const fit=Math.min(1,...boxes.map(b=>244/(b.width*targetHeight/b.height)));
      const centers=[128,128,120,112,104,96,92,90,92,104,116,128];
      const bottoms=[242,242,239,236,234,234,234,236,242,242,242,242];
      const atlas=document.createElement('canvas');atlas.width=12*cell;atlas.height=cell;
      const ac=atlas.getContext('2d');ac.imageSmoothingEnabled=false;
      const preview=document.createElement('canvas');preview.width=4*cell;preview.height=3*cell;
      const pc=preview.getContext('2d');pc.imageSmoothingEnabled=false;
      const stats=[];
      for(let i=0;i<12;i++){
        const b=boxes[i],scale=targetHeight/b.height*fit, isolated=document.createElement('canvas');isolated.width=b.w;isolated.height=b.h;
        const ic=isolated.getContext('2d'),raw=b.data.data,clean=ic.createImageData(b.w,b.h);
        for(let p=0;p<b.mask.length;p++)if(b.mask[p])clean.data.set(raw.subarray(p*4,p*4+4),p*4);
        ic.putImageData(clean,0,0);
        const dx=i*cell+centers[i]-b.anchorX*scale,dy=bottoms[i]-b.bottom*scale;
        ac.drawImage(isolated,b.left,b.top,b.width,b.height,dx,dy,b.width*scale,b.height*scale);
        pc.drawImage(atlas,i*cell,0,cell,cell,(i%4)*cell,Math.floor(i/4)*cell,cell,cell);
        stats.push({frame:i,height:b.height,center:centers[i],bottom:bottoms[i]});
      }
      return {atlas:atlas.toDataURL('image/png'),preview:preview.toDataURL('image/png'),targetHeight,fit,stats};
    })()`);
    for (const [file, data] of [
      ['assets/scenes-source/renard-combat-back-hop-normalized.png', result.atlas],
      ['assets/scenes-source/renard-combat-back-hop-preview.png', result.preview],
    ]) fs.writeFileSync(path.resolve(file), Buffer.from(data.split(',')[1], 'base64'));
    console.log(JSON.stringify({ targetHeight: result.targetHeight, fit: result.fit, frames: result.stats.length, stats: result.stats }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win?.destroy(); app.quit(); }
});
