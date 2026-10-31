import {buildBoardingPlatforms} from './boarding-platforms.js';
import {canRoamAt,canRoamBetween} from './ambient-walking.js';
import {createHuman,COMPANION_PALETTES,turnToWalk} from './human.js';
import {createLandscaping} from './landscaping.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
import {FireworkShow} from './fireworks.js';
import {buildExpansion} from './expansion.js';
import {createShipMotion} from './ride-motion.js';
import {FirstPersonPark} from './first-person.js';
import {collectStaticColliders} from './first-person-physics.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

const host=document.getElementById('world');
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch(e){document.getElementById('error').hidden=false;document.getElementById('loader').remove();throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setSize(innerWidth,innerHeight);renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
host.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x111a2b);
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.1,400);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;
controls.minDistance=7;controls.maxDistance=230;controls.maxPolarAngle=Math.PI*.485;controls.minPolarAngle=.18;controls.target.set(0,5,-1);controls.autoRotateSpeed=.35;
controls.screenSpacePanning=false;controls.maxTargetRadius=32;
const home=new THREE.Vector3(76,54,85);camera.position.copy(home);
scene.add(new THREE.HemisphereLight(0xaebce0,0x69564d,.8));
const sun=new THREE.DirectionalLight(0xffc296,.62);sun.position.set(-25,50,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:1,far:120});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun);
const fill=new THREE.DirectionalLight(0x849ffc,1.05);fill.position.set(10,9,-14);scene.add(fill);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.28,.45,1.25);composer.addPass(bloom);composer.addPass(new OutputPass());
const staticRoot=new THREE.Group();scene.add(staticRoot);
const benches=[];
const palette={cream:0xf3dfb4,ivory:0xf9eed8,teal:0x386b68,darkTeal:0x214c4e,coral:0xc56d5b,red:0xa74646,gold:0xcda266,wood:0x72503d,woodLight:0xa67751,metal:0x384d50,grass:0x657b59,leaf:0x42694e,pink:0xd69b9c,paver:0xb1a498};
const materials=new Map();
function mat(c,em=0){const color=palette[c]??c;const key=`${color}/${em}`;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.73,metalness:.06,emissive:em?color:0,emissiveIntensity:em}));return materials.get(key);}
// Subtle close-range grain; shared textures keep the miniature inexpensive to render.
function surfaceTexture(kind){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),data=ctx.createImageData(256,256);let n=941;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){n=(n*1664525+1013904223)>>>0;const noise=n/4294967296;const grain=kind==='wood'?Math.sin(y*.44+Math.sin(x*.022)*2.4)*13+Math.sin(y*1.7+x*.006)*4:Math.sin(x*.91+y*.68)*3;const v=218+grain+(noise-.5)*(kind==='wood'?9:24),i=(y*256+x)*4;data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;}
  ctx.putImageData(data,0,0);const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}
