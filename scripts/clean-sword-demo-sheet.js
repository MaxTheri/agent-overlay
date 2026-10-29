'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  let win;
  try {
    const input = path.resolve(process.argv[2] || 'assets/scenes-source/swordshow-renard-source.png');
    const output = path.resolve(process.argv[3] || 'assets/scenes-source/swordshow-renard-clean.png');
    win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    await win.loadURL('about:blank');
    const data = 'data:image/png;base64,' + fs.readFileSync(input).toString('base64');
    const result = await win.webContents.executeJavaScript(`(async () => {
      const image = new Image(); image.src = ${JSON.stringify(data)}; await image.decode();
      const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
      const sc = source.getContext('2d', { willReadFrequently: true }); sc.drawImage(image, 0, 0);
      const pixels = sc.getImageData(0, 0, source.width, source.height).data;
      const columns = 12, rows = 12, frames = 139, cell = 256;
      const atlas = document.createElement('canvas'); atlas.width = columns * cell; atlas.height = rows * cell;
      const ac = atlas.getContext('2d'); ac.imageSmoothingEnabled = false;
      const infos = [];
      for (let i = 0; i < frames; i++) {
        const col = i % columns, row = Math.floor(i / columns);
        const cx = (col + .5) * image.width / columns, cy = (row + .5) * image.height / rows;
        const x0 = Math.max(0, Math.floor(cx - 78)), y0 = Math.max(0, Math.floor(cy - 58));
        const w = Math.min(image.width - x0, 156), h = Math.min(image.height - y0, 116);
        const data = sc.getImageData(x0, y0, w, h), p = data.data;
        const labels = new Int32Array(w * h), queue = new Int32Array(w * h), comps = [];
        let label = 0;
        for (let at = 0; at < w * h; at++) {
          if (labels[at] || p[at * 4 + 3] < 48) continue;
          label++; let start = 0, end = 1; queue[0] = at; labels[at] = label;
          let minX = w, minY = h, maxX = -1, maxY = -1, sx = 0, sy = 0;
          while (start < end) {
            const q = queue[start++], qx = q % w, qy = Math.floor(q / w);
            minX = Math.min(minX, qx); maxX = Math.max(maxX, qx); minY = Math.min(minY, qy); maxY = Math.max(maxY, qy); sx += qx; sy += qy;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = qx + dx, ny = qy + dy, n = ny * w + nx;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h && !labels[n] && p[n * 4 + 3] >= 48) { labels[n] = label; queue[end++] = n; }
            }
          }
          comps.push({ label, size: end, minX, minY, maxX, maxY, cx: sx / end, cy: sy / end });
        }
        const main = comps.reduce((best, c) => {
          const dx = c.cx + x0 - cx, dy = c.cy + y0 - cy;
          const score = c.size / (1 + Math.hypot(dx, dy) / 90);
          return !best || score > best.score ? { ...c, score } : best;
        }, null);
        if (!main) throw new Error('No fox component in frame ' + i);
        const clean = document.createElement('canvas'); clean.width = w; clean.height = h;
        const cc = clean.getContext('2d'); const isolated = cc.createImageData(w, h);
        for (let at = 0; at < labels.length; at++) if (labels[at] === main.label) {
          isolated.data.set(p.subarray(at * 4, at * 4 + 4), at * 4);
        }
        cc.putImageData(isolated, 0, 0);
        const bw = main.maxX - main.minX + 1, bh = main.maxY - main.minY + 1;
        const scale = Math.min(2.25, 218 / bh, 232 / bw);
        const dx = (cell - bw * scale) / 2 - main.minX * scale;
        const dy = (cell - bh * scale) / 2 - main.minY * scale;
        ac.drawImage(clean, main.minX, main.minY, bw, bh,
          col * cell + (cell - bw * scale) / 2, row * cell + (cell - bh * scale) / 2, bw * scale, bh * scale);
        infos.push({ i, size: main.size, cx: Math.round(main.cx + x0), cy: Math.round(main.cy + y0), bw, bh });
      }
      return { png: atlas.toDataURL('image/png'), infos, width: atlas.width, height: atlas.height };
    })()`);
    fs.writeFileSync(output, Buffer.from(result.png.split(',')[1], 'base64'));
    console.log(JSON.stringify({ output, frames: result.infos.length, width: result.width, height: result.height,
      samples: [result.infos[0], result.infos[39], result.infos[69], result.infos[99], result.infos[138]] }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win?.destroy(); app.quit(); }
});
