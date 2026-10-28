import * as THREE from 'three';
import {
  scene, camera, renderer, composer, bloom, fxaa, hemi, moon,
  animators, solids, R, IX, HALLS, NPCS, TOKENS, player,
  DEF_SET, settings, saveSettings, toast, rt
} from './state.js';
import {
  ensureAudio, applyZone, audioTick, applyAudioSettings,
  sfxStep, sfxPortal, sfxTalk, audioState
} from './audio.js';
import { initEnvironment } from './world/environment.js';
import { initInterior } from './world/interior.js';
import { initHalls, EXIT } from './world/halls.js';
import { initNpcs, nearestNpc } from './world/npc.js';
import { initTokens, tokensDone, takeToken, updateTokenHUD } from './world/tokens.js';
import { onNpcTalk, questTick, initQuest, Q, allKeysDone, isFinished } from './quest.js';

/* ============ 暂停面板 / 设置交互 ============ */
const pauseEl=document.getElementById('pause');
const sSens=document.getElementById('sSens'), sVol=document.getElementById('sVol'), sBloom=document.getElementById('sBloom');
const vSens=document.getElementById('vSens'), vVol=document.getElementById('vVol'), vBloom=document.getElementById('vBloom');
const bMute=document.getElementById('bMute'), bReset=document.getElementById('bReset');
const bQual=document.getElementById('bQual'), vFps=document.getElementById('vFps');
const QUAL_SEQ=['auto',2,1,0], QUAL_NAME={'auto':'自动',2:'高',1:'中',0:'低'};
function qualLabel(){
  const q=settings.qual;
  return q==='auto' ? ('自动 · '+QUAL_NAME[autoLevel]) : QUAL_NAME[q];
}
function syncSettingsUI(){
  sSens.value=settings.sens;   vSens.textContent=(+settings.sens).toFixed(1);
  sVol.value=settings.vol;     vVol.textContent=Math.round(settings.vol);
  sBloom.value=settings.bloom; vBloom.textContent=(+settings.bloom).toFixed(2);
  bMute.textContent='音效 · '+(settings.mute?'关':'开');
  bQual.textContent=qualLabel();
  vFps.textContent=Math.round(fpsNow)+' fps';
  updateTokenHUD();
}
bQual.addEventListener('click', ()=>{
  settings.qual = QUAL_SEQ[(QUAL_SEQ.indexOf(settings.qual)+1) % QUAL_SEQ.length];
  saveSettings(); applyQuality(); syncSettingsUI();
});
sSens.addEventListener('input', ()=>{ settings.sens=+sSens.value; vSens.textContent=settings.sens.toFixed(1); saveSettings(); });
sVol.addEventListener('input', ()=>{ settings.vol=+sVol.value; vVol.textContent=Math.round(settings.vol); saveSettings(); applySettings(); });
sBloom.addEventListener('input', ()=>{ settings.bloom=+sBloom.value; vBloom.textContent=settings.bloom.toFixed(2); saveSettings(); applySettings(); });
bMute.addEventListener('click', ()=>toggleMute());
bReset.addEventListener('click', ()=>{ Object.assign(settings, DEF_SET); saveSettings(); applySettings(); applyQuality(); syncSettingsUI(); });

/* ============ 玩家 & 控制 ============ */
let yaw=0, pitch=0, fly=false, locked=false;
let started=false, tpLock=false, walkDist=0;
const key={};
const hintEl=document.getElementById('hint'), fadeEl=document.getElementById('fade'), introEl=document.getElementById('intro');
const crossEl=document.getElementById('crosshair'), hudEl=document.getElementById('hud');
const regName=document.querySelector('#region .name'), regSub=document.querySelector('#region .sub');

