/* 可达性自检：重建 interior 的可行走区域与碰撞体，
   计算每个 NPC / 印记到「玩家实际站得到的位置」的最小距离 */
const R = 0.38;
const HALLS = [
  { key:'N', cx:0,   cz:30,  open:'S' },
  { key:'S', cx:0,   cz:-30, open:'N' },
  { key:'W', cx:-30, cz:0,   open:'E' },
  { key:'E', cx:30,  cz:0,   open:'W' },
];

/* ---- 重建 solids（局部坐标） ---- */
const solids = [];
const addSolid = (cx,cz,w,d)=>solids.push({x1:cx-w/2, x2:cx+w/2, z1:cz-d/2, z2:cz+d/2});
// interior.js: 吧台
addSolid(-5.2, -4.6, 4.6, 2.2);
// halls.js: 厅壳墙 + 通道侧墙
for(const h of HALLS){
  const {cx,cz,open}=h, H=6, T=0.5, half=9;
  const sides=[
    {id:'N', horiz:true,  fixed:cz+half},
    {id:'S', horiz:true,  fixed:cz-half},
    {id:'E', horiz:false, fixed:cx+half},
    {id:'W', horiz:false, fixed:cx-half},
  ];
  for(const s of sides){
    const seg=(c,len)=>{
      if(s.horiz) addSolid(c, s.fixed, len, T);
      else        addSolid(s.fixed, c, T, len);
    };
    if(s.id===open){
      if(s.horiz){ seg(cx-5.95,6.1); seg(cx+5.95,6.1); }
      else       { seg(cz-5.95,6.1); seg(cz+5.95,6.1); }
    } else {
      if(s.horiz) seg(cx,18+T); else seg(cz,18+T);
    }
  }
  const dir={N:[0,1],S:[0,-1],E:[1,0],W:[-1,0]}[open];
  const midx=cx+dir[0]*14.75, midz=cz+dir[1]*14.75;
  if(dir[0]){
    addSolid(midx, cz+3.15, 12.5, 0.5);
    addSolid(midx, cz-3.15, 12.5, 0.5);
  } else {
    addSolid(cx+3.15, midz, 0.5, 12.5);
    addSolid(cx-3.15, midz, 0.5, 12.5);
  }
}

function allowed(lx,lz){
  if(Math.hypot(lx,lz)<8.45) return true;
  if(Math.abs(lx)<2.85&&Math.abs(lz)>8.3&&Math.abs(lz)<21) return true;
  if(Math.abs(lz)<2.85&&Math.abs(lx)>8.3&&Math.abs(lx)<21) return true;
  if(Math.abs(lx)<8.9&&lz>20.85&&lz<39.1) return true;
  if(Math.abs(lx)<8.9&&lz<-20.85&&lz>-39.1) return true;
  if(Math.abs(lz)<8.9&&lx>20.85&&lx<39.1) return true;
  if(Math.abs(lz)<8.9&&lx<-20.85&&lx>-39.1) return true;
  return false;
}
function insideSolid(lx,lz){
  for(const s of solids){
    if(lx>s.x1-R && lx<s.x2+R && lz>s.z1-R && lz<s.z2+R) return true;
  }
  return false;
}

/* ---- 网格枚举可达点 ---- */
const STEP = 0.15;
const reach = [];
for(let lx=-40; lx<=40; lx+=STEP){
  for(let lz=-40; lz<=40; lz+=STEP){
    if(!allowed(lx,lz)) continue;
    if(insideSolid(lx,lz)) continue;
    reach.push([lx,lz]);
  }
}
function minDist(nx,nz){
  let best=Infinity, bp=null;
  for(const [x,z] of reach){
    const d=Math.hypot(x-nx, z-nz);
    if(d<best){ best=d; bp=[x,z]; }
  }
  return {d:best, at:bp};
}

const NPC_REACH = 4.6;
const NPCS = [
  {n:'酒保 · 无名', x:-4.6,  z:-6.6, need:NPC_REACH},
  {n:'吟游诗人',  x:-2.5,  z:32,   need:NPC_REACH},
  {n:'调酒机 VIX',x:-3.5,  z:-27,  need:NPC_REACH},
  {n:'茶童',      x:-27,   z:-2,   need:NPC_REACH},
  {n:'书灵',      x:34,    z:4,    need:NPC_REACH},
];
const PICKUPS = [
  {n:'中土印记', x:4.2,  z:33,   need:1.7},
  {n:'赛博印记', x:4.2,  z:-33,  need:1.7},
  {n:'茶寮印记', x:-34,  z:4.2,  need:1.7},
  {n:'书斋印记', x:34,   z:-4.2, need:1.7},
  {n:'灵茶盏',   x:-33,  z:7,    need:1.8},
  {n:'回归之门', x:5.8,  z:5.8,  need:1.4},
];

console.log('可达点总数:', reach.length);
let fail = 0;
console.log('\n--- NPC 交互可达性（阈值 ' + NPC_REACH + '）---');
for(const n of NPCS){
  const r = minDist(n.x,n.z);
  const ok = r.d <= n.need;
  if(!ok) fail++;
  console.log((ok?'  OK  ':' FAIL ') + n.n.padEnd(12) +
    ' 最小距离 ' + r.d.toFixed(2) +
    (r.at ? '  最近可站点 (' + r.at[0].toFixed(1) + ',' + r.at[1].toFixed(1) + ')' : '  <不可达>'));
}
console.log('\n--- 印记 / 物品拾取可达性 ---');
for(const p of PICKUPS){
  const r = minDist(p.x,p.z);
  const ok = r.d <= p.need;
  if(!ok) fail++;
  console.log((ok?'  OK  ':' FAIL ') + p.n.padEnd(12) +
    ' 最小距离 ' + r.d.toFixed(2) + '  阈值 ' + p.need);
}
console.log('\n结论:', fail===0 ? '全部可达 ✓' : ('存在 '+fail+' 处不可达 ✗'));
