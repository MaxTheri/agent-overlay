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
    await win.webContents.executeJavaScript('window.throwTime = Date.now(); Date.now = () => window.throwTime; void 0;');
    win.webContents.debugger.attach('1.3');
    fs.mkdirSync('/tmp/agent-overlay-throw-sync', { recursive: true });
    let checks = 0;
    for (const reduced of [false, true]) {
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
      });
      for (const [animal, release] of Object.entries({ ratel: 5400, renard: 5400, firefox: 5800, capybara: 5800 })) {
        for (const collapsed of [false, true]) {
          const times = [...new Set([4500, 4599, 4600, 4800, 4999, 5000, 5200, 5399, 5400, 5600, 5799, 5800, 5880, 6000, 6199])];
          for (const elapsed of times) {
            const info = await win.webContents.executeJavaScript(`(async () => {
              const image = new Image(); image.src = '/scenes/departures/${animal}.png'; await image.decode();
              window.throwTime = 1000000 + ${elapsed};
              avatarHistory.set('throw-test', OverlayAvatars.animals.indexOf('${animal}'));
              render({ agents: [{ id: 'throw-test', name: '${animal}', state: 'departing', text: 'Terminé', lastTs: 880000, departureAt: 1000000 }], demo: true, collapsed: ${collapsed} });
              // Let the real avatar loop paint the frozen time, including newly loaded strips.
              for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame);
              const pet = document.querySelector('.pet'), canvas = pet.querySelector('canvas');
              const paper = pet.querySelector('.departure-paper'), rect = paper.getBoundingClientRect();
              const pose = OverlayDeparture.paperPose(${elapsed}, ${reduced}, '${animal}');
              const placement = OverlayAvatars.layout('${animal}', '../scenes/departures/${animal}.png');
              const workstation = pet.querySelector('.workstation').getBoundingClientRect();
              const petRect = pet.getBoundingClientRect();
              return { frame: Number(canvas.dataset.frame.split(':').pop()), paperFrame: Number(paper.dataset.frame),
                expectedFrame: OverlayDeparture.departureFrame(${elapsed}, ${reduced}), released: paper.dataset.released === 'true', visible: !paper.hidden,
                x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
                expectedX: workstation.x + (placement.x + pose.handX * placement.scale - 40) / 256 * workstation.width + pose.x,
                expectedY: workstation.y + (placement.y + pose.handY * placement.scale) / 256 * workstation.height + pose.y,
                crop: { x: Math.floor(petRect.x - 30), y: Math.floor(petRect.y - 15), width: 155, height: 135 }, errors: window.overlayErrors };
            })()`);
            const label = `${animal}/${elapsed}/collapsed=${collapsed}/reduced=${reduced}`;
            assert.equal(info.frame, info.expectedFrame, label);
            assert.equal(info.paperFrame, info.frame, label);
            assert.equal(info.released, elapsed >= release, label);
            assert.equal(info.visible, elapsed < (reduced ? release : 6200), label);
            if (info.visible) {
              assert.ok(Math.abs(info.x - info.expectedX) < 1, label + ' horizontal hand alignment');
              assert.ok(Math.abs(info.y - info.expectedY) < 1, label + ' vertical hand alignment');
            }
            assert.deepEqual(info.errors, [], label);
            if (!reduced && !collapsed && [4500, 4800, 5200, 5600, 5800, 5880].includes(elapsed)) {
              fs.writeFileSync(`/tmp/agent-overlay-throw-sync/${animal}-${elapsed}.png`, (await win.webContents.capturePage(info.crop)).toPNG());
            }
            checks++;
          }
        }
      }
    }
    console.log(JSON.stringify({ ok: true, checks, characters: 4, collapsed: true, reduced: true, synchronizedFramesAndHands: true }));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win?.destroy(); server?.close(); core.shutdown(); app.quit(); }
});
