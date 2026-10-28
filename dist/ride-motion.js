import * as THREE from './vendor/three.module.js';
const wrap=u=>((u%1)+1)%1;
// Periodic uniform cubic B-spline: both tangent and curvature are continuous.
export class SmoothCoasterCurve extends THREE.Curve {
  constructor(points){super();this.points=points.map(p=>new THREE.Vector3(...p));this.arcLengthDivisions=12000;}
  getPoint(t,target=new THREE.Vector3()){
    const n=this.points.length,u=wrap(t)*n,i=Math.floor(u),f=u-i,f2=f*f,f3=f2*f;
    const weights=[(1-3*f+3*f2-f3)/6,(4-6*f2+3*f3)/6,(1+3*f+3*f2-3*f3)/6,f3/6];
    target.set(0,0,0);for(let k=0;k<4;k++)target.addScaledVector(this.points[(i+k-1+n)%n],weights[k]);return target;
  }
  getTangent(t,target=new THREE.Vector3()){
    const n=this.points.length,u=wrap(t)*n,i=Math.floor(u),f=u-i;
    const weights=[-.5*(1-f)*(1-f),1.5*f*f-2*f,-1.5*f*f+f+.5,.5*f*f];
    target.set(0,0,0);for(let k=0;k<4;k++)target.addScaledVector(this.points[(i+k-1+n)%n],weights[k]);return target.normalize();
  }
}
export function coasterFrame(track,u){
  u=wrap(u);const length=track.getLength(),p=track.getPointAt(u),forward=track.getTangentAt(u);
  // A symmetric, spatially averaged bank, rather than a one-sided derivative.
  let turn=0;
  for(const d of [.65,1.3,2]){const a=track.getTangentAt(wrap(u-d/length)),b=track.getTangentAt(wrap(u+d/length));turn+=Math.atan2(a.z*b.x-a.x*b.z,a.x*b.x+a.z*b.z)/(2*d);}
  const bank=-.65*Math.tanh(turn/3*4.5);
  const side=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),forward).normalize().applyAxisAngle(forward,bank);
  const up=new THREE.Vector3().crossVectors(forward,side).normalize();return {p,forward,side,up,bank};
}
export class OffsetRailCurve extends THREE.Curve {
  constructor(track,side,up){super();this.track=track;this.side=side;this.up=up;}
  getPoint(u,target=new THREE.Vector3()){const f=coasterFrame(this.track,u);return target.copy(f.p).addScaledVector(f.side,this.side).addScaledVector(f.up,this.up);}
}
export function createCoasterMotion(track){
  const length=track.getLength();let distance=length*.11,speed=2.4,accumulator=0;
  return {get distance(){return distance;},get speed(){return speed;},update(dt){
    if(dt<=0)return;accumulator+=Math.min(dt,.25);
    while(accumulator>=1/120-1e-10){
      const f=coasterFrame(track,distance/length),lift=f.forward.y>.13&&f.p.x<-9&&f.p.z<-4;
      const station=f.p.x<-14.8&&f.p.x>-17&&f.p.z>-1&&f.p.z<7;
      let acceleration=-3.7*f.forward.y-.065*speed;
      if(lift)acceleration=THREE.MathUtils.clamp((2.4-speed)*3,-4,3);
      else if(station)acceleration=THREE.MathUtils.clamp((2.6-speed)*2,-7,2);
      else if(speed<3.1)acceleration=Math.max(acceleration,(3.1-speed)*2);
      speed=THREE.MathUtils.clamp(speed+acceleration/120,1.8,13.2);distance=(distance+speed/120)%length;accumulator-=1/120;
    }
  }};
}
// Nonlinear pendulum. RK4 preserves smooth reversal and maximum speed at bottom.
export function createShipMotion({length=3.88,amplitude=.68,gravity=9.81}={}){
  let angle=amplitude,velocity=0,accumulator=0;
  const acceleration=a=>-gravity/length*Math.sin(a);
  return {get angle(){return angle;},get velocity(){return velocity;},update(dt){
    if(dt<=0)return;accumulator+=Math.min(dt,.25);const h=1/120;
    while(accumulator>=h-1e-10){
      const k1a=velocity,k1v=acceleration(angle),k2a=velocity+k1v*h/2,k2v=acceleration(angle+k1a*h/2),k3a=velocity+k2v*h/2,k3v=acceleration(angle+k2a*h/2),k4a=velocity+k3v*h,k4v=acceleration(angle+k3a*h);
      angle+=h*(k1a+2*k2a+2*k3a+k4a)/6;velocity+=h*(k1v+2*k2v+2*k3v+k4v)/6;accumulator-=h;
    }
  }};
}
