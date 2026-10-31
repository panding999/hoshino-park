import assert from 'node:assert/strict';
import {park,colliders,platforms} from './verify-park-access.mjs';
import {PLAYER,createWalker,resolveWalker,updateWalker,supportHeight,surfaceContains} from '../dist/first-person-physics.js';
const surfaces=platforms.surfaces,beds=park.landscaping.beds;
const nearby=(x,z,r=1.5)=>colliders.filter(c=>Math.abs(c.x-x)<(c.w||c.r*2)/2+r&&Math.abs(c.z-z)<(c.d||c.r*2)/2+r);
const clear=(x,z,y,obstacles)=>{const w={...createWalker(x,z),y},p={x,z};resolveWalker(w,obstacles);return Math.hypot(w.x-p.x,w.z-p.z)<1e-6;};
let landings=0,edgeCrossings=0;
for(const {floor:s} of beds){
 let bedLandings=0;
 // Drop onto every unobstructed part of the real lawn with trees/rails still present.
 for(let x=s.x-s.w/2+.26;x<s.x+s.w/2-.25;x+=.6)for(let z=s.z-s.d/2+.26;z<s.z+s.d/2-.25;z+=.6){
  if(!surfaceContains(s,x,z))continue;
  const obstacles=nearby(x,z),y=supportHeight({x,z,y:s.y},surfaces,s.y+.205);
  if(Array.from({length:13},(_,i)=>y+i*.05).some(h=>!clear(x,z,h,obstacles)))continue;
  const w={...createWalker(x,z),y:y+.55,grounded:false};
  for(let i=0;i<35;i++)updateWalker(w,{yaw:0},1/30,obstacles,surfaces);
  assert(w.grounded,'Landing on grass must establish ground contact');
  assert(Math.abs(w.y-y)<1e-6,`Grass height at ${x},${z}: expected ${y}, got ${w.y}`);
  assert(Math.hypot(w.x-x,w.z-z)<1e-6,`Landing ejected at ${x},${z} floor ${y} to ${w.x},${w.z}`);
  bedLandings++;landings++;
 }
 assert(bedLandings>0,`No walkable portion of lawn at ${s.x},${s.z}`);
 let crossed=0;
 for(const [nx,nz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const f of [-.3,0,.3]){
  const ex=s.x+nx*s.w/2+nz*s.w*f,ez=s.z+nz*s.d/2+nx*s.d*f,obstacles=nearby(ex,ez,2);
  let open=true;
  for(let t=-.6;t<=.85;t+=.05){const x=ex-nx*t,z=ez-nz*t,y=supportHeight({x,z,y:s.y},surfaces,s.y+.205);if(!clear(x,z,y,obstacles))open=false;}
  if(!open)continue;
  // Walk, sprint and jump across the curb, then return to the path. Low-frame-rate
  // steps exercise the same swept movement used during a busy fireworks scene.
  for(const input of [{run:false,jump:false},{run:true,jump:false},{run:true,jump:true}]){
   const x=ex+nx*.55,z=ez+nz*.55,w=createWalker(x,z);w.y=supportHeight(w,surfaces,s.y+.205);
   const yaw=Math.atan2(nx,nz),speed=input.run?PLAYER.run:PLAYER.walk;
   let jumped=false;
   for(let t=0;t<(1.25/speed+.07);t+=1/60){updateWalker(w,{forward:1,yaw,run:input.run,jump:input.jump&&!jumped},1/60,obstacles,surfaces);jumped=true;}
   for(let i=0;i<16;i++)updateWalker(w,{yaw},.1,obstacles,surfaces);
   assert(w.grounded&&surfaceContains(s,w.x,w.z),'Player should settle inside the lawn');
   const target=supportHeight(w,surfaces,w.y+.02);assert(Math.abs(w.y-target)<1e-6);
   for(let t=0;t<1.7/speed+.1;t+=1/60)updateWalker(w,{forward:-1,yaw,run:input.run},1/60,obstacles,surfaces);
   assert((w.x-ex)*nx+(w.z-ez)*nz>.2,'Player must be able to leave the lawn');
   edgeCrossings++;
  }
  crossed++;break;
 }
 assert(crossed>0,`No passable edge on lawn at ${s.x},${s.z}`);
}
// A rounded corner cannot act like an invisible square platform.
const corner={kind:'roundedBox',x:0,z:0,w:2,d:2,r:.5,y:.43};
assert.equal(surfaceContains(corner,.99,.99),false);assert.equal(supportHeight({x:.99,z:.99,y:.43},[corner]),PLAYER.ground);
const trunk=colliders.find(c=>c.x< -12.8&&c.x> -13.2&&c.z>26.8&&c.z<27.2&&c.maxY>1);
assert(trunk,'Arrival garden must keep its physical tree trunk');assert(!clear(trunk.x,trunk.z,.43,[trunk]),'Trees remain solid');
console.log(JSON.stringify({lawns:beds.length,landingSamples:landings,walkRunJumpCrossings:edgeCrossings,treeCollision:true,roundedCorners:true}));
