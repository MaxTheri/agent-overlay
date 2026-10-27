'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, globalShortcut } = require('electron');
const fs = require('fs'), path = require('path');
process.env.AGENT_OVERLAY = '1';
const sourceRoot = path.join(__dirname, '..');
const coreRoot = fs.existsSync(path.join(sourceRoot, 'server.js')) ? sourceRoot : path.join(__dirname, 'core');
const core = require(path.join(coreRoot, 'server.js'));
const { Collector } = require(path.join(coreRoot, 'overlay/collector.js'));
const { DragController } = require(path.join(coreRoot, 'overlay/drag.js'));
const { Applications } = require(path.join(coreRoot, 'overlay/applications.js'));
const applications = new Applications(path.join(__dirname, 'native/activate-app'));
const collector = new Collector(core, applications);
const selftestAt = process.argv.indexOf('--selftest');
const SELFTEST = selftestAt >= 0 ? process.argv[selftestAt + 1] : null;
let win, tray, server, mouseTimer, refreshTimer, applicationsTimer, positionSaveTimer, quitting = false, interactive = false, hitRects = [];
const drag = new DragController();
let pendingHeight = null;
let settings = { source: 'all', demo: process.argv.includes('--demo'), collapsed: false, displayId: null, position: null };
const gotLock = SELFTEST || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on('second-instance', () => { win?.showInactive(); });
function save() { try { fs.writeFileSync(path.join(app.getPath('userData'), 'overlay.json'), JSON.stringify(settings)); } catch {} }
function display() { return screen.getAllDisplays().find((d) => d.id === settings.displayId) || screen.getPrimaryDisplay(); }
function anchor(height = win?.getBounds().height || 240) {
  if (!win) return;
  if (drag.active) { pendingHeight = height; return; }
  const area = display().workArea;
  const width = Math.min(420, area.width - 24), h = Math.max(100, Math.min(height, area.height - 32));
  const pos = settings.position;
  const x = pos && Number.isFinite(pos.x) ? pos.x : area.x + area.width - width - 12;
  const bottom = pos && Number.isFinite(pos.bottom) ? pos.bottom : area.y + area.height - 12;
  const bounds = { x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bottom - h, area.y + area.height - h))), width, height: h };
  const current = win.getBounds();
  if (Object.keys(bounds).some((k) => bounds[k] !== current[k])) win.setBounds(bounds);
}
function rememberPosition() {
  if (!win || SELFTEST) return;
  const bounds = win.getBounds();
  settings.position = { x: bounds.x, bottom: bounds.y + bounds.height };
  settings.displayId = screen.getDisplayMatching(bounds).id;
  clearTimeout(positionSaveTimer); positionSaveTimer = setTimeout(save, 250);
}
function stopDrag() {
  drag.stop();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('overlay:drag-end');
  rememberPosition(); anchor(pendingHeight || win.getBounds().height); pendingHeight = null; menu();
}
let demoStarted = Date.now();
let departurePreviewAt = process.argv.includes('--departure-preview') ? Date.now() : 0;
function demoSnapshot() {
  const phase = Math.floor((Date.now() - demoStarted) / 5000) % 4;
  const definitions = [
    ['Codex', ['Coordonne les agents et vérifie les changements.', 'Attend le résultat des tests.', 'Aucune activité récente', 'Coordonne les agents et vérifie les changements.'][phase], ['working', 'waiting', 'idle', 'working'][phase]],
    ['Ada', ['Lit Login.jsx', 'Modifie Login.jsx', 'Exécute : npm run profile', 'Le login est maintenant plus rapide.'][phase], phase === 3 ? 'done' : 'working'],
    ['Rémy', ['Exécute : npm test', 'Échec · un test du panier', 'Modifie cart.test.js', 'Les 12 tests passent.'][phase], ['working', 'error', 'working', 'done'][phase]],
    ['Iris', 'Quelle stratégie de retry veux-tu utiliser ?', 'blocked'],
  ];
  return { agents: definitions.map(([name, text, state], i) => ({ id: 'demo/' + i, name, text, state, source: i === 0 ? 'codex' : 'claude', session: 'Démo · optimiser la connexion', detail: text, lastTs: Date.now(), ageMs: 0 })), source: settings.source, demo: true, updatedAt: Date.now() };
}
function snapshot() {
  if (departurePreviewAt && Date.now() - departurePreviewAt < 10000) {
    const agent = { ...demoSnapshot().agents[0], state: 'departing', departureAt: departurePreviewAt, lastTs: departurePreviewAt - 2 * 60000 };
    return { agents: [agent], demo: true, updatedAt: Date.now(), collapsed: settings.collapsed };
  }
  departurePreviewAt = 0;
  return { ...(settings.demo ? demoSnapshot() : collector.snapshot(settings.source)), collapsed: settings.collapsed };
}
function push() { if (win && !win.isDestroyed()) win.webContents.send('overlay:state', snapshot()); }
function menu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win?.isVisible() ? 'Masquer les agents' : 'Afficher les agents', click: () => { win.isVisible() ? win.hide() : win.showInactive(); menu(); } },
    { label: 'Réduire les bulles', type: 'checkbox', checked: settings.collapsed, click: (item) => { settings.collapsed = item.checked; save(); push(); menu(); } },
    { label: 'Sources', submenu: [['all', 'Codex + Claude Code'], ['codex', 'Codex'], ['claude', 'Claude Code']].map(([source, label]) => ({ label, type: 'radio', checked: settings.source === source, click: () => { settings.source = source; save(); push(); menu(); } })) },
    { label: 'Écran', submenu: screen.getAllDisplays().map((d, i) => ({ label: d.label || 'Écran ' + (i + 1), type: 'radio', checked: d.id === display().id, click: () => { settings.displayId = d.id; settings.position = null; anchor(); save(); menu(); } })) },
    { label: 'Replacer en bas à droite', click: () => { settings.position = null; anchor(); save(); } },
    { label: 'Mode démo', type: 'checkbox', checked: settings.demo, click: (item) => { settings.demo = item.checked; demoStarted = Date.now(); save(); push(); menu(); } },
    { label: 'Aperçu du départ des agents', click: () => { departurePreviewAt = Date.now(); win.showInactive(); push(); } },
    { type: 'separator' }, { label: 'Quitter Agent Overlay', accelerator: 'CommandOrControl+Q', click: () => { quitting = true; app.quit(); } },
  ]));
}
app.whenReady().then(async () => {
  if (!gotLock) return;
  app.setName('Agent Overlay');
  // Establish the UI-element process before creating a fullscreen auxiliary
  // window. Changing Dock policy afterwards can change its Space membership.
  if (process.platform === 'darwin') app.setActivationPolicy('accessory');
  if (!SELFTEST) try { settings = { ...settings, ...JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'overlay.json'), 'utf8')) }; } catch {}
  if (process.argv.includes('--demo')) settings.demo = true;
  const testDisplayAt = SELFTEST ? process.argv.indexOf('--test-display-point') : -1;
  if (testDisplayAt >= 0) {
    const x = Number(process.argv[testDisplayAt + 1]), y = Number(process.argv[testDisplayAt + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid test display point.');
    settings.displayId = screen.getDisplayNearestPoint({ x, y }).id;
  }
  await applications.refresh();
  server = core.start(0); await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  win = new BrowserWindow({ width: 420, height: 240, title: 'Agent Overlay', frame: false, transparent: true,
    backgroundColor: '#00000000', hasShadow: false, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: true, focusable: false, fullscreenable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: process.platform === 'darwin' });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setAudioMuted(true);
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  win.webContents.session.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !details.url.startsWith(origin + '/') }));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('move', rememberPosition);
  win.on('close', (e) => { if (!quitting && !SELFTEST) { e.preventDefault(); win.hide(); menu(); } });
  ipcMain.handle('overlay:snapshot', (event) => event.sender === win.webContents ? snapshot() : null);
  ipcMain.handle('overlay:activate', async (event, id) => {
    if (event.sender !== win.webContents || typeof id !== 'string' || id.length > 240) return { ok: false, error: 'Agent invalide.' };
    if (settings.demo) return { ok: false, error: 'Les agents de démonstration ne sont pas liés à une application.' };
    const agent = snapshot().agents.find(a => a.id === id);
    if (!agent || agent.state !== 'done') return { ok: false, error: 'La tâche n’est pas terminée ou n’est plus affichée.' };
    return applications.activate(agent.applicationKey);
  });
  ipcMain.on('overlay:layout', (event, layout) => {
    if (event.sender !== win.webContents || !layout || !Array.isArray(layout.rects)) return;
    hitRects = layout.rects.filter((r) => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0).slice(0, 12);
    if (Number.isFinite(layout.height)) anchor(Math.ceil(layout.height));
  });
  ipcMain.on('overlay:collapse', (event) => { if (event.sender === win.webContents) { settings.collapsed = !settings.collapsed; save(); push(); menu(); } });
  ipcMain.on('overlay:drag-start', (event, point) => {
    if (event.sender !== win.webContents || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    drag.start(point, win.getBounds());
    interactive = true; win.setIgnoreMouseEvents(false);
  });
  ipcMain.on('overlay:drag-move', (event, point) => {
    if (event.sender !== win.webContents || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isInteger(point.buttons) || !drag.active) return;
    const next = drag.move(point, point.buttons);
    if (next) win.setPosition(next.x, next.y);
    else stopDrag();
  });
  ipcMain.on('overlay:drag-stop', (event) => {
    if (event.sender === win.webContents && drag.active) stopDrag();
  });
  ipcMain.on('overlay:pointer', (event) => {
    if (event.sender === win.webContents && !interactive) { interactive = true; win.setIgnoreMouseEvents(false); }
  });
  win.webContents.on('did-finish-load', () => {
    anchor(); if (!SELFTEST || testDisplayAt >= 0) win.showInactive(); push();
    if (SELFTEST && process.argv.includes('--avatar-preview')) win.webContents.executeJavaScript(`(() => {
      const list = document.querySelector('#agents'); list.replaceChildren();
      document.body.classList.remove('collapsed');
      document.querySelector('#title').textContent = 'ANIMATIONS · APERÇU';
      const style = document.createElement('style');
      style.textContent = '#agents { display:grid; grid-template-columns:repeat(' + OverlayAvatars.animals.length + ',76px); gap:4px; max-height:none; } .agent { width:76px; padding:0; position:relative; } .pet { width:76px; height:94px; } .workstation { width:76px; height:76px; bottom:16px; } .preview-label { position:absolute; bottom:0; font-size:8px; width:100%; text-align:center; color:#fff; }';
      document.head.append(style);
      for (const motion of OverlayAvatars.actions) for (let animal = 0; animal < OverlayAvatars.animals.length; animal++) {
        let id = 0; while (OverlayAvatars.variant(String(id)) !== animal) id++;
        const el = document.createElement('div'); el.className = 'agent';
        el.innerHTML = '<button class="pet" data-motion="' + motion + '">' + OverlayAvatars.markup(String(id)) + '<span class="preview-label">' + motion + '</span></button>';
        list.append(el);
      }
      layout();
    })()`);
    if (SELFTEST) setTimeout(async () => {
      try {
        const errors = await win.webContents.executeJavaScript('window.overlayErrors || []');
        const info = await win.webContents.executeJavaScript(`(async () => {
          const strips = Object.values(OverlayAvatars.catalog.animals).flatMap(actions => Object.values(actions).flat());
          const assets = [];
          for (const strip of strips) {
            const image = new Image(); image.src = 'animals/' + strip.file; await image.decode();
            assets.push({ file: strip.file, width: image.naturalWidth, height: image.naturalHeight });
          }
          const canvas = document.querySelector('.animal-character'), pet = canvas.closest('.pet');
          const desk = pet.querySelector('.fixed-desk');
          const bounds = () => JSON.stringify(desk.getBoundingClientRect().toJSON());
          const original = pet.dataset.motion, rect = bounds();
          const frameBefore = canvas.dataset.frame;
          await new Promise(resolve => setTimeout(resolve, 220));
          const advances = frameBefore !== canvas.dataset.frame;
          let deskStable = true;
          for (const motion of OverlayAvatars.actions) {
            pet.dataset.motion = motion;
            await new Promise(resolve => setTimeout(resolve, 60));
            const file = canvas.dataset.frame?.split(':')[0] || '';
            deskStable &&= bounds() === rect && Number(desk.dataset.deskY) === OverlayAvatars.layout(canvas.dataset.animal, file).deskY;
          }
          pet.dataset.motion = original;
          await new Promise(resolve => setTimeout(resolve, 60));
          return { cards: document.querySelectorAll('.agent').length, text: document.body.innerText, assets,
            animationCheck: { advances, deskStable, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches },
            avatars: [...document.querySelectorAll('.pet')].map(el => ({ motion: el.dataset.motion,
              label: el.getAttribute('aria-label'),
              frame: el.querySelector('.animal-character').dataset.frame,
              animal: el.querySelector('.animal-character').dataset.animal,
              gesture: el.querySelector('.animal-character').dataset.gesture,
              transform: getComputedStyle(el.querySelector('.animal-character')).transform,
              animation: getComputedStyle(el.querySelector('.animal-character')).animationName })) };
        })()`);
        fs.writeFileSync(SELFTEST, (await win.webContents.capturePage()).toPNG());
        const distinct = process.argv.includes('--avatar-preview') || new Set(info.avatars.map(a => a.animal)).size === info.avatars.length;
        let nativeWindows = null;
        if (testDisplayAt >= 0 && process.platform === 'darwin') {
          const { stdout } = await applications.execute(applications.helper, ['--window', String(process.pid)], { timeout: 2500, maxBuffer: 1024 * 1024 });
          nativeWindows = JSON.parse(stdout);
        }
        const nativeVisible = nativeWindows === null || nativeWindows.some(window => window.onScreen && window.layer >= 1000 && window.bounds.Width === win.getBounds().width);
        const ok = nativeVisible && !errors.length && info.cards > 0 && distinct && info.animationCheck.deskStable && (info.animationCheck.advances || info.animationCheck.reduced) && info.avatars.every(a => a.frame && a.transform === 'none' && a.animation === 'none');
        if (!ok) process.exitCode = 1;
        console.log(JSON.stringify({ ok, errors, info, nativeWindows, alwaysOnTop: win.isAlwaysOnTop(), allSpaces: win.isVisibleOnAllWorkspaces(), bounds: win.getBounds(), muted: win.webContents.isAudioMuted() }));
      } catch (e) { console.error(e); process.exitCode = 1; }
      quitting = true; app.quit();
    }, 1800);
  });
  await win.loadURL(origin + '/overlay.html');
  const icon = nativeImage.createFromPath(path.join(coreRoot, 'media/tray.png')); icon.setTemplateImage(true);
  tray = new Tray(icon); tray.setToolTip('Agent Overlay · activité locale, sans son'); tray.on('click', () => { win.isVisible() ? win.hide() : win.showInactive(); menu(); }); menu();
  if (!SELFTEST) {
    refreshTimer = setInterval(push, 1500);
    applicationsTimer = setInterval(() => { applications.refresh().then(push).catch(() => {}); }, 5000);
  }
  // Native hit testing lets transparent areas pass clicks to the app underneath.
  mouseTimer = setInterval(() => {
    if (!win.isVisible()) return;
    if (drag.active) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds(), x = p.x - b.x, y = p.y - b.y;
    const hit = hitRects.some((r) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height);
    if (hit !== interactive) { interactive = hit; win.setIgnoreMouseEvents(!hit, { forward: true }); }
  }, 75);
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, () => { anchor(); menu(); });
  globalShortcut.register('CommandOrControl+Shift+A', () => { win.isVisible() ? win.hide() : win.showInactive(); menu(); });
});
app.on('window-all-closed', () => {});
app.on('before-quit', () => { quitting = true; clearTimeout(positionSaveTimer); if (!SELFTEST) save(); clearInterval(mouseTimer); clearInterval(refreshTimer); clearInterval(applicationsTimer); globalShortcut.unregisterAll(); server?.close(); core.shutdown(); });
app.on('activate', () => win?.showInactive());
