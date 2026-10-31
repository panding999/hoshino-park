const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export class RideSession {
  constructor(id,{length=178}={}){this.id=id;this.length=length;this.phase='idle';this.elapsed=0;this.boardTime=0;this.travelled=0;this.speed=0;this.angle=0;this.omega=0;this.turn=0;this.npcCount=id==='wheel'?0:id==='coaster'?7:id==='ship'?5:6;this.boarded=0;this.exitReady=false;}
  board(){if(this.phase!=='idle')return false;this.phase=this.id==='wheel'?'waiting':'boarding';return true;}
  wheelArrived(){if(this.id==='wheel'&&this.phase==='waiting'){this.phase='running';return true;}return false;}
  start(){if(this.phase!=='ready')return false;this.phase='running';this.elapsed=0;return true;}
  update(dt,{slope=0,wheelSpeed=.065}={}){
    if(dt<=0)return;dt=Math.min(dt,.1);
    if(this.phase==='boarding'){
      this.boardTime+=dt;if(this.physicalBoarding)return;this.boarded=Math.min(this.npcCount,Math.max(0,Math.floor((this.boardTime-7.2)/1.2)+1));
      if(this.boardTime>=7.2+Math.max(0,this.npcCount-1)*1.2+.3)this.phase='ready';return;
    }
    if(!['running','braking'].includes(this.phase))return;
    this.elapsed+=dt;
    if(this.id==='wheel'){
      this.turn+=dt*wheelSpeed;if(this.turn>=Math.PI*2)this.finish();
    }else if(this.id==='coaster'){
      const remaining=this.length-this.travelled;
      let acceleration=-3.7*slope-.065*this.speed;
      if(this.travelled<this.length*.23&&slope>.13)acceleration=clamp((2.4-this.speed)*3,-4,3);
      else if(this.speed<3.1)acceleration=Math.max(acceleration,(3.1-this.speed)*2);
      if(remaining<12){this.phase='braking';const target=Math.min(3.5,Math.sqrt(Math.max(0,remaining)*2*1.6));acceleration=clamp((target-this.speed)*4,-7,3);}
      this.speed=clamp(this.speed+acceleration*dt,0,13.2);this.travelled=Math.min(this.length,this.travelled+this.speed*dt);
      if(remaining<.045){this.travelled=this.length;this.speed=0;this.finish();}
    }else if(this.id==='ship'){
      // Phase-continuous driven pendulum: pump gradually, then dissipate energy.
      const target=.68*smooth(this.elapsed/15)*(1-smooth((this.elapsed-40)/20));
      const g=9.81/5.044,energy=.5*this.omega*this.omega+g*(1-Math.cos(this.angle)),desired=g*(1-Math.cos(target));
      let drive=clamp((desired-energy)*2.8,-1.8,1.2)*Math.tanh(this.omega*12);
      if(this.elapsed<2)drive+=.055;
      const damping=this.elapsed>40?.12+smooth((this.elapsed-40)/20)*1.1:.025;
      this.omega+=(-g*Math.sin(this.angle)+drive-damping*this.omega)*dt;this.angle+=this.omega*dt;
      if(this.elapsed>=60){this.phase='braking';if(Math.abs(this.angle)<.012&&Math.abs(this.omega)<.035){this.angle=0;this.omega=0;this.finish();}}
    }else if(this.id==='carousel'){
      const scale=smooth(this.elapsed/5)*(1-smooth((this.elapsed-55)/7));this.speed=.32*scale;this.angle-=this.speed*dt;
      if(this.elapsed>=62){this.speed=0;this.finish();}
    }else if(this.id==='bumper'){
      if(this.elapsed>=60)this.phase='braking';if(this.elapsed>=62)this.finish();
    }
  }
  finish(){this.phase='complete';this.exitReady=true;}
  get canLeave(){return ['ready','complete'].includes(this.phase);}
  get npcVisibleCount(){return this.phase==='idle'?0:this.boarded;}
}
