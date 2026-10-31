import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {FirstPersonPark} from '../dist/first-person.js';
// Redirecting a companion to another ride must preserve their actual waiting
// position, rather than resuming an unrelated old promenade route afterwards.
const scene=new THREE.Scene(),g=new THREE.Group(),humanGroup=new THREE.Group();scene.add(g);g.add(humanGroup);g.position.set(-3,.28,20);
const a={g,companion:true,managed:true,waiting:true,human:{g:humanGroup,pose(){},setRiding(){}}},home=g.position.clone();
const fp=Object.create(FirstPersonPark.prototype);Object.assign(fp,{api:{scene,expansion:{gates:[]}},savedQueue:[{a,position:home.clone(),rotation:0,visible:true,waiting:true}],queueMovers:[],companionExits:[]});
fp.restoreQueue(true);assert(a.waiting);assert(!a.managed);assert(g.position.equals(home));
fp.companionExits=[{a,home:home.clone(),points:[home.clone(),home.clone()],segment:1,elapsed:0,waiting:true,rotation:0}];a.managed=true;fp.updateCompanionExits(.05);
assert.equal(fp.companionExits.length,0);assert(a.waiting);assert(!a.managed);assert(g.position.equals(home));
console.log(JSON.stringify({redirectedCompanionKeepsActualPosition:true}));
