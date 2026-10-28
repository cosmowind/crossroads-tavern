import * as THREE from 'three';
import { scene, interior, M, B, textTexture, glowLight, animators, IX, NPCS, player, rt } from '../state.js';
import { onNpcTalk, Q } from '../quest.js';

/* ============ NPC ============ */
function makeNpc(cfg){
  const {x,z,ii,color,name,lines,scale=1.18,id,hall}=cfg;
  const g=new THREE.Group();
  // interior 组已位于 x=IX，组内子物体必须用局部坐标（外部 NPC 直接挂在 scene 上）
  g.position.set(x, 0, z);
  (ii?interior:scene).add(g);
  // 长袍：用主题色提亮并自发光，避免暗场里"隐形"
  const robe=M(color,{roughness:.6, metalness:.1, emissive:color, emissiveIntensity:.3});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.36*scale,0.6*scale,1.5*scale,16), robe);
  body.position.y=0.75*scale; body.castShadow=true; g.add(body);
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(0.42*scale,0.37*scale,0.18*scale,16),
    M(0xffe6b0,{roughness:.5, emissive:0xffcf8a, emissiveIntensity:.55}));
  collar.position.y=1.32*scale; g.add(collar);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.25*scale,18,14),
    M(0xf3ddbb,{roughness:.7, emissive:0x4a3826, emissiveIntensity:.3}));
  head.position.y=1.62*scale; g.add(head);
  [-0.1,0.1].forEach(dx=>{
    const e=new THREE.Mesh(new THREE.SphereGeometry(0.045*scale,8,8), B(0x141414));
    e.position.set(dx*scale, 1.64*scale, 0.22*scale); g.add(e);
  });
  // 头顶柔光晕
  const aura=new THREE.Mesh(new THREE.SphereGeometry(0.42*scale,14,12),
    new THREE.MeshBasicMaterial({color, transparent:true, opacity:.16,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  aura.position.y=1.62*scale; g.add(aura);
  // 兜帽
  const hood=new THREE.Mesh(new THREE.ConeGeometry(0.34*scale,0.52*scale,16),
    M(color,{roughness:.7, emissive:color, emissiveIntensity:.22}));
  hood.position.y=1.94*scale; g.add(hood);
  // 地面光圈池
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.7,1.08,32),
    new THREE.MeshBasicMaterial({color, transparent:true, opacity:.45, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  ring.rotation.x=-Math.PI/2; ring.position.y=0.06; g.add(ring);
  // 信标光柱（从地面升起，远处也能定位 NPC）
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.12*scale,0.5*scale,5.4,18,1,true),
    new THREE.MeshBasicMaterial({color, transparent:true, opacity:.10, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  beam.position.y=2.9; g.add(beam);
  // 名牌（发光描边 + 始终朝向玩家）
  const tex=textTexture((gg)=>{
    gg.fillStyle='rgba(12,14,22,0.82)'; gg.fillRect(0,0,360,84);
    gg.lineWidth=3; gg.strokeStyle='#'+color.toString(16).padStart(6,'0'); gg.strokeRect(3,3,354,78);
    gg.fillStyle='#'+color.toString(16).padStart(6,'0'); gg.font='bold 46px "KaiTi",serif';
    gg.textAlign='center'; gg.fillText(name,180,57);
  },360,84);
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(2.0,0.47),
    new THREE.MeshBasicMaterial({map:tex, transparent:true, depthWrite:false}));
  plate.position.y=2.55*scale; g.add(plate);
  glowLight(color, 11, 9, 0, 1.7, 0, g);
  const n={x,z,ii,color,name,lines,id,hall,
    g,plate,base:g.position.y,beam,ring,
    onTalk:()=>onNpcTalk(n)};
  NPCS.push(n);
  animators.push(t=>{
    g.position.y = n.base + Math.sin(t*1.3 + x)*0.05;
    const dx=player.x-g.position.x, dz=player.z-g.position.z;
    const ang=Math.atan2(dx,dz);
    g.rotation.y = ang;
    plate.rotation.y = 0;                 // 组已朝向玩家，名牌保持正向
    beam.material.opacity = 0.08+0.05*Math.sin(t*2+x);
    ring.material.opacity = 0.32+0.16*Math.sin(t*1.8+x);
  });
  return n;
}

export function initNpcs(){
  makeNpc({x:3.2, z:7.6, ii:false, color:0xffd88a, name:'引路人', id:'guide', lines:[
    '旅人，你来得正好。门里没有时间，只有故事。',
    '四厅各有印记一枚——中土的炭、赛博的电、茶寮的露、书斋的星。',
    '集齐它们，中庭的水晶会记得你的名字。'
  ]});
  makeNpc({x:-4.6, z:-6.6, ii:true, color:0xffb35e, name:'酒保 · 无名', id:'bartender', lines:function(){
    if(!Q.started) return [
      '异客，你来得正好。这座酒馆叫时空酒馆——门里没有时间，只有四扇通往四界的门。',
      '四界各有一把「时空之钥」。少了它们，中庭的水晶便沉睡着，酒馆也只是在等。',
      '替我把四把钥匙取回来吧：先去四厅各取一枚「印记」，再赢下守护灵的试炼，钥匙就是你的。',
      '（说完，主线已交给你——左上角亮起了任务追踪）'
    ];
    const n=Q.count();
    if(n===0) return ['四厅的印记还没影呢。先去中土、赛博、茶寮、书斋各取一枚印记。','门只认脚步，不认方向——往四个方向走便是。'];
    if(n<4)  return ['还差 '+(4-n)+' 把钥匙。每把都由一位守护灵看守，去赢下他们的试炼。','酒还温着，慢慢来。'];
    return ['四钥归位——时空之心，要醒了。','让我为你重启这座酒馆。'];
  }});
  makeNpc({x:-2.5, z:32, ii:true, color:0xff8c3a, name:'吟游诗人', id:'guardian', hall:'medieval', lines:function(){
    if(!Q.started) return ['(旅人似乎还没接下酒保的托付。先去中枢找酒保聊聊吧。)','炉火从不问来处，只问你冷不冷。'];
    if(Q.key('medieval')) return ['这一钥，早已归你。去忙别的吧，旅人。','长歌依旧，炉火依旧。'];
    if(!Q.token('medieval')) return ['中土的印记还在厅里亮着——先去把它拾来，再来找我划拳。'];
    return ['印记到手了？那便来三局两胜。赢了我，中土之钥归你。'];
  }});
  makeNpc({x:-3.5, z:-27, ii:true, color:0x27e6ff, name:'调酒机 · VIX', id:'guardian', hall:'scifi', lines:function(){
    if(!Q.started) return ['你的生物节律显示：你需要一杯，而不是一次系统重启。','(先去中枢和酒保接下主线，再谈别的。)'];
    if(Q.key('scifi')) return ['密码已废。重启完成度：100%。','下次想喝，直接说。'];
    if(!Q.token('scifi')) return ['赛博的印记还亮着——先取来，再谈密码的事。'];
    return ['印记有了。那便破解重启密码：三位数，第一位是个位里最大的偶数，第三位比它小 4，三者之和为 18。'];
  }});
  makeNpc({x:-27, z:-2, ii:true, color:0x58e08a, name:'茶童', id:'guardian', hall:'xianxia', lines:function(){
    if(!Q.started) return ['茶凉了就再续。急事不进这道门。','(先去中枢找酒保接下主线吧。)'];
    if(Q.key('xianxia')) return ['茶盏已归位，茶寮之钥也是你的了。','师父说，竹影扫阶尘不动——你倒是把尘扫来了。'];
    if(!Q.token('xianxia')) return ['茶寮的印记还悬在厅里——先取来。'];
    return ['印记有了。可我的灵茶盏不知滚到哪儿去了……厅里某处还亮着微光，替我寻来，茶寮之钥便是谢礼。'];
  }});
  makeNpc({x:34, z:4, ii:true, color:0xb06cff, name:'书灵', id:'guardian', hall:'arcane', lines:function(){
    if(!Q.started) return ['第七排第三本，写的正是你此刻站着的位置。','(先去中枢和酒保接下主线。)'];
    if(Q.key('arcane')) return ['星图已为君点亮。书斋之钥，拿好。','被读完的书会自己合上——所以它们其实一直醒着。'];
    if(!Q.token('arcane')) return ['书斋的印记还在架上发光——先取来。'];
    return ['印记既得。群星有语：依序轻触四枚符文——火、水、风、土。顺了，书斋之钥归你。'];
  }});
}

export function nearestNpc(){
  const lx=player.x-(rt.inInterior?IX:0), lz=player.z;
  let best=null, bd=1e9;
  for(const n of NPCS){
    if(n.ii!==rt.inInterior) continue;
    const d=Math.hypot(lx-n.x, lz-n.z);
    if(d<bd){ bd=d; best=n; }
  }
  return best?{n:best, d:bd}:null;
}
