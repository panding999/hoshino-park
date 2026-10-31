// Top-down rigid bodies. Two overlapping circles approximate each rubber bumper.
// Rendering and player/NPC input share the same simulation; no velocity-facing snap.
export const BUMPER_SHAPE=Object.freeze({radius:.73,halfSpan:.23});
export const BUMPER_BOUNDS=Object.freeze({minX:8.65,maxX:27.35,minZ:3.1,maxZ:18.9});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const torque=(x,z,fx,fz)=>z*fx-x*fz;
const circles=b=>[-1,1].map(s=>({x:b.x+Math.sin(b.angle)*s*BUMPER_SHAPE.halfSpan,z:b.z+Math.cos(b.angle)*s*BUMPER_SHAPE.halfSpan}));
export function createBumperBody({x,z,angle=0,vx=0,vz=0,omega=0,controller='npc',id=0}={}){
  return {x,z,angle,vx,vz,omega,id,invMass:1,invInertia:2.2,controller,input:{throttle:0,steer:0,brake:false},target:null,targetAge:0,stuck:0,reverse:0,recover:0,lean:0,leanSpeed:0,sway:0,swaySpeed:0};
}
function contactVelocity(b,rx,rz){return b?{x:b.vx+b.omega*rz,z:b.vz-b.omega*rx}:{x:0,z:0};}
function impulse(b,jx,jz,rx,rz){if(!b)return;b.vx+=jx*b.invMass;b.vz+=jz*b.invMass;b.omega+=torque(rx,rz,jx,jz)*b.invInertia;
  const sx=Math.sin(b.angle),sz=Math.cos(b.angle);
  b.leanSpeed=clamp(b.leanSpeed-(jx*sx+jz*sz)*.65,-2.2,2.2);b.swaySpeed=clamp(b.swaySpeed+(jx*sz-jz*sx)*.45,-1.5,1.5);
  if(Math.hypot(jx,jz)>.25&&b.controller==='npc'&&b.recover<=0&&b.reverse<=0){b.recover=.25;b.reverse=.85;b.target=null;}
}
function resolve(a,b,nx,nz,depth,cx,cz){
  const ax=cx-a.x,az=cz-a.z,bx=b?cx-b.x:0,bz=b?cz-b.z:0;
  const av=contactVelocity(a,ax,az),bv=contactVelocity(b,bx,bz),vn=(bv.x-av.x)*nx+(bv.z-av.z)*nz;
  const im=a.invMass+(b?.invMass??0),ta=torque(ax,az,nx,nz),tb=torque(bx,bz,nx,nz);
  if(vn<0){
    // Rubber absorbs most of the impact. Very slow contacts do not bounce.
    const restitution=vn<-.35?.36:0;
    const j=-(1+restitution)*vn/(im+ta*ta*a.invInertia+tb*tb*(b?.invInertia??0));
    impulse(a,-nx*j,-nz*j,ax,az);impulse(b,nx*j,nz*j,bx,bz);
    const tx=-nz,tz=nx,afterA=contactVelocity(a,ax,az),afterB=contactVelocity(b,bx,bz);
    const tA=torque(ax,az,tx,tz),tB=torque(bx,bz,tx,tz);
    const jt=clamp(-((afterB.x-afterA.x)*tx+(afterB.z-afterA.z)*tz)/(im+tA*tA*a.invInertia+tB*tB*(b?.invInertia??0)),-j*.32,j*.32);
    impulse(a,-tx*jt,-tz*jt,ax,az);impulse(b,tx*jt,tz*jt,bx,bz);
  }
  // Split position correction prevents overlap without adding kinetic energy.
  const correction=Math.max(0,depth-.001)*.72/im;
  a.x-=nx*correction*a.invMass;a.z-=nz*correction*a.invMass;
  if(b){b.x+=nx*correction*b.invMass;b.z+=nz*correction*b.invMass;}
}
export function solveBumperContacts(bodies,bounds=BUMPER_BOUNDS){
  const r=BUMPER_SHAPE.radius;
  for(let iteration=0;iteration<5;iteration++){
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i],b=bodies[j];if(Math.hypot(b.x-a.x,b.z-a.z)>2*(r+BUMPER_SHAPE.halfSpan))continue;
      for(const ca of circles(a))for(const cb of circles(b)){
        let dx=cb.x-ca.x,dz=cb.z-ca.z,d=Math.hypot(dx,dz);if(d>=2*r)continue;
        if(d<1e-8){dx=1;dz=0;d=1e-8;}
        const nx=dx/(d===1e-8?1:d),nz=dz/(d===1e-8?1:d);
        resolve(a,b,nx,nz,2*r-d,(ca.x+cb.x)/2,(ca.z+cb.z)/2);
      }
    }
    for(const b of bodies)for(const c of circles(b)){
      if(c.x-r<bounds.minX)resolve(b,null,-1,0,bounds.minX-(c.x-r),bounds.minX,c.z);
      if(c.x+r>bounds.maxX)resolve(b,null,1,0,c.x+r-bounds.maxX,bounds.maxX,c.z);
      if(c.z-r<bounds.minZ)resolve(b,null,0,-1,bounds.minZ-(c.z-r),c.x,bounds.minZ);
      if(c.z+r>bounds.maxZ)resolve(b,null,0,1,c.z+r-bounds.maxZ,c.x,bounds.maxZ);
    }
  }
}
function chooseTarget(b,bodies,bounds){
  let best=null,score=-Infinity;
  // Independent destinations chosen for space and reachable steering, not one shared loop.
  for(let i=0;i<15;i++){
    const x=bounds.minX+1.65+(i%5)*(bounds.maxX-bounds.minX-3.3)/4;
    const z=bounds.minZ+1.65+Math.floor(i/5)*(bounds.maxZ-bounds.minZ-3.3)/2;
    const distance=Math.hypot(x-b.x,z-b.z);if(distance<3)continue;
    const angle=Math.abs(wrap(Math.atan2(x-b.x,z-b.z)-b.angle));
    let occupancy=0;for(const other of bodies)if(other!==b){occupancy+=3/Math.max(1,Math.hypot(x-other.x,z-other.z));if(other.target)occupancy+=1.8/Math.max(1,Math.hypot(x-other.target.x,z-other.target.z));}
    const value=distance*.12-angle*.85-occupancy+Math.sin(i*2.3+b.id*1.7+b.targetAge)*.15;
    if(value>score){score=value;best={x,z};}
  }
  b.target=best??{x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2};b.targetAge=0;
}
function npcInput(b,h,bodies,bounds){
  b.targetAge+=h;b.stuck=Math.hypot(b.vx,b.vz)<.2?b.stuck+h:0;
  if(b.stuck>1.1){b.reverse=.9;b.stuck=0;b.target=null;}
  if(!b.target||Math.hypot(b.target.x-b.x,b.target.z-b.z)<1.4||b.targetAge>7)chooseTarget(b,bodies,bounds);
  b.recover=Math.max(0,b.recover-h);b.reverse=Math.max(0,b.reverse-h);
  if(b.recover>0)return {throttle:0,steer:0,brake:false};
  const angle=wrap(Math.atan2(b.target.x-b.x,b.target.z-b.z)-b.angle);
  let steer=clamp(angle*1.3,-1,1),throttle=Math.abs(angle)>1.2?.38:1;
  // Look ahead and steer around slower traffic; contacts are still physical.
  const sx=Math.sin(b.angle),sz=Math.cos(b.angle);
  for(const other of bodies){if(other===b)continue;const dx=other.x-b.x,dz=other.z-b.z,forward=dx*sx+dz*sz,side=dx*sz-dz*sx;
    if(forward>0&&forward<3.2&&Math.abs(side)<1.6){steer+=-(Math.abs(side)<.05?(b.id%2?1:-1):Math.sign(side))*(1-forward/3.2)*1.6;throttle=Math.min(throttle,.55);}}
  if(b.reverse>0)return {throttle:-.8,steer:b.id%2?.75:-.75,brake:false};
  return {throttle,steer:clamp(steer,-1,1),brake:false};
}
export function createBumperWorld(bodies,{bounds=BUMPER_BOUNDS,drag=true}={}){
  const fixed=1/120;let accumulator=0,steps=0;
  function tick(h){
    for(const b of bodies){
      const input=b.controller==='npc'?npcInput(b,h,bodies,bounds):b.input;
      const sx=Math.sin(b.angle),sz=Math.cos(b.angle),forward=b.vx*sx+b.vz*sz,side=b.vx*sz-b.vz*sx;
      const throttle=clamp(input.throttle??0,-1,1),steer=clamp(input.steer??0,-1,1);
      if(drag){
        const drive=throttle*3.25-forward*(input.brake?5:1.35);
        b.vx+=(sx*drive-sz*side*2.4)*h;b.vz+=(sz*drive+sx*side*2.4)*h;
        const wantedYaw=steer*1.35*Math.min(1,Math.abs(forward)/.35)*Math.sign(forward);
        b.omega+=(wantedYaw-b.omega)*2.4*h;
      }
      b.x+=b.vx*h;b.z+=b.vz*h;b.angle=wrap(b.angle+b.omega*h);
    }
    solveBumperContacts(bodies,bounds);
    for(const b of bodies){
      // Damped torso springs, never a camera teleport or an unconstrained fall.
      b.leanSpeed+=(-45*b.lean-7*b.leanSpeed)*h;b.lean=clamp(b.lean+b.leanSpeed*h,-.18,.28);
      b.swaySpeed+=(-48*b.sway-8*b.swaySpeed)*h;b.sway=clamp(b.sway+b.swaySpeed*h,-.18,.18);
    }
    steps++;
  }
  return {bodies,bounds,get steps(){return steps;},update(dt){
    if(!Number.isFinite(dt)||dt<=0)return;
    accumulator+=Math.min(dt,.25);
    while(accumulator>=fixed-1e-10){tick(fixed);accumulator-=fixed;}
  }};
}
