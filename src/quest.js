import * as THREE from 'three';
import {
  scene, interior, renderer, toast, TOKENS, rt, IX, player, M, animators
} from './state.js';
import { sfxCollect, sfxChime } from './audio.js';
import { hubCrystal, hubCrystalLight } from './world/interior.js';

/* ============================================================
   主线任务系统：酒保托你取回四把「时空之钥」
   - 四厅各有一枚印记（tokens.js 负责收集）
   - 与守护灵过招（四种小游戏）赢下试炼 → 得钥匙
   - 四钥归位 → 回去找酒保重启酒馆（胜利）
   ============================================================ */

const HALL_INFO = {
  medieval: { name:'中土之钥', hall:'中土大厅', who:'吟游诗人', color:0xff8c3a, trial:'划拳' },
  scifi:    { name:'赛博之钥', hall:'赛博酒廊', who:'调酒机 VIX', color:0x27e6ff, trial:'密码' },
  xianxia:  { name:'茶寮之钥', hall:'修仙茶寮', who:'茶童',     color:0x58e08a, trial:'寻盏' },
  arcane:   { name:'书斋之钥', hall:'秘法书斋', who:'书灵',     color:0xb06cff, trial:'符文' }
};
const KEYS  = { medieval:false, scifi:false, xianxia:false, arcane:false };
const PART  = { medieval:{token:false}, scifi:{token:false}, xianxia:{token:false, item:false}, arcane:{token:false} };
let questStarted = false;
let finished = false;

/* DOM */
const questEl = document.getElementById('quest');
const mgEl    = document.getElementById('mg');
const mgCard  = document.getElementById('mgCard');
const winEl   = document.getElementById('win');

/* 修仙茶寮的「灵茶盏」——找物玩法 */
const TEA = { x:-33, z:7 };
let teaBowl = null, teaRevealed = false, teaFound = false;

/* 暴露给 npc.js 的只读状态（对话文案随进度变化） */
export const Q = {
  get started(){ return questStarted; },
  token:(h)=>PART[h].token,
  key:(h)=>KEYS[h],
  count(){ return (KEYS.medieval?1:0)+(KEYS.scifi?1:0)+(KEYS.xianxia?1:0)+(KEYS.arcane?1:0); }
};

export function allKeysDone(){ return KEYS.medieval&&KEYS.scifi&&KEYS.xianxia&&KEYS.arcane; }
export function isFinished(){ return finished; }

/* ============ 初始化 ============ */
export function initQuest(){
  buildTeaBowl();
  questEl && questEl.classList.remove('on');
}

