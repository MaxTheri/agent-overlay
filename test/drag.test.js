const test = require('node:test'), assert = require('node:assert/strict');
const { DragController } = require('../overlay/drag');
test('a missing pointerup is recovered by the first move with the button released', () => {
  const drag = new DragController(); drag.start({ x: 500, y: 300 }, { x: 400, y: 250 });
  assert.deepEqual(drag.move({ x: 600, y: 350 }, 1), { x: 500, y: 300 });
  assert.equal(drag.move({ x: 900, y: 500 }, 0), null);
  assert.equal(drag.active, false);
  assert.equal(drag.move({ x: 1000, y: 600 }, 0), null);
  assert.equal(drag.move({ x: 1000, y: 600 }, 1), null);
});
test('moving a window does not accumulate relative-coordinate offsets', () => {
  const drag = new DragController(); drag.start({ x: 500, y: 300 }, { x: 400, y: 250 });
  assert.deepEqual(drag.move({ x: 600, y: 350 }, 1), { x: 500, y: 300 });
  assert.deepEqual(drag.move({ x: 650, y: 350 }, 1), { x: 550, y: 300 });
  drag.stop(); assert.equal(drag.move({ x: 800, y: 400 }, 1), null);
});
test('a fresh press starts a new drag; the right button alone cannot move it', () => {
  const drag = new DragController(); drag.start({ x: -300, y: 80 }, { x: -450, y: 40 });
  assert.equal(drag.move({ x: -200, y: 100 }, 2), null);
  drag.start({ x: -200, y: 100 }, { x: -450, y: 40 });
  assert.deepEqual(drag.move({ x: -180, y: 110 }, 1), { x: -430, y: 50 });
});
