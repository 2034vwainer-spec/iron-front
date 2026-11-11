(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('screen'),ctx=canvas.getContext('2d');
let mode='ATTACK',coins=0,level=1,hp=100,armor=0,weapon='PISTOL',ammo=12,reserve=36,playing=false,paused=false,bus=false,last=0,lastShot=0,mouseDown=false,keys={},enemies=[],lockedTarget=null,player={x:2.5,y:11.5,a:0},baseHp=100,muzzleFlashUntil=0,emptyMessageAt=0,footstepPhase=0,cameraKick=0,shotFx=null;
const guns=[{name:'PISTOL',cost:0,damage:25,clip:12,rate:330},{name:'AK-47',cost:650,damage:22,clip:30,rate:125},{name:'DESERT EAGLE',cost:900,damage:60,clip:7,rate:470},{name:'MACHINE GUN',cost:1600,damage:18,clip:100,rate:65}];
const vests=[{name:'LIGHT VEST',cost:300,protection:15},{name:'REINFORCED VEST',cost:700,protection:30},{name:'HEAVY ARMOR',cost:1200,protection:50}];
let owned=['PISTOL'];
const map=(()=>{
  const size=24;
  const g=Array.from({length:size},(_,y)=>Array.from({length:size},(_,x)=>(x===0||y===0||x===size-1||y===size-1)?'1':'0'));
  const block=(x1,y1,x2,y2,material='1')=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)g[y][x]=material};
  // Industrial service buildings around a broad cross-shaped access road
  block(4,3,8,7,'1');g[7][6]='0';
  block(15,3,20,7,'2');g[7][17]='0';
  block(4,16,8,20,'2');g[16][6]='0';
  block(15,16,20,20,'3');g[16][17]='0';
  // Loading docks and smaller utility structures
  block(2,5,3,7,'3');g[7][2]='0';
  block(20,5,21,7,'1');g[7][20]='0';
  block(2,16,3,18,'1');g[17][3]='0';
  block(20,16,21,18,'2');g[17][20]='0';
  // Shipping containers, concrete dividers and guard posts
  block(9,8,9,9,'2');
  block(14,8,14,9,'3');
  block(9,14,10,14,'1');
  block(13,14,14,14,'2');
  block(6,10,7,10,'3');
  block(17,12,18,12,'1');
  block(11,4,12,5,'3');
  // Keep the center and road junction open for movement
  for(let x=1;x<size-1;x++){g[11][x]='0';g[12][x]='0'}
  for(let y=1;y<size-1;y++){g[y][11]='0';g[y][12]='0'}
  // Restore building corners beyond the central road only
  block(4,3,8,7,'1');g[7][6]='0';
  block(15,3,20,7,'2');g[7][17]='0';
  block(4,16,8,20,'2');g[16][6]='0';
  block(15,16,20,20,'3');g[16][17]='0';
  // Add selected roadside cargo containers without closing the main lanes
  block(8,9,9,9,'2');block(14,14,15,14,'3');
  return g.map(row=>row.join(''));
})();
const gun=()=>guns.find(g=>g.name===weapon);
function show(id){['menu','shop','game','bus'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}
function say(s){$('message').textContent=s}
function hud(){$('coins').textContent=coins;$('gameCoins').textContent=coins;$('level').textContent=level;$('hp').textContent=Math.max(0,Math.ceil(hp));$('ammo').textContent=ammo+'/'+reserve}
function wall(x,y){let a=Math.floor(x),b=Math.floor(y);return b<0||b>=map.length||a<0||a>=map[0].length||map[b][a]!=='0'}
function free(x,y,r=.18){return !wall(x-r,y-r)&&!wall(x+r,y-r)&&!wall(x-r,y+r)&&!wall(x+r,y+r)}
function blocked(x1,y1,x2,y2){let d=Math.hypot(x2-x1,y2-y1),n=Math.ceil(d*12);for(let i=1;i<n;i++){let t=i/n;if(wall(x1+(x2-x1)*t,y1+(y2-y1)*t))return true}return false}
function openShop(type){$('shopTitle').textContent=type==='WEAPON'?'WEAPON ARMORY':'ARMOR SHOP';let arr=type==='WEAPON'?guns:vests;$('items').innerHTML='';arr.forEach(it=>{let el=document.createElement('article');el.className='item';let desc=type==='WEAPON'?it.damage+' damage · '+it.clip+' round magazine · 100% durability':'Damage reduction: '+it.protection+'%';let has=type==='WEAPON'?owned.includes(it.name):armor===it.protection;el.innerHTML='<h3>'+it.name+'</h3><p>'+desc+'</p><div class="price">'+(it.cost===0?'FREE':it.cost+' CREDITS')+'</div>';let b=document.createElement('button');b.textContent=has?'EQUIPPED':type==='WEAPON'?'BUY / EQUIP':'BUY / EQUIP';b.onclick=()=>{if(has){say('Already equipped.');return}if(coins<it.cost){say('NOT ENOUGH CREDITS');return}coins-=it.cost;if(type==='WEAPON'){owned.push(it.name);weapon=it.name;ammo=it.clip;reserve=it.clip*3}else armor=it.protection;hud();say(it.name+' EQUIPPED');openShop(type)};el.append(b);$('items').append(el)});show('shop');hud()}
$('weapons').onclick=()=>openShop('WEAPON');$('armor').onclick=()=>openShop('ARMOR');$('back').onclick=()=>show('menu');
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));say('SELECTED OPERATION: '+mode)});
function spawn(n){
  enemies=[];lockedTarget=null;
  const spots=[];
  for(let y=1;y<map.length-1;y++)for(let x=1;x<map[0].length-1;x++){
    const sx=x+.5,sy=y+.5,d=Math.hypot(sx-player.x,sy-player.y);
    if(!wall(sx,sy)&&d>2.3&&d<16&&!blocked(player.x,player.y,sx,sy))spots.push({x:sx,y:sy});
  }
  for(let i=spots.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[spots[i],spots[j]]=[spots[j],spots[i]]}
  const chosen=[];
  for(const gap of [1.2,.65,0]){
    for(const p of spots){
      if(chosen.length>=n)break;
      if(!chosen.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<gap+.01))chosen.push(p);
    }
    if(chosen.length>=n)break;
  }
  chosen.forEach((p,i)=>{
    const boss=(level===1||level%3===0)&&i===0,hpValue=boss?260+level*35:55+level*12;
    enemies.push({x:p.x,y:p.y,hp:hpValue,max:hpValue,boss,speed:boss?.48:.65+level*.025,hit:0});
  });
}
function start(){level=1;hp=100;baseHp=100;player={x:2.5,y:11.5,a:0};ammo=gun().clip;reserve=gun().clip*3;bus=mode==='BATTLE ROYALE';if(bus){show('bus');return}spawn(mode==='SURVIVAL'?8:5);launch()}
function launch(){bus=false;playing=true;paused=false;show('game');$('modeLabel').textContent=mode;last=performance.now();hud();say('MISSION LIVE — ELIMINATE HOSTILES');requestAnimationFrame(loop)}
$('play').onclick=start;$('jump').onclick=()=>{spawn(14);launch();say('BATTLE ROYALE — SURVIVE THE DROP')};
$('quit').onclick=()=>{playing=false;mouseDown=false;show('menu');say('MISSION ENDED')};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'RESUME':'PAUSE';if(!paused){last=performance.now();requestAnimationFrame(loop)}};
function reload(){let n=Math.min(gun().clip-ammo,reserve);ammo+=n;reserve-=n;hud()}$('reload').onclick=reload;
$('autoAim').addEventListener('change',()=>{if(!$('autoAim').checked){lockedTarget=null;$('autoFire').checked=false;say('AUTO AIM OFF — AUTO FIRE DISABLED')}else say('AUTO AIM ON — TARGET LOCK ACTIVE')});$('autoFire').addEventListener('change',()=>say($('autoFire').checked?'AUTO FIRE ON — SHOOTING WHEN TARGET IS LOCKED':'AUTO FIRE OFF — MANUAL SHOOTING'));
window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='r')reload();if(e.key==='Escape'&&playing)$('pause').click()});window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
let lastMouseX=null;canvas.addEventListener('pointermove',e=>{let r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*canvas.width/r.width;if(lastMouseX!==null)player.a+=(x-lastMouseX)/canvas.width*2.1;lastMouseX=x});canvas.addEventListener('pointerleave',()=>lastMouseX=null);
canvas.addEventListener('pointerdown',e=>{if(e.button===0||e.button===2){e.preventDefault();mouseDown=true;canvas.setPointerCapture(e.pointerId);fire()}});window.addEventListener('pointerup',()=>mouseDown=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b))}
function canLock(e){return enemies.includes(e)&&Math.hypot(e.x-player.x,e.y-player.y)<14&&!blocked(player.x,player.y,e.x,e.y)}
function findAutoTarget(){
  if(lockedTarget&&canLock(lockedTarget))return lockedTarget;
  const candidates=enemies.map(e=>({e,d:Math.hypot(e.x-player.x,e.y-player.y),a:Math.atan2(e.y-player.y,e.x-player.x)})).filter(o=>o.d<14&&!blocked(player.x,player.y,o.e.x,o.e.y));
  candidates.sort((a,b)=>(a.d+Math.abs(angleDiff(a.a,player.a))*1.4)-(b.d+Math.abs(angleDiff(b.a,player.a))*1.4));
  return candidates[0]?.e||null;
}
function fire(automatic=false){
  const now=performance.now();
  if(!playing||paused||now-lastShot<gun().rate)return;
  if(automatic&&(!$('autoAim').checked||!$('autoFire').checked||!lockedTarget))return;
  let target=null;
  if($('autoAim').checked){lockedTarget=findAutoTarget();target=lockedTarget}
  else{
    let best=.14;
    enemies.forEach(e=>{
      const d=Math.hypot(e.x-player.x,e.y-player.y),a=Math.atan2(e.y-player.y,e.x-player.x),diff=Math.abs(angleDiff(a,player.a));
      if(d<14&&diff<best&&!blocked(player.x,player.y,e.x,e.y)){best=diff;target=e}
    });
  }
  if(automatic&&!target)return;
  if(ammo<=0){
    if(now-emptyMessageAt>1200){say('MAGAZINE EMPTY — PRESS R TO RELOAD');emptyMessageAt=now}
    return;
  }
  lastShot=now;ammo--;muzzleFlashUntil=now+95;cameraKick=Math.min(.28,cameraKick+.16);
  shotFx={until:now+115,target:target?{x:target.x,y:target.y}:null};
  if(target){
    target.hp-=gun().damage;say((automatic?'AUTO FIRE':'HIT')+' — '+gun().damage+' DAMAGE');
    if(target.hp<=0){
      coins+=target.boss?500:100;enemies=enemies.filter(e=>e!==target);if(lockedTarget===target)lockedTarget=null;
      say(target.boss?'BOSS DEFEATED +500 CREDITS':'ENEMY DEFEATED +100 CREDITS');
      if(!enemies.length){level++;hp=Math.min(100,hp+15);spawn(Math.min(18,4+level*2));say('WAVE '+level+' — ENEMY REINFORCEMENTS')}
    }
  }else if(!automatic){say('SHOT FIRED — NO TARGET HIT')}
  hud();
}
function rayInfo(a){
  const ca=Math.cos(a),sa=Math.sin(a);let d=0,px=player.x,py=player.y;
  while(d<24){
    d+=.025;const x=player.x+ca*d,y=player.y+sa*d;
    if(wall(x,y)){
      const side=Math.floor(x)!==Math.floor(px)?0:1;
      const material=(map[Math.floor(y)]||'')[Math.floor(x)]||'1';
      const u=side===0?y-Math.floor(y):x-Math.floor(x);
      return {d:Math.max(.01,d*Math.cos(a-player.a)),raw:d,x,y,side,u,material};
    }
    px=x;py=y;
  }
  return {d:24,raw:24,x:player.x+ca*24,y:player.y+sa*24,side:0,u:0,material:'0'};
}
function cast(a){return rayInfo(a).d}
function render(){
  const now=performance.now();
  const horizon=260+Math.sin(footstepPhase)*1.7-cameraKick*5;
  const sky=ctx.createLinearGradient(0,0,0,horizon);
  sky.addColorStop(0,'#142533');sky.addColorStop(.62,'#506d78');sky.addColorStop(1,'#a9b5a7');
  ctx.fillStyle=sky;ctx.fillRect(0,0,900,horizon+2);
  // Distant atmospheric haze and ground
  const haze=ctx.createLinearGradient(0,horizon-15,0,horizon+50);
  haze.addColorStop(0,'#c0c3ae66');haze.addColorStop(1,'#59665300');
  ctx.fillStyle=haze;ctx.fillRect(0,horizon-15,900,70);
  // Distant industrial skyline: warehouses, light poles and tree line
  ctx.fillStyle='#263c3c';ctx.globalAlpha=.45;
  ctx.beginPath();ctx.moveTo(0,horizon-7);ctx.lineTo(0,horizon-39);ctx.lineTo(48,horizon-39);ctx.lineTo(48,horizon-54);ctx.lineTo(112,horizon-54);ctx.lineTo(112,horizon-22);ctx.lineTo(168,horizon-22);ctx.lineTo(168,horizon-66);ctx.lineTo(258,horizon-66);ctx.lineTo(258,horizon-25);ctx.lineTo(324,horizon-25);ctx.lineTo(324,horizon-43);ctx.lineTo(388,horizon-43);ctx.lineTo(388,horizon-12);ctx.lineTo(900,horizon-12);ctx.closePath();ctx.fill();
  ctx.fillStyle='#172b2c';ctx.globalAlpha=.34;
  for(let i=0;i<18;i++){const x=i*57+12,ht=14+(i*17%33);ctx.fillRect(x,horizon-ht,5,ht);ctx.beginPath();ctx.arc(x+2,horizon-ht,11,Math.PI,Math.PI*2);ctx.fill()}
  ctx.globalAlpha=1;
  // Perspective ground is sampled from the compound's actual roads and yards
  for(let y=Math.ceil(horizon+3);y<520;y+=6){
    const dist=Math.min(22,390*.58/(y-horizon));
    for(let x=0;x<900;x+=10){
      const angle=player.a+(x/900-.5)*1.25,wx=player.x+Math.cos(angle)*dist,wy=player.y+Math.sin(angle)*dist;
      const road=Math.abs(wy-11.5)<1.2||Math.abs(wx-11.5)<1.2;
      const grass=((Math.floor(wx*1.7)+Math.floor(wy*1.3)*3)%13===0)&&!road;
      let base=road?[65,72,68]:grass?[69,83,58]:[117,119,105];
      const fx=wx-Math.floor(wx),fy=wy-Math.floor(wy);
      const seam=!road&&(fx<.035||fy<.035);
      const grit=(Math.floor(wx*13+wy*31)%7)*1.6;
      const shade=Math.max(.34,1-dist*.033);
      const variation=seam?.65:1;
      const r=Math.max(0,Math.min(255,(base[0]+grit)*shade*variation));
      const g=Math.max(0,Math.min(255,(base[1]+grit)*shade*variation));
      const b=Math.max(0,Math.min(255,(base[2]+grit)*shade*variation));
      ctx.fillStyle='rgb('+Math.floor(r)+','+Math.floor(g)+','+Math.floor(b)+')';ctx.fillRect(x,y,10,6);
      // Broken yellow road markings at the broad crossroad
      if(road&&Math.abs(wy-11.5)<.045&&Math.abs((wx%3)-1.5)<.65&&dist<13){
        ctx.fillStyle='#d8c77d';ctx.globalAlpha=Math.max(.15,.65-dist*.035);ctx.fillRect(x,y,10,3);ctx.globalAlpha=1;
      }
    }
  }
  // Ray-cast walls with material-specific surface details
  const depth=new Float32Array(900);
  for(let x=0;x<900;x+=3){
    const ray=player.a+(x/900-.5)*1.25,hit=rayInfo(ray),corrected=Math.max(.08,hit.d);
    const h=Math.min(520,390/corrected),top=horizon-h/2,light=Math.max(24,172-corrected*12);
    const palette=hit.material==='2'?[105,119,119]:hit.material==='3'?[133,119,91]:[119,132,112];
    const grad=ctx.createLinearGradient(0,top,0,top+h);
    grad.addColorStop(0,'rgb('+Math.floor(palette[0]*.62)+','+Math.floor(palette[1]*.66)+','+Math.floor(palette[2]*.61)+')');
    grad.addColorStop(.16,'rgb('+Math.floor(palette[0]*light/130)+','+Math.floor(palette[1]*light/130)+','+Math.floor(palette[2]*light/130)+')');
    grad.addColorStop(.82,'rgb('+Math.floor(palette[0]*.48)+','+Math.floor(palette[1]*.49)+','+Math.floor(palette[2]*.44)+')');
    grad.addColorStop(1,'rgb('+Math.floor(palette[0]*.28)+','+Math.floor(palette[1]*.3)+','+Math.floor(palette[2]*.28)+')');
    ctx.fillStyle=grad;ctx.fillRect(x,top,3,h);
    // Different surfaces: poured concrete, corrugated metal and old brick
    if(hit.material==='2'){
      ctx.fillStyle='#172526';ctx.globalAlpha=.34;
      const rib=(Math.floor(hit.u*12)%3===0);if(rib)ctx.fillRect(x,top,1,h);
      ctx.globalAlpha=1;
      ctx.fillStyle='#d5d9bd';ctx.globalAlpha=.18;ctx.fillRect(x,top+h*.22,3,2);ctx.globalAlpha=1;
    }else if(hit.material==='3'){
      ctx.fillStyle='#242a22';ctx.globalAlpha=.35;
      const courses=[.22,.45,.68,.9];courses.forEach(v=>ctx.fillRect(x,top+h*v,3,Math.max(1,h*.008)));
      if(Math.floor(hit.u*8)%2===0)ctx.fillRect(x,top+h*.22,1,Math.max(1,h*.22));
      ctx.globalAlpha=1;
    }else{
      ctx.fillStyle='#18221b';ctx.globalAlpha=.25;ctx.fillRect(x,top+h*.32,3,Math.max(1,h*.012));ctx.fillRect(x,top+h*.72,3,Math.max(1,h*.012));ctx.globalAlpha=1;
    }
    if(hit.u<.035||hit.u>.965){ctx.fillStyle='#101913';ctx.globalAlpha=.32;ctx.fillRect(x,top,2,h);ctx.globalAlpha=1}
    if(corrected<7){ctx.fillStyle='#e0dfbd';ctx.globalAlpha=.10;ctx.fillRect(x,top,1,h);ctx.globalAlpha=1}
    depth[x]=depth[x+1]=depth[x+2]=corrected;
  }
  // Enemy silhouettes with layered uniform, helmet and equipment
  [...enemies].sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y)).forEach(e=>{
    const dx=e.x-player.x,dy=e.y-player.y,d=Math.hypot(dx,dy);
    let a=Math.atan2(dy,dx)-player.a;a=Math.atan2(Math.sin(a),Math.cos(a));
    if(Math.abs(a)>.66||d<.2)return;
    const sx=450+a/1.25*900;
    if(sx<0||sx>=900||d>depth[Math.floor(sx)]||blocked(player.x,player.y,e.x,e.y))return;
    const size=Math.min(245,360/d*(e.boss?1.4:1)),y=horizon-size*.55,bodyW=size*.48;
    ctx.fillStyle='#080d0b88';ctx.beginPath();ctx.ellipse(sx,y+size*.93,bodyW*.72,size*.09,0,0,Math.PI*2);ctx.fill();
    // boots and legs
    ctx.fillStyle=e.boss?'#382d29':'#18241f';
    ctx.fillRect(sx-bodyW*.34,y+size*.72,bodyW*.25,size*.25);
    ctx.fillRect(sx+bodyW*.09,y+size*.72,bodyW*.25,size*.25);
    ctx.fillStyle='#0c1210';ctx.fillRect(sx-bodyW*.4,y+size*.92,bodyW*.32,size*.08);ctx.fillRect(sx+bodyW*.06,y+size*.92,bodyW*.32,size*.08);
    // torso and shoulder silhouette
    ctx.fillStyle=e.boss?'#684236':'#34483a';
    ctx.beginPath();ctx.moveTo(sx-bodyW*.48,y+size*.38);ctx.quadraticCurveTo(sx-bodyW*.38,y+size*.27,sx,y+size*.31);ctx.quadraticCurveTo(sx+bodyW*.4,y+size*.27,sx+bodyW*.48,y+size*.4);ctx.lineTo(sx+bodyW*.34,y+size*.78);ctx.lineTo(sx-bodyW*.34,y+size*.78);ctx.closePath();ctx.fill();
    ctx.fillStyle='#65715a';ctx.fillRect(sx-bodyW*.22,y+size*.43,bodyW*.44,size*.27);
    ctx.strokeStyle='#111a14';ctx.lineWidth=Math.max(2,size*.025);ctx.strokeRect(sx-bodyW*.22,y+size*.43,bodyW*.44,size*.27);
    // arms and gloves
    ctx.strokeStyle=e.boss?'#47332c':'#26372b';ctx.lineWidth=Math.max(4,size*.085);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(sx-bodyW*.4,y+size*.43);ctx.lineTo(sx-bodyW*.53,y+size*.68);ctx.moveTo(sx+bodyW*.4,y+size*.43);ctx.lineTo(sx+bodyW*.53,y+size*.68);ctx.stroke();
    // neck and helmeted head
    ctx.fillStyle='#a99a7c';ctx.beginPath();ctx.arc(sx,y+size*.25,size*.105,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=e.boss?'#352c28':'#26372d';ctx.beginPath();ctx.arc(sx,y+size*.205,size*.15,Math.PI,Math.PI*2);ctx.lineTo(sx+size*.14,y+size*.22);ctx.quadraticCurveTo(sx,y+size*.28,sx-size*.14,y+size*.22);ctx.closePath();ctx.fill();
    ctx.fillStyle='#101a16';ctx.fillRect(sx-size*.13,y+size*.22,size*.26,size*.035);
    // health bar
    ctx.fillStyle='#080d0b';ctx.fillRect(sx-size*.31,y-13,size*.62,7);
    ctx.fillStyle='#ce5146';ctx.fillRect(sx-size*.30,y-12,size*.60*Math.max(0,e.hp/e.max),5);
    if(e.boss){ctx.fillStyle='#fff';ctx.font='bold 11px monospace';ctx.fillText('BOSS',sx-17,y-20)}
    if(e===lockedTarget){ctx.strokeStyle='#f3d46a';ctx.lineWidth=3;ctx.strokeRect(sx-size*.39,y+size*.08,size*.78,size*.9)}
  });
  // Shot tracer and hit marker flash
  if(shotFx&&now<shotFx.until&&shotFx.target){
    const dx=shotFx.target.x-player.x,dy=shotFx.target.y-player.y;
    let a=Math.atan2(dy,dx)-player.a;a=Math.atan2(Math.sin(a),Math.cos(a));
    const sx=450+a/1.25*900;
    ctx.strokeStyle='#e9d69a';ctx.globalAlpha=.65;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(450,horizon+165);ctx.lineTo(sx,horizon+24);ctx.stroke();ctx.globalAlpha=1;
  }
  // Crosshair
  ctx.strokeStyle=lockedTarget&&$('autoAim').checked?'#f3d46a':'#f4e7c5';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(438,horizon);ctx.lineTo(462,horizon);ctx.moveTo(450,horizon-12);ctx.lineTo(450,horizon+12);ctx.stroke();
  // Simple first-person weapon silhouette and muzzle flash
  ctx.save();ctx.translate(450+cameraKick*8,520+Math.sin(footstepPhase)*2);ctx.fillStyle='#111916';
  ctx.beginPath();ctx.moveTo(-82,0);ctx.lineTo(-58,-45);ctx.lineTo(-25,-56);ctx.lineTo(28,-54);ctx.lineTo(55,-35);ctx.lineTo(91,-29);ctx.lineTo(98,-12);ctx.lineTo(58,-8);ctx.lineTo(43,0);ctx.closePath();ctx.fill();
  ctx.fillStyle='#465247';ctx.fillRect(-26,-48,56,8);ctx.fillStyle='#202b24';ctx.fillRect(15,-30,30,17);ctx.fillStyle='#0b100e';ctx.fillRect(-5,-18,16,25);
  if(now<muzzleFlashUntil){ctx.fillStyle='#f8d58a';ctx.beginPath();ctx.moveTo(96,-27);ctx.lineTo(137,-45);ctx.lineTo(124,-22);ctx.lineTo(148,-8);ctx.lineTo(105,-12);ctx.closePath();ctx.fill();ctx.fillStyle='#fff0bd';ctx.beginPath();ctx.arc(111,-23,9,0,Math.PI*2);ctx.fill()}
  ctx.restore();
  // Subtle edge vignette for depth
  const vignette=ctx.createRadialGradient(450,260,170,450,260,560);
  vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#050a08aa');
  ctx.fillStyle=vignette;ctx.fillRect(0,0,900,520);
  // Compact map overview: buildings and your current position, without revealing opponents
  const mm=150,mx=900-mm-18,my=18,cell=mm/map[0].length;
  ctx.save();ctx.fillStyle='#08110ed9';ctx.fillRect(mx-7,my-7,mm+14,mm+14);
  ctx.strokeStyle='#9ba88c';ctx.lineWidth=2;ctx.strokeRect(mx-7,my-7,mm+14,mm+14);
  for(let gy=0;gy<map.length;gy++)for(let gx=0;gx<map[gy].length;gx++){
    const tile=map[gy][gx];if(tile==='0'){ctx.fillStyle=((gx+gy)%2)?'#596753':'#68745d'}
    else if(tile==='2')ctx.fillStyle='#687d7c';else if(tile==='3')ctx.fillStyle='#8a7658';else ctx.fillStyle='#66735e';
    ctx.fillRect(mx+gx*cell,my+gy*cell,cell+.3,cell+.3);
  }
  const px=mx+player.x*cell,py=my+player.y*cell;
  ctx.strokeStyle='#f0d57c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(player.a)*10,py+Math.sin(player.a)*10);ctx.stroke();
  ctx.fillStyle='#ffe49a';ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
  if(mode==='DEFENSE'){ctx.fillStyle='#c7a75e';ctx.fillRect(360,345,180,35);ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.fillText('YOUR BASE',414,367)}
}
function update(dt){let speed=2.8*dt*(keys.shift?1.5:1),f=(keys.w?1:0)-(keys.s?1:0),s=(keys.d?1:0)-(keys.a?1:0);if(keys.arrowleft)player.a-=2*dt;if(keys.arrowright)player.a+=2*dt;let dx=(Math.cos(player.a)*f-Math.sin(player.a)*s)*speed,dy=(Math.sin(player.a)*f+Math.cos(player.a)*s)*speed;if(free(player.x+dx,player.y))player.x+=dx;if(free(player.x,player.y+dy))player.y+=dy;enemies.forEach(e=>{let dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy);if(d>.75&&!blocked(e.x,e.y,player.x,player.y)){let nx=e.x+dx/d*e.speed*dt,ny=e.y+dy/d*e.speed*dt;if(free(nx,e.y,.14))e.x=nx;if(free(e.x,ny,.14))e.y=ny}if(d<.8&&Math.random()<dt*.7){let damage=Math.max(1,5*(1-armor/100));if(mode==='DEFENSE')baseHp-=damage;else hp-=damage}});if(f||s)footstepPhase+=dt*12;cameraKick=Math.max(0,cameraKick-dt*2.8);if($('autoAim').checked){lockedTarget=findAutoTarget();if(lockedTarget){const desired=Math.atan2(lockedTarget.y-player.y,lockedTarget.x-player.x),turn=angleDiff(desired,player.a),step=Math.min(Math.abs(turn),5.8*dt);player.a+=Math.sign(turn)*step}}else lockedTarget=null;if(hp<=0||baseHp<=0){playing=false;show('menu');say('MISSION FAILED — SELECT PLAY TO RETRY')}}
function loop(now){if(!playing||paused)return;let dt=Math.min(.04,(now-last)/1000||.016);last=now;update(dt);if(mouseDown)fire(false);else if($('autoAim').checked&&$('autoFire').checked&&lockedTarget)fire(true);render();hud();requestAnimationFrame(loop)}
hud();
})();