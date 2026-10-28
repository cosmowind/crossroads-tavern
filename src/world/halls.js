import * as THREE from 'three';
import {
  interior, M, B, box, addSolid, glowLight, textTexture,
  floorTex, dust, animators, IX, HALLS, hallColorByOpen, timber, woodDk
} from '../state.js';

const PI2 = Math.PI/2;

/* ============ 厅壳（四向墙 + 浮空底座 + 通道） ============ */
function hallShell(h){
  const {cx,cz,open}=h;
  const wallM=M(0x232836,{roughness:.9});
  const H=6, T=0.5, half=9;
  const sides=[
    {id:'N', horiz:true,  fixed:cz+half},
    {id:'S', horiz:true,  fixed:cz-half},
    {id:'E', horiz:false, fixed:cx+half},
    {id:'W', horiz:false, fixed:cx-half},
  ];
  for(const s of sides){
    const seg=(c,len)=>{
      let m;
      if(s.horiz){ m=box(len,H,T,wallM,c,H/2,s.fixed); addSolid(IX+c, s.fixed, len, T); }
      else       { m=box(T,H,len,wallM,s.fixed,H/2,c); addSolid(IX+s.fixed, c, T, len); }
      return m;
    };
    if(s.id===open){
      if(s.horiz){ seg(cx-5.95,6.1); seg(cx+5.95,6.1); }
      else       { seg(cz-5.95,6.1); seg(cz+5.95,6.1); }
    } else {
      if(s.horiz) seg(cx,18+T); else seg(cz,18+T);
    }
  }
  // 浮空底座
  const slab=box(18.6,0.5,18.6, M(0x14171f), cx,-0.45,cz, interior);
  // 天花板：不投影（否则会挡住月光，室内家具就没有落地阴影了），带主题自发光便于辨识
  const hc = hallColorByOpen[open];
  const ceil=box(18.6,0.4,18.6,
    M(0x0c0f18,{roughness:.95, emissive:hc, emissiveIntensity:.16}), cx,6.2,cz, interior);
  ceil.userData.noShadow = true;
  // 顶棚靠自发光 + 主题装饰辨识，不额外加点光（控制场景灯数）
  // 通道地面
  const dir={N:[0,1],S:[0,-1],E:[1,0],W:[-1,0]}[open];
  const midx=cx+dir[0]*14.75, midz=cz+dir[1]*14.75;
  const fl=box(5.6,0.4,12.5, M(0x1a1e28), 0,-0.2,0, interior);
  if(dir[0]){
    fl.geometry.dispose(); fl.geometry=new THREE.BoxGeometry(12.5,0.4,5.6);
    fl.position.set(midx,-0.2,cz);
  } else {
    fl.geometry.dispose(); fl.geometry=new THREE.BoxGeometry(5.6,0.4,12.5);
    fl.position.set(cx,-0.2,midz);
  }
  // 通道侧墙
  if(dir[0]){
    box(12.5,5,0.5,wallM, midx,2.5, cz+3.15, interior); addSolid(IX+midx, cz+3.15, 12.5,0.5);
    box(12.5,5,0.5,wallM, midx,2.5, cz-3.15, interior); addSolid(IX+midx, cz-3.15, 12.5,0.5);
  } else {
    box(0.5,5,12.5,wallM, cx+3.15,2.5, midz, interior); addSolid(IX+cx+3.15, midz, 0.5,12.5);
    box(0.5,5,12.5,wallM, cx-3.15,2.5, midz, interior); addSolid(IX+cx-3.15, midz, 0.5,12.5);
  }
  // 通道顶棚（通道墙高 5，故压到 5.2；同样不投影）
  const cceil = dir[0]
    ? box(12.5,0.4,6.2, M(0x0c0f18,{roughness:.95, emissive:hallColorByOpen[open], emissiveIntensity:.07}), midx,5.2,cz, interior)
    : box(6.2,0.4,12.5, M(0x0c0f18,{roughness:.95, emissive:hallColorByOpen[open], emissiveIntensity:.07}), cx,5.2,midz, interior);
  cceil.userData.noShadow = true;
  // —— 通道地面流光引导带 ——
  const laneCol=hallColorByOpen[open];
  const laneLen=12.5;
  let lane;
  const laneMat=new THREE.MeshBasicMaterial({color:laneCol, transparent:true, opacity:0.0,
    blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false});
  if(dir[0]){
    lane=new THREE.Mesh(new THREE.PlaneGeometry(laneLen,0.55), laneMat);
    lane.rotation.x=-Math.PI/2; lane.position.set(midx,0.062,cz);
  } else {
    lane=new THREE.Mesh(new THREE.PlaneGeometry(0.55,laneLen), laneMat);
    lane.rotation.x=-Math.PI/2; lane.position.set(cx,0.062,midz);
  }
  interior.add(lane);
  // 多段流光（沿通道方向流动）
  const segs=4, segArr=[];
  for(let i=0;i<segs;i++){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(dir[0]?2.4:0.42, dir[0]?0.42:2.4),
      new THREE.MeshBasicMaterial({color:laneCol, transparent:true, opacity:0.0,
        blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false}));
    m.rotation.x=-Math.PI/2; m.position.y=0.064;
    if(dir[0]) m.position.set(midx-laneLen/2+1.2+i*(laneLen/segs), 0.064, cz);
    else       m.position.set(cx, 0.064, midz-laneLen/2+1.2+i*(laneLen/segs));
    interior.add(m); segArr.push(m);
  }
  animators.push(t=>{
    lane.material.opacity=0.12+0.05*Math.sin(t*1.5);
    segArr.forEach((m,i)=>{
      const ph=(t*0.7+i/segs)%1;
      m.material.opacity = Math.max(0, 0.55*(1-ph));
      const off = (ph-0.5)*laneLen;
      if(dir[0]) m.position.x = midx + off; else m.position.z = midz + off;
    });
  });
}

