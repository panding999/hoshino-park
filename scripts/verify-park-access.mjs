import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import {buildBoardingPlatforms} from '../dist/boarding-platforms.js';
import {canRoamAt,canRoamBetween} from '../dist/ambient-walking.js';
import {createHuman,COMPANION_PALETTES,turnToWalk} from '../dist/human.js';
import {createLandscaping} from '../dist/landscaping.js';
import {createShipMotion} from '../dist/ride-motion.js';
import {collectStaticColliders,resolveWalker,createWalker,supportHeight} from '../dist/first-person-physics.js';
let expansionSource=await readFile(new URL('../dist/expansion.js',import.meta.url),'utf8');
for(const [from,to] of [['three','vendor/three.module.js'],['./bumper-physics.js','bumper-physics.js'],['./ride-motion.js','ride-motion.js']])expansionSource=expansionSource.replace(`from '${from}'`,`from '${new URL('../dist/'+to,import.meta.url).href}'`);
const {buildExpansion}=await import('data:text/javascript;base64,'+Buffer.from(expansionSource).toString('base64'));
const ctx={fillRect(){},strokeRect(){},fillText(){},createRadialGradient(){return {addColorStop(){}}},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){}};
const document={createElement(){return {width:1,height:1,getContext:()=>ctx}}};
const src=await readFile(new URL('../dist/main.js',import.meta.url),'utf8');
const code=src.slice(src.indexOf('const staticRoot='),src.indexOf('const platforms='));
const scene=new THREE.Scene(),renderer={capabilities:{getMaxAnisotropy:()=>4}};
const park=new Function('THREE','scene','renderer','document','buildExpansion','createShipMotion','createHuman','canRoamAt','canRoamBetween','createLandscaping','COMPANION_PALETTES','turnToWalk',code+';return {staticRoot,landscaping,expansion,benches,horseBobs,hull,cabins,wheel,carousel,ship,walkers,walkingRoutes,updateVisitors,group,box,ball,cyl,ring,rounded,mesh,batch,rod,textSign,mat};')(THREE,scene,renderer,document,buildExpansion,createShipMotion,createHuman,canRoamAt,canRoamBetween,createLandscaping,COMPANION_PALETTES,turnToWalk);
const platforms=buildBoardingPlatforms({scene,...park}),surfaces=platforms.surfaces;surfaces.push(...park.landscaping.surfaces);
const colliders=[...collectStaticColliders(park.staticRoot),...collectStaticColliders(platforms.root)];
for(let d=0;d<park.expansion.trackLength;d+=.55){const p=park.expansion.track.getPointAt(d/park.expansion.trackLength);if(p.y<3)colliders.push({kind:'circle',x:p.x,z:p.z,r:.55,minY:p.y-.45,maxY:p.y+.1});}
const step=.2,nx=371,nz=341,levels=new Float32Array(nx*nz),visited=new Uint8Array(nx*nz),nearby=new Map();
function cell(n,y){const x=n%nx*step-37,z=Math.floor(n/nx)*step-34,w=createWalker(x,z);w.y=y;const h=supportHeight(w,surfaces,y+.205);w.y=h;let near=nearby.get(n);if(!near){near=colliders.filter(c=>Math.abs(c.x-x)<(c.w||c.r*2)/2+.3&&Math.abs(c.z-z)<(c.d||c.r*2)/2+.3);nearby.set(n,near);}resolveWalker(w,near);return {x,z,y:h,clear:Math.hypot(w.x-x,w.z-z)<.001};}
const start=Math.round((30.5+34)/step)*nx+185,queue=[start];visited[start]=1;levels[start]=.28;
for(let i=0;i<queue.length;i++){const n=queue[i];for(const d of [-1,1,-nx,nx]){const m=n+d;if(m<0||m>=nx*nz||Math.abs(m%nx-n%nx)>1||visited[m])continue;const c=cell(m,levels[n]);if(!c.clear)continue;visited[m]=1;levels[m]=c.y;queue.push(m);}}
function reachable(x,z,r,minY=.28){return queue.some(n=>levels[n]>=minY-.01&&Math.hypot(n%nx*step-37-x,Math.floor(n/nx)*step-34-z)<r);}
const destinations=[['wheel',-9,-3.3,.6,.45],['carousel',5.7,7,1.6,1],['coaster',-26.9,-1.2,1.65,1.53],['ship',7,-9.7,.6,2.1],['bumper',18,17.3,1,.72]];
for(const [id,x,z,r,y] of destinations){if(process.argv.includes('--diagnostic'))console.log(id,reachable(x,z,r,y));else assert(reachable(x,z,r,y),id+' elevated boarding destination inaccessible');}
console.log(JSON.stringify({staticColliders:colliders.length,reachableCells:queue.length,allElevatedPlatformsReachable:true}));
export {park,scene,platforms,colliders};
