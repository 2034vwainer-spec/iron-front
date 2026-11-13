(()=>{'use strict';
// Manual aim only. The Machine Gun repeats shots only while the player holds the trigger.

const $=id=>document.getElementById(id),canvas=$('screen'),ctx=canvas.getContext('2d');
const LOGICAL_WIDTH=900,LOGICAL_HEIGHT=520;
function setupCanvasResolution(){
  const pixelRatio=Math.min(2.5,Math.max(1,window.devicePixelRatio||1));
  canvas.width=Math.round(LOGICAL_WIDTH*pixelRatio);
  canvas.height=Math.round(LOGICAL_HEIGHT*pixelRatio);
  ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
}
setupCanvasResolution();
window.addEventListener('resize',setupCanvasResolution,{passive:true});
let mode='ATTACK',coins=0,level=1,hp=100,armor=0,weapon='PISTOL',ammo=12,reserve=36,playing=false,paused=false,bus=false,last=0,lastShot=0,keys={},enemies=[],enemyBolts=[],player={x:2.5,y:11.5,a:0},baseHp=100,muzzleFlashUntil=0,emptyMessageAt=0,footstepPhase=0,cameraKick=0,shotFx=null,waveBreakUntil=0,reloadUntil=0,mouseHeld=false;
const ambientMotes=Array.from({length:58},(_,i)=>({
  x:(i*157.31+37)%900,
  y:(i*89.73+21)%520,
  speed:.0025+(i%7)*.00085,
  size:.45+(i%4)*.38,
  phase:i*1.71,
  alpha:.025+(i%5)*.012
}));
function drawAtmosphere(now,horizon){
  const isDesert=mode==='ADVANCE',isForest=mode==='SURVIVAL';
  ctx.save();
  const sunX=isForest?170:isDesert?700:620;
  const glow=ctx.createRadialGradient(sunX,horizon-95,3,sunX,horizon-95,isDesert?250:210);
  glow.addColorStop(0,isDesert?'rgba(255,222,161,.17)':isForest?'rgba(194,218,167,.10)':'rgba(210,220,205,.10)');
  glow.addColorStop(.38,isDesert?'rgba(239,205,148,.055)':'rgba(190,207,187,.035)');
  glow.addColorStop(1,'rgba(150,170,160,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,900,Math.min(520,horizon+150));
  const distanceFog=ctx.createLinearGradient(0,horizon-22,0,horizon+100);
  distanceFog.addColorStop(0,'rgba(208,214,195,.015)');
  distanceFog.addColorStop(.42,isDesert?'rgba(226,206,165,.095)':'rgba(190,207,190,.065)');
  distanceFog.addColorStop(1,'rgba(175,190,172,0)');
  ctx.fillStyle=distanceFog;ctx.fillRect(0,horizon-22,900,122);
  const moteColor=isDesert?[229,207,165]:isForest?[187,215,159]:[207,219,211];
  for(const mote of ambientMotes){
    const x=(mote.x+now*mote.speed)%920-10;
    const y=mote.y+Math.sin(now*.00042+mote.phase)*5;
    const depthFade=y<horizon?0.25:Math.min(1,.38+(y-horizon)/250);
    const pulse=.72+.28*Math.sin(now*.001+mote.phase);
    const alpha=mote.alpha*depthFade*pulse;
    ctx.fillStyle='rgba('+moteColor[0]+','+moteColor[1]+','+moteColor[2]+','+alpha+')';
    ctx.beginPath();ctx.arc(x,y,mote.size,0,Math.PI*2);ctx.fill();
    if(isDesert&&mote.size>1.2){
      ctx.globalAlpha=alpha*.4;ctx.fillRect(x-3,y,6,.6);ctx.globalAlpha=1;
    }
  }
  ctx.restore();
}

let peer=null,peerConn=null,onlineRole='',onlineReady=false,remotePlayer=null,lastNetSend=0,roomCodeValue='',connectionTimer=null;
let onlineMode='DUEL',teamConnections=new Map(),teamPlayers={},teamStarted=false,myPlayerId='',myTeam='';
const remoteStart={host:{x:21.5,y:11.5,a:Math.PI},guest:{x:2.5,y:11.5,a:0}};
const peerConfig={debug:2,config:{iceServers:[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun.cloudflare.com:3478'}
],sdpSemantics:'unified-plan'}};
let turnConfigured=false;
async function loadTurnRelay(){
  let host=$('turnHost').value.trim();
  const apiKey=$('turnApiKey').value.trim();
  if(host.startsWith('https://'))host=host.slice(8);
  if(host.startsWith('http://'))host=host.slice(7);
  host=host.split('/')[0];
  if(!host||!apiKey){$('turnStatus').textContent='ENTER YOUR TURN APP ADDRESS AND API KEY FIRST.';onlineStatus('TURN RELAY SETUP IS REQUIRED FOR SOME NETWORKS.');return false}
  if(host.includes(' ')||!host.includes('.')){$('turnStatus').textContent='CHECK THE APP ADDRESS FORMAT.';return false}
  $('turnStatus').textContent='FETCHING TEMPORARY RELAY CREDENTIALS...';
  try{
    const response=await fetch('https://'+host+'/api/v1/turn/credentials?apiKey='+encodeURIComponent(apiKey),{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const servers=await response.json();
    const hasTurn=Array.isArray(servers)&&servers.some(server=>{
      const urls=Array.isArray(server.urls)?server.urls:[server.urls];
      return urls.some(url=>typeof url==='string'&&(url.toLowerCase().startsWith('turn:')||url.toLowerCase().startsWith('turns:')));
    });
    if(!hasTurn)throw new Error('No TURN server returned');
    peerConfig.config.iceServers=[...servers,{urls:'stun:stun.l.google.com:19302'}];
    turnConfigured=true;
    $('turnStatus').textContent='TURN RELAY READY ON THIS DEVICE.';
    onlineStatus('RELAY READY — YOU CAN CREATE OR JOIN A ROOM.');
    return true;
  }catch(err){
    turnConfigured=false;
    $('turnStatus').textContent='TURN SETUP FAILED: CHECK THE APP ADDRESS AND API KEY.';
    onlineStatus('TURN RELAY COULD NOT BE LOADED. CHECK YOUR PROVIDER SETTINGS.');
    return false;
  }
}
function onlineStatus(message){$('onlineStatus').textContent=message}
function sendNet(data){
  if(onlineMode==='5V5'){
    if(onlineRole==='host')teamConnections.forEach(c=>{if(c.open)c.send(data)});
    else if(peerConn&&peerConn.open)peerConn.send(data);
    return;
  }
  if(peerConn&&peerConn.open)peerConn.send(data);
}
function teamRoster(){return Object.values(teamPlayers)}
function teamSpawn(index){return {x:index<5?2.5:21.5,y:4.5+(index%5)*3.7,a:index<5?0:Math.PI}}
function startTeamMatch(roster){
  teamPlayers={};roster.forEach(p=>teamPlayers[p.id]={...p});
  myPlayerId=peer.id;myTeam=teamPlayers[myPlayerId].team;onlineReady=true;teamStarted=true;
  mode='5V5';level=1;waveBreakUntil=0;reloadUntil=0;hp=100;baseHp=100;configureMap();
  const me=teamPlayers[myPlayerId];player={x:me.x,y:me.y,a:me.a};ammo=gun().clip;reserve=gun().clip*3;
  enemies=[];enemyBolts=[];launch();say('5V5 ONLINE — '+myTeam+' TEAM');
}
function hostTeamData(conn,data){
  if(!data||typeof data!=='object')return;
  if(data.type==='state'&&teamStarted){
    const p=teamPlayers[conn.peer];if(!p)return;
    p.x=data.x;p.y=data.y;p.a=data.a;
    teamBroadcast({type:'teamState',player:p});
  }else if(data.type==='hit'&&teamStarted){
    teamDamage(conn.peer,data.target,data.damage);
  }else if(data.type==='leave'){
    teamConnections.delete(conn.peer);delete teamPlayers[conn.peer];
    teamBroadcast({type:'teamRoster',players:teamRoster()});
    onlineStatus('A PLAYER LEFT THE ROOM.');
  }
}
function teamBroadcast(data){teamConnections.forEach(c=>{if(c.open)c.send(data)})}
function teamDamage(attackerId,targetId,damage){
  const target=teamPlayers[targetId],attacker=teamPlayers[attackerId];
  if(!target||!attacker||target.team===attacker.team||target.hp<=0)return;
  target.hp=Math.max(0,target.hp-(Number(damage)||0));
  if(target.id===myPlayerId){hp=target.hp;hud();if(hp<=0)finishGameOver('ELIMINATED — SPECTATING TEAM')}
  const update={type:'teamHealth',id:target.id,hp:target.hp};
  if(onlineRole==='host')teamBroadcast(update);else sendNet(update);
  if(target.hp<=0&&!Object.values(teamPlayers).some(p=>p.team===target.team&&p.hp>0)){
    const result={type:'teamOver',winner:attacker.team};
    if(onlineRole==='host')teamBroadcast(result);
    finishGameOver(attacker.team===myTeam?'YOUR TEAM WON':'YOUR TEAM LOST');
  }
}
function teamClientData(data){
  if(!data||typeof data!=='object')return;
  if(data.type==='teamRoster'){
    teamPlayers={};data.players.forEach(p=>teamPlayers[p.id]={...p});
    onlineStatus('PLAYERS CONNECTED: '+Object.keys(teamPlayers).length+'/10');
    if($('roomStatus'))$('roomStatus').textContent='Players: '+Object.keys(teamPlayers).length+'/10';
  }else if(data.type==='teamStart'){startTeamMatch(data.players)}
  else if(data.type==='teamState'){teamPlayers[data.player.id]={...data.player}}
  else if(data.type==='teamHealth'){
    if(teamPlayers[data.id])teamPlayers[data.id].hp=data.hp;
    if(data.id===myPlayerId){hp=data.hp;hud();if(hp<=0)finishGameOver('ELIMINATED — SPECTATING TEAM')}
  }else if(data.type==='teamOver'){finishGameOver(data.winner===myTeam?'YOUR TEAM WON':'YOUR TEAM LOST')}
}
function clearConnectionTimer(){if(connectionTimer){clearTimeout(connectionTimer);connectionTimer=null}}
function closeOnline(){
  clearConnectionTimer();onlineReady=false;remotePlayer=null;teamStarted=false;teamPlayers={};teamConnections.forEach(c=>{try{c.close()}catch(e){}});teamConnections.clear();
  if(peerConn){try{peerConn.close()}catch(e){}peerConn=null}
  if(peer){try{peer.destroy()}catch(e){}peer=null}
  roomCodeValue='';onlineRole='';
  if($('roomCreated'))$('roomCreated').classList.add('hidden');
}
function peerErrorMessage(err,phase){
  const type=err&&err.type?err.type:'unknown';
  const messages={
    'peer-unavailable':'ROOM NOT FOUND — CHECK THE CODE. THE HOST MUST KEEP THE ROOM OPEN.',
    'network':'CANNOT REACH THE ONLINE SIGNAL SERVER. CHECK BOTH INTERNET CONNECTIONS.',
    'server-error':'ONLINE SIGNAL SERVER ERROR. TRY CREATING A NEW ROOM.',
    'socket-error':'CONNECTION SERVER ERROR. REFRESH AND TRY AGAIN.',
    'socket-closed':'CONNECTION SERVER CLOSED. REFRESH AND TRY AGAIN.',
    'unavailable-id':'ROOM CODE ALREADY IN USE. CREATE A NEW ROOM.',
    'invalid-id':'INVALID ROOM CODE. CREATE A NEW ROOM.',
    'browser-incompatible':'THIS BROWSER DOES NOT SUPPORT THE ONLINE CONNECTION.',
    'webrtc':'DIRECT CONNECTION FAILED. THIS NETWORK MAY REQUIRE A RELAY SERVER (TURN).',
    'disconnected':'CONNECTION TO THE ONLINE SERVER WAS LOST.'
  };
  onlineStatus(messages[type]||('CONNECTION FAILED ('+type+'). '+(phase==='join'?'CHECK THE CODE AND TRY AGAIN.':'CREATE A NEW ROOM.')));
}
function startOnlineRematch(){
  if(!onlineReady||!peerConn||!peerConn.open){
    onlineStatus('CONNECTION LOST — CREATE A NEW ROOM TO PLAY AGAIN.');
    return;
  }
  playing=false;paused=false;mouseHeld=false;waveBreakUntil=0;reloadUntil=0;
  level=1;hp=100;baseHp=100;ammo=gun().clip;reserve=gun().clip*3;
  configureMap();
  player={...remoteStart[onlineRole]};
  remotePlayer={...remoteStart[onlineRole==='host'?'guest':'host'],hp:100,a:onlineRole==='host'?Math.PI:0};
  enemies=[];enemyBolts=[];lastShot=0;shotFx=null;keys={};
  launch();
  say('REMATCH — ROUND 1. GOOD LUCK!');
}
function enterOnlineGame(role){
  onlineRole=role;onlineReady=true;level=1;waveBreakUntil=0;reloadUntil=0;hp=100;baseHp=100;
  configureMap();player={...remoteStart[role]};ammo=gun().clip;reserve=gun().clip*3;
  enemies=[];enemyBolts=[];remotePlayer={...remoteStart[role==='host'?'guest':'host'],hp:100,a:role==='host'?Math.PI:0};
  launch();say('ONLINE 1V1 CONNECTED — FIGHT!');
}
function setupConnection(conn,role){
  if(peerConn&&peerConn!==conn){try{conn.close()}catch(e){}return}
  peerConn=conn;
  clearConnectionTimer();
  connectionTimer=setTimeout(()=>{
    if(!onlineReady&&peerConn===conn){
      onlineStatus('CONNECTION TIMED OUT — CHECK THE CODE AND TRY AGAIN.');
      try{conn.close()}catch(e){}
    }
  },20000);
  conn.on('open',()=>{
    clearConnectionTimer();
    onlineStatus('PLAYER CONNECTED — STARTING MATCH');
    if($('roomStatus'))$('roomStatus').textContent='Opponent connected!';
    enterOnlineGame(role);
    sendNet({type:'hello',role});
  });
  conn.on('data',data=>{
    if(!data||typeof data!=='object')return;
    if(data.type==='state'){
      if(!remotePlayer)remotePlayer={x:data.x,y:data.y,a:data.a,hp:data.hp};
      else{remotePlayer.x=data.x;remotePlayer.y=data.y;remotePlayer.a=data.a;remotePlayer.hp=data.hp}
    }else if(data.type==='hit'){
      hp=Math.max(0,hp-(Number(data.damage)||0));hud();
      if(hp<=0){sendNet({type:'won'});finishGameOver('DEFEATED IN ONLINE DUEL')}
    }else if(data.type==='rematch'){
      if(!playing)startOnlineRematch();
    }else if(data.type==='won'){
      finishGameOver('YOU WON THE ONLINE DUEL')
    }else if(data.type==='leave'){
      onlineReady=false;onlineStatus('OPPONENT LEFT THE MATCH');say('OPPONENT DISCONNECTED')
    }
  });
  conn.on('close',()=>{
    clearConnectionTimer();onlineReady=false;
    onlineStatus('CONNECTION CLOSED — CREATE A NEW ROOM OR JOIN AGAIN.');
    if(playing)say('ONLINE CONNECTION LOST');
  });
  conn.on('error',err=>peerErrorMessage(err,'join'));
}
function createRoomAttempt(attempt=0){
  const code=Math.random().toString(36).slice(2,10).toUpperCase();
  const peerId='ironfront-'+code.toLowerCase();
  onlineStatus('CONNECTING TO ONLINE SERVER...');
  try{peer=new Peer(peerId,peerConfig)}catch(err){onlineStatus('COULD NOT START ONLINE SERVICE. RELOAD THE PAGE.');return}
  const thisPeer=peer;
  thisPeer.on('open',()=>{
    if(peer!==thisPeer)return;
    clearConnectionTimer();
    roomCodeValue=code;$('roomCode').textContent=code;$('roomCreated').classList.remove('hidden');
    if(onlineMode==='5V5'){
      onlineRole='host';myPlayerId=thisPeer.id;
      const pos=teamSpawn(0);teamPlayers[myPlayerId]={id:myPlayerId,team:'BLUE',x:pos.x,y:pos.y,a:pos.a,hp:100};
      $('roomStatus').textContent='Share this code with 9 friends.';
      onlineStatus('5V5 ROOM READY — WAITING FOR 9 REAL PLAYERS (1/10).');
    }else{
      $('roomStatus').textContent='Room is online. Share this code with one friend.';
      onlineStatus('ROOM READY — SHARE THE CODE NOW.');
    }
  });
  thisPeer.on('connection',conn=>{
    if(peer!==thisPeer){try{conn.close()}catch(e){}return}
    if(onlineMode==='5V5'){
      if(teamConnections.size>=9){try{conn.close()}catch(e){}return}
      teamConnections.set(conn.peer,conn);
      conn.on('open',()=>{
        const index=teamConnections.size;
        const pos=teamSpawn(index);
        teamPlayers[conn.peer]={id:conn.peer,team:index<5?'BLUE':'RED',x:pos.x,y:pos.y,a:pos.a,hp:100};
        conn.send({type:'teamRoster',players:teamRoster()});
        teamBroadcast({type:'teamRoster',players:teamRoster()});
        onlineStatus('PLAYERS CONNECTED: '+(teamConnections.size+1)+'/10 — WAITING FOR '+(9-teamConnections.size)+' MORE');
        if($('roomStatus'))$('roomStatus').textContent='Players: '+(teamConnections.size+1)+'/10';
        if(teamConnections.size===9&&!teamStarted){
          const roster=teamRoster();teamStarted=true;
          teamBroadcast({type:'teamStart',players:roster});startTeamMatch(roster);
        }
      });
      conn.on('data',data=>hostTeamData(conn,data));
      conn.on('close',()=>{teamConnections.delete(conn.peer);if(!teamStarted){delete teamPlayers[conn.peer];teamBroadcast({type:'teamRoster',players:teamRoster()})}});
      conn.on('error',err=>peerErrorMessage(err,'host'));
    }else{
      if(peerConn){try{conn.close()}catch(e){}return}
      setupConnection(conn,'host');
    }
  });
  connectionTimer=setTimeout(()=>{if(peer===thisPeer&&!thisPeer.open&&!roomCodeValue){peer=null;try{thisPeer.destroy()}catch(e){}onlineStatus('ONLINE SERVER DID NOT RESPOND — TRY CREATE ROOM AGAIN.')}},18000);
  thisPeer.on('error',err=>{
    if(peer!==thisPeer)return;
    clearConnectionTimer();
    if(err&&err.type==='unavailable-id'&&attempt<4){
      try{thisPeer.destroy()}catch(e){}
      peer=null;createRoomAttempt(attempt+1);return;
    }
    peerErrorMessage(err,'host');
  });
}
async function createOnlineRoom(){
  if(typeof Peer==='undefined'){onlineStatus('ONLINE SERVICE FAILED TO LOAD — REFRESH THE PAGE.');return}
  if(!turnConfigured)onlineStatus('TRYING DIRECT CONNECTION. IF IT FAILS, LOAD TURN RELAY BELOW.');
  closeOnline();show('online');onlineStatus(turnConfigured?'PREPARING PRIVATE ROOM WITH TURN RELAY...':'TRYING DIRECT CONNECTION — TURN SETUP IS AVAILABLE BELOW.');
  $('roomCode').textContent='WAIT...';$('roomStatus').textContent='Waiting for online server confirmation...';
  $('roomCreated').classList.remove('hidden');
  createRoomAttempt();
}
async function joinOnlineRoom(){
  if(typeof Peer==='undefined'){onlineStatus('ONLINE SERVICE FAILED TO LOAD — REFRESH THE PAGE.');return}
  if(!turnConfigured)onlineStatus('TRYING DIRECT CONNECTION. IF IT FAILS, LOAD TURN RELAY BELOW.');
  const code=$('joinCode').value.trim().toUpperCase();
  if(!/^[A-Z0-9]{8}$/.test(code)){onlineStatus('ENTER THE FULL 8-CHARACTER ROOM CODE.');return}
  closeOnline();show('online');$('roomCreated').classList.add('hidden');
  onlineStatus('CONNECTING TO ROOM '+code+'...');
  try{peer=new Peer(peerConfig)}catch(err){onlineStatus('COULD NOT START ONLINE SERVICE. RELOAD THE PAGE.');return}
  const thisPeer=peer;
  thisPeer.on('open',()=>{
    if(peer!==thisPeer)return;
    clearConnectionTimer();
    onlineStatus('ROOM FOUND — CONNECTING TO PLAYER...');
    const conn=thisPeer.connect('ironfront-'+code.toLowerCase(),{reliable:true,metadata:{game:'IRON FRONT',mode:onlineMode}});
    if(onlineMode==='5V5'){
      peerConn=conn;onlineRole='guest';
      conn.on('open',()=>onlineStatus('CONNECTED — WAITING FOR 10 PLAYERS...'));
      conn.on('data',teamClientData);
      conn.on('close',()=>{onlineReady=false;onlineStatus('HOST CONNECTION CLOSED — RETURN TO MENU')});
      conn.on('error',err=>peerErrorMessage(err,'join'));
    }else setupConnection(conn,'guest');
  });
  connectionTimer=setTimeout(()=>{if(peer===thisPeer&&!thisPeer.open){peer=null;try{thisPeer.destroy()}catch(e){}onlineStatus('ONLINE SERVER DID NOT RESPOND — REFRESH AND TRY AGAIN.')}},18000);
  thisPeer.on('error',err=>{
    if(peer!==thisPeer)return;
    clearConnectionTimer();
    peerErrorMessage(err,'join');
  });
}
$('onlinePlay').onclick=()=>{onlineMode='DUEL';$('onlineTitle').textContent='1V1 PRIVATE MATCH';$('onlineIntro').textContent='Create a room and share its code, or enter your friend\'s code to join.';show('online');onlineStatus('CREATE A ROOM OR JOIN WITH A CODE')};
$('teamPlay').onclick=()=>{onlineMode='5V5';$('onlineTitle').textContent='5V5 TEAM MATCH';$('onlineIntro').textContent='Real players only: 5 BLUE vs 5 RED. The match starts when all 10 players join.';show('online');onlineStatus('CREATE OR JOIN A 5V5 ROOM')};
$('onlineBack').onclick=()=>{closeOnline();show('menu')};
$('createRoom').onclick=createOnlineRoom;
$('joinRoom').onclick=joinOnlineRoom;
$('loadTurn').onclick=loadTurnRelay;
$('copyRoomCode').onclick=()=>{if(!roomCodeValue)return;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(roomCodeValue).then(()=>onlineStatus('ROOM CODE COPIED — SEND IT TO YOUR FRIEND.')).catch(()=>onlineStatus('SELECT THE CODE AND COPY IT MANUALLY.'))}else onlineStatus('SELECT THE CODE AND COPY IT MANUALLY.')};

const guns=[{name:'PISTOL',cost:0,damage:25,clip:12,rate:330},{name:'AK-47',cost:650,damage:22,clip:30,rate:125},{name:'DESERT EAGLE',cost:900,damage:60,clip:7,rate:470},{name:'MACHINE GUN',cost:1600,damage:18,clip:100,rate:45}];
const vests=[{name:'LIGHT VEST',cost:300,protection:15},{name:'REINFORCED VEST',cost:700,protection:30},{name:'HEAVY ARMOR',cost:1200,protection:50}];
let owned=['PISTOL'];
function buildMap(layout){
  const size=24;
  const g=Array.from({length:size},(_,y)=>Array.from({length:size},(_,x)=>(x===0||y===0||x===size-1||y===size-1)?'1':'0'));
  const block=(x1,y1,x2,y2,material='1')=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)g[y][x]=material};
  const open=(x,y)=>{g[y][x]='0'};
  if(layout==='ATTACK'){
    block(4,3,8,7,'1');g[7][6]='0';
    block(15,3,20,7,'2');g[7][17]='0';
    block(4,16,8,20,'2');g[16][6]='0';
    block(15,16,20,20,'3');g[16][17]='0';
    block(2,5,3,7,'3');g[7][2]='0';block(20,5,21,7,'1');g[7][20]='0';
    block(2,16,3,18,'1');g[17][3]='0';block(20,16,21,18,'2');g[17][20]='0';
    block(9,8,9,9,'2');block(14,8,14,9,'3');block(9,14,10,14,'1');
    block(13,14,14,14,'2');block(6,10,7,10,'3');block(17,12,18,12,'1');block(11,4,12,5,'3');
    for(let x=1;x<23;x++){open(x,11);open(x,12)}
    for(let y=1;y<23;y++){open(11,y);open(12,y)}
    block(4,3,8,7,'1');g[7][6]='0';block(15,3,20,7,'2');g[7][17]='0';
    block(4,16,8,20,'2');g[16][6]='0';block(15,16,20,20,'3');g[16][17]='0';
    block(8,9,9,9,'2');block(14,14,15,14,'3');
  }else if(layout==='ADVANCE'){
    // Open desert highway with staggered ruins and rock-cut passages
    block(3,3,7,7,'3');block(11,2,13,6,'2');block(17,3,21,7,'1');
    block(2,16,6,20,'2');block(9,17,13,20,'3');block(17,16,21,20,'2');
    block(8,8,9,9,'3');block(14,14,15,15,'1');
    block(5,9,6,9,'2');block(17,9,19,9,'3');
    for(let x=1;x<23;x++){open(x,10);open(x,11);open(x,12);open(x,13)}
    // Narrow side cuts around the abandoned structures
    open(7,6);open(13,6);open(17,7);open(6,16);open(13,17);open(17,16);
  }else if(layout==='DEFENSE'){
    // Fortified headquarters on the east, with a protected entrance
    block(16,7,22,17,'1');open(16,11);open(16,12);
    block(18,8,19,10,'2');block(20,14,21,15,'2');
    block(17,8,17,9,'3');block(17,15,17,16,'3');
    block(3,3,7,6,'2');open(5,6);
    block(3,17,7,20,'3');open(5,17);
    block(9,3,12,5,'1');open(10,5);
    block(9,18,12,20,'2');open(10,18);
    block(7,9,8,10,'3');block(7,14,8,14,'1');
    for(let x=1;x<16;x++){open(x,11);open(x,12)}
  }else if(layout==='SURVIVAL'){
    // Overgrown woodland with ruined shelters and broken stone walls
    block(5,4,7,6,'3');open(6,6);
    block(16,3,19,6,'1');open(17,6);
    block(4,16,8,19,'2');open(6,16);
    block(16,16,19,20,'3');open(17,16);
    block(10,5,11,7,'2');block(12,16,13,18,'1');
    block(8,10,9,10,'3');block(14,13,15,13,'2');
    block(3,9,4,9,'1');block(19,10,20,10,'3');
    for(let x=1;x<23;x++){if(x!==5&&x!==18){open(x,11);open(x,12)}}
    for(let y=1;y<23;y++){open(11,y);open(12,y)}
  }else if(layout==='BATTLE ROYALE'){
    // Dense town block with narrow alleys, courtyards and storefront rows
    block(3,3,7,7,'1');open(5,7);
    block(9,2,14,6,'2');open(11,6);
    block(17,3,21,7,'3');open(19,7);
    block(3,16,7,20,'2');open(5,16);
    block(9,17,14,21,'3');open(11,17);
    block(17,16,21,20,'1');open(19,16);
    block(2,8,4,9,'3');block(19,9,21,10,'2');
    block(7,9,8,10,'1');block(15,13,16,14,'2');
    block(8,14,9,15,'3');block(14,8,15,9,'1');
    for(let x=1;x<23;x++){open(x,11);open(x,12)}
    for(let y=1;y<23;y++){open(11,y);open(12,y)}
  }
  return g.map(row=>row.join(''));
}
let map=buildMap('ATTACK');
let currentTheme={label:'INDUSTRIAL YARD',sky:['#142533','#506d78','#a9b5a7'],haze:'#c0c3ae66',skyline:'#263c3c',road:[65,72,68],ground:[117,119,105],grass:[69,83,58],roadAxis:'cross'};
let scenery=[];
const spawnPoints={'ATTACK':{x:2.5,y:11.5,a:0},'ADVANCE':{x:2.5,y:11.5,a:0},'DEFENSE':{x:12.5,y:11.5,a:0},'SURVIVAL':{x:2.5,y:11.5,a:0},'BATTLE ROYALE':{x:11.5,y:21.5,a:-Math.PI/2}};
const gun=()=>guns.find(g=>g.name===weapon);
function show(id){['menu','online','shop','game','bus','gameover'].forEach(x=>$(x).classList.toggle('hidden',x!==id));if(id==='gameover'){$('gameover').classList.remove('hidden');$('gameover').scrollIntoView({block:'center',behavior:'instant'})}}
function say(s){$('message').textContent=s}
function hud(){
  $('coins').textContent=coins;$('gameCoins').textContent=coins;$('level').textContent=level;
  $('hp').textContent=Math.max(0,Math.ceil(hp));$('ammo').textContent=ammo+'/∞';
  if($('enemyCount'))$('enemyCount').textContent=enemies.length;
  if($('waveHeadline'))$('waveHeadline').textContent='WAVE '+level;
  if($('waveDetail')){
    const seconds=waveBreakUntil?Math.max(0,Math.ceil((waveBreakUntil-performance.now())/1000)):0;
    $('waveDetail').textContent=waveBreakUntil?'NEXT WAVE IN '+seconds+'s':enemies.length+' HOSTILES REMAINING';
    $('waveStatus').classList.toggle('intermission',!!waveBreakUntil);
  }
}
function wall(x,y){let a=Math.floor(x),b=Math.floor(y);return b<0||b>=map.length||a<0||a>=map[0].length||map[b][a]!=='0'}
const sceneryByMode={
  'ATTACK':[
    {x:2.7,y:8.6,type:'lamp'},{x:21.2,y:8.7,type:'lamp'},{x:3.3,y:14.5,type:'lamp'},{x:20.7,y:14.2,type:'lamp'},
    {x:9.8,y:3.2,type:'tree'},{x:13.4,y:3.3,type:'tree'},{x:9.7,y:20.8,type:'tree'},{x:13.7,y:20.8,type:'tree'},
    {x:3.4,y:10.1,type:'barrel'},{x:3.8,y:10.8,type:'barrel'},{x:20.4,y:10.1,type:'barrel'},{x:20.1,y:10.8,type:'barrel'},
    {x:9.3,y:10.2,type:'crate'},{x:9.9,y:10.2,type:'crate'},{x:14.1,y:13.7,type:'crate'},{x:15,y:13.7,type:'crate'},
    {x:7.1,y:9.7,type:'barrier'},{x:16.8,y:14.8,type:'barrier'},{x:5.2,y:10,type:'barrier'},{x:18.7,y:13.6,type:'barrier'},
    {x:2.8,y:4.2,type:'bush'},{x:3.4,y:4.3,type:'bush'},{x:20.3,y:4.3,type:'bush'},{x:21,y:4.2,type:'bush'}
  ],
  'ADVANCE':[
    {x:2.8,y:8.5,type:'cactus'},{x:5,y:8.6,type:'rock'},{x:8,y:14.8,type:'rock'},{x:10,y:8.4,type:'sandbag'},
    {x:14,y:15.2,type:'rock'},{x:16,y:8.6,type:'cactus'},{x:20.8,y:8.4,type:'cactus'},
    {x:3,y:14.8,type:'barrel'},{x:6.8,y:14.7,type:'barrier'},{x:12,y:15.2,type:'barrel'},
    {x:18.5,y:14.8,type:'sandbag'},{x:21,y:14.6,type:'rock'},{x:8.8,y:3.2,type:'bush'},{x:15,y:20.8,type:'bush'}
  ],
  'DEFENSE':[
    {x:14.8,y:8.2,type:'sandbag'},{x:14.8,y:9.2,type:'sandbag'},{x:15,y:14.2,type:'sandbag'},
    {x:18.4,y:11,type:'crate'},{x:20.4,y:12.8,type:'barrel'},{x:17.5,y:14.2,type:'barrier'},
    {x:2.3,y:8.2,type:'lamp'},{x:13.8,y:8.1,type:'lamp'},{x:13.8,y:15.1,type:'lamp'},
    {x:8.5,y:7.2,type:'crate'},{x:8.5,y:16.3,type:'crate'},{x:5,y:9.2,type:'barrier'},{x:5,y:14.5,type:'barrier'}
  ],
  'SURVIVAL':[
    {x:3.4,y:7.8,type:'tree'},{x:5.1,y:8.2,type:'tree'},{x:7.8,y:3.4,type:'tree'},{x:9,y:4.1,type:'bush'},
    {x:14.5,y:3.2,type:'tree'},{x:20.2,y:8.3,type:'tree'},{x:21,y:9.4,type:'bush'},
    {x:3.1,y:15.2,type:'tree'},{x:8.8,y:17.4,type:'tree'},{x:9.5,y:19,type:'bush'},
    {x:14.2,y:20.4,type:'tree'},{x:20.5,y:15.5,type:'tree'},{x:21,y:19.6,type:'tree'},
    {x:4,y:11,type:'rock'},{x:8.5,y:12.9,type:'stump'},{x:15.1,y:10.4,type:'rock'},{x:17,y:13.8,type:'stump'},
    {x:6,y:13.4,type:'bush'},{x:18.8,y:5.3,type:'bush'},{x:12.8,y:8.4,type:'rock'}
  ],
  'BATTLE ROYALE':[
    {x:2.6,y:9.6,type:'lamp'},{x:7.8,y:8.6,type:'crate'},{x:8.8,y:13.8,type:'barrel'},
    {x:14.9,y:10.2,type:'barrel'},{x:15.8,y:15,type:'crate'},{x:21.1,y:9.6,type:'lamp'},
    {x:2.6,y:14.5,type:'barrier'},{x:7.6,y:15.3,type:'barrier'},{x:16.1,y:8.7,type:'barrier'},
    {x:20.9,y:14.6,type:'lamp'},{x:8.3,y:3.1,type:'bush'},{x:15.7,y:20.8,type:'bush'},
    {x:2.5,y:20.5,type:'barrel'},{x:21,y:20.5,type:'crate'}
  ]
};
const themes={
  'ATTACK':{label:'INDUSTRIAL YARD',sky:['#142533','#506d78','#a9b5a7'],haze:'#c0c3ae66',skyline:'#263c3c',road:[65,72,68],ground:[117,119,105],grass:[69,83,58],roadAxis:'cross'},
  'ADVANCE':{label:'DUST ROAD',sky:['#263b4a','#8c785f','#d2b98d'],haze:'#e4c9a066',skyline:'#685640',road:[104,91,73],ground:[159,137,103],grass:[111,117,76],roadAxis:'horizontal'},
  'DEFENSE':{label:'FORTIFIED OUTPOST',sky:['#101f27','#526b67','#a6b49d'],haze:'#bdc6a766',skyline:'#33483e',road:[61,72,65],ground:[105,116,94],grass:[73,94,65],roadAxis:'horizontal'},
  'SURVIVAL':{label:'OVERGROWN WOODLAND',sky:['#14282d','#607b70','#b0bda0'],haze:'#c8d1ad66',skyline:'#263e2c',road:[81,89,69],ground:[96,112,78],grass:[55,89,52],roadAxis:'none'},
  'BATTLE ROYALE':{label:'ABANDONED TOWN',sky:['#192838','#72818a','#c1b89f'],haze:'#d1c8b266',skyline:'#3b4648',road:[73,79,77],ground:[124,119,105],grass:[82,97,69],roadAxis:'cross'}
};
function configureMap(){
  map=buildMap(mode==='DUEL'||mode==='5V5'?'ATTACK':mode);currentTheme=themes[mode]||themes.ATTACK;
  scenery=(sceneryByMode[mode]||sceneryByMode.ATTACK).filter(p=>!wall(p.x,p.y));
}
function free(x,y,r=.18){return !wall(x-r,y-r)&&!wall(x+r,y-r)&&!wall(x-r,y+r)&&!wall(x+r,y+r)}
function blocked(x1,y1,x2,y2){let d=Math.hypot(x2-x1,y2-y1),n=Math.ceil(d*12);for(let i=1;i<n;i++){let t=i/n;if(wall(x1+(x2-x1)*t,y1+(y2-y1)*t))return true}return false}
function openShop(type){$('shopTitle').textContent=type==='WEAPON'?'WEAPON ARMORY':'ARMOR SHOP';let arr=type==='WEAPON'?guns:vests;$('items').innerHTML='';arr.forEach(it=>{let el=document.createElement('article');el.className='item';let desc=type==='WEAPON'?it.damage+' damage · '+it.clip+' round magazine · 100% durability':'Damage reduction: '+it.protection+'%';let has=type==='WEAPON'?owned.includes(it.name):armor===it.protection;el.innerHTML='<h3>'+it.name+'</h3><p>'+desc+'</p><div class="price">'+(it.cost===0?'FREE':it.cost+' CREDITS')+'</div>';let b=document.createElement('button');b.textContent=has?'EQUIPPED':type==='WEAPON'?'BUY / EQUIP':'BUY / EQUIP';b.onclick=()=>{if(has){say('Already equipped.');return}if(coins<it.cost){say('NOT ENOUGH CREDITS');return}coins-=it.cost;if(type==='WEAPON'){owned.push(it.name);weapon=it.name;ammo=it.clip;reserve=it.clip*3}else armor=it.protection;hud();say(it.name+' EQUIPPED');openShop(type)};el.append(b);$('items').append(el)});show('shop');hud()}
$('weapons').onclick=()=>openShop('WEAPON');$('armor').onclick=()=>openShop('ARMOR');$('back').onclick=()=>show('menu');
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));say('SELECTED OPERATION: '+mode)});
function waveSize(wave=level){
  if(mode==='DUEL'||mode==='5V5')return 0;
  const base={ATTACK:5,ADVANCE:5,DEFENSE:6,SURVIVAL:8,'BATTLE ROYALE':12}[mode]||5;
  return Math.min(22,base+Math.floor((wave-1)*1.45));
}
function spawn(n){
  enemies=[];enemyBolts=[];
  const spots=[];
  for(let y=1;y<map.length-1;y++)for(let x=1;x<map[0].length-1;x++){
    const sx=x+.5,sy=y+.5,d=Math.hypot(sx-player.x,sy-player.y);
    if(!wall(sx,sy)&&d>2.3&&d<16&&!(mode==='DEFENSE'&&sx>16.2)&&!blocked(player.x,player.y,sx,sy))spots.push({x:sx,y:sy});
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
    const boss=level>1&&level%3===0&&i===0,hpValue=boss?260+level*38:55+level*12;
    enemies.push({x:p.x,y:p.y,hp:hpValue,max:hpValue,boss,speed:boss?.48:Math.min(1.25,.65+level*.025),hit:0,nextShot:performance.now()+900+Math.random()*1100});
  });
}
function beginNextWave(){
  if(waveBreakUntil||!playing)return;
  waveBreakUntil=performance.now()+4500;
  
  say(mode==='DUEL'?'ROUND '+level+' WON — NEXT OPPONENT INCOMING':'WAVE '+level+' CLEARED — PREPARE FOR THE NEXT WAVE');
  hud();
}
function advanceWave(now){
  if(!waveBreakUntil||now<waveBreakUntil)return;
  waveBreakUntil=0;
  level++;
  const count=waveSize(level);
  spawn(count);
  // A small reserve refill rewards completing a wave without filling the magazine automatically.
  reserve+=Math.max(4,Math.ceil(gun().clip*.35));
  say(mode==='DUEL'?'ROUND '+level+' — ONE OPPONENT':'WAVE '+level+' — '+count+' HOSTILES INCOMING');
  hud();
}
function start(){if(mode==='5V5'){onlineMode='5V5';show('online');onlineStatus('CREATE OR JOIN A ROOM — 10 REAL PLAYERS REQUIRED');return}level=1;waveBreakUntil=0;reloadUntil=0;hp=100;baseHp=100;configureMap();player={...(spawnPoints[mode]||spawnPoints.ATTACK)};ammo=gun().clip;reserve=gun().clip*3;bus=mode==='BATTLE ROYALE';if(bus){show('bus');return}spawn(waveSize(1));launch()}
function launch(){bus=false;playing=true;paused=false;show('game');$('modeLabel').textContent=(mode==='DUEL'?'1V1 DUEL':mode==='5V5'?'5V5 ONLINE':mode)+' / '+currentTheme.label;last=performance.now();hud();say(mode==='DUEL'?'1V1 DUEL — DEFEAT THE OPPONENT':mode==='5V5'?'5V5 ONLINE — BLUE VS RED':'MISSION LIVE — ELIMINATE HOSTILES');requestAnimationFrame(loop)}
$('play').onclick=()=>{if(mode==='DUEL'){show('online');onlineStatus('CREATE A ROOM OR JOIN WITH A CODE')}else start()};$('jump').onclick=()=>{level=1;waveBreakUntil=0;spawn(waveSize(1));launch();say('BATTLE ROYALE — WAVE 1: SURVIVE THE DROP')};
$('quit').onclick=()=>{playing=false;if(mode==='DUEL'||mode==='5V5'){sendNet({type:'leave'});closeOnline()}show('menu');say('MISSION ENDED')};
$('retryGame').onclick=()=>{if(mode==='5V5'){closeOnline();onlineMode='5V5';show('online');onlineStatus('CREATE A NEW 5V5 ROOM TO PLAY AGAIN.');return}if(mode==='DUEL'){if(!onlineReady||!peerConn||!peerConn.open){onlineStatus('CONNECTION LOST — CREATE A NEW ROOM TO PLAY AGAIN.');closeOnline();show('online');return}sendNet({type:'rematch'});startOnlineRematch()}else start()};$('gameOverMenu').onclick=()=>{playing=false;paused=false;if(mode==='DUEL'||mode==='5V5'){sendNet({type:'leave'});closeOnline()}show('menu');say('MISSION ENDED — SELECT A NEW OPERATION')};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'RESUME':'PAUSE';if(!paused){last=performance.now();requestAnimationFrame(loop)}};
function reload(){
  const now=performance.now();
  if(!playing||reloadUntil>now||ammo>=gun().clip)return;
  reloadUntil=now+5000;
  say('RELOADING — 5 SECONDS');
}
function finishReload(now){
  if(reloadUntil&&now>=reloadUntil){
    ammo=gun().clip;reloadUntil=0;hud();say('RELOAD COMPLETE — AMMO READY');
  }
}
$('reload').onclick=reload;

