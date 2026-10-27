'use strict';
const OverlayDeparture = (() => {
  const pauseMs = 2 * 60000, durationMs = 14200;
  const frameCount = 16, walkFrameCount = 8, walkStart = 6200;
  function stage(elapsed) {
    if (elapsed < 1600) return 'standing';
    if (elapsed < 2600) return 'grabbing';
    if (elapsed < 4600) return 'crumpling';
    if (elapsed < 6200) return 'throwing';
    if (elapsed < durationMs) return 'leaving';
    return 'gone';
  }
  function select(agent, now) {
    if (agent.state !== 'done' || agent.activeTurn) return agent;
    const departureAt = agent.lastTs + pauseMs;
    if (now < departureAt) return agent;
    if (now >= departureAt + durationMs) return null;
    return { ...agent, state: 'departing', departureAt };
  }
  function reactionFrame(motion, elapsed, reduced = false) {
    if (motion === 'departure') return departureFrame(elapsed, reduced);
    if (motion === 'paper-hit') return reduced ? 3 : Math.min(7, Math.max(0, Math.floor(elapsed / (950 / 8))));
    if (motion !== 'surprised' && motion !== 'typing') return null;
    if (reduced) return motion === 'surprised' ? 3 : 12;
    return motion === 'surprised' ? Math.min(7, Math.max(0, Math.floor(elapsed / 125)))
      : 8 + Math.floor(Math.max(0, elapsed) / 75) % 8;
  }
  function departureFrame(elapsed, reduced = false) {
    elapsed = Math.max(0, elapsed);
    if (elapsed < 1600) return reduced ? 3 : Math.min(3, Math.floor(elapsed / 400));
    if (elapsed < 2600) return reduced ? 4 : 4 + Math.min(1, Math.floor((elapsed - 1600) / 500));
    if (elapsed < 4600) return reduced ? 10 : 8 + Math.floor((elapsed - 2600) / 180) % 4;
    if (elapsed < 6200) return reduced ? 7 : 4 + Math.min(3, Math.floor((elapsed - 4600) / 400));
    return walkPose(elapsed, 500, 48, reduced).frame;
  }
  function bubblePose(elapsed, reduced = false) {
    const grab = Math.max(0, Math.min(1, (elapsed - 1600) / 1000));
    const crumple = Math.max(0, Math.min(1, (elapsed - 2600) / 1600));
    const flight = Math.max(0, Math.min(1, (elapsed - 5400) / 800));
    if (reduced) return { grab: 0, crumple: elapsed >= 2600 ? 1 : 0, x: 0, y: 0, rotation: 0, visible: elapsed < 5400 };
    return { grab, crumple, x: flight * 230,
      y: -65 * Math.sin(Math.PI * flight),
      rotation: crumple * -18 + flight * 650,
      visible: elapsed < 6200 };
  }
  // Hand centres measured in the original 256px departure cells (frames 4–11).
  const hands = {
    ratel: { releaseAt: 5400, poses: [[190,202],[156,140],[204,145],[187,132],[97,165],[85,163],[90,164],[110,168]] },
    renard: { releaseAt: 5400, poses: [[201,181],[165,144],[202,120],[188,127],[86,151],[77,149],[81,155],[101,151]] },
    firefox: { releaseAt: 5800, poses: [[61,208],[72,155],[192,149],[190,150],[107,166],[112,165],[153,169],[111,160]] },
    capybara: { releaseAt: 5800, poses: [[191,204],[159,148],[85,170],[172,152],[95,164],[99,164],[84,164],[103,177]] },
  };
  function paperPose(elapsed, reduced = false, animal = 'renard') {
    const bubble = bubblePose(elapsed, reduced), config = hands[animal] || hands.renard;
    const frame = departureFrame(elapsed, reduced);
    const fold = bubble.crumple;
    const hand = Math.max(0, frame - 8);
    const squeeze = !reduced && elapsed >= 2600 && elapsed < 4600 ? [0, .14, .03, .19][hand] : 0;
    const flight = reduced ? 0 : Math.max(0, (elapsed - config.releaseAt) / (6200 - config.releaseAt));
    const releaseFrame = departureFrame(config.releaseAt);
    const anchor = config.poses[(elapsed >= config.releaseAt ? releaseFrame : frame) - 4] || config.poses[4];
    return { visible: elapsed >= 2600 && elapsed < (reduced ? config.releaseAt : 6200), fold, frame,
      released: elapsed >= config.releaseAt, releaseAt: config.releaseAt,
      width: (52 - 33 * fold) * (1 - squeeze),
      height: (28 - 10 * fold) * (1 + squeeze * .55),
      handX: anchor[0], handY: anchor[1],
      x: flight * 230, y: flight ? -65 * Math.sin(Math.PI * Math.min(1, flight)) : 0,
      rotation: reduced ? 0 : -18 * fold + flight * 650 + (squeeze ? [-8, 10, -6, 12][hand] : 0) };
  }
  function travel(elapsed, reduced = false) {
    return reduced ? 0 : Math.max(0, Math.min(1, (elapsed - walkStart) / (durationMs - walkStart)));
  }
  function walkPose(elapsed, distance = 500, stride = 48, reduced = false) {
    const x = travel(elapsed, reduced) * distance;
    // One complete left/right cycle covers one stride. Polls and viewport
    // changes cannot start a separate clock for the feet or the translation.
    const phase = x / Math.max(1, stride);
    return { x, phase, frame: reduced ? 0 : Math.floor(phase * walkFrameCount) % walkFrameCount };
  }
  return { pauseMs, durationMs, frameCount, walkFrameCount, walkStart, stage, select, departureFrame, reactionFrame, bubblePose, paperPose, travel, walkPose };
})();
if (typeof module !== 'undefined') module.exports = OverlayDeparture;
