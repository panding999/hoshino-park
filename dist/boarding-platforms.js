// Walking surfaces are kept separate from decorative geometry. Treads have one
// top face, and landings sit clear of the original decks to prevent z-fighting.
export function buildBoardingPlatforms(api){
 const {scene,group,box,rod,textSign,mat}=api,root=group(0,0,0,scene),surfaces=[{kind:'box',x:0,z:31.8,w:17.5,d:4,y:.405}];
 const wood=mat('woodLight').clone();wood.roughness=1;wood.metalness=0;const concrete=mat('cream').clone();concrete.roughness=1;concrete.metalness=0;
 function deck(x,z,w,d,y,color='woodLight'){
   box(w,Math.max(.01,y-.28),d,'teal',root,x,(y+.16)/2,z); // Structural top = y-.06.
   box(w,.055,d,wood,root,x,y-.0275,z);surfaces.push({kind:'box',x,z,w,d,y});

 }
 function rail(a,b){rod(a,b,.025,'gold',root);for(let t=0;t<=1.001;t+=.25){const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;rod([x,y-.88,z],[x,y,z],.023,'teal',root);box(.075,.025,.075,'gold',root,x,y-.88,z);}}
 function stairs(x,z,w,length,y0,y1,axis='z'){
   const n=Math.max(2,Math.ceil((y1-y0)/.14)),step=length/n;
   for(let i=0;i<n;i++){const h=y0+(y1-y0)*(i+1)/n,px=axis==='x'?x-(i+.5)*step:x,pz=axis==='z'?z-(i+.5)*step:z;box(axis==='x'?step:w,h-.22,axis==='z'?step:w,concrete,root,px,(h+.22)/2,pz);surfaces.push({kind:'box',x:px,z:pz,w:axis==='x'?step:w,d:axis==='z'?step:w,y:h});}
   for(const side of [-1,1]){const a=axis==='x'?[x+.12,y0+.98,z+side*w/2]:[x+side*w/2,y0+.98,z+.12],b=axis==='x'?[x-length-.12,y1+.98,z+side*w/2]:[x+side*w/2,y1+.98,z-length-.12];rail(a,b);}
 }
 deck(-9,-2.8,3.2,1.9,.45);stairs(-9,-1.18,1.5,.65,.28,.45);
 for(const x of [-10.6,-7.4])rail([x,1.4,-1.85],[x,1.4,-3.7]);
 
 stairs(3,14.15,1.9,2.0,.28,1.05);deck(3,11.65,1.9,.98,1.05);surfaces.push({kind:'circle',x:3,z:7,r:4.41,y:1.05});
 deck(-24.18,1.9,1.12,2,1.55);stairs(-20.1,1.9,1.65,3.5,.28,1.55,'x');surfaces.push({kind:'box',x:-27.2,z:3.4,w:5.2,d:16.49,y:1.53});
 // A low, inset crossing behind the parked train connects both seating aisles.
 // Its top clears the rails while staying below the lowest train wheel (1.83).
 deck(-28.42,8.5,.95,1.2,1.66);deck(-25.98,8.5,.95,1.2,1.66);
 for(const [x,w] of [[-27.89,.30],[-27.2,.64],[-26.51,.30]])box(w,.055,1.2,wood,root,x,1.7625,8.5);
 surfaces.push({kind:'box',x:-27.2,z:8.5,w:1.75,d:1.2,y:1.79});
 deck(7,-9.7,1.4,1.3,2.1);stairs(7,-4.4,1.4,4.65,.28,2.1);
 rail([7.7,3.04,-9.05],[7.7,3.04,-10.35]);stairs(7,-10.35,.94,.43,2.1,2.62);
 deck(25.5,19.2,1.5,1.36,.72);stairs(25.5,21.3,1.3,1.4,.28,.72);
 deck(18,18.9,3.2,.3,.72);stairs(18,20.15,2.2,1.1,.28,.72);surfaces.push({kind:'box',x:18,z:11,w:18.6,d:15.6,y:.72});
 return {root,surfaces};
}
