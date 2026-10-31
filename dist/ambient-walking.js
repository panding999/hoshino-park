// Ambient strollers never have a boarding reservation. These world-space
// envelopes include the platforms, not just the moving vehicle centres.
export const PUBLIC_RIDE_ZONES=[
 {id:'carousel',kind:'circle',x:3,z:7,r:3.38*1.45},
 {id:'wheel',kind:'box',x:-9,z:-4.7,w:16.64,d:2.1},
 {id:'ship',kind:'box',x:7,z:-11.85,w:12.4,d:5.6},
 {id:'bumper',kind:'box',x:18,z:11,w:20.5,d:18},
 {id:'coaster',kind:'box',x:-27.2,z:3.4,w:5.2,d:16.49}
];
export function canRoamAt(p,clearance=.7){
 return PUBLIC_RIDE_ZONES.every(c=>c.kind==='circle'?Math.hypot(p.x-c.x,p.z-c.z)>=c.r+clearance:Math.abs(p.x-c.x)>=c.w/2+clearance||Math.abs(p.z-c.z)>=c.d/2+clearance);
}
export function canRoamBetween(a,b,clearance=.7){
 const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.08));
 for(let i=0;i<=steps;i++){const t=i/steps;if(!canRoamAt({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},clearance))return false;}return true;
}
