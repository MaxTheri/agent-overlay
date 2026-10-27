// Assemble imagegen drawings into the same 256px horizontal strips as the pets.
// Run: desktop/node_modules/.bin/electron scripts/pack-scene-atlases.js manifest.json
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
app.whenReady().then(async () => {
  let win;
  try {
    const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    await win.loadURL('about:blank');
    for (const job of manifest) {
      const source = 'data:image/png;base64,' + fs.readFileSync(job.source).toString('base64');
      const result = await win.webContents.executeJavaScript(`(async () => {
        const image = new Image(); image.src = ${JSON.stringify(source)}; await image.decode();
        const columns = ${job.columns}, rows = ${job.rows}, count = columns * rows;
        const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
        const sourceContext = source.getContext('2d', { willReadFrequently: true }); sourceContext.drawImage(image, 0, 0);
        // Generated grids have slightly uneven gutters. Locate the quietest
        // separator near each expected boundary rather than cutting off feet.
        const allPixels = sourceContext.getImageData(0, 0, image.width, image.height).data;
        const rowInk = Array(image.height).fill(0);
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++)
          if (allPixels[(y * image.width + x) * 4 + 3] > 128) rowInk[y]++;
        const cuts = (ink, count) => {
          const result = [0], step = ink.length / count;
          for (let i = 1; i < count; i++) {
            const expected = i * step;
            let best = Math.round(expected), score = Infinity;
            for (let p = Math.round(expected - step * .28); p <= Math.round(expected + step * .28); p++) {
              const value = (ink[p - 1] || 0) + (ink[p] || 0) + (ink[p + 1] || 0) + Math.abs(p - expected) * .02;
              if (value < score) { best = p; score = value; }
            }
            result.push(best);
          }
          return [...result, ink.length];
        };
        const rowCuts = cuts(rowInk, rows), columnCuts = [];
        for (let row = 0; row < rows; row++) {
          const ink = Array(image.width).fill(0);
          for (let y = rowCuts[row]; y < rowCuts[row + 1]; y++) for (let x = 0; x < image.width; x++)
            if (allPixels[(y * image.width + x) * 4 + 3] > 128) ink[x]++;
          columnCuts.push(cuts(ink, columns));
        }
        const poses = [];
        let transparent = 0;
        for (let index = 0; index < count; index++) {
          const row = Math.floor(index / columns), column = index % columns;
          const x = columnCuts[row][column], y = rowCuts[row];
          const w = columnCuts[row][column + 1] - x, h = rowCuts[row + 1] - y;
          const cell = sourceContext.getImageData(x, y, w, h), pixels = cell.data;
          // Remove extraction matte before interpolation, as in the existing
          // animal pipeline. Transparent RGB must not bleed into the drawing.
          for (let p = 0; p < pixels.length; p += 4) if (pixels[p + 3] <= 16) pixels.fill(0, p, p + 4);
          // Keep the connected character, excluding fragments of neighbours
          // that extend over a generated grid's imperfect gutters.
          const labels = new Int32Array(w * h), queue = new Int32Array(w * h);
          let label = 0, largest = 0, largestSize = 0;
          for (let p = 0; p < w * h; p++) {
            if (labels[p] || !pixels[p * 4 + 3]) continue;
            label++; let start = 0, end = 1; queue[0] = p; labels[p] = label;
            while (start < end) {
              const q = queue[start++], qx = q % w, qy = Math.floor(q / w);
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = qx + dx, ny = qy + dy, n = ny * w + nx;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h && !labels[n] && pixels[n * 4 + 3]) { labels[n] = label; queue[end++] = n; }
              }
            }
            if (end > largestSize) { largest = label; largestSize = end; }
          }
          for (let p = 0; p < w * h; p++) if (labels[p] !== largest) pixels.fill(0, p * 4, p * 4 + 4);
          sourceContext.putImageData(cell, x, y);
          let left = w, top = h, right = -1, bottom = -1;
          for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
            const alpha = pixels[(py * w + px) * 4 + 3];
            if (alpha === 0) transparent++;
            if (alpha > 128) { left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py); }
          }
          if (right < left || bottom - top < h * .25) throw new Error('Missing drawing in cell ' + index);
          let sum = 0, n = 0;
          for (let py = Math.max(0, bottom - Math.round(h * .025)); py <= bottom; py++) for (let px = left; px <= right; px++)
            if (pixels[(py * w + px) * 4 + 3] > 128) { sum += px; n++; }
          poses.push({ x, y, w, h, left, right, top, bottom, anchor: n ? sum / n : (left + right) / 2 });
        }
        if (!transparent) throw new Error('The generated source has no transparent pixels.');
        // Register the feet. Keep every silhouette within its own cell while
        // preserving the original drawn poses, fingers and tail.
        const height = 218;
        const scales = poses.map(p => height / (p.bottom - p.top + 1));
        const left = Math.min(...poses.map((p, i) => (p.left - p.anchor) * scales[i]));
        const right = Math.max(...poses.map((p, i) => (p.right - p.anchor) * scales[i]));
        const fit = Math.min(1, 244 / (right - left));
        const anchor = 128 - (left + right) / 2 * fit;
        const strip = document.createElement('canvas'); strip.width = count * 256; strip.height = 256;
        const context = strip.getContext('2d'); context.imageSmoothingQuality = 'high';
        const grid = document.createElement('canvas'); grid.width = columns * 256; grid.height = rows * 256;
        const gridContext = grid.getContext('2d');
        const hashes = new Set();
        poses.forEach((p, i) => {
          const scale = scales[i] * fit;
          context.save(); context.beginPath(); context.rect(i * 256, 0, 256, 256); context.clip();
          context.drawImage(source, p.x, p.y, p.w, p.h, i * 256 + anchor - p.anchor * scale,
            242 - p.bottom * scale, p.w * scale, p.h * scale); context.restore();
          gridContext.drawImage(strip, i * 256, 0, 256, 256, i % columns * 256, Math.floor(i / columns) * 256, 256, 256);
          const pixels = context.getImageData(i * 256, 0, 256, 256).data;
          let hash = 2166136261; for (const value of pixels) hash = Math.imul(hash ^ value, 16777619) >>> 0;
          hashes.add(hash);
        });
        return { strip: strip.toDataURL('image/png'), grid: grid.toDataURL('image/png'), frames: count,
          unique: hashes.size, width: strip.width, height: strip.height, transparent };
      })()`);
      if (result.unique !== result.frames) throw new Error(`Repeated drawings in ${job.output}: ${result.unique}/${result.frames}`);
      for (const [file, data] of [[job.output, result.strip], [job.preview, result.grid]]) {
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      }
      console.log(JSON.stringify({ output: job.output, frames: result.frames, unique: result.unique, width: result.width, height: result.height }));
    }
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win?.destroy(); app.quit(); }
});