function buildTeaBowl(){
  // interior 组已位于 x=IX，组内子物体用局部坐标
  const tg = new THREE.Group();
  tg.position.set(TEA.x, 0, TEA.z);
  interior.add(tg);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.14,0.22,18),
    M(0xe9e2d0,{roughness:.4, emissive:0x2a2418, emissiveIntensity:.2}));
  bowl.position.y = 0.7; tg.add(bowl);
  const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.02,18),
    new THREE.MeshBasicMaterial({color:0x7affd8}));
  tea.position.y = 0.8; tg.add(tea);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.3,0.6,24),
    new THREE.MeshBasicMaterial({color:0x7affd8, transparent:true, opacity:.4, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  halo.rotation.x = -Math.PI/2; halo.position.y = 0.06; tg.add(halo);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.4,4,16,1,true),
    new THREE.MeshBasicMaterial({color:0x7affd8, transparent:true, opacity:.12, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  beam.position.y = 2.2; tg.add(beam);
  glowLightLocal(tg, 0x7affd8, 5, 6, 0, 0.9, 0);
  tg.visible = false;
  animators.push(t=>{
    if(!tg.visible) return;
    halo.material.opacity = 0.3 + 0.18*Math.sin(t*2+1);
    beam.material.opacity = 0.08 + 0.06*Math.sin(t*2+1);
    tg.position.y = Math.sin(t*1.4)*0.04;
  });
  teaBowl = tg;
}
function glowLightLocal(parent, color, intensity, dist, x,y,z){
  const l = new THREE.PointLight(color, intensity, dist, 1.6);
  l.position.set(x,y,z); parent.add(l); return l;
}

/* ============ 每帧推进（由 core 的 loop 调用） ============ */
export function questTick(){
  if(!TOKENS.length) return;
  // 印记收集进度 → 任务追踪
  for(const h of ['medieval','scifi','xianxia','arcane']){
    const tk = TOKENS.find(t=>t.id===h);
    if(tk && tk.taken && !PART[h].token){ PART[h].token = true; updateTracker(); }
  }
  // 修仙：寻得灵茶盏
  if(rt.inInterior && teaRevealed && !teaFound){
    const lx = player.x - IX, lz = player.z;
    if(Math.hypot(lx - TEA.x, lz - TEA.z) < 1.8){
      teaFound = true; PART.xianxia.item = true;
      if(teaBowl) teaBowl.visible = false;
      sfxCollect();
      updateTracker();
      toast('寻得灵茶盏 · 茶寮之钥到手');
    }
  }
  // 茶寮之钥：印记 + 茶盏 二者齐备
  if(PART.xianxia.token && teaFound && !KEYS.xianxia) grantKey('xianxia');
}

/* ============ 对话结束钩子（core.closeDlg 调用） ============ */
export function onNpcTalk(npc){
  if(npc.id === 'bartender'){
    if(!questStarted) startQuest();
    else if(allKeysDone() && !finished) finishQuest();
    return;
  }
  if(!npc.hall) return;                 // 引路人等无任务
  const h = npc.hall;
  if(!questStarted){ toast('（先去中枢找酒保接下主线）'); return; }
  if(KEYS[h]){ toast('「'+HALL_INFO[h].who+'」：这一钥，早已归你。'); return; }
  if(!PART[h].token){ toast('先寻得本厅的印记'); return; }
  if(h === 'xianxia'){ revealTea(); return; }
  launchMinigame(h);
}

/* ============ 主线：开始 / 收尾 ============ */
function startQuest(){
  questStarted = true;
  questEl && questEl.classList.add('on');
  updateTracker();
  toast('主线任务 · 取回四把时空之钥', 4200);
}

function grantKey(h){
  if(KEYS[h]) return;
  KEYS[h] = true; sfxChime();
  toast('✓ 获得 '+HALL_INFO[h].name);
  updateTracker();
  if(allKeysDone()) toast('四钥归位 · 回去找中枢的酒保', 4200);
}

function finishQuest(){
  if(finished) return;
  finished = true;
  if(hubCrystal){ hubCrystal.scale.setScalar(2.2); hubCrystal.material.color.setHex(0xfff2cc); }
  if(hubCrystalLight) hubCrystalLight.intensity = 44;
  sfxChime();
  setTimeout(showWin, 750);
}
function showWin(){
  rt.modal = true;
  try{ document.exitPointerLock(); }catch(e){}
  winEl.classList.add('on');
  const card = winEl.querySelector('.card');
  card.innerHTML =
    '<div class="wink">✦</div>'
    + '<div class="wtitle">时空酒馆 · 重启</div>'
    + '<div class="wsub">四把时空之钥归位，中庭水晶苏醒</div>'
    + '<p class="wdesc">异客，你走完了全程。门会记得每一个走完全程的人——下次来，门会自己开。</p>'
    + '<button class="mgbtn" id="winClose">继续漫步</button>';
  const btn = document.getElementById('winClose');
  if(btn) btn.addEventListener('click', ()=>{
    winEl.classList.remove('on');
    rt.modal = false;
    try{ renderer.domElement.requestPointerLock(); }catch(e){}
  });
}

/* ============ 当前目标（一句话指路） ============ */
function objectiveText(){
  if(finished) return '主线已成 · 酒馆已重启，余下的时间随便逛';
  if(!questStarted) return '去中枢西南角的吧台，找「酒保 · 无名」接下主线';
  if(allKeysDone()) return '回中枢吧台，请酒保重启时空酒馆';
  const halls=['medieval','scifi','xianxia','arcane'];
  // 优先提示还缺印记的厅
  for(const h of halls){
    if(KEYS[h]) continue;
    if(!PART[h].token) return '去'+HALL_INFO[h].hall+'取「印记」（'+HALL_INFO[h].name+'尚未解锁）';
  }
  // 印记齐了但钥匙没拿全 → 提示试炼或寻物
  for(const h of halls){
    if(KEYS[h]) continue;
    if(h==='xianxia' && !PART.xianxia.item) return '茶童的灵茶盏落在茶寮某处 · 循着青绿微光去找';
    return '去找「'+HALL_INFO[h].who+'」，接受'+HALL_INFO[h].trial+'试炼';
  }
  return '四门通四界 · 慢慢走';
}

/* ============ 任务追踪 HUD ============ */
function updateTracker(){
  if(!questEl) return;
  if(!questStarted){ questEl.classList.remove('on'); return; }
  let rows = '';
  for(const h of ['medieval','scifi','xianxia','arcane']){
    const info = HALL_INFO[h];
    const c = '#' + info.color.toString(16).padStart(6,'0');
    const got = KEYS[h];
    rows += '<div class="qrow"><span class="qk" style="--c:'+c+'">'+(got?'✓':'○')+'</span>'
          + '<span class="qn">'+info.name+'</span>'
          + '<span class="qw">'+info.who+' · '+info.trial+'</span></div>';
  }
  questEl.innerHTML = '<div class="qhead">主线 · 取回四把时空之钥</div>'
    + rows
    + '<div class="qobj">▸ '+objectiveText()+'</div>'
    + (allKeysDone() ? '<div class="qfin">四钥归位 · 回去找酒保重启酒馆</div>' : '');
  questEl.classList.add('on');
}

/* ============ 修仙：揭示茶盏 ============ */
function revealTea(){
  if(teaRevealed) return;
  teaRevealed = true;
  if(teaBowl) teaBowl.visible = true;
  toast('茶童：我的灵茶盏落在茶寮某处，亮着微光——替我寻来');
}

/* ============ 小游戏浮层 ============ */
function openCard(html){
  mgCard.innerHTML = html;
  mgEl.classList.add('on');
}
function closeCard(){
  mgEl.classList.remove('on');
  rt.modal = false;
  try{ renderer.domElement.requestPointerLock(); }catch(e){}
}
function launchMinigame(h){
  rt.modal = true;
  try{ document.exitPointerLock(); }catch(e){}
  if(h === 'medieval') startRPS();
  else if(h === 'scifi') startCode();
  else if(h === 'arcane') startRune();
}

/* 中土 · 划拳（三局两胜） */
function startRPS(){
  let p = 0, ai = 0, over = false;
  const NAME = ['拳','掌','指'];
  function render(msg){
    if(over) return;
    openCard(
      '<div class="mgtitle">中土大厅 · 与吟游诗人划拳</div>'
      + '<div class="mgsub">三局两胜 —— 拳(石) 克 指；掌(布) 克 拳；指 克 掌</div>'
      + '<div class="rpsscore">你 <b>'+p+'</b> · <b>'+ai+'</b> 诗人</div>'
      + '<div class="rpsmsg">'+(msg||'请出招')+'</div>'
      + '<div class="rpsbtns">'
      +   '<button class="mgbtn" data-c="0">✊ 拳</button>'
      +   '<button class="mgbtn" data-c="1">✋ 掌</button>'
      +   '<button class="mgbtn" data-c="2">✌ 指</button>'
      + '</div>'
      + '<button class="mgleave" data-leave="1">离开</button>'
    );
    mgCard.querySelectorAll('.rpsbtns .mgbtn').forEach(b=>{
      b.addEventListener('click', ()=>{
        if(over) return;
        const c = +b.dataset.c, a = Math.floor(Math.random()*3);
        let res;
        if(c === a){ res = '平手，重来。'; }
        else if((c+1)%3 === a){ res = '诗人胜。'; ai++; }
        else { res = '你胜！'; p++; }
        render('你出'+NAME[c]+' · 诗人出'+NAME[a]+' —— '+res);
        if(p >= 2){ over = true; setTimeout(()=>{ grantKey('medieval'); closeCard(); }, 750); return; }
        if(ai >= 2){ p = 0; ai = 0; render('诗人先胜两局，重整旗鼓——再战！'); return; }
      });
    });
    const lv = mgCard.querySelector('[data-leave]');
    if(lv) lv.addEventListener('click', closeCard);
  }
  render('请出招');
}

/* 赛博 · 密码谜题（三位数推理） */
function startCode(){
  const ANS = '864';
  let buf = '';
  function setMsg(m){ const e = document.getElementById('cm'); if(e) e.textContent = m; }
  function render(){
    openCard(
      '<div class="mgtitle">赛博酒廊 · 调酒机 VIX 的密码</div>'
      + '<div class="mgsub">重启密码刻在门楣——三位数：<br>第一位是个位数里最大的偶数；第三位比第一位小 4；三者之和为 18。</div>'
      + '<div class="codeDisp">'+buf.padEnd(3,'_').split('').join(' ')+'</div>'
      + '<div class="codemsg" id="cm"></div>'
      + '<div class="pad">'
      +   [1,2,3,4,5,6,7,8,9,0].map(d=>'<button class="mgbtn padbtn" data-d="'+d+'">'+d+'</button>').join('')
      + '</div>'
      + '<div class="padrow"><button class="mgbtn" data-clr="1">清除</button><button class="mgbtn" data-ok="1">确认</button></div>'
      + '<button class="mgleave" data-leave="1">离开</button>'
    );
    mgCard.querySelectorAll('.padbtn').forEach(b=>{
      b.addEventListener('click', ()=>{ if(buf.length<3){ buf += b.dataset.d; render(); } });
    });
    const clr = mgCard.querySelector('[data-clr]'); if(clr) clr.addEventListener('click', ()=>{ buf=''; render(); });
    const ok = mgCard.querySelector('[data-ok]'); if(ok) ok.addEventListener('click', ()=>{
      if(buf.length < 3){ setMsg('还差几位。'); return; }
      if(buf === ANS){ grantKey('scifi'); closeCard(); }
      else { setMsg('VIX：密码不对，再想想。'); buf=''; render(); }
    });
    const lv = mgCard.querySelector('[data-leave]'); if(lv) lv.addEventListener('click', closeCard);
  }
  render();
}

/* 秘法 · 符文顺序（火→水→风→土） */
function startRune(){
  const ORDER = ['火','水','风','土'];
  const shuffled = [...ORDER].sort(()=>Math.random()-0.5);
  let prog = 0;
  function setMsg(m){ const e = document.getElementById('rm'); if(e) e.textContent = m; }
  function render(){
    openCard(
      '<div class="mgtitle">秘法书斋 · 书灵的星图</div>'
      + '<div class="mgsub">依序轻触四枚符文：火 → 水 → 风 → 土</div>'
      + '<div class="runemsg" id="rm">已点亮 '+prog+' / 4</div>'
      + '<div class="runes">'
      +   shuffled.map(r=>'<button class="mgbtn rune" data-r="'+r+'">'+r+'</button>').join('')
      + '</div>'
      + '<button class="mgleave" data-leave="1">离开</button>'
    );
    mgCard.querySelectorAll('.rune').forEach(b=>{
      b.addEventListener('click', ()=>{
        const r = b.dataset.r;
        if(r === ORDER[prog]){
          prog++; b.classList.add('lit'); b.disabled = true;
          setMsg('已点亮 '+prog+' / 4');
          if(prog >= 4){ grantKey('arcane'); setTimeout(closeCard, 650); }
        } else {
          prog = 0; setMsg('顺序有误，从头再来。');
          mgCard.querySelectorAll('.rune').forEach(x=>{ x.classList.remove('lit'); x.disabled = false; });
        }
      });
    });
    const lv = mgCard.querySelector('[data-leave]'); if(lv) lv.addEventListener('click', closeCard);
  }
  render();
}
