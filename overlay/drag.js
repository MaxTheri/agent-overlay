'use strict';
// Move only in response to a pointer event whose left button is still held.
// A missed release event must never turn cursor polling into a perpetual drag.
class DragController {
  constructor() { this.active = false; }
  start(point, bounds) { this.origin = { ...point }; this.bounds = { ...bounds }; this.active = true; }
  move(point, buttons) {
    if (!this.active) return null;
    if (!(buttons & 1)) { this.stop(); return null; }
    return { x: Math.round(this.bounds.x + point.x - this.origin.x), y: Math.round(this.bounds.y + point.y - this.origin.y) };
  }
  stop() { this.active = false; }
}
module.exports = { DragController };
