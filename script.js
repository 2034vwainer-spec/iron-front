(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('screen'),ctx=canvas.getContext('2d');
let mode='ATTACK',coins=0,level=1,hp=100,armor=0,weapon='PISTOL',ammo=12,reserve=36,playing=false,paused=false,bus=false,last=0,lastShot=0,mouseDown=false,keys={},enemies=[],lockedTarget=null,player={x:2.5,y:2.5,a:0},baseHp=100;
const guns=[{name:'PISTOL',cost:0,damage:25,clip:12,rate:330},{name:'AK-47',cost:650,damage:22,clip:30,rate:125},{name:'DESERT EAGLE',cost:900,damage:60,clip:7,rate:470},{name:'MACHINE GUN',cost:1600,damage:18,clip:100,rate:65}];
const vests=[{name:'LIGHT VEST',cost:300,protection:15},{name:'REINFORCED VEST',cost:700,protection:30},{name:'HEAVY ARMOR',cost:1200,protection:50}];
let owned=['PISTOL'];
const map=['1111111111111111','1000000000000001','1000100001000001','1000100001000001','1000000000000001','1011000100110001','1000000000000001','1000010000100001','1000010000100001','1000000000000001','1001000000010001','1001000000010001','1000000000000001','1000110001100001','1000000000000001','1111111111111111'];
const gun=()=>guns.find(g=>g.name===weapon);
function show(id){['menu','shop','game','bus'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}
function say(s){$('message').textContent=s}
function hud(){$('coins').textContent=coins;$('gameCoins').textContent=coins;$('level').textContent=level;$('hp').textContent=Math.max(0,Math.ceil(hp));$('ammo').textContent=ammo+'/'+reserve}
function wall(x,y){let a=Math.floor(x),b=Math.floor(y);return b<0||b>=16||a<0||a>=16||map[b][a]==='1'}
function free(x,y,r=.18){return !wall(x-r,y-r)&&!wall(x+r,y-r)&&!wall(x-r,y+r)&&!wall(x+r,y+r)}
function blocked(x1,y1,x2,y2){let d=Math.hypot(x2-x1,y2-y1),n=Math.ceil(d*12);for(let i=1;i<n;i++){let t=i/n;if(wall(x1+(x2-x1)*t,y1+(y2-y1)*t))return true}return false}
function openShop(type){$('shopTitle').textContent=type==='WEAPON'?'WEAPON ARMORY':'ARMOR SHOP';let arr=type==='WEAPON'?guns:vests;$('items').innerHTML='';arr.forEach(it=>{let el=document.createElement('article');el.className='item';let desc=type==='WEAPON'?it.damage+' damage · '+it.clip+' round magazine · 100% durability':'Damage reduction: '+it.protection+'%';let has=type==='WEAPON'?owned.includes(it.name):armor===it.protection;el.innerHTML='<h3>'+it.name+'</h3><p>'+desc+'</p><div class="price">'+(it.cost===0?'FREE':it.cost+' CREDITS')+'</div>';let b=document.createElement('button');b.textContent=has?'EQUIPPED':type==='WEAPON'?'BUY / EQUIP':'BUY / EQUIP';b.onclick=()=>{if(has){say('Already equipped.');return}if(coins<it.cost){say('NOT ENOUGH CREDITS');return}coins-=it.cost;if(type==='WEAPON'){owned.push(it.name);weapon=it.name;ammo=it.clip;reserve=it.clip*3}else armor=it.protection;hud();say(it.name+' EQUIPPED');openShop(type)};el.append(b);$('items').append(el)});show('shop');hud()}
$('weapons').onclick=()=>openShop('WEAPON');$('armor').onclick=()=>openShop('ARMOR');$('back').onclick=()=>show('menu');
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));say('SELECTED OPERATION: '+mode)});
function spawn(n){
  enemies=[];lockedTarget=null;
  const spots=[];
  for(let y=1;y<15;y++)for(let x=1;x<15;x++){
    const sx=x+.5,sy=y+.5,d=Math.hypot(sx-player.x,sy-player.y);
    if(!wall(sx,sy)&&d>2.3&&d<14&&!blocked(player.x,player.y,sx,sy))spots.push({x:sx,y:sy});
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
function start(){level=1;hp=100;baseHp=100;player={x:2.5,y:2.5,a:0};ammo=gun().clip;reserve=gun().clip*3;bus=mode==='BATTLE ROYALE';if(bus){show('bus');return}spawn(mode==='SURVIVAL'?8:5);launch()}
function launch(){bus=false;playing=true;paused=false;show('game');$('modeLabel').textContent=mode;last=performance.now();hud();say('MISSION LIVE — ELIMINATE HOSTILES');requestAnimationFrame(loop)}
$('play').onclick=start;$('jump').onclick=()=>{spawn(14);launch();say('BATTLE ROYALE — SURVIVE THE DROP')};
$('quit').onclick=()=>{playing=false;mouseDown=false;show('menu');say('MISSION ENDED')};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'RESUME':'PAUSE';if(!paused){last=performance.now();requestAnimationFrame(loop)}};
function reload(){let n=Math.min(gun().clip-ammo,reserve);ammo+=n;reserve-=n;hud()}$('reload').onclick=reload;
$('autoAim').addEventListener('change',()=>say($('autoAim').checked?'AUTO AIM OPTION: ON':'AUTO AIM OPTION: OFF'));
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
function fire(){
  let now=performance.now();if(!playing||paused||now-lastShot<gun().rate)return;lastShot=now;
  if(ammo<=0){say('RELOAD YOUR WEAPON');return}ammo--;
  let target=null;
  if($('autoAim').checked){lockedTarget=findAutoTarget();target=lockedTarget}
  else{
    let best=.14;
    enemies.forEach(e=>{
      const d=Math.hypot(e.x-player.x,e.y-player.y),a=Math.atan2(e.y-player.y,e.x-player.x),diff=Math.abs(angleDiff(a,player.a));
      if(d<14&&diff<best&&!blocked(player.x,player.y,e.x,e.y)){best=diff;target=e}
    });
  }
  if(target){
    target.hp-=gun().damage;say('AUTO AIM HIT! -'+gun().damage+' HP');
    if(target.hp<=0){
      coins+=target.boss?500:100;enemies=enemies.filter(e=>e!==target);if(lockedTarget===target)lockedTarget=null;
      say(target.boss?'BOSS DEFEATED +500 CREDITS':'ENEMY DEFEATED +100 CREDITS');
      if(!enemies.length){level++;hp=Math.min(100,hp+15);spawn(Math.min(18,4+level*2));say('WAVE '+level+' — ENEMY REINFORCEMENTS')}
    }
  }else{say($('autoAim').checked?'NO VISIBLE TARGET — MOVE TO AN OPEN LANE':'AIM AT A TARGET')}
  hud();
}
function cast(a){let d=0;while(d<20){d+=.025;if(wall(player.x+Math.cos(a)*d,player.y+Math.sin(a)*d))break}return Math.max(.01,d*Math.cos(a-player.a))}
function render(){let sky=ctx.createLinearGradient(0,0,0,260);sky.addColorStop(0,'#182c39');sky.addColorStop(1,'#87958b');ctx.fillStyle=sky;ctx.fillRect(0,0,900,260);let floor=ctx.createLinearGradient(0,260,0,520);floor.addColorStop(0,'#454a3d');floor.addColorStop(1,'#171e1b');ctx.fillStyle=floor;ctx.fillRect(0,260,900,260);let depth=[];for(let x=0;x<900;x+=2){let a=player.a+(x/900-.5)*1.25,d=cast(a);depth[x]=depth[x+1]=d;let h=Math.min(500,390/d),shade=Math.max(30,160-d*11);ctx.fillStyle='rgb('+Math.floor(shade*.72)+','+Math.floor(shade)+','+Math.floor(shade*.76)+')';ctx.fillRect(x,260-h/2,2,h)}[...enemies].sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y)).forEach(e=>{let dx=e.x-player.x,dy=e.y-player.y,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx)-player.a;a=Math.atan2(Math.sin(a),Math.cos(a));if(Math.abs(a)>.66||d<.2)return;let sx=450+a/1.25*900;if(sx<0||sx>=900||d>depth[Math.floor(sx)]||blocked(player.x,player.y,e.x,e.y))return;let size=Math.min(230,360/d*(e.boss?1.4:1)),y=260-size*.55;ctx.fillStyle=e.boss?'#733b30':'#25362e';ctx.fillRect(sx-size*.23,y+size*.28,size*.46,size*.72);ctx.fillStyle='#b8a78c';ctx.beginPath();ctx.arc(sx,y+size*.17,size*.17,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.fillRect(sx-size*.3,y-12,size*.6,5);ctx.fillStyle='#d34b40';ctx.fillRect(sx-size*.3,y-12,size*.6*Math.max(0,e.hp/e.max),5);ctx.fillStyle='#fff';ctx.font='bold 11px monospace';if(e.boss)ctx.fillText('BOSS',sx-17,y-18);if(e===lockedTarget){ctx.strokeStyle='#f3d46a';ctx.lineWidth=3;ctx.strokeRect(sx-size*.36,y+size*.08,size*.72,size*.88)}});ctx.strokeStyle=lockedTarget&&$('autoAim').checked?'#f3d46a':'#f4e7c5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(438,260);ctx.lineTo(462,260);ctx.moveTo(450,248);ctx.lineTo(450,272);ctx.stroke();if(mode==='DEFENSE'){ctx.fillStyle='#c7a75e';ctx.fillRect(360,345,180,35);ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.fillText('YOUR BASE',414,367)}}
function update(dt){let speed=2.8*dt*(keys.shift?1.5:1),f=(keys.w?1:0)-(keys.s?1:0),s=(keys.d?1:0)-(keys.a?1:0);if(keys.arrowleft)player.a-=2*dt;if(keys.arrowright)player.a+=2*dt;let dx=(Math.cos(player.a)*f-Math.sin(player.a)*s)*speed,dy=(Math.sin(player.a)*f+Math.cos(player.a)*s)*speed;if(free(player.x+dx,player.y))player.x+=dx;if(free(player.x,player.y+dy))player.y+=dy;enemies.forEach(e=>{let dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy);if(d>.75&&!blocked(e.x,e.y,player.x,player.y)){let nx=e.x+dx/d*e.speed*dt,ny=e.y+dy/d*e.speed*dt;if(free(nx,e.y,.14))e.x=nx;if(free(e.x,ny,.14))e.y=ny}if(d<.8&&Math.random()<dt*.7){let damage=Math.max(1,5*(1-armor/100));if(mode==='DEFENSE')baseHp-=damage;else hp-=damage}});if($('autoAim').checked){lockedTarget=findAutoTarget();if(lockedTarget){const desired=Math.atan2(lockedTarget.y-player.y,lockedTarget.x-player.x),turn=angleDiff(desired,player.a),step=Math.min(Math.abs(turn),4.8*dt);player.a+=Math.sign(turn)*step}}else lockedTarget=null;if(hp<=0||baseHp<=0){playing=false;show('menu');say('MISSION FAILED — SELECT PLAY TO RETRY')}}
function loop(now){if(!playing||paused)return;let dt=Math.min(.04,(now-last)/1000||.016);last=now;update(dt);if(mouseDown)fire();render();hud();requestAnimationFrame(loop)}
hud();
})();