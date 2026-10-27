const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const avatars = require('../public/overlay-avatar');
const { catalog } = require('../overlay/animal-catalog');
const vm = require('node:vm');
const strips = new Map(Object.values(avatars.catalog.animals).flatMap(groups => Object.values(groups).flat()).map(strip => [strip.file, strip]));

test('all measured strips share a body height and foot baseline, with room for tails', () => {
  const measured = avatars.catalog.layout;
  assert.equal(Object.keys(measured).length, strips.size + avatars.animals.length * 3);
  for (const [file, bounds] of Object.entries(measured)) {
    const animal = file.startsWith('../scenes/') ? path.basename(file, '.png') : file.split('/')[0];
    const pose = avatars.layout(animal, file);
    assert.ok(Math.abs(bounds.height * pose.scale - 218) < .001, file);
    assert.ok(Math.abs(pose.y + 242 * pose.scale - (bounds.baseline || 242)) < .001, file);
    assert.ok(pose.x + bounds.left * pose.scale >= 0, file);
    assert.ok(pose.x + bounds.right * pose.scale < 336, file);
  }
  for (const animal of avatars.animals) {
    const deskY = avatars.layout(animal).deskY;
    for (const clip of Object.entries(avatars.catalog.animals[animal]).filter(([group]) => group !== 'end').flatMap(([, clips]) => clips)) assert.equal(avatars.layout(animal, clip.file).deskY, deskY);
    assert.equal(avatars.layout(animal, `../scenes/reactions/${animal}.png`).deskY, 174);
    assert.equal(avatars.layout(animal, `../scenes/departures/${animal}.png`).deskY, avatars.layout(animal, `${animal}/end/console.png`).deskY);
  }
});

