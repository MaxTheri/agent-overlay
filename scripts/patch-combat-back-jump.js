'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  let win;
  try {
    const files = [
      'assets/scenes-source/renard-combat-frames-normalized.png',
      'assets/scenes-source/renard-combat-intermediates-normalized.png',
      'assets/scenes-source/renard-combat-back-jump-frames.png',
    ];
    const urls = files.map(file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'));
    win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    await win.loadURL('about:blank');
    const result = await win.webContents.executeJavaScript(`(async () => {
      const urls = ${JSON.stringify(urls)}, cell = 256;
      const load = async url => { const image = new Image(); image.src = url; await image.decode(); return image; };
      const [key, between, jump] = await Promise.all(urls.map(load));
      const inspect = (ctx, x) => {
        const data = ctx.getImageData(x, 0, cell, cell), p = data.data;
        let left = cell, top = cell, right = -1, bottom = -1;
        for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) if (p[(y * cell + x) * 4 + 3] > 128) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        let anchorX = 0, n = 0;
        const band = Math.max(top, bottom - Math.max(2, Math.round((bottom - top + 1) * .025)));
        for (let y = band; y <= bottom; y++) for (let x = left; x <= right; x++) if (p[(y * cell + x) * 4 + 3] > 128) { anchorX += x; n++; }
        return { data, left, top, right, bottom, height: bottom - top + 1, width: right - left + 1, anchorX: anchorX / n };
      };
      const keyCtx = document.createElement('canvas'); keyCtx.width = key.width; keyCtx.height = cell;
      const kctx = keyCtx.getContext('2d', { willReadFrequently: true }); kctx.drawImage(key, 0, 0);
      const betweenCtx = document.createElement('canvas'); betweenCtx.width = between.width; betweenCtx.height = cell;
      const bctx = betweenCtx.getContext('2d', { willReadFrequently: true }); bctx.drawImage(between, 0, 0);
      const jumpCtx = document.createElement('canvas'); jumpCtx.width = jump.width; jumpCtx.height = cell;
      const jctx = jumpCtx.getContext('2d', { willReadFrequently: true }); jctx.drawImage(jump, 0, 0);
      const base = [];
      for (const ctx of [kctx, bctx]) for (let i = 0; i < 20; i++) base.push(inspect(ctx, i * cell));
      const heights = base.map(b => b.height).sort((a,b) => a-b);
      const targetHeight = (heights[19] + heights[20]) / 2;
      const keyOut = document.createElement('canvas'); keyOut.width = 20 * cell; keyOut.height = cell;
      const betweenOut = document.createElement('canvas'); betweenOut.width = 20 * cell; betweenOut.height = cell;
      const ko = keyOut.getContext('2d'); ko.imageSmoothingEnabled = false; ko.drawImage(key, 0, 0);
      const bo = betweenOut.getContext('2d'); bo.imageSmoothingEnabled = false; bo.drawImage(between, 0, 0);
      const preview = document.createElement('canvas'); preview.width = 5 * cell; preview.height = cell;
      const pc = preview.getContext('2d'); pc.imageSmoothingEnabled = false;
      const replacements = [
        { group: 1, target: 12, source: 1, bottom: 242, center: 128 }, // compressed takeoff
        { group: 0, target: 13, source: 2, bottom: 220, center: 120 }, // rising backward
        { group: 1, target: 13, source: 3, bottom: 190, center: 112 }, // jump apex, still facing right
        { group: 0, target: 14, source: 6, bottom: 242, center: 104 }, // land facing right
        { group: 1, target: 14, source: 7, bottom: 242, center: 104 }, // settle into guard
      ];
      const stats = [];
      for (let j = 0; j < replacements.length; j++) {
        const r = replacements[j], b = inspect(jctx, r.source * cell);
        const scale = Math.min(targetHeight / b.height, 244 / b.width);
        const dest = r.group === 0 ? ko : bo, dx = r.target * cell;
        dest.clearRect(dx, 0, cell, cell);
        dest.drawImage(jump, r.source * cell + b.left, b.top, b.width, b.height,
          dx + r.center - b.anchorX * scale, r.bottom - b.bottom * scale,
          b.width * scale, b.height * scale);
        pc.drawImage(dest.canvas, dx, 0, cell, cell, j * cell, 0, cell, cell);
        stats.push({ source: r.source, group: r.group, target: r.target, sourceHeight: b.height, scale, bottom: r.bottom });
      }
      return { key: keyOut.toDataURL('image/png'), between: betweenOut.toDataURL('image/png'),
        preview: preview.toDataURL('image/png'), targetHeight, stats };
    })()`);
    const outputs = [
      ['assets/scenes-source/renard-combat-frames-jumpfixed.png', result.key],
      ['assets/scenes-source/renard-combat-intermediates-jumpfixed.png', result.between],
      ['assets/scenes-source/renard-combat-jump-fixed-preview.png', result.preview],
    ];
    for (const [file, data] of outputs) fs.writeFileSync(path.resolve(file), Buffer.from(data.split(',')[1], 'base64'));
    console.log(JSON.stringify({ targetHeight: result.targetHeight, outputs: outputs.map(([file]) => file), stats: result.stats }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win?.destroy(); app.quit(); }
});
