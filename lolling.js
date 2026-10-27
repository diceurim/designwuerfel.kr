let lollingWorld = null;
function openLolling() {
  writingMode = 'lolling'; writingOpen = true;
  document.body.classList.add('is-writing','is-lolling');
  document.getElementById('lollingView').hidden = false;
  const {Engine,Bodies,Body,Composite,Events} = Matter;
  const engine = Engine.create({gravity:{x:0,y:0,scale:0}});
  const world = lollingWorld = {engine,items:[],walls:[],queue:[],splits:new Set(),drag:null,frame:0,last:performance.now()};
  const scale = Math.min(innerWidth/520,innerHeight/760,1.25), half = 112*scale*.78;
  const home = {x:Math.max(innerWidth*.082,half+20)+30,y:innerHeight-Math.max(innerHeight*.13,half+16)-30};
  world.home=home;
  world.dice=Bodies.circle(home.x,home.y,half,{restitution:.9,friction:0,frictionAir:.035,inertia:Infinity});
  Body.setMass(world.dice,12); Composite.add(engine.world,world.dice);
  function walls() {
    world.walls.forEach(b=>Composite.remove(engine.world,b));
    world.walls=[Bodies.rectangle(innerWidth/2,-50,innerWidth+200,100,{isStatic:true,restitution:1}),Bodies.rectangle(innerWidth/2,innerHeight+50,innerWidth+200,100,{isStatic:true,restitution:1}),Bodies.rectangle(-50,innerHeight/2,100,innerHeight+200,{isStatic:true,restitution:1}),Bodies.rectangle(innerWidth+50,innerHeight/2,100,innerHeight+200,{isStatic:true,restitution:1})];
    Composite.add(engine.world,world.walls);
  }
  world.resize=()=>{
    walls();
    const s=Math.min(innerWidth/520,innerHeight/760,1.25),h=112*s*.78;
    world.home={x:Math.max(innerWidth*.082,h+20)+30,y:innerHeight-Math.max(innerHeight*.13,h+16)-30};
    world.items.forEach(item=>{measure(item);clamp(item);});
  };
  function clamp(item){const b=item.body; Body.setPosition(b,{x:Math.max(item.w/2,Math.min(innerWidth-item.w/2,b.position.x)),y:Math.max(item.h/2,Math.min(innerHeight-item.h/2,b.position.y))});}
  function measure(item) {
    const beforeW=item.w,beforeH=item.h;
    item.el.style.fontSize=`${item.size}px`;
    item.el.style.width=`${Math.min(320,innerWidth*.38)}px`;
    item.el.style.maxHeight=`${innerHeight*.75}px`;
    // 긴 기록과 합쳐진 더미도 화면 안에서 전체 내용을 담도록 글자 크기를 조정합니다.
    while(item.el.scrollHeight>innerHeight*.75 && item.size>8){item.size-=1;item.el.style.fontSize=`${item.size}px`;}
    item.w=item.el.offsetWidth;item.h=item.el.offsetHeight;
    if(item.body) Body.scale(item.body,item.w/beforeW,item.h/beforeH);
  }
  // 잡기·끌기·놓기: 손가락(마우스)과 처음 보여주는 손끝 시범이 같은 동작을 씁니다.
  function grab(item,x,y,id){
    const restingSize=item.size; item.breakable=false;
    item.size=Math.min(item.size*1.3,30);measure(item);clamp(item);
    world.drag={item,restingSize,id,lastX:x,lastY:y,time:performance.now(),vx:0,vy:0,dx:item.body.position.x-x,dy:item.body.position.y-y};
    Body.setStatic(item.body,true);item.el.classList.add('held');
    showTouchRing(x,y);
  }
  function dragTo(x,y,id){
    const d=world.drag;if(!d||d.id!==id)return;
    const now=performance.now(),dt=Math.max(8,now-d.time);
    d.vx=(x-d.lastX)/dt*16.67;d.vy=(y-d.lastY)/dt*16.67;
    d.lastX=x;d.lastY=y;d.time=now;
    Body.setPosition(d.item.body,{x:x+d.dx,y:y+d.dy});clamp(d.item);
    moveTouchRing(x,y);
  }
  function drop(id,cancelled=false){
    const d=world.drag;if(!d||d.id!==id)return;const item=d.item;
    world.drag=null;Body.setStatic(item.body,false);item.size=d.restingSize;measure(item);clamp(item);Body.setInertia(item.body,Infinity);item.el.classList.remove('held');
    const fresh=performance.now()-d.time<150 && !cancelled;
    Body.setVelocity(item.body,{x:fresh?Math.max(-14,Math.min(14,d.vx)):0,y:fresh?Math.max(-14,Math.min(14,d.vy)):0});
    item.thrown=fresh&&Math.hypot(d.vx,d.vy)>1?performance.now()+1800:0;
    item.breakable=item.parts.length>1 && item.thrown>0;
    hideTouchRing();
  }
  // 누르는 동안 손가락 아래에 원이 생겨 '잡았다'는 것을 보여줍니다.
  function showTouchRing(x,y){
    hideTouchRing(true);
    const ring=document.createElement('div');ring.className='lolling-ring';
    document.getElementById('lollingField').append(ring);world.ring=ring;moveTouchRing(x,y);
  }
  function moveTouchRing(x,y){if(world.ring)world.ring.style.transform=`translate(${x}px,${y}px)`;}
  function hideTouchRing(now=false){
    const ring=world.ring;if(!ring)return;world.ring=null;
    if(now){ring.remove();return;}
    ring.classList.add('is-out');setTimeout(()=>ring.remove(),250);
  }
  // 손끝 시범: 들어오면 한 번, 반투명 손끝이 메모를 눌러 잡고 다른 메모 쪽으로 던집니다. 화면을 만지면 바로 멈춥니다.
  function playDemo(){
    if(world.items.length<2||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const center={x:innerWidth/2,y:innerHeight/2},dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const a=[...world.items].sort((p,q)=>dist(p.body.position,center)-dist(q.body.position,center))[0];
    const b=world.items.filter(item=>item!==a).sort((p,q)=>dist(p.body.position,a.body.position)-dist(q.body.position,a.body.position))[0];
    const finger=document.createElement('div');finger.className='lolling-finger';
    document.getElementById('lollingField').append(finger);
    const demo=world.demo={finger,start:performance.now(),grabbed:false,done:false};
    const ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2;
    let from=null,dir=null,grabAt=null;
    function stop(){
      if(demo.done)return;demo.done=true;world.demo=null;
      if(world.drag?.id==='demo')drop('demo',true);
      finger.classList.add('is-out');setTimeout(()=>finger.remove(),300);
      document.removeEventListener('pointerdown',stop,true);
    }
    demo.stop=stop;
    document.addEventListener('pointerdown',stop,true);
    function step(now){
      if(demo.done||lollingWorld!==world||!world.items.includes(a))return stop();
      const t=now-demo.start;
      if(t<700){ // 손끝이 메모 위로 다가옵니다.
        const target=a.body.position;from=from||{x:target.x+140,y:target.y+120};
        const k=ease(t/700);place(from.x+(target.x-from.x)*k,from.y+(target.y-from.y)*k,k);
      } else if(t<950){ // 꾹 눌러 잡습니다.
        if(!demo.grabbed){demo.grabbed=true;grabAt={...a.body.position};grab(a,grabAt.x,grabAt.y,'demo');finger.classList.add('is-press');
          const bp=b?b.body.position:center;const len=Math.max(1,dist(bp,grabAt));dir={x:(bp.x-grabAt.x)/len,y:(bp.y-grabAt.y)/len};}
        place(grabAt.x,grabAt.y,1);
      } else if(t<1450){ // 던질 방향 반대로 살짝 당깁니다.
        const k=ease((t-950)/500);const x=grabAt.x-dir.x*70*k,y=grabAt.y-dir.y*70*k;place(x,y,1);dragTo(x,y,'demo');
      } else if(t<1570){ // 휙 던집니다.
        const k=(t-1450)/120;const x=grabAt.x-dir.x*70+dir.x*200*k,y=grabAt.y-dir.y*70+dir.y*200*k;place(x,y,1);dragTo(x,y,'demo');
      } else {
        if(world.drag?.id==='demo'){drop('demo');finger.classList.remove('is-press');}
        if(t>1900)return stop();
      }
      requestAnimationFrame(step);
    }
    function place(x,y,opacity){finger.style.transform=`translate(${x}px,${y}px)`;finger.style.opacity=opacity;}
    requestAnimationFrame(step);
  }
  function add(text,x,y,velocity={x:1,y:1},parts=null,size=16) {
    const el=document.createElement('div');el.className='lolling-text';el.textContent=text;el.tabIndex=0;
    document.getElementById('lollingField').append(el);
    const item={el,text,size,w:1,h:1,thrown:0,breakable:false,cooldown:0,parts:parts || [{text,size}],body:null};measure(item);
    item.body=Bodies.rectangle(x,y,item.w,item.h,{restitution:1,friction:0,frictionAir:.001,inertia:Infinity});item.body.memo=item;
    Composite.add(engine.world,item.body);world.items.push(item);clamp(item);Body.setVelocity(item.body,velocity);
    el.addEventListener('pointerdown',e=>{
      if(e.button!==0||world.drag)return;e.preventDefault();el.setPointerCapture(e.pointerId);
      grab(item,e.clientX,e.clientY,e.pointerId);
    });
    el.addEventListener('pointermove',e=>dragTo(e.clientX,e.clientY,e.pointerId));
    el.addEventListener('pointerup',e=>drop(e.pointerId));el.addEventListener('pointercancel',e=>drop(e.pointerId,true));
    el.addEventListener('pointerenter',()=>{world.hover=item;});
    el.addEventListener('pointerleave',()=>{if(world.hover===item)world.hover=null;});
    return item;
  }
  walls();
  writingNotes.forEach((note,i)=>add(note.text,100+Math.random()*Math.max(1,innerWidth-200),180+Math.random()*Math.max(1,innerHeight-300),{x:(Math.random()-.5)*2,y:(Math.random()-.5)*2}));
  document.getElementById('lollingEmpty').hidden=writingNotes.length>0;
  world.demoTimer=setTimeout(playDemo,1000);
  Events.on(engine,'collisionStart collisionActive',event=>{
    for(const pair of event.pairs){const a=pair.bodyA.memo,b=pair.bodyB.memo;
      for(const [item,other] of [[a,pair.bodyB],[b,pair.bodyA]]) {
        if(item && item.breakable && item.parts.length>1 && world.drag?.item!==item && (other===world.dice || world.walls.includes(other))) world.splits.add(item);
      }
      if(a&&b && a.cooldown<performance.now() && b.cooldown<performance.now() && world.drag?.item!==a && world.drag?.item!==b && (a.thrown>performance.now()||b.thrown>performance.now()))world.queue.push([a,b]);
    }
  });
  function tick(now){if(lollingWorld!==world)return;
    const dt=Math.min(16.667,now-world.last);world.last=now;
    Body.applyForce(world.dice,world.dice.position,{x:(world.home.x-world.dice.position.x)*.00007,y:(world.home.y-world.dice.position.y)*.00007});
    // 합쳐진 직후에는 전체가 느려졌다가 1.8초 동안 원래 속도로 돌아옵니다.
    const slow=world.slowStart?Math.min(1,(now-world.slowStart)/1800):1;
    engine.timing.timeScale=.25+.75*slow*slow;
    // 마우스를 올린 메모와 방금 합쳐진 메모는 천천히 멈춰 읽을 수 있게 합니다. 던진 메모는 그대로 날아갑니다.
    for(const item of world.items){
      if(item.body.isStatic||item.thrown>now)continue;
      if(item===world.hover||item.readUntil>now){const v=item.body.velocity;Body.setVelocity(item.body,{x:v.x*.88,y:v.y*.88});}
    }
    Engine.update(engine,dt);
    for(const item of world.splits) {
      if(!world.items.includes(item))continue;
      const {x,y}=item.body.position, v=item.body.velocity;
      Composite.remove(engine.world,item.body);item.el.remove();world.items.splice(world.items.indexOf(item),1);
      item.parts.forEach((part,i)=>{
        const angle=2*Math.PI*i/item.parts.length;
        const piece=add(part.text,x+Math.cos(angle)*80,y+Math.sin(angle)*80,{x:v.x*.25+Math.cos(angle)*5,y:v.y*.25+Math.sin(angle)*5},null,part.size);
        piece.cooldown=performance.now()+700;
      });
    }world.splits.clear();
    for(const [a,b] of world.queue){if(!world.items.includes(a)||!world.items.includes(b))continue;
      const pos={x:(a.body.position.x+b.body.position.x)/2,y:(a.body.position.y+b.body.position.y)/2},v={x:(a.body.velocity.x+b.body.velocity.x)/2,y:(a.body.velocity.y+b.body.velocity.y)/2};
      for(const item of [a,b]){Composite.remove(engine.world,item.body);item.el.remove();world.items.splice(world.items.indexOf(item),1);}
      // 합쳐진 메모는 거의 멈춘 채 잠시 밝게 남아 새 조합을 읽을 시간을 줍니다.
      const merged=add(a.text+'\n\n'+b.text,pos.x,pos.y,{x:v.x*.2,y:v.y*.2},[...a.parts,...b.parts]);
      merged.readUntil=merged.cooldown=performance.now()+2600;
      world.fresh=merged;world.slowStart=performance.now();
    }world.queue=[];
    // 잡은 메모 > 마우스를 올린 메모 > 방금 합쳐진 메모 순서로 하나만 밝힙니다.
    const alive=item=>item&&world.items.includes(item);
    const focus=[world.drag?.item,world.hover,world.fresh?.readUntil>now?world.fresh:null].find(alive)||null;
    if(focus!==world.focus){
      world.focus?.el.classList.remove('is-focus');focus?.el.classList.add('is-focus');
      document.getElementById('lollingField').classList.toggle('has-focus',!!focus);world.focus=focus;
    }
    world.items.forEach(item=>{const p=item.body.position;item.el.style.transform=`translate(${p.x-item.w/2}px,${p.y-item.h/2}px)`;});
    world.frame=requestAnimationFrame(tick);
  }
  window.addEventListener('resize',world.resize);world.frame=requestAnimationFrame(tick);
}
function closeLolling(){const w=lollingWorld;if(w){clearTimeout(w.demoTimer);w.demo?.stop();cancelAnimationFrame(w.frame);window.removeEventListener('resize',w.resize);Matter.Composite.clear(w.engine.world,false);Matter.Engine.clear(w.engine);}lollingWorld=null;
 document.getElementById('lollingField').replaceChildren();document.getElementById('lollingView').hidden=true;document.body.classList.remove('is-lolling','is-writing');writingOpen=false;document.querySelector('.instruction').hidden=false;document.querySelector('.face-button[data-face="6"]').focus();
}
document.addEventListener('DOMContentLoaded',()=>document.getElementById('lollingClose').addEventListener('click',closeLolling));
