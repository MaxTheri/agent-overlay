'use strict';
const OverlayMotion = (() => {
  const catalog = typeof module !== 'undefined' ? require('../overlay/animal-catalog').catalog() : AnimalCatalog;
  const FRAME_COUNT = catalog.frameCount, FRAME_MS = catalog.frameMs;
  function clips(animal = Object.keys(catalog.animals)[0]) {
    const result = {};
    for (const [group, variants] of Object.entries(catalog.animals[animal])) for (const variant of variants) {
      result[`${group}/${variant.name}`] = Array.from({ length: FRAME_COUNT }, (_, index) => ({
        file: variant.file, column: index, ms: FRAME_MS, gesture: group, variant: variant.name,
      }));
    }
    return result;
  }
  function random(seed) {
    let state = 2166136261;
    for (const c of String(seed)) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
    return () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }
  function createPlayer(seed, animal = Object.keys(catalog.animals)[0]) {
    const definitions = clips(animal), groups = catalog.animals[animal], rng = random(seed);
    let mode, sequence = [], cursor = 0, first = true, lastFile = '', lastGroup = '', pauseAfter = 0;
    function choose() {
      const shared = groups.common.filter(variant => variant.name !== 'intro');
      const group = mode !== 'end' && !first && lastGroup !== 'common' && shared.length && rng() < .2 ? 'common' : mode;
      let variants = groups[group].filter(variant => variant.name !== 'intro');
      const alternatives = variants.filter(variant => variant.file !== lastFile);
      if (alternatives.length) variants = alternatives;
      const chosen = variants[Math.floor(rng() * variants.length)];
      sequence = definitions[`${group}/${chosen.name}`].slice();
      // Shared gestures play once from the beginning, then resume the main group.
      if (group !== 'common') {
        const offset = Math.floor(rng() * sequence.length);
        sequence = [...sequence.slice(offset), ...sequence.slice(0, offset)];
      }
      if (group === 'end' && chosen.name === 'console' && lastFile !== chosen.file && definitions['end/intro']) {
        sequence = [...definitions['end/intro'], ...sequence];
      }
      pauseAfter = group === 'common' ? 400 + rng() * 800 : mode === 'end' ? 5000 + rng() * 9000
        : mode === 'waiting' ? 1500 + rng() * 3500 : rng() < .4 ? 180 + rng() * 420 : 0;
      lastFile = chosen.file; lastGroup = group; first = false;
    }
    function sample(nextMode, elapsed, reduced = false) {
      nextMode = catalog.actions.includes(nextMode) ? nextMode : 'end';
      if (reduced) {
        const preferred = { activity: 'keyboard', thinking: 'thought', waiting: 'wave-classic', end: 'console' }[nextMode];
        const chosen = groups[nextMode].find(variant => variant.name === preferred) || groups[nextMode].find(variant => variant.name !== 'intro');
        return { file: chosen.file, column: Math.min(chosen.frames - 1, { activity: 0, thinking: 20, waiting: 25, end: 25 }[nextMode]),
          ms: 0, gesture: nextMode, variant: chosen.name };
      }
      elapsed = Math.max(0, elapsed);
      if (mode !== nextMode || elapsed < cursor) {
        mode = nextMode; cursor = 0; first = true; lastFile = ''; lastGroup = ''; choose();
      }
      let duration = sequence.length * FRAME_MS + pauseAfter;
      while (elapsed >= cursor + duration) {
        cursor += duration; choose(); duration = sequence.length * FRAME_MS + pauseAfter;
      }
      return sequence[Math.min(sequence.length - 1, Math.floor((elapsed - cursor) / FRAME_MS))];
    }
    return { sample };
  }
  return { catalog, FRAME_COUNT, FRAME_MS, clips, createPlayer,
    sample: (motion, elapsed, reduced = false, seed = 'preview', animal) => createPlayer(seed, animal).sample(motion, elapsed, reduced) };
})();
if (typeof module !== 'undefined') module.exports = OverlayMotion;
