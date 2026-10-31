import {PedestrianNavigation} from './pedestrian-navigation.js';
export function planBoardingPaths({colliders,surfaces,requests}){
 const nav=new PedestrianNavigation(colliders,surfaces);
 return requests.map(({start,starts,candidates})=>{for(const origin of starts||[start])for(const goal of candidates){const path=nav.path(origin,goal);if(path)return path;}return null;});
}
if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope)self.onmessage=({data})=>{try{self.postMessage({kind:data.kind,generation:data.generation,paths:planBoardingPaths(data)});}catch(error){self.postMessage({kind:data.kind,generation:data.generation,error:String(error)});}};