document.addEventListener('pointerlockchange', ()=>{
  locked = document.pointerLockElement === renderer.domElement;
  crossEl.style.display = locked?'block':'none';
  hudEl.classList.toggle('on', locked);
  if(locked){
    started=true;
    introEl.style.display='none';
    pauseEl.classList.remove('on');
    ensureAudio();
  }else{
    closeDlg();
    if(rt.modal){ /* 小游戏 / 胜利浮层开启中：保持冻结，不弹暂停 */ }
    else if(started){ pauseEl.classList.add('on'); syncSettingsUI(); }
    else introEl.style.display='flex';
  }
});
function enterLock(){ ensureAudio(); renderer.domElement.requestPointerLock(); }
introEl.addEventListener('click', enterLock);
pauseEl.addEventListener('click', enterLock);
renderer.domElement.addEventListener('click', ()=>{ if(!locked) enterLock(); });
document.addEventListener('mousemove', e=>{
  if(!locked) return;
  yaw -= e.movementX*0.001*settings.sens;
  pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY*0.001*settings.sens));
});
addEventListener('keydown', e=>{
  key[e.code]=true;
  if(!locked) return;
  if(e.code==='KeyF' && !dlgOpen){ fly=!fly; }
  if(e.code==='KeyE'){ e.preventDefault(); onInteract(); }
  if(e.code==='KeyM'){ toggleMute(); }
});
addEventListener('keyup', e=> key[e.code]=false);

// NPC 交互半径：酒保站在吧台另一侧，吧台碰撞体挡在中间，
// 玩家在吧台前侧最近也有约 3.5 的距离，故半径需放宽到 4.6
const NPC_REACH = 4.6;
function onInteract(){
  if(rt.modal) return;
  if(dlgOpen){ advanceDlg(); return; }
  const it=nearestInteract();
  if(it && it.type==='npc' && it.d<NPC_REACH) openDlg(it.npc);
}

/* 空间氛围切换：动态雾色与密度 */
function setMoodForPlace(){
  if(rt.inInterior){
    scene.fog.color.setHex(0x0c0a1a); scene.fog.density=0.018;
    scene.background = new THREE.Color(0x08060f);
    moon.intensity = 0.5;           // 室内压低月光，避免冲淡主题灯光的暖冷对比
    hemi.intensity = 0.92;          // 室内补环境光，避免暗部糊成一团
  } else {
    scene.fog.color.setHex(0x070a10); scene.fog.density=0.011;
    scene.background = new THREE.Color(0x070a10);
    moon.intensity = 0.7;
    hemi.intensity = 0.7;
  }
}
setMoodForPlace();

function fadeTeleport(fn){
  if(tpLock) return;
  tpLock=true; sfxPortal();
  fadeEl.style.opacity=1;
  setTimeout(()=>{
    fn();
    setMoodForPlace();
    applyZone(zoneKey());
    fadeEl.style.opacity=0;
    setTimeout(()=>{ tpLock=false; }, 420);
  }, 420);
}

/* 区域 / 交互信息 */
function zoneKey(){
  if(!rt.inInterior) return 'exterior';
  const lx=player.x-IX, lz=player.z;
  if(Math.hypot(lx,lz)<9) return 'hub';
  if(Math.abs(lx)<9 && lz>21) return 'medieval';
  if(Math.abs(lx)<9 && lz<-21) return 'scifi';
  if(Math.abs(lz)<9 && lx>21) return 'arcane';
  if(Math.abs(lz)<9 && lx<-21) return 'xianxia';
  return 'corridor';
}
const CORRIDOR_NAME={N:['通廊 · 北','通往中土大厅'],S:['通廊 · 南','通往赛博酒廊'],
                     W:['通廊 · 西','通往修仙茶寮'],E:['通廊 · 东','通往秘法书斋']};
