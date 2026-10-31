import * as THREE from './vendor/three.module.js';
import {PLAYER,createWalker,updateWalker,resolveWalker,supportHeight} from './first-person-physics.js';
import {PedestrianNavigation} from './pedestrian-navigation.js';
import {planBoardingPaths} from './boarding-worker.js';
import {turnToWalk} from './human.js';
import {RideSession} from './ride-session.js';

const names={wheel:'星光摩天轮',coaster:'苍龙过山车',carousel:'旋转木马',ship:'飞翔海盗船',bumper:'星光碰碰车'};
const clamp=THREE.MathUtils.clamp;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export class FirstPersonPark {
  constructor(api){
    this.api=api;this.active=false;this.mode='walking';this.walker=createWalker();this.walkEye=PLAYER.ground+PLAYER.eye;this.yaw=0;this.pitch=0;this.keys=new Set();this.jumpQueued=false;this.session=null;this.anchor=null;this.guide=null;this.clock=0;this.wheelAngle=0;this.bob=0;this.lookDrag=null;this.seatedNpcs={};this.queueMovers=[];this.savedQueue=[];this.companionExits=[];this.fadeTime=0;this.pendingFade=null;
    this.colliders=[...api.colliders,...api.expansion.queueActors.map(a=>({kind:'circle',x:a.position[0],z:a.position[2],r:.23,minY:.28,maxY:1.86})),{kind:'box',x:7,z:-12,w:12.4,d:5.1,minY:.28,maxY:1.85}];
    this.surfaces=api.platforms.surfaces;
    this.surfaces.push(...api.benches.map(b=>({kind:'box',x:b.x,z:b.z,w:Math.abs(Math.cos(b.rotation))*1.7+Math.abs(Math.sin(b.rotation))*.55,d:Math.abs(Math.sin(b.rotation))*1.7+Math.abs(Math.cos(b.rotation))*.55,y:.8})));
    // The station edge is physical: closed cabin doors cannot be walked through.
    this.colliders.push({kind:'box',x:-9,z:-3.76,w:3.3,d:.12,minY:.4,maxY:1.7,enabled:()=>!api.cabins.some(c=>c.doorAmount>.8&&Math.abs(c.g.getWorldPosition(new THREE.Vector3()).x-this.walker.x)<.29)});
    for(const gate of api.expansion.gates)this.colliders.push({kind:'box',x:gate.x,z:gate.z,w:gate.width,d:.12,minY:.4,maxY:1.2,enabled:()=>gate.amount<.78});
    for(const [x,w] of [[18,5.44],[25.5,1.7]])this.colliders.push({kind:'box',x,z:18.8975,w,d:.15,minY:.9,maxY:1.2,enabled:()=>api.expansion.bumperEntryGate.amount<.78});
    for(let d=0;d<api.expansion.trackLength;d+=.55){const p=api.expansion.track.getPointAt(d/api.expansion.trackLength);if(p.y<3)this.colliders.push({kind:'circle',x:p.x,z:p.z,r:.55,minY:p.y-.45,maxY:p.y+.1});}
    this.dynamicVisitors=[];
    this.buildWorld();this.buildSeats();this.buildUI();this.bindInput();
    this.navGeneration=0;if(typeof Worker!=='undefined'){this.navigationWorker=new Worker(new URL('./boarding-worker.js',import.meta.url),{type:'module'});this.navigationWorker.onmessage=({data})=>data.kind==='exit'?this.acceptCompanionExitPaths(data):this.acceptBoardingPaths(data);}
  }
  buildWorld(){
    const {scene,mesh,box,ball,cyl,rod,group,mat}=this.api;
    this.world=group(0,0,0,scene);this.world.visible=false;
    const land=mesh(new THREE.PlaneGeometry(700,700),mat(0x1c302d),this.world,0,-.02,0);land.rotation.x=-Math.PI/2;land.receiveShadow=true;
    // Distant terrain gives the park a permanent horizon instead of a floating plinth.
    for(let i=0;i<34;i++){const a=i*Math.PI*2/34,r=100+(i%4)*18;ball(1,mat(i%2?0x172733:0x1d3039),this.world,Math.cos(a)*r,-3,Math.sin(a)*r,28,12+(i%5)*4,24);}
    for(let i=0;i<110;i++){const a=i*2.39996,r=58+(i%17)*2.7,x=Math.cos(a)*r,z=Math.sin(a)*r,h=3+(i%7)*.55;cyl(.14,.23,h*.7,'wood',this.world,x,h*.3,z,6);mesh(new THREE.ConeGeometry(1.1+(i%3)*.25,h,7),mat(0x18392f),this.world,x,h*.75,z);}
    ball(2.3,mat(0xe1e4d7,.5),this.world,-70,90,-130);
    const stars=[];for(let i=0;i<650;i++){const a=i*2.39996,y=.18+(i%97)/120,r=Math.sqrt(1-y*y);stars.push(Math.cos(a)*r*230,y*230,Math.sin(a)*r*230);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));this.world.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:0xc4d0e6,size:.14,transparent:true,opacity:.65,depthWrite:false})));
    this.api.batch(this.world);
    this.marker=group(0,0,0,scene);this.marker.visible=false;
    const markerMat=new THREE.MeshBasicMaterial({color:0xeecb8f,transparent:true,opacity:.7,depthWrite:false});
    const ring=mesh(new THREE.TorusGeometry(.28,.025,8,36),markerMat,this.marker,0,0,0);ring.rotation.x=-Math.PI/2;
    const cone=mesh(new THREE.ConeGeometry(.1,.2,6),markerMat,this.marker,0,.45,0);cone.rotation.x=Math.PI;
  }
  createSeated(parent,x,y,z,rotation=0,color='teal',riding=false){
    const scale=riding?1.45:1.3,g=this.api.group(x,y-.45/scale,z,parent);g.scale.setScalar(1/scale);g.rotation.y=rotation;this.humanIndex=(this.humanIndex||0)+1;this.api.createHuman(this.api,g,{color,variant:this.humanIndex,seated:true,riding});this.api.batch(g);return g;
  }
  buildSeats(){
    const {group,box,ball,rod,mat,expansion,horseBobs,hull}=this.api;
    this.bumperIndex=0;this.coasterSeatIndex=0;
    this.bumperAnchors=expansion.bumperCars.map(c=>{const a=group(0,1.27,-.18,c.g);a.rotation.y=Math.PI;return a;});
    this.coasterAnchors=expansion.coasterPassengers.map(seat=>{const a=group(seat.position.x,1.12,.04,seat.parent);a.rotation.y=Math.PI;return a;});
    this.anchors={coaster:this.coasterAnchors[0],bumper:this.bumperAnchors[0],ship:group(0,1.05,.38,hull),carousel:group(-.32,1.04,.18,horseBobs[0].h)};
    this.horseAnchors=horseBobs.map(o=>{const a=group(-.32,.88,.18,o.h);a.rotation.y=-Math.PI/2;return a;});this.anchors.carousel=this.horseAnchors[0];
    this.anchors.coaster.rotation.y=Math.PI;this.anchors.bumper.rotation.y=Math.PI;this.anchors.ship.rotation.y=-Math.PI/2;this.anchors.carousel.rotation.y=-Math.PI/2;
    this.seatedNpcs.coaster=expansion.coasterPassengers.slice(1,8);
    this.seatedNpcs.bumper=expansion.bumperCars.slice(1,7).map(c=>c.rider);
    this.seatedNpcs.ship=[];for(let i=0;i<5;i++)this.seatedNpcs.ship.push(this.createSeated(hull,-1.24+(i%4)*.62,.52,i<4?-.38:.38,Math.PI/2,i%2?'cream':'teal'));
    this.allHorseNpcs=horseBobs.map((o,i)=>this.createSeated(o.h,-.05,.35,0,Math.PI/2,i%2?'coral':'cream',true));this.seatedNpcs.carousel=this.allHorseNpcs.slice(1,7);this.allHorseNpcs.forEach(g=>g.visible=false);
    this.seatedNpcs.ship.forEach(g=>g.visible=false);this.seatedNpcs.carousel.forEach(g=>g.visible=false);
    this.playerRig=this.api.createHuman(this.api,this.api.scene,{variant:3,seated:true});this.playerRig.head.visible=false;this.playerRig.body.visible=false;this.playerBody=this.playerRig.g;this.playerBody.visible=false;
    this.mountHands=new THREE.Group();this.mountHands.visible=false;

  }
  buildUI(){
    const entry=document.createElement('button');entry.id='enter-park';entry.className='chrome enter-park';entry.innerHTML='<span>进入乐园</span><small>第一人称 · 走进星光里</small>';entry.addEventListener('click',()=>this.enter());document.body.append(entry);
    const ui=document.createElement('section');ui.id='fp-ui';ui.hidden=true;ui.innerHTML=`
      <div class="fp-top"><div class="fp-title">✳ 星野游乐园<small id="fp-mode">园主 VIP · 自由探索</small></div><div class="fp-actions"><button id="fp-guide">导览</button><button id="fp-help">操作</button><button id="fp-exit">返回模型</button></div></div>
      <div id="fp-ride-status" hidden><strong></strong><span></span><div><i></i></div></div>
      <div id="fp-crosshair" aria-hidden="true">·</div><div id="fp-toast" role="status" aria-live="polite"></div>
      <div id="fp-compass" hidden></div>
      <div class="fp-bottom"><button id="fp-interact" hidden></button><button id="fp-start" hidden>Enter · 开始游玩</button><div id="fp-hint">WASD 走动 · Shift 跑 · 空格 跳 · F 交互 · P 烟花</div></div>
      <div id="fp-guide-panel" hidden><h2>今晚想去哪里？</h2><p>选择项目，跟随金色指引步行前往。</p>${Object.entries(names).map(([id,name])=>`<button data-guide="${id}">${name}<span>指引至 VIP 入口 →</span></button>`).join('')}<button id="fp-guide-close">收起导览</button></div>
      <div id="fp-help-panel" hidden><h2>走进乐园</h2><p>点击画面锁定鼠标，或按住画面拖动环顾。方向键也能转动视角。</p><dl><dt>W A S D</dt><dd>行走 / 驾驶碰碰车</dd><dt>Shift / 空格</dt><dd>跑步 / 跳跃；驾驶时空格刹车</dd><dt>F</dt><dd>开门、跨坐座位、坐下、起身</dd><dt>H</dt><dd>隐藏 / 显示界面，方便录屏</dd><dt>Enter</dt><dd>游客入座后启动项目</dd><dt>P</dt><dd>随时放烟花，不改变视角</dd><dt>Esc</dt><dd>释放鼠标，使用界面</dd></dl><p>先步行上台阶到座位旁，再按 F 登乘。摩天轮舱门打开后可直接走入，舱内可走动或按 F 坐下。</p><button id="fp-help-close">开始探索</button></div>
      <div id="fp-touch"><div class="fp-dpad"><button data-move="KeyW" aria-label="向前">↑</button><button data-move="KeyA" aria-label="向左">←</button><button data-move="KeyS" aria-label="向后">↓</button><button data-move="KeyD" aria-label="向右">→</button></div><div class="fp-touch-actions"><button data-move="ShiftLeft">跑</button><button id="fp-jump">跳</button><button id="fp-fireworks">烟花 P</button></div></div>
      <button id="fp-firework-key" title="P · 随时放烟花">✧ <span>P 烟花</span></button><div id="fp-fade" aria-hidden="true"></div>`;
    document.body.append(ui);this.ui=ui;this.interactButton=ui.querySelector('#fp-interact');this.status=ui.querySelector('#fp-ride-status');this.hint=ui.querySelector('#fp-hint');
    ui.querySelector('#fp-exit').onclick=()=>this.leave();ui.querySelector('#fp-guide').onclick=()=>{this.releasePointer();const p=ui.querySelector('#fp-guide-panel');p.hidden=!p.hidden;};
    ui.querySelector('#fp-guide-close').onclick=()=>ui.querySelector('#fp-guide-panel').hidden=true;
    ui.querySelector('#fp-help').onclick=()=>{this.releasePointer();ui.querySelector('#fp-help-panel').hidden=false;};ui.querySelector('#fp-help-close').onclick=()=>{ui.querySelector('#fp-help-panel').hidden=true;this.lockPointer();};
    ui.querySelectorAll('[data-guide]').forEach(b=>b.onclick=()=>{this.guide=b.dataset.guide;ui.querySelector('#fp-guide-panel').hidden=true;this.toast(`跟随指引前往${names[this.guide]}`);});
    this.interactButton.onclick=()=>this.interact();ui.querySelector('#fp-start').onclick=()=>this.startRide();
    for(const id of ['fp-firework-key','fp-fireworks'])ui.querySelector('#'+id).onclick=()=>this.fireworks();
    ui.querySelector('#fp-jump').onclick=()=>this.jumpQueued=true;
    ui.querySelectorAll('[data-move]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);this.keys.add(b.dataset.move);};b.onpointerup=b.onpointercancel=()=>this.keys.delete(b.dataset.move);});
  }
  bindInput(){
    const canvas=this.api.renderer.domElement;
    addEventListener('keydown',e=>{
      if(!this.active||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName))return;
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','KeyF','KeyP','Enter'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);if(e.repeat)return;
      if(e.code==='KeyF')this.interact();if(e.code==='KeyP')this.fireworks();if(e.code==='Enter')this.startRide();if(e.code==='Space')this.jumpQueued=true;
    });
    addEventListener('keyup',e=>this.keys.delete(e.code));addEventListener('blur',()=>{this.keys.clear();this.lookDrag=null;});
    document.addEventListener('visibilitychange',()=>{this.keys.clear();this.lookDrag=null;});
    canvas.addEventListener('pointerdown',e=>{if(!this.active)return;this.lookDrag={x:e.clientX,y:e.clientY};if(e.pointerType==='mouse')this.lockPointer();canvas.setPointerCapture?.(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!this.active||document.pointerLockElement===canvas||!this.lookDrag)return;this.look(e.clientX-this.lookDrag.x,e.clientY-this.lookDrag.y);this.lookDrag={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',()=>this.lookDrag=null);canvas.addEventListener('pointercancel',()=>this.lookDrag=null);
    document.addEventListener('mousemove',e=>{if(this.active&&document.pointerLockElement===canvas)this.look(e.movementX,e.movementY);});
    document.addEventListener('pointerlockerror',()=>{if(this.active)this.toast('可按住画面拖动环顾，也可用方向键');});
  }
  look(dx,dy){this.yaw-=clamp(dx,-150,150)*.0023;this.pitch=clamp(this.pitch-dy*.0023,-1.35,1.25);if(this.mode==='riding'||this.mode==='bench')this.yaw=clamp(this.yaw,-2.6,2.6);}
  lockPointer(){try{const result=this.api.renderer.domElement.requestPointerLock?.();result?.catch?.(()=>{});}catch{}}
  releasePointer(){if(document.pointerLockElement)document.exitPointerLock();this.keys.clear();}
  toast(text){const t=this.ui.querySelector('#fp-toast');t.textContent=text;t.classList.add('show');this.toastUntil=this.clock+3.6;}
  fade(action){this.fadeTime=.6;this.pendingFade=action;this.fadeDone=false;}
  enter(){
    if(this.active)return;const {camera,controls,scene,expansion}=this.api;this.savedOrbit={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:controls.target.clone(),fov:camera.fov,near:camera.near,fog:scene.fog};
    this.fadeTime=0;this.pendingFade=null;this.ui.querySelector('#fp-fade').style.opacity='0';
    this.motion=null;this.cabinSeatMotion=null;this.cabin=null;this.cabinSeated=false;this.active=true;this.mode='walking';this.session=null;this.anchor=null;this.walker=createWalker();this.walkEye=PLAYER.ground+PLAYER.eye;this.yaw=0;this.pitch=.02;this.keys.clear();this.clock=0;
    this.walker.y=supportHeight(this.walker,this.surfaces);this.walkEye=this.walker.y+PLAYER.eye;
    controls.enabled=false;controls.autoRotate=false;this.api.cancelOrbit();camera.fov=68;camera.near=.08;camera.updateProjectionMatrix();scene.fog=new THREE.FogExp2(0x111a2b,.006);this.world.visible=true;
    document.body.classList.remove('clean');document.body.classList.add('first-person');this.ui.hidden=false;this.ui.querySelector('#fp-help-panel').hidden=false;
    for(const gate of expansion.gates){gate.open=false;gate.amount=0;gate.arm.rotation.z=0;}
    this.resetIdleRides();this.toast('欢迎回家，园主。F 交互，P 随时放烟花。');this.api.onModeChange?.(true);
  }
  leave(){
    if(!this.active)return;this.restoreQueue(true);this.active=false;this.releasePointer();this.mode='walking';this.motion=null;this.session=null;this.anchor=null;this.cabin=null;this.world.visible=false;this.marker.visible=false;this.playerBody.visible=false;this.mountHands.visible=false;
    for(const a of this.api.walkers){if(!a.companion)continue;this.api.scene.attach(a.g);a.g.scale.setScalar(1);a.g.position.copy(a.route.curve.getPointAt(a.distance/a.route.length));a.managed=false;a.waiting=false;a.human.pose(0);a.human.setRiding?.(false);}
    this.ui.hidden=true;document.body.classList.remove('first-person');const {camera,controls,scene,expansion}=this.api;
    camera.position.copy(this.savedOrbit.position);camera.quaternion.copy(this.savedOrbit.quaternion);camera.fov=this.savedOrbit.fov;camera.near=this.savedOrbit.near;camera.updateProjectionMatrix();scene.fog=this.savedOrbit.fog;controls.target.copy(this.savedOrbit.target);controls.enabled=true;
    expansion.coasterPassengers.forEach(g=>g.visible=true);expansion.bumperCars.forEach(c=>{c.rider.visible=true;c.body.controller='npc';c.body.input={throttle:0,steer:0,brake:false};});this.seatedNpcs.ship.forEach(g=>g.visible=false);this.seatedNpcs.carousel.forEach(g=>g.visible=false);
    expansion.gates.forEach(g=>g.open=false);expansion.bumperEntryGate.open=false;this.api.onModeChange?.(false);
  }
  resetIdleRides(){
    const a=this.api,e=a.expansion;a.carousel.rotation.y=0;a.ship.rotation.z=0;a.horseBobs.forEach(o=>o.h.position.y=1.45);
    // Front car at the departure end, all six cars on the straight station run.
    e.bumperEntryGate.open=false;this.stationDistance=8.84;e.setCoasterDistance(this.stationDistance);e.coasterPassengers.forEach(g=>g.visible=false);
    e.bumperCars.forEach((c,i)=>{Object.assign(c.body,{x:i===0?18:[12,18,24,12,18,24,24][i-1],z:i===0?16:[6,6,6,12,12,12,16][i-1],angle:i<4?Math.PI:0,vx:0,vz:0,omega:0,lean:0,leanSpeed:0,sway:0,swaySpeed:0,controller:'player',input:{throttle:0,steer:0,brake:true}});c.rider.visible=false;});e.update(0,{coaster:false,bumper:false});
    this.seatedNpcs.ship.forEach(g=>g.visible=false);this.seatedNpcs.carousel.forEach(g=>g.visible=false);
  }
  fireworks(){if(!this.active)return;this.api.fireworks();this.toast('烟花已点亮夜空，抬头看看吧。');}
  nearestInteraction(){
    if(this.motion)return null;
    if(this.cabinSeatMotion)return null;
    if(this.mode==='cabin')return {kind:this.cabinSeated?'cabinStand':'cabinSit',label:this.cabinSeated?'F · 从座椅起身':'F · 坐在舱内座椅上'};
    if(this.mode==='bench')return {kind:'stand',label:'F · 起身继续探索'};
    if(this.session){if(this.session.canLeave)return {kind:'leaveRide',label:this.session.phase==='complete'?'F · 项目已停稳，离座':'F · 取消乘坐并离座'};return null;}
    const pos=this.walker,options=[];
    for(const gate of this.api.expansion.gates){if(gate.lane!=='vip')continue;const d=Math.hypot(pos.x-gate.x,pos.z-gate.z);if(d<1.5)options.push({kind:'gate',gate,d,label:`F · ${gate.open?'关闭':'打开'}${names[gate.rideId]} VIP 门`});}
    this.api.scene.updateMatrixWorld(true);
    for(const entry of this.api.expansion.entries){
      if(entry.id==='wheel')continue;const gate=this.api.expansion.gates.find(g=>g.rideId===entry.id&&g.lane==='vip');if(!gate.open)continue;
      if(entry.id==='bumper'||entry.id==='coaster'){
        const anchors=entry.id==='bumper'?this.bumperAnchors:this.coasterAnchors;
        anchors.forEach((anchor,seatIndex)=>{const p=anchor.getWorldPosition(new THREE.Vector3()),d=Math.hypot(pos.x-p.x,pos.z-p.z);if(d<1.65&&Math.abs(pos.y-(entry.id==='bumper'?.72:1.53))<.25)options.push({kind:'board',entry,anchor,seatIndex,d:d-.3,label:entry.id==='bumper'?`F · 驾驶 ${seatIndex+1} 号碰碰车`:`F · 坐第 ${Math.floor(seatIndex/2)+1} 排${seatIndex%2?'右':'左'}座`});});continue;
      }
      if(entry.id==='carousel'){this.horseAnchors.forEach((anchor,horseIndex)=>{const p=anchor.getWorldPosition(new THREE.Vector3()),d=Math.hypot(pos.x-p.x,pos.z-p.z);if(d<1.3&&pos.y>.6)options.push({kind:'board',entry,anchor,horseIndex,d:d-.3,label:'F · 扶住马鞍，跨坐木马'});});continue;}
      const p=this.anchors[entry.id].getWorldPosition(new THREE.Vector3()),d=Math.hypot(pos.x-p.x,pos.z-p.z),height=entry.id==='coaster'?1.3:entry.id==='ship'?1.4:.6;
      if(d<(entry.id==='ship'?2.5:1.65)&&pos.y>=height)options.push({kind:'board',entry,d:d-.3,label:`F · ${entry.id==='carousel'?'扶住马鞍，跨坐木马':'扶住扶手，进入座位'}`});
    }
    for(const bench of this.api.benches){const d=Math.hypot(pos.x-bench.x,pos.z-bench.z);const local=bench.g.worldToLocal(new THREE.Vector3(pos.x,pos.y,pos.z));if(d<1.7&&local.z>.15&&Math.abs(pos.y-.28)<.25)options.push({kind:'bench',bench,d,label:'F · 坐在长椅上'});}
    return options.sort((a,b)=>a.d-b.d)[0]??null;
  }
  beginMotion(anchor,onDone,{duration=3,id='bench',exiting=false}={}){
    this.releasePointer();this.api.scene.updateMatrixWorld(true);
    const from=this.api.camera.position.clone(),fromQ=this.api.camera.quaternion.clone(),to=anchor.getWorldPosition(new THREE.Vector3()),toQ=anchor.getWorldQuaternion(new THREE.Quaternion());
    const outward=new THREE.Vector3(0,0,-1).applyQuaternion(toQ),front=to.clone().addScaledVector(outward,.45);front.y=id==='bench'?this.walker.y+PLAYER.eye:to.y+.36;
    let approach=front.clone(),inside=front.clone();
    if(id==='bumper'){
      const car=this.api.expansion.bumperCars[this.bumperIndex].g,local=car.worldToLocal(from.clone()),side=local.x<0?-1:1;
      approach=car.localToWorld(new THREE.Vector3(side*1.04,PLAYER.eye,-.18));inside=car.localToWorld(new THREE.Vector3(side*.22,1.56,-.18));
    }else if(id==='coaster'){
      const car=anchor.parent,side=anchor.position.x<0?-1:1;
      approach=car.localToWorld(new THREE.Vector3(side*1.15,0,anchor.position.z));approach.y=1.53+PLAYER.eye;
      inside=car.localToWorld(new THREE.Vector3(side*.43,anchor.position.y+.22,anchor.position.z));
    }else if(id==='bench'){
      approach=anchor.parent.localToWorld(new THREE.Vector3(anchor.position.x,PLAYER.eye,.86));inside.copy(approach);
    }else if(id==='ship'){
      approach.set(7,2.1+PLAYER.eye,-10.24);inside.set(7,2.62+PLAYER.eye,-11.12);
    }else if(id==='carousel'){
      const radial=new THREE.Vector3(to.x-3,0,to.z-7).normalize();approach.copy(to).addScaledVector(radial,.8);approach.y=1.05+PLAYER.eye;inside.copy(to).addScaledVector(radial,.24);inside.y=to.y+.08;
    }
    const stand=to.clone();stand.y=id==='bench'?this.walker.y+PLAYER.eye:stand.y+(id==='carousel'?.08:.36);
    const frame=(p,q,sit=0,step=false)=>({p:p.clone(),q:q.clone(),sit,step});
    let frames;
    if(exiting){
      const raised=from.clone();raised.y+=id==='carousel'?.1:.36;
      const clearance=to.clone();clearance.y=Math.max(to.y,raised.y-.18);
      frames=[frame(from,fromQ,1),frame(raised,fromQ,0),frame(raised,toQ,0),frame(clearance,toQ,0,true),frame(to,toQ,0)];
      if(id==='ship')frames=[frame(from,fromQ,1),frame(raised,fromQ),frame(new THREE.Vector3(7,2.62+PLAYER.eye,-11.05),toQ,0,true),frame(new THREE.Vector3(7,2.1+PLAYER.eye,-10.2),toQ,0,true),frame(to,toQ)];
      if(id==='carousel'){const stirrup=from.clone().lerp(to,.5);stirrup.y=to.y+.55;frames=[frame(from,fromQ,1),frame(raised,fromQ,.4),frame(stirrup,toQ,.1,true),frame(to,toQ,0,true)];}
    }else{
      let approachFrames=[frame(approach,fromQ,0,true)];
      if(id==='bumper'||id==='bench'||id==='coaster'){
        const nearby=[...this.colliders,...this.vehicleColliders()].filter(c=>Math.abs(c.x-this.walker.x)<(c.w||2*c.r||0)/2+4&&Math.abs(c.z-this.walker.z)<(c.d||2*c.r||0)/2+4);
        const nav=new PedestrianNavigation(nearby,this.surfaces,{radius:PLAYER.radius}),path=nav.path(this.walker,{x:approach.x,y:this.walker.y,z:approach.z});
        if(!path){this.toast('请从座位侧面靠近，留出转身空间。');return;}
        const corners=path.filter((p,i)=>i===path.length-1||(i>0&&Math.abs((p.x-path[i-1].x)*(path[i+1].z-p.z)-(p.z-path[i-1].z)*(path[i+1].x-p.x))>.00001));
        approachFrames=corners.map(p=>frame(new THREE.Vector3(p.x,p.y+PLAYER.eye,p.z),fromQ,0,true));
      }
      frames=[frame(from,fromQ),...approachFrames,frame(inside,fromQ,0,true),frame(inside,toQ),frame(stand,toQ,0,true),frame(to,toQ,1)];
      if(id==='bench'){const lower=to.clone().lerp(inside,.22);lower.y=to.y+.16;frames=[frame(from,fromQ),...approachFrames,frame(inside,toQ),frame(lower,toQ,.55,true),frame(to,toQ,1)];}
    }
    // Each segment ends at a foot placement or seated pose; no airborne sine arc.
    const times=frames.slice(1).map((f,i)=>Math.max(i===frames.length-2?.65:.16,frames[i].p.distanceTo(f.p)/1.35,frames[i].q.angleTo(f.q)/2.8));
    this.api.scene.attach(this.playerBody);this.playerBody.scale.setScalar(1);this.playerBody.visible=true;
    this.motion={frames,times,onDone,elapsed:0,duration:times.reduce((a,b)=>a+b,0),id,exiting};this.anchor=null;this.mode='mounting';
  }
  interact(){
    if(!this.active||this.motion)return;const action=this.nearestInteraction();if(!action){this.toast('走上台阶，靠近座位后按 F；摩天轮请等待舱门打开后走入。');return;}
    if(action.kind==='gate'){action.gate.open=!action.gate.open;if(action.gate.rideId==='bumper')this.api.expansion.bumperEntryGate.open=action.gate.open;this.toast(action.gate.open?'通道已开启，请步行上台阶前往登乘平台。':'通道已关闭');return;}
    if(action.kind==='cabinSit'||action.kind==='cabinStand'){
      this.cabinSeated=action.kind==='cabinSit';const toX=this.cabinSeated?(this.cabinLocal.x<0?-.69:.69):clamp(this.cabinLocal.x,-.43,.43),toZ=clamp(this.cabinLocal.z,-.5,.5);this.cabinEyeTarget=this.cabinSeated?1.17:PLAYER.eye;
      this.cabinSeatMotion={elapsed:0,fromX:this.cabinLocal.x,fromZ:this.cabinLocal.z,toX,toZ,fromEye:this.cabinEye,sitting:this.cabinSeated,fromYaw:this.yaw,toYaw:this.cabinSeated?(toX<0?-Math.PI/2:Math.PI/2):this.yaw};this.playerBody.visible=false;return;
    }
    if(action.kind==='bench'){
      this.returnPose={...this.walker,yaw:this.yaw,pitch:this.pitch};const local=action.bench.g.worldToLocal(new THREE.Vector3(this.walker.x,this.walker.y,this.walker.z)),anchor=this.api.group(clamp(local.x,-.4,.4),1.32,.03,action.bench.g);anchor.userData.temporarySeat=true;anchor.rotation.y=Math.PI;
      this.beginMotion(anchor,()=>{this.mode='bench';this.anchor=anchor;this.yaw=0;this.pitch=-.12;this.attachPlayerBody();},{id:'bench'});return;
    }
    if(action.kind==='stand'||action.kind==='leaveRide'){
      const oldAnchor=this.anchor;this.returnPose=this.disembarkPose();
      const target=this.api.group(this.returnPose.x,this.returnPose.y+PLAYER.eye,this.returnPose.z,this.api.scene);target.rotation.y=this.returnPose.yaw;
      this.beginMotion(target,()=>{target.removeFromParent();this.returnToWalk();if(oldAnchor?.userData.temporarySeat)oldAnchor.removeFromParent();},{id:this.session?.id||'bench',exiting:true});return;
    }
    if(action.kind==='board'){
      if(this.companionExits.some(e=>!e.points||e.segment<=e.exitIndex)){this.toast('同伴正在离开上一个项目，请稍候再上车。');return;}
      this.selectRideSeat(action);
      this.returnPose={...this.walker,yaw:this.yaw,pitch:this.pitch};this.entry=action.entry;this.guide=null;
      this.beginMotion(this.anchors[action.entry.id],()=>{this.session=new RideSession(action.entry.id,{length:this.api.expansion.trackLength});this.session.board();if(action.entry.id==='carousel')this.session.angle=this.api.carousel.rotation.y;this.mountRide(action.entry.id);},{id:action.entry.id});
    }
  }
  selectRideSeat(action){
    const id=action.entry.id;if(action.anchor)this.anchors[id]=action.anchor;
    if(id==='bumper')this.bumperIndex=action.seatIndex??0;
    if(id==='coaster')this.coasterSeatIndex=action.seatIndex??0;
    const available=id==='bumper'?this.api.expansion.bumperCars.filter((_,i)=>i!==this.bumperIndex).map(c=>c.rider):id==='coaster'?this.api.expansion.coasterPassengers.filter((_,i)=>i!==this.coasterSeatIndex):id==='carousel'?this.allHorseNpcs.filter((_,i)=>i!==(action.horseIndex??0)):this.seatedNpcs[id]?.slice();
    if(!available)return;
    for(let i=available.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[available[i],available[j]]=[available[j],available[i]];}
    this.seatedNpcs[id]=available;
  }
  posePlayer(sit=0,stride=0,mount=0){
    this.playerRig.pose(sit,stride,mount);this.playerRig.body.visible=false;
    this.playerRig.legs.forEach(l=>l.visible=sit>.75);
    // Relax the elbows and settle the palms on the thighs, below the eye line.
    this.playerRig.arms.forEach((a,i)=>{a.rotation.z=(i?-1:1)*.4*sit;a.position.y=THREE.MathUtils.lerp(1.055,.78,sit);a.rotation.x=THREE.MathUtils.lerp(a.rotation.x,-.1,sit);a.userData.forearm.rotation.x=THREE.MathUtils.lerp(a.userData.forearm.rotation.x,-.7,sit);});
  }
  attachPlayerBody(){
    if(!this.anchor)return;this.anchor.add(this.playerBody);const scale=this.anchor.getWorldScale(new THREE.Vector3());this.playerBody.scale.set(1/scale.x,1/scale.y,1/scale.z);this.playerBody.position.set(0,-1.15/scale.y,0);this.playerBody.rotation.set(0,Math.PI,0);this.posePlayer(1);this.playerBody.visible=true;
  }
  mountRide(id){
    this.mode='riding';this.anchor=this.anchors[id];this.yaw=0;this.pitch=id==='bumper'?-.25:-.08;this.attachPlayerBody();this.prepareBoarding(id);
    this.api.expansion.gates.filter(g=>g.rideId===id).forEach(g=>g.open=g.lane==='normal');
    if(id==='bumper')this.api.expansion.bumperEntryGate.open=true;
    this.toast('你已入座，五位同伴正在选择空位登乘。');
  }
  prepareBoarding(id){
    this.finishCompanionExits();this.api.scene.updateMatrixWorld(true);
    const seats=this.seatedNpcs[id],actors=this.api.walkers.filter(a=>a.companion).slice(0,Math.min(5,seats.length));
    this.session.npcCount=actors.length;this.session.physicalBoarding=true;
    this.api.expansion.gates.filter(g=>g.rideId===id).forEach(g=>g.open=g.lane==='normal');
    // Gate bars animate open before anyone reaches them; path planning treats them as open.
    const vip=this.entry.vip.route,privateLane={kind:'box',x:vip[0][0],z:(vip[0][2]+vip[1][2])/2,w:1.25,d:Math.abs(vip[0][2]-vip[1][2])+.3,minY:.28,maxY:2};
    const navColliders=[...this.colliders.filter(c=>!c.enabled),...this.vehicleColliders(),privateLane];
    this.savedQueue=actors.map(a=>({a,position:a.g.position.clone(),rotation:a.g.rotation.y,visible:a.g.visible,waiting:!!a.waiting}));actors.forEach(a=>{a.managed=true;a.human.setRiding?.(id==='carousel');});
    this.queueMovers=actors.map((actor,i)=>{
      const seat=seats[i],target=seat.getWorldPosition(new THREE.Vector3()),q=seat.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(0,0,1).applyQuaternion(q),side=new THREE.Vector3(1,0,0).applyQuaternion(q);
      let candidates=[];
      if(id==='bumper')candidates=[-1,1].map(sign=>target.clone().addScaledVector(side,sign*1.12).setY(.72));
      else if(id==='coaster'){const p=seat.parent.localToWorld(new THREE.Vector3(seat.position.x<0?-1.15:1.15,0,seat.position.z));p.y=1.53;candidates=[p];}
      else if(id==='carousel'){const radial=new THREE.Vector3(target.x-3,0,target.z-7).normalize();candidates=[target.clone().addScaledVector(radial,.98).setY(1.05)];}
      else candidates=[new THREE.Vector3(7,2.1,-9.7)];
      const path=null;
      const mover={actor,seat,index:i,path,candidates,segment:1,phase:'planning',elapsed:0,startAt:.15+i*.18,target,q,forward,side};

      return mover;
    });
    const request={generation:++this.navGeneration,colliders:navColliders,surfaces:this.surfaces,requests:this.queueMovers.map(m=>({start:{x:m.actor.g.position.x,y:m.actor.g.position.y,z:m.actor.g.position.z},candidates:m.candidates.map(p=>({x:p.x,y:p.y,z:p.z}))}))};
    if(this.navigationWorker)this.navigationWorker.postMessage(request);else this.acceptBoardingPaths({generation:request.generation,paths:planBoardingPaths(request)});
    seats.forEach(seat=>seat.visible=false);
    if(id==='coaster')this.api.expansion.coasterPassengers[this.coasterSeatIndex].visible=false;
    if(id==='bumper')this.api.expansion.bumperCars[this.bumperIndex].rider.visible=false;
  }
  acceptBoardingPaths({generation,paths,error}){if(generation!==this.navGeneration||!this.session)return;this.queueMovers.forEach((m,i)=>{m.path=paths?.[i]?.filter((p,j,all)=>j===0||j===all.length-1||Math.abs((p.x-all[j-1].x)*(all[j+1].z-p.z)-(p.z-all[j-1].z)*(all[j+1].x-p.x))>.00001||Math.abs(p.y-all[j-1].y)>.001||Math.abs(all[j+1].y-p.y)>.001);m.phase=m.path?'waiting':'blocked';m.startAt=this.session.boardTime+.15+i*.18;});if(error)this.toast('通道暂时不可达，请离座后重试。');}
  finishCompanionExits(){
    // On another ride request, plan from wherever companions have actually reached.
    for(const e of this.companionExits){e.a.managed=false;e.a.human.pose(0);e.a.human.setRiding?.(false);e.a.waiting=true;}this.companionExits=[];this.exitGeneration=(this.exitGeneration||0)+1;
  }
  restoreQueue(immediate=false){
    this.navGeneration=(this.navGeneration||0)+1;this.exitGeneration=(this.exitGeneration||0)+1;
    if(immediate){for(const e of this.companionExits){e.a.g.position.copy(e.home);e.a.g.rotation.y=e.rotation;e.a.managed=false;e.a.waiting=!!e.waiting;e.a.human.pose(0);e.a.human.setRiding?.(false);}this.companionExits=[];}
    for(const saved of this.savedQueue){
      const {a,position,rotation,visible,waiting}=saved,m=this.queueMovers.find(m=>m.actor===a);this.api.scene.attach(a.g);a.g.scale.setScalar(1);a.g.visible=visible;a.human.g.visible=true;
      if(!immediate&&a.companion&&m?.phase==='seated'){
        const start=a.g.position.clone(),stand=start.clone();stand.y+=.22;const id=this.session?.id;
        let starts=[];
        if(id==='bumper')starts=[-1,1].map(side=>{const p=m.seat.parent.localToWorld(new THREE.Vector3(side*1.25,0,-.18));p.y=.72;return p;});
        else if(id==='carousel'){const horse=m.seat.parent.getWorldPosition(new THREE.Vector3()),radial=new THREE.Vector3(horse.x-3,0,horse.z-7).normalize();starts=[horse.addScaledVector(radial,.98).setY(1.05)];}
        else if(id==='coaster'){const p=m.seat.parent.localToWorld(new THREE.Vector3(m.seat.position.x<0?-1.15:1.15,0,m.seat.position.z));p.y=1.53;starts=[p];}
        else starts=[new THREE.Vector3(7,2.1,-9.7)];
        this.companionExits.push({a,start,stand,starts,points:null,segment:1,elapsed:0,home:position.clone(),rotation,waiting,ride:id});a.managed=true;
      }else{a.g.position.copy(position);a.g.rotation.set(0,rotation,0);a.managed=false;a.waiting=!!waiting;a.human.pose(0);a.human.setRiding?.(false);}
    }
    this.savedQueue=[];this.queueMovers=[];
    if(this.companionExits.length){
      this.api.expansion.gates.filter(g=>g.rideId===this.session?.id&&g.lane==='normal').forEach(g=>g.open=true);if(this.session?.id==='bumper')this.api.expansion.bumperEntryGate.open=true;
      const request={kind:'exit',generation:this.exitGeneration,colliders:[...this.colliders.filter(c=>!c.enabled),...this.vehicleColliders()],surfaces:this.surfaces,requests:this.companionExits.map(e=>({starts:e.starts.map(p=>({x:p.x,y:p.y,z:p.z})),candidates:[{x:e.home.x,y:e.home.y,z:e.home.z}]}))};
      if(this.navigationWorker)this.navigationWorker.postMessage(request);else this.acceptCompanionExitPaths({generation:request.generation,paths:planBoardingPaths(request)});
    }
  }
  acceptCompanionExitPaths({generation,paths}){
    if(generation!==this.exitGeneration)return;
    this.companionExits.forEach((e,i)=>{const path=paths?.[i];if(!path)return;
      const prefix=e.ride==='ship'?[e.start,e.stand,new THREE.Vector3(e.start.x,2.84,-11.12),new THREE.Vector3(7,2.62,-11.05),new THREE.Vector3(7,2.1,-10.2)]:[e.start,e.stand];
      e.exitIndex=prefix.length;e.points=[...prefix,...path.map(p=>new THREE.Vector3(p.x,p.y,p.z))];
    });
  }
  updateCompanionExits(dt){
    for(const e of this.companionExits){
      const p=e.points?.[e.segment];if(!p)continue;const g=e.a.g,d=g.position.distanceTo(p),facing=turnToWalk(g,p.x-g.position.x,p.z-g.position.z,dt),step=Math.min(d,dt*1.6*facing);e.elapsed+=step;
      if(d>.001)g.position.lerp(p,step/d);
      e.a.human.pose(e.segment===1?Math.max(0,1-e.elapsed/.22):0,Math.sin(e.elapsed*8)*.35);
      if(d<=step+1e-8)e.segment++;
      if(e.segment>=e.points.length){g.position.copy(e.home);e.a.managed=false;e.a.waiting=!!e.waiting;e.a.human.pose(0);e.a.human.setRiding?.(false);}
    }
    this.companionExits=this.companionExits.filter(e=>!e.points||e.segment<e.points.length);
  }
  updateBoarding(dt){
    const s=this.session;if(!s||!this.entry||s.phase!=='boarding')return;
    for(const m of this.queueMovers){
      if(m.phase==='seated'||m.phase==='blocked'||m.phase==='planning'||s.boardTime<m.startAt)continue;
      const actor=m.actor,g=actor.g;
      if(m.phase==='waiting'){m.phase='walking';if(actor.standing)actor.standing.visible=false;actor.human.g.visible=true;}
      if(m.phase==='walking'){
        const next=m.path[m.segment],dx=next.x-g.position.x,dz=next.z-g.position.z,d=Math.hypot(dx,dz),facing=turnToWalk(g,dx,dz,dt),speed=next.y>.55?1.85:2.8,advance=Math.min(d,speed*dt*facing);
        // A following guest waits instead of occupying another guest's capsule.
        const nx=g.position.x+dx/Math.max(d,.001)*advance,nz=g.position.z+dz/Math.max(d,.001)*advance;
        const occupied=this.queueMovers.some(o=>o!==m&&o.index<m.index&&['walking','turning','entering','seat-turn','sitting'].includes(o.phase)&&Math.hypot(o.actor.g.position.x-nx,o.actor.g.position.z-nz)<.53);
        if(occupied){actor.human.pose?.(0,0);continue;}
        g.position.x=nx;g.position.z=nz;g.position.y=THREE.MathUtils.damp(g.position.y,next.y,18,dt);m.elapsed+=advance;
        actor.human.pose?.(0,advance>.001?Math.sin(m.elapsed*8)*.4:0);
        if(d<.03||advance>=d){m.segment++;if(m.segment>=m.path.length){m.phase='turning';m.elapsed=0;m.from=g.position.clone();m.fromYaw=g.rotation.y;m.seatYaw=Math.atan2(m.forward.x,m.forward.z);const toward=s.id==='ship'?new THREE.Vector3(7,2.1,-10.2):m.target;m.entryYaw=Math.atan2(toward.x-g.position.x,toward.z-g.position.z);}}
      }else{
        m.elapsed+=dt;
        if(m.phase==='turning'){const t=smooth(m.elapsed/.35);g.rotation.set(0,m.fromYaw+wrap(m.entryYaw-m.fromYaw)*t,0);actor.human.pose?.(0,0);if(t>=1){m.phase='entering';m.elapsed=0;const stand=m.target.clone();stand.y+=.22;m.enterPoints=s.id==='ship'?[m.from.clone(),new THREE.Vector3(7,2.1,-10.2),new THREE.Vector3(7,2.62,-10.8),new THREE.Vector3(m.target.x,stand.y,-11.12),stand]:[m.from.clone(),stand];m.enterLengths=m.enterPoints.slice(1).map((p,i)=>p.distanceTo(m.enterPoints[i]));m.enterDuration=Math.max(.7,m.enterLengths.reduce((a,b)=>a+b,0)/1.6);}}
        else if(m.phase==='entering'){
          // Step over the vehicle sill, then place both feet before lowering the hips.
          const t=clamp(m.elapsed/m.enterDuration,0,1);let distance=t*m.enterLengths.reduce((a,b)=>a+b,0),segment=0;while(segment<m.enterLengths.length-1&&distance>m.enterLengths[segment])distance-=m.enterLengths[segment++];
          const fraction=distance/Math.max(.001,m.enterLengths[segment]),next=m.enterPoints[segment].clone().lerp(m.enterPoints[segment+1],fraction),facing=turnToWalk(g,next.x-g.position.x,next.z-g.position.z,dt);
          if(facing<.7){m.elapsed-=dt;actor.human.pose?.(0,0);continue;}
          g.position.copy(next);actor.human.pose?.(0,Math.sin(t*Math.PI*2)*.42,Math.sin(t*Math.PI)*.35);
          if(t>=1){m.phase='seat-turn';m.elapsed=0;m.fromYaw=g.rotation.y;}
        }else if(m.phase==='seat-turn'){
          const t=smooth(m.elapsed/.35);g.rotation.set(0,m.fromYaw+wrap(m.seatYaw-m.fromYaw)*t,0);actor.human.pose?.(0,0);
          if(t>=1){m.phase='sitting';m.elapsed=0;}
        }else if(m.phase==='sitting'){
          const t=smooth(m.elapsed/.55);g.position.copy(m.target);g.position.y+=.22*(1-t);g.quaternion.copy(m.q);actor.human.pose?.(t,0);
          if(t>=1){m.phase='seated';m.seat.parent.attach(g);const scale=m.seat.parent.getWorldScale(new THREE.Vector3());g.scale.set(1/scale.x,1/scale.y,1/scale.z);}
        }
      }
    }
    s.boarded=this.queueMovers.filter(m=>m.phase==='seated').length;
    if(s.boarded===s.npcCount)s.phase='ready';
  }
  startRide(){
    if(!this.active||!this.session)return;
    if(this.session.phase==='ready'&&(this.api.expansion.gates.some(g=>g.rideId===this.session.id&&g.amount>.05)||(this.session.id==='bumper'&&this.api.expansion.bumperEntryGate.amount>.05))){this.toast('门禁正在关闭，请稍候再启动。');return;}
    if(!this.session.start()){if(this.session.phase==='boarding')this.toast('请稍等，同伴还在入座。');return;}
    this.api.expansion.gates.filter(g=>g.rideId===this.session.id).forEach(g=>g.open=false);
    if(this.session.id==='bumper'){const occupied=new Set(this.queueMovers.filter(m=>m.phase==='seated').map(m=>m.seat));this.api.expansion.bumperCars.forEach((c,i)=>{c.body.controller=i!==this.bumperIndex&&occupied.has(c.rider)?'npc':'player';c.body.input={throttle:0,steer:0,brake:i!==this.bumperIndex&&!occupied.has(c.rider)};});}
    this.toast(this.session.id==='bumper'?'W/S 前进倒车，A/D 转向，空格刹车。':'旅程开始，随时可以按 P 放烟花。');this.lockPointer();
  }
  disembarkPose(){
    const id=this.session?.id;if(id!=='bumper'&&id!=='carousel')return this.returnPose;
    const yaw=new THREE.Euler().setFromQuaternion(this.api.camera.quaternion,'YXZ').y;
    if(id==='carousel'){const p=this.anchor.parent.getWorldPosition(new THREE.Vector3()),dir=new THREE.Vector2(p.x-3,p.z-7).normalize();return {...createWalker(p.x+dir.x*.88,p.z+dir.y*.88),y:1.05,yaw,pitch:0};}
    const b=this.api.expansion.bumperCars[this.bumperIndex].body;
    for(const [side,forward] of [[1.25,0],[-1.25,0],[0,-1.5],[0,1.5]]){const x=b.x+Math.cos(b.angle)*side+Math.sin(b.angle)*forward,z=b.z-Math.sin(b.angle)*side+Math.cos(b.angle)*forward,w=createWalker(x,z);w.y=.72;resolveWalker(w,[...this.colliders,...this.vehicleColliders()]);if(Math.hypot(w.x-x,w.z-z)<.12&&x>8.9&&x<27.1&&z>3.35&&z<18.65)return {...w,yaw,pitch:0};}
    // A crowded side is resolved against every car, rather than resetting vehicles.
    const w=createWalker(b.x+Math.cos(b.angle)*1.25,b.z-Math.sin(b.angle)*1.25);w.y=.72;resolveWalker(w,[...this.colliders,...this.vehicleColliders()]);return {...w,yaw,pitch:0};
  }
  returnToWalk(){
    this.restoreQueue();if(this.session){const id=this.session.id;this.seatedNpcs[id]?.forEach(g=>g.visible=false);this.api.expansion.gates.filter(g=>g.rideId===id&&g.lane==='vip').forEach(g=>g.open=true);}
    if(this.session?.id==='bumper')this.api.expansion.bumperEntryGate.open=true;
    this.session=null;this.mode='walking';this.anchor=null;this.playerBody.visible=false;Object.assign(this.walker,this.returnPose,{vx:0,vz:0,vy:0,y:this.returnPose.y});this.yaw=this.returnPose.yaw;this.pitch=this.returnPose.pitch;this.walkEye=this.returnPose.y+PLAYER.eye;this.toast('欢迎继续探索乐园。');
  }
  updateRide(dt){
    const s=this.session,a=this.api,e=a.expansion;
    if(!s)return;
    const slope=s.id==='coaster'?e.trackFrame((this.stationDistance+s.travelled)/e.trackLength).forward.y:0;
    const steps=Math.max(1,Math.ceil(dt*120));for(let i=0;i<steps;i++)s.update(dt/steps,{slope});
    if(s.phase==='boarding'||s.phase==='ready')this.updateBoarding(dt);
    if(s.phase==='ready'){e.gates.filter(g=>g.rideId===s.id).forEach(g=>g.open=false);if(s.id==='bumper')e.bumperEntryGate.open=false;}
    if(s.id==='coaster')e.setCoasterDistance(this.stationDistance+s.travelled);
    if(s.id==='ship')a.ship.rotation.z=s.angle;
    if(s.id==='carousel'){a.carousel.rotation.y=s.angle;a.horseBobs.forEach(o=>o.h.position.y=1.45+Math.sin(s.elapsed*1.4+o.phase)*.17*smooth(s.elapsed/3)*(1-smooth((s.elapsed-56)/6)));}
    if(s.id==='bumper'){
      const body=e.bumperCars[this.bumperIndex].body,driving=s.phase==='running';body.input={throttle:driving?Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS')):0,steer:driving?Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA')):0,brake:!driving||this.keys.has('Space')};
      if(s.phase==='braking'||s.phase==='complete')e.bumperCars.forEach(c=>{c.body.controller='player';c.body.input={throttle:0,steer:0,brake:true};});
      if(['running','braking'].includes(s.phase))e.bumperWorld.update(dt);
      if(s.phase==='complete')e.bumperCars.forEach(c=>{c.body.vx=0;c.body.vz=0;c.body.omega=0;});e.update(0,{coaster:false,bumper:false});
    }
  }
  updateCabin(dt){
    const a=this.api;
    for(const c of a.cabins){const near=Math.abs(wrap(c.a+this.wheelAngle+Math.PI/2))<.16,occupied=this.cabin===c;
      const open=near&&(!occupied||this.session?.phase==='complete'||this.session?.elapsed<1.0);c.doorAmount=THREE.MathUtils.damp(c.doorAmount,open?1:0,7,dt);c.door.position.x=c.doorAmount*1.08;
    }
    if(this.mode==='walking'&&!this.motion){
      const gate=a.expansion.gates.find(g=>g.rideId==='wheel'&&g.lane==='vip');
      if(gate.open){for(const c of a.cabins){if(c.doorAmount<.8)continue;const p=c.g.getWorldPosition(new THREE.Vector3());
        if(Math.abs(this.walker.x-p.x)<.29&&this.walker.z<p.z+1.03&&this.walker.z>p.z+.55&&this.walker.y>.4){
          this.returnPose={...this.walker,yaw:this.yaw,pitch:this.pitch};this.session=new RideSession('wheel');this.session.board();this.session.wheelArrived();this.cabin=c;this.cabinLocal={x:this.walker.x-p.x,z:this.walker.z-p.z};this.cabinSeated=false;this.cabinEye=this.cabinEyeTarget=PLAYER.eye;this.mode='cabin';this.anchor=a.group(0,0,0,c.g);this.playerBody.visible=false;this.toast('已走入座舱。WASD 舱内移动，F 坐下或起身，P 烟花。');break;
        }
      }}
    }
    if(this.mode!=='cabin'||!this.cabin)return;
    const c=this.cabin,loc=this.cabinLocal;
    if(this.cabinSeatMotion){const m=this.cabinSeatMotion;m.elapsed+=dt;const t=clamp(m.elapsed/1.65,0,1),turn=smooth(t/.38),back=smooth((t-.38)/.32),lower=smooth((t-.7)/.3);this.yaw=m.fromYaw+wrap(m.toYaw-m.fromYaw)*turn;loc.x=THREE.MathUtils.lerp(m.fromX,m.toX,back);loc.z=THREE.MathUtils.lerp(m.fromZ,m.toZ,back);this.cabinEye=THREE.MathUtils.lerp(m.fromEye,this.cabinEyeTarget,m.sitting?lower:smooth(t/.4));if(t>=1)this.cabinSeatMotion=null;}
    if(!this.cabinSeated&&!this.cabinSeatMotion){const f=Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS')),side=Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA')),n=Math.max(1,Math.hypot(f,side));loc.x+=(-Math.sin(this.yaw)*f+Math.cos(this.yaw)*side)/n*dt*.85;loc.z+=(-Math.cos(this.yaw)*f-Math.sin(this.yaw)*side)/n*dt*.85;
      loc.x=clamp(loc.x,-.34,.34);loc.z=clamp(loc.z,-.64,c.doorAmount>.8&&this.session.phase==='complete'?1.12:.66);
      if(loc.z>1.02&&c.doorAmount>.8&&this.session.phase==='complete'){
        const p=c.g.localToWorld(new THREE.Vector3(loc.x,-1.92,loc.z));this.walker=createWalker(p.x,p.z);this.walker.y=.45;this.mode='walking';this.anchor.removeFromParent();this.anchor=null;this.cabin=null;this.session=null;this.playerBody.visible=false;this.toast('已走出座舱，欢迎继续探索。');return;
      }
    }
    if(!this.cabinSeatMotion)this.cabinEye=THREE.MathUtils.damp(this.cabinEye,this.cabinEyeTarget,5,dt);this.anchor.position.set(loc.x,-1.92+this.cabinEye,loc.z);this.anchor.rotation.set(0,0,0);this.playerBody.visible=this.cabinSeated&&!this.cabinSeatMotion;
    if(this.cabinSeated){this.anchor.add(this.playerBody);this.playerBody.position.set(0,0,0);this.playerBody.position.y=-1.15;this.playerBody.rotation.set(0,this.yaw+Math.PI,0);this.playerBody.scale.setScalar(1);this.posePlayer(1);}
  }
  updateHUD(){
    const s=this.session,action=this.nearestInteraction();this.interactButton.hidden=!action;this.interactButton.textContent=action?.label||'';
    this.ui.querySelector('#fp-start').hidden=s?.phase!=='ready';this.status.hidden=!s;
    this.ui.querySelector('#fp-mode').textContent=s?`园主 VIP · ${names[s.id]}`:this.mode==='bench'?'休息片刻 · P 可放烟花':'园主 VIP · 自由探索';
    if(s){const labels={waiting:'等候空座舱到站',boarding:`同伴正在登乘 · ${s.boarded}/${s.npcCount}`,ready:'全部就绪 · 按 Enter 启动',running:s.id==='coaster'?'穿行星光，跑完全程后回站':s.id==='wheel'?'WASD 舱内走动 · F 坐下 / 起身':`正在游玩 · ${Math.max(0,Math.ceil(60-s.elapsed))} 秒`,braking:'正在平顺减速，请稍候',complete:s.id==='wheel'?'到站时舱门自动打开 · 起身走向舱门':'已停稳 · 按 F 下车'};
      this.status.querySelector('strong').textContent=names[s.id];this.status.querySelector('span').textContent=labels[s.phase]||'';const progress=s.id==='coaster'?s.travelled/s.length:s.id==='wheel'?s.turn/(Math.PI*2):s.elapsed/60;this.status.querySelector('i').style.width=`${clamp(progress,0,1)*100}%`;
    }
    this.hint.textContent=s?.id==='bumper'&&s.phase==='running'?'W/S 前进倒车 · A/D 方向盘 · 空格 刹车 · P 烟花':this.mode==='walking'?'WASD 走动 · Shift 跑 · 空格 跳 · F 交互 · P 烟花':this.mode==='cabin'?'WASD 舱内走动 · F 坐下 / 起身 · P 烟花':'鼠标环顾 · P 随时放烟花 · Esc 释放鼠标';
    const compass=this.ui.querySelector('#fp-compass');compass.hidden=!this.guide||this.mode!=='walking';this.marker.visible=!compass.hidden;
    if(this.marker.visible){const entry=this.api.expansion.entries.find(e=>e.id===this.guide),p=this.api.expansion.gates.find(g=>g.rideId===entry.id&&g.lane==='vip').open?entry.boarding:entry.vip.route[0],dx=p[0]-this.walker.x,dz=p[2]-this.walker.z;this.marker.position.set(p[0],.36+Math.sin(this.clock*2)*.04,p[2]);const angle=wrap(Math.atan2(-dx,-dz)-this.yaw);compass.textContent=`${angle>.5?'←':angle<-.5?'→':'↑'} ${names[this.guide]} · ${Math.hypot(dx,dz).toFixed(0)} 米`;}
  }
  vehicleColliders(){const cabinWalls=this.api.cabins.flatMap(c=>{const p=c.g.getWorldPosition(new THREE.Vector3()),h={minY:p.y-2.08,maxY:p.y-.01};return [{kind:'box',x:p.x-1,z:p.z,w:.1,d:1.95,...h},{kind:'box',x:p.x+1,z:p.z,w:.1,d:1.95,...h},{kind:'box',x:p.x,z:p.z-.94,w:2,d:.1,...h},...[-.8,.8].map(x=>({kind:'box',x:p.x+x,z:p.z+.94,w:.4,d:.1,...h})),{kind:'box',x:p.x,z:p.z+.94,w:1.12,d:.1,...h,disabled:c.doorAmount>.8}];});return [...cabinWalls,{kind:'box',x:7,z:-12,w:6.9,d:2.3,minY:1.3,maxY:3.5},{kind:'circle',x:3,z:7,r:.9,minY:.28,maxY:5.9},...this.api.horseBobs.map(o=>{const p=o.h.getWorldPosition(new THREE.Vector3());return {kind:'circle',x:p.x,z:p.z,r:.61,minY:p.y-.66,maxY:p.y+1.2};}),...this.api.expansion.bumperCars.map(c=>({kind:'box',x:c.g.position.x,z:c.g.position.z,w:1.45,d:1.9,angle:c.body.angle,minY:.7,maxY:1.7})),...this.api.expansion.coasterCars.map(c=>({kind:'circle',x:c.position.x,z:c.position.z,r:.64,minY:c.position.y,maxY:c.position.y+.8}))];}
  update(dt){
    if(!this.active)return;dt=Math.min(dt,.05);this.clock+=dt;
    if(this.fadeTime>0){this.fadeTime=Math.max(0,this.fadeTime-dt);this.ui.querySelector('#fp-fade').style.opacity=String(Math.sin((1-this.fadeTime/.6)*Math.PI));if(this.fadeTime<.3&&!this.fadeDone){this.fadeDone=true;this.pendingFade?.();this.pendingFade=null;}}
    if(this.clock>this.toastUntil)this.ui.querySelector('#fp-toast').classList.remove('show');
    if(this.keys.has('ArrowLeft'))this.yaw+=dt*1.4;if(this.keys.has('ArrowRight'))this.yaw-=dt*1.4;if(this.keys.has('ArrowUp'))this.pitch=clamp(this.pitch+dt,-1.35,1.25);if(this.keys.has('ArrowDown'))this.pitch=clamp(this.pitch-dt,-1.35,1.25);
    if(this.mode==='walking'&&!this.motion){
      this.dynamicVisitors=this.api.walkers.filter(w=>!w.managed).map(w=>({kind:'circle',x:w.g.position.x,z:w.g.position.z,r:.25,minY:.28,maxY:1.86}));
      updateWalker(this.walker,{forward:Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS')),side:Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA')),run:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'),yaw:this.yaw,jump:this.jumpQueued},dt,[...this.colliders.filter(c=>Math.abs(c.x-this.walker.x)<(c.w||c.r*2||0)/2+1.3&&Math.abs(c.z-this.walker.z)<(c.d||c.r*2||0)/2+1.3),...this.dynamicVisitors,...this.vehicleColliders()],this.surfaces);
    }
    this.jumpQueued=false;this.updateCompanionExits(dt);this.updateRide(dt);this.api.scene.updateMatrixWorld(true);this.updateCabin(dt);
    if(this.session?.id==='bumper'){const b=this.api.expansion.bumperCars[this.bumperIndex].body;this.anchors.bumper.rotation.set(b.lean*.35,Math.PI,b.sway*.3,'YXZ');this.anchors.bumper.position.z=-.18+b.lean*.12;}
    this.api.scene.updateMatrixWorld(true);
    const camera=this.api.camera;
    if(this.motion){
      const m=this.motion;m.elapsed+=dt;let remaining=m.elapsed,index=0;
      while(index<m.times.length-1&&remaining>=m.times[index])remaining-=m.times[index++];
      const raw=clamp(remaining/m.times[index],0,1),t=smooth(raw),a=m.frames[index],b=m.frames[index+1],sit=THREE.MathUtils.lerp(a.sit,b.sit,t);
      camera.position.copy(a.p).lerp(b.p,t);camera.quaternion.copy(a.q).slerp(b.q,t);
      const step=b.step?Math.sin(raw*Math.PI)*.55:0;
      this.posePlayer(sit,step,0);this.playerBody.position.copy(camera.position);this.playerBody.position.y-=PLAYER.eye-(PLAYER.eye-1.15)*sit;
      const bodyYaw=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ').y;this.playerBody.rotation.set(0,bodyYaw+Math.PI,0);
      if(m.elapsed>=m.duration){this.motion=null;m.onDone();}
    }
    else if(this.anchor){const q=this.anchor.getWorldQuaternion(new THREE.Quaternion()),look=new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch,this.yaw,0,'YXZ'));camera.position.copy(this.anchor.getWorldPosition(new THREE.Vector3()));camera.quaternion.copy(q).multiply(look);}
    else{const moving=Math.hypot(this.walker.vx,this.walker.vz)>.1&&this.walker.grounded;const targetY=this.walker.y+PLAYER.eye;this.walkEye=this.walkEye??targetY;this.walkEye=this.walker.grounded?THREE.MathUtils.damp(this.walkEye,targetY,18,dt):targetY;camera.position.set(this.walker.x,this.walkEye,this.walker.z);camera.quaternion.setFromEuler(new THREE.Euler(this.pitch,this.yaw,0,'YXZ'));}
    this.mountHands.visible=false;
    this.updateHUD();const host=this.api.host;host.dataset.keys=[...this.keys].join(',');host.dataset.camera=camera.position.toArray().map(n=>n.toFixed(3)).join(',');host.dataset.mode='first-person';host.dataset.player=`${this.walker.x.toFixed(3)},${this.walker.y.toFixed(3)},${this.walker.z.toFixed(3)}`;host.dataset.ride=this.session?.id||'';host.dataset.ridePhase=this.session?.phase||this.mode;host.dataset.rideElapsed=(this.session?.elapsed||0).toFixed(2);host.dataset.boarded=String(this.session?.boarded||0);host.dataset.boarding=JSON.stringify(this.queueMovers.map(m=>({phase:m.phase,seat:m.index,path:m.path?.length||0,position:m.actor.g.getWorldPosition(new THREE.Vector3()).toArray()})));
  }
}