const woodGrain=surfaceTexture('wood'),stoneGrain=surfaceTexture('stone');
for(const key of ['wood','woodLight']){const m=mat(key);m.map=woodGrain;m.bumpMap=woodGrain;m.bumpScale=.012;m.roughness=.86;}
for(const key of ['paver',0xb5aa9b,0xa79d92,0xbfb2a1,0xafa69c,0xb7ac9e]){const m=mat(key);m.bumpMap=stoneGrain;m.bumpScale=.005;m.roughness=.91;}
mat('metal').metalness=.48;mat('metal').roughness=.42;mat('gold').metalness=.36;mat('gold').roughness=.48;
const lightMat=mat(0xffd99b,1.0),pinkLight=mat(0xffaca2,.9),tealLight=mat(0xa7e3d7,.85);
const glassMat=new THREE.MeshStandardMaterial({color:0x93c3be,roughness:.22,metalness:.15,transparent:true,opacity:.47,emissive:0xe6af6f,emissiveIntensity:.15});
let seed=7183;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}function range(a,b){return a+(b-a)*rand();}
const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.SphereGeometry(1,10,7),icoGeo=new THREE.IcosahedronGeometry(1,1);
function mesh(geo,m,parent=staticRoot,x=0,y=0,z=0,sx=1,sy=1,sz=1,shadow=true){const o=new THREE.Mesh(geo,typeof m==='object'?m:mat(m));o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=shadow;o.receiveShadow=true;parent.add(o);return o;}
function box(w,h,d,m,p,x,y,z,shadow=true){return mesh(boxGeo,m,p,x,y,z,w,h,d,shadow);}
function ball(r,m,p,x,y,z,sx=1,sy=1,sz=1,shadow=true){return mesh(sphereGeo,m,p,x,y,z,r*sx,r*sy,r*sz,shadow);}
function cyl(rt,rb,h,m,p,x,y,z,n=24){return mesh(new THREE.CylinderGeometry(rt,rb,h,n),m,p,x,y,z);}
function rod(a,b,r,m,p=staticRoot,n=8){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),mid=av.clone().add(bv).multiplyScalar(.5);const o=cyl(r,r,av.distanceTo(bv),m,p,...mid.toArray(),n);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return o;}
function ring(r,t,m,p,x,y,z){return mesh(new THREE.TorusGeometry(r,t,6,100),m,p,x,y,z);}
function group(x=0,y=0,z=0,p=staticRoot){const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g;}
function rounded(w,d,r,h,m,p,x,y,z){const s=new THREE.Shape();s.moveTo(-w/2+r,-d/2);s.lineTo(w/2-r,-d/2);s.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);s.lineTo(w/2,d/2-r);s.quadraticCurveTo(w/2,d/2,w/2-r,d/2);s.lineTo(-w/2+r,d/2);s.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);s.lineTo(-w/2,-d/2+r);s.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);const o=mesh(new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:false,curveSegments:5}),m,p,x,y,z);o.rotation.x=-Math.PI/2;return o;}
function textSign(text,w,h,p,x,y,z,{bg='#2b5856',color='#ffedbc',size=64,border=true}={}){const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*h/w);const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);if(border){ctx.strokeStyle='#c9a873';ctx.lineWidth=7;ctx.strokeRect(13,13,c.width-26,c.height-26);}ctx.fillStyle=color;ctx.font=`500 ${size}px "Songti SC","Noto Serif SC",serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,c.height/2,960);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;const material=new THREE.MeshStandardMaterial({map:tex,roughness:.7,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:.2});return mesh(new THREE.PlaneGeometry(w,h),material,p,x,y,z,1,1,1,false);}
const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;const glowCtx=glowCanvas.getContext('2d');const grad=glowCtx.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,224,164,.65)');grad.addColorStop(.2,'rgba(255,195,117,.22)');grad.addColorStop(1,'rgba(255,166,77,0)');glowCtx.fillStyle=grad;glowCtx.fillRect(0,0,64,64);const glowTex=new THREE.CanvasTexture(glowCanvas);
function glow(p,x,y,z,s=1){const o=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.25}));o.position.set(x,y,z);o.scale.set(s,s,1);p.add(o);return o;}
function point(x,y,z,c=0xffbd79,power=15,dist=8){const l=new THREE.PointLight(c,power,dist,2);l.position.set(x,y,z);scene.add(l);}
function bulb(p,x,y,z,r=.055,m=lightMat){ball(r,m,p,x,y,z,1,1,1,false);}

// A collectible island, built in layers with a warm limestone promenade.
rounded(76,70,.8,1.05,0x283b3e,staticRoot,0,-1.1,0);
rounded(76.05,70.05,.8,.1,'gold',staticRoot,0,-.16,0);
rounded(76,70,.8,.18,0x6a7a67,staticRoot,0,-.06,0);
rounded(75.2,69.2,.55,.09,'paver',staticRoot,0,.13,0);
const tileMats=[0xb5aa9b,0xa79d92,0xbfb2a1,0xafa69c,0xb7ac9e].map(c=>mat(c));
for(let i=0;i<96;i++)for(let j=0;j<88;j++){const x=(i-47.5)*.78,z=(j-43.5)*.78;box(.756,.025,.756,tileMats[Math.floor(rand()*5)],staticRoot,x,.235,z,false);}
// West promenade preserves a comfortable route around the enlarged carousel.
for(const x of [-4.7,-1.7])box(.09,.035,18.5,'cream',staticRoot,x,.285,11.7,false);
// Thin inlaid borders and the entrance axis.
for(const x of [-1.65,1.65])box(.11,.04,11,'cream',staticRoot,x,.267,5.5,false);
for(const z of [7.6,9.4])box(21,.04,.09,'cream',staticRoot,0,.267,z,false);
for(let z=2;z<11;z+=.55)box(.09,.035,.2,'gold',staticRoot,0,.267,z,false);
const floorShadow=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.ShadowMaterial({opacity:.28}));floorShadow.rotation.x=-Math.PI/2;floorShadow.position.y=-1.15;floorShadow.receiveShadow=true;scene.add(floorShadow);
// Base plaque, directly on the model rather than a screen overlay.
textSign('星 野 游 乐 园',5.1,.58,staticRoot,0,-.63,35.009,{size:75,bg:'#263d3f'});
for(const x of [-2.8,2.8])bulb(staticRoot,x,-.6,35.02,.05);

function fence(x1,z1,x2,z2,{height=.85,cream=false}={}){const len=Math.hypot(x2-x1,z2-z1),n=Math.ceil(len/.75),m=cream?'cream':'teal';for(let i=0;i<=n;i++){let t=i/n,x=x1+(x2-x1)*t,z=z1+(z2-z1)*t;box(.09,height,.09,m,staticRoot,x,.28+height/2,z);ball(.075,'gold',staticRoot,x,.32+height,z);}for(const y of [.47,.91])rod([x1,y,z1],[x2,y,z2],.035,m);}
fence(-37.4,-34.4,37.4,-34.4);fence(-37.4,-34.4,-37.4,34.4);fence(37.4,-34.4,37.4,34.4);fence(-37.4,34.4,-4.1,34.4);fence(4.1,34.4,37.4,34.4);

const landscaping=createLandscaping({root:staticRoot,rounded,mesh,ball,mat});
const {garden,lawn}=landscaping;
function tree(x,z,r=1,color='leaf',height=3.5){
 const g=group(x,landscaping.heightAt(x,z)+height*.01,z);g.userData.tree=true;cyl(.09,.2,height*.7,'wood',g,0,height*.34,0,12);
 for(let k=0;k<6;k++){const a=k*2.399,h=height*(.45+k*.045),tip=[Math.cos(a)*r*.68,h+height*.19,Math.sin(a)*r*.68];rod([0,h,0],tip,.045,'wood',g,9);rod(tip,[tip[0]*1.2,tip[1]+.25,tip[2]*1.2],.018,'woodLight',g,6);}
 const base=new THREE.Color(palette[color]??color),foliage=Array.from({length:4},(_,i)=>mat(base.clone().multiplyScalar(.82+i*.08).getHex()));
 for(let i=0;i<48;i++){const a=i*2.399,rr=r*Math.sqrt((i+.5)/48)*.86,y=height*.72+Math.sin(i*1.7)*height*.09+Math.sqrt(Math.max(0,1-(rr/r)**2))*.35;const o=mesh(new THREE.IcosahedronGeometry(1,2),foliage[i%4],g,Math.cos(a)*rr,y,Math.sin(a)*rr,r*.33,r*.28,r*.32);o.rotation.set(i*.31,i*.7,0);o.userData.noWalkingCollision=true;}
 return g;
}
function shrub(x,z,r=.4,color='leaf'){
 const g=group(x,landscaping.heightAt(x,z),z);g.rotation.y=rand()*6;
 for(let i=0;i<5;i++){const a=i*2.399,rr=i?r*.45:0;const o=mesh(sphereGeo,mat(color),g,Math.cos(a)*rr,r*(i?.45:.7),Math.sin(a)*rr,r*.58,r*(i?.46:.56),r*.58);o.userData.noWalkingCollision=true;}
}
function flowers(x,z,count=12,r=.8){for(let i=0;i<count;i++){
 const a=rand()*Math.PI*2,d=Math.sqrt(rand())*r,xx=x+Math.cos(a)*d,zz=z+Math.sin(a)*d,y=landscaping.heightAt(xx,zz),h=.17+rand()*.18;
 landscaping.soft(rod([xx,y,zz],[xx+.02,y+h,zz],.007,'leaf'));
 for(const side of [-1,1]){const leaf=landscaping.soft(ball(.035,'leaf',staticRoot,xx+side*.035,y+h*.45,zz,1.8,.22,.6,false));leaf.rotation.z=side*.4;}
 for(let k=0;k<5;k++){const angle=k*Math.PI*2/5;const petal=landscaping.soft(ball(.031,i%3?'ivory':'coral',staticRoot,xx+.02+Math.cos(angle)*.033,y+h,zz+Math.sin(angle)*.033,1,.3,.7,false));petal.rotation.y=-angle;}
 landscaping.soft(ball(.018,'gold',staticRoot,xx+.02,y+h+.009,zz,1,.45,1,false));
}}
garden(-19,-7,4,7);garden(9.8,-7,2.5,7);garden(-9.3,10.8,3.1,3.1);garden(28.6,10,1.1,6.8);garden(-7.3,9.7,5.6,1.25);
tree(-19.5,-8.5,1.1,'pink',4.1);tree(-21,-5,1.2,'leaf',4.5);tree(-9.4,10.8,1.05,'pink',3.5);tree(26,-10.5,1.1,'leaf',4.1);tree(28.5,-1.5,1.1,'pink',3.7);tree(28.6,10,.5,'leaf',3.5);
for(let i=0;i<25;i++){shrub(-20.5+rand()*3,-10+rand()*7,.25+rand()*.25,i%3?'leaf':'grass');}
for(let z=-8;z<-4;z+=.65){shrub(13,z,.33);flowers(13,z,5,.6);}
for(let x=-10;x<-4.8;x+=.45){shrub(x,9.7,.29);flowers(x,9.7,3,.2);}
for(const [x,z] of [[-9,10.8],[28.5,-1.5],[28.6,10],[-19,-5]])flowers(x,z,18,1.1);

function bench(x,z,rot=0){const g=group(x,.28,z);benches.push({g,x,z,rotation:rot});g.rotation.y=rot;for(let i=0;i<4;i++){box(1.7,.08,.12,'woodLight',g,0,.48,-.23+i*.15);box(1.7,.12,.07,'woodLight',g,0,.77+i*.13,-.35);}for(const xx of [-.65,.65]){box(.09,.54,.62,'metal',g,xx,.26,0);box(.08,.8,.07,'metal',g,xx,.83,-.37);rod([xx,.65,-.32],[xx,.65,.3],.04,'metal',g);}}
bench(-5.3,10.4,Math.PI/2);bench(-13.7,4.8,Math.PI/2);bench(6.6,13.4,-Math.PI/2);
function lamp(x,z,h=3.2){const g=group(x,.28,z);cyl(.17,.26,.2,'metal',g,0,.1,0,10);cyl(.055,.095,h,'metal',g,0,h/2,0,10);cyl(.22,.3,.12,'gold',g,0,h-.22,0,8);cyl(.17,.22,.45,lightMat,g,0,h+.05,0,8);cyl(.34,.12,.22,'metal',g,0,h+.38,0,8);ball(.07,'gold',g,0,h+.53,0);for(const xx of [-.18,.18])for(const zz of [-.18,.18])rod([xx,h-.17,zz],[xx*.7,h+.27,zz*.7],.022,'metal',g);glow(g,0,h+.02,0,2.5);}
for(const [x,z] of [[-2.2,9.3],[-2,12],[-8,6.8],[7,15],[-2.1,-.7],[1.5,-9.7],[-10.6,-1.5],[10,-1.2]])lamp(x,z);
point(-2.2,3.4,8,0xffbf7a,25,9);point(-7,3.6,7.5,0xffbb76,12,8);point(7,5,-9,0xffb976,9,8);point(3,3.3,7,0xffc985,16,9);point(-9,6,-4,0xf9b997,8,10);

// Ferris wheel: two latticed rims, 12 independently levelled gondolas.
const wheelOrigin=new THREE.Vector3(-9,9.6,-7.5);
const wheelBase=group(-9,.28,-7.5);rounded(6.8,4.4,.4,.24,'teal',wheelBase,0,0,0);rounded(6.5,4.1,.3,.12,'cream',wheelBase,0,.24,0);
for(const z of [-1.1,1.1]){for(const x of [-2.5,2.5]){rod([x,.36,z],[0,9.32,z*.25],.15,'cream',wheelBase);box(.7,.18,.6,'teal',wheelBase,x,.45,z);for(const dx of [-.2,.2])bulb(wheelBase,x+dx,.55,z,.035,mat('gold'));}rod([-2.1,1.3,z],[2.1,1.3,z],.075,'teal',wheelBase);rod([-1.6,2.7,z],[1.6,2.7,z],.075,'teal',wheelBase);}
rod([-9,9.6,-8.95],[-9,9.6,-6.2],.24,'gold');
const wheel=group(...wheelOrigin.toArray(),scene);
for(const z of [-.37,.37]){ring(7.2,.105,'cream',wheel,0,0,z);ring(6.86,.045,'teal',wheel,0,0,z);ring(.62,.08,'gold',wheel,0,0,z);for(let i=0;i<24;i++){const a=i*Math.PI/12;rod([Math.cos(a)*.45,Math.sin(a)*.45,z],[Math.cos(a)*7.18,Math.sin(a)*7.18,z],i%2?.035:.06,i%2?'teal':'cream',wheel);if(i%2===0)rod([Math.cos(a)*7.2,Math.sin(a)*7.2,-.37],[Math.cos(a)*7.2,Math.sin(a)*7.2,.37],.04,'gold',wheel);}
for(let i=0;i<100;i++){const a=i*Math.PI*2/100;bulb(wheel,Math.cos(a)*7.22,Math.sin(a)*7.22,z+.04,.047,i%5===0?pinkLight:lightMat);}}
const hub=cyl(.42,.42,1.05,'teal',wheel,0,0,0,24);hub.rotation.x=Math.PI/2;ball(.25,lightMat,wheel,0,0,.58,1,1,.3,false);
const cabins=[];
const cabinGlass=new THREE.MeshStandardMaterial({color:0xa8d7d4,roughness:.13,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide});
for(let i=0;i<12;i++){
  const a=i*Math.PI/6,pivot=group(Math.cos(a)*7.2,Math.sin(a)*7.2,2.8,wheel),g=group(0,0,0,pivot),color=['teal','coral',0xc59855][i%3];
  rod([Math.cos(a)*7.2,Math.sin(a)*7.2,.37],[Math.cos(a)*7.2,Math.sin(a)*7.2,2.8],.06,'metal',wheel);
  const cabinBody=group(0,-.3,0,g);
  rounded(2.08,1.94,.18,.13,color,cabinBody,0,-1.78,0);rounded(1.98,1.84,.15,.08,'woodLight',cabinBody,0,-1.7,0);
  rounded(2.18,2.04,.22,.13,color,cabinBody,0,.12,0);rounded(2.22,2.08,.22,.04,'gold',cabinBody,0,.25,0);
  for(const x of [-1,1]){box(.08,.56,1.84,color,cabinBody,x,-1.37,0);box(.025,1.12,1.82,cabinGlass,cabinBody,x,-.52,0);box(.37,.12,1.55,'coral',cabinBody,x*.79,-1.18,0);box(.07,.37,1.55,'cream',cabinBody,x*.94,-.97,0);}
  box(1.94,.54,.07,color,cabinBody,0,-1.37,-.94);box(1.92,1.12,.025,cabinGlass,cabinBody,0,-.52,-.94);rod([-.94,-1.06,-.9],[.94,-1.06,-.9],.028,'gold',g);
  for(const x of [-.8,.8]){box(.4,.54,.06,color,cabinBody,x,-1.37,.94);box(.4,1.12,.025,cabinGlass,cabinBody,x,-.52,.94);}
  for(const x of [-1,1])for(const z of [-.94,.94])box(.055,1.84,.055,'cream',cabinBody,x,-.75,z);
  const door=group(0,0,.955,cabinBody);box(1.12,.54,.07,color,door,0,-1.37,0);box(1.1,1.12,.025,cabinGlass,door,0,-.52,0);for(const x of [-.56,.56])box(.04,1.75,.04,'cream',door,x,-.78,0);rod([.38,-1.02,.055],[.38,-.76,.055],.022,'gold',door);
  textSign('星光座舱 · 可自由站立',1.1,.15,cabinBody,0,-1.37,-.9,{size:96,bg:'#355b59'});bulb(g,0,.06,0,.055);
  cabins.push({pivot,g,cabinBody,a,door,doorAmount:0});
}

fence(-17.4,-3.35,-10.6,-3.35);fence(-7.4,-3.35,-.6,-3.35);

// Carousel: striped tent, scalloped valance, individual carved horses.
const carouselPos=new THREE.Vector3(3,.28,7);
const carouselBase=group(...carouselPos.toArray());carouselBase.scale.setScalar(1.45);
cyl(3.25,3.38,.22,'teal',carouselBase,0,.11,0,64);cyl(3.1,3.25,.18,'gold',carouselBase,0,.31,0,64);cyl(3.04,3.08,.13,'woodLight',carouselBase,0,.46,0,64);
for(let i=0;i<64;i++){const a=i*Math.PI/32;bulb(carouselBase,3.23*Math.cos(a),.23,3.23*Math.sin(a),.048);}
const carousel=group(...carouselPos.toArray(),scene);carousel.scale.setScalar(1.45);cyl(.57,.65,3.8,'teal',carousel,0,2.32,0,16);
for(let i=0;i<8;i++){const a=i*Math.PI/4;const trim=box(.3,2.5,.025,'gold',carousel,Math.cos(a)*.59,2.23,Math.sin(a)*.59);trim.rotation.y=Math.PI/2-a;}
cyl(.76,.76,.18,'gold',carousel,0,.7,0,24);cyl(.76,.76,.18,'gold',carousel,0,3.7,0,24);
const horseBobs=[];
// Support poles pass through the neck in front of the saddle, clear of riders.
function horse(p,x,z,a,i){const assembly=group(x,0,z,p);assembly.rotation.y=-a;const pole=rod([.43,.6,0],[.43,4.15,0],.045,'gold',assembly);const h=group(0,1.45,0,assembly);const bodyColor=i%2?'ivory':0xe5bf91;ball(.43,bodyColor,h,0,.08,0,1.2,.65,.48);ball(.25,bodyColor,h,.35,.42,0,.65,1.5,.7);ball(.25,bodyColor,h,.46,.65,0,1.05,.65,.68);ball(.15,bodyColor,h,.63,.57,0,1.1,.65,.8);for(const z1 of [-.12,.12]){const ear=mesh(new THREE.ConeGeometry(.065,.23,5),mat(bodyColor),h,.42,.86,z1);ear.rotation.z=.2;ball(.026,'metal',h,.54,.69,z1*1.4);rod([-.25,-.04,z1],[-.38,-.42,z1],.07,bodyColor,h);rod([-.38,-.42,z1],[-.16,-.56,z1],.055,bodyColor,h);rod([.27,-.03,z1],[.43,-.27,z1],.07,bodyColor,h);rod([.43,-.27,z1],[.58,-.3,z1],.055,bodyColor,h);ball(.075,'gold',h,-.16,-.56,z1);ball(.075,'gold',h,.58,-.3,z1);}ball(.3,i%2?'coral':'teal',h,-.02,.27,0,1,.28,.8);rod([-.47,.19,0],[-.65,-.2,0],.08,'wood',h);for(let j=0;j<4;j++)ball(.11,'woodLight',h,.24,.31+j*.12,0,.6,1,1);for(const side of [-1,1]){rod([-.05,.3,side*.22],[-.05,-.12,side*.34],.018,'wood',h);const stirrup=ring(.085,.017,'gold',h,-.05,-.18,side*.34);stirrup.rotation.y=Math.PI/2;}horseBobs.push({h,pole,phase:i*Math.PI/3});}
for(let i=0;i<8;i++){const a=i*Math.PI/4;horse(carousel,Math.cos(a)*2.12,Math.sin(a)*2.12,a+Math.PI/2,i);}
const canopy=group(0,0,0,carouselBase);
for(let i=0;i<16;i++){const a=i*Math.PI/8;const geo=new THREE.ConeGeometry(3.3,1.55,4,1,false,a,Math.PI/8);mesh(geo,i%2?'ivory':'coral',canopy,0,4.87,0);}
cyl(3.33,3.33,.27,'teal',canopy,0,4.08,0,64);const cr=ring(3.32,.055,'gold',canopy,0,4.24,0);cr.rotation.x=Math.PI/2;
for(let i=0;i<32;i++){const a=i*Math.PI/16;ball(.17,i%2?'cream':'coral',canopy,3.28*Math.cos(a),3.92,3.28*Math.sin(a),1,.7,1);bulb(canopy,3.32*Math.cos(a),4.1,3.32*Math.sin(a),.055);}
cyl(.15,.3,.28,'gold',canopy,0,5.77,0,12);ball(.18,lightMat,canopy,0,5.98,0);rod([0,5.95,0],[0,6.68,0],.035,'gold',canopy);
function flag(p,x,y,z,color='coral',w=.65){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,w,-.16,0,0,-.38,0],3));geo.computeVertexNormals();const m=mat(color).clone();m.side=THREE.DoubleSide;mesh(geo,m,p,x,y,z);}
flag(canopy,0,6.65,0);
for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([0,5.6,0],[Math.cos(a)*3.25,4.26,Math.sin(a)*3.25],.025,'gold',canopy);for(let j=1;j<7;j++){const r=j*.46;bulb(canopy,Math.cos(a)*r,5.6-r*.41,Math.sin(a)*r,.035);}}


// Pirate ship: a curved wooden hull suspended on a real pivot.
const shipX=7,shipZ=-12,shipY=7.365;
const shipBase=group(shipX,.28,shipZ);shipBase.scale.setScalar(1.3);rounded(6.6,4.7,.35,.22,'teal',shipBase,0,0,0);rounded(6.35,4.45,.3,.1,'cream',shipBase,0,.22,0);
for(const z of [-1.65,1.65]){for(const x of [-2.6,2.6]){rod([x,.34,z],[0,5.45,z],.14,'teal',shipBase);box(.7,.16,.55,'gold',shipBase,x,.37,z);rod([x*.78,1.6,z],[0,5.45,z],.037,'gold',shipBase);}rod([-1.8,4.2,z],[1.8,4.2,z],.06,'cream',shipBase);}
rod([shipX,shipY,shipZ-2.52],[shipX,shipY,shipZ+2.52],.17,'gold');
const ship=group(shipX,shipY,shipZ,scene);ship.scale.setScalar(1.3);
const shipMotion=createShipMotion({length:5.044});
const hull=group(0,-3.88,0,ship);
const hs=new THREE.Shape();hs.moveTo(-2.6,.5);hs.quadraticCurveTo(-2.2,-.64,-1.15,-.75);hs.lineTo(1.15,-.75);hs.quadraticCurveTo(2.2,-.64,2.6,.5);hs.lineTo(1.8,.14);hs.lineTo(-1.8,.14);hs.closePath();
mesh(new THREE.ExtrudeGeometry(hs,{depth:1.6,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.06,bevelThickness:.06,curveSegments:12}),'woodLight',hull,0,0,-.8);
box(3.6,.12,1.5,'wood',hull,0,.17,0);
for(let i=-2;i<=2;i++){box(.45,.25,1.3,'coral',hull,i*.62,.35,0);box(.09,.53,1.33,'teal',hull,i*.62-.23,.55,0);rod([i*.62+.22,.67,-.65],[i*.62+.22,.67,.65],.035,'gold',hull);}
for(const z of [-.88,.88]){for(let i=-2;i<=2;i++){ball(.14,'gold',hull,i*.68,-.24,z,1,1,.2);ball(.09,'darkTeal',hull,i*.68,-.24,z*1.02,1,1,.2);}for(const [a,b] of z>0?[[-2.1,-.48],[.48,2.1]]:[[-2.1,2.1]]){rod([a,.25,z],[b,.25,z],.065,'gold',hull);rod([a,.8,z],[b,.8,z],.04,'gold',hull);}for(let i=-3;i<=3;i++){if(z>0&&i===0)continue;rod([i*.58,.3,z],[i*.58,.8,z],.03,'cream',hull);}}
for(const z of [-.65,.65])for(const x of [-1.6,1.6])rod([0,0,z],[x,-3.6,z],.055,'cream',ship);
for(const z of [-1.8,1.8])ball(.28,'coral',staticRoot,shipX,shipY,shipZ+z*1.3,1,1,.4);

fence(.8,-9.05,5.85,-9.05);fence(8.15,-9.05,13.2,-9.05);fence(.8,-9.05,.8,-14.65);fence(13.2,-9.05,13.2,-14.65);fence(.8,-14.65,13.2,-14.65);

// Grand arrival court: twin lantern towers, sculpted arch and star clock.
const entrance=group(0,.28,31.8);
rounded(18.4,4.7,.65,.055,'cream',entrance,0,0,0);
rounded(17.9,4.3,.55,.035,'teal',entrance,0,.055,0);
rounded(17.5,4,.5,.035,'paver',entrance,0,.09,0);
for(const x of [-4.9,4.9]){
  rounded(2.25,2.6,.2,.3,'teal',entrance,x,.12,0);box(1.85,5.9,2.15,'cream',entrance,x,3.35,0);
  for(const xx of [-.82,.82]){box(.15,5.5,2.24,'teal',entrance,x+xx,3.4,0);box(.055,5.2,.06,'gold',entrance,x+xx,3.5,1.15);}
  for(const y of [.7,2.2,5.6,6.2])box(2.12,.15,2.4,'gold',entrance,x,y,0);
  box(1.25,2.35,.06,'darkTeal',entrance,x,3.95,1.09);
  for(const xx of [-.36,0,.36]){box(.22,1.8,.03,mat(0xf2c17d,.32),entrance,x+xx,4,1.13);box(.035,1.95,.05,'gold',entrance,x+xx+.14,4,1.16);}
  box(1.3,.06,.09,'gold',entrance,x,3.95,1.16);
  box(2.5,.22,2.75,'teal',entrance,x,6.4,0);box(2.58,.07,2.83,'gold',entrance,x,6.54,0);
  const roof=cyl(.55,1.72,1.05,'teal',entrance,x,7.08,0,4);roof.rotation.y=Math.PI/4;
  box(1.1,.12,1.1,'gold',entrance,x,7.65,0);ball(.19,'gold',entrance,x,7.91,0);
  rod([x,7.85,0],[x,9,0],.035,'gold',entrance);flag(entrance,x,8.95,0,'coral',.65);
  textSign(x<0?'欢迎光临':'星光之旅',1.4,.55,entrance,x,1.5,1.1,{size:105});
}
const archShape=new THREE.Shape();archShape.moveTo(-4.15,3.75);archShape.quadraticCurveTo(0,6.6,4.15,3.75);archShape.lineTo(4.6,4.55);archShape.quadraticCurveTo(0,8,-4.6,4.55);archShape.closePath();
mesh(new THREE.ExtrudeGeometry(archShape,{depth:1.3,bevelEnabled:true,bevelSegments:2,bevelSize:.06,bevelThickness:.06,curveSegments:40}),'teal',entrance,0,0,-.65);
for(const z of [-.73,.75]){let prev;for(let i=0;i<=48;i++){const t=i/48,x=-4.15+8.3*t,y=3.75+5.7*t*(1-t);if(prev)rod(prev,[x,y,z],.055,'gold',entrance);prev=[x,y,z];}}
box(6.9,1.02,.23,'gold',entrance,0,5.65,.89);textSign('星 野 游 乐 园',6.65,.8,entrance,0,5.66,1.02,{size:105});
textSign('每一次相遇，都是新的奇遇',4.8,.35,entrance,0,4.96,.83,{size:56});
const clockFace=cyl(.64,.64,.16,'cream',entrance,0,7.04,.52,48);clockFace.rotation.x=Math.PI/2;
ring(.7,.085,'gold',entrance,0,7.04,.63);ring(.79,.08,'teal',entrance,0,7.04,.6);
for(let i=0;i<12;i++){const a=i*Math.PI/6;ball(.035,'gold',entrance,Math.sin(a)*.52,7.04+Math.cos(a)*.52,.63);}
rod([0,7.04,.65],[.31,7.22,.65],.027,'teal',entrance);rod([0,7.04,.66],[0,7.48,.66],.022,'teal',entrance);ball(.055,'gold',entrance,0,7.04,.67);
for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([Math.sin(a)*.2,8.18+Math.cos(a)*.2,.3],[Math.sin(a)*.52,8.18+Math.cos(a)*.52,.3],.04,'gold',entrance);}
ball(.15,lightMat,entrance,0,8.18,.3);
for(const x of [-7.1,7.1]){box(2.6,.22,2.7,'teal',entrance,x,3.45,0);box(2.72,.09,2.8,'gold',entrance,x,3.59,0);for(const xx of [-1.1,1.1])box(.14,3.4,.14,'cream',entrance,x+xx,1.8,1.1);}
for(const x of [-2.6,-1.1,1.1,2.6]){box(.26,1,.36,'teal',entrance,x,.62,0);box(.28,.08,.39,'gold',entrance,x,1.16,0);box(.12,.12,.03,mat(0x80baae,.25),entrance,x,1.04,.2);}
for(const x of [-3.7,3.7]){rod([x,3.6,.7],[x,4.15,.7],.025,'gold',entrance);cyl(.17,.17,.45,'gold',entrance,x,3.45,.7,8);ball(.14,mat(0xf3c485,.5),entrance,x,3.45,.85);}
for(let i=0;i<22;i++)bulb(entrance,-3.1+i*.295,6.21,1.03,.035);
function booth(x,z,{name='售票',color='teal',w=1.6,d=1.3,h=2.1}={}){const g=group(x,.28,z);box(w,h,d,color,g,0,h/2,0);for(const xx of [-w/2+.08,w/2-.08])box(.1,h,.1,'cream',g,xx,h/2,d/2+.04);box(w-.3,.8,.06,'darkTeal',g,0,1.3,d/2+.04);box(w-.4,.64,.07,glassMat,g,0,1.3,d/2+.08);box(.04,.75,.1,'cream',g,0,1.3,d/2+.13);box(w+.25,.12,.45,'woodLight',g,0,.86,d/2+.12);box(w+.28,.18,d+.25,'cream',g,0,h+.06,0);box(w+.45,.15,d+.45,color,g,0,h+.21,0);textSign(name,w-.16,.37,g,0,h-.22,d/2+.06,{size:110,bg:color==='coral'?'#a25247':'#2b5856'});return g;}
booth(-7.1,21.05,{name:'售票服务',w:1.7,h:2.6});
booth(7.1,21.05,{name:'游客服务',w:1.7,h:2.6});
textSign('欢迎光临',.7,.45,staticRoot,-7.1,1,21.81,{size:135,bg:'#eee1bd',color:'#426057'});
// Traditional food stalls with striped awnings, menus, lanterns and tiny goods.
function stall(x,z,name,color){const g=group(x,.28,z);box(2.5,1.65,1.55,'wood',g,0,.83,0);box(2.35,1.1,.12,'cream',g,0,.75,.81);for(let i=-5;i<=5;i++)box(.035,1.06,.05,'woodLight',g,i*.2,.75,.91);box(2.75,.13,.7,'woodLight',g,0,1.35,.76);box(2.3,.85,.06,mat(0xffd394,.3),g,0,1.96,-.72);for(const xx of [-1.2,1.2])box(.1,2.55,.1,'woodLight',g,xx,1.28,.73);box(2.8,.22,2.05,color,g,0,2.7,0);textSign(name,2.4,.48,g,0,2.45,1.06,{size:140,bg:color==='coral'?'#a35449':'#355e5b'});for(let i=0;i<10;i++){const aw=box(.285,.055,.7,i%2?'cream':color,g,-1.28+i*.285,2.34,1.05);aw.rotation.x=.28;box(.285,.21,.06,i%2?'cream':color,g,-1.28+i*.285,2.2,1.38);}for(const xx of [-1.45,1.45]){rod([xx,2.6,.6],[xx,2.6,1.05],.03,'metal',g);ball(.19,mat(0xffca8a,.65),g,xx,2.23,1.05,.8,1.3,.8);cyl(.09,.09,.06,'metal',g,xx,2.49,1.05,8);cyl(.09,.09,.06,'metal',g,xx,1.98,1.05,8);glow(g,xx,2.23,1.05,1.2);}textSign('推荐小吃',.58,.68,g,-.85,1.78,.89,{size:87,bg:'#263c37'});return g;}
const food=stall(-16,8,'章鱼烧','coral');
for(let i=0;i<3;i++){box(.45,.055,.35,'darkTeal',food,-.1+i*.56,1.45,.9);for(let j=0;j<4;j++)ball(.075,0xc5914b,food,-.24+i*.56+(j%2)*.17,1.52,.83+Math.floor(j/2)*.15);}
const sweets=stall(-16,4.5,'星光咖啡','teal');
for(let i=0;i<4;i++){cyl(.07,.055,.19,i%2?'cream':'coral',sweets,-.3+i*.3,1.5,.94,10);cyl(.078,.078,.025,'ivory',sweets,-.3+i*.3,1.61,.94,10);rod([-.3+i*.3,1.61,.94],[-.32+i*.3,1.78,.94],.009,'coral',sweets);}
// A vending machine, waste sorting bins, menu board and a bicycle.
const vending=group(-19, .28,8);box(.82,1.8,.65,'coral',vending,0,.9,0);box(.65,1.05,.05,'ivory',vending,0,1.13,.35);for(let j=0;j<3;j++)for(let i=0;i<4;i++){cyl(.042,.042,.16,i%2?'teal':'coral',vending,-.23+i*.15,.85+j*.25,.4,8);bulb(vending,-.23+i*.15,.74+j*.25,.4,.022);}box(.46,.13,.08,'metal',vending,0,.34,.35);textSign('DRINK',.67,.16,vending,0,1.64,.36,{size:120});
for(let i=0;i<2;i++){box(.42,.72,.43,i?'teal':'cream',staticRoot,-18.8+i*.5,.64,9.3);box(.46,.08,.47,'metal',staticRoot,-18.8+i*.5,1.04,9.3);box(.22,.09,.015,'metal',staticRoot,-18.8+i*.5,.89,9.53);}
const menu=group(-14.15,.28,8.8);menu.rotation.y=-.25;for(const xx of [-.36,.36]){rod([xx,0,.2],[xx,1.22,0],.045,'wood',menu);}textSign('今日推荐',.8,1.05,menu,0,.72,0,{size:95,bg:'#293f3b'});
// Information signs and tiny visitors give the model a believable scale.
const sign=group(-1.7,.28,4);cyl(.045,.065,2.1,'wood',sign,0,1.05,0,10);textSign('摩天轮 ←',1.25,.32,sign,0,1.86,.06,{size:130});textSign('木马 →',1.1,.32,sign,.12,1.43,.07,{size:150,bg:'#a35f50'});
const walkers=[];
const walkingRoutes=[
  [[-3.6,2.5],[-3.6,7.5],[-3.2,8],[-2.8,7.5],[-2.8,2.5],[-3.2,2.1]],
  [[-12.6,3.2],[-12.6,7.2],[-12.15,7.7],[-11.7,7.2],[-11.7,3.2],[-12.15,2.7]],
  [[.4,-7],[.4,-4.2],[1,-3.8],[1.6,-4.2],[1.6,-7],[1,-7.4]]
].map(points=>{const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,.28,z)),true,'centripetal');return {curve,length:curve.getLength()};});
function visitor(routeIndex,phase,color,small=false,prop='none',stationary=null,palette=null){
  const g=group(0,.28,0,scene),scale=1;g.scale.setScalar(scale);
  const human=createHuman({group,ball,box,cyl,rod,mat,batch},g,{color,variant:Math.floor(phase*19),palette}),{body,legs,arms}=human;
  const held=group(.015,-.46,.04,arms[1]);
  if(prop==='drink'){
    cyl(.085,.061,.2,'coral',held,0,.05,0,12);cyl(.09,.09,.025,'cream',held,0,.16,0,12);
    rod([.025,.17,0],[.045,.32,.01],.012,'teal',held);box(.09,.08,.008,'cream',held,0,.04,.078);
  }else if(prop==='icecream'){
    cyl(.075,.014,.21,'gold',held,0,.09,0,12);ball(.105,'cream',held,0,.245,0);ball(.085,0xe4a2ae,held,.015,.36,0);ball(.022,'coral',held,.015,.445,0);
  }else if(prop==='balloon'){
    rod([0,0,0],[.12,.95,0],.007,'cream',held);const balloon=ball(.24,small?'coral':0xe5bf75,held,.12,1.2,0,1,1.18,1);balloon.castShadow=false;
    const bow=mesh(new THREE.ConeGeometry(.04,.06,6),mat('coral'),held,.12,.925,0);bow.rotation.z=Math.PI;
  }

  const route=walkingRoutes[routeIndex],w={g,human,companion:!!palette,managed:false,body,legs,arms,held,route,distance:phase*route.length,speed:small?.36:.43,phase:phase*6.28,prop,stationary,pauseUntil:0,nextPause:8+phase*20};
  g.position.copy(route.curve.getPointAt(phase));const tangent=route.curve.getTangentAt(phase);g.rotation.y=Math.atan2(tangent.x,tangent.z);w.placed=true;walkers.push(w);return w;
}
function updateVisitors(dt,t){
  for(const w of walkers){
    if(w.managed)continue;
    if(w.waiting){w.human.pose(0);continue;}
    if(w.stationary){w.g.position.set(w.stationary[0],.28,w.stationary[1]);w.g.rotation.y=w.stationary[2];}
    let resting=!!w.stationary||t<w.pauseUntil;
    if(!resting){
      if(t>w.nextPause){w.pauseUntil=t+1.6;w.nextPause=t+18+w.phase;resting=true;}
      else{
        const next=(w.distance+dt*w.speed)%w.route.length,u=next/w.route.length,pos=w.route.curve.getPointAt(u);
        // Keep the last valid position if any future route edit crosses a ride.
        const clear=canRoamAt(pos)&&(!w.placed||canRoamBetween(w.g.position,pos));
        if(clear){const facing=turnToWalk(w.g,pos.x-w.g.position.x,pos.z-w.g.position.z,dt);if(facing>.01){w.distance=next;w.g.position.copy(pos);w.placed=true;}else resting=true;}
        else resting=true;
      }
    }
    const stride=resting?0:Math.sin(w.distance*9+w.phase)*.35;
    w.legs[0].rotation.x=stride;w.legs[1].rotation.x=-stride;w.legs[0].userData.lower.rotation.x=Math.max(0,-stride)*1.3;w.legs[1].userData.lower.rotation.x=Math.max(0,stride)*1.3;
    w.arms[0].rotation.x=-stride*.7;w.arms[1].rotation.x=w.prop==='none'?stride*.7:-.5+Math.sin(t*1.2+w.phase)*.035;
    w.body.position.y=resting?0:Math.abs(Math.sin(w.distance*9+w.phase))*.012;
    if(w.prop==='balloon')w.held.rotation.z=Math.sin(t*1.2+w.phase)*.09;
  }
}
updateVisitors(0,0);

// A small meeting-point fountain with concentric stone coping.
const fountain=group(-.5,.28,.25);
cyl(1.13,1.24,.15,'teal',fountain,0,.075,0,40);cyl(1.04,1.1,.25,'cream',fountain,0,.23,0,40);
cyl(.93,.93,.035,mat(0x538c94,.2),fountain,0,.36,0,40);
const coping=ring(1.01,.08,'gold',fountain,0,.38,0);coping.rotation.x=Math.PI/2;
cyl(.12,.2,.58,'cream',fountain,0,.55,0,16);cyl(.52,.14,.14,'teal',fountain,0,.89,0,24);
ball(.11,lightMat,fountain,0,1.05,0);glow(fountain,0,.9,0,1.1);
for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([Math.cos(a)*.43,.85,Math.sin(a)*.43],[Math.cos(a)*.5,.38,Math.sin(a)*.5],.012,mat(0xb4d9d9,.35),fountain);}
// Overhead festoon cables with a slight catenary; pennants between bulbs.
function festoon(a,b,n=15){let last=a;for(let i=1;i<=n;i++){const t=i/n,pt=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t-Math.sin(t*Math.PI)*.65,a[2]+(b[2]-a[2])*t];rod(last,pt,.013,'metal');bulb(staticRoot,...pt,.066);if(i%2===0){flag(staticRoot,pt[0],pt[1]-.08,pt[2],i%4?'teal':'coral',.26);}last=pt;}}
for(const [x,z] of [[-10.5,8.6],[-2.2,8.6],[2.2,8.6],[10.5,8.6]]){rod([x,.3,z],[x,4,z],.04,'wood');ball(.09,'gold',staticRoot,x,4.1,z);}
festoon([-10.5,4,8.6],[-2.2,4,8.6],16);festoon([2.2,4,8.6],[10.5,4,8.6],16);
// Arrival promenade and close-range planting in the larger garden court.
for(const x of [-2.5,2.5])box(.12,.035,10.2,'cream',staticRoot,x,.285,26.4,false);
for(const z of [24,28.5])for(const x of [-3.1,3.1])lamp(x,z,3.5);
garden(-10,27,10,5.2);garden(10,28,8,3.4);
for(const [x,z] of [[-13,27],[-8,27],[8,28],[12,28]]){tree(x,z,.85,x<0?'pink':'leaf',3.5);flowers(x,z,25,1.1);}
for(const [x,z] of [[-4,26],[4,27.4]])bench(x,z,x<0?Math.PI/2:-Math.PI/2);
walkingRoutes.push({curve:new THREE.CatmullRomCurve3([[-1.1,24],[-1.1,28.6],[0,29.4],[1.1,28.6],[1.1,24],[0,23.4]].map(([x,z])=>new THREE.Vector3(x,.28,z)),true,'centripetal')});walkingRoutes.at(-1).length=walkingRoutes.at(-1).curve.getLength();

// Fireflies drift softly above the planting, without distracting from the miniature.
const fireflyGeo=new THREE.BufferGeometry();const ff=[];for(let i=0;i<32;i++)ff.push(range(-11,11),range(.8,3.5),range(-10,8));fireflyGeo.setAttribute('position',new THREE.Float32BufferAttribute(ff,3));const fireflies=new THREE.Points(fireflyGeo,new THREE.PointsMaterial({color:0xffdba4,size:.06,transparent:true,opacity:.65,depthWrite:false}));scene.add(fireflies);

// Merge fixed opaque meshes by material, keeping animation pivots independent.
function batch(root){root.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(),buckets=new Map(),remove=[];root.traverse(o=>{if(!o.isMesh||o.userData.keepUnbatched||Array.isArray(o.material)||o.material.transparent)return;const k=o.material.uuid+'/'+o.castShadow;let b=buckets.get(k);if(!b)buckets.set(k,b={mat:o.material,shadow:o.castShadow,gs:[]});const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));b.gs.push(g);remove.push(o);});for(const b of buckets.values()){let count=0;for(const g of b.gs)count+=g.attributes.position.count;const pos=new Float32Array(count*3),norm=new Float32Array(count*3),uv=new Float32Array(count*2);let offset=0;for(const g of b.gs){const n=g.attributes.position.count;pos.set(g.attributes.position.array,offset*3);if(g.attributes.normal)norm.set(g.attributes.normal.array,offset*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,offset*2);offset+=n;g.dispose();}const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(pos,3));geom.setAttribute('normal',new THREE.BufferAttribute(norm,3));geom.setAttribute('uv',new THREE.BufferAttribute(uv,2));geom.computeBoundingSphere();const m=mesh(geom,b.mat,root);m.castShadow=b.shadow;}remove.forEach(o=>o.removeFromParent());}
const expansion=buildExpansion({scene,root:staticRoot,mesh,mat,box,ball,cyl,rod,ring,group,rounded,textSign,bulb,lightMat,garden,lawn,tree,shrub,flowers,bench,lamp,batch,visitor,walkingRoutes,createHuman});
for(let i=0;i<5;i++)visitor(3,i/5,'teal',false,'none',null,COMPANION_PALETTES[i]);
const platforms=buildBoardingPlatforms({scene,group,box,rod,textSign,mat});
platforms.surfaces.push(...landscaping.surfaces);
const walkingColliders=[...collectStaticColliders(staticRoot),...collectStaticColliders(platforms.root)];
batch(staticRoot);
// Rims are batched before the gondolas are reattached, so the latter stay upright.
cabins.forEach(c=>wheel.remove(c.pivot));batch(wheel);cabins.forEach(c=>{wheel.add(c.pivot);c.door.removeFromParent();batch(c.g);c.cabinBody.add(c.door);batch(c.door);});
// Individual horse groups remain animated; batch their meshes only.
horseBobs.forEach(o=>batch(o.h));batch(ship);

let paused=false,time=0,last=performance.now(),transition=null;
const views={all:{pos:[76,54,85],target:[0,5,-1]},wheel:{pos:[-24,15,12],target:[-9,8,-7.5]},carousel:{pos:[17,12,24],target:[3,3.5,7]},ship:{pos:[23,14,3],target:[7,4,-12]},coaster:{pos:[55,38,52],target:[-2,12,-10]},bumper:{pos:[30,20,32],target:[18,2.5,11]},gate:{pos:[18,13,52],target:[0,4,31.8]},entrances:{pos:[-22,12,23],target:[-12.7,1.2,3.6]},fireworks:{pos:[58,45,68],target:[0,15,-6]}};
function goView(name){const v=views[name];const factor=(name==='all'||name==='fireworks'||name==='coaster')?Math.max(1,1.12/camera.aspect):1;transition={start:performance.now(),from:camera.position.clone(),to:new THREE.Vector3(...v.pos).multiplyScalar(factor),fromTarget:controls.target.clone(),toTarget:new THREE.Vector3(...v.target)};document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>goView(b.dataset.view)));
controls.addEventListener('start',()=>{transition=null;});
document.getElementById('pause').addEventListener('click',e=>{paused=!paused;e.currentTarget.textContent=paused?'▷':'Ⅱ';e.currentTarget.title=paused?'继续设施动画':'暂停设施动画';e.currentTarget.setAttribute('aria-label',e.currentTarget.title);});
document.getElementById('auto').addEventListener('click',e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));});
const fireworkButton=document.getElementById('fireworks');
const fireworkLabel=fireworkButton.querySelector('.firework-label');
function finishFireworks(){document.body.classList.remove('firework-show');fireworkButton.setAttribute('aria-pressed','false');fireworkLabel.textContent='放烟花';fireworkButton.querySelector('small').textContent='NIGHT SPECTACULAR';fireworkButton.style.setProperty('--progress','0%');}
const fireworks=new FireworkShow(scene,finishFireworks);
fireworkButton.addEventListener('click',()=>{if(fireworks.active){fireworks.stop();finishFireworks();return;}fireworks.start();document.body.classList.add('firework-show');fireworkButton.setAttribute('aria-pressed','true');fireworkLabel.textContent='结束烟花';controls.autoRotate=false;document.getElementById('auto').setAttribute('aria-pressed','false');goView('fireworks');});
const fp=new FirstPersonPark({scene,camera,renderer,controls,host,expansion,benches,walkers,colliders:walkingColliders,wheel,cabins,carousel,horseBobs,ship,hull,platforms,group,mesh,mat,box,ball,cyl,rod,ring,rounded,textSign,batch,createHuman,
  cancelOrbit:()=>{transition=null;document.getElementById('auto').setAttribute('aria-pressed','false');},
  onModeChange:()=>{paused=false;document.getElementById('pause').textContent='Ⅱ';},
  fireworks:()=>{if(fireworks.active)return;fireworks.start();document.body.classList.add('firework-show');fireworkButton.setAttribute('aria-pressed','true');fireworkLabel.textContent='结束烟花';}
});
let nightBlend=0;
function toggleClean(){document.body.classList.toggle('clean');}
document.getElementById('hide').onclick=toggleClean;document.getElementById('restore').onclick=toggleClean;
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;if(e.key.toLowerCase()==='h'){toggleClean();return;}if(fp.active)return;if(e.key.toLowerCase()==='p'){fireworkButton.click();return;}if(e.key==='Escape'){document.body.classList.remove('clean');goView('all');}});
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);camera.position.multiplyScalar(Math.max(1,1.12/camera.aspect));
document.addEventListener('visibilitychange',()=>{last=performance.now();});
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)time+=dt;
updateVisitors(paused?0:dt,time);expansion.update(paused?0:dt,{coaster:!fp.active,bumper:!fp.active});
wheel.rotation.z=time*.065;cabins.forEach(c=>c.g.rotation.z=-wheel.rotation.z);
if(!fp.active){carousel.rotation.y=-time*.19;horseBobs.forEach(({h,phase})=>h.position.y=1.45+Math.sin(time*1.4+phase)*.17);
shipMotion.update(paused?0:dt);ship.rotation.z=shipMotion.angle;}
if(fp.active){fp.wheelAngle=wheel.rotation.z;fp.update(dt);}else{host.dataset.mode='model';}
const a=fireflyGeo.attributes.position;for(let i=0;i<32;i++){a.array[i*3+1]=ff[i*3+1]+Math.sin(time*.6+i)*.18;}a.needsUpdate=true;
if(transition){const t=Math.min((now-transition.start)/1400,1),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,e);if(t===1)transition=null;}
fireworks.update(dt,innerHeight*renderer.getPixelRatio());
nightBlend=THREE.MathUtils.damp(nightBlend,fireworks.active?1:0,1.5,dt);sun.intensity=.62-nightBlend*.22;fill.intensity=1.05-nightBlend*.2;
host.dataset.fireworks=String(fireworks.active);host.dataset.fireworkParticles=String(fireworks.particles.length);host.dataset.fireworkTime=fireworks.elapsed.toFixed(1);
if(fireworks.active){fireworkButton.style.setProperty('--progress',`${fireworks.elapsed/fireworks.duration*100}%`);fireworkButton.querySelector('small').textContent=`${Math.max(0,Math.ceil(fireworks.duration-fireworks.elapsed))}s · 烟花时间`;}
if(!fp.active)controls.update();renderer.info.reset();composer.render();
host.dataset.paused=String(paused);
host.dataset.shipAngle=shipMotion.angle.toFixed(4);host.dataset.shipSpeed=shipMotion.velocity.toFixed(4);host.dataset.coasterSpeed=expansion.coasterMotion.speed.toFixed(3);
host.dataset.coasterHeight=expansion.coasterHeight.toFixed(2);host.dataset.coasterLength=expansion.trackLength.toFixed(2);host.dataset.queueGuests=String(expansion.queueActors.length);host.dataset.vipNpcAllowed=String(expansion.canUseEntrance('npc','vip'));host.dataset.vipOwnerAllowed=String(expansion.canUseEntrance('owner','vip'));host.dataset.coasterTrainPosition=expansion.coasterCars[0].position.toArray().map(n=>n.toFixed(2)).join(',');
host.dataset.carouselAngle=carousel.rotation.y.toFixed(3);host.dataset.walkerPosition=walkers[0].g.position.toArray().map(n=>n.toFixed(3)).join(',');host.dataset.walkers=String(walkers.length);
if(Math.floor(time*2)!==Number(host.dataset.tick)){host.dataset.tick=String(Math.floor(time*2));host.dataset.renderCalls=String(renderer.info.render.calls);host.dataset.triangles=String(renderer.info.render.triangles);host.dataset.wheelAngle=wheel.rotation.z.toFixed(3);host.dataset.gondolaWorldAngle=(wheel.rotation.z+cabins[0].g.rotation.z).toFixed(3);host.dataset.paused=String(paused);}
}
composer.render();document.getElementById('loader').classList.add('done');document.getElementById('loader').setAttribute('aria-hidden','true');requestAnimationFrame(frame);
// Small read-only diagnostics for local verification.
window.parkDiagnostics=()=>({meshes:renderer.info.render.calls,triangles:renderer.info.render.triangles,paused,time,view:document.querySelector('[data-view].active')?.dataset.view,gondolas:cabins.length,horses:horseBobs.length,entrances:expansion.entries});
