import * as THREE from './vendor/three.module.js';
import {surfaceContains} from './first-person-physics.js';

// Lawns are floors, not solid boxes. Soft planting never participates in collision.
export function createLandscaping({root,rounded,mesh,ball,mat}){
 const surfaces=[],beds=[];
 let seed=46291;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const data=new Uint8Array(128*128*4);
 for(let z=0;z<128;z++)for(let x=0;x<128;x++){
  const variation=(random()-.5)*.14+Math.sin(x*.13+Math.sin(z*.1))*Math.cos(z*.08)*.06,i=(z*128+x)*4;
  data[i]=Math.round(80*(1+variation));data[i+1]=Math.round(106*(1+variation));data[i+2]=Math.round(65*(1+variation));data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,128,128);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(.65,.65);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
 const turfMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0});
 const bladeMaterial=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1,metalness:0});
 const soilMaterial=new THREE.MeshStandardMaterial({color:0x494633,roughness:1});
 const soft=o=>{o.userData.noWalkingCollision=true;return o;};
 function surface(x,z,w,d,r,y){const s={kind:'roundedBox',x,z,w,d,r,y};surfaces.push(s);return s;}
 function lawn(x,z,w,d,{raised=false}={}){
  const y=raised?.43:.31,r=Math.min(.6,w/3,d/3),inset=raised?.16:.08;
  if(raised){soft(rounded(w,d,r,.16,0xb4af96,root,x,.26,z));surface(x,z,w,d,r,.42);}
  soft(rounded(w-inset,d-inset,Math.max(.1,r-inset),.05,soilMaterial,root,x,y-.055,z));
  const turf=soft(rounded(w-inset*1.6,d-inset*1.6,Math.max(.08,r-inset*1.6),.025,turfMaterial,root,x,y-.025,z));
  const floor=surface(x,z,w-inset,d-inset,Math.max(.1,r-inset),y);beds.push({floor,turf,raised});
  const positions=[],colors=[],base=new THREE.Color(),tip=new THREE.Color();
  function vertex(p,c){positions.push(...p);colors.push(c.r,c.g,c.b);}
  // Bent, tapered blades: visible silhouettes at eye level, with no transparent cards.
  for(let i=0;i<Math.ceil(w*d*20);i++){
   const px=x+(random()-.5)*(w-inset*2),pz=z+(random()-.5)*(d-inset*2);
   if(!surfaceContains(floor,px,pz))continue;
   const patch=.5+.5*Math.sin(px*1.8+Math.cos(pz*2.3));
   base.setHSL(.23+random()*.04,.22+random()*.16,.15+random()*.06);tip.copy(base).multiplyScalar(1.25);
   for(let blade=0;blade<3;blade++){
    const a=random()*Math.PI*2,width=.012+random()*.014,h=.035+random()*.065+patch*.018,bend=.025+random()*.035;
    const dx=Math.cos(a),dz=Math.sin(a),bx=px+(random()-.5)*.06,bz=pz+(random()-.5)*.06;
    const left=[bx-dx*width,y+.001,bz-dz*width],right=[bx+dx*width,y+.001,bz+dz*width];
    const ml=[bx-dx*width*.55-dz*bend*.35,y+h*.6,bz-dz*width*.55+dx*bend*.35],mr=[bx+dx*width*.55-dz*bend*.35,y+h*.6,bz+dz*width*.55+dx*bend*.35],end=[bx-dz*bend,y+h,bz+dx*bend];
    for(const [p,c] of [[left,base],[right,base],[ml,tip],[right,base],[mr,tip],[ml,tip],[ml,tip],[mr,tip],[end,tip]])vertex(p,c);
   }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const blades=soft(mesh(geometry,bladeMaterial,root));blades.castShadow=false;blades.userData.keepUnbatched=true;
  // Small scattered stones and fallen petals sit above the turf, away from the curb.
  for(let i=0;i<Math.min(60,Math.ceil(w*d*.6));i++){
   const px=x+(random()-.5)*(w-inset*3),pz=z+(random()-.5)*(d-inset*3);if(!surfaceContains(floor,px,pz))continue;
   const petal=i%3!==0,size=petal?.018+random()*.013:.025+random()*.025;
   const o=soft(ball(size,petal?0xbd9e93:0x898777,root,px,y+.008,pz,1,petal?.15:.3,petal?.6:.8,false));o.rotation.y=random()*Math.PI;
  }
  return floor;
 }
 const heightAt=(x,z)=>surfaces.reduce((y,s)=>surfaceContains(s,x,z)?Math.max(y,s.y):y,.28);
 return {lawn,garden:(x,z,w,d)=>lawn(x,z,w,d,{raised:true}),surfaces,beds,heightAt,soft};
}