function zoneInfo(){
  const k=zoneKey();
  if(k==='exterior'){
    if(Math.abs(player.x)<2 && player.z>3.4 && player.z<7) return {name:'時空酒館', sub:'推门而入 · 万界在等'};
    return {name:'万界十字路口', sub:'夜色未央 · 星河流转'};
  }
  if(k==='hub'){
    if(!Q.started) return {name:'时空枢纽', sub:'西南角吧台后 · 酒保有话要说'};
    if(allKeysDone()) return {name:'时空枢纽', sub:'四钥归位 · 请酒保重启酒馆'};
    return {name:'时空枢纽', sub:'四门通万界 · 印记与试炼在等你'};
  }
  const HALL_INFO={medieval:['中土大厅','炉火与长歌'], scifi:['赛博酒廊','霓虹不眠'],
                   xianxia:['修仙茶寮','竹影浮灯'], arcane:['秘法书斋','群星为烛']};
  if(HALL_INFO[k]) return {name:HALL_INFO[k][0], sub:HALL_INFO[k][1]};
  const lx=player.x-IX, lz=player.z;
  const dir = Math.abs(lx)>Math.abs(lz) ? (lx>0?'E':'W') : (lz>0?'N':'S');
  const c=CORRIDOR_NAME[dir];
  return {name:c[0], sub:c[1]};
}
function nearestInteract(){
  const np=nearestNpc();
  if(np && np.d<NPC_REACH) return {d:np.d, type:'npc', npc:np.n};
  if(!rt.inInterior){
    return {d:Math.hypot(player.x, player.z-5), type:'door'};
  }
  const lx=player.x-IX, lz=player.z;
  const dExit=Math.hypot(lx-EXIT.x, lz-EXIT.z);
  if(dExit<3.2) return {d:dExit, type:'exit'};
  const entries=[[0,8.3,'medieval'],[0,-8.3,'scifi'],[-8.3,0,'xianxia'],[8.3,0,'arcane']];
  let best={d:1e9,type:'none'};
  entries.forEach(([ex,ez,t])=>{
    const d=Math.hypot(lx-ex,lz-ez);
    if(d<best.d) best={d,type:t};
  });
  return best;
}
const HINT_MAP={
  door:'木门虚掩 · 走近即入',
  exit:'穿过回归之门 · 重返夜色',
  medieval:'步入中土大厅 · 炉火与长歌',
  scifi:'步入赛博酒廊 · 霓虹不眠',
  xianxia:'步入修仙茶寮 · 竹影浮灯',
  arcane:'步入秘法书斋 · 群星为烛'
};
function updateHUD(){
  const info=zoneInfo();
  regName.textContent=info.name; regSub.textContent=info.sub;
  if(dlgOpen){ crossEl.classList.remove('near'); hintEl.classList.remove('on'); return; }
  const it=nearestInteract();
  const near = it && (
    (it.type==='npc' && it.d<NPC_REACH) ||
    (it.type==='door' && it.d<2.4) ||
    (it.type==='exit' && it.d<2.6) ||
    (['medieval','scifi','xianxia','arcane'].includes(it.type) && it.d<3.0)
  );
  if(near){
    crossEl.classList.add('near');
    if(it.type==='npc'){
      let label='E · 与「'+it.npc.name+'」交谈';
      if(it.npc.hall && Q.started && Q.token(it.npc.hall) && !Q.key(it.npc.hall)) label='E · 接受「'+it.npc.name+'」的试炼';
      else if(it.npc.id==='bartender' && Q.started && allKeysDone() && !isFinished()) label='E · 请酒保重启酒馆';
      hintEl.textContent=label;
    } else hintEl.textContent = HINT_MAP[it.type]||'';
    hintEl.classList.add('on');
  }else{
    crossEl.classList.remove('near');
    hintEl.classList.remove('on');
  }
}

