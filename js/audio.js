// 程序合成音频：古琴风格拨弦 + 环境声（风、鸟、虫、水），无外部音频文件
let ctx=null, master, musicBus, ambBus, sfxBus, reverb, started=false;
const vol={ music:.6, amb:.5, sfx:.7, ...JSON.parse(localStorage.getItem('honglou_vol')||'{}') };
export function getVol(){ return vol; }
export function setVol(k,v){ vol[k]=v; localStorage.setItem('honglou_vol',JSON.stringify(vol)); if(ctx){ musicBus.gain.value=vol.music*.5; ambBus.gain.value=vol.amb*.35; sfxBus.gain.value=vol.sfx*.6; } }
function impulse(sec=3.2){ const len=ctx.sampleRate*sec, b=ctx.createBuffer(2,len,ctx.sampleRate); for(let c=0;c<2;c++){ const d=b.getChannelData(c); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6); } return b; }
export function initAudio(){
  if(ctx) { ctx.resume(); return; }
  try{ ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch{ return; }
  master=ctx.createGain(); master.gain.value=1; master.connect(ctx.destination);
  reverb=ctx.createConvolver(); reverb.buffer=impulse(); const rg=ctx.createGain(); rg.gain.value=.45; reverb.connect(rg); rg.connect(master);
  musicBus=ctx.createGain(); ambBus=ctx.createGain(); sfxBus=ctx.createGain(); for(const b of [musicBus,ambBus,sfxBus]){ b.connect(master); b.connect(reverb); }
  setVol('music',vol.music); started=true; scheduleMusic(); ambience();
}
// 古琴拨弦：Karplus-Strong
function pluck(freq,when,dur=4,gain=.5,bus=musicBus){
  const sr=ctx.sampleRate, len=Math.floor(sr*dur), buf=ctx.createBuffer(1,len,sr), d=buf.getChannelData(0); const N=Math.floor(sr/freq); const ring=new Float32Array(N);
  for(let i=0;i<N;i++) ring[i]=(Math.random()*2-1)*(1-i/N*.5);
  let idx=0; const damp=.996 - Math.min(.006, freq/90000);
  for(let i=0;i<len;i++){ const a=ring[idx], b=ring[(idx+1)%N]; const v=(a+b)*.5*damp; ring[idx]=v; d[i]=a; idx=(idx+1)%N; }
  // 滑音（吟猱）：轻微颤动播放速率
  const src=ctx.createBufferSource(); src.buffer=buf; const g=ctx.createGain(); g.gain.setValueAtTime(gain,when); g.gain.exponentialRampToValueAtTime(.001,when+dur);
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2400;
  src.playbackRate.setValueAtTime(1,when); if(Math.random()<.35){ src.playbackRate.setValueAtTime(1,when+.25); src.playbackRate.linearRampToValueAtTime(1.012,when+.6); src.playbackRate.linearRampToValueAtTime(.995,when+1); src.playbackRate.linearRampToValueAtTime(1,when+1.4);} 
  src.connect(lp); lp.connect(g); g.connect(bus); src.start(when); src.stop(when+dur);
}
// 五声音阶（宫调）D 宫
const BASE=146.83; const PENTA=[0,2,4,7,9]; const note=(deg)=>{ const o=Math.floor(deg/5), s=((deg%5)+5)%5; return BASE*Math.pow(2,(PENTA[s]+12*o)/12); };
let mood='day', nextT=0, deg=5;
export function setMood(m){ mood=m; }
function scheduleMusic(){
  const look=()=>{ if(!ctx) return; const now=ctx.currentTime; if(nextT<now) nextT=now+.2;
    while(nextT<now+3){ const night=mood==='night', sad=mood==='sad';
      const step=[-2,-1,-1,1,1,2,0,-3,3][Math.floor(Math.random()*9)]; deg=Math.max(2,Math.min(11,deg+step));
      const len=[.6,.9,1.2,1.8][Math.floor(Math.random()*4)]*(night||sad?1.4:1);
      pluck(note(deg),nextT,4.5,.32);
      if(Math.random()<.3) pluck(note(deg-5),nextT,5,.2); // 低八度散音
      if(Math.random()<.15) pluck(note(deg+5)*1.0,nextT+.02,2,.07); // 泛音
      nextT+=len; if(Math.random()<.12) nextT+=2.5; // 乐句间的留白
    } setTimeout(look,800); };
  look();
}
// 环境：风噪 + 鸟鸣/虫鸣 + 流水
let windG, birdT=0;
function ambience(){
  const len=ctx.sampleRate*4, b=ctx.createBuffer(1,len,ctx.sampleRate), d=b.getChannelData(0); let last=0; for(let i=0;i<len;i++){ last=(last+.02*(Math.random()*2-1))/1.02; d[i]=last*3; }
  const n=ctx.createBufferSource(); n.buffer=b; n.loop=true; const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=500; windG=ctx.createGain(); windG.gain.value=.5; n.connect(f); f.connect(windG); windG.connect(ambBus); n.start();
  const lfo=ctx.createOscillator(); lfo.frequency.value=.07; const lg=ctx.createGain(); lg.gain.value=.25; lfo.connect(lg); lg.connect(windG.gain); lfo.start();
  const loop=()=>{ if(!ctx) return; const t=ctx.currentTime+.1;
    if(mood==='night'){ for(let k=0;k<3;k++) chirp(t+k*.09, 4200+Math.random()*300, .04, .05); }
    else if(Math.random()<.7){ const f0=2200+Math.random()*1800; for(let k=0;k<2+Math.floor(Math.random()*4);k++) chirp(t+k*.14, f0+Math.random()*500, .1, .05, true); }
    setTimeout(loop, mood==='night'? 900+Math.random()*900 : 2500+Math.random()*5000); };
  loop();
}
function chirp(t,f,dur,g,sweep){ const o=ctx.createOscillator(), ga=ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(f,t); if(sweep) o.frequency.exponentialRampToValueAtTime(f*1.4,t+dur); ga.gain.setValueAtTime(0,t); ga.gain.linearRampToValueAtTime(g,t+.01); ga.gain.exponentialRampToValueAtTime(.0005,t+dur); o.connect(ga); ga.connect(ambBus); o.start(t); o.stop(t+dur+.02); }
// 音效
export function sfx(kind){ if(!ctx) return; const t=ctx.currentTime;
  if(kind==='click') pluck(note(9),t,1.2,.25,sfxBus);
  if(kind==='open'){ pluck(note(7),t,2,.25,sfxBus); pluck(note(9),t+.08,2,.2,sfxBus); }
  if(kind==='good'){ [5,7,9,12].forEach((d,i)=>pluck(note(d),t+i*.1,2.5,.25,sfxBus)); }
  if(kind==='bad'){ [7,5,2].forEach((d,i)=>pluck(note(d),t+i*.18,2.5,.25,sfxBus)); }
  if(kind==='bell'){ const o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.value=196; o.type='sine'; g.gain.setValueAtTime(.5,t); g.gain.exponentialRampToValueAtTime(.001,t+5); const o2=ctx.createOscillator(); o2.frequency.value=196*2.76; o2.connect(g); o.connect(g); g.connect(sfxBus); o.start(t); o2.start(t); o.stop(t+5); o2.stop(t+5); }
  if(kind==='step'){ const o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.value=90; g.gain.setValueAtTime(.05,t); g.gain.exponentialRampToValueAtTime(.001,t+.08); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t+.1); }
}
