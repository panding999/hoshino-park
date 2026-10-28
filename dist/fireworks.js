import * as THREE from 'three';

// One reusable GPU point cloud for rockets, stars and their fading trails.
// The show clock is independent of the ride pause button.
export class FireworkShow {
  constructor(scene,onFinish){
    this.onFinish=onFinish;this.active=false;this.elapsed=0;this.duration=30;this.particles=[];this.rockets=[];this.cursor=0;
    this.capacity=14000;this.positions=new Float32Array(this.capacity*3);this.colors=new Float32Array(this.capacity*3);this.sizes=new Float32Array(this.capacity);this.alphas=new Float32Array(this.capacity);
    this.geometry=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',this.positions,3],['color',this.colors,3],['size',this.sizes,1],['alpha',this.alphas,1]])this.geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0,0);
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending,uniforms:{pixelScale:{value:900}},
      vertexShader:`attribute float size; attribute float alpha; varying vec3 vColor; varying float vAlpha; uniform float pixelScale;
        void main(){vColor=color;vAlpha=alpha;vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*pixelScale*2.1/max(1.0,-p.z),1.5,40.0);}`,
      fragmentShader:`varying vec3 vColor; varying float vAlpha;
        void main(){float r=length(gl_PointCoord-.5)*2.0;if(r>1.0)discard;float core=1.0-smoothstep(0.0,.48,r);float glow=.4*pow(1.0-r,1.2)+core*.85;gl_FragColor=vec4(vColor*1.9+core*.1,vAlpha*glow);}`});
    this.points=new THREE.Points(this.geometry,this.material);this.points.frustumCulled=false;this.points.renderOrder=4;scene.add(this.points);
    // Continuous fading lines join successive star positions; bloom supplies the halo.
    this.lineCapacity=140000;this.linePositions=new Float32Array(this.lineCapacity*3);this.lineColors=new Float32Array(this.lineCapacity*3);this.lineAlphas=new Float32Array(this.lineCapacity);
    this.lineGeometry=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',this.linePositions,3],['color',this.lineColors,3],['alpha',this.lineAlphas,1]])this.lineGeometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    this.lineGeometry.setDrawRange(0,0);
    const lineMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float alpha;varying vec3 vColor;varying float vAlpha;void main(){vColor=color;vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){gl_FragColor=vec4(vColor*2.2,vAlpha);}`});
    this.lines=new THREE.LineSegments(this.lineGeometry,lineMaterial);this.lines.frustumCulled=false;this.lines.renderOrder=3;scene.add(this.lines);
    this.flash=new THREE.PointLight(0xffc789,0,65,2);this.flash.position.set(0,16,-8);scene.add(this.flash);
    this.palette=['#ffbe4f','#ff5eac','#46bcff','#a76aff','#fff0bb'].map(c=>new THREE.Color(c));
    this.cues=[];
    const cue=(time,x,y,type=0,color=0,z=-11)=>this.cues.push({time,x,y,type,color,z});
    // Opening triptych, rising waves, heart, then a dense golden finale.
    cue(0,-7,17,1,1);cue(.18,7,19,1,2);cue(.7,0,23,2,0);
    cue(3.1,-10,20,0,3);cue(3.3,10,21,0,1);cue(4.0,0,25,1,2);
    cue(6,-6,21,2,0);cue(6.3,6,23,2,0);
    cue(8.6,0,23,3,1);cue(9,-10,17,1,2);cue(9,10,17,1,3);
    for(let i=0;i<5;i++)cue(11.8+i*.25,(i-2)*4.7,17+(2-Math.abs(i-2))*2.5,1,[1,2,3,2,1][i]);
    cue(15,-9,23,2,0);cue(15.3,0,26,1,2);cue(15.6,9,23,2,0);
    for(let i=0;i<5;i++)cue(18.2+i*.18,(i-2)*4.4,19+(2-Math.abs(i-2))*2,0,i%2?1:2);
    for(let i=0;i<5;i++)cue(21+i*.16,(i-2)*4.8,20+(2-Math.abs(i-2))*2,2,0);
    cue(23.1,0,27,2,4);
    this.cues.forEach(c=>{c.y+=16;c.z-=10;});
    this.cues.sort((a,b)=>a.time-b.time);
  }
  start(){this.clear();this.active=true;this.elapsed=0;this.cursor=0;}
  clear(){this.particles.length=0;this.rockets.length=0;this.geometry.setDrawRange(0,0);this.lineGeometry.setDrawRange(0,0);this.flash.intensity=0;}
  stop(){this.active=false;this.clear();}
  add(x,y,z,vx,vy,vz,color,life,size,trail=false,gravity=.65,drag=.55){
    if(this.particles.length>=this.capacity)return;
    this.particles.push({x,y,z,vx,vy,vz,r:color.r,g:color.g,b:color.b,life,maxLife:life,size,trail,gravity,drag,age:0,trailClock:0,history:trail?[x,y,z]:null,seed:Math.random()*30});
  }
  launch(c){this.rockets.push({...c,age:0,travel:1.2+Math.random()*.25,startX:c.x*.7,startZ:c.z+1});}
  burst(c){
    const color=this.palette[c.color],gold=this.palette[0],count=c.type===2?320:240;
    for(let i=0;i<count;i++){
      let dx,dy,dz,speed=5.3+Math.random()*1.8;
      if(c.type===3){
        const a=i/count*Math.PI*2;
        // Heart silhouette is in the default viewing plane, with a little depth.
        const hx=16*Math.pow(Math.sin(a),3)/17,hy=(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/17;
        dx=hx*.82;dz=-hx*.57;dy=hy;speed=6.5;
      }else{dy=1-2*(i+.5)/count;const a=i*2.399963,rad=Math.sqrt(1-dy*dy);dx=Math.cos(a)*rad;dz=Math.sin(a)*rad;}
      const life=c.type===2?4.9+Math.random():3.4+Math.random()*.8;
      this.add(c.x,c.y,c.z,dx*speed,dy*speed,dz*speed,color,life,c.type===2?.23:.28,true,c.type===2?.95:.5,c.type===2?.3:.48);
    }
    if(c.type===1){ // Contrasting inner pearl and horizontal halo.
      for(let i=0;i<110;i++){const a=i/110*Math.PI*2;this.add(c.x,c.y,c.z,Math.cos(a)*7.4,.3,Math.sin(a)*7.4,gold,3.1,.19,true,.45,.75);}
      for(let i=0;i<30;i++){const a=Math.random()*6.28,v=Math.random()*1.5;this.add(c.x,c.y,c.z,Math.cos(a)*v,(Math.random()-.5)*2,Math.sin(a)*v,this.palette[4],1.2,.28);}
    }
    this.flash.position.set(c.x,c.y,c.z);this.flash.color.copy(color);this.flash.intensity=20;
  }
  update(dt,pixelHeight){
    this.material.uniforms.pixelScale.value=pixelHeight*.9;
    if(!this.active)return;
    this.elapsed+=dt;
    while(this.cursor<this.cues.length&&this.cues[this.cursor].time<=this.elapsed)this.launch(this.cues[this.cursor++]);
    for(let i=this.rockets.length-1;i>=0;i--){
      const r=this.rockets[i];r.age+=dt;const u=Math.min(r.age/r.travel,1),ease=1-Math.pow(1-u,1.4);
      const x=r.startX+(r.x-r.startX)*u,y=.7+(r.y-.7)*ease,z=r.startZ+(r.z-r.startZ)*u;
      this.add(x,y,z,0,0,0,this.palette[4],.1,.32,false,0);
      for(let k=0;k<Math.ceil(dt*160);k++)this.add(x+(Math.random()-.5)*.06,y-Math.random()*.5,z,(Math.random()-.5)*.1,-.7-Math.random(),0,this.palette[0],.35+Math.random()*.2,.12,false,.5);
      if(u===1){this.burst(r);this.rockets.splice(i,1);}
    }
    // Update only the particles that existed at frame start; trails cannot spawn trails.
    const initialCount=this.particles.length;
    for(let i=initialCount-1;i>=0;i--){
      const p=this.particles[i];p.age+=dt;p.life-=dt;
      if(p.life<=0){this.particles[i]=this.particles[this.particles.length-1];this.particles.pop();continue;}
      const damping=Math.exp(-p.drag*dt);p.vx*=damping;p.vy=p.vy*damping-p.gravity*dt;p.vz*=damping;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      if(p.trail){p.trailClock+=dt;if(p.trailClock>.035){p.trailClock=0;p.history.unshift(p.x,p.y,p.z);if(p.history.length>72)p.history.length=72;}}
    }
    let lineCount=0;
    for(let i=0;i<this.particles.length;i++){
      const p=this.particles[i],f=Math.max(0,p.life/p.maxLife),fade=Math.pow(f,.55)*Math.pow(Math.min(1,p.age/.32),2);
      const twinkle=p.trail&&f<.55?.55+.45*Math.pow(Math.sin(p.age*22+p.seed),2):1;
      this.positions[i*3]=p.x;this.positions[i*3+1]=p.y;this.positions[i*3+2]=p.z;
      this.colors[i*3]=p.r;this.colors[i*3+1]=p.g;this.colors[i*3+2]=p.b;
      this.sizes[i]=p.size*(.65+.35*fade);this.alphas[i]=fade*twinkle;
      if(p.history){const h=p.history,n=h.length/3;for(let j=0;j<n-1&&lineCount+2<this.lineCapacity;j++){for(let k=0;k<2;k++){const q=j+k;this.linePositions[lineCount*3]=h[q*3];this.linePositions[lineCount*3+1]=h[q*3+1];this.linePositions[lineCount*3+2]=h[q*3+2];this.lineColors[lineCount*3]=p.r;this.lineColors[lineCount*3+1]=p.g;this.lineColors[lineCount*3+2]=p.b;this.lineAlphas[lineCount]=fade*Math.pow(1-q/n,1.3)*.85;lineCount++;}}}
    }
    for(const attribute of Object.values(this.geometry.attributes))attribute.needsUpdate=true;
    for(const attribute of Object.values(this.lineGeometry.attributes))attribute.needsUpdate=true;this.lineGeometry.setDrawRange(0,lineCount);
    this.geometry.setDrawRange(0,this.particles.length);this.flash.intensity*=Math.exp(-dt*7);
    if(this.elapsed>=this.duration){this.stop();this.onFinish?.();}
  }
}
