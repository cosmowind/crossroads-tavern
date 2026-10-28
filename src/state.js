import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

/* ============ 基础渲染 ============ */
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a10);
scene.fog = new THREE.FogExp2(0x070a10, 0.011);

export const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 600);
export const renderer = new THREE.WebGLRenderer({canvas:document.getElementById('main'), antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

/* —— 后处理：Bloom + FXAA —— */
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// threshold 提高：只让真正的强光源泛光，避免窗/门整片过曝糊成白块
export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.74, 0.5, 0.62);
composer.addPass(bloom);
export const fxaa = new ShaderPass(FXAAShader);
composer.addPass(fxaa);
composer.addPass(new OutputPass());
(function initFxaaRes(){
  const s=Math.min(devicePixelRatio,2);
  fxaa.material.uniforms['resolution'].value.set(1/(innerWidth*s), 1/(innerHeight*s));
})();

addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  const s=Math.min(devicePixelRatio,2);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  fxaa.material.uniforms['resolution'].value.set(1/(innerWidth*s), 1/(innerHeight*s));
});

/* 灯光（外部） */
export const hemi = new THREE.HemisphereLight(0x3a4a6a, 0x1a140c, 0.7);
scene.add(hemi);
export const moon = new THREE.DirectionalLight(0x9db8e8, 0.7);
moon.position.set(35, 62, -25);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
// 阴影相机收紧并跟随玩家（内部空间在 x=1000，固定相机照不到）
moon.shadow.camera.left=-30; moon.shadow.camera.right=30;
moon.shadow.camera.top=30;   moon.shadow.camera.bottom=-30;
moon.shadow.camera.near=1;   moon.shadow.camera.far=180;
moon.shadow.bias=-0.0009;    moon.shadow.normalBias=0.025;
scene.add(moon);
scene.add(moon.target);

/* ============ 工具 ============ */
export const animators = [];
export const solids = [];   // {x1,x2,z1,z2}
export const R = 0.38;      // 玩家半径

export function M(c, o={}){ return new THREE.MeshStandardMaterial({color:c, roughness:.85, metalness:0, ...o}); }
export function B(c, o={}){ return new THREE.MeshBasicMaterial({color:c, ...o}); }
// 共享木材质（外部酒馆、内部、各厅通用）
export const timber = M(0x4a3320,{roughness:.9});
export const woodDk = M(0x3a2817,{roughness:.9});
export function box(w,h,d,mat,x,y,z,parent=scene,ry=0){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); m.rotation.y = ry; parent.add(m); return m;
}
export function addSolid(cx,cz,w,d){ solids.push({x1:cx-w/2, x2:cx+w/2, z1:cz-d/2, z2:cz+d/2}); }
export function glowLight(color, intensity, dist, x,y,z, parent=scene){
  const l = new THREE.PointLight(color, intensity, dist, 1.6);
  l.position.set(x,y,z); parent.add(l); return l;
}
export function textTexture(draw, w=256, h=256){
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
/* 可平铺的程序化地面纹理 */
export function floorTex(draw, rep=4){
  const t = textTexture(draw, 256, 256);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 8;
  return t;
}
/* 漂浮微粒（尘埃 / 萤火 / 灵尘） */
export function dust(cx, cz, count, color, size, area=8, top=5, parent=interior){
  const pos = new Float32Array(count*3), seed = [];
  for(let i=0;i<count;i++){
    const x=(Math.random()-0.5)*area*2, z=(Math.random()-0.5)*area*2, y=Math.random()*top;
    pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
    seed.push({x, y, z, ph:Math.random()*6.283, sp:0.08+Math.random()*0.22, sw:0.3+Math.random()*0.5});
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color, size, transparent:true, opacity:.6, sizeAttenuation:true,
    blending:THREE.AdditiveBlending, depthWrite:false }));
  p.position.set(cx, 0, cz); parent.add(p);
  animators.push(t=>{
    const a = g.attributes.position.array;
    for(let i=0;i<count;i++){
      const s = seed[i];
      a[i*3]   = s.x + Math.sin(t*0.28+s.ph)*s.sw;
      a[i*3+1] = (s.y + t*s.sp) % top;
      a[i*3+2] = s.z + Math.cos(t*0.23+s.ph*1.3)*s.sw;
    }
    g.attributes.position.needsUpdate = true;
  });
  return p;
}

/* ============ 共享世界状态 ============ */
export const IX = 1000;
export const interior = new THREE.Group(); interior.position.set(IX,0,0); scene.add(interior);
export const HALLS = [
  {key:'N', cx:0,   cz:30,  open:'S', name:'中土大厅 · Middle-earth Hall', color:0xff8c3a},
  {key:'S', cx:0,   cz:-30, open:'N', name:'赛博酒廊 · Neon Lounge',       color:0x27e6ff},
  {key:'W', cx:-30, cz:0,   open:'E', name:'修仙茶寮 · Immortal Tea House',color:0x58e08a},
  {key:'E', cx:30,  cz:0,   open:'W', name:'秘法书斋 · Arcane Study',      color:0xb06cff},
];
export const hallColorByOpen = {N:0x27e6ff,S:0xff8c3a,E:0xb06cff,W:0x58e08a}; // 朝该方向门对应的厅色
export const NPCS = [];
export const TOKENS = [];
export const player = { x:0, y:1.7, z:14 };

/* 跨模块可变运行时状态（npc / core 共享读取与写入） */
export const rt = { inInterior:false, modal:false };

/* ============ 设置（持久化） ============ */
export const DEF_SET = {sens:2.2, vol:60, bloom:0.74, mute:false, qual:'auto'};
export const settings = Object.assign({}, DEF_SET);
try{ Object.assign(settings, JSON.parse(localStorage.getItem('tavern.settings')||'{}')); }catch(e){}
export function saveSettings(){ try{ localStorage.setItem('tavern.settings', JSON.stringify(settings)); }catch(e){} }

/* ============ 顶部提示 ============ */
const toastEl = document.getElementById('toast');
let toastTimer = null;
export function toast(msg, ms){
  toastEl.textContent = msg; toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toastEl.classList.remove('on'), ms||2600);
}