/* 小地图（2D 俯视） */
const mmCanvas=document.getElementById('mm'), mmx=mmCanvas.getContext('2d');
const MM=150, MMC=MM/2;
function drawMinimap(){
  mmx.clearRect(0,0,MM,MM);
  mmx.fillStyle='rgba(6,8,14,0.5)'; mmx.fillRect(0,0,MM,MM);
  // 网格
  mmx.strokeStyle='rgba(255,209,138,0.05)'; mmx.lineWidth=1;
  for(let i=15;i<MM;i+=15){ mmx.beginPath(); mmx.moveTo(i,0); mmx.lineTo(i,MM); mmx.stroke();
    mmx.beginPath(); mmx.moveTo(0,i); mmx.lineTo(MM,i); mmx.stroke(); }
  mmx.save(); mmx.translate(MMC,MMC);
  if(!rt.inInterior){
    const s=0.82;
    // 酒馆块
    mmx.fillStyle='rgba(202,180,138,0.42)'; mmx.fillRect(-8*s,-5*s,16*s,10*s);
    mmx.strokeStyle='rgba(255,209,138,0.7)'; mmx.lineWidth=1.2; mmx.strokeRect(-8*s,-5*s,16*s,10*s);
    // 屋顶线
    mmx.strokeStyle='rgba(154,123,74,0.5)'; mmx.beginPath();
    mmx.moveTo(-8.8*s,0); mmx.lineTo(8.8*s,0); mmx.stroke();
    // 木门
    mmx.fillStyle='#ffaa55'; mmx.fillRect(-1.4*s,4.7*s,2.8*s,1.4*s);
    // 石板路
    mmx.strokeStyle='rgba(120,120,128,0.4)'; mmx.setLineDash([2,3]); mmx.beginPath();
    mmx.moveTo(0,5.2*s); mmx.lineTo(0,14*s); mmx.stroke(); mmx.setLineDash([]);
    // 住民
    mmx.fillStyle='rgba(255,230,180,.8)';
    NPCS.forEach(n=>{ if(n.ii) return; mmx.beginPath(); mmx.arc(n.x*s,n.z*s,2.6,0,7); mmx.fill(); });
    // 玩家
    mmx.save(); mmx.translate(player.x*s, player.z*s); mmx.rotate(-yaw);
    mmx.fillStyle='#ffe6a8'; mmx.beginPath(); mmx.moveTo(0,-3.6); mmx.lineTo(-2.4,2.6); mmx.lineTo(0,1.2); mmx.lineTo(2.4,2.6); mmx.closePath(); mmx.fill();
    mmx.restore();
  }else{
    const s=0.4;
    // 通道十字
    mmx.strokeStyle='rgba(120,140,180,0.18)'; mmx.lineWidth=5*s;
    mmx.beginPath();
    mmx.moveTo(0,-40*s); mmx.lineTo(0,40*s);
    mmx.moveTo(-40*s,0); mmx.lineTo(40*s,0);
    mmx.stroke();
    // 四厅
    const halls=[[-30,0,'#58e08a'],[30,0,'#b06cff'],[0,30,'#ff8c3a'],[0,-30,'#27e6ff']];
    halls.forEach(([x,z,col])=>{
      mmx.fillStyle=col+'33'; mmx.fillRect(x*s-9*s,z*s-9*s,18*s,18*s);
      mmx.strokeStyle=col; mmx.lineWidth=1; mmx.strokeRect(x*s-9*s,z*s-9*s,18*s,18*s);
    });
    // 中庭
    mmx.fillStyle='rgba(255,209,138,0.16)';
    mmx.beginPath(); mmx.arc(0,0,8*s,0,7); mmx.fill();
    mmx.strokeStyle='rgba(255,209,138,0.6)'; mmx.lineWidth=1; mmx.stroke();
    // EXIT
    mmx.fillStyle='#ffd25e'; mmx.beginPath(); mmx.arc(EXIT.x*s,EXIT.z*s,2.6,0,7); mmx.fill();
    mmx.fillStyle='rgba(255,210,94,0.25)'; mmx.beginPath(); mmx.arc(EXIT.x*s,EXIT.z*s,5,0,7); mmx.fill();
    // 未取印记
    TOKENS.forEach(tk=>{
      if(tk.taken) return;
      mmx.fillStyle='#'+tk.color.toString(16).padStart(6,'0');
      mmx.save(); mmx.translate(tk.x*s, tk.z*s); mmx.rotate(Math.PI/4);
      mmx.fillRect(-2.6,-2.6,5.2,5.2); mmx.restore();
    });
    // 住民
    mmx.fillStyle='rgba(255,230,180,.8)';
    NPCS.forEach(n=>{ if(!n.ii) return; mmx.beginPath(); mmx.arc(n.x*s,n.z*s,2.1,0,7); mmx.fill(); });
    // 玩家
    const lx=(player.x-IX)*s, lz=player.z*s;
    mmx.save(); mmx.translate(lx,lz); mmx.rotate(-yaw);
    mmx.fillStyle='#ffe6a8'; mmx.beginPath(); mmx.moveTo(0,-3.6); mmx.lineTo(-2.4,2.6); mmx.lineTo(0,1.2); mmx.lineTo(2.4,2.6); mmx.closePath(); mmx.fill();
    mmx.restore();
  }
  mmx.restore();
  // 边框
  mmx.strokeStyle='rgba(255,209,138,0.3)'; mmx.lineWidth=1; mmx.strokeRect(0.5,0.5,MM-1,MM-1);
}

