import assert from 'node:assert/strict';
import {COMPANION_PALETTES} from '../dist/human.js';
import {park,colliders} from './verify-park-access.mjs';
import {canRoamAt,canRoamBetween,PUBLIC_RIDE_ZONES} from '../dist/ambient-walking.js';
import {createWalker,resolveWalker} from '../dist/first-person-physics.js';
const active=park.walkers.filter(w=>!w.stationary);assert.equal(active.length,5);assert.equal(park.walkers.length,5);park.walkers.forEach((w,i)=>{assert(w.companion);assert.deepEqual(w.human.palette,COMPANION_PALETTES[i]);});
const hits=[];let minimumCarouselDistance=Infinity;
for(let r=0;r<park.walkingRoutes.length;r++)for(let i=0;i<1200;i++){
 const p=park.walkingRoutes[r].curve.getPointAt(i/1200);assert(canRoamAt(p),`route ${r} enters a ride at ${p.x},${p.z}`);
 minimumCarouselDistance=Math.min(minimumCarouselDistance,Math.hypot(p.x-3,p.z-7));
 const w=createWalker(p.x,p.z),near=colliders.filter(c=>Math.abs(c.x-p.x)<(c.w||c.r*2)/2+.3&&Math.abs(c.z-p.z)<(c.d||c.r*2)/2+.3);resolveWalker(w,near,.27);
 if(Math.hypot(w.x-p.x,w.z-p.z)>.025&&!hits.some(h=>h.route===r))hits.push({route:r,point:p.toArray(),delta:[w.x-p.x,w.z-p.z]});
}
assert.deepEqual(hits,[],'Strollers must clear static scenery as well as rides');
assert(!canRoamBetween({x:-4,z:7},{x:10,z:7}),'A large time step cannot skip across the carousel');
for(let t=0;t<900;t+=.1){const previous=park.walkers.map(w=>w.g.position.clone());park.updateVisitors(.1,t);for(const [i,w] of park.walkers.entries()){assert(canRoamAt(w.g.position),'Animated stroller entered a ride');const dx=w.g.position.x-previous[i].x,dz=w.g.position.z-previous[i].z;assert(dx*Math.sin(w.g.rotation.y)+dz*Math.cos(w.g.rotation.y)>=-.000001,'Stroller moved backwards');}}
assert.equal(park.expansion.queueActors.length,39,'Keep the ride queues');
console.log(JSON.stringify({movingVisitors:active.length,restingVisitors:0,queueVisitors:39,curveSamples:park.walkingRoutes.length*1200,simulationSeconds:900,carouselEdgeClearance:+(minimumCarouselDistance-PUBLIC_RIDE_ZONES[0].r).toFixed(3)}));
