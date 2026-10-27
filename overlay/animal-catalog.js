'use strict';
const fs = require('fs'), path = require('path');
const ACTIONS = ['activity', 'thinking', 'waiting', 'end'];
const FRAME_SIZE = 256;
const FRAME_COUNT = 64, FRAME_MS = 160 / (1.2 * 1.2);

// Discover new variants on page load without editing animation code or a manifest.
function catalog(directory = path.join(__dirname, '../public/animals')) {
  const layoutFile = path.join(directory, 'layout.json');
  const layout = fs.existsSync(layoutFile) ? JSON.parse(fs.readFileSync(layoutFile, 'utf8')) : {};
  const animals = {};
  const entries = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const actions = {};
    for (const action of [...ACTIONS, 'common']) {
      const folder = path.join(directory, entry.name, action);
      const files = fs.existsSync(folder) ? fs.readdirSync(folder, { withFileTypes: true }).filter(file => file.isFile() && /\.png$/i.test(file.name)).sort((a, b) => a.name.localeCompare(b.name)) : [];
      actions[action] = files.map(file => {
        const header = Buffer.alloc(24), fd = fs.openSync(path.join(folder, file.name), 'r');
        try {
          if (fs.readSync(fd, header, 0, 24, 0) !== 24 || header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || header.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`Invalid PNG: ${entry.name}/${action}/${file.name}`);
        } finally { fs.closeSync(fd); }
        const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
        if (height !== FRAME_SIZE || width !== FRAME_SIZE * FRAME_COUNT) throw new Error(`Animation must have exactly 64 cells of 256x256 on one row: ${entry.name}/${action}/${file.name}`);
        return { file: [entry.name, action, file.name].map(encodeURIComponent).join('/'), name: file.name.slice(0, -4), frames: width / FRAME_SIZE };
      });
      if (action !== 'common' && !actions[action].some(clip => clip.name !== 'intro')) throw new Error(`Missing animation: ${entry.name}/${action}`);
    }
    animals[entry.name] = actions;
  }
  if (!entries.length) throw new Error('No animals available.');
  return { frameSize: FRAME_SIZE, frameCount: FRAME_COUNT, frameMs: FRAME_MS, actions: ACTIONS, animals, layout };
}
module.exports = { catalog };