function allowed(x,z){
  if(!rt.inInterior) return Math.hypot(x,z)<70;
  const lx=x-IX, lz=z;
  if(Math.hypot(lx,lz)<8.45) return true;
  if(Math.abs(lx)<2.85&&Math.abs(lz)>8.3&&Math.abs(lz)<21) return true;
  if(Math.abs(lz)<2.85&&Math.abs(lx)>8.3&&Math.abs(lx)<21) return true;
  if(Math.abs(lx)<8.9&&lz>20.85&&lz<39.1) return true;
  if(Math.abs(lx)<8.9&&lz<-20.85&&lz>-39.1) return true;
  if(Math.abs(lz)<8.9&&lx>20.85&&lx<39.1) return true;
  if(Math.abs(lz)<8.9&&lx<-20.85&&lx>-39.1) return true;
  return false;
}
function insideSolid(x,z){
  for(const s of solids){
    if(x>s.x1-R && x<s.x2+R && z>s.z1-R && z<s.z2+R) return true;
  }
  return false;
}

function updatePlayer(dt){
  if(dlgOpen || tpLock || rt.modal){
    camera.position.set(player.x, player.y, player.z);
    camera.rotation.order='YXZ'; camera.rotation.y=yaw; camera.rotation.x=pitch;
    return;
  }
  const iz=(key.KeyW?1:0)-(key.KeyS?1:0), ix=(key.KeyD?1:0)-(key.KeyA?1:0);
  const run = key.ShiftLeft||key.ShiftRight;
  const fx=-Math.sin(yaw), fz=-Math.cos(yaw);
  const rx=-fz, rz=fx;
  let mx=fx*iz+rx*ix, mz=fz*iz+rz*ix;
  const len=Math.hypot(mx,mz);
  if(len>0){ mx/=len; mz/=len; }
  const spd=(fly?11: run?8:4.4);
  const px=player.x, pz=player.z;          // 上一帧安全位置
  player.x+=mx*spd*dt; player.z+=mz*spd*dt;

  if(fly){
    player.y += ((key.Space?1:0)-(key.KeyC?1:0))*spd*dt;
    player.y=Math.max(0.5, Math.min(rt.inInterior?5.15:70, player.y));
  } else player.y=1.7;

  // 碰撞推挤（两遍，消除角点打架）
  for(let pass=0; pass<2; pass++){
    for(const s of solids){
      const x1=s.x1-R, x2=s.x2+R, z1=s.z1-R, z2=s.z2+R;
      if(player.x>x1&&player.x<x2&&player.z>z1&&player.z<z2){
        const d1=player.x-x1, d2=x2-player.x, d3=player.z-z1, d4=z2-player.z;
        const m=Math.min(d1,d2,d3,d4);
        if(m===d1)player.x=x1; else if(m===d2)player.x=x2;
        else if(m===d3)player.z=z1; else player.z=z2;
      }
    }
  }
  // 安全校验：越界或被挤进墙体 → 回退到安全位置
  if(!allowed(player.x,player.z) || insideSolid(player.x,player.z)){
    player.x=px; player.z=pz;
  }

  // 传送触发
  if(!rt.inInterior){
    if(Math.abs(player.x)<1.05 && player.z>4.25 && player.z<5.7 && player.y<3){
      fadeTeleport(()=>{ rt.inInterior=true; player.x=IX; player.z=-4.5; player.y=1.7; yaw=Math.PI; pitch=0; });
    }
  } else {
    const lx=player.x-IX, lz=player.z;
    if(Math.hypot(lx-EXIT.x, lz-EXIT.z)<1.4){
      fadeTeleport(()=>{ rt.inInterior=false; player.x=0; player.z=8; player.y=1.7; yaw=Math.PI; pitch=0; });
    }
    // 印记收取
    for(const tk of TOKENS){
      if(!tk.taken && Math.hypot(lx-tk.x, lz-tk.z)<1.7) takeToken(tk);
    }
  }
  // 脚步声
  if(!fly && len>0){
    walkDist += spd*dt;
    if(walkDist>2.0){ walkDist=0; sfxStep(); }
  }
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.order='YXZ';
  camera.rotation.y=yaw; camera.rotation.x=pitch;
}

