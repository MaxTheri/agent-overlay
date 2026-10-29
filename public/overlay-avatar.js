'use strict';
// Actual frame animation; the desk remains a separate stationary layer.
const OverlayAvatars = (() => {
  const motions = typeof module !== 'undefined' ? require('./overlay-motion') : OverlayMotion;
  const animals = Object.keys(motions.catalog.animals), actions = motions.catalog.actions;
  function variant(id) {
    let hash = 0;
    for (const c of String(id)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return hash % animals.length;
  }
  function motion(agent) {
    if (agent.state === 'blocked') return 'waiting';
    if (agent.state === 'thinking') return 'thinking';
    if (['working', 'waiting'].includes(agent.state) || (agent.state === 'error' && agent.activeTurn)) return 'activity';
    return 'end';
  }
  function allocate(ids, previous = new Map()) {
    const result = new Map(), used = new Set();
    for (const id of ids) {
      const choice = previous.get(id);
      if (Number.isInteger(choice) && choice >= 0 && choice < animals.length && !used.has(choice)) { result.set(id, choice); used.add(choice); }
    }
    for (const id of ids) if (!result.has(id)) {
      const preferred = variant(id);
      const choice = Array.from({ length: animals.length }, (_, i) => (preferred+i)%animals.length).find(i => !used.has(i));
      if (choice === undefined) throw new Error('Trop d’avatars sur une page.');
      result.set(id, choice); used.add(choice);
    }
    return result;
  }
  function layout(animal, file = '') {
    const registration = motions.catalog.layout?.[file];
    const scale = registration?.scale || 1;
    // Reserve horizontal room for tails without shrinking a whole character.
    if (file.startsWith('../scenes/walks/')) return { scale: 1, x: 40, y: 0, size: 256, deskY: motions.catalog.layout?.[`${animal}/end/console.png`]?.deskY || 205 };
    const departureDesk = file.startsWith('../scenes/departures/') ? motions.catalog.layout?.[`${animal}/end/console.png`]?.deskY : undefined;
    const deskY = departureDesk ?? registration?.deskY ?? (file.startsWith('../scenes/') ? 174 : { capybara: 196, firefox: 209, ratel: 209, renard: 205 }[animal] || 205);
    return { scale, x: 168 - 128 * scale, y: (registration?.baseline ?? 242) - 242 * scale, size: 256 * scale, deskY };
  }
  function legs(y) {
    return `M42 ${y+10}h12l-15 ${246-y-10}H27zM208 ${y+10}h12l12 ${246-y-10}h-12z`;
  }
  function markup(id, animalIndex = variant(id), file = '') {
    const name = animals[animalIndex];
    const { deskY } = layout(name, file);
    return `<div class="workstation" aria-hidden="true"><canvas class="animal-character" width="336" height="256" data-animal="${name}"></canvas><svg class="fixed-desk" viewBox="0 0 256 256" data-desk-y="${deskY}"><g stroke="#403b39" stroke-width="3" stroke-linejoin="round"><path class="desk-legs" fill="#666967" d="${legs(deskY)}"/><g class="desk-surface" transform="translate(0 ${deskY-174})"><path fill="#c99764" d="M22 174l187-8 30 13-193 11-24-7z"/><path fill="#efd0a0" d="M22 174l187-8 30 10-193 9z"/><g class="laptop-open"><path fill="#b2b5bd" d="M47 168h107l15 6-116 5z"/><path fill="#9196a1" d="M23 146q-1-3 3-3h53q3 0 4 3l10 27H34z"/><path fill="#cdd0d6" stroke="none" d="M54 154c-4-3-7 0-6 4 1 4 5 6 8 4 3-2 1-6-2-8z"/></g><g class="laptop-closed"><path fill="#858c96" d="m151 166 63-3 15 8-64 3z"/><path fill="#c6cbd1" d="m151 164 63-3 15 7-64 3z"/></g></g></g></svg><svg class="closed-computer" viewBox="0 0 256 256"><g class="closed-placement" transform="translate(0 ${deskY-174})" stroke="#403b39" stroke-width="2" stroke-linejoin="round"><path fill="#858c96" d="m151 166 63-3 15 8-64 3z"/><path fill="#c6cbd1" d="m151 164 63-3 15 7-64 3z"/></g></svg></div><span class="status-symbol"></span>`;
  }
  function walk(canvas, elapsed, reduced) {
    const list = canvas.closest('#agents').getBoundingClientRect();
    const pet = canvas.closest('.pet').getBoundingClientRect();
    // Cover the distance to the right edge, including the sprite's full width.
    const distance = list.right - pet.left + canvas.offsetWidth;
    const size = canvas.closest('.pet').querySelector('.workstation').offsetWidth;
    return OverlayDeparture.walkPose(elapsed, distance, 48 * size / 96, reduced);
  }
  async function start() {
    const images = new Map(), clocks = new WeakMap();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    function releaseUnused(used) {
      for (const [file, image] of images) if (!used.has(file)) {
        image.onerror = null; image.src = ''; images.delete(file);
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseUnused(new Set());
    });
    function imageFor(file) {
      if (images.has(file)) {
        return images.get(file);
      }
      if (!images.has(file)) {
        const image = new Image();
        image.onerror = () => window.overlayErrors?.push(`Animation indisponible : ${file}`);
        image.src = `animals/${file}`; images.set(file, image);
      }
      return images.get(file);
    }
    let previous = -Infinity;
    function tick(now) {
      const canvases = document.querySelectorAll('.animal-character');
      const departing = [...canvases].some(canvas => canvas.closest('.pet').dataset.motion === 'departure');
      if ((departing || now - previous >= motions.catalog.frameMs) && !document.hidden) {
        previous = now;
        const used = new Set();
        const frames = [];
        for (const canvas of canvases) {
          const motion = canvas.closest('.pet').dataset.motion || 'end';
          let clock = clocks.get(canvas);
          const animal = canvas.dataset.animal;
          if (!clock || clock.animal !== animal) {
            clock = { animal, motion, since: now, key: '', player: motions.createPlayer(canvas.dataset.agent || animal, animal) }; clocks.set(canvas, clock);
          }
          if (clock.motion !== motion) { clock.motion = motion; clock.since = now; clock.key = ''; }
          const elapsed = canvas.dataset.reactionAt ? Date.now() - Number(canvas.dataset.reactionAt) : now - clock.since;
          const reaction = typeof OverlayDeparture !== 'undefined' ? OverlayDeparture.reactionFrame(motion, elapsed, reduced.matches) : null;
          let frame = reaction === null ? clock.player.sample(motion, now - clock.since, reduced.matches)
            : { file: `../scenes/${motion === 'departure' ? 'departures' : motion === 'paper-hit' ? 'impacts' : 'reactions'}/${animal}.png`, column: reaction, gesture: motion };
          if (motion === 'departure') {
            const walkFile = `../scenes/walks/${animal}.png`;
            if (elapsed >= OverlayDeparture.walkStart) {
              frame = { file: walkFile, column: walk(canvas, elapsed, reduced.matches).frame, gesture: motion };
            } else if (elapsed >= 4600) {
              // Decode the next strip during the throw, before the first step.
              used.add(walkFile); imageFor(walkFile);
            }
          }
          used.add(frame.file); frames.push({ canvas, clock, frame, motion, elapsed });
        }
        // Each decoded strip costs 16 MiB. Drop old variants before loading
        // replacements, retaining only the strips needed by visible avatars.
        releaseUnused(used);
        for (const { canvas, clock, frame, motion, elapsed } of frames) {
          const image = imageFor(frame.file);
          if (!image?.complete || !image.naturalWidth) continue;
          const key = `${frame.file}:${frame.column}`;
          if (motion === 'departure' && typeof updateDeparture === 'function') {
            updateDeparture(canvas.closest('.agent'), elapsed, reduced.matches);
          }
          if (clock.key === key) continue;
          const context = canvas.getContext('2d');
          const placement = layout(canvas.dataset.animal, frame.file);
          context.clearRect(0, 0, 336, 256);
          context.drawImage(image, frame.column * 256, 0, 256, 256, placement.x, placement.y, placement.size, placement.size);
          const desk = canvas.closest('.pet').querySelector?.('.fixed-desk');
          canvas.closest('.pet').classList?.toggle('gaming', /\/end\/(intro|console)\.png$/.test(frame.file));
          if (desk && Number(desk.dataset.deskY) !== placement.deskY) {
            desk.dataset.deskY = placement.deskY;
            desk.querySelector('.desk-surface').setAttribute('transform', `translate(0 ${placement.deskY-174})`);
            desk.querySelector('.desk-legs').setAttribute('d', legs(placement.deskY));
            canvas.closest('.pet').querySelector('.closed-placement')?.setAttribute('transform', `translate(0 ${placement.deskY-174})`);
          }
          canvas.dataset.frame = key; canvas.dataset.gesture = frame.gesture || motion; clock.key = key;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  return { animals, actions, walk, catalog: motions.catalog, variant, allocate, motion, layout, sample: motions.sample, createPlayer: motions.createPlayer, clips: motions.clips, markup, start };
})();
if (typeof module !== 'undefined') module.exports = OverlayAvatars;
