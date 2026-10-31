import {createWalker,resolveWalker,supportHeight} from './first-person-physics.js';
// Height-aware A*: the same floors, stair rise and obstacle shapes as the player.
// Nearby obstacle bins keep each search local; no straight-line fallback through scenery.
export class PedestrianNavigation {
 constructor(colliders,surfaces,{step=.18,radius=.255}={}){this.step=step;this.radius=radius;this.surfaces=surfaces;this.bins=new Map();
  for(const c of colliders){if(c.disabled||c.enabled?.()===false)continue;const r=Math.hypot(c.w||2*c.r,c.d||2*c.r)/2+radius;
   for(let x=Math.floor(c.x-r);x<=Math.floor(c.x+r);x++)for(let z=Math.floor(c.z-r);z<=Math.floor(c.z+r);z++){const k=x+','+z;if(!this.bins.has(k))this.bins.set(k,[]);this.bins.get(k).push(c);}}
 }
 sample(x,z,y){const w=createWalker(x,z);w.y=supportHeight({...w,y},this.surfaces,y+.205);if(w.y<y-.22)return null;resolveWalker(w,this.bins.get(Math.floor(x)+','+Math.floor(z))||[],this.radius);return Math.hypot(w.x-x,w.z-z)<.001?w:null;}
 path(start,goal){const step=this.step,ox=start.x,oz=start.z,key=(x,z)=>x+','+z,heap=[],seen=new Map();
  const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return top;};
  const first={ix:0,iz:0,x:ox,y:start.y,z:oz,g:0,f:0,parent:null};push(first);seen.set('0,0',first);
  for(let count=0;heap.length&&count<160000;count++){const n=pop();if(n.closed)continue;n.closed=true;
   if(Math.hypot(n.x-goal.x,n.z-goal.z)<step*1.2&&Math.abs(n.y-goal.y)<.25){const exact=this.sample(goal.x,goal.z,n.y);if(exact){const path=[{x:exact.x,y:exact.y,z:exact.z}];for(let p=n;p;p=p.parent)path.push({x:p.x,y:p.y,z:p.z});return path.reverse();}}
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const ix=n.ix+dx,iz=n.iz+dz,x=ox+ix*step,z=oz+iz*step;if(x< -36.8||x>36.8||z< -33.8||z>33.4)continue;const k=key(ix,iz),old=seen.get(k),g=n.g+Math.hypot(dx,dz)*step;if(old&&old.g<=g)continue;
    const w=this.sample(x,z,n.y);if(!w)continue;if(dx&&dz&&(!this.sample(n.x+dx*step,n.z,n.y)||!this.sample(n.x,n.z+dz*step,n.y)))continue;
    const next={ix,iz,x,z,y:w.y,g,f:g+Math.hypot(x-goal.x,z-goal.z)*1.12,parent:n};seen.set(k,next);push(next);
   }
  }return null;
 }
}