/* ============ 状态条脉动（装饰） ============ */
const vHp=document.getElementById('vHp'), bHp=document.getElementById('bHp');
const vFocus=document.getElementById('vFocus'), bFocus=document.getElementById('bFocus');
const vQi=document.getElementById('vQi'), bQi=document.getElementById('bQi');
const vSan=document.getElementById('vSan'), bSan=document.getElementById('bSan');
let vitTimer=0;
function pulseVitals(t, dt){
  vitTimer+=dt;
  if(vitTimer<0.7) return;
  vitTimer=0;
  const drift=(base,amp)=>{
    const v=Math.max(20,Math.min(99, base+(Math.random()*2-1)*amp));
    return Math.round(v);
  };
  let hp=drift(92,3), fo=drift(74,4), qi=drift(61,5), sa=drift(88,3);
  vHp.textContent=hp; bHp.style.width=hp+'%';
  vFocus.textContent=fo; bFocus.style.width=fo+'%';
  vQi.textContent=qi; bQi.style.width=qi+'%';
  vSan.textContent=sa; bSan.style.width=sa+'%';
}

/* ============ 室内主光：一盏可迁移的投影聚光灯 ============
   始终只有这一盏 SpotLight（灯数恒定 → 不会触发着色器重编译），
   进入哪个厅就把它挪到哪个厅顶上，家具因此在地面留下清晰的落地阴影。 */
const HALL_KEY={N:'medieval', S:'scifi', W:'xianxia', E:'arcane'};
const HALL_CENTER={hub:{x:0,z:0}};
HALLS.forEach(h=> HALL_CENTER[HALL_KEY[h.open]]={x:h.cx, z:h.cz});
const HALL_TINT={hub:0xffd9a0, medieval:0xffb060, scifi:0x66d8ff, xianxia:0xffc98a, arcane:0xc08cff};
const roomSpot = new THREE.SpotLight(0xffd9a0, 0, 32, 1.05, 0.8, 1.0);
roomSpot.castShadow = true;
roomSpot.shadow.mapSize.set(1024, 1024);
roomSpot.shadow.camera.near = 0.6; roomSpot.shadow.camera.far = 32;
roomSpot.shadow.bias = -0.0012;  roomSpot.shadow.normalBias = 0.03;
scene.add(roomSpot); scene.add(roomSpot.target);
function updateRoomSpot(){
  const k = zoneKey(), c = HALL_CENTER[k];
  if(c){
    roomSpot.color.setHex(HALL_TINT[k]);
    roomSpot.intensity = 21;
    roomSpot.position.set(IX+c.x, 5.7, c.z);
    roomSpot.target.position.set(IX+c.x, 0, c.z);
  }else{
    roomSpot.intensity = 0;                       // 通廊 / 外部不点亮
    roomSpot.position.set(player.x, 6, player.z);
    roomSpot.target.position.set(player.x, 0, player.z);
  }
  roomSpot.target.updateMatrixWorld();
}

