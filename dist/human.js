import * as THREE from './vendor/three.module.js';
const sphere=new THREE.SphereGeometry(1,24,18),bellyGeometry=sphere.clone(),faceMaterials=new Map();
const bellyPositions=bellyGeometry.attributes.position;for(let i=0;i<bellyPositions.count;i++){const taper=1-.16*bellyPositions.getY(i);bellyPositions.setX(i,bellyPositions.getX(i)*taper);bellyPositions.setZ(i,bellyPositions.getZ(i)*taper);}bellyGeometry.computeVertexNormals();
export const COMPANION_PALETTES=[
 [0xb63742,0xb63742,0xb63742],
 [0x38204f,0x38204f,0x38204f],
 [0xefb7ca,0xb8dba7,0xf4dda1],
 [0xf4dda1,0xf4dda1,0xf4dda1],
 [0xb63742,0xe6be43,0x479b58]
];
const palettes=[
 [0xa98031,0xa98031,0x304a84],[0x77272e,0x263e78,0x77272e],
 [0x24222b,0x56525e,0x24222b],[0x427e79,0x427e79,0x305c50],
 [0xc4896c,0x784658,0xc4896c],[0x4f6495,0xa6a3a0,0x4f6495]
];
// Eyes are painted into the spherical head's UV texture: no eye meshes or relief.
function faceMaterial(color){
 if(faceMaterials.has(color))return faceMaterials.get(color);
 const width=512,height=256,data=new Uint8Array(width*height*4),base=new THREE.Color(color),rgb=[(color>>16)&255,(color>>8)&255,color&255];
 const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const u=(x+.5)/width,v=(y+.5)/height,phi=u*Math.PI*2,lat=(v-.5)*Math.PI;
   const angle=Math.atan2(-Math.cos(phi),Math.sin(phi));
   const ellipse=Math.min(...[-1,1].map(side=>(wrap(angle-side*1.02 )/.44)**2+((lat-.035)/.48)**2));
   const white=THREE.MathUtils.clamp((1-ellipse)*35+.5,0,1),pupil=THREE.MathUtils.clamp((.40-ellipse)*45+.5,0,1),i=(y*width+x)*4;
   for(let c=0;c<3;c++)data[i+c]=Math.round(THREE.MathUtils.lerp(THREE.MathUtils.lerp(rgb[c],239,white),20,pupil));data[i+3]=255;
 }
 const map=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
 const material=new THREE.MeshStandardMaterial({map,roughness:.96});faceMaterials.set(color,material);return material;
}
// One shared silhouette, with color changes only. Local forward is +Z.
export function createHuman(api,parent,{variant=0,seated=false,riding=false,palette=null}={}){
 const {group,rod,mat,batch}=api,[headColor,chestColor,bellyColor]=palette??palettes[Math.abs(Math.floor(variant))%palettes.length];
 const ball=(r,m,parent,x,y,z,sx=1,sy=1,sz=1)=>{const o=new THREE.Mesh(sphere,typeof m==='object'?m:mat(m));o.position.set(x,y,z);o.scale.set(r*sx,r*sy,r*sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
 const g=group(0,0,0,parent),body=group(0,0,0,g),legs=[],arms=[];
 const belly=ball(.25,bellyColor,body,0,.755,0,1,1,.88);belly.geometry=bellyGeometry;
 ball(.143,chestColor,body,0,1.055,0,1,1,.93);
 const head=group(0,0,0,body);
 ball(.208,faceMaterial(headColor),head,0,1.37,.005,1,1,.96);
 rod([0,1.327,.155],[0,1.327,.29],.043,headColor,head,16);ball(.043,headColor,head,0,1.327,.29);
 for(const side of [-1,1]){
   const leg=group(side*.075,.67,0,g);rod([0,0,0],[side*.012,-.3,.018],.029,bellyColor,leg,12);ball(.03,bellyColor,leg,side*.012,-.3,.018);
   const lower=group(side*.012,-.3,.018,leg);rod([0,0,0],[0,-.29,-.006],.026,bellyColor,lower,12);ball(.052,bellyColor,lower,0,-.327,.038,.8,.62,1.5);leg.userData.lower=lower;legs.push(leg);
   const arm=group(side*.125,1.055,0,g);rod([0,0,0],[side*.1,-.19,.035],.031,chestColor,arm,12);ball(.031,chestColor,arm,side*.1,-.19,.035);
   const fore=group(side*.1,-.19,.035,arm);rod([0,0,0],[side*.03,-.21,.065],.029,chestColor,fore,12);ball(.063,chestColor,fore,side*.03,-.235,.065,.84,1,.88);arm.userData.forearm=fore;arms.push(arm);
 }
 body.remove(head);batch(body);body.add(head);batch(head);legs.forEach(l=>{const lower=l.userData.lower;l.remove(lower);batch(l);l.add(lower);batch(lower);});arms.forEach(a=>{const fore=a.userData.forearm;a.remove(fore);batch(a);a.add(fore);batch(fore);});
 const rig={g,body,head,legs,arms,palette:[headColor,chestColor,bellyColor],setRiding(value){riding=value;}};
 rig.pose=(sit=0,stride=0,mount=0)=>{
   body.position.y=-.22*sit;body.rotation.x=.12*Math.sin(sit*Math.PI);
   legs.forEach((l,i)=>{l.position.y=.67-.22*sit;l.position.x=(i?1:-1)*(riding?.22:.075);l.rotation.x=-Math.PI/2*sit+(i?stride:-stride)*(1-sit);l.userData.lower.rotation.x=Math.PI/2*sit+Math.max(0,i?-stride:stride)*1.2*(1-sit);l.rotation.z=(i?1:-1)*mount*.2;});
   arms.forEach((a,i)=>{a.position.y=1.055-.22*sit;a.rotation.x=-.3*sit+(i?-stride:stride)*.65*(1-sit)-mount*.45;a.userData.forearm.rotation.x=-.7*sit-mount*.3;});
 };
 rig.pose(seated?1:0);return rig;
}

// Characters face local +Z. Turn before advancing, and discard vehicle pitch/roll.
export function turnToWalk(g,dx,dz,dt){
 if(Math.hypot(dx,dz)<.0001)return 1;
 const target=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(target-g.rotation.y),Math.cos(target-g.rotation.y));
 const turn=Math.max(-8*dt,Math.min(8*dt,delta));g.rotation.set(0,g.rotation.y+turn,0);
 const remaining=delta-turn;return Math.abs(remaining)>Math.PI/3?0:Math.max(0,Math.cos(remaining));
}