window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='r')reload();if(e.key==='Escape'&&playing)$('pause').click()});window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
let lastMouseX=null;canvas.addEventListener('pointermove',e=>{let r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*LOGICAL_WIDTH/r.width;if(lastMouseX!==null)player.a+=(x-lastMouseX)/LOGICAL_WIDTH*2.1;lastMouseX=x});canvas.addEventListener('pointerleave',()=>lastMouseX=null);
canvas.addEventListener('pointerdown',e=>{if(e.button===0||e.button===2){e.preventDefault();canvas.setPointerCapture(e.pointerId);mouseHeld=true;fire()}});
window.addEventListener('pointerup',()=>mouseHeld=false);
window.addEventListener('pointercancel',()=>mouseHeld=false);
window.addEventListener('blur',()=>mouseHeld=false);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b))}
function fire(){
  const now=performance.now();
  if(!playing||paused||reloadUntil>now||now-lastShot<gun().rate)return;
  let target=null,best=Infinity;
  // Manual shot only: the crosshair direction must intersect the enemy's small on-screen hit area.
  enemies.forEach(e=>{
    const d=Math.hypot(e.x-player.x,e.y-player.y),a=Math.atan2(e.y-player.y,e.x-player.x),diff=Math.abs(angleDiff(a,player.a));
    const hitAngle=Math.atan2(.07,d);
    if(d<14&&diff<=hitAngle&&diff<best&&!blocked(player.x,player.y,e.x,e.y)){best=diff;target=e}
  });
  if(ammo<=0){
    if(now-emptyMessageAt>1200){say('MAGAZINE EMPTY — PRESS R TO RELOAD');emptyMessageAt=now}
    return;
  }
  lastShot=now;ammo--;muzzleFlashUntil=now+95;cameraKick=Math.min(.28,cameraKick+.16);
  shotFx={until:now+115,target:target?{x:target.x,y:target.y}:null};
  if(mode==='DUEL'&&onlineReady&&remotePlayer){
    const d=Math.hypot(remotePlayer.x-player.x,remotePlayer.y-player.y),a=Math.atan2(remotePlayer.y-player.y,remotePlayer.x-player.x),diff=Math.abs(angleDiff(a,player.a));
    if(d<14&&diff<=Math.atan2(.20,d)&&!blocked(player.x,player.y,remotePlayer.x,remotePlayer.y)){sendNet({type:'hit',damage:gun().damage});say('HIT — '+gun().damage+' DAMAGE');}
    else say('SHOT FIRED — NO TARGET HIT');
  }else if(mode==='5V5'&&onlineReady){
    let hit=null,best=Infinity;
    Object.values(teamPlayers).forEach(p=>{
      if(p.id===myPlayerId||p.team===myTeam||p.hp<=0)return;
      const d=Math.hypot(p.x-player.x,p.y-player.y),a=Math.atan2(p.y-player.y,p.x-player.x),diff=Math.abs(angleDiff(a,player.a));
      if(d<14&&diff<=Math.atan2(.20,d)&&diff<best&&!blocked(player.x,player.y,p.x,p.y)){best=diff;hit=p}
    });
    if(hit){if(onlineRole==='host')teamDamage(myPlayerId,hit.id,gun().damage);else sendNet({type:'hit',target:hit.id,damage:gun().damage});say('HIT — ENEMY TEAM')}else say('SHOT FIRED — NO ENEMY HIT');
  }else if(target){
    target.hp-=gun().damage;say('HIT — '+gun().damage+' DAMAGE');
    if(target.hp<=0){
      coins+=target.boss?500:100;enemies=enemies.filter(e=>e!==target);
      say(target.boss?'BOSS DEFEATED +500 CREDITS':'ENEMY DEFEATED +100 CREDITS');
      if(!enemies.length){hp=Math.min(100,hp+15);beginNextWave()}
    }
  }else{say('SHOT FIRED — NO TARGET HIT')}
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
  sky.addColorStop(0,currentTheme.sky[0]);sky.addColorStop(.62,currentTheme.sky[1]);sky.addColorStop(1,currentTheme.sky[2]);
  ctx.fillStyle=sky;ctx.fillRect(0,0,900,horizon+2);
  // Distant atmospheric haze and ground
  const haze=ctx.createLinearGradient(0,horizon-15,0,horizon+50);
  haze.addColorStop(0,currentTheme.haze);haze.addColorStop(1,'#59665300');
  ctx.fillStyle=haze;ctx.fillRect(0,horizon-15,900,70);
  // Soft light bloom and distance haze make the map feel less flat.
  drawAtmosphere(now,horizon);
  // A different skyline silhouette for each operation zone
  ctx.globalAlpha=.55;ctx.fillStyle=currentTheme.skyline;
  if(mode==='ADVANCE'){
    ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(0,horizon-25);ctx.quadraticCurveTo(120,horizon-68,250,horizon-26);ctx.quadraticCurveTo(385,horizon-88,520,horizon-30);ctx.quadraticCurveTo(700,horizon-72,900,horizon-23);ctx.lineTo(900,horizon);ctx.closePath();ctx.fill();
    ctx.fillStyle='#b59a70';ctx.globalAlpha=.35;
    for(let i=0;i<8;i++){const x=i*128-20;ctx.beginPath();ctx.moveTo(x,horizon);ctx.lineTo(x+70,horizon-18-(i%3)*12);ctx.lineTo(x+135,horizon);ctx.fill()}
  }else if(mode==='SURVIVAL'){
    for(let i=0;i<23;i++){const x=i*43-12,ht=25+(i*29%48);ctx.fillStyle=i%2?'#294332':'#20392c';ctx.beginPath();ctx.moveTo(x-20,horizon);ctx.lineTo(x,horizon-ht);ctx.lineTo(x+23,horizon);ctx.closePath();ctx.fill();ctx.fillRect(x-3,horizon-ht*.3,6,ht*.3)}
  }else if(mode==='DEFENSE'){
    ctx.fillRect(0,horizon-17,900,17);
    for(let i=0;i<6;i++){const x=35+i*160;ctx.fillRect(x,horizon-63,18,63);ctx.fillRect(x-10,horizon-66,38,8);ctx.fillStyle='#172a27';ctx.fillRect(x+4,horizon-52,10,9);ctx.fillStyle=currentTheme.skyline}
    ctx.fillStyle='#1a2d29';ctx.fillRect(340,horizon-42,220,42);
  }else if(mode==='BATTLE ROYALE'){
    const roofs=[[18,50],[95,83],[186,40],[280,66],[384,94],[505,52],[618,77],[740,47],[835,85]];
    roofs.forEach((r,i)=>{ctx.fillRect(r[0],horizon-r[1],48+(i%3)*13,r[1]);ctx.fillStyle='#182a2d';ctx.fillRect(r[0]+8,horizon-r[1]+14,9,12);ctx.fillRect(r[0]+27,horizon-r[1]+14,9,12);ctx.fillStyle=currentTheme.skyline});
  }else{
    ctx.beginPath();ctx.moveTo(0,horizon-7);ctx.lineTo(0,horizon-39);ctx.lineTo(48,horizon-39);ctx.lineTo(48,horizon-54);ctx.lineTo(112,horizon-54);ctx.lineTo(112,horizon-22);ctx.lineTo(168,horizon-22);ctx.lineTo(168,horizon-66);ctx.lineTo(258,horizon-66);ctx.lineTo(258,horizon-25);ctx.lineTo(324,horizon-25);ctx.lineTo(324,horizon-43);ctx.lineTo(388,horizon-43);ctx.lineTo(388,horizon-12);ctx.lineTo(900,horizon-12);ctx.closePath();ctx.fill();
    ctx.fillStyle='#172b2c';ctx.globalAlpha=.34;
    for(let i=0;i<18;i++){const x=i*57+12,ht=14+(i*17%33);ctx.fillRect(x,horizon-ht,5,ht);ctx.beginPath();ctx.arc(x+2,horizon-ht,11,Math.PI,Math.PI*2);ctx.fill()}
  }
  ctx.globalAlpha=1;
  // Perspective ground is sampled from the compound's actual roads and yards
  for(let y=Math.ceil(horizon+3);y<520;y+=4){
    const dist=Math.min(22,390*.58/(y-horizon));
    for(let x=0;x<900;x+=5){
      const angle=player.a+(x/900-.5)*1.25,wx=player.x+Math.cos(angle)*dist,wy=player.y+Math.sin(angle)*dist;
      const road=currentTheme.roadAxis==='none'?false:currentTheme.roadAxis==='horizontal'?Math.abs(wy-11.5)<1.35:(Math.abs(wy-11.5)<1.2||Math.abs(wx-11.5)<1.2);
      const grass=((Math.floor(wx*1.7)+Math.floor(wy*1.3)*3)%13===0)&&!road;
      let base=road?currentTheme.road:grass?currentTheme.grass:currentTheme.ground;
      const fx=wx-Math.floor(wx),fy=wy-Math.floor(wy);
      const seam=!road&&(fx<.035||fy<.035);
      const grit=(Math.floor(wx*13+wy*31)%7)*1.6;
      const shade=Math.max(.34,1-dist*.033);
      const variation=seam?.65:1;
      const r=Math.max(0,Math.min(255,(base[0]+grit)*shade*variation));
      const g=Math.max(0,Math.min(255,(base[1]+grit)*shade*variation));
      const b=Math.max(0,Math.min(255,(base[2]+grit)*shade*variation));
      ctx.fillStyle='rgb('+Math.floor(r)+','+Math.floor(g)+','+Math.floor(b)+')';ctx.fillRect(x,y,5,4);
      // Broken yellow road markings at the broad crossroad
      const laneCenter=currentTheme.roadAxis==='none'?99:currentTheme.roadAxis==='horizontal'?Math.abs(wy-11.5):Math.min(Math.abs(wy-11.5),Math.abs(wx-11.5));
      if(road&&laneCenter<.045&&Math.abs((wx%3)-1.5)<.65&&dist<13){
        ctx.fillStyle=mode==='ADVANCE'?'#d4bc82':'#d8c77d';ctx.globalAlpha=Math.max(.15,.65-dist*.035);ctx.fillRect(x,y,5,3);ctx.globalAlpha=1;
      }
    }
  }
  // Ray-cast walls with material-specific surface details
  const depth=new Float32Array(900);
  for(let x=0;x<900;x+=1){
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
    depth[x]=corrected;
  }
  // World props: crates, barrels, street lamps, shrubs and road barriers
  [...scenery].sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y)).forEach(p=>{
    const dx=p.x-player.x,dy=p.y-player.y,d=Math.hypot(dx,dy);
    let ang=Math.atan2(dy,dx)-player.a;ang=Math.atan2(Math.sin(ang),Math.cos(ang));
    if(Math.abs(ang)>.67||d<.35)return;
    const sx=450+ang/1.25*900,ix=Math.max(0,Math.min(899,Math.floor(sx)));
    if(sx<0||sx>=900||d>depth[ix]||blocked(player.x,player.y,p.x,p.y))return;
    const scale=Math.min(150,270/d),base=horizon+195/d;
    ctx.save();
    if(p.type==='crate'){
      const w=scale*.56,h=scale*.58,x=sx-w/2,y=base-h;
      ctx.fillStyle='#263b2c';ctx.fillRect(x+5,y+5,w,h);
      ctx.fillStyle='#8b7652';ctx.fillRect(x,y,w*.82,h);
      ctx.fillStyle='#b19a6a';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w*.18,y-7);ctx.lineTo(x+w,y-7);ctx.lineTo(x+w*.82,y);ctx.closePath();ctx.fill();
      ctx.fillStyle='#5e5039';ctx.beginPath();ctx.moveTo(x+w*.82,y);ctx.lineTo(x+w,y-7);ctx.lineTo(x+w,y+h-7);ctx.lineTo(x+w*.82,y+h);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#594a34';ctx.lineWidth=Math.max(1,scale*.018);
      for(let k=1;k<4;k++){ctx.beginPath();ctx.moveTo(x+2,y+h*k/4);ctx.lineTo(x+w*.8,y+h*k/4);ctx.stroke()}
      ctx.fillStyle='#d5c18b';ctx.fillRect(x+w*.12,y+h*.12,w*.08,h*.76);
    }else if(p.type==='barrel'){
      const w=scale*.32,h=scale*.62,x=sx-w/2,y=base-h;
      ctx.fillStyle='#17221c';ctx.beginPath();ctx.ellipse(sx,base,w*.55,h*.09,0,0,Math.PI*2);ctx.fill();
      const g=ctx.createLinearGradient(x,y,x+w,y);g.addColorStop(0,'#273f3b');g.addColorStop(.35,'#668078');g.addColorStop(.68,'#344a43');g.addColorStop(1,'#15251f');
      ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
      ctx.strokeStyle='#a0a99a';ctx.lineWidth=Math.max(1,scale*.018);
      [0.22,.76].forEach(v=>{ctx.beginPath();ctx.ellipse(sx,y+h*v,w*.5,h*.045,0,0,Math.PI*2);ctx.stroke()});
      ctx.fillStyle='#17231d';ctx.beginPath();ctx.ellipse(sx,y,w*.5,h*.09,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#91a18f';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(sx,y,w*.38,h*.055,0,0,Math.PI*2);ctx.stroke();
    }else if(p.type==='lamp'){
      const h=scale*1.85,x=sx,y=base;
      ctx.strokeStyle='#17201c';ctx.lineWidth=Math.max(2,scale*.055);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-h);ctx.stroke();
      ctx.strokeStyle='#748174';ctx.lineWidth=Math.max(1,scale*.018);ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x-2,y-h);ctx.stroke();
      ctx.fillStyle='#202c25';ctx.fillRect(x-scale*.17,y-h,scale*.36,scale*.1);
      ctx.fillStyle='#e0d3a0';ctx.globalAlpha=.75;ctx.fillRect(x-scale*.12,y-h+2,scale*.25,scale*.045);ctx.globalAlpha=1;
      ctx.fillStyle='#d5ca9d22';ctx.beginPath();ctx.arc(x,y-h,scale*.34,0,Math.PI*2);ctx.fill();
    }else if(p.type==='tree'||p.type==='bush'){
      const h=scale*(p.type==='tree'?1.3:.6),r=scale*(p.type==='tree'?.3:.34),y=base-h;
      ctx.fillStyle='#10170f66';ctx.beginPath();ctx.ellipse(sx,base,r*1.2,Math.max(2,scale*.07),0,0,Math.PI*2);ctx.fill();
      if(p.type==='tree'){ctx.fillStyle='#554937';ctx.fillRect(sx-scale*.07,y+h*.45,scale*.14,h*.55)}
      const greens=p.type==='tree'?['#263d2b','#3d5936','#587347']:['#344b2d','#53683b','#65794a'];
      [[-0.18,.35],[.12,.22],[0,.48],[.22,.47]].forEach((o,i)=>{ctx.fillStyle=greens[i%greens.length];ctx.beginPath();ctx.arc(sx+o[0]*scale,y+o[1]*h,r*(i===2?1.05:.8),0,Math.PI*2);ctx.fill()});
      ctx.fillStyle='#9db27b33';ctx.beginPath();ctx.arc(sx-r*.25,y+h*.28,r*.38,0,Math.PI*2);ctx.fill();
    }else if(p.type==='rock'){
      const w=scale*.68,h=scale*.38,x=sx-w/2,y=base-h;
      ctx.fillStyle='#252d25';ctx.beginPath();ctx.ellipse(sx,base,w*.7,h*.2,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#555d4e';ctx.beginPath();ctx.moveTo(x+w*.08,base);ctx.lineTo(x+w*.17,y+h*.42);ctx.lineTo(x+w*.43,y);ctx.lineTo(x+w*.72,y+h*.18);ctx.lineTo(x+w*.96,base);ctx.closePath();ctx.fill();
      ctx.fillStyle='#8d927a';ctx.beginPath();ctx.moveTo(x+w*.17,y+h*.42);ctx.lineTo(x+w*.43,y);ctx.lineTo(x+w*.55,y+h*.42);ctx.closePath();ctx.fill();
    }else if(p.type==='cactus'){
      const h=scale*.92,w=scale*.34,x=sx-w/2,y=base-h;
      ctx.strokeStyle='#476b43';ctx.lineWidth=Math.max(4,scale*.12);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(sx,base);ctx.lineTo(sx,y);ctx.moveTo(sx,y+h*.5);ctx.lineTo(sx-w*.55,y+h*.5);ctx.lineTo(sx-w*.55,y+h*.28);ctx.moveTo(sx,y+h*.65);ctx.lineTo(sx+w*.55,y+h*.65);ctx.lineTo(sx+w*.55,y+h*.42);ctx.stroke();
      ctx.strokeStyle='#a4b17a';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(sx-2,y+5);ctx.lineTo(sx-2,base-4);ctx.stroke();
    }else if(p.type==='sandbag'){
      const w=scale*.88,h=scale*.42,x=sx-w/2,y=base-h;
      ctx.fillStyle='#192019';ctx.beginPath();ctx.ellipse(sx,base,w*.62,scale*.08,0,0,Math.PI*2);ctx.fill();
      for(let row=0;row<3;row++)for(let col=0;col<3;col++){
        const bw=w*.34,bh=h*.28,bx=x+col*bw+(row%2?bw*.25:0),by=y+(2-row)*bh;
        ctx.fillStyle=['#9b906b','#b2a47b','#817a5c'][(row+col)%3];
        ctx.beginPath();ctx.ellipse(bx+bw*.5,by+bh*.5,bw*.52,bh*.55,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#5d5b43';ctx.lineWidth=1;ctx.stroke();
      }
    }else if(p.type==='stump'){
      const h=scale*.42,w=scale*.4,x=sx-w/2,y=base-h;
      ctx.fillStyle='#574632';ctx.fillRect(x,y,w,h);
      ctx.fillStyle='#9d8960';ctx.beginPath();ctx.ellipse(sx,y,w*.52,h*.19,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#645137';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(sx,y,w*.27,h*.08,0,0,Math.PI*2);ctx.stroke();
    }else if(p.type==='barrier'){
      const w=scale*.95,h=scale*.4,x=sx-w/2,y=base-h;
      ctx.fillStyle='#10191366';ctx.beginPath();ctx.ellipse(sx,base,w*.7,scale*.07,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#73786b';ctx.beginPath();ctx.moveTo(x+4,y+h);ctx.lineTo(x+w*.12,y);ctx.lineTo(x+w*.88,y);ctx.lineTo(x+w-4,y+h);ctx.closePath();ctx.fill();
      ctx.fillStyle='#aeb19a';ctx.beginPath();ctx.moveTo(x+w*.12,y);ctx.lineTo(x+w*.88,y);ctx.lineTo(x+w*.78,y+5);ctx.lineTo(x+w*.2,y+5);ctx.closePath();ctx.fill();
      ctx.fillStyle='#c5b77c';ctx.globalAlpha=.8;ctx.fillRect(x+w*.2,y+h*.48,w*.18,Math.max(2,h*.1));ctx.fillRect(x+w*.62,y+h*.48,w*.18,Math.max(2,h*.1));ctx.globalAlpha=1;
    }
    ctx.restore();
  });
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
     // Clearly visible fictional sci-fi blaster for every enemy.
     // Its bright energy core and muzzle make it readable even at a distance.
     ctx.save();
     const blasterLength=Math.max(19,Math.min(76,size*.62));
     const blasterHeight=Math.max(5,blasterLength*.19);
     ctx.translate(sx+bodyW*.02,y+size*.59);
     ctx.rotate(-.10);
     ctx.lineJoin='round';
     ctx.fillStyle='#080e0c';
     ctx.strokeStyle='#aab79b';
     ctx.lineWidth=Math.max(1.2,blasterLength*.025);
     ctx.beginPath();
     ctx.moveTo(-blasterLength*.55,-blasterHeight*.28);
     ctx.lineTo(-blasterLength*.38,-blasterHeight*.52);
     ctx.lineTo(blasterLength*.48,-blasterHeight*.40);
     ctx.lineTo(blasterLength*.61,-blasterHeight*.12);
     ctx.lineTo(blasterLength*.57,blasterHeight*.22);
     ctx.lineTo(-blasterLength*.45,blasterHeight*.38);
     ctx.closePath();ctx.fill();ctx.stroke();
     ctx.fillStyle=e.boss?'#75483a':'#526b57';
     ctx.fillRect(-blasterLength*.34,-blasterHeight*.34,blasterLength*.68,blasterHeight*.68);
     ctx.fillStyle='#1c2a25';
     ctx.fillRect(-blasterLength*.20,blasterHeight*.34,blasterLength*.18,blasterHeight*.70);
     ctx.fillStyle=e.boss?'#ffb45b':'#75e4d3';
     ctx.shadowBlur=Math.max(4,blasterLength*.14);
     ctx.shadowColor=e.boss?'#ff9d42':'#49e6d2';
     ctx.fillRect(-blasterLength*.08,-blasterHeight*.18,blasterLength*.27,blasterHeight*.36);
     ctx.shadowBlur=0;
     ctx.fillStyle='#c8d7c5';
     ctx.fillRect(blasterLength*.20,-blasterHeight*.25,blasterLength*.34,blasterHeight*.50);
     ctx.fillStyle='#17231f';
     ctx.fillRect(blasterLength*.47,-blasterHeight*.16,blasterLength*.15,blasterHeight*.32);
     ctx.fillStyle=e.boss?'#ffcf78':'#a4fff2';
     ctx.beginPath();ctx.arc(blasterLength*.58,0,Math.max(2,blasterHeight*.38),0,Math.PI*2);ctx.fill();
     ctx.fillStyle='#26342d';
     ctx.fillRect(-blasterLength*.04,blasterHeight*.25,blasterLength*.14,blasterHeight*.56);
     ctx.strokeStyle='#d9e4ce';ctx.lineWidth=Math.max(1,blasterLength*.018);
     ctx.beginPath();ctx.moveTo(-blasterLength*.30,-blasterHeight*.20);ctx.lineTo(blasterLength*.17,-blasterHeight*.20);ctx.stroke();
     ctx.restore();
    // health bar
    ctx.fillStyle='#080d0b';ctx.fillRect(sx-size*.31,y-13,size*.62,7);
    ctx.fillStyle='#ce5146';ctx.fillRect(sx-size*.30,y-12,size*.60*Math.max(0,e.hp/e.max),5);
    if(e.boss){ctx.fillStyle='#fff';ctx.font='bold 11px monospace';ctx.fillText('BOSS',sx-17,y-20)}
    
  });
  // Draw other real players in the 5v5 match.
  if(mode==='5V5'&&onlineReady){
    Object.values(teamPlayers).forEach(p=>{
      if(p.id===myPlayerId||p.hp<=0)return;
      const dx=p.x-player.x,dy=p.y-player.y,d=Math.hypot(dx,dy);let a=Math.atan2(dy,dx)-player.a;a=Math.atan2(Math.sin(a),Math.cos(a));
      if(Math.abs(a)>.66||d<.2)return;
      const sx=450+a/1.25*900;if(sx<0||sx>=900||d>depth[Math.floor(sx)]||blocked(player.x,player.y,p.x,p.y))return;
      const size=Math.min(210,350/d),y=horizon-size*.56,w=size*.46;
      ctx.fillStyle='#07100d99';ctx.beginPath();ctx.ellipse(sx,y+size*.94,w*.7,size*.08,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=p.team==='BLUE'?'#315f9a':'#9a3939';ctx.fillRect(sx-w*.34,y+size*.39,w*.68,size*.39);
      ctx.fillStyle='#9b8d72';ctx.beginPath();ctx.arc(sx,y+size*.25,size*.105,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#27313c';ctx.beginPath();ctx.arc(sx,y+size*.21,size*.15,Math.PI,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='bold 10px monospace';ctx.fillText(p.team,sx-14,y-20);
      ctx.fillStyle='#08100e';ctx.fillRect(sx-size*.31,y-13,size*.62,7);
      ctx.fillStyle=p.team==='BLUE'?'#62a8e8':'#e36a62';ctx.fillRect(sx-size*.30,y-12,size*.60*Math.max(0,p.hp/100),5);
    });
  }
  // Render the connected human opponent as a distinct field character.
  if(mode==='DUEL'&&onlineReady&&remotePlayer){
    const dx=remotePlayer.x-player.x,dy=remotePlayer.y-player.y,d=Math.hypot(dx,dy);
    let a=Math.atan2(dy,dx)-player.a;a=Math.atan2(Math.sin(a),Math.cos(a));
    if(Math.abs(a)<.66&&d>.2){
      const sx=450+a/1.25*900;
      if(sx>=0&&sx<900&&d<depth[Math.floor(sx)]&&!blocked(player.x,player.y,remotePlayer.x,remotePlayer.y)){
        const size=Math.min(210,350/d),y=horizon-size*.56,w=size*.46;
        ctx.fillStyle='#07100d99';ctx.beginPath();ctx.ellipse(sx,y+size*.94,w*.7,size*.08,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#233e66';ctx.fillRect(sx-w*.34,y+size*.39,w*.68,size*.39);
        ctx.fillStyle='#9b8d72';ctx.beginPath();ctx.arc(sx,y+size*.25,size*.105,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#27313c';ctx.beginPath();ctx.arc(sx,y+size*.21,size*.15,Math.PI,Math.PI*2);ctx.fill();
        ctx.fillStyle='#18232d';ctx.fillRect(sx-w*.28,y+size*.76,w*.22,size*.2);ctx.fillRect(sx+w*.06,y+size*.76,w*.22,size*.2);
        ctx.fillStyle='#8de4d4';ctx.fillRect(sx+w*.15,y+size*.54,w*.42,Math.max(3,size*.045));
        ctx.fillStyle='#08100e';ctx.fillRect(sx-size*.31,y-13,size*.62,7);
        ctx.fillStyle='#62c7a2';ctx.fillRect(sx-size*.30,y-12,size*.60*Math.max(0,remotePlayer.hp/100),5);
        ctx.fillStyle='#fff';ctx.font='bold 11px monospace';ctx.fillText('PLAYER 2',sx-28,y-20);
      }
    }
  }
  // Enemy energy bolts are harmless-looking arcade projectiles, not realistic weapon effects.
  enemyBolts.forEach(b=>{const dx=b.x-player.x,dy=b.y-player.y,d=Math.hypot(dx,dy);let a=Math.atan2(dy,dx)-player.a;a=Math.atan2(Math.sin(a),Math.cos(a));if(Math.abs(a)>.66||d<.1)return;const sx=450+a/1.25*900;if(sx<0||sx>=900||d>depth[Math.floor(sx)]||blocked(player.x,player.y,b.x,b.y))return;const size=Math.max(3,18/d);ctx.save();ctx.shadowBlur=18;ctx.shadowColor='#ffb34d';ctx.fillStyle='#ffd36b';ctx.beginPath();ctx.arc(sx,horizon+Math.min(210,150/d),size,0,Math.PI*2);ctx.fill();ctx.restore()});
  // Shot tracer and hit marker flash
  if(shotFx&&now<shotFx.until&&shotFx.target){
    const dx=shotFx.target.x-player.x,dy=shotFx.target.y-player.y;
    let a=Math.atan2(dy,dx)-player.a;a=Math.atan2(Math.sin(a),Math.cos(a));
    const sx=450+a/1.25*900;
    ctx.strokeStyle='#e9d69a';ctx.globalAlpha=.65;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(450,horizon+165);ctx.lineTo(sx,horizon+24);ctx.stroke();ctx.globalAlpha=1;
  }
  // Crosshair
  ctx.strokeStyle='#f4e7c5';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(438,horizon);ctx.lineTo(462,horizon);ctx.moveTo(450,horizon-12);ctx.lineTo(450,horizon+12);ctx.stroke();
  // Simple first-person weapon silhouette and muzzle flash
  ctx.save();ctx.translate(450+cameraKick*8,520+Math.sin(footstepPhase)*2);ctx.fillStyle='#111916';
  ctx.beginPath();ctx.moveTo(-82,0);ctx.lineTo(-58,-45);ctx.lineTo(-25,-56);ctx.lineTo(28,-54);ctx.lineTo(55,-35);ctx.lineTo(91,-29);ctx.lineTo(98,-12);ctx.lineTo(58,-8);ctx.lineTo(43,0);ctx.closePath();ctx.fill();
  ctx.fillStyle='#465247';ctx.fillRect(-26,-48,56,8);ctx.fillStyle='#202b24';ctx.fillRect(15,-30,30,17);ctx.fillStyle='#0b100e';ctx.fillRect(-5,-18,16,25);
  if(now<muzzleFlashUntil){ctx.fillStyle='#f8d58a';ctx.beginPath();ctx.moveTo(96,-27);ctx.lineTo(137,-45);ctx.lineTo(124,-22);ctx.lineTo(148,-8);ctx.lineTo(105,-12);ctx.closePath();ctx.fill();ctx.fillStyle='#fff0bd';ctx.beginPath();ctx.arc(111,-23,9,0,Math.PI*2);ctx.fill()}
  ctx.restore();
  // Ground grit and small scattered stones in the foreground
  for(let i=0;i<34;i++){
    const x=(i*137+53)%900,y=390+(i*47%125),r=1+(i%3);
    ctx.fillStyle=i%2?'#c0b99522':'#0b120e35';ctx.beginPath();ctx.ellipse(x,y,r*1.7,r*.7,(i%5)*.3,0,Math.PI*2);ctx.fill();
  }
  // Fine surface grain catches the ambient light near the bottom of the frame.
  ctx.save();
  for(let i=0;i<44;i++){
    const x=(i*211+19)%900,y=430+(i*37%85);
    const shimmer=.025+.018*Math.sin(now*.0012+i*2.1);
    ctx.fillStyle='rgba(220,214,190,'+shimmer+')';
    ctx.fillRect(x,y,1+(i%3),1);
  }
  ctx.restore();
  // Subtle edge vignette for depth
  const vignette=ctx.createRadialGradient(450,260,170,450,260,560);
  vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#050a08aa');
  ctx.fillStyle=vignette;ctx.fillRect(0,0,900,520);
  // Minimap: player position plus live enemy positions
  const mm=150,mx=900-mm-18,my=18,cell=mm/map[0].length;
  ctx.save();ctx.fillStyle='#08110ed9';ctx.fillRect(mx-7,my-7,mm+14,mm+14);
  ctx.strokeStyle='#9ba88c';ctx.lineWidth=2;ctx.strokeRect(mx-7,my-7,mm+14,mm+14);
  for(let gy=0;gy<map.length;gy++)for(let gx=0;gx<map[gy].length;gx++){
    const tile=map[gy][gx];if(tile==='0'){ctx.fillStyle=((gx+gy)%2)?'#596753':'#68745d'}
    else if(tile==='2')ctx.fillStyle='#687d7c';else if(tile==='3')ctx.fillStyle='#8a7658';else ctx.fillStyle='#66735e';
    ctx.fillRect(mx+gx*cell,my+gy*cell,cell+.3,cell+.3);
  }
  // Red dots are enemies; bosses use a larger orange marker.
  enemies.forEach(e=>{
    const ex=mx+e.x*cell,ey=my+e.y*cell;
    ctx.fillStyle=e.boss?'#ffad42':'#ff514d';
    ctx.beginPath();ctx.arc(ex,ey,e.boss?4.8:3.2,0,Math.PI*2);ctx.fill();
    if(e.boss){ctx.strokeStyle='#ffe0a0';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(ex,ey,7,0,Math.PI*2);ctx.stroke()}
  });
  if(mode==='5V5')Object.values(teamPlayers).forEach(p=>{if(p.id===myPlayerId||p.hp<=0)return;ctx.fillStyle=p.team==='BLUE'?'#62a8e8':'#e36a62';ctx.beginPath();ctx.arc(mx+p.x*cell,my+p.y*cell,3.2,0,Math.PI*2);ctx.fill()});
  const px=mx+player.x*cell,py=my+player.y*cell;
  ctx.strokeStyle='#f0d57c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(player.a)*10,py+Math.sin(player.a)*10);ctx.stroke();
  ctx.fillStyle='#ffe49a';ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2);ctx.fill();
  // Minimap legend
  ctx.font='10px monospace';ctx.fillStyle='#ffe49a';ctx.fillText('YOU',mx,my+mm+17);
  ctx.fillStyle='#ff625d';ctx.fillText('ENEMIES',mx+35,my+mm+17);
  ctx.fillStyle='#ffad42';ctx.fillText('BOSS',mx+99,my+mm+17);
  ctx.restore();
  if(mode==='DEFENSE'){ctx.fillStyle='#c7a75e';ctx.fillRect(360,345,180,35);ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.fillText('YOUR BASE',414,367)}
}
function finishGameOver(reason){
  if(!playing)return;
  playing=false;paused=false;mouseHeld=false;waveBreakUntil=0;reloadUntil=0;keys={};
  $('retryGame').textContent=mode==='DUEL'?'REMATCH ↻':'TRY AGAIN ↻';
  $('gameOverReason').textContent=reason;
  $('gameOverWave').textContent=level;
  $('gameOverCredits').textContent=coins;
  $('gameOverMode').textContent=mode;
  show('gameover');
  $('gameover').style.display='flex';
  say('GAME OVER');
}
function update(dt){let speed=2.8*dt*(keys.shift?1.5:1),f=(keys.w?1:0)-(keys.s?1:0),s=(keys.d?1:0)-(keys.a?1:0);if(keys.arrowleft)player.a-=2*dt;if(keys.arrowright)player.a+=2*dt;let dx=(Math.cos(player.a)*f-Math.sin(player.a)*s)*speed,dy=(Math.sin(player.a)*f+Math.cos(player.a)*s)*speed;if(free(player.x+dx,player.y))player.x+=dx;if(free(player.x,player.y+dy))player.y+=dy;enemies.forEach(e=>{let dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy);if(d>.75&&!blocked(e.x,e.y,player.x,player.y)){let nx=e.x+dx/d*e.speed*dt,ny=e.y+dy/d*e.speed*dt;if(free(nx,e.y,.14))e.x=nx;if(free(e.x,ny,.14))e.y=ny}if(d<.8&&Math.random()<dt*.7){let damage=Math.max(1,5*(1-armor/100));if(mode==='DEFENSE')baseHp-=damage;else hp-=damage}if(d<11&&d>.9&&performance.now()>=e.nextShot&&!blocked(e.x,e.y,player.x,player.y)){const a=Math.atan2(player.y-e.y,player.x-e.x);enemyBolts.push({x:e.x,y:e.y,vx:Math.cos(a)*5.2,vy:Math.sin(a)*5.2,life:2.5});e.nextShot=performance.now()+(e.boss?1250:2050)+Math.random()*650}});enemyBolts=enemyBolts.filter(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(wall(b.x,b.y)||b.life<=0)return false;if(Math.hypot(b.x-player.x,b.y-player.y)<.25){const damage=Math.max(2,8*(1-armor/100));if(mode==='DEFENSE')baseHp-=damage;else hp-=damage;return false}return true});if(f||s)footstepPhase+=dt*12;cameraKick=Math.max(0,cameraKick-dt*2.8);if(hp<=0||baseHp<=0){finishGameOver(hp<=0?'PLAYER DOWN':'BASE DESTROYED')}}
function loop(now){if(!playing||paused)return;finishReload(now);let dt=Math.min(.04,(now-last)/1000||.016);last=now;if(mouseHeld&&weapon==='MACHINE GUN')fire();update(dt);
if(mode==='DUEL'&&onlineReady&&now-lastNetSend>50){sendNet({type:'state',x:player.x,y:player.y,a:player.a,hp});lastNetSend=now}
else if(mode==='5V5'&&onlineReady&&now-lastNetSend>50){const me=teamPlayers[myPlayerId];if(me){me.x=player.x;me.y=player.y;me.a=player.a;if(onlineRole==='host')teamBroadcast({type:'teamState',player:me});else sendNet({type:'state',x:player.x,y:player.y,a:player.a})}lastNetSend=now}
advanceWave(now);render();hud();requestAnimationFrame(loop)}
hud();
})();