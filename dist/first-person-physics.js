// Kinematic pedestrian capsule projected onto the park floor. Collision is swept
// in short substeps, so sprinting and low render rates cannot tunnel through rails.
export const PLAYER={radius:.25,eye:1.37,height:1.58,walk:2.5,run:4.1,jump:3.7,gravity:10.5,ground:.28};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createWalker(x=0,z=33.5){return {x,z,y:PLAYER.ground,vx:0,vz:0,vy:0,grounded:true,distance:0};}
export function resolveWalker(w,colliders,radius=PLAYER.radius,landingFloor=null){
  // A walkable curb must not suddenly become a wall in the final centimetres
  // of a jump. Apply the same step clearance when descending onto a known floor.
  const footClearance=Math.max(w.y+(w.grounded?.205:.045),landingFloor===null?-Infinity:landingFloor+.205);
  for(let pass=0;pass<4;pass++)for(const c of colliders){
    if(c.disabled||c.enabled?.()===false||(c.maxY!==undefined&&c.maxY<=footClearance)||(c.minY!==undefined&&c.minY>=w.y+PLAYER.height))continue;
    if(c.kind==='segment'){
      let a=c.a,b=c.b,lo=0,hi=1;const dy=b.y-a.y;
      if(Math.abs(dy)>.0001){const t0=(w.y+.2-c.r-a.y)/dy,t1=(w.y+PLAYER.height+c.r-a.y)/dy;lo=Math.max(0,Math.min(t0,t1));hi=Math.min(1,Math.max(t0,t1));if(lo>hi)continue;}
      const ax=a.x+(b.x-a.x)*lo,az=a.z+(b.z-a.z)*lo,bx=a.x+(b.x-a.x)*hi,bz=a.z+(b.z-a.z)*hi,dx=bx-ax,dz=bz-az,t=clamp(((w.x-ax)*dx+(w.z-az)*dz)/Math.max(.000001,dx*dx+dz*dz),0,1),px=ax+dx*t,pz=az+dz*t,ox=w.x-px,oz=w.z-pz,d=Math.hypot(ox,oz),r=radius+c.r;
      if(d<r){w.x=px+(d?ox/d:1)*r;w.z=pz+(d?oz/d:0)*r;}
    }else if(c.kind==='circle'){
      const dx=w.x-c.x,dz=w.z-c.z,d=Math.hypot(dx,dz),minimum=radius+c.r;
      if(d<minimum){if(d<1e-7)w.x=c.x+minimum;else{w.x=c.x+dx/d*minimum;w.z=c.z+dz/d*minimum;}}
    }else{
      const cos=Math.cos(c.angle||0),sin=Math.sin(c.angle||0),dx=w.x-c.x,dz=w.z-c.z,lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
      const nx=clamp(lx,-c.w/2,c.w/2),nz=clamp(lz,-c.d/2,c.d/2),ox=lx-nx,oz=lz-nz,d=Math.hypot(ox,oz);
      let px=lx,pz=lz;
      if(d>1e-8&&d<radius){px=nx+ox/d*radius;pz=nz+oz/d*radius;}
      else if(d<1e-8){const ex=c.w/2+radius-Math.abs(lx),ez=c.d/2+radius-Math.abs(lz);if(ex<ez)px=(lx<0?-1:1)*(c.w/2+radius);else pz=(lz<0?-1:1)*(c.d/2+radius);}
      if(px!==lx||pz!==lz){w.x=c.x+px*cos+pz*sin;w.z=c.z-px*sin+pz*cos;}
    }
  }
  w.x=clamp(w.x,-37.1,37.1);w.z=clamp(w.z,-34.1,33.8);
}
export function surfaceContains(s,x,z){
 const dx=Math.abs(x-s.x),dz=Math.abs(z-s.z);
 if(s.kind==='circle')return Math.hypot(dx,dz)<s.r;
 if(s.kind==='roundedBox')return dx<=s.w/2&&dz<=s.d/2&&Math.hypot(Math.max(0,dx-(s.w/2-s.r)),Math.max(0,dz-(s.d/2-s.r)))<=s.r;
 return dx<=s.w/2+.025&&dz<=s.d/2+.025;
}
export function supportHeight(w,surfaces,limit=w.y+.2){
 let floor=PLAYER.ground;
 for(const s of surfaces){if(s.y>limit+.001)continue;if(surfaceContains(s,w.x,w.z))floor=Math.max(floor,s.y);}
 return floor;
}
export function updateWalker(w,input,dt,colliders,surfaces=[]){
  if(dt<=0)return;const steps=Math.ceil(Math.min(dt,.15)/(1/120)),h=Math.min(dt,.15)/steps;
  if(input.jump&&w.grounded){w.vy=PLAYER.jump;w.grounded=false;}
  for(let i=0;i<steps;i++){
    const forward=input.forward||0,side=input.side||0,n=Math.max(1,Math.hypot(forward,side)),speed=input.run?PLAYER.run:PLAYER.walk;
    const sx=Math.sin(input.yaw),cz=Math.cos(input.yaw),tx=(-sx*forward+cz*side)/n*speed,tz=(-cz*forward-sx*side)/n*speed;
    const blend=1-Math.exp(-h*14);w.vx+=(tx-w.vx)*blend;w.vz+=(tz-w.vz)*blend;
    const x=w.x,z=w.z;w.x+=w.vx*h;w.z+=w.vz*h;let floor=supportHeight(w,surfaces,w.y+(w.grounded?.205:.02));if(w.grounded&&floor>w.y)w.y=floor;
    const landingFloor=!w.grounded&&w.vy<=0&&w.y-floor<=.205?floor:null;
    resolveWalker(w,colliders,PLAYER.radius,landingFloor);floor=supportHeight(w,surfaces,w.y+.02);w.distance+=Math.hypot(w.x-x,w.z-z);
    w.vy-=PLAYER.gravity*h;w.y+=w.vy*h;
    if(w.y<=floor){w.y=floor;w.vy=0;w.grounded=true;}else if(w.y>floor+.03)w.grounded=false;
  }
}
export function collectStaticColliders(root){
  root.updateMatrixWorld(true);const result=[];
  root.traverse(o=>{
    if(!o.isMesh||o.userData.noWalkingCollision||['PlaneGeometry','TubeGeometry'].includes(o.geometry.type)||o.material.transparent)return;
    if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld),w=b.max.x-b.min.x,d=b.max.z-b.min.z;
    if(b.max.y<.42||b.min.y>2.8||w<.035||d<.035)return;
    // Decorative lights do not create invisible walls.
    if(o.material.emissiveIntensity>.25)return;
    if(o.geometry.type==='CylinderGeometry'){
      const local=o.geometry.boundingBox,a=o.position.clone().set(0,local.min.y,0).applyMatrix4(o.matrixWorld),end=o.position.clone().set(0,local.max.y,0).applyMatrix4(o.matrixWorld);
      if(Math.hypot(a.x-end.x,a.z-end.z)>.05){const scale=o.getWorldScale(o.position.clone()),r=Math.max(o.geometry.parameters.radiusTop,o.geometry.parameters.radiusBottom)*Math.max(scale.x,scale.z);result.push({kind:'segment',a,b:end,r,x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,w,d,minY:b.min.y,maxY:b.max.y});return;}
    }
    result.push({minY:b.min.y,maxY:b.max.y,kind:'box',x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,w:Math.max(.06,w),d:Math.max(.06,d)});
  });return result;
}
