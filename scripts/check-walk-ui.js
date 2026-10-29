'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const core = require('../server');
app.whenReady().then(async () => {
  let server, win;
  try {
    server = core.start(0); await new Promise(resolve => server.once('listening', resolve));
    ipcMain.handle('overlay:snapshot', () => ({ agents: [], demo: true }));
    win = new BrowserWindow({ width: 420, height: 400, show: false, transparent: true, frame: false,
      webPreferences: { preload: path.resolve(__dirname, '../desktop/preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
    await win.loadURL('http://127.0.0.1:' + server.address().port + '/overlay.html');
    await win.webContents.executeJavaScript('window.walkTime = Date.now(); Date.now = () => window.walkTime; void 0;');
    fs.mkdirSync('/tmp/agent-overlay-walk', { recursive: true });
    let checks = 0;
    for (const animal of ['ratel', 'renard', 'firefox', 'capybara']) for (const collapsed of [false, true]) {
      for (let column = 0; column < 8; column++) {
        const info = await win.webContents.executeJavaScript(`(async () => {
          const image = new Image(); image.src = '/scenes/walks/${animal}.png'; await image.decode();
          avatarHistory.set('walk-test', OverlayAvatars.animals.indexOf('${animal}'));
          window.walkTime = 1006200;
          const state = { agents: [{ id: 'walk-test', name: '${animal}', state: 'departing', text: 'Terminé', lastTs: 880000, departureAt: 1000000 }], demo: true, collapsed: ${collapsed} };
          render(state);
          const pet = document.querySelector('.pet'), canvas = pet.querySelector('canvas'), agent = pet.closest('.agent');
          const distance = document.querySelector('#agents').getBoundingClientRect().right - pet.getBoundingClientRect().left + canvas.offsetWidth;
          const stride = 48 * pet.querySelector('.workstation').offsetWidth / 96;
          const walked = (2 + (${column} + .1) / 8) * stride;
          const elapsed = 6200 + walked / distance * (OverlayDeparture.durationMs - 6200);
          window.walkTime = 1000000 + elapsed; render(state);
          for(let i=0;i<5;i++) await new Promise(requestAnimationFrame);
          const r = canvas.getBoundingClientRect();
          return { file: canvas.dataset.frame.split(':')[0], column: Number(canvas.dataset.frame.split(':').pop()),
            x: parseFloat(canvas.style.translate), walked, paperHidden: pet.querySelector('.departure-paper').hidden,
            crop: { x: Math.floor(r.x-4), y: Math.floor(r.y-4), width: Math.ceil(r.width+8), height: Math.ceil(r.height+8) },
            errors: window.overlayErrors };
        })()`);
        assert.equal(info.file, '../scenes/walks/' + animal + '.png');
        assert.equal(info.column, column, animal);
        assert.ok(Math.abs(info.x - info.walked) < .01, animal);
        assert.equal(info.paperHidden, true); assert.deepEqual(info.errors, []);
        if (!collapsed) fs.writeFileSync(`/tmp/agent-overlay-walk/${animal}-${column}.png`, (await win.webContents.capturePage(info.crop)).toPNG());
        checks++;
      }
      const gone = await win.webContents.executeJavaScript(`(() => {
        window.walkTime = 1000000 + OverlayDeparture.durationMs;
        render(lastState); return !document.querySelector('.agent.departing');
      })()`);
      assert.equal(gone, true);
    }
    console.log(JSON.stringify({ ok: true, checks, characters: 4, walkFrames: 8, collapsed: true, fullyExits: true }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win?.destroy(); server?.close(); core.shutdown(); app.quit(); }
});
