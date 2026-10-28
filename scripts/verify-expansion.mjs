import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
const source=(await readFile(new URL('../dist/expansion.js',import.meta.url),'utf8')).replace("from 'three'",`from '${new URL('../dist/vendor/three.module.js',import.meta.url).href}'`);
const resolvedSource=source.replace("from './bumper-physics.js'",`from '${new URL('../dist/bumper-physics.js',import.meta.url).href}'`).replace("from './ride-motion.js'",`from '${new URL('../dist/ride-motion.js',import.meta.url).href}'`);
const {buildExpansion,canUseEntrance}=await import('data:text/javascript;base64,'+Buffer.from(resolvedSource).toString('base64'));
const root=new THREE.Group(),scene=new THREE.Scene();scene.add(root);
const material=new THREE.MeshStandardMaterial();
const object=(p=root,x=0,y=0,z=0)=>{const o=new THREE.Object3D();o.position.set(x,y,z);o.material=material;p.add(o);return o;};
const api={scene,root,mat:()=>material,
  group:(x=0,y=0,z=0,p=root)=>object(p,x,y,z),mesh:(g,m,p,x,y,z)=>object(p,x,y,z),box:(w,h,d,m,p,x,y,z)=>object(p,x,y,z),ball:(r,m,p,x,y,z)=>object(p,x,y,z),cyl:(rt,rb,h,m,p,x,y,z)=>object(p,x,y,z),ring:(r,t,m,p,x,y,z)=>object(p,x,y,z),rounded:(w,d,r,h,m,p,x,y,z)=>object(p,x,y,z),textSign:(text,w,h,p,x,y,z)=>object(p,x,y,z),rod:()=>{},bulb:()=>{},garden:()=>{},tree:()=>{},shrub:()=>{},flowers:()=>{},bench:()=>{},lamp:()=>{},batch:()=>{},visitor:()=>{},walkingRoutes:[]};
const result=buildExpansion(api);
assert.equal(result.entries.length,5);assert.equal(result.coasterCars.length,6);assert.equal(result.bumperCars.length,8);
assert.equal(canUseEntrance('npc','normal'),true);assert.equal(canUseEntrance('npc','vip'),false);assert.equal(canUseEntrance('owner','vip'),true);assert.equal(canUseEntrance('unknown','vip'),false);
assert(result.coasterHeight>24&&result.coasterHeight<27);assert(result.trackLength>150);
const start=result.track.getPointAt(0),end=result.track.getPointAt(1);assert(start.distanceTo(end)<1e-6);
let minimum=Infinity;
const samples=Array.from({length:1200},(_,i)=>result.track.getPointAt(i/1200));
for(const p of samples){assert(Math.abs(p.x)<23&&Math.abs(p.z)<23);assert(p.y>1.3);}
// Non-adjacent track strands must have room for the rail and passenger train.
for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++){
  const distance=Math.min(j-i,samples.length-(j-i))/samples.length*result.trackLength;if(distance<7)continue;
  minimum=Math.min(minimum,samples[i].distanceTo(samples[j]));
}
assert(minimum>1.2,`Track strands are too close: ${minimum}`);
for(const entry of result.entries){assert(entry.normal.route.length>=7);assert(entry.vip.route.length===3);assert(entry.vip.entry[0]!==entry.normal.entry[0]);assert.equal(entry.vip.gateState,'locked');}
for(const actor of result.queueActors){assert.equal(actor.lane,'normal');for(const entry of result.entries){const v=entry.vip.entry;assert(!(Math.abs(actor.position[0]-v[0])<.45&&actor.position[2]<v[2]&&actor.position[2]>entry.vip.route[1][2]),'NPC entered a VIP lane');}}
const p=result.coasterCars[0].position.clone();result.update(0);assert(p.distanceTo(result.coasterCars[0].position)<1e-8);result.update(.1);assert(p.distanceTo(result.coasterCars[0].position)>.01);
for(let i=0;i<3600;i++)result.update(1/60);
for(const car of result.bumperCars){assert(car.g.position.x>8.37&&car.g.position.x<20.03);assert(car.g.position.z>5.60&&car.g.position.z<15.40);}
await writeFile(new URL('../dist/ride-layout.json',import.meta.url),JSON.stringify({version:2,units:'scene units',note:'VIP interaction and authenticated first-person access are not yet implemented. Closed gates and actor access rules are prepared for that phase.',rides:result.entries},null,2)+'\n');
console.log(JSON.stringify({rides:result.entries.length,queuedVisitors:result.queueActors.length,coasterHeight:+result.coasterHeight.toFixed(2),trackLength:+result.trackLength.toFixed(2),minimumTrackClearance:+minimum.toFixed(2),vipNpcBlocked:true,bumperSimulationSeconds:60}));

export {result};
