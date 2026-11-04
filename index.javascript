const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");

const $ = id => document.getElementById(id);

let mode = "ATAQUE";
let coins = 0;
let level = 1;
let hp = 100;
let basehp = 100;
let ammo = 12;
let weapon = "Pistola";
let owned = ["Pistola"];
let playing = false;
let paused = false;
let bus = false;
let keys = {};
let enemies = [];
let mouseDown = false;
let last = 0;
let lastShot = 0;

const guns = [
  {name:"Pistola",price:0,damage:25,clip:12,rate:330},
  {name:"AK-47",price:700,damage:18,clip:30,rate:115},
  {name:"Desert Eagle",price:1100,damage:55,clip:7,rate:500},
  {name:"Metralhadora",price:1800,damage:13,clip:60,rate:75}
];

const MAP = [
"1111111111111111",
"1000000000000001",
"1000100001000001",
"1000100001000001",
"1000000000000001",
"1011000100110001",
"1000000000000001",
"1000010000100001",
"1000010000100001",
"1000000000000001",
"1001000000010001",
"1001000000010001",
"1000000000000001",
"1000110001100001",
"1000000000000001",
"1111111111111111"
];

let player = {x:2.5,y:2.5,a:0};

function currentGun() {
  return guns.find(g => g.name === weapon);
}

function wall(x,y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return iy < 0 || iy >= 16 ||
    ix < 0 || ix >= 16 ||
    MAP[iy][ix] === "1";
}

function canMove(x,y,r=.18) {
  return !wall(x-r,y-r) && !wall(x+r,y-r) &&
         !wall(x-r,y+r) && !wall(x+r,y+r);
}

function message(text) {
  $("message").textContent = text;
}

function hud() {
  $("coins").textContent = coins;
  $("level").textContent = level;
  $("hp").textContent = Math.max(0,Math.ceil(hp));
  $("ammo").textContent = ammo;
  $("basehp").textContent = basehp;
  $("remaining").textContent = enemies.length;
  $("weaponLabel").textContent = weapon;
}

function show(id) {
  ["menu","store","game"].forEach(name =>
    $(name).classList.toggle("hidden",name !== id)
  );
}

document.querySelectorAll("[data-mode]").forEach(button => {
  button.onclick = () => {
    mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(b =>
      b.classList.toggle("selected",b === button)
    );
    $("modeLabel").textContent = mode;
    message("Modo selecionado: " + mode);
  };
});

function openShop() {
  $("weapons").innerHTML = "";

  guns.forEach(g => {
    const button = document.createElement("button");
    const has = owned.includes(g.name);

    button.innerHTML =
      `<b>${g.name}</b><br>${g.damage} de dano<br>` +
      (has ? "EQUIPAR" : `${g.price} moedas`);

    button.onclick = () => {
      if (!has) {
        if (coins < g.price) {
          message("Moedas insuficientes.");
          return;
        }
        coins -= g.price;
        owned.push(g.name);
      }

      weapon = g.name;
      ammo = g.clip;
      hud();
      openShop();
    };

    $("weapons").appendChild(button);
  });

  show("store");
}

$("shop").onclick = openShop;
$("back").onclick = () => show("menu");

function spawnEnemies(amount) {
  const spots = [
    [12.5,2.5],[13.5,6.5],[10.5,12.5],
    [7.5,13.5],[3.5,12.5],[12.5,9.5],
    [8.5,2.5],[5.5,10.5],[13.5,13.5]
  ];

  for (let i=0;i<amount;i++) {
    const spot = spots[(i+level*3)%spots.length];

    const boss = i === 0 &&
      (level === 1 || level % 3 === 0) &&
      mode !== "AVANÇO";

    const max = boss ? 220+level*30 : 35+level*9;

    enemies.push({
      x:spot[0],y:spot[1],
      hp:max,max,
      boss,
      speed:.65+level*.025
    });
  }
}

function startGame() {
  level = 1;
  hp = 100;
  basehp = 100;
  ammo = currentGun().clip;
  player = {x:2.5,y:2.5,a:0};
  enemies = [];
  paused = false;
  playing = true;
  bus = mode === "BATTLE ROYALE";

  if (!bus) {
    spawnEnemies(mode === "SOBREVIVÊNCIA" ? 7 : 5);
  }

  $("jump").classList.toggle("hidden",!bus);
  $("modeLabel").textContent = mode;
  show("game");
  hud();

  message(bus ?
    "Ônibus em voo! Pule para começar." :
    "Missão iniciada! Cuidado com as paredes."
  );

  last = performance.now();
  requestAnimationFrame(loop);
}

$("play").onclick = startGame;

$("jump").onclick = () => {
  if (!bus) return;
  bus = false;
  $("jump").classList.add("hidden");
  spawnEnemies(12);
  message("Você saltou! Sobreviva!");
};

$("quit").onclick = () => {
  playing = false;
  show("menu");
  message("Missão encerrada.");
};

