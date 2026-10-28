import assert from 'node:assert/strict';
import {createShipMotion} from '../dist/ride-motion.js';
import {result} from './verify-expansion.mjs';
const {track,trackFrame,coasterMotion}=result;
let knotJump=0,bankJump=0;
for(let i=0;i<track.points.length;i++){
  const t=i/track.points.length;
  knotJump=Math.max(knotJump,track.getTangent(t-1e-7).angleTo(track.getTangent(t+1e-7)));
}
for(let i=0;i<10000;i++)bankJump=Math.max(bankJump,Math.abs(trackFrame(i/10000).bank-trackFrame((i+1)/10000).bank));
assert(knotJump<.0001,'Track joins must have continuous tangents');
assert(bankJump<.025,'Bank must not snap between nearby track samples');
let peak=0,min=100,previous=coasterMotion.speed,largestStep=0;
for(let i=0;i<14400;i++){coasterMotion.update(1/120);const speed=coasterMotion.speed;peak=Math.max(peak,speed);min=Math.min(min,speed);largestStep=Math.max(largestStep,Math.abs(speed-previous));previous=speed;}
assert(peak>10.5&&peak<13.3,'Drop should be brisker but controlled');assert(min>1.7);assert(largestStep<.061,'Speed must not jump at lift or station transitions');
const pausedDistance=coasterMotion.distance;coasterMotion.update(0);assert.equal(coasterMotion.distance,pausedDistance);
const ship=createShipMotion();const initialEnergy=9.81/3.88*(1-Math.cos(ship.angle));let bottomSpeed=0,topSpeed=0,maxEnergyError=0;
for(let i=0;i<14400;i++){
  ship.update(1/120);const energy=.5*ship.velocity**2+9.81/3.88*(1-Math.cos(ship.angle));maxEnergyError=Math.max(maxEnergyError,Math.abs(energy-initialEnergy));
  if(Math.abs(ship.angle)<.02)bottomSpeed=Math.max(bottomSpeed,Math.abs(ship.velocity));
  if(Math.abs(ship.angle)>.675)topSpeed=Math.max(topSpeed,Math.abs(ship.velocity));
}
assert(bottomSpeed>topSpeed*5,'Ship must be fastest at the bottom');assert(maxEnergyError<.00001,'Swing amplitude must remain stable');
const frozen=[ship.angle,ship.velocity];ship.update(0);assert.deepEqual([ship.angle,ship.velocity],frozen);
console.log(JSON.stringify({knotTangentJump:knotJump,maxBankStep:bankJump,peakCoasterSpeed:peak,maxSpeedStep:largestStep,shipBottomSpeed:bottomSpeed,shipTopSpeed:topSpeed,shipEnergyDrift:maxEnergyError}));