/* 每厅暖色补光 + 地面发光徽记（提升厅内可读性与 NPC 可见度） */
function buildHallFills(){
  HALLS.forEach(h=>{
    const c=h.color;
    glowLight(0xffe2b4, 7, 15, h.cx, 4.4, h.cz, interior);   // 柔和整体补光
    const med=new THREE.Mesh(new THREE.RingGeometry(2.6,2.95,48),
      new THREE.MeshBasicMaterial({color:c, transparent:true, opacity:.5, side:THREE.DoubleSide,
        blending:THREE.AdditiveBlending, depthWrite:false}));
    med.rotation.x=-Math.PI/2; med.position.set(h.cx,0.06,h.cz); interior.add(med);
    const med2=new THREE.Mesh(new THREE.CircleGeometry(2.5,40),
      new THREE.MeshBasicMaterial({color:c, transparent:true, opacity:.08, side:THREE.DoubleSide,
        blending:THREE.AdditiveBlending, depthWrite:false}));
    med2.rotation.x=-Math.PI/2; med2.position.set(h.cx,0.05,h.cz); interior.add(med2);
    const med3=new THREE.Mesh(new THREE.RingGeometry(1.2,1.32,40),
      new THREE.MeshBasicMaterial({color:0xffd88a, transparent:true, opacity:.4, side:THREE.DoubleSide,
        blending:THREE.AdditiveBlending, depthWrite:false}));
    med3.rotation.x=-Math.PI/2; med3.position.set(h.cx,0.055,h.cz); interior.add(med3);
    animators.push(t=>{ med.rotation.z=t*0.3; med.material.opacity=0.4+0.18*Math.sin(t*1.5); });
  });
}

