import * as THREE from 'three';
import { interior, M, B, box, addSolid, glowLight, animators, IX, woodDk } from '../state.js';

export let hubCrystal=null, hubCrystalLight=null;

/* ============ 内部空间（折叠于千里之外） ============ */
export function initInterior(){
  /* 内部星空 */
  {
    const N=700, pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const v=new THREE.Vector3().randomDirection().multiplyScalar(60+Math.random()*120);
      pos.set([v.x, Math.abs(v.y)*0.8+2, v.z], i*3);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    interior.add(new THREE.Points(g, new THREE.PointsMaterial({color:0xbcc8ff, size:1.1, sizeAttenuation:false, fog:false})));
    interior.add(new THREE.AmbientLight(0x4a5268, 1.7));
    interior.add(new THREE.HemisphereLight(0x6b7690, 0x16120c, 0.95));
  }

  /* 枢纽地面 + 结界 */
  {
    const disk=new THREE.Mesh(new THREE.CylinderGeometry(8.6,8.9,0.4,40), M(0x1c2029,{roughness:.7,metalness:.15}));
    disk.position.y=-0.2; interior.add(disk);
    const ring=new THREE.Mesh(new THREE.RingGeometry(2.1,2.9,48), B(0x37e0d8,{transparent:true,opacity:.75,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2; ring.position.y=0.03; interior.add(ring);
    const ring2=new THREE.Mesh(new THREE.RingGeometry(0.5,0.8,32), B(0xffd88a,{transparent:true,opacity:.7,side:THREE.DoubleSide}));
    ring2.rotation.x=-Math.PI/2; ring2.position.y=0.03; interior.add(ring2);
    animators.push(t=>{ ring.rotation.z=t*0.25; ring2.rotation.z=-t*0.5; });

    // 结界弧（四方向留缺口）
    for(let i=0;i<4;i++){
      const arc=new THREE.Mesh(new THREE.CylinderGeometry(8.6,8.6,4.6,24,1,true,i*Math.PI/2+0.42,Math.PI/2-0.84),
        new THREE.MeshBasicMaterial({color:0x39e8de, transparent:true, opacity:0.07, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false}));
      arc.position.y=2.3; interior.add(arc);
      animators.push(t=>{ arc.material.opacity=0.05+0.04*Math.sin(t*1.4+i); });
    }
  }

  /* 枢纽美化：地面曼陀罗 + 旋转吊灯 + 环周灯笼（均用自发光材质，不额外加灯） */
  {
    // 地面发光曼陀罗
    const mandala=new THREE.Group(); mandala.position.y=0.05; interior.add(mandala);
    for(let r=1;r<=3;r++){
      const ring=new THREE.Mesh(new THREE.RingGeometry(r*1.5, r*1.5+0.05, 64),
        new THREE.MeshBasicMaterial({color:0x37e0d8, transparent:true, opacity:.5, side:THREE.DoubleSide,
          blending:THREE.AdditiveBlending, depthWrite:false}));
      ring.rotation.x=-Math.PI/2; mandala.add(ring);
    }
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;
      const spoke=new THREE.Mesh(new THREE.PlaneGeometry(0.05,4.4),
        new THREE.MeshBasicMaterial({color:0x37e0d8, transparent:true, opacity:.26, side:THREE.DoubleSide,
          blending:THREE.AdditiveBlending, depthWrite:false}));
      spoke.rotation.x=-Math.PI/2; spoke.rotation.z=a;
      spoke.position.set(Math.cos(a)*2.3,0,Math.sin(a)*2.3); mandala.add(spoke);
    }
    animators.push(t=>{ mandala.rotation.y = t*0.12; });

    // 旋转吊灯：环周悬浮水晶
    const chand=new THREE.Group(); chand.position.y=4.5; interior.add(chand);
    const orbCols=[0xffd88a,0x37e0d8,0xff8c3a,0xb06cff,0x27e6ff,0x58e08a];
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2;
      const orb=new THREE.Mesh(new THREE.SphereGeometry(0.17,12,10),
        B(orbCols[i%6],{transparent:true,opacity:.92}));
      orb.position.set(Math.cos(a)*2.4,0,Math.sin(a)*2.4); chand.add(orb);
    }
    // 中心垂下的主晶
    const drop=new THREE.Mesh(new THREE.OctahedronGeometry(0.3),
      B(0xffe6b0,{transparent:true,opacity:.85}));
    chand.add(drop);
    animators.push(t=>{
      chand.rotation.y = t*0.4;
      chand.children.forEach((o,i)=>{ o.position.y = Math.sin(t*1.4+i)*0.18; });
    });

    // 环周灯笼（暖光自发光球，缓慢起伏）
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2 + 0.3;
      const lx=Math.cos(a)*7.4, lz=Math.sin(a)*7.4;
      const lan=new THREE.Mesh(new THREE.SphereGeometry(0.22,12,10),
        B(0xffb35e,{transparent:true,opacity:.85}));
      lan.position.set(lx,3.0,lz); interior.add(lan);
      const halo=new THREE.Mesh(new THREE.CircleGeometry(1.2,24),
        new THREE.MeshBasicMaterial({color:0xffb35e, transparent:true, opacity:.12,
          blending:THREE.AdditiveBlending, depthWrite:false}));
      halo.rotation.x=-Math.PI/2; halo.position.set(lx,0.07,lz); interior.add(halo);
      animators.push(t=>{ lan.position.y = 3.0 + Math.sin(t*1.2+i)*0.15; });
    }
  }

  /* 中心水晶 + 酒吧 */
  {
    const crystal=hubCrystal=new THREE.Mesh(new THREE.OctahedronGeometry(0.85), B(0xffd88a,{wireframe:true,transparent:true,opacity:.9}));
    crystal.position.y=2.4; interior.add(crystal);
    animators.push(t=>{ crystal.rotation.y=t*0.6; crystal.position.y=2.4+Math.sin(t*1.2)*0.18; });
    glowLight(0xffcf7a, 16, 13, 0,2.6,0, interior);
    hubCrystalLight = interior.children[interior.children.length-1];

    // 吧台（西南侧，避开通道）
    const grp=new THREE.Group(); grp.position.set(-5.2,0,-4.6); grp.rotation.y=0.62; interior.add(grp);
    box(5.4,1.1,0.9, M(0x4a3320), 0,0.55,0, grp);
    box(5.6,0.08,1.1, M(0x6b4a2a,{roughness:.5}), 0,1.14,0, grp);
    for(let i=0;i<3;i++){
      const st=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,0.72,10), M(0x3a2817));
      st.position.set(-1.7+i*1.7, 0.36, 1.25); grp.add(st);
    }
    box(5,2.6,0.35, woodDk, 0,1.3,-1.6, grp);
    const bottleColors=[0x4ae08a,0xff7a4a,0x4a9aff,0xe84ae0,0xffd24a,0x7affd8];
    for(let i=0;i<9;i++){
      const b=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,0.42,8), B(bottleColors[i%6]));
      b.position.set(-2.1+ (i%5)*1.0, 1.0+Math.floor(i/5)*0.85, -1.5); grp.add(b);
    }
    glowLight(0xffb35e, 12, 10, -5.2,2.4,-4.6, interior);
    addSolid(IX-5.2, -4.6, 4.6, 2.2);
  }
}
