import * as THREE from 'three';
import { scene, M, B, box, addSolid, glowLight, textTexture, dust, animators, timber, woodDk } from '../state.js';

/* ============ 星空 & 月亮 ============ */
export function initEnvironment(){
  {
    const N=900, pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const v=new THREE.Vector3().randomDirection().multiplyScalar(220+Math.random()*120);
      if(v.y<5){v.y=Math.abs(v.y)+5;}
      pos.set([v.x,v.y,v.z], i*3);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({color:0xcdd8ff, size:1.4, sizeAttenuation:false, fog:false})));
    const mb=new THREE.Mesh(new THREE.SphereGeometry(6,24,24), B(0xe8eeff,{fog:false}));
    mb.position.set(90,110,-160); scene.add(mb);
  }

  /* ============ 外部地面 ============ */
  {
    const g = new THREE.Mesh(new THREE.CircleGeometry(90, 48), M(0x2a2e34,{roughness:.95}));
    g.rotation.x = -Math.PI/2; g.receiveShadow = true; scene.add(g);
    // 石板路
    const stone = M(0x4a4d52,{roughness:.9});
    for(let i=0;i<8;i++){
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.9+Math.random()*0.4, 0.9+Math.random()*0.4, 0.06, 8), stone);
      s.position.set((Math.random()-0.5)*1.6, 0.04, 6.4+i*1.35); s.rotation.y=Math.random()*3; scene.add(s);
    }
  }

  /* ============ 酒馆外观 ============ */
  const plaster = M(0xcfc4a8,{roughness:.95});
  const thatch  = M(0x9a7b4a,{roughness:1});
  const winGlow = B(0xffc266);

  { // 主体
    const body = box(16,7,10, plaster, 0,3.5,0);
    body.castShadow = body.receiveShadow = true;
    addSolid(0,0,16,10);

    // 木桁架（正面）
    [-7.7,-5.2,-2.6,2.6,5.2,7.7].forEach(x=>{
      box(0.24,3.3,0.16, timber, x,1.72,5.08);
      box(0.24,3.2,0.16, timber, x,5.32,5.08);
    });
    box(16.2,0.26,0.18, timber, 0,3.45,5.09);
    box(16.2,0.3,0.18, timber, 0,6.92,5.09);
    box(16.2,0.24,0.18, timber, 0,0.15,5.09);
    // 斜撑
    [[-7,-0.6],[-6.4,0.6],[6.4,-0.6],[7,0.6]].forEach(([x,s])=>{
      const b=box(0.2,2.6,0.14, timber, x,2.2,5.08); b.rotation.z=s*0.5;
    });
    // 侧面木架
    [-8.02,8.02].forEach(x=>{
      [-3.4,0,3.4].forEach(z=> box(0.16,6.8,0.24, timber, x,3.5,z));
      box(0.16,0.26,10.1, timber, x,3.45,0);
    });

    // 茅草屋顶
    const shape = new THREE.Shape();
    shape.moveTo(-8.8,0); shape.lineTo(8.8,0); shape.lineTo(0,4.8); shape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:11.6, bevelEnabled:false}), thatch);
    roof.position.set(0,6.95,-5.8); roof.castShadow = true; scene.add(roof);
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,12,10), timber);
    ridge.rotation.x = Math.PI/2; ridge.position.set(0,11.78,0); scene.add(ridge);

    // 烟囱 + 炊烟
    box(1.6,4.5,1.6, M(0x6e6a62), -6,9.6,-2);
    const smokeN=42, sPos=new Float32Array(smokeN*3), sSpd=[];
    for(let i=0;i<smokeN;i++){ sPos.set([-6+(Math.random()-.5)*.5, 12+Math.random()*6, -2+(Math.random()-.5)*.5], i*3); sSpd.push(0.4+Math.random()*0.5); }
    const sg=new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sPos,3));
    const smoke=new THREE.Points(sg, new THREE.PointsMaterial({color:0x9aa0aa, size:0.55, transparent:true, opacity:0.35}));
    scene.add(smoke);
    animators.push(t=>{
      const p=sg.attributes.position.array;
      for(let i=0;i<smokeN;i++){ p[i*3+1]+=sSpd[i]*0.016; p[i*3]+=Math.sin(t+i)*0.004;
        if(p[i*3+1]>19){p[i*3+1]=12; p[i*3]=-6;} }
      sg.attributes.position.needsUpdate=true;
    });
  }

  /* 门窗 */
  function windowUnit(x,y,z,ry=0,w=1.5,h=1.7,parent=scene){
    const g=new THREE.Group(); g.position.set(x,y,z); g.rotation.y=ry; parent.add(g);
    const gl=new THREE.Mesh(new THREE.PlaneGeometry(w,h), winGlow); gl.position.z=0.03; g.add(gl);
    const t=0.13; // 四边框条
    box(w+0.26,t,0.1, woodDk, 0, h/2+t/2, 0, g);
    box(w+0.26,t,0.1, woodDk, 0,-h/2-t/2, 0, g);
    box(t,h,0.1, woodDk, -w/2-t/2, 0, 0, g);
    box(t,h,0.1, woodDk,  w/2+t/2, 0, 0, g);
    box(0.08,h,0.06, woodDk, 0,0,0.05, g);
    box(w,0.08,0.06, woodDk, 0,0,0.05, g);
    // 花箱
    if(y<4){
      box(w+0.2,0.34,0.42, woodDk, 0,-h/2-0.28,0.3, g);
      for(let i=0;i<4;i++){
        const s=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,8), M(0x3f6e35));
        s.position.set(-w/2+0.3+i*(w-0.6)/3, -h/2-0.05, 0.32); s.scale.y=0.7; g.add(s);
        const f=new THREE.Mesh(new THREE.SphereGeometry(0.07,6,6), B(i%2?0xe86a8a:0xf2d24a));
        f.position.set(s.position.x+(Math.random()-.5)*.2, -h/2+0.1, 0.4); g.add(f);
      }
    }
    return g;
  }
  windowUnit(-4.6,1.9,5.06); windowUnit(4.6,1.9,5.06);
  windowUnit(-4.6,5.3,5.06,0,1.3,1.5); windowUnit(4.6,5.3,5.06,0,1.3,1.5);
  windowUnit(-8.02,1.9,2.6,-Math.PI/2); windowUnit(-8.02,1.9,-2.6,-Math.PI/2);
  windowUnit(8.02,1.9,2.6,-Math.PI/2); windowUnit(8.02,1.9,-2.6,-Math.PI/2);
  // 屋顶老虎窗（修复：roof 居中于 x）
  [[3.6],[-3.6]].forEach(([x])=>{
    box(1.4,1.2,1.2, plaster, x,9.0,4.35);
    const s2=new THREE.Shape(); s2.moveTo(-0.95,0); s2.lineTo(0.95,0); s2.lineTo(0,0.9); s2.closePath();
    const r2=new THREE.Mesh(new THREE.ExtrudeGeometry(s2,{depth:1.5,bevelEnabled:false}), thatch);
    r2.position.set(x, 9.6, 3.7); scene.add(r2);
    const wl=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.8), winGlow);
    wl.position.set(x,9.0,4.97); scene.add(wl);
  });

  /* 大门 */
  {
    box(0.35,2.9,0.3, timber, -1.15,1.45,5.02);      // 门柱
    box(0.35,2.9,0.3, timber,  1.15,1.45,5.02);
    const arch=new THREE.Mesh(                        // 拱顶
      new THREE.CylinderGeometry(1.15,1.15,0.3,20,1,false,Math.PI/2,Math.PI), timber);
    arch.rotation.x=Math.PI/2; arch.position.set(0,2.9,5.02); scene.add(arch);
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(1.85,2.75), B(0xffbb55));
    glow.position.set(0,1.45,4.93); scene.add(glow);
    [[-1.05,1],[1.05,-1]].forEach(([x,s])=>{         // 敞开的门板
      const d=box(0.9,2.7,0.1, woodDk, x+0.45*s, 1.45, 5.35);
      d.rotation.y = s*1.15;
    });
    const step=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.4,0.22,20), M(0x6a675e));
    step.position.set(0,0.11,6.1); step.receiveShadow=true; scene.add(step);
    // 灯笼
    [-2.2,2.2].forEach(x=>{
      box(0.12,2.6,0.12, timber, x,1.3,5.6);
      const l=new THREE.Mesh(new THREE.SphereGeometry(0.22,10,10), B(0xffa544));
      l.position.set(x,2.7,5.6); scene.add(l);
    });
    glowLight(0xffa044, 22, 14, 0, 2.8, 6.2);

    // 招牌
    const tex = textTexture((g)=>{
      g.fillStyle='#241608'; g.fillRect(0,0,256,256);
      g.strokeStyle='#8a5a28'; g.lineWidth=10; g.strokeRect(10,10,236,236);
      g.fillStyle='#ffd88a'; g.font='bold 62px "KaiTi",serif'; g.textAlign='center';
      g.fillText('時空',128,102); g.fillText('酒館',128,176);
      g.fillStyle='#b8402a'; g.fillRect(198,200,38,38);
    });
    box(0.1,0.1,1.2, timber, 5.8,4.6,5.6);
    const sign=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,0.08),
      [M(0x241608),M(0x241608),M(0x241608),M(0x241608),new THREE.MeshStandardMaterial({map:tex}),M(0x241608)]);
    sign.position.set(5.8,3.9,6.1); scene.add(sign);
    animators.push(t=>{ sign.rotation.z = Math.sin(t*1.3)*0.06; });

    // 酒桶 & 木箱
    const barrelM=M(0x6b4a2a);
    [[7.4,6.4],[8.3,5.4],[7.0,4.6],[-7.2,6.6]].forEach(([x,z],i)=>{
      const b=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.5,1.05,14), barrelM);
      b.position.set(x,0.53,z); b.castShadow=true; scene.add(b);
      const band=new THREE.Mesh(new THREE.CylinderGeometry(0.475,0.52,0.08,14), M(0x2c2c2c,{metalness:.6,roughness:.4}));
      band.position.set(x,0.6,z); scene.add(band);
    });
    box(1,1,1, woodDk, -8.2,0.5,5.6, scene, 0.3);
  }
}
