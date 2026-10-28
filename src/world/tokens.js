import * as THREE from 'three';
import { interior, M, B, glowLight, animators, TOKENS, toast } from '../state.js';
import { hubCrystal, hubCrystalLight } from './interior.js';
import { sfxCollect, sfxChime } from '../audio.js';

/* ============ 印记（四厅各一枚） ============ */
const TOKEN_DATA=[
  {id:'medieval', x:4.2,  z:33,   color:0xff8c3a, name:'中土之炭'},
  {id:'scifi',    x:4.2,  z:-33,  color:0x27e6ff, name:'赛博之电'},
  {id:'xianxia',  x:-34,  z:4.2,  color:0x58e08a, name:'茶寮之露'},
  {id:'arcane',   x:34,   z:-4.2, color:0xb06cff, name:'书斋之星'}
];
let doneRing=null;

const tkNumEl=document.getElementById('tkNum'), tkDots=document.querySelectorAll('#tokens .dot');
const pProgEl=document.getElementById('pProg');

function buildTokenMeshes(){
  TOKEN_DATA.forEach(tk=> TOKENS.push(Object.assign({}, tk, {taken:false, obj:null})));
  TOKENS.forEach(tk=>{
    // interior 组已位于 x=IX，组内子物体必须用局部坐标
    const g=new THREE.Group(); g.position.set(tk.x, 1.5, tk.z); interior.add(g);
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(0.26),
      new THREE.MeshStandardMaterial({color:tk.color, emissive:tk.color, emissiveIntensity:1.1, roughness:.25, metalness:.5}));
    const cage=new THREE.Mesh(new THREE.OctahedronGeometry(0.46),
      new THREE.MeshBasicMaterial({color:tk.color, wireframe:true, transparent:true, opacity:.55}));
    const halo=new THREE.Mesh(new THREE.RingGeometry(0.5,0.85,28),
      new THREE.MeshBasicMaterial({color:tk.color, transparent:true, opacity:.32, side:THREE.DoubleSide,
        blending:THREE.AdditiveBlending, depthWrite:false}));
    halo.rotation.x=-Math.PI/2; halo.position.y=-0.92;
    g.add(core); g.add(cage); g.add(halo);
    glowLight(tk.color, 6, 7, 0,0,0, g);
    tk.obj=g; tk.taken=false;
    animators.push(t=>{
      if(tk.taken) return;
      core.rotation.y=t*1.1; core.rotation.x=t*0.7; cage.rotation.y=-t*0.8;
      g.position.y=1.5+Math.sin(t*1.6+tk.x)*0.16;
      halo.material.opacity=0.24+0.16*Math.sin(t*2.2+tk.x);
    });
  });
  doneRing=new THREE.Mesh(new THREE.TorusGeometry(2.6,0.05,8,48),
    new THREE.MeshBasicMaterial({color:0xffe6a8, transparent:true, opacity:0,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  doneRing.rotation.x=Math.PI/2; doneRing.position.y=2.4; interior.add(doneRing);
  animators.push(t=>{ if(doneRing.material.opacity>0){ doneRing.rotation.z=t*0.5; doneRing.scale.setScalar(1+0.06*Math.sin(t*1.6)); } });
}

export function tokensDone(){ return TOKENS.reduce((n,t)=>n+(t.taken?1:0), 0); }

export function takeToken(tk){
  if(tk.taken) return;
  tk.taken=true; tk.obj.visible=false;
  sfxCollect();
  updateTokenHUD();
  toast('拾得印记 · '+tk.name+'（'+tokensDone()+'/4）');
  if(tokensDone()===4) onAllTokens();
}
function onAllTokens(){
  doneRing.material.opacity=0.8;
  if(hubCrystal){ hubCrystal.scale.setScalar(1.6); hubCrystal.material.color.setHex(0xfff2cc); }
  if(hubCrystalLight) hubCrystalLight.intensity=30;
  setTimeout(()=>{ toast('四印归位 · 酒馆记住了你的名字', 4600); sfxChime(); }, 900);
}

export function updateTokenHUD(){
  const n=tokensDone();
  tkNumEl.textContent=n+'/4';
  tkDots.forEach((d,i)=>d.classList.toggle('on', TOKENS[i].taken));
  pProgEl.textContent='印记 ◈ '+n+' / 4';
}

export function initTokens(){
  buildTokenMeshes();
  updateTokenHUD();
}