/* 传送门环（含地面光圈引导） */
function portal(cx,cz,ry,color,name){
  const g=new THREE.Group(); g.position.set(cx,0,cz); g.rotation.y=ry; interior.add(g);
  const torus=new THREE.Mesh(new THREE.TorusGeometry(2.1,0.16,12,40), B(color));
  torus.position.y=2.3; g.add(torus);
  const disc=new THREE.Mesh(new THREE.CircleGeometry(1.95,32),
    new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.16, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false}));
  disc.position.y=2.3; g.add(disc);
  animators.push(t=>{ disc.scale.setScalar(0.96+Math.sin(t*2+cx)*0.04); });
  // —— 地面 pulse 光圈 ——
  const halo=new THREE.Mesh(new THREE.RingGeometry(1.7,2.55,40),
    new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.45, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  halo.rotation.x=-Math.PI/2; halo.position.y=0.05; g.add(halo);
  const halo2=new THREE.Mesh(new THREE.RingGeometry(0.3,0.7,32),
    new THREE.MeshBasicMaterial({color:0xffd88a, transparent:true, opacity:0.6, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  halo2.rotation.x=-PI2; halo2.position.y=0.05; g.add(halo2);
  animators.push(t=>{
    const k=0.5+0.5*Math.sin(t*2+cx);
    halo.material.opacity=0.2+0.3*k;
    halo.scale.setScalar(0.92+0.12*k);
    halo2.rotation.z = t*0.8;
  });
  const tex=textTexture((gg)=>{
    gg.fillStyle='rgba(10,12,18,0.85)'; gg.fillRect(0,0,512,96);
    gg.fillStyle='#'+color.toString(16).padStart(6,'0'); gg.font='bold 46px "KaiTi",serif';
    gg.textAlign='center'; gg.fillText(name,256,64);
  },512,96);
  const plaque=new THREE.Mesh(new THREE.PlaneGeometry(4,0.75), new THREE.MeshBasicMaterial({map:tex,transparent:true}));
  plaque.position.y=5.1; g.add(plaque);
}

/* 回归之门（东北对角） */
export const EXIT={x:5.8,z:5.8};
function buildExit(){
  const g=new THREE.Group(); g.position.set(EXIT.x,0,EXIT.z); g.rotation.y=-Math.PI/4; interior.add(g);
  box(0.35,3.6,0.35, timber, -1.1,1.8,0, g);
  box(0.35,3.6,0.35, timber, 1.1,1.8,0, g);
  box(2.9,0.4,0.45, timber, 0,3.7,0, g);
  const gl=new THREE.Mesh(new THREE.PlaneGeometry(1.85,3.1), B(0xffd25e,{transparent:true,opacity:.35,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  gl.position.y=1.65; g.add(gl);
  const tex=textTexture((gg)=>{
    gg.clearRect(0,0,256,64); gg.fillStyle='#ffd25e'; gg.font='bold 40px "KaiTi",serif';
    gg.textAlign='center'; gg.fillText('回歸之門',128,46);
  },256,64);
  const p=new THREE.Mesh(new THREE.PlaneGeometry(2.6,0.65), new THREE.MeshBasicMaterial({map:tex,transparent:true}));
  p.position.y=4.25; g.add(p);
  animators.push(t=>{ gl.material.opacity=0.28+0.12*Math.sin(t*2.2); });
}

/* ============ 四个主题厅 ============ */
function medieval(){
  const c={x:0,z:30};
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(17.4,17.4),
    new THREE.MeshStandardMaterial({map:floorTex(g=>{
      g.fillStyle='#4a3520'; g.fillRect(0,0,256,256);
      for(let i=0;i<8;i++){
        const y=i*32;
        g.fillStyle = i%2 ? '#563d24' : '#483320';
        g.fillRect(0,y,256,31);
        g.strokeStyle='rgba(0,0,0,.5)'; g.lineWidth=2;
        g.beginPath(); g.moveTo(0,y+31); g.lineTo(256,y+31); g.stroke();
        g.strokeStyle='rgba(255,225,175,.055)'; g.lineWidth=1;
        for(let k=0;k<3;k++){ g.beginPath(); g.moveTo(0,y+7+k*9);
          g.bezierCurveTo(80,y+3+k*9,170,y+13+k*9,256,y+7+k*9); g.stroke(); }
      }
    },4), roughness:.85}));
  fl.rotation.x=-Math.PI/2; fl.position.set(c.x,0.02,c.z); interior.add(fl);
  // 木梁天花板
  for(let i=0;i<5;i++){
    const bm=box(17.6,0.34,0.42, M(0x3b2a19), c.x,5.82,c.z-7+i*3.5, interior);
    bm.castShadow=true;
  }
  box(0.5,0.5,17.6, M(0x3b2a19), c.x-7,5.82,c.z, interior);
  box(0.5,0.5,17.6, M(0x3b2a19), c.x+7,5.82,c.z, interior);
  // 壁炉
  box(4,3.2,0.8, M(0x6e6a62), c.x,1.6,c.z+8.4, interior);
  box(2.2,2,0.3, B(0x090604), c.x,1.0,c.z+7.95, interior);
  const fire=new THREE.Mesh(new THREE.ConeGeometry(0.7,1.2,8), B(0xff7a2a));
  fire.position.set(c.x,0.8,c.z+8.1); interior.add(fire);
  const fl1=glowLight(0xff7a30, 20, 16, IX+c.x, 1.6, c.z+7.3);
  animators.push(t=>{ fl1.intensity=17+Math.sin(t*9)*3+Math.sin(t*23)*2; fire.scale.y=1+Math.sin(t*11)*0.18; });
  // 长桌长凳
  [[-3.5,26],[3.5,26]].forEach(([x,z])=>{
    const g=new THREE.Group(); g.position.set(x,0,z); interior.add(g);
    box(4.6,0.16,1.5, M(0x6b4a2a), 0,1.02,0, g);
    [[-2,-0.5],[2,-0.5],[-2,0.5],[2,0.5]].forEach(([lx,lz])=> box(0.16,1,0.16, woodDk, lx,0.5,lz, g));
    box(4.4,0.1,0.5, M(0x5a3d22), 0,0.5,1.35, g); box(4.4,0.1,0.5, M(0x5a3d22), 0,0.5,-1.35, g);
    [[-1.2],[0],[1.2]].forEach(([tx])=>{
      const cup=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.07,0.24,8), M(0x8a7350));
      cup.position.set(tx,1.22,0); g.add(cup);
    });
  });
  // 吊灯
  const ch=new THREE.Group(); ch.position.set(c.x,4.6,c.z+2); interior.add(ch);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(1.1,0.07,8,24), woodDk);
  wheel.rotation.x=Math.PI/2; ch.add(wheel);
  for(let i=0;i<6;i++){
    const cd=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.3,6), B(0xffe0a0));
    const a=i/6*Math.PI*2; cd.position.set(Math.cos(a)*1.1,0.2,Math.sin(a)*1.1); ch.add(cd);
    const fl2=new THREE.Mesh(new THREE.SphereGeometry(0.06,6,6), B(0xffcf7a));
    fl2.position.copy(cd.position).y+=0.2; ch.add(fl2);
  }
  box(0.08,1.4,0.08, woodDk, 0,0.7,0, ch);
  const chL=glowLight(0xffb35e, 15, 15, IX+c.x, 4.8, c.z+2);
  animators.push(t=>{ chL.intensity=14+Math.sin(t*3.1)*1.2+Math.sin(t*7.7)*0.8; });
  // 旗帜
  [[-8.6,0x7a1f1f],[8.6,0x1f3a7a]].forEach(([x,col])=>{
    const b=new THREE.Mesh(new THREE.PlaneGeometry(1.4,3.2), M(col,{side:THREE.DoubleSide}));
    b.position.set(x,3.6,c.z+4); interior.add(b);
  });
  // 酒桶堆
  [[6.5,36],[7.5,35],[6.9,34]].forEach(([x,z])=>{
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.55,1.2,12), M(0x6b4a2a));
    b.position.set(x,0.6,z); interior.add(b);
  });
  dust(c.x, c.z, 70, 0xffb765, 0.06, 8, 5.4);   // 炉火浮尘
}
function scifi(){
  const c={x:0,z:-30};
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(17.4,17.4),
    new THREE.MeshStandardMaterial({map:floorTex(g=>{
      g.fillStyle='#080c16'; g.fillRect(0,0,256,256);
      g.strokeStyle='rgba(39,230,255,.30)'; g.lineWidth=2;
      for(let i=0;i<=4;i++){ const p=i*64;
        g.beginPath(); g.moveTo(p,0); g.lineTo(p,256); g.moveTo(0,p); g.lineTo(256,p); g.stroke(); }
      g.strokeStyle='rgba(39,230,255,.10)'; g.lineWidth=1;
      for(let i=0;i<=16;i++){ const p=i*16;
        g.beginPath(); g.moveTo(p,0); g.lineTo(p,256); g.moveTo(0,p); g.lineTo(256,p); g.stroke(); }
    },4), roughness:.25, metalness:.85}));
  fl.rotation.x=-Math.PI/2; fl.position.set(c.x,0.02,c.z); interior.add(fl);
  // 天花板霓虹格栅
  for(let i=0;i<4;i++){
    const nb=box(17.4,0.06,0.14, B(i%2?0x27e6ff:0xff3adf), c.x,5.94,c.z-6+i*4, interior);
    animators.push(t=>{ nb.material.color.setHex(Math.sin(t*2+i*1.7)>0.2 ? (i%2?0x27e6ff:0xff3adf) : 0x0a1420); });
  }
  box(0.14,0.06,17.4, B(0x27e6ff), c.x-6,5.94,c.z, interior);
  box(0.14,0.06,17.4, B(0xff3adf), c.x+6,5.94,c.z, interior);
  // 地缘霓虹
  [[0,-8.3,17,0.12],[0,8.3,17,0.12],[-8.3,0,0.12,17],[8.3,0,0.12,17]].forEach(([x,z,w,d])=>{
    box(w,0.06,d, B(0x27e6ff), c.x+x,0.06,c.z+z, interior);
  });
  // 服务器机柜
  for(let i=0;i<4;i++){
    box(1.1,3.2,0.8, M(0x12161f,{roughness:.4,metalness:.7}), c.x-7+i*2.4,1.6,c.z+8.2, interior);
    for(let j=0;j<6;j++){
      box(0.7,0.05,0.02, B(i%2?0x27e6ff:0xff3adf), c.x-7+i*2.4, 0.6+j*0.45, c.z+7.78, interior);
    }
  }
  // 中央全息
  const holo=new THREE.Mesh(new THREE.IcosahedronGeometry(1.1,1), B(0x27e6ff,{wireframe:true,transparent:true,opacity:.55}));
  holo.position.set(c.x,2.2,c.z); interior.add(holo);
  animators.push(t=>{ holo.rotation.y=t*0.8; holo.rotation.x=t*0.3; holo.material.opacity=0.4+0.18*Math.sin(t*7); });
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.7,0.05,8,48), B(0xff3adf,{transparent:true,opacity:.7}));
  ring.position.set(c.x,2.2,c.z); ring.rotation.x=Math.PI/2; interior.add(ring);
  animators.push(t=>{ ring.rotation.z=t*1.4; });
  // 全息面板
  [[-4,3.2,-3],[4.5,2.8,2],[-1,3.6,4]].forEach(([x,y,z],i)=>{
    const p=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1),
      new THREE.MeshBasicMaterial({color:i? 0x27e6ff:0xff3adf, transparent:true, opacity:.25, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
    p.position.set(c.x+x,y,c.z+z); p.rotation.y=i*1.1; interior.add(p);
    animators.push(t=>{ p.material.opacity=0.18+0.1*Math.abs(Math.sin(t*3+i*2)); });
  });
  // 休眠舱
  const pod=new THREE.Mesh(new THREE.CapsuleGeometry(0.6,1.6,6,14), M(0x9aa4b4,{metalness:.8,roughness:.25}));
  pod.position.set(c.x-5.5,1.05,c.z-4); pod.rotation.z=Math.PI/2; pod.rotation.y=0.7; interior.add(pod);
  const n1=glowLight(0x27e6ff, 14, 16, IX+c.x, 3, c.z);
  const n2=glowLight(0xff3adf, 9, 12, IX+c.x+5, 2.2, c.z-3);
  // 霓虹不稳定闪烁
  animators.push(t=>{
    const f=Math.sin(t*13)*Math.sin(t*5.3);
    n1.intensity = 14 + Math.sin(t*2.2)*2 + (f>0.86? -5:0);
    n2.intensity = 9 + Math.sin(t*1.7+1)*1.6 + (Math.sin(t*19)>0.93? -4:0);
  });
  dust(c.x, c.z, 60, 0x6fe8ff, 0.05, 8, 5.4);
}
function xianxia(){
  const c={x:-30,z:0};
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(17.4,17.4),
    new THREE.MeshStandardMaterial({map:floorTex(g=>{
      g.fillStyle='#a39678'; g.fillRect(0,0,256,256);
      g.strokeStyle='rgba(88,78,58,.5)'; g.lineWidth=3;
      for(let r=0;r<4;r++) for(let q=0;q<4;q++) g.strokeRect(r*64+2, q*64+2, 60, 60);
      g.fillStyle='rgba(255,255,255,.05)';
      for(let i=0;i<220;i++) g.fillRect(Math.random()*256, Math.random()*256, 2, 2);
    },4), roughness:.9}));
  fl.rotation.x=-Math.PI/2; fl.position.set(c.x,0.02,c.z); interior.add(fl);
  // 藻井（同心方框）
  [[6.6,0x7d5730,0.36],[4.4,0x8f6638,0.30],[2.2,0xa37a48,0.24]].forEach(([sz,col,th])=>{
    const ring=new THREE.Mesh(new THREE.TorusGeometry(sz*0.72,th/2,6,4),
      M(col,{emissive:0x3a2a16, emissiveIntensity:.5}));
    ring.rotation.x=Math.PI/2; ring.rotation.z=Math.PI/4;
    ring.position.set(c.x,5.85,c.z); interior.add(ring);
  });
  box(0.5,0.5,0.5, M(0x9a7248), c.x,5.95,c.z, interior);
  // 竹林
  const bambooM=M(0x3f7a44);
  for(let i=0;i<16;i++){
    const bx=c.x-8+Math.random()*3.5, bz=c.z-8+Math.random()*16;
    const hgt=3.5+Math.random()*2;
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,hgt,7), bambooM);
    b.position.set(bx,hgt/2,bz); b.rotation.z=(Math.random()-.5)*0.08; interior.add(b);
    for(let l=0;l<3;l++){
      const lf=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.7,4), M(0x4f9a54));
      lf.position.set(bx+(Math.random()-.5)*.4, hgt*(0.55+l*0.15), bz+(Math.random()-.5)*.4);
      lf.rotation.z=1.2; interior.add(lf);
    }
  }
  // 浮空灯
  const lans=[];
  for(let i=0;i<8;i++){
    const l=new THREE.Mesh(new THREE.SphereGeometry(0.2,10,10), B(0xffa544));
    l.position.set(c.x-5+Math.random()*10, 1.6+Math.random()*2.6, c.z-6+Math.random()*12);
    interior.add(l); lans.push({m:l, y:l.position.y, ph:Math.random()*6});
  }
  animators.push(t=>{ lans.forEach(o=>{ o.m.position.y=o.y+Math.sin(t*0.9+o.ph)*0.22; }); });
  // 水墨挂轴
  const scrollTex=textTexture((g)=>{
    g.fillStyle='#efe8d5'; g.fillRect(0,0,256,160);
    g.strokeStyle='#22201c'; g.lineWidth=10; g.beginPath();
    g.arc(128,80,52,0.6,5.6); g.stroke();
    g.fillStyle='#b8402a'; g.fillRect(200,120,22,22);
  },256,160);
  const scroll=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.65), new THREE.MeshStandardMaterial({map:scrollTex,roughness:.9}));
  scroll.position.set(c.x-8.3,3,c.z-3); scroll.rotation.y=Math.PI/2; interior.add(scroll);
  // 剑架
  const sg=new THREE.Group(); sg.position.set(c.x+6,0,c.z-6.5); interior.add(sg);
  box(2,0.12,0.3, woodDk, 0,1.3,0, sg);
  box(2,0.12,0.3, woodDk, 0,0.5,0, sg);
  [[-0.6,0.12],[0,0],[0.6,-0.1]].forEach(([sx,rz])=>{
    const sw=box(0.07,2.2,0.02, M(0xc8ccd4,{metalness:.9,roughness:.2}), sx,0.9,0.12, sg);
    sw.rotation.z=rz;
    box(0.16,0.3,0.05, M(0x8a6a2a,{metalness:.6}), sx,1.75,0.12, sg);
  });
  // 蒲团
  const plat=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.8,0.3,24), M(0x8a8270));
  plat.position.set(c.x-3.5,0.15,c.z+5); interior.add(plat);
  const cush=new THREE.Mesh(new THREE.SphereGeometry(0.5,12,10), M(0x8a3030));
  cush.scale.y=0.4; cush.position.set(c.x-3.5,0.42,c.z+5); interior.add(cush);
  // 桃枝
  const tg=new THREE.Group(); tg.position.set(c.x+7.5,0,c.z+7); interior.add(tg);
  const pot=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.65,0.6,12), M(0x7a5a3a));
  pot.position.y=0.3; tg.add(pot);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.16,2.4,8), M(0x4a3320));
  trunk.position.y=1.7; trunk.rotation.z=0.25; tg.add(trunk);
  for(let i=0;i<7;i++){
    const bl=new THREE.Mesh(new THREE.SphereGeometry(0.24,8,8), M(0xe89ab0));
    bl.position.set((Math.random()-.5)*1.4, 2.6+Math.random()*0.9, (Math.random()-.5)*1.2); tg.add(bl);
  }
  const lanternLight=glowLight(0xffb35e, 13, 15, IX+c.x, 3.2, c.z);
  glowLight(0x58e08a, 5, 9, IX+c.x-6, 2, c.z+4);
  animators.push(t=>{ lanternLight.intensity=13+Math.sin(t*1.4)*2.2+Math.sin(t*4.3)*1.1; });
  dust(c.x, c.z, 55, 0xffd9a0, 0.07, 8, 5.4);   // 灯下浮尘
}
function arcane(){
  const c={x:30,z:0};
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(17.4,17.4),
    new THREE.MeshStandardMaterial({map:floorTex(g=>{
      g.fillStyle='#120c22'; g.fillRect(0,0,256,256);
      g.strokeStyle='rgba(176,108,255,.26)'; g.lineWidth=1.5;
      g.beginPath(); g.arc(128,128,92,0,6.283); g.stroke();
      g.beginPath(); g.arc(128,128,58,0,6.283); g.stroke();
      for(let i=0;i<12;i++){ const a=i/12*6.283;
        g.beginPath(); g.moveTo(128+Math.cos(a)*58,128+Math.sin(a)*58);
        g.lineTo(128+Math.cos(a)*92,128+Math.sin(a)*92); g.stroke(); }
      g.fillStyle='rgba(226,206,255,.45)';
      for(let i=0;i<70;i++){ const a=Math.random()*6.283, r=Math.random()*120;
        g.fillRect(128+Math.cos(a)*r,128+Math.sin(a)*r,1.6,1.6); }
    },3), roughness:.6}));
  fl.rotation.x=-Math.PI/2; fl.position.set(c.x,0.02,c.z); interior.add(fl);
  // 星穹天花板
  {
    const N=260, pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const a=Math.random()*6.283, r=Math.sqrt(Math.random())*8.6;
      pos[i*3]=Math.cos(a)*r; pos[i*3+1]=5.72+Math.random()*0.15; pos[i*3+2]=Math.sin(a)*r;
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const sky=new THREE.Points(g, new THREE.PointsMaterial({color:0xd8bcff, size:0.11,
      transparent:true, opacity:.9, blending:THREE.AdditiveBlending, depthWrite:false}));
    sky.position.set(c.x,0,c.z); interior.add(sky);
    animators.push(t=>{ sky.rotation.y=t*0.02; });
  }
  // 法阵
  const rc=new THREE.Mesh(new THREE.RingGeometry(2.2,2.7,48), B(0xb06cff,{transparent:true,opacity:.8,side:THREE.DoubleSide}));
  rc.rotation.x=-Math.PI/2; rc.position.set(c.x,0.04,c.z); interior.add(rc);
  for(let i=0;i<6;i++){
    const sp=box(0.1,0.02,2.1, B(0x8a4aff,{transparent:true,opacity:.7}), c.x,0.04,c.z, interior);
    sp.rotation.y=i*Math.PI/6; sp.position.x=c.x+Math.cos(i*Math.PI/6)*1.1; sp.position.z=c.z+Math.sin(i*Math.PI/6)*1.1;
    sp.rotation.y=i*Math.PI/3;
  }
  animators.push(t=>{ rc.rotation.z=t*0.4; });
  // 浮空水晶
  const crys=[];
  for(let i=0;i<7;i++){
    const s=0.3+Math.random()*0.55;
    const m=new THREE.Mesh(new THREE.OctahedronGeometry(s), M(0x7a4ae0,{emissive:0x5a2ad0, emissiveIntensity:.8, roughness:.2, metalness:.4}));
    m.position.set(c.x-5+Math.random()*10, 1.6+Math.random()*2.6, c.z-5+Math.random()*10);
    interior.add(m); crys.push({m, y:m.position.y, ph:Math.random()*6});
  }
  animators.push(t=>{ crys.forEach(o=>{ o.m.position.y=o.y+Math.sin(t*1.1+o.ph)*0.25; o.m.rotation.y=t*0.8+o.ph; }); });
  // 书架
  [[c.x,c.z+8.2,0],[c.x-8.2,c.z,Math.PI/2],[c.x,c.z-8.2,0]].forEach(([x,z,ry])=>{
    const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=ry; interior.add(g);
    box(4.4,3.4,0.5, M(0x2a1f38), 0,1.7,0, g);
    const cols=[0xb84a4a,0x4a7ab8,0xb8a24a,0x6ab84a,0x9a4ab8];
    for(let row=0;row<4;row++) for(let i=0;i<8;i++){
      const bk=box(0.32,0.55,0.14, M(cols[(row+i)%5]), -1.8+i*0.5, 0.65+row*0.8, 0.28, g);
      bk.rotation.z=(i%3-1)*0.05;
    }
  });
  // 环绕浮书
  const books=[];
  for(let i=0;i<6;i++){
    const bk=box(0.4,0.55,0.1, M([0xb84a4a,0x4a7ab8,0xb8a24a][i%3]), 0,0,0, interior);
    books.push({m:bk, ph:i/6*Math.PI*2});
  }
  animators.push(t=>{ books.forEach(o=>{
    o.m.position.set(c.x+Math.cos(t*0.7+o.ph)*3.2, 1.6+Math.sin(t*1.5+o.ph)*0.4, c.z+Math.sin(t*0.7+o.ph)*3.2);
    o.m.rotation.y=-(t*0.7+o.ph)+Math.PI/2; o.m.rotation.z=Math.sin(t+o.ph)*0.15;
  });});
  // 中央传送环
  const pr=new THREE.Mesh(new THREE.TorusGeometry(1.5,0.1,10,40), B(0xd06cff));
  pr.position.set(c.x,2.4,c.z); interior.add(pr);
  animators.push(t=>{ pr.rotation.y=t*1.2; pr.rotation.x=Math.sin(t*0.6)*0.5; });
  const arcL=glowLight(0xb06cff, 16, 17, IX+c.x, 3, c.z);
  // 法阵呼吸
  animators.push(t=>{
    const k=0.5+0.5*Math.sin(t*0.9);
    rc.material.opacity=0.55+0.35*k;
    arcL.intensity=14+3.5*k;
  });
  dust(c.x, c.z, 75, 0xc79bff, 0.06, 8, 5.4);   // 灵尘
}

export function initHalls(){
  HALLS.forEach(hallShell);
  buildHallFills();
  portal(0,8.2,0,0xff8c3a,'中土大厅');
  portal(0,-8.2,Math.PI,0x27e6ff,'赛博酒廊');
  portal(-8.2,0,PI2,0x58e08a,'修仙茶寮');
  portal(8.2,0,-PI2,0xb06cff,'秘法书斋');
  buildExit();
  medieval(); scifi(); xianxia(); arcane();
  dust(0, 0, 50, 0xffd88a, 0.05, 8.4, 5.4);        // 枢纽
  [[0,15],[0,-15],[-15,0],[15,0]].forEach(([x,z])=> dust(x, z, 22, 0x9fb8ff, 0.045, 2.4, 5.4)); // 四道通廊
}
