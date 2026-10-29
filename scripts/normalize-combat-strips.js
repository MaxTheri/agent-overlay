'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  let win;
  try {
    const sources = [
      'assets/scenes-source/renard-combat-frames.png',
      'assets/scenes-source/renard-combat-intermediates.png',
    ];
    const outputs = [
      'assets/scenes-source/renard-combat-frames-normalized.png',
      'assets/scenes-source/renard-combat-intermediates-normalized.png',
    ];
    win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    await win.loadURL('about:blank');
    const images = sources.map(file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const urls = ${JSON.stringify(images)}, count = 20, cell = 256, boxes = [];
      const strips = [];
      for (const url of urls) {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        const frames = [];
        for (let i = 0; i < count; i++) {
          const data = ctx.getImageData(i * cell, 0, cell, cell), px = data.data;
          let left = cell, top = cell, right = -1, bottom = -1;
          for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) if (px[(y * cell + x) * 4 + 3] > 128) {
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
          if (right < left || bottom < top) throw new Error('Empty sprite ' + i);
          let anchorX = 0, anchors = 0;
          const footBand = Math.max(top, bottom - Math.max(2, Math.round((bottom - top + 1) * .025)));
          for (let y = footBand; y <= bottom; y++) for (let x = left; x <= right; x++) if (px[(y * cell + x) * 4 + 3] > 128) { anchorX += x; anchors++; }
          const box = { left, top, right, bottom, height: bottom - top + 1, width: right - left + 1, anchorX: anchorX / anchors };
          boxes.push({ group: strips.length, index: i, ...box }); frames.push(box);
        }
        strips.push({ image, frames });
      }
      const sorted = boxes.map(b => b.height).sort((a,b) => a-b);
      const targetHeight = Math.min(218, (sorted[19] + sorted[20]) / 2);
      const fit = Math.min(1, ...boxes.map(b => 244 / (b.width * targetHeight / b.height)));
      const outputs = [];
      for (let group = 0; group < strips.length; group++) {
        const out = document.createElement('canvas'); out.width = count * cell; out.height = cell;
        const oc = out.getContext('2d'); oc.imageSmoothingEnabled = false;
        const { image, frames } = strips[group];
        for (let i = 0; i < count; i++) {
          const b = frames[i], scale = targetHeight / b.height * fit;
          const drawW = cell * scale, drawH = cell * scale;
          const x = i * cell + 128 - b.anchorX * scale;
          const y = 242 - b.bottom * scale;
          oc.save(); oc.beginPath(); oc.rect(i * cell, 0, cell, cell); oc.clip();
          oc.drawImage(image, i * cell, 0, cell, cell, x, y, drawW, drawH); oc.restore();
        }
        outputs.push(out.toDataURL('image/png'));
      }
      return { outputs, targetHeight, fit, samples: boxes.filter(b => [0, 5, 10, 15, 19].includes(b.index)).map(b => ({ group: b.group, index: b.index, height: b.height, width: b.width })) };
    })()`);
    for (let i = 0; i < outputs.length; i++) fs.writeFileSync(path.resolve(outputs[i]), Buffer.from(result.outputs[i].split(',')[1], 'base64'));
    console.log(JSON.stringify({ outputs, targetHeight: result.targetHeight, fit: result.fit, samples: result.samples }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win?.destroy(); app.quit(); }
});
