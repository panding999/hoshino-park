import assert from 'node:assert/strict';
import {PedestrianNavigation} from '../dist/pedestrian-navigation.js';
import {resolveWalker,createWalker} from '../dist/first-person-physics.js';
const obstacles=[{kind:'box',x:0,z:0,w:1.45,d:1.9,minY:0,maxY:2},{kind:'box',x:1.6,z:-1,w:.12,d:4,minY:0,maxY:2}];
const nav=new PedestrianNavigation(obstacles,[]),path=nav.path({x:-2,y:.28,z:0},{x:3,y:.28,z:0});assert(path?.length>20);
for(let i=1;i<path.length;i++)for(let k=0;k<=10;k++){const a=path[i-1],b=path[i],w=createWalker(a.x+(b.x-a.x)*k/10,a.z+(b.z-a.z)*k/10),x=w.x,z=w.z;resolveWalker(w,obstacles,.165);assert(Math.hypot(w.x-x,w.z-z)<.002,'Path crosses a car or railing');}
const closed=new PedestrianNavigation([{kind:'box',x:0,z:0,w:10,d:.3,minY:0,maxY:3}],[]);assert(closed.path({x:0,y:.28,z:1},{x:0,y:.28,z:-1}).some(p=>Math.abs(p.x)>5));
const leg={kind:'segment',a:{x:0,y:0,z:0},b:{x:3,y:6,z:0},r:.1,minY:0,maxY:6,x:1.5,z:0,w:3.2,d:.2};let w=createWalker(2.5,0);resolveWalker(w,[leg]);assert.equal(w.x,2.5,'Diagonal supports must not block empty space below them');w=createWalker(.4,0);resolveWalker(w,[leg]);assert(Math.abs(w.x-.4)>.1||Math.abs(w.z)>.1,'Actual support still collides');
console.log(JSON.stringify({pathsAvoidVehiclesAndRails:true,diagonalSupportClearance:true,pathNodes:path.length}));