$("pause").onclick = () => {
  paused = !paused;
  $("pause").textContent = paused ? "CONTINUAR" : "PAUSAR";

  if (!paused) {
    last = performance.now();
    requestAnimationFrame(loop);
  }
};

$("reload").onclick = () => {
  ammo = currentGun().clip;
  hud();
};

function blocked(x1,y1,x2,y2) {
  const d = Math.hypot(x2-x1,y2-y1);
  const steps = Math.ceil(d*12);

  for (let i=1;i<steps;i++) {
    const t=i/steps;
    if (wall(x1+(x2-x1)*t,y1+(y2-y1)*t)) return true;
  }

  return false;
}

function shoot() {
  const now = performance.now();
  const g = currentGun();

  if (!playing || paused || bus ||
      now-lastShot<g.rate || ammo<=0) return;

  lastShot = now;
  ammo--;

  let target = null;
  let bestDistance = 99;

  enemies.forEach(e => {
    const dx=e.x-player.x;
    const dy=e.y-player.y;
    const d=Math.hypot(dx,dy);

    let a=Math.atan2(dy,dx)-player.a;
    a=Math.atan2(Math.sin(a),Math.cos(a));

    if (Math.abs(a)<.18 && d<bestDistance &&
        !blocked(player.x,player.y,e.x,e.y)) {
      target=e;
      bestDistance=d;
    }
  });

  if (target) {
    target.hp -= g.damage;

    if (target.hp<=0) {
      coins += target.boss ? 500 : 100;
      enemies = enemies.filter(e => e!==target);
      message("Inimigo eliminado! Moedas recebidas.");
    }
  }

  hud();
}

canvas.addEventListener("mousedown",e => {
  if (e.button===0 || e.button===2) {
    mouseDown=true;
    shoot();
  }
});

window.addEventListener("mouseup",()=>mouseDown=false);
canvas.addEventListener("contextmenu",e=>e.preventDefault());

window.addEventListener("keydown",e => {
  const k=e.key.toLowerCase();
  keys[k]=true;

  if (k==="r") $("reload").click();
  if (k==="escape" && playing) $("pause").click();
});

window.addEventListener("keyup",e => {
  keys[e.key.toLowerCase()]=false;
});

function cast(angle) {
  let d=0;

  while (d<20) {
    d+=.025;

    if (wall(
      player.x+Math.cos(angle)*d,
      player.y+Math.sin(angle)*d
    )) break;
  }

  return Math.max(.01,d*Math.cos(angle-player.a));
}