test('animation cache releases unused strips, clears on hide, and follows the source cadence', async () => {
  const images = [], listeners = {}, draws = [];
  let tick, file = 'first.png', samples = 0;
  const canvas = { dataset: { animal: 'ratel' }, closest: () => ({ dataset: { motion: 'activity' } }),
    getContext: () => ({ clearRect() {}, drawImage(image) { draws.push(image.src); } }) };
  const document = { hidden: false, addEventListener: (name, fn) => { listeners[name] = fn; }, querySelectorAll: () => [canvas] };
  const context = vm.createContext({ document, window: { matchMedia: () => ({ matches: false }) },
    requestAnimationFrame: fn => { tick = fn; },
    Image: class { constructor() { this.complete = true; this.naturalWidth = 16384; images.push(this); } },
    OverlayMotion: { catalog: { frameMs: 100, animals: { ratel: {} } }, createPlayer: () => ({ sample() { samples++; return { file, column: 0 }; } }) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/overlay-avatar.js'), 'utf8') + '\nOverlayAvatars.start();', context);
  tick(0); tick(16); tick(99);
  assert.equal(samples, 1); assert.equal(images.length, 1);
  tick(100); assert.equal(images.length, 1);
  file = 'next.png'; tick(200);
  assert.equal(images[0].src, ''); assert.equal(images[0].onerror, null);
  assert.deepEqual(draws, ['animals/first.png', 'animals/next.png']);
  document.hidden = true; listeners.visibilitychange();
  assert.equal(images[1].src, ''); tick(400); assert.equal(samples, 3);
  document.hidden = false; tick(500); assert.equal(images.length, 3);
  assert.equal(images[2].src, 'animals/next.png');
});

test('departure paper and sprite sample the same time across release and between strip frames', () => {
  let tick, elapsed = 5399;
  const updates = [], draws = [], agent = {};
  const pet = { dataset: { motion: 'departure' } };
  const canvas = { dataset: { animal: 'renard', reactionAt: 1000000 },
    closest: selector => selector === '.agent' ? agent : pet,
    getContext: () => ({ clearRect() {}, drawImage(image, x) { draws.push(x / 256); } }) };
  const context = vm.createContext({
    document: { hidden: false, addEventListener() {}, querySelectorAll: () => [canvas] },
    window: { matchMedia: () => ({ matches: false }) },
    Date: { now: () => 1000000 + elapsed }, requestAnimationFrame: fn => { tick = fn; },
    Image: class { constructor() { this.complete = true; this.naturalWidth = 4096; } },
    OverlayDeparture: require('../public/overlay-departure'),
    OverlayMotion: { catalog: { frameMs: 111, animals: { renard: {} } }, createPlayer: () => ({}) },
    updateDeparture(el, time) { assert.equal(el, agent); updates.push(time); },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/overlay-avatar.js'), 'utf8') + '\nOverlayAvatars.start();', context);
  tick(0); assert.ok(canvas.dataset.frame.endsWith(':5'));
  elapsed = 5400; tick(1); assert.ok(canvas.dataset.frame.endsWith(':6'));
  elapsed = 5416; tick(17); // Flight keeps moving even though the sprite cell is unchanged.
  assert.deepEqual(draws, [5, 6]);
  assert.deepEqual(updates, [5399, 5400, 5416]);
});

test('four animals have four action groups and a shared gesture folder', () => {
  assert.deepEqual([...avatars.animals].sort(), ['capybara', 'firefox', 'ratel', 'renard']);
  assert.deepEqual(avatars.actions, ['activity', 'thinking', 'waiting', 'end']);
  assert.equal(strips.size, 54);
  for (const strip of strips.values()) assert.equal(strip.frames, 64, strip.file);
  for (const animal of avatars.animals) {
    const groups = avatars.catalog.animals[animal];
    assert.deepEqual(Object.keys(groups), ['activity', 'thinking', 'waiting', 'end', 'common']);
    assert.ok(groups.common.some(clip => clip.name === 'coffee'));
    assert.ok(groups.common.some(clip => clip.name === 'paw-movement'));
    for (const obsolete of ['typing', 'reading', 'idle', 'done', 'coffee', 'problem']) {
      assert.ok(!fs.existsSync(path.join(__dirname, '../public/animals', animal, obsolete)));
    }
  }
});

test('the reprimand uses the same animal strip for surprise and nervous typing, then releases it', () => {
  let tick, motion = 'surprised';
  const images = [], canvas = { dataset: { animal: 'ratel' }, closest: () => ({ dataset: { motion } }),
    getContext: () => ({ clearRect() {}, drawImage() {} }) };
  const context = vm.createContext({ document: { hidden: false, addEventListener() {}, querySelectorAll: () => [canvas] },
    window: { matchMedia: () => ({ matches: false }) }, requestAnimationFrame: fn => { tick = fn; },
    Image: class { constructor() { this.complete = true; this.naturalWidth = 4096; images.push(this); } },
    OverlayDeparture: require('../public/overlay-departure'),
    OverlayMotion: { catalog: { frameMs: 100, animals: { ratel: {} } }, createPlayer: () => ({ sample: () => ({ file: 'idle.png', column: 0 }) }) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/overlay-avatar.js'), 'utf8') + '\nOverlayAvatars.start();', context);
  tick(0); assert.equal(canvas.dataset.gesture, 'surprised'); assert.ok(canvas.dataset.frame.endsWith('ratel.png:0'));
  tick(900); assert.ok(canvas.dataset.frame.endsWith('ratel.png:7'));
  motion = 'typing'; tick(1000); assert.equal(canvas.dataset.gesture, 'typing'); assert.ok(canvas.dataset.frame.endsWith('ratel.png:8'));
  tick(1100); assert.ok(canvas.dataset.frame.endsWith('ratel.png:9')); assert.equal(images.length, 1);
  motion = 'end'; tick(1200); assert.equal(images[0].src, ''); assert.equal(images.length, 2);
});

test('new PNGs are discovered without a manifest and shared gestures are optional', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'animal-catalog-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.cpSync(path.join(__dirname, '../public/animals/ratel'), path.join(folder, 'ratel'), { recursive: true });
  fs.copyFileSync(path.join(folder, 'ratel/activity/keyboard.png'), path.join(folder, 'ratel/activity/new.png'));
  assert.equal(catalog(folder).animals.ratel.activity.length, 5);
  fs.rmSync(path.join(folder, 'ratel/common'), { recursive: true });
  assert.deepEqual(catalog(folder).animals.ratel.common, []);
  const short = path.join(folder, 'ratel/activity/short.png');
  const header = Buffer.from(fs.readFileSync(path.join(folder, 'ratel/activity/keyboard.png')).subarray(0, 24));
  header.writeUInt32BE(256 * 32, 16); fs.writeFileSync(short, header);
  assert.throws(() => catalog(folder), /exactly 64 cells/);
  fs.unlinkSync(short);
  fs.writeFileSync(path.join(folder, 'ratel/activity/broken.png'), 'invalid image');
  assert.throws(() => catalog(folder), /Invalid PNG.*broken/);
});

test('states choose their consolidated animation group', () => {
  for (const kind of ['cmd', 'read', 'edit', 'write', 'web', '']) assert.equal(avatars.motion({ state: 'working', activityKind: kind }), 'activity');
  assert.equal(avatars.motion({ state: 'blocked' }), 'waiting');
  assert.equal(avatars.motion({ state: 'thinking' }), 'thinking');
  assert.equal(avatars.motion({ state: 'waiting' }), 'activity');
  assert.equal(avatars.motion({ state: 'error', activeTurn: true }), 'activity');
  assert.equal(avatars.motion({ state: 'error', activeTurn: false }), 'end');
  for (const state of ['idle', 'done']) assert.equal(avatars.motion({ state }), 'end');
});

test('all groups occasionally play common gestures, return to their group, and preserve snapshot playback', () => {
  for (const animal of avatars.animals) for (const group of avatars.actions.filter(group => group !== 'end')) {
    const player = avatars.createPlayer('shared-test', animal);
    let common = false, resumed = false;
    assert.equal(player.sample(group, 0).gesture, group);
    for (let time = 0; time < 600000; time += 100) {
      const pose = player.sample(group, time), strip = strips.get(pose.file);
      assert.ok(strip); assert.ok(pose.file.startsWith(`${animal}/`));
      assert.ok(pose.column >= 0 && pose.column < strip.frames);
      assert.ok([group, 'common'].includes(pose.gesture));
      if (pose.gesture === 'common') common = true;
      else if (common) resumed = true;
      assert.deepEqual(player.sample(group, time), pose);
    }
    assert.ok(common && resumed, `${animal}/${group}`);
  }
});

test('every strip including common gestures and introductions has one identical duration and cadence', () => {
  const player = avatars.createPlayer('activity-variants', 'ratel'), seen = new Set();
  for (let time = 0; time < 600000; time += 500) seen.add(player.sample('activity', time).variant);
  for (const name of ['keyboard', 'classic', 'stretch', 'book']) assert.ok(seen.has(name));
  for (const animal of avatars.animals) for (const poses of Object.values(avatars.clips(animal))) {
    assert.equal(poses.length, 64);
    assert.ok(poses.every(pose => pose.ms === 160 / (1.2 * 1.2)));
    assert.ok(Math.abs(poses.reduce((duration, pose) => duration + pose.ms, 0) - 10240 / (1.2 * 1.2)) < 1e-8);
    assert.deepEqual(poses.map(pose => pose.column), Array.from({ length: 64 }, (_, index) => index));
  }
});

test('console introductions are chronological and reduced motion holds fixed group poses', () => {
  const player = avatars.createPlayer('console-test', 'ratel');
  let sawIntro = false;
  for (let time = 0; time < 600000; time += 80) {
    const pose = player.sample('end', time);
    if (pose.variant === 'intro') { sawIntro = true; assert.ok(pose.column < 64); }
  }
  assert.ok(sawIntro);
  for (const group of avatars.actions) assert.deepEqual(avatars.sample(group, 0, true), avatars.sample(group, 10000, true));
});

test('finished avatars keep gaming instead of returning to gestures with feet down', () => {
  for(const animal of avatars.animals) {
    const player=avatars.createPlayer('finished',animal);
    for(let time=0;time<120000;time+=300) assert.equal(player.sample('end',time).gesture,'end');
    const markup=avatars.markup(animal,avatars.animals.indexOf(animal));
    assert.ok(markup.includes('class="laptop-open"'));
    assert.ok(markup.includes('class="closed-computer"'));
  }
});

test('colliding identifiers receive distinct animals and keep them after reordering', () => {
  const ids = ['a', 'e', 'i', 'm'];
  assert.equal(new Set(ids.map(avatars.variant)).size, 1);
  const assigned = avatars.allocate(ids);
  assert.equal(new Set(assigned.values()).size, 4);
  assert.deepEqual(avatars.allocate([...ids].reverse(), assigned), new Map([...assigned].reverse()));
});
