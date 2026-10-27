const test=require('node:test'),assert=require('node:assert/strict');
const departure=require('../public/overlay-departure'),{select}=require('../overlay/activity');
const now=1000000;
test('four transparent departure strips each contain sixteen cells',()=>{
 const fs=require('fs'),path=require('path');
 for(const animal of ['ratel','renard','firefox','capybara']){
  const h=fs.readFileSync(path.join(__dirname,'../public/scenes/departures',animal+'.png'));
  assert.equal(h.readUInt32BE(16),4096);assert.equal(h.readUInt32BE(20),256);assert.equal(h[25],6);
 }
});
test('finished agents rest two minutes, depart once, then disappear',()=>{
 const a={id:'one',state:'done',lastTs:now};
 assert.equal(select([a],now+119999)[0].state,'done');
 assert.equal(select([a],now+120000)[0].departureAt,now+120000);
 assert.equal(select([a],now+120000+departure.durationMs-1)[0].state,'departing');
 assert.deepEqual(select([a],now+120000+departure.durationMs),[]);assert.deepEqual(select([a],now+900000),[]);
});
test('active agents and user requests stay; new work cancels departure',()=>{
 for(const state of ['working','thinking','blocked','waiting','error']){
  const a={id:state,state,lastTs:now,activeTurn:true};assert.equal(select([a],now+121000)[0].state,state);
 }
 assert.equal(departure.select({state:'done',lastTs:now,activeTurn:true},now+121000).state,'done');
 assert.equal(departure.select({state:'working',lastTs:now+121000},now+121001).state,'working');
});
test('stand, grab the discussion, crumple, throw, then leave',()=>{
 assert.deepEqual([0,1600,2600,4600,6200,departure.durationMs].map(departure.stage),['standing','grabbing','crumpling','throwing','leaving','gone']);
 assert.deepEqual([0,400,800,1200,1600,2100,2600,2780,4600,5000,5400,5800,6200].map(t=>departure.departureFrame(t)),[0,1,2,3,4,5,8,9,4,5,6,7,0]);
 assert.equal(departure.reactionFrame('departure',2780),9);
});
test('the discussion reaches the hands, becomes paper, and is thrown before walking',()=>{
 assert.equal(departure.bubblePose(0).grab,0);
 assert.equal(departure.bubblePose(2600).grab,1);
 assert.equal(departure.bubblePose(2600).crumple,0);
 assert.equal(departure.bubblePose(4600).crumple,1);
 assert.equal(departure.bubblePose(5400).x,0);
 assert.ok(departure.bubblePose(5800).x>0);
 assert.ok(departure.bubblePose(5800).y<0);
 assert.equal(departure.bubblePose(6200).visible,false);
 assert.equal(departure.bubblePose(9000).visible,false);
 assert.equal(departure.travel(6199),0);assert.ok(departure.travel(8000)>0);assert.equal(departure.travel(departure.durationMs),1);
});
test('reduced motion shows stage poses and hides the paper after the throw',()=>{
 assert.deepEqual([0,2000,3000,5000,7000].map(t=>departure.departureFrame(t,true)),[3,4,10,7,0]);
 assert.equal(departure.travel(9000,true),0);
 assert.equal(departure.bubblePose(3000,true).crumple,1);
 assert.equal(departure.bubblePose(5800,true).visible,false);
});

test('black paper takes over the bubble, squeezes with the hands, and stays a ball during the throw',()=>{
 assert.equal(departure.paperPose(2599).visible,false);
 const sheet=departure.paperPose(2600),squeeze=departure.paperPose(2780),ball=departure.paperPose(4600);
 assert.equal(sheet.visible,true);assert.equal(sheet.fold,0);assert.equal(sheet.width,52);
 assert.ok(squeeze.width<sheet.width);assert.notEqual(squeeze.rotation,sheet.rotation);
 assert.equal(ball.fold,1);assert.equal(ball.width,19);assert.equal(ball.height,18);
 assert.equal(departure.paperPose(5800).fold,1);assert.ok(departure.paperPose(5800).x>ball.x);
 assert.equal(departure.paperPose(6200).visible,false);
 assert.equal(departure.paperPose(3000,true).width,19);
 assert.equal(departure.paperPose(5800,true).visible,false);
});

test('each character holds the paper on its hand pose until its own open-hand frame',()=>{
 const releases={ratel:5400,renard:5400,firefox:5800,capybara:5800};
 for(const [animal,release] of Object.entries(releases)) {
  for(const time of [4600,4999,5000,5399,5400,5799,5800,6000]) {
   const pose=departure.paperPose(time,false,animal);
   assert.equal(pose.frame,departure.departureFrame(time),animal);
   assert.equal(pose.released,time>=release,animal);
   if(time<release){assert.equal(pose.x,0,animal);assert.equal(pose.y,0,animal);}
  }
  const at=departure.paperPose(release,false,animal),after=departure.paperPose(release+80,false,animal);
  assert.equal(at.x,0);assert.equal(at.y,0);
  assert.ok(after.x>0);assert.ok(after.y<0);
  assert.equal(after.handX,at.handX);assert.equal(after.handY,at.handY);
  assert.equal(departure.paperPose(release-1,true,animal).visible,true);
  assert.equal(departure.paperPose(release,true,animal).visible,false);
 }
 // Firefox draws its wind-up behind the body; Capybara draws it near the chest.
 assert.ok(departure.paperPose(5000,false,'firefox').handX<100);
 assert.ok(departure.paperPose(5400,false,'capybara').handX<100);
});

test('walking alternates full left/right steps and locks the gait phase to distance',()=>{
 const duration=departure.durationMs-departure.walkStart;
 for(const distance of [350,500]) for(const stride of [44,48]) {
  for(let frame=0;frame<8;frame++) {
   const t=departure.walkStart+(frame+.1)/8*stride/distance*duration;
   const pose=departure.walkPose(t,distance,stride);
   assert.equal(pose.frame,frame);
   assert.ok(Math.abs(pose.x-(frame+.1)/8*stride)<1e-8);
  }
  const at=departure.walkPose(departure.walkStart+stride/distance*duration,distance,stride);
  assert.ok(Math.abs(at.phase-1)<1e-8);
 }
 assert.equal(departure.walkPose(6199).x,0);
 assert.equal(departure.walkPose(departure.durationMs).x,500);
 assert.deepEqual(departure.walkPose(10000,500,48,true),{x:0,phase:0,frame:0});
});