// ÔNIBUS MILITAR ANIMADO
function drawBus() {
  const t=performance.now()/1000;

  const sky=ctx.createLinearGradient(0,0,0,450);
  sky.addColorStop(0,"#172c40");
  sky.addColorStop(.65,"#6d9bab");
  sky.addColorStop(1,"#d4d1bd");

  ctx.fillStyle=sky;
  ctx.fillRect(0,0,800,450);

  for(let i=0;i<14;i++) {
    const x=((i*137-t*105)%1050+1050)%1050-120;
    const y=30+(i%5)*62;

    ctx.fillStyle="rgba(238,246,244,.52)";
    ctx.beginPath();
    ctx.ellipse(x,y,52,13,0,0,Math.PI*2);
    ctx.ellipse(x+24,y-5,30,12,0,0,Math.PI*2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(400,230+Math.sin(t*2.3)*6);
  ctx.rotate(Math.sin(t*1.4)*.025);

  // Asas
  ctx.fillStyle="#34443e";
  ctx.beginPath();
  ctx.moveTo(-240,-4);
  ctx.lineTo(225,-4);
  ctx.lineTo(285,22);
  ctx.lineTo(-270,22);
  ctx.fill();

  // Corpo
  ctx.fillStyle="#26362f";
  ctx.fillRect(-194,-47,396,74);

  // Janelas
  for(let i=0;i<7;i++) {
    ctx.fillStyle="#9bb9c0";
    ctx.fillRect(-157+i*42,-34,29,18);
  }

  // Cabine
  ctx.fillStyle="#192722";
  ctx.fillRect(145,-35,48,59);
  ctx.fillStyle="#a9c5ca";
  ctx.fillRect(153,-29,30,21);

  // Cauda
  ctx.fillStyle="#52665a";
  ctx.beginPath();
  ctx.moveTo(-194,-45);
  ctx.lineTo(-230,-90);
  ctx.lineTo(-207,-90);
  ctx.lineTo(-160,-45);
  ctx.fill();

  // Turbinas animadas
  for(let i=0;i<2;i++) {
    const x=-80+i*165;

    ctx.fillStyle="#171e1a";
    ctx.beginPath();
    ctx.ellipse(x,30,25,10,0,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle=`rgba(255,150,60,${.55+.35*Math.sin(t*19+i)})`;
    ctx.beginPath();
    ctx.ellipse(x,45,13+Math.sin(t*20)*4,20,0,0,Math.PI*2);
    ctx.fill();
  }

  ctx.restore();

  ctx.fillStyle="rgba(0,0,0,.58)";
  ctx.fillRect(180,335,440,75);
  ctx.fillStyle="white";
  ctx.textAlign="center";
  ctx.font="bold 25px Arial";
  ctx.fillText("TRANSPORTE MILITAR",400,368);
  ctx.font="16px Arial";
  ctx.fillText("Prepare-se para saltar!",400,394);
  ctx.textAlign="left";
}

function render() {
  if (bus) {
    drawBus();
    return;
  }

  const sky=ctx.createLinearGradient(0,0,0,225);
  sky.addColorStop(0,"#34433e");
  sky.addColorStop(1,"#89918a");
  ctx.fillStyle=sky;
  ctx.fillRect(0,0,800,225);

  ctx.fillStyle="#343b32";
  ctx.fillRect(0,225,800,225);

  const z=[];

  for(let x=0;x<800;x+=2) {
    const a=player.a+(x/800-.5)*1.12;
    const d=cast(a);
    z[x]=z[x+1]=d;

    const h=Math.min(440,330/d);
    const sh=Math.max(35,155-d*13);

    ctx.fillStyle=`rgb(${sh*.75},${sh},${sh*.76})`;
    ctx.fillRect(x,225-h/2,2,h);
  }

  [...enemies]
    .sort((a,b)=>
      Math.hypot(b.x-player.x,b.y-player.y)-
      Math.hypot(a.x-player.x,a.y-player.y)
    )
    .forEach(e => {
      const dx=e.x-player.x;
      const dy=e.y-player.y;
      const d=Math.hypot(dx,dy);

      let a=Math.atan2(dy,dx)-player.a;
      a=Math.atan2(Math.sin(a),Math.cos(a));

      if(Math.abs(a)>.62 || d<.15) return;

      const sx=400+a/1.12*800;
      if(sx<0 || sx>=800 || d>z[Math.floor(sx)] ||
         blocked(player.x,player.y,e.x,e.y)) return;

      const size=Math.min(210,330/d*(e.boss?1.45:1));
      const y=225-size*.48;

      ctx.fillStyle=e.boss?"#6d3730":"#29352d";
      ctx.fillRect(sx-size*.22,y+size*.3,size*.44,size*.68);

      ctx.fillStyle="#c2b59b";
      ctx.beginPath();
      ctx.arc(sx,y+size*.2,size*.18,0,Math.PI*2);
      ctx.fill();

      ctx.fillStyle="#d33";
      ctx.fillRect(sx-size*.3,y-9,size*.6,4);

      ctx.fillStyle="#5c5";
      ctx.fillRect(sx-size*.3,y-9,size*.6*Math.max(0,e.hp/e.max),4);
    });

  ctx.strokeStyle="white";
  ctx.beginPath();
  ctx.moveTo(390,225);ctx.lineTo(410,225);
  ctx.moveTo(400,215);ctx.lineTo(400,235);
  ctx.stroke();
}

function update(dt) {
  const speed=2.5*dt*(keys.shift?1.45:1);
  const f=(keys.w?1:0)-(keys.s?1:0);
  const s=(keys.d?1:0)-(keys.a?1:0);

  if(keys.arrowleft) player.a-=2.2*dt;
  if(keys.arrowright) player.a+=2.2*dt;

  const dx=(Math.cos(player.a)*f-Math.sin(player.a)*s)*speed;
  const dy=(Math.sin(player.a)*f+Math.cos(player.a)*s)*speed;

  if(canMove(player.x+dx,player.y)) player.x+=dx;
  if(canMove(player.x,player.y+dy)) player.y+=dy;

  enemies.forEach(e => {
    const dx=player.x-e.x;
    const dy=player.y-e.y;
    const d=Math.hypot(dx,dy);

    if(d>.6 && !blocked(e.x,e.y,player.x,player.y)) {
      const nx=e.x+dx/d*e.speed*dt;
      const ny=e.y+dy/d*e.speed*dt;

      if(canMove(nx,e.y,.15)) e.x=nx;
      if(canMove(e.x,ny,.15)) e.y=ny;
    }

    if(d<.8 && Math.random()<dt*.65) {
      if(mode==="DEFESA") basehp-=5;
      else hp-=4;
    }
  });

  if(hp<=0 || basehp<=0) {
    playing=false;
    show("menu");
    message("MISSÃO FALHOU! Fase: "+level);
    return;
  }

  if(enemies.length===0) {
    level++;
    hp=Math.min(100,hp+12);
    basehp=Math.min(100,basehp+10);
    spawnEnemies(Math.min(18,4+level*2));
    message("Fase "+level+"! Mais inimigos chegaram.");
  }
}

function loop(now) {
  if(!playing || paused) return;

  const dt=Math.min(.04,(now-last)/1000||.016);
  last=now;

  if(!bus) {
    update(dt);
    if(mouseDown) shoot();
  }

  render();
  hud();
  requestAnimationFrame(loop);
}
