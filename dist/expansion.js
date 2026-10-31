import * as THREE from 'three';
import {SmoothCoasterCurve,coasterFrame,OffsetRailCurve,createCoasterMotion} from './ride-motion.js';
import {createBumperBody,createBumperWorld} from './bumper-physics.js';

// Layout coordinates remain available for future walking, collision and boarding.
// VIP gates are modeled closed; NPC routes never receive owner access.
export const admissionRules=Object.freeze({normal:['npc','owner'],vip:['owner']});
export const canUseEntrance=(actor,lane)=>admissionRules[lane]?.includes(actor)??false;

export function buildExpansion(api){
  const {scene,root,mesh,mat,box,ball,cyl,rod,ring,group,rounded,textSign,bulb,lightMat,garden,lawn,tree,shrub,flowers,bench,lamp,batch,visitor,walkingRoutes,createHuman}=api;
  const entries=[],queueActors=[],bumperCars=[],coasterCars=[],gates=[],coasterPassengers=[];
  const upWorld=new THREE.Vector3(0,1,0);
  const coral=mat(0xc66c56),railMaterial=mat(0x89c9bd),spineMaterial=mat(0x35575d),supportMaterial=mat(0x768e9a);

  // The monumental north-west skyline: lift, steep first drop, airtime hills,
  // elevated horseshoe turn and a low return outside the original garden.
  const controlPoints=[
    [-16,1.7,4],[-16,1.7,0],[-16,2.1,-4],[-16,7,-10],[-15,17,-15],[-12,25.4,-18.5],[-9,26.3,-20],
    [-6,19,-20],[-3,4,-20],[0,2.5,-19.5],[5,12,-19],[9,15,-17.5],
    [13,5,-16],[17,4,-13],[20,7,-8],[20,11,-3],[17,12,-.7],[14,8,-2.5],[13,4,-7],
    [10,3,-12],[5,9,-13],[0,10,-13],[-6,3,-13],[-10,2.4,-10],
    [-20,4,-7],[-21,3,0],[-20,2,7],[-17.6,1.7,10],[-16,1.7,7]
  ];
  const track=new SmoothCoasterCurve(controlPoints.map(([x,y,z])=>[x*1.7,1.7+(y-1.7)*1.15,z*1.7]));track.updateArcLengths();
  const length=track.getLength(),trackFrame=u=>coasterFrame(track,u),frames=[];
  for(let i=0;i<1400;i++)frames.push(trackFrame(i/1400));
  for(const [side,up,r,m] of [[.43,0,.085,railMaterial],[-.43,0,.085,railMaterial],[0,-.32,.17,spineMaterial]])mesh(new THREE.TubeGeometry(new OffsetRailCurve(track,side,up),2400,r,6,true),m,root);
  // Dense cross-ties and triangular rail-to-spine bracing make the track legible.
  for(let d=0;d<length;d+=.47){const f=trackFrame(d/length),a=f.p.clone().addScaledVector(f.side,.5),b=f.p.clone().addScaledVector(f.side,-.5),bottom=f.p.clone().addScaledVector(f.up,-.32);
    rod(a.toArray(),b.toArray(),.045,'cream',root,5);rod(a.toArray(),bottom.toArray(),.035,spineMaterial,root,5);rod(b.toArray(),bottom.toArray(),.035,spineMaterial,root,5);
  }
  const foundations=[];
  for(let d=0;d<length;d+=3.7){const f=trackFrame(d/length);if(f.p.x<-23.5&&f.p.x>-31&&f.p.z>-4&&f.p.z<12)continue;
    const horizontal=new THREE.Vector3(f.side.x,0,f.side.z).normalize(),spread=f.p.y>10?1.1:.5;
    for(const sign of [-1,1]){const foot=f.p.clone().addScaledVector(horizontal,sign*spread);foot.y=.42;const top=f.p.clone().addScaledVector(f.up,-.38);
      box(.7,.23,.7,0xa6a7a3,root,foot.x,.37,foot.z);rod(foot.toArray(),top.toArray(),f.p.y>14?.145:.105,supportMaterial,root,8);foundations.push(foot);
    }
    if(f.p.y>9){for(let y=4;y<f.p.y-1;y+=4){const left=f.p.clone().addScaledVector(horizontal,-spread*(1-y/f.p.y)),right=f.p.clone().addScaledVector(horizontal,spread*(1-y/f.p.y));left.y=y;right.y=y;rod(left.toArray(),right.toArray(),.065,supportMaterial,root,6);}}
  }
  // Stair-like maintenance catwalk along the lift, with a continuous handrail.
  let previousRail=null;
  for(let d=0;d<length;d+=.55){const f=trackFrame(d/length);if(!(f.p.x<-9&&f.p.z<-4&&f.forward.y>.15))continue;
    const p=f.p.clone().addScaledVector(f.side,-.95);box(.57,.065,.34,'metal',root,p.x,p.y-.08,p.z);const hand=p.clone().addScaledVector(f.up,.9);rod(p.toArray(),hand.toArray(),.023,'cream',root,5);if(previousRail)rod(previousRail.toArray(),hand.toArray(),.025,'cream',root,5);previousRail=hand;
  }
  // Restrained warm markers trace the skyline without turning it into neon.
  for(let d=0;d<length;d+=2.8){const f=trackFrame(d/length);if(f.p.y>8){const p=f.p.clone().addScaledVector(f.side,.5);bulb(root,...p.toArray(),.045,mat(0xe8c181,.45));}}

  const station=group(-27.2,.28,3.4,root);station.scale.z=1.7;
  rounded(5.2,9.7,.3,1.13,'teal',station,0,0,0);rounded(5.15,9.65,.25,.12,'cream',station,0,1.13,0);
  // Recessed track channel and platform edge stripes.
  box(1.45,.08,9.7,'metal',station,0,1.27,0);
  for(const x of [-.95,.95]){box(.1,.035,8.8,'gold',station,x,1.37,0);for(let z=-4;z<4.1;z+=.4)box(.22,.025,.2,'gold',station,x,1.39,z);}
  for(const x of [-2.3,2.3])for(const z of [-4,-1,2,4]){box(.16,3.4,.16,'cream',station,x,2.95,z);box(.27,.15,.27,'gold',station,x,1.43,z);}
  // Partial open roof lets the miniature show its boarding platform.
  for(const x of [-1.9,1.9])box(1.35,.16,10.3,'teal',station,x,4.7,0);
  for(const z of [-4.75,0,4.75]){rod([-2.6,4.7,z],[0,5.25,z],.09,'cream',station);rod([0,5.25,z],[2.6,4.7,z],.09,'cream',station);}
  box(5.6,.85,.27,'teal',station,0,4.42,5.12);textSign('苍 龙 · SKY DRAGON',5.3,.7,station,0,4.43,5.27,{size:62});
  textSign('BOARDING  /  登乘区',2.6,.32,station,0,1.8,4.86,{size:72});
  // Small passenger train, aligned to the same continuous rail curve.
  for(let i=0;i<6;i++){
    const car=group(0,0,0,scene);rounded(1.16,1.25,.27,.25,'coral',car,0,0,0);box(.92,.12,1.06,'gold',car,0,.28,0);
    const passengers=[];
    for(const x of [-.28,.28]){box(.38,.19,.52,'darkTeal',car,x,.4,-.05);box(.38,.5,.13,'darkTeal',car,x,.6,-.29);rod([x-.16,.7,.06],[x+.16,.7,.06],.032,'cream',car);
      const rider=group(x,.0,-.1,car);if(createHuman)createHuman(api,rider,{color:i%2?'cream':'teal',variant:i,seated:true});passengers.push(rider);}

    for(const x of [-.48,.48])for(const z of [-.4,.4]){const wheel=cyl(.13,.13,.09,'metal',car,x,.03,z,10);wheel.rotation.z=Math.PI/2;}
    if(i===0){ball(.37,'coral',car,0,.3,.51,1.4,.7,.65);for(const x of [-.36,.36])bulb(car,x,.31,.76,.055);}
    passengers.forEach(p=>car.remove(p));batch(car);passengers.forEach(p=>{car.add(p);batch(p);});coasterPassengers.push(...passengers);coasterCars.push(car);
  }
  const coasterMotion=createCoasterMotion(track);
  const rotationMatrix=new THREE.Matrix4();

  // Open-roof bumper-car pavilion, so the cars and their equipment remain visible.
  const bumper=group(18,.28,11,root);bumper.scale.set(1.7,1,1.95);
  rounded(12,9,.45,.28,'teal',bumper,0,0,0);rounded(11.5,8.5,.32,.08,'cream',bumper,0,.28,0);
  const floor=rounded(10.8,7.8,.45,.05,mat(0x415f67),bumper,0,.37,0);floor.material=mat(0x415f67);
  for(let x=-5;x<=5;x+=1)box(.025,.013,7.4,0x789392,bumper,x,.432,0,false);
  for(let z=-3.5;z<=3.5;z+=1)box(10.4,.013,.025,0x789392,bumper,0,.433,z,false);
  box(11,.4,.18,'coral',bumper,0,.63,-4.05);box(11,.09,.2,'cream',bumper,0,.88,-4.05);
  for(const [x,w] of [[-3.55,3.9],[2.75,2.3],[5.2,.6]]){box(w,.4,.18,'coral',bumper,x,.63,4.05);box(w,.09,.2,'cream',bumper,x,.88,4.05);}
  // Closed during the display ride; this gate can retract for future boarding.
  const bumperGateGroup=group(18,1.04,18.8975,scene);box(5.44,.16,.351,'gold',bumperGateGroup,0,0,0);
  const vipBumperGate=group(25.5,1.04,18.8975,scene);box(1.7,.16,.351,'gold',vipBumperGate,0,0,0);
  const bumperEntryGate={g:bumperGateGroup,vipG:vipBumperGate,open:false,amount:0};
  for(const x of [-5.55,5.55]){box(.18,.4,8.2,'coral',bumper,x,.63,0);box(.2,.09,8.2,'cream',bumper,x,.88,0);}
  for(const x of [-5.6,5.6])for(const z of [-4,0,4]){box(.2,4.1,.2,'cream',bumper,x,2.5,z);box(.32,.3,.32,'gold',bumper,x,.54,z);}
  for(const z of [-4.25,4.25]){box(12.4,.2,1.0,'teal',bumper,0,4.63,z);box(12.5,.09,.13,'gold',bumper,0,4.8,z+.5);}
  for(const z of [-4,0,4]){rod([-5.7,4.65,z],[0,5.65,z],.11,'cream',bumper);rod([0,5.65,z],[5.7,4.65,z],.11,'cream',bumper);rod([-5.7,4.65,z],[5.7,4.65,z],.06,'gold',bumper);}
  for(let x=-5;x<=5;x+=1.25)rod([x,4.68,-4],[x,4.68,4],.013,'metal',bumper,4);
  for(let z=-3.5;z<4;z+=1)rod([-5.4,4.68,z],[5.4,4.68,z],.013,'metal',bumper,4);
  textSign('星 光 碰 碰 车',6.7,.78,bumper,0,4.27,4.8,{size:88,bg:'#355c60'});
  textSign('BUMPER CARS',3.7,.28,bumper,0,3.73,4.82,{size:74,bg:'#355c60'});
  for(let x=-5.2;x<=5.2;x+=.6)bulb(bumper,x,4.74,4.78,.045);
  for(let i=0;i<8;i++){
    const car=group(18+(i%4-1.5)*3.9,.72,11+(i<4?-5:5),scene);const color=['coral','teal','gold',0x7d88b2][i%4];
    rounded(1.45,1.9,.6,.17,'metal',car,0,0,0);for(const x of [-.57,.57])rounded(.13,1.55,.06,.3,color,car,x,.15,0);for(const z of [-.75,.75])rounded(1.1,.13,.06,.3,color,car,0,.15,z);rounded(1.1,.35,.12,.15,color,car,0,.32,.59);rounded(1.0,1.05,.3,.08,'cream',car,0,.19,-.14);
    box(.9,.3,.22,'darkTeal',car,0,.62,-.53);box(.92,.12,.65,'darkTeal',car,0,.51,-.18);
    const steering=group(0,.78,.35,car);steering.rotation.x=-.55;ring(.18,.028,'metal',steering,0,0,0);for(const a of [0,2.1,4.2])rod([0,0,0],[Math.cos(a)*.16,Math.sin(a)*.16,0],.018,'metal',steering);rod([0,.4,.45],[0,.77,.35],.03,'metal',car);
    rod([-.48,.4,-.6],[-.48,4.18,-.6],.022,'metal',car);ball(.04,'gold',car,-.48,4.18,-.6);
    for(const x of [-.38,.38]){ball(.08,'cream',car,x,.39,.79,1,.6,.3);ball(.05,'red',car,x,.35,-.83,1,.6,.3);}
    const rider=group(0,.64,-.18,car);
    rider.position.y=.18;if(createHuman)createHuman(api,rider,{color:i%2?'cream':'teal',variant:i+2,seated:true});
    car.remove(rider);car.remove(steering);batch(car);car.add(rider);car.add(steering);batch(rider);batch(steering);
    const body=createBumperBody({x:car.position.x,z:car.position.z,angle:i*2.4,vx:Math.sin(i*2.4)*.5,vz:Math.cos(i*2.4)*.5,id:i});bumperCars.push({g:car,body,rider,steering});
  }

  const bumperWorld=createBumperWorld(bumperCars.map(car=>car.body));

  function railLine(points,color='teal',height=.86){for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],n=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.65));for(let j=0;j<=n;j++){const f=j/n,x=THREE.MathUtils.lerp(a[0],b[0],f),z=THREE.MathUtils.lerp(a[1],b[1],f);cyl(.035,.045,height,color,root,x,.28+height/2,z,6);ball(.055,'gold',root,x,.28+height,z);}for(const y of [.65,1.08])rod([a[0],y,a[1]],[b[0],y,b[1]],.025,color,root,5);}}
  function portal(x,z,width,title,vip=false){
    const g=group(x,.28,z,root),color=vip?'gold':'teal';
    for(const xx of [-width/2,width/2]){box(.13,2.3,.16,color,g,xx,1.15,0);box(.27,.16,.3,'cream',g,xx,.08,0);}
    box(width+.3,.48,.2,color,g,0,2.18,0);textSign(title,width+.22,.4,g,0,2.19,.11,{size:vip?92:78,bg:vip?'#80694c':'#2b5856'});
    // Closed arms and a card reader leave a real interaction location for later.
    box(.2,.82,.24,color,g,-width/2+.1,.41,.05);const arm=group(x-width/2+.1,1.07,z+.05,scene);box(width-.2,.07,.07,vip?'gold':'cream',arm,(width-.2)/2,0,0);gates.push({arm,x,z,width,open:false,amount:0,lane:vip?'vip':'normal'});
    box(.16,.23,.08,'metal',g,width/2-.08,1,.12);box(.09,.06,.025,vip?mat(0xefbb6c,.4):mat(0x79b9a0,.3),g,width/2-.08,1.04,.17);
    if(vip)textSign('园主专用',width,.2,g,0,1.8,.12,{size:85,bg:'#80694c'});
    return [x,.28,z];
  }
  function queueGuest(x,z,rotation,color='cream'){
    const g=group(x,.28,z,scene);g.rotation.y=rotation;
    const human=createHuman?createHuman(api,g,{color,variant:queueActors.length}):null;let standing=null;if(human){standing=human.g.clone(true);g.add(standing);batch(standing);human.g.visible=false;}
    queueActors.push({g,human,standing,position:[x,.28,z],rotation,lane:'normal'});
  }
  function admission({id,name,x,z,w=3.0,d=2.4,vipX,boarding,count=6}){
    rounded(w+.35,d+.35,.12,.035,0x8a9c96,root,x,.275,z-d/2);
    // Switchbacks open on alternating ends; visitors have room between rails.
    const step=w/3,exitX=x+w/3,exitHalf=Math.min(.46,w/6-.05);
    railLine([[x-w/2,z+.1],[x-w/2,z-d],[exitX-exitHalf,z-d]]);
    railLine([[exitX+exitHalf,z-d],[x+w/2,z-d],[x+w/2,z+.1]]);
    railLine([[x-w/2+step,z],[x-w/2+step,z-d+.78]]);
    railLine([[x-w/2+step*2,z-.78],[x-w/2+step*2,z-d]]);
    const entry=portal(x-w/3,z+.15,.92,'普通入口',false);
    const vip=portal(vipX,z+.15,.98,'VIP 入口',true);gates.slice(-2).forEach(g=>g.rideId=id);
    box(.9,.04,d+.7,'gold',root,vipX,.3,z-d/2+.1,false);box(.7,.045,d+.7,0x4d645f,root,vipX,.32,z-d/2+.1,false);
    for(const offset of [-.53,.53])railLine([[vipX+offset,z+.1],[vipX+offset,id==='ship'?-3.65:z-d-.2]],'gold');
    textSign(name,w,.28,root,x,2.5,z-d-.03,{size:76});
    for(let i=0;i<count;i++){const lane=i%3,depth=Math.floor(i/3);queueGuest(x-w/2+step*(lane+.5),z-.58-depth*.72,lane%2?Math.PI:0,['coral','cream','teal','gold'][i%4]);}
    queueActors.slice(-count).forEach(a=>a.rideId=id);
    const normalPath=[[entry[0],.28,z+.7],[entry[0],.28,z-d+.39],[x,.28,z-d+.39],[x,.28,z-.39],[exitX,.28,z-.39],[exitX,.28,z-d-.3],boarding];
    const vipPath=id==='ship'?[[vipX,.28,z+.7],[vipX,.28,-3.7],[7,.28,-3.7],[7,.28,-4.2],boarding]:[[vipX,.28,z+.7],[vipX,.28,z-d-.25],boarding];
    entries.push({id,name,normal:{entry,route:normalPath,allows:['npc','owner']},vip:{entry:vip,route:vipPath,allows:['owner'],gateState:'locked'},boarding,exit:[boarding[0]+1,.28,boarding[2]]});
  }
  admission({id:'coaster',name:'苍龙 · SKY DRAGON',x:-23.5,z:13,w:3.2,d:5,vipX:-20.2,boarding:[-24,1.55,1.9],count:12});
  admission({id:'bumper',name:'星光碰碰车',x:17,z:24.5,w:4.2,d:3.4,vipX:25.5,boarding:[18,.72,18.95],count:12});
  admission({id:'wheel',name:'星光摩天轮',x:-9.3,z:2.4,w:2.8,d:2.3,vipX:-6.5,boarding:[-9,.45,-2.8],count:6});
  admission({id:'carousel',name:'旋转木马',x:3.3,z:18.2,w:3,d:2.6,vipX:-.7,boarding:[3,1,12.8],count:6});
  admission({id:'ship',name:'飞翔海盗船',x:4.2,z:-2.2,w:2.8,d:2,vipX:10.8,boarding:[7,2.1,-9.7],count:3});

  // Generous promenades link the new districts to the original village.
  for(const x of [-1.65,1.65])box(.11,.035,9.5,'cream',root,x,.28,16,false);
  for(const z of [12.6,14.6])box(27,.035,.11,'cream',root,-7.8,.28,z,false);
  for(let z=11;z<21;z+=.55)box(.09,.04,.2,'gold',root,0,.28,z,false);
  garden(-9.8,17,10,6.4);garden(-18,18,5.6,6.8);garden(28.6,22,1.2,5.4);
  for(const [x,z,c] of [[-11,18,'pink'],[-5.5,18.4,'leaf'],[-19,20,'pink'],[-17.4,16.3,'leaf'],[28.6,24,'leaf']])tree(x,z,1.2,c,4.1);
  for(let x=-13.5;x<-5.8;x+=.65){shrub(x,14.3,.35);flowers(x,14.3,4,.25);}
  // Grassy coaster infield, small rocks and low shrubs below the elevated rails.
  for(const [x,z,w,d] of [[-16,-13,10,15],[3,-18,23,7],[18,-9,7,15]]){
    lawn(x,z,w,d);
    for(let i=0;i<18;i++){const xx=x+(Math.sin(i*2.4)*.42)*w,zz=z+(Math.cos(i*1.7)*.42)*d;shrub(xx,zz,.25+(i%3)*.1,i%2?'leaf':'grass');}
  }
  for(const [x,z] of [[-3,17],[3,17],[-10,13],[-18,12],[8,18],[28.5,21],[-10,-7],[12,-10]])lamp(x,z,3.4);
  for(const [x,z,r] of [[-18,14,Math.PI]])bench(x,z,r);
  for(const [x,z] of [[-2,22],[4,25]]){
    const table=group(x,.28,z,root);cyl(.7,.7,.09,'woodLight',table,0,.85,0,20);cyl(.07,.13,.8,'metal',table,0,.4,0,8);cyl(.035,.04,2.8,'cream',table,0,1.4,0,8);
    cyl(.08,1.35,.62,'coral',table,0,2.7,0,8);ball(.08,'gold',table,0,3.08,0);
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const xx=Math.cos(a)*1.05,zz=Math.sin(a)*1.05;cyl(.25,.25,.09,'teal',table,xx,.49,zz,12);cyl(.035,.07,.45,'metal',table,xx,.23,zz,8);}
  }
  textSign('园区导览 / PARK MAP',2.4,1.4,root,9.3,1.5,19.1,{size:80});
  for(const x of [8.35,10.25])box(.09,2.2,.1,'teal',root,x,1.35,19.07);
  textSign('云霄乐园 ←     → 星光碰碰车',4.8,.4,root,0,3.1,13.6,{size:56});
  for(const x of [-2.5,2.5])rod([x,.28,13.5],[x,3.4,13.5],.055,'teal',root);
  // Additional walkers stay on the public promenades, away from the VIP gates.
  walkingRoutes.push({curve:new THREE.CatmullRomCurve3([[-4,15.7],[-4,19.4],[-3.1,20],[-2.2,19.4],[-2.2,15.7],[-3.1,15.3]].map(([x,z])=>new THREE.Vector3(x,.28,z)),true,'centripetal')});
  walkingRoutes.at(-1).length=walkingRoutes.at(-1).curve.getLength();

  function setCoasterDistance(distance){
    coasterCars.forEach((car,i)=>{const u=(distance-i*1.4)/length,f=trackFrame(u);const ahead=track.getPointAt(((u+.45/length)%1+1)%1),behind=track.getPointAt(((u-.45/length)%1+1)%1);f.forward.copy(ahead).sub(behind).normalize();f.side.crossVectors(f.up,f.forward).normalize();f.up.crossVectors(f.forward,f.side).normalize();car.position.copy(f.p).addScaledVector(f.up,.23);rotationMatrix.makeBasis(f.side,f.up,f.forward);car.quaternion.setFromRotationMatrix(rotationMatrix);});
  }
  function update(dt,{coaster=true,bumper=true}={}){
    if(coaster){coasterMotion.update(dt);setCoasterDistance(coasterMotion.distance);}
    if(bumper)bumperWorld.update(dt);
    for(const car of bumperCars){car.g.position.x=car.body.x;car.g.position.z=car.body.z;car.g.rotation.y=car.body.angle;car.rider.rotation.x=car.body.lean;car.rider.rotation.z=car.body.sway;car.steering.rotation.z=-(car.body.input.steer||0)*.8;}
    bumperEntryGate.amount=THREE.MathUtils.damp(bumperEntryGate.amount,bumperEntryGate.open?1:0,5,dt);bumperEntryGate.g.position.y=1.04+bumperEntryGate.amount*2.2;bumperEntryGate.vipG.position.y=bumperEntryGate.g.position.y;
    for(const gate of gates){gate.amount=THREE.MathUtils.damp(gate.amount,gate.open?1:0,5,dt);gate.arm.rotation.z=gate.amount*Math.PI*.48;}
  }
  update(0);
  return {update,setCoasterDistance,bumperEntryGate,gates,coasterPassengers,entries,queueActors,track,trackLength:length,foundations,coasterCars,bumperCars,bumperWorld,coasterMotion,trackFrame,coasterHeight:Math.max(...frames.map(f=>f.p.y)),canUseEntrance};
}
