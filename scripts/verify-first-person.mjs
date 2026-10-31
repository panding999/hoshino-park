import assert from 'node:assert/strict';
import {RideSession} from '../dist/ride-session.js';
import {createWalker,updateWalker,PLAYER} from '../dist/first-person-physics.js';
import {result as park} from './verify-expansion.mjs';
const advance=(w,input,seconds,obstacles=[])=>{for(let t=0;t<seconds;t+=1/60)updateWalker(w,{yaw:0,...input},1/60,obstacles);};
const w=createWalker(0,4),wall={kind:'box',x:0,z:0,w:8,d:.08};advance(w,{forward:1,run:true},3,[wall]);assert(w.z>=.04+PLAYER.radius-1e-6);
for(let i=0;i<15;i++)updateWalker(w,{yaw:0,forward:1,run:true},.15,[wall]);assert(w.z>=.23-1e-6,'Cannot tunnel through a thin rail');
const slow=createWalker(),fast=createWalker(),diagonal=createWalker();advance(slow,{forward:1},1);advance(fast,{forward:1,run:true},1);advance(diagonal,{forward:1,side:1},1);assert(fast.distance>slow.distance*1.5);assert(Math.abs(diagonal.distance-slow.distance)<1e-6);
updateWalker(w,{yaw:0,jump:true},.1,[]);assert(w.y>PLAYER.ground);advance(w,{},1);assert(w.grounded);assert.equal(w.y,PLAYER.ground);
const circle=createWalker(0,3);advance(circle,{forward:1},3,[{kind:'circle',x:0,z:0,r:1}]);assert(circle.z>=1.19-1e-6);
const cycles={};
for(const id of ['coaster','ship','carousel','bumper','wheel']){
 const s=new RideSession(id,{length:park.trackLength});s.board();assert(!s.start());
 if(id==='wheel')s.wheelArrived();else{for(let i=0;i<1800&&s.phase!=='ready';i++)s.update(1/120);assert.equal(s.phase,'ready');assert.equal(s.boarded,s.npcCount);assert(s.start());}
 let peak=0,early=0,late=0,speed=0;
 for(let i=0;i<24000&&s.phase!=='complete';i++){const slope=park.trackFrame((8.84+s.travelled)/park.trackLength).forward.y;s.update(1/120,{slope});peak=Math.max(peak,Math.abs(s.angle));speed=Math.max(speed,s.speed);if(s.elapsed<5)early=Math.max(early,Math.abs(s.angle));if(s.elapsed>57)late=Math.max(late,Math.abs(s.angle));}
 assert.equal(s.phase,'complete',`${id} must stop and allow disembarking`);assert(s.canLeave);
 if(id==='ship'){assert(peak>.45);assert(early<peak*.3);assert(late<peak*.2);}
 if(id==='coaster'){assert.equal(s.travelled,park.trackLength);assert(speed>9);}
 if(id==='wheel')assert(Math.abs(s.elapsed-Math.PI*2/.065)<.02);
 if(id==='bumper'||id==='carousel')assert(s.elapsed>=60&&s.elapsed<63);
 cycles[id]={seconds:+s.elapsed.toFixed(2),peakAngle:+peak.toFixed(3),peakSpeed:+speed.toFixed(2)};
}
console.log(JSON.stringify({walkingCollision:true,runJump:true,rideCycles:cycles}));