/* ============ 阴影：批量开启 + 相机跟随玩家 ============ */
function setupShadows(){
  const flat = new Set(['PlaneGeometry','CircleGeometry','RingGeometry']);
  scene.traverse(o=>{
    if(!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // 发光体 / 半透明 / 线框不参与投影，避免自阴影与性能浪费
    if(mats.some(m => m.isMeshBasicMaterial || m.blending===THREE.AdditiveBlending
        || m.wireframe || (m.transparent && m.opacity<0.85))) return;
    o.castShadow = !(o.geometry && flat.has(o.geometry.type)) && !o.userData.noShadow;
    o.receiveShadow = true;
  });
}
let shadowTick = 0;
function updateShadowCam(dt){
  shadowTick += dt;
  if(shadowTick < 0.12) return;
  shadowTick = 0;
  moon.position.set(player.x+30, 62, player.z-22);
  moon.target.position.set(player.x, 0, player.z);
  moon.target.updateMatrixWorld();
}

/* ============ 画质分级 & 帧率自适应 ============ */
let bloomScale = 1, autoLevel = 2, upTries = 0, goodRuns = 0;
let fpsAcc = 0, fpsN = 0, fpsNow = 60, perfWarm = 0;
function applyQuality(){
  const lv = settings.qual==='auto' ? autoLevel : (+settings.qual);
  const s = lv>=2 ? Math.min(devicePixelRatio,2) : 1;
  if(Math.abs(renderer.getPixelRatio()-s) > 0.01){
    renderer.setPixelRatio(s);
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    fxaa.material.uniforms['resolution'].value.set(1/(innerWidth*s), 1/(innerHeight*s));
  }
  bloomScale      = lv>=2 ? 1 : (lv===1 ? 0.6 : 0);
  bloom.enabled   = lv>0;
  bloom.strength  = settings.bloom * bloomScale;
  fxaa.enabled    = lv>=1;
  const sh = lv>=2;
  if(renderer.shadowMap.enabled !== sh){
    renderer.shadowMap.enabled = sh;
    scene.traverse(o=>{ if(o.isMesh && o.material){
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=> m.needsUpdate=true);
    }});
  }
}
function perfTick(dt){
  perfWarm += dt;
  if(perfWarm < 3){ fpsAcc=0; fpsN=0; return; }   // 跳过启动期（着色器编译会造成假低帧）
  fpsAcc += dt; fpsN++;
  if(fpsAcc < 2) return;
  fpsNow = fpsN/fpsAcc; fpsAcc = 0; fpsN = 0;
  if(settings.qual !== 'auto') return;
  if(fpsNow < 34 && autoLevel > 0){ autoLevel--; goodRuns=0; applyQuality(); return; }
  if(fpsNow > 58) goodRuns++; else goodRuns = 0;
  // 回升需连续两次高帧率，且最多回升两次，避免来回抖动
  if(goodRuns >= 2 && autoLevel < 2 && upTries < 2){
    autoLevel++; upTries++; goodRuns=0; applyQuality();
  }
}

/* ============ 对话系统 ============ */
const dlgEl=document.getElementById('dlg');
const dlgWho=dlgEl.querySelector('.who'), dlgTxt=dlgEl.querySelector('.txt'), dlgMore=dlgEl.querySelector('.more');
let dlgOpen=false, dlgNpc=null, dlgIdx=0, dlgChars=0, dlgFull='';
function openDlg(n){
  if(dlgOpen) return;
  dlgOpen=true; dlgNpc=n; dlgIdx=0;
  dlgEl.classList.add('on');
  renderDlgLine();
}
function linesOf(n){ return typeof n.lines==='function' ? n.lines() : n.lines; }
function renderDlgLine(){
  const arr=linesOf(dlgNpc);
  dlgFull=arr[dlgIdx]||'……';
  dlgChars=0; dlgTxt.textContent=''; dlgMore.classList.remove('on');
  dlgWho.textContent=(dlgNpc.name||'')+' · '+(dlgIdx+1)+'/'+arr.length;
  sfxTalk();
}
function advanceDlg(){
  const arr=linesOf(dlgNpc);
  if(dlgChars<dlgFull.length){ dlgChars=dlgFull.length; dlgTxt.textContent=dlgFull; dlgMore.classList.add('on'); return; }
  if(dlgIdx<arr.length-1){ dlgIdx++; renderDlgLine(); return; }
  closeDlg();
}
function closeDlg(){ const n=dlgNpc; dlgOpen=false; dlgNpc=null; dlgEl.classList.remove('on'); dlgTxt.textContent=''; if(n && n.onTalk) n.onTalk(n); }
function typeDlg(dt){
  if(!dlgOpen) return;
  if(dlgChars<dlgFull.length){
    dlgChars=Math.min(dlgFull.length, dlgChars+dt*34);
    dlgTxt.textContent=dlgFull.slice(0, Math.floor(dlgChars));
    if(dlgChars>=dlgFull.length) dlgMore.classList.add('on');
  }
}

/* ============ 音效设置 ============ */
function applySettings(){
  bloom.strength = settings.bloom;
  applyAudioSettings();
}
function toggleMute(){
  settings.mute = !settings.mute;
  saveSettings();
  applyAudioSettings();
  if(bMute) bMute.textContent = '音效 · '+(settings.mute?'关':'开');
}

