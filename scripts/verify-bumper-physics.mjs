import assert from 'node:assert/strict';
import {createBumperBody,createBumperWorld,BUMPER_BOUNDS as bounds,BUMPER_SHAPE as shape} from '../dist/bumper-physics.js';
const body=o=>createBumperBody({controller:'player',...o});
const energy=bodies=>bodies.reduce((sum,b)=>sum+.5*(b.vx*b.vx+b.vz*b.vz+b.omega*b.omega/b.invInertia),0);
const advance=(world,seconds,h=1/60)=>{for(let i=0;i<Math.round(seconds/h);i++)world.update(h);};
const caps=b=>[-1,1].map(s=>({x:b.x+Math.sin(b.angle)*s*shape.halfSpan,z:b.z+Math.cos(b.angle)*s*shape.halfSpan}));

const headOn=[body({x:13,z:9.5,angle:Math.PI/2,vx:1}),body({x:17,z:9.5,angle:-Math.PI/2,vx:-1})];
const headWorld=createBumperWorld(headOn,{drag:false}),initialEnergy=energy(headOn);
advance(headWorld,1.4);
assert(headOn[0].vx<0&&headOn[1].vx>0,'Head-on cars should separate after impact');
assert(energy(headOn)<initialEnergy*.3,'Rubber impact should dissipate energy');
assert(Math.abs(headOn[0].vx+headOn[1].vx)<1e-8,'Pair impulse should conserve linear momentum');

const sideImpact=[body({x:13,z:9,angle:Math.PI/2,vx:1.5}),body({x:16,z:9.65,angle:0})];
const sideWorld=createBumperWorld(sideImpact,{drag:false});advance(sideWorld,1.4);
assert(sideImpact.some(b=>Math.abs(b.omega)>.05),'Off-centre contact must generate angular response');
assert(energy(sideImpact)<=1.125+.001,'Collision must not create kinetic energy');

const wallBody=body({x:bounds.maxX-1.75,z:9.5,angle:Math.PI/2,vx:1}),wall=createBumperWorld([wallBody],{drag:false});
advance(wall,1);assert(wallBody.vx<0,'Wall must give a damped rebound');
assert(Math.abs(wallBody.angle-Math.PI/2)<.05,'A wall impact must not snap heading to reversed velocity');
const frozen=JSON.stringify(wallBody);wall.update(0);assert.equal(JSON.stringify(wallBody),frozen);

const initial=Array.from({length:8},(_,i)=>({x:18+(i%4-1.5)*3.9,z:11+(i<4?-5:5),angle:i*2.4,id:i}));
const cars=initial.map(createBumperBody),crowd=createBumperWorld(cars);let maximumOverlap=0,totalSpeed=0,maxStall=0,maxLean=0;const stalled=Array(8).fill(0);
for(let frame=0;frame<7200;frame++){
  crowd.update(1/60);
  cars.forEach((b,i)=>{const speed=Math.hypot(b.vx,b.vz);totalSpeed+=speed;stalled[i]=speed<.15?stalled[i]+1/60:0;maxStall=Math.max(maxStall,stalled[i]);maxLean=Math.max(maxLean,Math.abs(b.lean));});
  for(const b of cars){
    assert([b.x,b.z,b.vx,b.vz,b.angle,b.omega].every(Number.isFinite));
    for(const c of caps(b)){assert(c.x-shape.radius>=bounds.minX-.015&&c.x+shape.radius<=bounds.maxX+.015);assert(c.z-shape.radius>=bounds.minZ-.015&&c.z+shape.radius<=bounds.maxZ+.015);}
  }
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)for(const a of caps(cars[i]))for(const b of caps(cars[j]))maximumOverlap=Math.max(maximumOverlap,shape.radius*2-Math.hypot(a.x-b.x,a.z-b.z));
}
assert(maximumOverlap<.04,`Persistent body overlap: ${maximumOverlap}`);
assert(totalSpeed/(7200*8)>.65,'Traffic should keep moving');assert(maxStall<3,'NPCs must escape sustained jams');assert(maxLean>.04&&maxLean<=.28,'Passenger must visibly lean without falling out');
const makeWorld=()=>createBumperWorld(initial.map(createBumperBody));
const slow=makeWorld(),fast=makeWorld();advance(slow,10,1/30);advance(fast,10,1/144);
for(let i=0;i<8;i++)assert(Math.hypot(slow.bodies[i].x-fast.bodies[i].x,slow.bodies[i].z-fast.bodies[i].z)<1e-7,'Simulation should be independent of render frame rate');
console.log(JSON.stringify({headOn:'damped',sideImpact:'angular response',wall:'no heading snap',paused:true,simulationSeconds:120,maxOverlap:+maximumOverlap.toFixed(4),frameRateIndependent:true,averageSpeed:+(totalSpeed/(7200*8)).toFixed(2),maxStallSeconds:+maxStall.toFixed(2),maxPassengerLean:+maxLean.toFixed(3)}));
