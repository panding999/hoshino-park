import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {park,scene} from './verify-park-access.mjs';
scene.updateMatrixWorld(true);const trees=[];park.staticRoot.traverse(o=>{if(o.userData.tree)trees.push({position:o.position.toArray(),box:new THREE.Box3().setFromObject(o)});});
const hits=[];
for(let i=0;i<1800;i++){
 const p=park.expansion.track.getPointAt(i/1800),train=new THREE.Box3(new THREE.Vector3(p.x-.85,p.y-.22,p.z-.85),new THREE.Vector3(p.x+.85,p.y+1.75,p.z+.85));
 for(const tree of trees)if(train.intersectsBox(tree.box)&&!hits.some(h=>h.ride==='coaster'&&h.tree===tree))hits.push({ride:'coaster',tree,p:p.toArray()});
 const a=i/1800*Math.PI*2,x=-9+Math.cos(a)*7.2,y=9.6+Math.sin(a)*7.2,cabin=new THREE.Box3(new THREE.Vector3(x-1.12,y-2.08,-5.75),new THREE.Vector3(x+1.12,y-.01,-3.65));
 for(const tree of trees)if(cabin.intersectsBox(tree.box)&&!hits.some(h=>h.ride==='wheel'&&h.tree===tree))hits.push({ride:'wheel',tree,p:[x,y,-4.7]});
}
if(hits.length)console.log(hits.map(h=>({ride:h.ride,tree:h.tree.position,point:h.p})));
assert.equal(hits.length,0,'Tree crowns must remain outside full cabin/train swept volumes');
for(let step=0;step<720;step++){const a=step/720*Math.PI*2;for(let i=0;i<12;i++)for(let j=i+1;j<12;j++){const dx=7.2*Math.abs(Math.cos(a+i*Math.PI/6)-Math.cos(a+j*Math.PI/6)),dy=7.2*Math.abs(Math.sin(a+i*Math.PI/6)-Math.sin(a+j*Math.PI/6));assert(dx>2.22||dy>2.07,'Adjacent gondolas must not intersect at diagonal positions');}}
console.log(JSON.stringify({gondolaSeparation:true,trees:trees.length,sweptPathSamples:1800,treeIntersections:0}));
