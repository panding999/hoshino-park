import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {FirstPersonPark} from '../dist/first-person.js';
import {RideSession} from '../dist/ride-session.js';
import {createWalker} from '../dist/first-person-physics.js';
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
const camera=new THREE.PerspectiveCamera(),host=node(),fp=new HeadlessPark({...park,scene,camera,host,platforms,colliders,createHuman,renderer:{domElement:{}},controls:{},fireworks(){}});
// Check the actual seated meshes and first-person anchors against each horse's pole.
// Bounds are measured in the assembly frame, so every horse orientation is covered.
let minimumPoleClearance=Infinity;
for(let i=0;i<park.horseBobs.length;i++){
 const {h,pole}=park.horseBobs[i],originalY=h.position.y;
 for(const bob of [-.17,0,.17]){
  h.position.y=1.45+bob;scene.updateMatrixWorld(true);
  const toAssembly=new THREE.Matrix4().copy(h.parent.matrixWorld).invert();
  fp.allHorseNpcs[i].traverse(mesh=>{
   if(!mesh.isMesh)return;
   mesh.geometry.computeBoundingBox();
   const bounds=mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toAssembly,mesh.matrixWorld));
   const dx=Math.max(bounds.min.x-pole.position.x,0,pole.position.x-bounds.max.x),dz=Math.max(bounds.min.z-pole.position.z,0,pole.position.z-bounds.max.z);
   const clearance=(Math.hypot(dx,dz)-.045)*1.45;
   minimumPoleClearance=Math.min(minimumPoleClearance,clearance);
   assert(clearance>.08,`Horse ${i}: pole intersects seated passenger clearance`);
  });
  const eye=h.parent.worldToLocal(fp.horseAnchors[i].getWorldPosition(new THREE.Vector3()));
  assert(Math.hypot(eye.x-pole.position.x,eye.z-pole.position.z)*1.45>.6,'Pole must clear first-person head and camera');
 }
 h.position.y=originalY;
}
console.log(JSON.stringify({carouselPolesChecked:park.horseBobs.length,bobExtremesChecked:true,minimumRiderPoleClearance:+minimumPoleClearance.toFixed(3)}));
fp.active=true;let totalTime=0;
let forwardSteps=0;
function tick(dt=1/20){const moving=[...fp.queueMovers.filter(m=>['walking','entering'].includes(m.phase)).map(m=>m.actor),...fp.companionExits.map(e=>e.a)].map(a=>({a,p:a.g.position.clone(),parent:a.g.parent}));totalTime+=dt;park.wheel.rotation.z=totalTime*.065;park.cabins.forEach(c=>c.g.rotation.z=-park.wheel.rotation.z);fp.wheelAngle=park.wheel.rotation.z;park.expansion.update(dt,{coaster:false,bumper:false});fp.update(dt);assert(camera.position.toArray().every(Number.isFinite));for(const {a,p,parent} of moving){if(a.g.parent!==parent)continue;const dx=a.g.position.x-p.x,dz=a.g.position.z-p.z;if(Math.hypot(dx,dz)>.0001){const forward=new THREE.Vector3(0,0,1).applyQuaternion(a.g.quaternion);assert(dx*forward.x+dz*forward.z>=-.00001,JSON.stringify({error:'Companion must face the direction of travel',ride:fp.session?.id,dx,dz,forward:forward.toArray(),position:a.g.position.toArray()}));forwardSteps++;}}}
const completed={},boardingTimes={};
for(const id of ['carousel','ship','coaster','bumper']){
 fp.resetIdleRides();fp.entry=park.expansion.entries.find(e=>e.id===id);fp.returnPose={...createWalker(fp.entry.boarding[0],fp.entry.boarding[2]),y:fp.entry.boarding[1],yaw:0,pitch:0};fp.session=new RideSession(id,{length:park.expansion.trackLength});fp.session.board();fp.mountRide(id);
 assert(!fp.session.start());
 for(let i=0;i<7200&&fp.session.phase!=='ready';i++)tick();for(let i=0;i<90;i++)tick();
 console.log(id,fp.queueMovers.map(m=>({phase:m.phase,path:m.path?.length,segment:m.segment})));assert.equal(fp.session.phase,'ready');assert.equal(fp.session.boarded,fp.queueMovers.length);boardingTimes[id]=+fp.session.boardTime.toFixed(2);fp.startRide();assert.equal(fp.session.phase,'running');
 if(id==='bumper'){fp.keys.add('KeyW');fp.keys.add('KeyD');}
 for(let i=0;i<9000&&fp.session.phase!=='complete';i++)tick();
 assert.equal(fp.session.phase,'complete');completed[id]=+fp.session.elapsed.toFixed(2);fp.keys.clear();
 const poses=park.expansion.bumperCars.map(c=>[c.body.x,c.body.z,c.body.angle]),carouselAngle=park.carousel.rotation.y;
 fp.interact();assert(fp.motion,'Disembarking should have visible motion');for(let i=0;i<400&&fp.motion;i++)tick();
 assert.equal(fp.mode,'walking');assert.equal(fp.session,null);assert.equal(park.carousel.rotation.y,carouselAngle,'Carousel must not reset when leaving');
 assert(fp.companionExits.every(e=>e.points),'Companions need paths from the actual stopped seats');for(let i=0;i<7200&&fp.companionExits.length;i++)tick();assert.equal(fp.companionExits.length,0,'Five companions must walk out after the ride');
 assert.deepEqual(park.expansion.bumperCars.map(c=>[c.body.x,c.body.z,c.body.angle]),poses,'Cars must stay at their stopped positions');
}
// Player boarding follows a side approach without a black cut or raised-hand overlay.
fp.resetIdleRides();fp.session=null;fp.mode='walking';fp.anchor=null;fp.walker=createWalker(18.45,17.4);fp.walker.y=.72;camera.position.set(fp.walker.x,.72+1.37,fp.walker.z);camera.quaternion.identity();
park.expansion.gates.find(g=>g.rideId==='bumper'&&g.lane==='vip').open=true;scene.updateMatrixWorld(true);fp.interact();assert(fp.motion);assert(fp.motion.frames.length>=6);assert.equal(fp.mountHands.visible,false);
for(let i=0;i<400&&fp.motion;i++)tick();assert.equal(fp.mode,'riding');assert(fp.queueMovers.every(m=>m.path));
for(const mover of fp.queueMovers)assert(mover.path.every(p=>!(Math.abs(p.x-25.5)<.6&&p.z>20.7&&p.z<25.3)),'NPC entered the private lane');
fp.restoreQueue();fp.session=null;fp.anchor=null;fp.mode='walking';fp.playerBody.visible=false;
// Enter a moving Ferris cabin through its actual doorway, then stand/sit/walk.
fp.resetIdleRides();totalTime=(Math.PI*1.5)/.065;park.wheel.rotation.z=totalTime*.065;park.cabins.forEach(c=>c.g.rotation.z=-park.wheel.rotation.z);scene.updateMatrixWorld(true);fp.wheelAngle=park.wheel.rotation.z;
const gate=park.expansion.gates.find(g=>g.rideId==='wheel'&&g.lane==='vip');gate.open=true;park.cabins[0].doorAmount=1;fp.walker=createWalker(-9,-3.7);fp.walker.y=.45;fp.yaw=0;fp.mode='walking';fp.anchor=null;tick();
assert.equal(fp.mode,'cabin');fp.interact();assert(fp.cabinSeated);for(let i=0;i<110;i++)tick();fp.interact();assert(!fp.cabinSeated);fp.keys.add('KeyW');for(let i=0;i<240;i++)tick();fp.keys.clear();assert(fp.cabinLocal.z>=-.66,'Cabin wall must constrain walking');
for(let i=0;i<7000&&fp.session.phase!=='complete';i++)tick();assert.equal(fp.session.phase,'complete');
fp.cabinLocal.x=0;fp.cabinLocal.z=.8;fp.yaw=0;fp.keys.add('KeyS');for(let i=0;i<700&&fp.mode==='cabin';i++)tick();fp.keys.clear();assert.equal(fp.mode,'walking','Walk out through an open door after a full turn');
console.log(JSON.stringify({completeRideCycles:completed,boardingTimes,forwardSteps,ferrisWalkSitStandExit:true,stoppedCarsPreserved:true,noBlackTeleport:true}));
