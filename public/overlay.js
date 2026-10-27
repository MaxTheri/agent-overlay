'use strict';
window.overlayErrors = [];
window.addEventListener('error', (e) => window.overlayErrors.push(e.message));
window.addEventListener('unhandledrejection', (e) => window.overlayErrors.push(String(e.reason)));
const colors = ['#b0a4ff', '#8cceff', '#f4b89e', '#a3e3b9', '#f0b0d8'];
const labels = { working: 'Au travail', thinking: 'Réflexion longue', waiting: 'Outil en cours', blocked: 'Besoin de toi', done: 'Terminé', departing: 'Fin de pause', error: 'Erreur', idle: 'En veille' };
const symbols = { working: '·', thinking: '…', waiting: '·', blocked: '?', done: '✓', departing: '→', error: '!', idle: 'z' };
const elements = new Map(); let lastState, expandedId = null, page = 0;
let departureTimer;
const avatarHistory = new Map();
function colorIndex(id) { let n = 0; for (const c of id) n = ((n * 31) + c.charCodeAt(0)) >>> 0; return n % colors.length; }
function card(a) {
  let el = elements.get(a.id);
  if (!el) {
    el = document.createElement('div');
    el.innerHTML = '<button type="button" class="bubble"><div class="topline"><span class="name"></span><span class="status-dot"></span><span class="badge"></span></div><div class="text"></div><span class="session"></span><div class="detail"></div><div class="activation-note" role="status"></div></button><button type="button" class="pet"></button>';
    el.querySelector('.pet').innerHTML = OverlayAvatars.markup(a.id, avatarHistory.get(a.id));
    const details = () => { expandedId = expandedId === a.id ? null : a.id; render(lastState); };
    el.querySelector('.bubble').onclick = details;
    el.querySelector('.pet').onclick = async () => {
      const current = el.agent;
      if (current.state !== 'done' || lastState.demo || !current.applicationKey) return details();
      if (el.activating) return;
      el.activating = true;
      const note = el.querySelector('.activation-note'); note.textContent = 'Activation…'; layout();
      try {
        const result = await window.overlay?.activate(current.id);
        note.textContent = result?.ok ? `${result.name} au premier plan` : result?.error || 'Activation indisponible.';
      } catch { note.textContent = 'Activation indisponible.'; }
      finally { el.activating = false; layout(); }
    };
    elements.set(a.id, el);
  }
  el.className = 'agent ' + a.state + (expandedId === a.id ? ' expanded' : '');
  el.agent = a;
  const departing = a.state === 'departing';
  if (departing) {
    const departureFile = 'scenes/departures/' + OverlayAvatars.animals[avatarHistory.get(a.id)] + '.png';
    if (el.departureFile !== departureFile) {
      if (el.departureImage) el.departureImage.src = '';
      el.departureImage = new Image(); el.departureImage.src = departureFile; el.departureFile = departureFile;
    }
  } else {
    if (el.departureImage) el.departureImage.src = '';
    el.departureImage = null; el.departureFile = null;
    delete el.dataset.departure;
    const bubble = el.querySelector('.bubble');
    bubble.style.transform = ''; bubble.style.opacity = '';
    bubble.style.removeProperty('--paper-fold');
    el.querySelector('.departure-paper')?.remove();
  }
  el.style.setProperty('--accent', colors[colorIndex(a.id)]);
  const avatar = el.querySelector('.pet');
  const canvas = avatar.querySelector('.animal-character');
  canvas.dataset.animal = OverlayAvatars.animals[avatarHistory.get(a.id)];
  canvas.dataset.agent = a.id;
  if (departing) canvas.dataset.reactionAt = a.departureAt;
  else delete canvas.dataset.reactionAt;
  avatar.dataset.motion = departing ? 'departure' : OverlayAvatars.motion(a);
  if (!departing) canvas.style.translate = '';
  const canActivate = a.state === 'done' && !lastState.demo && !!a.applicationKey;
  avatar.classList.toggle('can-activate', canActivate);
  avatar.title = canActivate ? `Activer ${a.applicationName || 'l’application liée'}` : 'Afficher les détails';
  avatar.setAttribute('aria-label', canActivate ? `${a.name} · Terminé · ${avatar.title}` : `${a.name} · Afficher les détails`);
  const text = a.text;
  el.querySelector('.name').textContent = a.name;
  el.querySelector('.badge').textContent = labels[a.state] || a.state;
  el.querySelector('.text').textContent = text;
  el.querySelector('.session').textContent = a.session;
  el.querySelector('.detail').textContent = a.detail || a.text;
  el.querySelector('.status-symbol').textContent = symbols[a.state] || '·';
  const bubble = el.querySelector('.bubble');
  bubble.disabled = departing;
  bubble.setAttribute('aria-label', departing ? text : a.name + ' · ' + (labels[a.state] || '') + ' · ' + text);
  bubble.title = departing ? text : a.name + '\n' + a.session + '\nCliquer pour les détails';
  return el;
}
// The sprite and paper share one sampled timestamp and one paint cycle.
function updateDeparture(el, elapsed, reduced) {
  el.dataset.departure = OverlayDeparture.stage(elapsed);
  const bubble = el.querySelector('.bubble');
  const canvas = el.querySelector('.animal-character');
  const pet = el.querySelector('.pet');
  const pose = OverlayDeparture.bubblePose(elapsed, reduced);
  const width = bubble.offsetWidth || 1, height = bubble.offsetHeight || 1;
  // Move the real discussion bubble from the left into the character's hands.
  const handX = pet.offsetLeft + pet.offsetWidth * .44;
  const handY = pet.offsetTop + pet.offsetHeight * .62;
  const x = (handX - bubble.offsetLeft - width) * pose.grab + pose.x;
  const y = (handY - bubble.offsetTop - height) * pose.grab + pose.y;
  const heldWidth = width + (52 - width) * pose.grab;
  const heldHeight = height + (28 - height) * pose.grab;
  const scaleX = (heldWidth + (13 - heldWidth) * pose.crumple) / width;
  const scaleY = (heldHeight + (13 - heldHeight) * pose.crumple) / height;
  bubble.style.transform = `translate(${x}px, ${y}px) rotate(${pose.rotation}deg) scale(${scaleX}, ${scaleY})`;
  bubble.style.opacity = pose.visible && elapsed < 2600 ? '1' : '0';
  bubble.style.setProperty('--paper-fold', pose.crumple);
  const workstation = pet.querySelector('.workstation');
  let paper = workstation.querySelector('.departure-paper');
  if (!paper) {
    paper = document.createElement('span');
    paper.className = 'departure-paper'; paper.setAttribute('aria-hidden', 'true');
    paper.innerHTML = '<svg viewBox="0 0 64 64" preserveAspectRatio="none"><defs><radialGradient id="paper-shade-' + avatarHistory.get(el.agent.id) + '"><stop stop-color="#30343b"/><stop offset="1" stop-color="#08090d"/></radialGradient></defs><polygon class="paper-outline" fill="url(#paper-shade-' + avatarHistory.get(el.agent.id) + ')" stroke="#4c5260" stroke-width="1.5" stroke-linejoin="round"/><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="#565c67" stroke-width="1.6" d="M9 18 27 24 19 39 33 34 44 49 51 39M27 24 38 9M33 34 48 25 57 28M19 39 12 51"/><path stroke="#050609" stroke-width="3" d="m14 12 13 12 21 1-7 15 9 14M27 24l6 10-4 21"/><path stroke="#737985" stroke-opacity=".6" stroke-width="1" d="m15 17 10 9-7 11m17-4 11-6m-11 9 8 12"/></g></svg>';
    workstation.append(paper);
  }
  const sheet = OverlayDeparture.paperPose(elapsed, reduced, canvas.dataset.animal);
  paper.hidden = !sheet.visible;
  paper.dataset.form = sheet.fold < 1 ? 'sheet' : 'ball';
  paper.style.width = sheet.width + 'px'; paper.style.height = sheet.height + 'px';
  const placement = OverlayAvatars.layout(canvas.dataset.animal, '../' + el.departureFile);
  // Map the exact sprite-space hand centre through the canvas registration.
  paper.style.left = (placement.x + sheet.handX * placement.scale - 40) / 256 * 100 + '%';
  paper.style.top = (placement.y + sheet.handY * placement.scale) / 256 * 100 + '%';
  paper.style.marginLeft = -sheet.width / 2 + 'px'; paper.style.marginTop = -sheet.height / 2 + 'px';
  paper.style.transform = `translate(${sheet.x}px, ${sheet.y}px) rotate(${sheet.rotation}deg)`;
  paper.dataset.frame = sheet.frame;
  paper.dataset.released = sheet.released;
  canvas.style.translate = `${-OverlayAvatars.walk(canvas, elapsed, reduced).x}px 0`;
  // The edges buckle inward as the sheet becomes a compact irregular ball.
  const flat = [[2,2],[22,1],[43,2],[62,1],[63,21],[62,42],[63,62],[42,63],[21,62],[1,63],[2,42],[1,21]];
  const ball = [[10,8],[26,3],[40,7],[53,13],[60,26],[55,40],[46,55],[32,61],[17,54],[6,44],[3,29],[7,19]];
  paper.querySelector('.paper-outline').setAttribute('points', flat.map(([x,y], i) => `${x+(ball[i][0]-x)*sheet.fold},${y+(ball[i][1]-y)*sheet.fold}`).join(' '));

}
function layout() {
  requestAnimationFrame(() => {
    const main = document.querySelector('main');
    // Report visible controls only; the gaps and transparency pass clicks through.
    const rects = [...document.querySelectorAll('header, .bubble, .pet, #more:not([hidden])')].map((el) => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const naturalHeight = document.querySelector('header').offsetHeight + document.querySelector('#agents').scrollHeight + document.querySelector('footer').offsetHeight + 49;
    window.overlay?.layout(naturalHeight, rects);
  });
}
function render(state) {
  if (!state) return; lastState = state;
  clearTimeout(departureTimer);
  const agents = (state.agents || []).map(a => OverlayDeparture.select(a, Date.now())).filter(a => a && (a.state !== 'departing' || OverlayDeparture.stage(Date.now() - a.departureAt) !== 'gone'));
  const list = document.querySelector('#agents');
  if (agents.some(a => a.state === 'departing')) departureTimer = setTimeout(() => render(lastState), 33);
  document.body.classList.toggle('collapsed', !!state.collapsed);
  document.querySelector('#title').textContent = state.demo ? 'DÉMO DES AGENTS' : 'AGENTS EN DIRECT';
  document.querySelector('#count').textContent = agents.length || '';
  document.querySelector('#collapse').textContent = state.collapsed ? '+' : '−';
  document.querySelector('#collapse').setAttribute('aria-label', state.collapsed ? 'Afficher les bulles' : 'Réduire les bulles');
  page = Math.min(page, Math.max(0, Math.ceil(agents.length / 4) - 1));
  document.querySelector('#more').hidden = agents.length <= 4;
  document.querySelector('#more').textContent = 'Suivants · ' + (page + 1) + '/' + Math.ceil(agents.length / 4);
  const visible = agents.length ? agents.slice(page * 4, page * 4 + 4) : [{ id: 'empty', name: 'Tes agents', state: 'idle', text: 'Prêt. Lance un travail dans Codex ou Claude Code.', session: 'Les agents apparaîtront ici.', detail: 'Lecture automatique des journaux locaux. Sources et démo disponibles dans la barre de menus.' }];
  const pool = agents.length && agents.length <= OverlayAvatars.animals.length ? agents : visible;
  const assigned = OverlayAvatars.allocate(pool.map(a => a.id), avatarHistory);
  for (const [id, choice] of assigned) avatarHistory.set(id, choice);
  for (const id of avatarHistory.keys()) if (id !== 'empty' && !agents.some(a => a.id === id)) avatarHistory.delete(id);
  const nodes = visible.map(card);
  // Keep existing nodes and animations alive across polls.
  for (const child of [...list.children]) if (!nodes.includes(child)) child.remove();
  nodes.forEach((node, index) => { if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null); });
  for (const [id, el] of elements) if (!visible.some((a) => a.id === id)) {
    if (el.departureImage) el.departureImage.src = '';
    elements.delete(id);
  }
  layout();
}
document.querySelector('#collapse').onclick = () => window.overlay?.collapse();
const handle = document.querySelector('header');
let dragPointer = null;
handle.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('button') || !window.overlay) return;
  event.preventDefault(); handle.setPointerCapture(event.pointerId);
  dragPointer = event.pointerId;
  document.body.classList.add('dragging'); window.overlay.dragStart(event.screenX, event.screenY);
});
function stopDrag() {
  if (!document.body.classList.contains('dragging')) return;
  document.body.classList.remove('dragging');
  const pointer = dragPointer; dragPointer = null;
  if (pointer != null && handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
  window.overlay?.dragStop();
}
window.addEventListener('pointerup', stopDrag, true);
window.addEventListener('pointercancel', stopDrag, true);
window.addEventListener('blur', stopDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopDrag(); });
handle.addEventListener('lostpointercapture', stopDrag);
window.overlay?.onDragEnd(stopDrag);
window.addEventListener('pointermove', (event) => {
  if (dragPointer != null) {
    if (!(event.buttons & 1)) stopDrag();
    else window.overlay?.dragMove(event.screenX, event.screenY, event.buttons);
  }
  if (event.target.closest('header, .bubble, .pet, #more')) window.overlay?.pointer();
});
document.querySelector('#more').onclick = () => { page = (page + 1) % Math.ceil(lastState.agents.length / 4); render(lastState); };
window.addEventListener('resize', layout);
if (window.overlay) { window.overlay.onState(render); window.overlay.snapshot().then(render); }
else render({ agents: [], collapsed: false });

OverlayAvatars.start();
