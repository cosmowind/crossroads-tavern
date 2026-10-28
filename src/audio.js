import { settings } from './state.js';

/* ============ 程序化音效（无外部资源） ============ */
var AC=null, master=null, noiseBuf=null, envSrc=null, envFilt=null, envGain=null, audioReady=false;
var curZone='exterior';

function ensureAudio(){
  if(AC){ if(AC.state==='suspended') AC.resume(); return; }
  try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  master=AC.createGain(); master.gain.value = settings.mute?0:(settings.vol/100)*0.9;
  master.connect(AC.destination);
  const len=Math.floor(AC.sampleRate*2);
  noiseBuf=AC.createBuffer(1,len,AC.sampleRate);
  const d=noiseBuf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  envSrc=AC.createBufferSource(); envSrc.buffer=noiseBuf; envSrc.loop=true;
  envFilt=AC.createBiquadFilter(); envFilt.type='lowpass'; envFilt.frequency.value=380; envFilt.Q.value=0.7;
  envGain=AC.createGain(); envGain.gain.value=0;
  envSrc.connect(envFilt); envFilt.connect(envGain); envGain.connect(master);
  envSrc.start();
  audioReady=true;
  if(AC.state==='suspended') AC.resume();
  applyZone(curZone);
}
function noiseBurst(dur, type, freq, q, gain){
  if(!audioReady||settings.mute||!AC) return;
  const s=AC.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
  const f=AC.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q||1;
  const g=AC.createGain(); const now=AC.currentTime;
  g.gain.setValueAtTime(0.0001,now); g.gain.linearRampToValueAtTime(gain,now+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,now+dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(now); s.stop(now+dur+0.03);
}
function tone(freq, dur, type, gain, endFreq, delay){
  if(!audioReady||settings.mute||!AC) return;
  const o=AC.createOscillator(); o.type=type||'sine';
  const g=AC.createGain(); const now=AC.currentTime+(delay||0);
  o.frequency.setValueAtTime(freq,now);
  if(endFreq) o.frequency.exponentialRampToValueAtTime(endFreq,now+dur);
  g.gain.setValueAtTime(0.0001,now); g.gain.linearRampToValueAtTime(gain,now+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001,now+dur);
  o.connect(g); g.connect(master); o.start(now); o.stop(now+dur+0.03);
}
/* 分区声景 */
const ZONE_AUDIO={
  exterior:{f:360,  t:'lowpass',  q:0.6, g:0.10, d:'wind', iv:[3.5,7]},
  hub:     {f:250,  t:'lowpass',  q:0.9, g:0.07, d:'hum',  iv:[4,8]},
  corridor:{f:300,  t:'lowpass',  q:0.8, g:0.08, d:'hum',  iv:[3,6]},
  medieval:{f:820,  t:'bandpass', q:0.6, g:0.16, d:'fire', iv:[0.5,1.6]},
  scifi:   {f:1500, t:'bandpass', q:1.6, g:0.11, d:'blip', iv:[0.9,2.2]},
  xianxia: {f:2600, t:'highpass', q:0.4, g:0.06, d:'drop', iv:[1.6,4]},
  arcane:  {f:640,  t:'lowpass',  q:0.8, g:0.08, d:'bell', iv:[2.2,5]}
};
function applyZone(z){
  curZone=z;
  if(!audioReady||!AC) return;
  const p=ZONE_AUDIO[z]||ZONE_AUDIO.exterior, now=AC.currentTime;
  envFilt.type=p.t;
  envFilt.frequency.setTargetAtTime(p.f, now, 0.7);
  envFilt.Q.setTargetAtTime(p.q, now, 0.7);
  envGain.gain.setTargetAtTime(settings.mute?0:p.g, now, 0.7);
}
let detailTimer=1.2;
function audioTick(dt){
  if(!audioReady||settings.mute) return;
  const p=ZONE_AUDIO[curZone]||ZONE_AUDIO.exterior;
  detailTimer-=dt;
  if(detailTimer>0) return;
  detailTimer=p.iv[0]+Math.random()*(p.iv[1]-p.iv[0]);
  switch(p.d){
    case 'wind': noiseBurst(1.4,'lowpass',320,0.5,0.05); break;
    case 'hum':  tone(68+Math.random()*18, 1.6,'sine',0.028); break;
    case 'fire': noiseBurst(0.13,'highpass',1400,0.8,0.075); break;
    case 'blip': tone(620+Math.random()*560, 0.09,'square',0.03); break;
    case 'drop': tone(920, 0.17,'sine',0.05,250); break;
    case 'bell': tone(1318,1.1,'sine',0.04); tone(1976,0.85,'sine',0.016,0,0.05); break;
  }
}
function applyAudioSettings(){
  if(master && AC) master.gain.setTargetAtTime(settings.mute?0:(settings.vol/100)*0.9, AC.currentTime, 0.05);
}

/* 交互音效 */
const sfxStep   = ()=>noiseBurst(0.09,'lowpass',190,1.1,0.05);
const sfxPortal = ()=>{ tone(180,0.5,'sine',0.055,900); noiseBurst(0.5,'bandpass',700,2,0.04); };
const sfxCollect= ()=>{ tone(880,0.3,'sine',0.05); tone(1320,0.35,'sine',0.045,0,0.12); tone(1760,0.5,'sine',0.04,0,0.24); };
const sfxChime  = ()=>{ [523,659,784,1047].forEach((f,i)=>tone(f,1.4,'sine',0.045,0,i*0.16)); };
const sfxTalk   = ()=>tone(520,0.07,'triangle',0.02);

export {
  ensureAudio, applyZone, audioTick, applyAudioSettings,
  sfxStep, sfxPortal, sfxCollect, sfxChime, sfxTalk, audioState
};

/* 供调试钩子读取音频状态 */
function audioState(){
  return { ready:audioReady, zone:curZone, vol:settings.vol, mute:settings.mute, sens:settings.sens };
}
