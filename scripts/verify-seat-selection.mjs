import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {FirstPersonPark} from '../dist/first-person.js';
import {PLAYER,createWalker,updateWalker,resolveWalker,supportHeight} from '../dist/first-person-physics.js';
import {createHuman} from '../dist/human.js';
import {park,scene,platforms,colliders} from './verify-park-access.mjs';
const node=()=>({hidden:false,textContent:'',style:{},dataset:{},classList:{add(){},remove(){}},querySelector:()=>node()});
globalThis.document={pointerLockElement:null};
class HeadlessPark extends FirstPersonPark{
 buildWorld(){this.world=new THREE.Group();this.marker=new THREE.Group();}
 buildUI(){this.ui=node();this.interactButton=node();this.status=node();this.hint=node();}
 bindInput(){}
}
// Match production: static scenery is merged before frame-by-frame simulation.
park.batch(park.staticRoot);
const camera=new THREE.PerspectiveCamera(),fp=new HeadlessPark({...park,scene,camera,host:node(),platforms,colliders,createHuman,renderer:{domElement:{}},controls:{},fireworks(){}});
fp.active=true;
function tick(){park.expansion.update(.05,{coaster:false,bumper:false});fp.update(.05);if(fp.motion){assert.equal(fp.playerRig.body.visible,false);assert.equal(fp.playerBody.rotation.x,0,'Looking down must not tilt the body');assert.equal(fp.playerBody.rotation.z,0);}}
function finishMotion(){for(let i=0;i<1000&&fp.motion;i++)tick();assert(!fp.motion,'Mounting animation must finish');}
function place(p){fp.walker={...createWalker(p.x,p.z),y:p.y};fp.mode='walking';fp.anchor=null;fp.session=null;fp.keys.clear();camera.position.set(p.x,p.y+PLAYER.eye,p.z);camera.quaternion.identity();}
assert.equal(park.benches.length,6);
let benchApproaches=0;
for(const bench of park.benches)for(const x of [-.4,0,.4]){
 scene.updateMatrixWorld(true);const p=bench.g.localToWorld(new THREE.Vector3(x,0,1));place(p);
 const action=fp.nearestInteraction();assert.equal(action?.kind,'bench');assert.equal(action.bench,bench);
 fp.interact();assert(fp.motion,`Bench ${bench.x},${bench.z} must be usable from front/side`);finishMotion();assert.equal(fp.mode,'bench');
 const anchor=fp.anchor;assert(anchor.parent===bench.g);assert.equal(fp.playerRig.body.visible,false,'First person must not render a headless torso');assert.equal(fp.playerBody.rotation.x,0);assert.equal(fp.playerBody.rotation.z,0);
 scene.updateMatrixWorld(true);for(let i=0;i<2;i++){const side=i?1:-1,hand=fp.playerRig.arms[i].userData.forearm.localToWorld(new THREE.Vector3(side*.03,-.235,.065)),knee=fp.playerRig.legs[i].userData.lower.getWorldPosition(new THREE.Vector3());assert(Math.abs(hand.x-knee.x)<.17&&Math.abs(hand.z-knee.z)<.17,'Hands should rest above the thighs');assert(hand.y-knee.y>-.02&&hand.y-knee.y<.14,'Hands should not float above the lap');}
 fp.interact();finishMotion();assert.equal(fp.mode,'walking');assert(!anchor.parent,'Temporary seat anchor must be removed');benchApproaches++;
}
let selectedSeats=0;
for(const id of ['bumper','coaster']){
 const anchors=id==='bumper'?fp.bumperAnchors:fp.coasterAnchors;
 for(let index=0;index<anchors.length;index++){
  fp.restoreQueue(true);fp.resetIdleRides();const gate=park.expansion.gates.find(g=>g.rideId===id&&g.lane==='vip');gate.open=true;gate.amount=1;park.expansion.bumperEntryGate.open=true;park.expansion.bumperEntryGate.amount=1;
  const anchor=anchors[index],car=anchor.parent;scene.updateMatrixWorld(true);
  const side=id==='bumper'?1:(anchor.position.x<0?-1:1),p=car.localToWorld(new THREE.Vector3(side*1.15,0,anchor.position.z));p.y=id==='bumper'?.72:1.53;place(p);
  const action=fp.nearestInteraction();assert.equal(action?.entry?.id,id);assert.equal(action.seatIndex,index,`${id} must select the adjacent seat`);
  fp.interact();assert(fp.motion,`${id} ${index}: boarding path is missing`);finishMotion();assert.equal(fp.mode,'riding');assert.equal(fp.anchor,anchor);
  const ownSeat=id==='bumper'?park.expansion.bumperCars[index].rider:park.expansion.coasterPassengers[index];
  assert.equal(fp.queueMovers.length,5);assert(fp.queueMovers.every(m=>m.actor.companion));assert(!fp.queueMovers.some(m=>m.seat===ownSeat),'NPC must never reserve the player seat');assert.equal(new Set(fp.queueMovers.map(m=>m.seat)).size,fp.queueMovers.length);if(!fp.queueMovers.every(m=>m.path))console.log(fp.queueMovers.map(m=>({position:m.actor.g.position.toArray(),goal:m.candidates.map(p=>p.toArray()),path:m.path?.length})));assert(fp.queueMovers.every(m=>m.path),`${id} ${index}: every assigned seat must have an accessible path`);
  // Wait for actual walking and sitting, not a timer-only approximation.
  for(let i=0;i<7200&&fp.session.phase!=='ready';i++)tick();assert.equal(fp.session.phase,'ready',`${id} ${index}: NPC boarding deadlock`);
  for(let i=0;i<100;i++)tick();fp.startRide();assert.equal(fp.session.phase,'running');
  if(id==='bumper'){
   const occupied=new Set(fp.queueMovers.map(m=>m.seat));
   park.expansion.bumperCars.forEach((c,i)=>assert.equal(c.body.controller,i!==index&&occupied.has(c.rider)?'npc':'player'));
   fp.keys.add('KeyW');fp.updateRide(.05);fp.keys.clear();assert.equal(park.expansion.bumperCars[index].body.input.throttle,1,'Driving input must reach selected car');
   fp.session.phase='complete';park.expansion.bumperCars[index].body.vx=0;park.expansion.bumperCars[index].body.vz=0;
   const exit=fp.disembarkPose(),body=park.expansion.bumperCars[index].body;assert(Math.hypot(exit.x-body.x,exit.z-body.z)<2,'Exit must stay beside chosen car');
  }
  fp.restoreQueue(true);fp.session=null;fp.mode='walking';fp.anchor=null;fp.playerBody.visible=false;selectedSeats++;
 }
}
// Repeated assignments should shuffle free positions, while preserving uniqueness.
const assignments=new Set(),entry=park.expansion.entries.find(e=>e.id==='coaster');
for(let i=0;i<12;i++){fp.selectRideSeat({entry,anchor:fp.coasterAnchors[3],seatIndex:3});assert(!fp.seatedNpcs.coaster.includes(park.expansion.coasterPassengers[3]));assignments.add(fp.seatedNpcs.coaster.map(s=>park.expansion.coasterPassengers.indexOf(s)).join(','));}
assert(assignments.size>1);
const spawn=createWalker();assert(spawn.z>31.8);spawn.y=supportHeight(spawn,platforms.surfaces);const original=spawn.z;resolveWalker(spawn,colliders);assert.equal(spawn.z,original);
for(let i=0;i<180;i++)updateWalker(spawn,{forward:1,yaw:0},1/60,colliders,platforms.surfaces);assert(spawn.z<29,'Must walk through the central entrance from outside');
console.log(JSON.stringify({benches:park.benches.length,benchApproaches,selectableBumperCars:8,selectableCoasterSeats:12,seatBoardingCycles:selectedSeats,randomFreeSeats:true,gateSpawnOutside:true}));