/* ============ 主循环 ============ */
const clock=new THREE.Clock();
let mmTick=0, curZone='exterior';
function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(), 0.05);
  const t=clock.elapsedTime;
  if(locked) updatePlayer(dt);
  else { camera.position.set(player.x, player.y, player.z); camera.rotation.order='YXZ'; camera.rotation.y=yaw; camera.rotation.x=pitch; }
  animators.forEach(f=>f(t));
  if(locked){
    typeDlg(dt);
    audioTick(dt);
    const zk=zoneKey();
    if(zk!==curZone){ curZone=zk; applyZone(zk); }
    mmTick+=dt; if(mmTick>0.06){ mmTick=0; drawMinimap(); }
    updateHUD();
    questTick();
    pulseVitals(t,dt);
  }
  updateShadowCam(dt);
  updateRoomSpot();
  perfTick(dt);
  composer.render();
}

/* ============ 参赛信息浮层（角标 / 关于） ============ */
const badgeEl = document.getElementById('badge');
const aboutEl = document.getElementById('about');
const aboutClose = document.getElementById('aboutClose');
let __entered = false;
function __showAbout(open){ if(aboutEl) aboutEl.classList.toggle('on', open); }
if(badgeEl) badgeEl.addEventListener('click', (e)=>{ e.stopPropagation(); __showAbout(true); });
if(aboutClose) aboutClose.addEventListener('click', (e)=>{ e.stopPropagation(); __showAbout(false); });
if(aboutEl){
  aboutEl.addEventListener('click', ()=> __showAbout(false));
  const __card = aboutEl.querySelector('.aboutCard');
  if(__card) __card.addEventListener('click', (e)=> e.stopPropagation());
}
addEventListener('keydown', (e)=>{ if(e.code==='KeyI' && aboutEl) __showAbout(!aboutEl.classList.contains('on')); });
document.addEventListener('pointerlockchange', ()=>{
  if(document.pointerLockElement){ __entered = true; if(badgeEl) badgeEl.classList.add('on'); }
  else if(__entered && badgeEl) badgeEl.classList.add('on');
  else if(badgeEl) badgeEl.classList.remove('on');
});

/* ============ 启动 ============ */
function init(){
  initEnvironment();
  initInterior();
  initHalls();
  initTokens();
  initNpcs();
  initQuest();
  setupShadows();
  document.getElementById('ld').style.display='none';
  applySettings(); applyQuality(); syncSettingsUI(); setMoodForPlace();
  loop();
  window.__TB_READY = true;
}
init();

/* 调试钩子（自动化测试用） */
window.__dbg = {
  ready: true,
  pos: ()=>({x:+(player.x-(rt.inInterior?IX:0)).toFixed(2), z:+player.z.toFixed(2), yaw:+yaw.toFixed(2), ii:rt.inInterior}),
  tp: (x,z,y,ii)=>{ if(ii!==undefined) rt.inInterior=ii; player.x=(rt.inInterior?IX:0)+x; player.z=z; if(y!==undefined) yaw=y; pitch=0; player.y=1.7; setMoodForPlace(); applyZone(zoneKey()); },
  zone: ()=>zoneKey(),
  tokens: ()=>({got:tokensDone(), list:TOKENS.map(t=>({id:t.id, taken:t.taken}))}),
  npcs: ()=>NPCS.map(n=>({name:n.name, ii:n.ii, x:n.x, z:n.z})),
  talk: (name)=>{ const n=NPCS.find(o=>o.name===name); if(n) openDlg(n); return !!n; },
  dlg: ()=>(dlgOpen? {name:dlgNpc.name, idx:dlgIdx, text:dlgFull} : null),
  key: (code, down)=>{ dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code})); },
  locked: ()=>locked,
  step: (dt)=>{ updatePlayer(dt||0.016); typeDlg(dt||0.016); },
  press: (code)=>{ onInteract(); },
  audio: ()=>audioState(),
  settings: ()=>JSON.parse(JSON.stringify(settings)),
  perf: ()=>({fps:Math.round(fpsNow), auto:autoLevel, qual:settings.qual,
              bloomOn:bloom.enabled, shadowOn:renderer.shadowMap.enabled, pr:renderer.getPixelRatio()}),
  shadows: ()=>{ let c=0,r=0; scene.traverse(o=>{ if(o.isMesh){ if(o.castShadow)c++; if(o.receiveShadow)r++; } }); return {cast:c, recv:r}; },
  setQual: (q)=>{ settings.qual=q; saveSettings(); applyQuality(); syncSettingsUI(); }
};
