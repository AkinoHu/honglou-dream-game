// 人物系统 v2：工笔风格人物——平面投影脸贴图+表情、发丝着色器、褶皱衣裙+刺绣贴图、二级弹簧动画、立绘合成
import * as THREE from 'three';
import { mergeChildren } from './bake.js';

let CAM=null, LOOKAT=null;
export function initChars(o){ CAM=o.camera||null; }
export function setLookTarget(v){ LOOKAT=v; }

const TAU=Math.PI*2, clamp=(x,a,b)=>x<a?a:x>b?b:x, lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const cnv=(w,h)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; };
const hex=n=>'#'+(n&0xffffff).toString(16).padStart(6,'0');
const mixHex=(a,b,k)=>'#'+new THREE.Color(a).lerp(new THREE.Color(b),k).getHexString();
const shadeHex=(a,l)=>{ const c=new THREE.Color(a); c.offsetHSL(0,0,l); return '#'+c.getHexString(); };
let _s=7; const rnd=()=>{ _s=(_s*1664525+1013904223)>>>0; return _s/4294967296; };
const mkTex=(c,{rep,aniso=4,srgb=true,clamp:cl}={})=>{ const t=new THREE.CanvasTexture(c); if(srgb) t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=aniso; if(cl){ t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; } else { t.wrapS=t.wrapT=THREE.RepeatWrapping; } if(rep) t.repeat.set(rep[0],rep[1]); return t; };

// ───────────────────────── 人物个性表 ─────────────────────────
const LOOKS={
  daiyu:  { motif:'bamboo', emb:'#4d7c66', brow:'wan', eye:{tilt:-.10,open:.92,iris:1.12}, chin:.46, slim:.84, hs:1.0, longhair:true, kerchief:true, flowerKind:'peony', mark:null, lip:'#b84860' },
  baochai:{ motif:'peony', emb:'#d9ae4e', brow:'liu', eye:{tilt:.0,open:1.0,iris:1.0}, chin:.18, slim:1.04, hs:1.03, wide:1.1, lock:true },
  baoyu:  { motif:'butterfly', emb:'#e8c25a', brow:'jian', eye:{tilt:.10,open:1.0,iris:1.1,lash:.9}, chin:.28, slim:.95, hs:1.0, braid:true, medal:true },
  xifeng: { motif:'phoenix', emb:'#f0cf6a', brow:'liu2', eye:{tilt:.24,open:.84,iris:.95}, chin:.4, slim:.96, hs:1.0, phoenix:true, medal:true, lip:'#b0201f', mark:'petal' },
  xiangyun:{ motif:'plum', emb:'#fff0d0', brow:'liu', eye:{tilt:.04,open:1.05,iris:1.08}, chin:.3, slim:.95, hs:1.04, ribbonTwin:true },
  miaoyu: { motif:'cloud', emb:'#ffffff', brow:'liu2', eye:{tilt:.12,open:.8,iris:.95}, chin:.42, slim:.88, hs:1.0, cool:true, lip:'#a85a64' },
  tanchun:{ motif:'lotus', emb:'#e9d9ff', brow:'liu2', eye:{tilt:.14,open:.95,iris:1.0}, chin:.36, slim:.92, hs:1.0 },
  xiren:  { motif:'plum', emb:'#fbe4ea', brow:'liu', eye:{tilt:.0,open:1,iris:1.0}, chin:.28, slim:.95 },
  qingwen:{ motif:'cloud', emb:'#d9ecff', brow:'liu2', eye:{tilt:.12,open:1.0,iris:1.05}, chin:.4, slim:.9 },
  qinkeqing:{ motif:'peony', emb:'#fff0f6', brow:'wan', eye:{tilt:-.04,open:.95,iris:1.1}, chin:.42, slim:.9, mark:'petal' },
  jinghuan:{ motif:'cloud', emb:'#ffffff', brow:'liu2', eye:{tilt:.1,open:.9,iris:1.0}, chin:.42, slim:.88, mark:'petal' },
  jiamu:  { motif:'peony', emb:'#d9b560', brow:'liu', eye:{tilt:-.02,open:.8,iris:.9}, chin:.12, slim:1.05, old:true },
  wangfuren:{ motif:'cloud', emb:'#bfa86a', brow:'liu', eye:{tilt:.0,open:.85,iris:.95}, chin:.2, slim:1.02 },
  yingchun:{ motif:'plum', emb:'#f4e8d4', brow:'wan', eye:{tilt:-.04,open:.95,iris:1.0}, chin:.3, slim:.9 },
  xichun: { motif:'bamboo', emb:'#e6f0f6', brow:'liu', eye:{tilt:.0,open:.95,iris:1.0}, chin:.3, slim:.86 },
  liwan:  { motif:'bamboo', emb:'#d8e0e8', brow:'liu', eye:{tilt:.0,open:.9,iris:1.0}, chin:.28, slim:.98 },
  pinger: { motif:'plum', emb:'#fff0f4', brow:'liu', eye:{tilt:.04,open:1,iris:1.0}, chin:.3, slim:.92 },
};
function lookOf(st){ const L=LOOKS[st.look]||{}; const f=st.face||{}; const male=!!st.male, old=!!f.old||!!L.old;
  return { motif:L.motif||'', emb:L.emb||mixHex(st.trim??0xd4af37,0xffffff,.25), brow:L.brow||(male?'jian':'liu'),
    eye:Object.assign({tilt:male?.08:.02,open:old?.74:(f.big?1.06:1),iris:1,lash:male?.8:1},L.eye||{}), chin:L.chin??(male?.2:.32), slim:L.slim??1, hs:L.hs??1,
    wide:L.wide, longhair:!!L.longhair, kerchief:!!L.kerchief, flowerKind:L.flowerKind, lock:!!L.lock, braid:!!L.braid, medal:!!L.medal, phoenix:!!L.phoenix,
    ribbonTwin:!!L.ribbonTwin, cool:!!L.cool, mark:L.mark||null, lip:L.lip||f.lip||(male?'#c0605a':'#c9606a'), male, old, skin:f.skin||'#f8e0cc', blush:f.blush||(male?'rgba(220,130,110,.12)':'rgba(236,140,140,.34)'), sad:!!f.sad };
}

// ───────────────────────── 脸贴图（256², 平面投影，正脸在中心） ─────────────────────────
const FACEC=new Map();
function faceCanvas(Lk,hairHex,ex){ // ex:{e:emo,open,blink}
  const W=256, c=cnv(W,W), g=c.getContext('2d'); const cx=128, S=Lk.skin;
  // 肤底：中央提亮、边缘微暗，保证边界与脖颈/发际衔接
  g.fillStyle=S; g.fillRect(0,0,W,W);
  let gr=g.createRadialGradient(cx,120,10,cx,130,150); gr.addColorStop(0,'rgba(255,255,255,.16)'); gr.addColorStop(.6,'rgba(255,255,255,0)'); gr.addColorStop(1,'rgba(150,90,70,.16)'); g.fillStyle=gr; g.fillRect(0,0,W,W);
  gr=g.createLinearGradient(0,196,0,256); gr.addColorStop(0,'rgba(150,90,70,0)'); gr.addColorStop(1,'rgba(150,90,70,.2)'); g.fillStyle=gr; g.fillRect(0,196,W,60);
  const emo=ex.e||'neutral'; const bl=ex.blink;
  const male=Lk.male, old=Lk.old, E=Lk.eye;
  const blushK={neutral:1,smile:1.35,sad:.7,shy:2.0,angry:.8}[emo]||1;
  // 腮红
  if(!male||Lk.blush.length>0){ for(const s of [-1,1]){ const gg=g.createRadialGradient(cx+s*66,166,2,cx+s*66,166,40); const m=Lk.blush.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/); const [r,gc,b,a]=m?[m[1],m[2],m[3],parseFloat(m[4])]:[236,140,140,.3]; gg.addColorStop(0,`rgba(${r},${gc},${b},${clamp(a*blushK,0,.85)})`); gg.addColorStop(1,`rgba(${r},${gc},${b},0)`); g.fillStyle=gg; g.fillRect(cx+s*66-44,166-44,88,88); } }
  // 鼻：山根阴影、鼻翼、鼻尖高光
  g.fillStyle='rgba(168,104,86,.10)'; g.beginPath(); g.ellipse(cx-7,134,3,16,0,0,TAU); g.ellipse(cx+7,134,3,16,0,0,TAU); g.fill();
  g.fillStyle='rgba(170,100,84,.33)'; for(const s of [-1,1]){ g.beginPath(); g.ellipse(cx+s*7.5,158,3.4,2.4,s*.5,0,TAU); g.fill(); }
  g.strokeStyle='rgba(160,96,80,.38)'; g.lineWidth=1.4; g.beginPath(); g.moveTo(cx-6,150); g.quadraticCurveTo(cx,155,cx+6,150); g.stroke();
  gr=g.createRadialGradient(cx,148,0,cx,148,8); gr.addColorStop(0,'rgba(255,255,255,.4)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(cx-9,139,18,18);
  // 眉
  drawBrows(g,Lk,emo,hairHex);
  // 眼
  for(const s of [-1,1]) drawEye(g,Lk,s,emo,bl);
  // 嘴
  drawMouth(g,Lk,emo,ex.open);
  // 花钿
  if(Lk.mark==='petal'){ g.fillStyle='#c4262e'; g.beginPath(); g.moveTo(cx,66); g.bezierCurveTo(cx+7,76,cx+5,86,cx,90); g.bezierCurveTo(cx-5,86,cx-7,76,cx,66); g.fill(); g.fillStyle='rgba(255,230,160,.8)'; g.beginPath(); g.arc(cx,79,1.4,0,TAU); g.fill(); }
  // 老者皱纹
  if(old){ g.strokeStyle='rgba(120,70,56,.38)'; g.lineWidth=1.3; for(const s of [-1,1]){ g.beginPath(); g.moveTo(cx+s*30,160); g.quadraticCurveTo(cx+s*42,176,cx+s*34,194); g.stroke(); for(let i=0;i<3;i++){ g.beginPath(); g.moveTo(cx+s*(76),122+i*7); g.lineTo(cx+s*(88),118+i*10); g.stroke(); } } g.beginPath(); g.moveTo(cx-38,76); g.quadraticCurveTo(cx,70,cx+38,76); g.moveTo(cx-30,86); g.quadraticCurveTo(cx,81,cx+30,86); g.stroke(); }
  if(male&&old){ g.fillStyle='rgba(60,50,46,.8)'; g.beginPath(); g.ellipse(cx-12,177,13,4.6,-.2,0,TAU); g.ellipse(cx+12,177,13,4.6,.2,0,TAU); g.fill(); }
  return c;
}
function drawBrows(g,Lk,emo,hairHex){
  const cx=128, y0=Lk.male?98:101; const col=Lk.old?'#8a847c':shadeHex(hairHex||'#241a16',0.02);
  const th={liu:3.6,liu2:3.4,wan:3.0,jian:6.6}[Lk.brow]||3.6;
  for(const s of [-1,1]){
    g.save(); g.translate(cx+s*20,y0); g.scale(s,1);
    // 局部：x 从眉头(0)到眉尾(~62)
    let inner=0, outer=0, arch=7, len=62, peak=.55, droop=0;
    if(Lk.brow==='wan'){ arch=5; len=60; peak=.45; droop=2.5; inner=-2; }
    if(Lk.brow==='liu2'){ arch=9; len=66; peak=.5; outer=-5; }
    if(Lk.brow==='jian'){ arch=3; len=64; peak=.4; outer=-6; }
    if(emo==='angry'){ inner+=8; outer-=5; }
    if(emo==='sad'){ inner-=7; outer+=3; }
    if(emo==='smile'){ outer-=2; arch+=1; }
    if(emo==='shy'){ inner-=2; outer+=2; }
    const px=len*peak, py=-arch;
    g.fillStyle=col; g.globalAlpha=Lk.old?.55:.88;
    g.beginPath(); g.moveTo(0,inner);
    g.bezierCurveTo(px*.5,py*.9+inner*.5,px,py-th*.5,px+10,py+outer*.3-th*.4);
    g.bezierCurveTo(len*.8,py*.4+outer*.8-th*.2,len*.95,outer+droop,len,outer+droop+1);
    g.bezierCurveTo(len*.9,outer+droop+th*.2,len*.7,py*.2+outer*.5+th*.8,px+8,py+th*.55+outer*.2);
    g.bezierCurveTo(px*.6,py*.85+th*.6+inner*.5,px*.2,th*.6+inner*.5,0,inner+th*.9);
    g.closePath(); g.fill(); g.restore(); g.globalAlpha=1;
  }
}
function eyePath(g,w,h,tilt,droop){ // 以眼中心为原点，内眼角在 -x（靠鼻）
  g.beginPath(); g.moveTo(-w/2,1.5);
  g.bezierCurveTo(-w*.28,-h*1.18,w*.16,-h*1.3,w/2,-tilt*w*.9+droop);
  g.bezierCurveTo(w*.2,h*.62,-w*.2,h*.9,-w/2,1.5); g.closePath();
}
function drawEye(g,Lk,s,emo,blink){
  const cx=128, ex=52, ey=126; const E=Lk.eye; const w=Lk.old?33:37; let open=E.open;
  let tilt=E.tilt, droop=0, iris=E.iris, ox=0;
  if(emo==='sad'){ droop=2.4; open*=.9; tilt-=.06; } if(emo==='angry'){ open*=.82; tilt+=.06; } if(emo==='shy'){ open*=.7; ox=w*.14; } if(emo==='smile'){ open*=.62; }
  const h=15*open;
  g.save(); g.translate(cx+s*ex,ey); g.scale(s,1);
  const lashCol='#2a1916';
  if(blink || (emo==='smile'&&false)){
    g.strokeStyle=lashCol; g.lineWidth=2.8; g.lineCap='round'; g.beginPath(); g.moveTo(-w/2,0); g.bezierCurveTo(-w*.2,h*.62,w*.2,h*.62,w/2,-tilt*w*.9+droop+1); g.stroke();
    g.lineWidth=1.2; for(let i=0;i<5;i++){ const t=.35+i*.14; const x=lerp(-w/2,w/2,t); g.beginPath(); g.moveTo(x,h*.52); g.lineTo(x+3+i*.6,h*.52+4.5); g.stroke(); }
    g.restore(); return;
  }
  // 眼窝/重睑阴影
  g.fillStyle='rgba(164,100,92,.22)'; g.beginPath(); g.ellipse(0,-h*1.15,w*.5,h*.62,0,0,TAU); g.fill();
  g.strokeStyle='rgba(150,90,80,.5)'; g.lineWidth=1.3; g.beginPath(); g.moveTo(-w*.4,-h*.95); g.bezierCurveTo(-w*.1,-h*1.8,w*.25,-h*1.8,w*.52,-tilt*w*.9-h*.4+droop); g.stroke();
  g.save(); eyePath(g,w,h,tilt,droop); g.clip();
  g.fillStyle=Lk.old?'#e4dcd2':'#f7f2ee'; g.fillRect(-w,-h*2,w*2,h*4);
  // 虹膜
  const R=h*.82*iris, ix=w*.03+ox, iy=-h*.08+(emo==='sad'?h*.08:0);
  let rg=g.createRadialGradient(ix,iy,R*.1,ix,iy,R); const ic=Lk.cool?'#4a3c3a':'#5a3b2a'; rg.addColorStop(0,ic); rg.addColorStop(.7,'#25140f'); rg.addColorStop(1,'#0e0807'); g.fillStyle=rg; g.beginPath(); g.arc(ix,iy,R,0,TAU); g.fill();
  g.fillStyle='#050303'; g.beginPath(); g.arc(ix,iy,R*.48,0,TAU); g.fill();
  g.fillStyle='rgba(255,255,255,.95)'; g.beginPath(); g.arc(ix-R*.34,iy-R*.36,R*.27,0,TAU); g.fill(); g.fillStyle='rgba(255,255,255,.55)'; g.beginPath(); g.arc(ix+R*.32,iy+R*.4,R*.14,0,TAU); g.fill();
  // 上睑投影
  let sg=g.createLinearGradient(0,-h*1.2,0,h*.2); sg.addColorStop(0,'rgba(30,14,12,.55)'); sg.addColorStop(.45,'rgba(30,14,12,0)'); g.fillStyle=sg; g.fillRect(-w,-h*2,w*2,h*4);
  g.restore();
  // 上睑线（外粗内细）、下睑
  g.lineCap='round'; g.strokeStyle=lashCol; g.lineWidth=2.6*(E.lash||1)+(Lk.male?0:.4); g.beginPath(); g.moveTo(-w/2,1.5); g.bezierCurveTo(-w*.28,-h*1.18,w*.16,-h*1.3,w/2,-tilt*w*.9+droop); g.stroke();
  g.lineWidth=2.4; g.beginPath(); g.moveTo(w*.1,-h*1.2+1); g.bezierCurveTo(w*.3,-h*1.12,w*.5,-tilt*w*.9-h*.3+droop,w*.66,-tilt*w*.9-h*.55+droop-1.5-Math.max(0,tilt)*8); g.stroke();
  if(!Lk.male){ g.lineWidth=1.2; for(let i=0;i<5;i++){ const t=.5+i*.11; const x=lerp(-w/2,w/2,t); const yy=-h*1.18*Math.sin(t*Math.PI*.9)-tilt*w*.9*t*.5; g.beginPath(); g.moveTo(x,yy+1); g.lineTo(x+2.4+i*.5,yy-4.2-i*.2); g.stroke(); } }
  g.strokeStyle='rgba(120,60,56,.4)'; g.lineWidth=1.1; g.beginPath(); g.moveTo(-w*.38,h*.62); g.bezierCurveTo(-w*.1,h*.95,w*.2,h*.85,w*.45,-tilt*w*.8+droop+h*.2); g.stroke();
  if(emo==='smile'){ g.strokeStyle='rgba(255,236,224,.55)'; g.lineWidth=2; g.beginPath(); g.moveTo(-w*.3,h*.9); g.quadraticCurveTo(0,h*.5,w*.3,h*.9); g.stroke(); }
  g.restore();
}
function drawMouth(g,Lk,emo,open){
  const cx=128, my=Lk.old?186:184; let mw=Lk.male?30:27; let curl=0;
  if(emo==='smile'){ curl=-4.5; mw*=1.15; } if(emo==='sad'){ curl=3.6; mw*=.9; } if(emo==='shy'){ curl=-2.2; mw*=.85; } if(emo==='angry'){ curl=1.2; mw*=.95; }
  const lip=Lk.lip, dark=shadeHex(lip,-.16); const lipH=Lk.male?4.2:5.6;
  g.save(); g.translate(cx,my);
  if(open){ const oh=emo==='smile'?9:7.5;
    g.fillStyle='#4a1418'; g.beginPath(); g.moveTo(-mw/2,curl); g.bezierCurveTo(-mw*.25,-lipH*.5,mw*.25,-lipH*.5,mw/2,curl); g.bezierCurveTo(mw*.3,oh,-mw*.3,oh,-mw/2,curl); g.fill();
    g.fillStyle='#f4eee8'; g.beginPath(); g.moveTo(-mw*.28,-1); g.quadraticCurveTo(0,-lipH*.5,mw*.28,-1); g.lineTo(mw*.25,2); g.lineTo(-mw*.25,2); g.fill();
    g.fillStyle='#c4545c'; g.beginPath(); g.ellipse(0,oh*.62,mw*.18,oh*.28,0,0,TAU); g.fill();
    g.strokeStyle=dark; g.lineWidth=2.2; g.beginPath(); g.moveTo(-mw/2,curl); g.bezierCurveTo(-mw*.25,-lipH*.55,mw*.25,-lipH*.55,mw/2,curl); g.stroke();
    g.beginPath(); g.moveTo(-mw/2,curl); g.bezierCurveTo(-mw*.3,oh+1.5,mw*.3,oh+1.5,mw/2,curl); g.stroke();
  } else {
    // 上唇（带人中弓）
    g.fillStyle=lip; g.beginPath(); g.moveTo(-mw/2,curl); g.bezierCurveTo(-mw*.3,-lipH*.5+curl*.4,-mw*.1,-lipH*1.0,0,-lipH*.55); g.bezierCurveTo(mw*.1,-lipH*1.0,mw*.3,-lipH*.5+curl*.4,mw/2,curl); g.bezierCurveTo(mw*.2,.8,-mw*.2,.8,-mw/2,curl); g.fill();
    // 下唇
    g.fillStyle=shadeHex(lip,.04); g.beginPath(); g.moveTo(-mw/2,curl); g.bezierCurveTo(-mw*.2,.8,mw*.2,.8,mw/2,curl); g.bezierCurveTo(mw*.3,lipH*1.35+curl*.3,-mw*.3,lipH*1.35+curl*.3,-mw/2,curl); g.fill();
    g.strokeStyle=dark; g.lineWidth=1.7; g.lineCap='round'; g.beginPath(); g.moveTo(-mw/2-1,curl); g.bezierCurveTo(-mw*.2,1.2,mw*.2,1.2,mw/2+1,curl); g.stroke();
    g.fillStyle='rgba(255,255,255,.38)'; g.beginPath(); g.ellipse(0,lipH*.72,mw*.13,1.5,0,0,TAU); g.fill();
    if(emo==='smile'){ g.strokeStyle='rgba(170,100,90,.4)'; g.lineWidth=1.3; for(const s of [-1,1]){ g.beginPath(); g.moveTo(s*(mw/2+2),curl-3); g.quadraticCurveTo(s*(mw/2+4),curl,s*(mw/2+1.5),curl+3); g.stroke(); } }
  }
  g.restore();
  // 唇下阴影
  g.fillStyle='rgba(160,96,84,.16)'; g.beginPath(); g.ellipse(cx,my+lipH*1.9+(open?5:0),mw*.22,2.6,0,0,TAU); g.fill();
}
function faceTexture(Lk,hairHex,ex){
  const key=[Lk.skin,Lk.blush,Lk.lip,Lk.brow,Lk.eye.tilt,Lk.eye.open,Lk.eye.iris,Lk.mark,Lk.old,Lk.male,Lk.cool,hairHex,ex.e,ex.open?1:0,ex.blink?1:0].join('|');
  let t=FACEC.get(key); if(!t){ t=mkTex(faceCanvas(Lk,hairHex,ex),{clamp:true,aniso:4}); FACEC.set(key,t); } return t;
}

// ───────────────────────── 刺绣纹样 ─────────────────────────
function motif(g,k,x,y,r,col,col2){
  g.save(); g.translate(x,y); g.scale(.72,1); g.fillStyle=col; g.strokeStyle=col; g.lineCap='round'; g.lineJoin='round'; g.lineWidth=Math.max(1,r*.07);
  const leaf=(ang,len,wd)=>{ g.save(); g.rotate(ang); g.beginPath(); g.moveTo(0,0); g.quadraticCurveTo(len*.5,-wd,len,0); g.quadraticCurveTo(len*.5,wd,0,0); g.fill(); g.restore(); };
  const petal=(ang,len,wd)=>{ g.save(); g.rotate(ang); g.beginPath(); g.moveTo(0,0); g.bezierCurveTo(len*.3,-wd,len*.9,-wd*.7,len,0); g.bezierCurveTo(len*.9,wd*.7,len*.3,wd,0,0); g.fill(); g.restore(); };
  if(k==='bamboo'){ g.lineWidth=r*.13; g.beginPath(); g.moveTo(-r*.25,r); g.quadraticCurveTo(r*.05,0,r*.2,-r); g.stroke(); g.lineWidth=r*.07; for(const t of [.2,.45,.7]){ const px=lerp(-r*.25,r*.2,t)+ (t-.5)*0, py=lerp(r,-r,t); g.beginPath(); g.moveTo(px-r*.14,py); g.lineTo(px+r*.14,py); g.stroke(); }
    for(const [t,a,l] of [[.78,-.5,.7],[.78,-2.6,.6],[.52,-.2,.65],[.52,-2.9,.7],[.3,.2,.55],[.3,-3.3,.5],[.95,-1.4,.5]]){ g.save(); g.translate(lerp(-r*.25,r*.2,t),lerp(r,-r,t)); leaf(a,r*l,r*.1); g.restore(); } }
  else if(k==='peony'){ for(let i=0;i<7;i++) petal(i/7*TAU,r*.62,r*.34); g.fillStyle=col2||col; g.globalAlpha=.8; for(let i=0;i<6;i++) petal(i/6*TAU+.3,r*.4,r*.22); g.globalAlpha=1; g.fillStyle=col; g.beginPath(); g.arc(0,0,r*.12,0,TAU); g.fill(); for(const a of [.6,2.5,4.2]){ g.save(); g.rotate(a); g.translate(r*.62,0); leaf(0,r*.5,r*.15); g.restore(); } }
  else if(k==='plum'){ for(let i=0;i<5;i++){ const a=i/5*TAU-1.57; g.beginPath(); g.arc(Math.cos(a)*r*.3,Math.sin(a)*r*.3,r*.26,0,TAU); g.fill(); } g.fillStyle=col2||'#c8402e'; g.beginPath(); g.arc(0,0,r*.1,0,TAU); g.fill(); g.fillStyle=col; g.lineWidth=r*.08; g.beginPath(); g.moveTo(-r*.9,r*.8); g.quadraticCurveTo(-r*.3,r*.5,-r*.5,r*.1); g.stroke(); }
  else if(k==='cloud'){ g.lineWidth=r*.11; g.beginPath(); g.arc(0,-r*.1,r*.32,Math.PI*.9,Math.PI*2.1); g.arc(r*.5,r*.15,r*.24,Math.PI*1.1,Math.PI*2.2); g.stroke(); g.beginPath(); g.arc(-r*.5,r*.15,r*.24,Math.PI*.8,Math.PI*1.9); g.moveTo(-r*.6,r*.5); g.quadraticCurveTo(0,r*.65,r*.6,r*.5); g.stroke(); g.beginPath(); g.arc(0,-r*.1,r*.12,0,TAU); g.fill(); }
  else if(k==='phoenix'){ g.lineWidth=r*.1; for(let i=0;i<4;i++){ const o=(i-1.5)*r*.28; g.beginPath(); g.moveTo(0,r*.1); g.bezierCurveTo(o*2,r*.5,o*3+r*.2,r*.1,o*2.4,-r*.55+i*r*.05); g.bezierCurveTo(o*1.8,-r*.9,o*.6,-r*.7,o*1.2,-r*.35); g.stroke(); } g.beginPath(); g.ellipse(0,0,r*.2,r*.28,0,0,TAU); g.fill(); g.beginPath(); g.arc(r*.1,-r*.38,r*.13,0,TAU); g.fill(); g.beginPath(); g.moveTo(r*.2,-r*.4); g.lineTo(r*.42,-r*.34); g.lineTo(r*.2,-r*.3); g.fill(); }
  else if(k==='lotus'){ for(const a of [-.9,-.45,0,.45,.9]){ g.save(); g.rotate(a-1.57); petal(0,r*.8-Math.abs(a)*r*.2,r*.22); g.restore(); } g.lineWidth=r*.08; g.beginPath(); g.moveTo(0,r*.1); g.lineTo(0,r*.9); g.stroke(); g.beginPath(); g.ellipse(-r*.5,r*.6,r*.42,r*.14,.3,0,TAU); g.fill(); }
  else if(k==='butterfly'){ for(const s of [-1,1]){ g.save(); g.scale(s,1); g.beginPath(); g.ellipse(r*.38,-r*.22,r*.4,r*.28,-.5,0,TAU); g.fill(); g.beginPath(); g.ellipse(r*.28,r*.26,r*.28,r*.2,.5,0,TAU); g.fill(); g.lineWidth=r*.05; g.beginPath(); g.moveTo(0,-r*.2); g.quadraticCurveTo(r*.2,-r*.7,r*.3,-r*.65); g.stroke(); g.restore(); } g.beginPath(); g.ellipse(0,0,r*.07,r*.34,0,0,TAU); g.fill(); }
  g.restore();
}
function waveBand(g,x0,x1,y0,y1,col){ g.strokeStyle=col; g.lineWidth=1.6; const n=22, w=(x1-x0)/n; for(let row=0;row<3;row++){ const yy=y1-4-row*((y1-y0)/3.3); for(let i=0;i<n;i++){ const cx=x0+i*w+(row%2?w/2:0); g.beginPath(); g.arc(cx,yy,w*.5,Math.PI,0); g.stroke(); g.beginPath(); g.arc(cx,yy,w*.32,Math.PI,0); g.stroke(); } } }
const FTEX=new Map();
function fabricTex(baseHex,{kind='plain',motifK='',emb='#d4af37',trim=0xd4af37,sparse=false,male=false}={}){
  const key=[baseHex,kind,motifK,emb,trim,sparse].join('|'); let t=FTEX.get(key); if(t) return t;
  const big=kind!=='plain'&&!!motifK; const W=big?512:128, H=big?256:64; const c=cnv(W,H), g=c.getContext('2d'); const base=hex(baseHex);
  g.fillStyle=base; g.fillRect(0,0,W,H);
  // 丝缎：经纬细纹 + 柔光渐变
  g.globalAlpha=1;
  const gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,'rgba(0,0,0,.10)'); gr.addColorStop(.5,'rgba(255,255,255,.04)'); gr.addColorStop(1,'rgba(0,0,0,.0)'); g.fillStyle=gr; g.fillRect(0,0,W,H);
  if(big){
    const tr=hex(trim), dk=shadeHex(baseHex,-.12), col2=mixHex(baseHex,0xffffff,.3);
    const bandH=Math.round(H*.17), by=H-bandH;
    // 散点纹样（半格错位）
    const cols=sparse?4:5, rows=sparse?2:3; const rs=sparse?30:27;
    for(let r=0;r<rows;r++) for(let i=0;i<cols;i++){ const x=(i+.5+(r%2?.5:0))*(W/cols), y=lerp(34,by-34,rows>1?r/(rows-1):.5); motif(g,motifK,x%W,y,rs,emb,col2); if(x>W-rs*1.2) motif(g,motifK,x-W,y,rs,emb,col2); }
    // 底摆：滚边 + 海水江崖
    g.fillStyle=tr; g.fillRect(0,by,W,bandH); g.fillStyle='rgba(0,0,0,.18)'; g.fillRect(0,by,W,3); g.fillStyle=emb; g.fillRect(0,by+3,W,2.2); g.fillRect(0,H-6,W,2.2);
    waveBand(g,0,W,by+6,H-6,emb); g.fillStyle='rgba(255,255,255,.1)'; g.fillRect(0,by+bandH*.5,W,1);
    // 腰线：窄边
    g.fillStyle=tr; g.globalAlpha=.7; g.fillRect(0,0,W,6); g.globalAlpha=1; g.fillStyle=emb; g.fillRect(0,6,W,1.6);
  } else {
    // 暗纹：小菱格
    g.fillStyle='rgba(255,255,255,.07)'; for(let y=0;y<H;y+=16) for(let x=(y/16%2)*8;x<W;x+=16){ g.beginPath(); g.moveTo(x,y+2); g.lineTo(x+3,y+8); g.lineTo(x,y+14); g.lineTo(x-3,y+8); g.fill(); }
  }
  t=mkTex(c,{aniso:6}); FTEX.set(key,t); return t;
}

// ───────────────────────── 材质 ─────────────────────────
const MC=new Map();
function stdM(color,o={}){ const key=color+JSON.stringify(o); let m=MC.get(key); if(!m){ m=new THREE.MeshStandardMaterial(Object.assign({color,roughness:.6,metalness:0},o)); MC.set(key,m); } return m; }
const INK_GLSL=`{ float _f=1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.); outgoingLight=mix(outgoingLight,outgoingLight*vec3(.46,.36,.34),smoothstep(.74,.98,_f)*.72); }`;
function silkM(map,{side=THREE.FrontSide,rough=.55,sheen=.28,color=0xffffff}={}){
  const key='silk|'+(map?map.uuid:'')+side+rough+sheen+color; let m=MC.get(key); if(m) return m;
  m=new THREE.MeshStandardMaterial({map,color,roughness:rough,metalness:.02,side,envMapIntensity:.75}); m.color.multiplyScalar(.92);
  m.onBeforeCompile=(sh)=>{ sh.fragmentShader=sh.fragmentShader.replace('#include <opaque_fragment>',`{ float _r=pow(1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.),2.4); outgoingLight+=_r*vec3(1.,.93,.86)*${sheen.toFixed(2)}*.3; }\n${INK_GLSL}\n#include <opaque_fragment>`); };
  m.customProgramCacheKey=()=>'silk2'+sheen; MC.set(key,m); return m;
}
function hairTex(hexc){ const key='hair'+hexc; let t=FTEX.get(key); if(t) return t; const c=cnv(256,128), g=c.getContext('2d'); g.fillStyle=hex(hexc); g.fillRect(0,0,256,128);
  for(let i=0;i<420;i++){ const x=rnd()*256, a=rnd(); g.strokeStyle=a>.5?`rgba(255,255,255,${.04+rnd()*.08})`:`rgba(0,0,0,${.12+rnd()*.2})`; g.lineWidth=.6+rnd()*1.4; g.beginPath(); g.moveTo(x,0); g.bezierCurveTo(x+rnd()*6-3,40,x+rnd()*8-4,80,x+rnd()*6-3,128); g.stroke(); }
  // 中分线（正面 u=.25 → x=64）
  g.fillStyle='rgba(235,200,180,.55)'; g.fillRect(63,0,2,128); g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(61,0,2,128); g.fillRect(65,0,2,128);
  t=mkTex(c,{aniso:4}); FTEX.set(key,t); return t; }
function hairM(hexc){ const key='hairM'+hexc; let m=MC.get(key); if(m) return m;
  m=new THREE.MeshStandardMaterial({map:hairTex(hexc),roughness:.5,metalness:.05,envMapIntensity:1.0,side:THREE.DoubleSide});
  m.onBeforeCompile=(sh)=>{ sh.fragmentShader=sh.fragmentShader.replace('#include <opaque_fragment>',`{ float _a=max(0.,1.-abs(normal.y*.95-.38)*2.7); outgoingLight+=pow(_a,2.2)*vec3(.62,.56,.52)*.2; }\n${INK_GLSL}\n#include <opaque_fragment>`); };
  m.customProgramCacheKey=()=>'hair2'; MC.set(key,m); return m; }
function skinM(Lk){ const key='skin'+Lk.skin; let m=MC.get(key); if(m) return m; m=new THREE.MeshStandardMaterial({color:Lk.skin,roughness:.62,metalness:0,envMapIntensity:.7});
  m.onBeforeCompile=(sh)=>{ sh.fragmentShader=sh.fragmentShader.replace('#include <opaque_fragment>',`{ float _s=pow(1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.),2.2); outgoingLight+=_s*vec3(.55,.2,.14)*.24; }\n${INK_GLSL}\n#include <opaque_fragment>`); };
  m.customProgramCacheKey=()=>'skin2'; MC.set(key,m); return m; }
const goldM=()=>stdM(0xe0b94c,{roughness:.28,metalness:.85,envMapIntensity:1.5});
const pearlM=()=>stdM(0xf6f0e6,{roughness:.22,metalness:.1,envMapIntensity:1.3});
const jadeM=()=>stdM(0x8fe3b6,{roughness:.16,metalness:.1,emissive:0x1a6040,emissiveIntensity:.5});

// ───────────────────────── 几何工具 ─────────────────────────
function skullGeo(rx,ry,rz,chin){
  const g=new THREE.SphereGeometry(1,44,32), p=g.attributes.position, uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i); const t=y<0?Math.pow(-y,1.25):0;
    let X=x*rx*(1-chin*t*.62), Y=y*ry*(y<0?1.1:1), Z=z*rz*(1-.2*t); X*=1+.035*Math.exp(-Math.pow((y+.15)/.35,2));
    p.setXYZ(i,X,Y,Z); let u=.5+X/rx*.49, v=(Y+.31)/.58; if(z<0){ const k=1+5*Math.max(0,-z-.03); u=.5+(u-.5)*k; v=.5+(v-.5)*k; } uv.setXY(i,u,v); }
  g.computeVertexNormals(); return g;
}
const HK=[[0,.29],[.3,.30],[.6,.33],[.9,.40],[1.2,.52],[1.5,.62],[2,.68],[3.2,.74]];
function hairCap(rx,ry,rz,knots=HK,vol0=1.045,vol1=.05){
  const SEG=44, ROW=16, pos=[], uv=[], idx=[], grid=[];
  for(let j=0;j<=ROW;j++){ const tt=j/ROW, row=[]; for(let i=0;i<=SEG;i++){ const u=i/SEG, phi=u*TAU; const d=Math.atan2(Math.sin(phi-Math.PI/2),Math.cos(phi-Math.PI/2)), ad=Math.abs(d);
      let tm=knots[knots.length-1][1]; for(let k=0;k<knots.length-1;k++){ if(ad<=knots[k+1][0]){ tm=lerp(knots[k][1],knots[k+1][1],(ad-knots[k][0])/(knots[k+1][0]-knots[k][0])); break; } }
      const th=tt*tm*Math.PI, vol=vol0+vol1*Math.sin(tt*Math.PI*.85);
      pos.push(-Math.cos(phi)*Math.sin(th)*rx*vol, Math.cos(th)*ry*vol, Math.sin(phi)*Math.sin(th)*rz*vol); uv.push(u,1-tt); row.push(pos.length/3-1); } grid.push(row); }
  for(let j=0;j<ROW;j++) for(let i=0;i<SEG;i++){ const a=grid[j][i+1], b=grid[j][i], c=grid[j+1][i], d=grid[j+1][i+1]; if(j!==0) idx.push(a,b,d); idx.push(b,c,d); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function hairUV(g,swap){ const uv=g.attributes.uv; for(let i=0;i<uv.count;i++){ const u=uv.getX(i), v=uv.getY(i); if(swap) uv.setXY(i,.55+v*.4,u); else uv.setXY(i,.55+u*.4,v); } return g; }
function pleatLathe(pts,seg,phiStart,phiLen,N,amp,zs,smooth=18){
  const P=new THREE.SplineCurve(pts.map(p=>new THREE.Vector2(p[0],p[1]))).getPoints(smooth), g=new THREE.LatheGeometry(P,seg,phiStart,phiLen), pos=g.attributes.position;
  const y0=pts[0][1], y1=pts[pts.length-1][1];
  for(let i=0;i<pos.count;i++){ let x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i); const phi=Math.atan2(x,z); const k=Math.pow(1-clamp((y-y0)/(y1-y0),0,1),1.25);
    const f=1+amp*k*(Math.sin(phi*N+y*1.3)*.8+Math.sin(phi*N*2.0+y*2.7)*.2); pos.setXYZ(i,x*f,y,z*f*zs); }
  g.computeVertexNormals(); return g;
}
const rAt=(pts,y)=>{ for(let i=0;i<pts.length-1;i++){ if(y<=pts[i+1][1]){ const t=(y-pts[i][1])/(pts[i+1][1]-pts[i][1]); return lerp(pts[i][0],pts[i+1][0],clamp(t,0,1)); } } return pts[pts.length-1][0]; };
function add(geo,mat,x,y,z,parent,o={}){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); if(o.rot) m.rotation.set(o.rot[0],o.rot[1],o.rot[2]); if(o.s) m.scale.set(o.s[0],o.s[1],o.s[2]); m.castShadow=!!o.cast; m.receiveShadow=false; parent.add(m); return m; }
const sph=(r,w=12,h=9)=>new THREE.SphereGeometry(r,w,h);
const tube=(pts,r,seg=14,rad=5)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),seg,r,rad,false);
function chain(parent,x,y,z,n,segLen,mk,o={}){ const gs=[]; let par=parent; for(let i=0;i<n;i++){ const g=new THREE.Group(); g.position.set(i?0:x,i?-segLen:y,i?0:z); par.add(g); mk(g,i); gs.push(g); par=g; }
  return { gs, st:gs.map(()=>({x:0,z:0,vx:0,vz:0})), back:o.back??1, amp:o.amp??1, w:o.w??15, zeta:o.zeta??.45, f:o.f??1.25, ph:rnd()*6, side:o.side??0, tw:o.tw??1, lim:o.lim??.55 }; }
function stepChain(c,dt,t,m){ const n=c.gs.length;
  for(let i=0;i<n;i++){ const s=c.st[i], k=i+1;
    const tx=c.back*m.fwd*(.2+.12*i)+Math.sin(t*c.f+c.ph+i*.8)*.022*c.amp*k+m.breath*.01*k;
    const tz=clamp(-m.turn*.05*c.tw*k,-.3,.3)+c.side*(.04+m.fwd*.05)+Math.sin(t*c.f*.8+c.ph*1.3+i*.9)*.02*c.amp*k+m.lat*.1*k;
    const w=c.w, z=c.zeta; s.vx+=((tx-s.x)*w*w-2*z*w*s.vx)*dt; s.vz+=((tz-s.z)*w*w-2*z*w*s.vz)*dt; s.x=clamp(s.x+s.vx*dt,-c.lim,c.lim); s.z=clamp(s.z+s.vz*dt,-c.lim,c.lim);
    c.gs[i].rotation.x=s.x; c.gs[i].rotation.z=s.z; } }

// ───────────────────────── 人物建模 ─────────────────────────
function flowerOrn(parent,x,y,z,col,kind='peony',sc=1){ const g=new THREE.Group(); g.position.set(x,y,z); g.scale.setScalar(sc); parent.add(g);
  const pm=stdM(col,{roughness:.5}), pm2=stdM(new THREE.Color(col).lerp(new THREE.Color(0xffffff),.5).getHex(),{roughness:.5}), lm=stdM(0x4f8a4a,{roughness:.6});
  for(let i=0;i<7;i++){ const a=i/7*TAU; add(sph(.045,8,6),pm,Math.cos(a)*.05,0,Math.sin(a)*.05,g,{s:[1,.45,1]}); }
  for(let i=0;i<5;i++){ const a=i/5*TAU+.4; add(sph(.04,8,6),pm2,Math.cos(a)*.026,.018,Math.sin(a)*.026,g,{s:[1,.5,1]}); }
  add(sph(.018,6,5),stdM(0xf2c84a,{roughness:.4}),0,.03,0,g); for(const a of [.8,3.4]) add(sph(.04,6,5),lm,Math.cos(a)*.085,-.012,Math.sin(a)*.085,g,{s:[1.6,.3,.7],rot:[0,-a,0]});
  return g; }
function makeLock(){ const c=cnv(128,128), g=c.getContext('2d'); g.fillStyle='#d9ae45'; g.fillRect(0,0,128,128); g.strokeStyle='#8a6420'; g.lineWidth=5; g.strokeRect(8,8,112,112); g.fillStyle='#7a5518'; g.font='bold 44px "Noto Serif SC",serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('不离',64,40); g.fillText('不弃',64,88); return mkTex(c,{clamp:true}); }
let LOCKT=null;

export function makeCharacter(st){
  const Lk=lookOf(st); const root=new THREE.Group(), body=new THREE.Group(); root.add(body);
  const W2=st.wide||Lk.wide||1, sl=Lk.slim, male=Lk.male, old=Lk.old;
  const hairHex=st.hair??(old?0xb4aea8:0x15110f);
  const robeT=fabricTex(st.robe,{kind:'coat',motifK:Lk.motif,emb:Lk.emb,trim:st.trim??0xd4af37,sparse:false}), skirtT=fabricTex(st.skirt??st.robe,{kind:'skirt',motifK:Lk.motif?Lk.motif:'',emb:Lk.emb,trim:st.trim??0xd4af37,sparse:true});
  const plainRobe=fabricTex(st.robe,{kind:'plain'});
  const coatM=silkM(robeT,{side:THREE.DoubleSide,rough:.5,sheen:.32}), skirtM=silkM(skirtT,{side:THREE.DoubleSide,rough:.62,sheen:.22}), torsoM=silkM(plainRobe,{rough:.55,sheen:.3});
  const trimM=stdM(st.trim??0xd4af37,{roughness:.4,metalness:.4,envMapIntensity:1.2}), sashM=silkM(fabricTex(st.sash??0xd4af37,{kind:'plain'}),{side:THREE.DoubleSide,rough:.5,sheen:.35});
  const skin=skinM(Lk), hm=hairM(hairHex), gold=goldM(), pearl=pearlM();
  // —— 躯干（含肩颈）
  const tp=[[.17,1.14],[.165,1.27],[.2,1.44],[(male?.205:.222),1.58],[.215,1.72],[.19,1.80],[.1,1.88],[.075,1.93]].map(([r,y])=>[r*sl*(male?1.06:1),y]);
  add(pleatLathe(tp,30,Math.PI,TAU,0,0,.78,12),torsoM,0,0,0,body);
  // —— 披挂：褙子/外袍（前开），底摆刺绣
  const cp=[[.74*W2,.12],[.66*W2,.3],[.52*W2,.62],[.40*W2,.95],[.29*sl,1.22],[.27*sl,1.45],[.265*sl,1.62],[.24*sl,1.76],[.145,1.87],[.105,1.93]];
  const gap=male?.36:.62; const coatG=pleatLathe(cp,56,gap/2,TAU-gap,male?9:14,.052,.86,22); coatG.translate(0,-1.2,0);
  const coatP=new THREE.Group(); coatP.position.y=1.2; body.add(coatP); add(coatG,coatM,0,0,0,coatP,{cast:true});
  for(const s of [-1,1]){ const pts=[]; for(let y=.14;y<=1.9;y+=.2){ const r=rAt(cp,y)*1.005, a=s*gap/2; pts.push([r*Math.sin(a),y-1.2,r*Math.cos(a)*(y>1.2?.86:.86)+.002]); } add(tube(pts,.017,24,5),trimM,0,0,0,coatP); }
  // —— 裙
  const sp=[[.62*W2,0],[.60*W2,.1],[.53*W2,.35],[.43*W2,.66],[.33*W2,.95],[.23*sl,1.14],[.185*sl,1.23],[.1,1.25]];
  const skG=pleatLathe(sp,48,Math.PI,TAU,male?8:12,.06,.92,16); skG.translate(0,-1.2,0);
  const skirtP=new THREE.Group(); skirtP.position.y=1.2; body.add(skirtP); add(skG,skirtM,0,0,0,skirtP,{cast:true});
  // —— 腰带 / 交领 / 立领
  const wr=rAt(cp,1.24); add(new THREE.TorusGeometry(wr*1.0,.034,8,40),sashM,0,1.26,0,body,{rot:[Math.PI/2,0,0],s:[1,.86,1]});
  const surf=(y,x)=>{ const r=rAt(cp,y)*1.01, zr=r*.86; return zr*Math.sqrt(Math.max(.02,1-Math.pow(x/r,2)))+.006; };
  const lap=(pts)=>pts.map(([x,y])=>[x,y,surf(y,x)]);
  add(tube(lap([[-.1,1.9],[-.085,1.78],[-.03,1.64],[.06,1.5],[.12,1.34]]),.014,16,5),trimM,0,0,0,body);
  add(tube(lap([[.1,1.9],[.08,1.78],[.02,1.66],[-.05,1.56]]),.011,12,5),sashM,0,0,0,body);
  add(new THREE.TorusGeometry(.1,.017,8,24),trimM,0,1.9,0,body,{rot:[Math.PI/2,0,0],s:[1,.9,1]});
  add(new THREE.CylinderGeometry(.064,.076,.3,14),skin,0,1.98,0,body);
  // —— 项饰 / 随身物
  const cz=surf(1.66,0);
  if(Lk.lock){ add(new THREE.TorusGeometry(.13,.012,6,28),gold,0,1.82,.01,body,{rot:[Math.PI/2-.32,0,0],s:[1,1.1,.9]}); LOCKT=LOCKT||makeLock();
    add(new THREE.CylinderGeometry(.065,.065,.026,24),stdM(0xffffff,{map:LOCKT,roughness:.3,metalness:.7,envMapIntensity:1.5}),0,1.58,cz+.012,body,{rot:[Math.PI/2,0,0]}); add(new THREE.TorusGeometry(.068,.012,6,22),gold,0,1.58,cz+.012,body);
    for(const x of [-.03,0,.03]) add(sph(.012,6,5),pearl,x,1.5,cz+.01,body); }
  if(st.accessory==='jade'){ add(new THREE.TorusGeometry(.12,.01,6,28),stdM(0xc02030,{roughness:.5}),0,1.82,.0,body,{rot:[Math.PI/2-.3,0,0]}); add(new THREE.CylinderGeometry(.06,.06,.03,20),jadeM(),0,1.6,cz+.014,body,{rot:[Math.PI/2,0,0]}); add(new THREE.TorusGeometry(.06,.01,6,20),gold,0,1.6,cz+.014,body);
    add(sph(.016,6,5),stdM(0xc02030),0,1.52,cz+.02,body); }
  if(st.accessory==='qilin'){ const q=new THREE.Group(); q.position.set(.21,1.2,.2); body.add(q); add(new THREE.CapsuleGeometry(.022,.05,3,8),gold,0,0,0,q,{rot:[0,0,1.2]}); add(sph(.024,8,6),gold,.035,.012,.012,q); add(sph(.014,6,5),stdM(0xc02030),.052,.0,.026,q); }
  if(Lk.medal){ const mc=cnv(128,128), mg=mc.getContext('2d'); mg.clearRect(0,0,128,128); mg.fillStyle=mixHex(st.robe,0x000000,.12); mg.beginPath(); mg.arc(64,64,60,0,TAU); mg.fill(); mg.strokeStyle=Lk.emb; mg.lineWidth=4; mg.beginPath(); mg.arc(64,64,56,0,TAU); mg.stroke(); mg.save(); mg.scale(1,1); motif(mg,Lk.motif,64,64,42,Lk.emb,'#fff0c0'); mg.restore();
    const mt=mkTex(mc,{clamp:true}); add(new THREE.CircleGeometry(.1,28),new THREE.MeshStandardMaterial({map:mt,transparent:true,roughness:.5,polygonOffset:true,polygonOffsetFactor:-2}),0,1.5,surf(1.5,0)+.004,body); }
  // —— 腰间宫绦（二级弹簧）
  const chains=[];
  if(!old||st.sash){ for(const s of [-1,1]){ const c=chain(body,s*.12,1.22,surf(1.22,s*.12)+.012,2,.2,(g,i)=>{ add(new THREE.PlaneGeometry(.06,.22).translate(0,-.1,0),sashM,0,0,0,g); if(i===1) add(sph(.022,6,5),gold,0,-.22,0,g); },{back:1.2,amp:1.1,w:13,side:s*.5,f:1.1+rnd()*.3}); chains.push(c); } }
  // —— 双臂：大袖（上臂 + 肘部以下带弹簧）
  const arms=[], fores=[], hands=[];
  for(const s of [-1,1]){ const a=new THREE.Group(); a.position.set(s*(.215*sl+.035),1.76,0); body.add(a);
    add(pleatLathe([[.07*sl,-.5],[.085*sl,-.3],[.092*sl,-.1],[.082*sl,0]],18,Math.PI,TAU,0,0,1,8),torsoM,0,0,0,a,{cast:false});
    const f=new THREE.Group(); f.position.set(0,-.5,0); a.add(f);
    const cuff=male?.115:.2, mid=male?.095:.14;
    const slv=pleatLathe([[cuff,-.5],[mid*1.12,-.3],[.105,-.12],[.09,0]],28,Math.PI,TAU,male?6:9,male?.03:.09,1,12);
    add(slv,coatM,0,0,0,f,{cast:true}); add(new THREE.TorusGeometry(cuff*.97,.018,6,26),trimM,0,-.5,0,f,{rot:[Math.PI/2,0,0]});
    add(new THREE.CylinderGeometry(.03,.036,.16,8),skin,0,-.5,0,f);
    const h=new THREE.Group(); h.position.set(0,-.58,.01); f.add(h); add(sph(.04,10,8),skin,0,0,0,h,{s:[1,1.45,.78]}); add(sph(.016,6,5),skin,s*-.036,.02,.012,h,{s:[.8,2,.8],rot:[0,0,s*.4]});
    if(!male&&!old&&a) add(new THREE.TorusGeometry(.034,.007,6,12),gold,0,-.1,0,f,{rot:[Math.PI/2,0,0]}) ; // 金镯
    f.rotation.x=-.28; a.rotation.z=s*.07; arms.push(a); fores.push(f); hands.push(h); }
  // —— 手持物
  const rh=hands[1], lh=hands[0];
  if(st.accessory==='hoe'){ const h=new THREE.Group(); h.rotation.set(0,0,-.22); rh.add(h); add(new THREE.CylinderGeometry(.014,.014,1.5,6),stdM(0x6a4a2a,{roughness:.8}),0,.45,0,h); add(new THREE.BoxGeometry(.2,.1,.025),gold,0,1.2,.04,h); const bag=add(sph(.07,8,6),stdM(0xf0e0d0,{roughness:.9}),0,1.12,-.05,h,{s:[1,1.1,.8]}); flowerOrn(h,0,1.2,-.04,0xf06b8a,'peony',.5); }
  if(st.accessory==='whisk'){ const h=new THREE.Group(); rh.add(h); h.rotation.set(-.5,0,0); add(new THREE.CylinderGeometry(.013,.013,.5,6),stdM(0x6a4a2a,{roughness:.7}),0,.0,0,h); const wc=chain(h,0,.22,0,2,.2,(g,i)=>{ add(new THREE.ConeGeometry(.07-.02*i,.28,10,1,true).translate(0,-.12,0),stdM(0xf4eee2,{roughness:.9,side:THREE.DoubleSide}),0,0,0,g); },{back:.7,amp:1.5,w:10,f:1.3}); chains.push(wc); }
  if(Lk.kerchief){ const k=add(new THREE.PlaneGeometry(.17,.17),new THREE.MeshStandardMaterial({color:0xfdf6f0,roughness:.8,side:THREE.DoubleSide}),0,-.06,.04,lh,{rot:[.6,.3,.7]}); }
  // —— 鞋
  const feet=[]; for(const s of [-1,1]){ const f=new THREE.Group(); f.position.set(s*.12,.045,.2); root.add(f); add(sph(.08,10,8),stdM(st.shoe??0x8e1b16,{roughness:.6}),0,0,0,f,{s:[1,.55,1.7]}); add(sph(.035,6,5),stdM(st.shoe??0x8e1b16,{roughness:.6}),0,.045,.13,f); feet.push(f); }
  // —— 披风（可选）：肩后下垂，随速度后摆
  let cape=null; if(st.cape){ const cg=pleatLathe([[.7,.35],[.62,.7],[.5,1.1],[.38,1.5],[.3,1.78]],26,Math.PI-1.1,2.2,7,.05,.8,10); cg.translate(0,-1.78,0); const capeM=silkM(fabricTex(st.cape,{kind:'plain'}),{side:THREE.DoubleSide,rough:.5,sheen:.35}); const cpv=new THREE.Group(); cpv.position.set(0,1.78,-.05); body.add(cpv); add(cg,capeM,0,0,.0,cpv,{cast:true}); cape=cpv; }
  // —— 头部
  const head=new THREE.Group(); head.position.set(0,2.31,0); head.scale.setScalar(1.16*Lk.hs); body.add(head);
  const rx=.232, ry=.248, rz=.238;
  const faceMat=new THREE.MeshStandardMaterial({map:faceTexture(Lk,hex(hairHex),{e:'neutral'}),roughness:.6,metalness:0,envMapIntensity:.7}); faceMat.onBeforeCompile=skin.onBeforeCompile; faceMat.customProgramCacheKey=skin.customProgramCacheKey;
  add(skullGeo(rx,ry,rz,Lk.chin),faceMat,0,0,0,head,{cast:true});
  for(const s of [-1,1]){ add(sph(.04,8,6),skin,s*rx*.98,-.03,-.01,head,{s:[.4,1,.7]}); if(!male&&!old){ add(sph(.018,8,6),pearl,s*(rx*1.0+.012),-.115,.0,head); add(new THREE.CylinderGeometry(.004,.004,.04,4),gold,s*(rx*1.0+.012),-.09,.0,head); } }
  buildHair(st,Lk,head,hm,hairHex,chains,{rx,ry,rz,gold,pearl,trimM,sashM,coatM,skin});
  // —— 合并静态件
  root.scale.setScalar(st.scale||1);
  mergeChildren(body); mergeChildren(head); for(const a of arms) mergeChildren(a);
  for(const f of fores) mergeChildren(f);
  root.traverse(o=>{ if(o.isMesh) o.userData.cs=o.castShadow; });
  root.userData.rig={ body,head,arms,fores,hands,skirt:skirtP,coat:coatP,feet,chains,cape,faceMat,Lk,hairHex,
    walk:0,phase:rnd()*6,blend:0,armV:[0,0],armA:[0,0],lod:0,talk:false,emo:'neutral',emoUntil:0,nextBlink:1+rnd()*4,blinkT:0,faceKey:'',lastYaw:null,hv:0,gT:0,gA:0,mood:{hx:0,hy:0,hz:0,bx:0},
    look:0 };
  return root;
}

function buildHair(st,Lk,head,hm,hairHex,chains,K){
  const {rx,ry,rz,gold,pearl,trimM,sashM,skin}=K; const style=st.style; const male=Lk.male, old=Lk.old;
  const H=(geo,x,y,z,o)=>add(hairUV(geo,o&&o.swap),hm,x,y,z,head,o);
  const dirp=(dx,dy,dz,k=1.04)=>{ const l=Math.hypot(dx,dy,dz); return [dx/l*rx*k,dy/l*ry*k,dz/l*rz*k]; };
  // 发帽（含中分、发际线）
  let knots=HK, vol0=1.045; if(style==='nun'){ knots=[[0,.25],[.6,.27],[1.2,.40],[1.6,.56],[2.2,.7],[3.2,.74]]; vol0=1.08; } if(style==='scarf'||style==='hat'){ knots=[[0,.24],[.8,.27],[1.4,.42],[2,.64],[3.2,.74]]; vol0=1.07; } if(style==='crown'){ knots=[[0,.29],[.35,.31],[.8,.36],[1.2,.47],[1.5,.58],[2,.66],[3.2,.72]]; }
  const capGeo=hairCap(rx,ry,rz,knots,vol0,.05);
  let capMat=hm; if(style==='nun'||style==='scarf'){ capMat=silkM(fabricTex(style==='nun'?st.robe:(st.robe),{kind:'plain'}),{side:THREE.DoubleSide,rough:.7,sheen:.2}); }
  const cap=add(capGeo,capMat,0,0,0,head,{cast:true});
  // 鬓发（贴脸垂下）+ 额前碎发
  if(!male||style==='crown'){ for(const s of [-1,1]){ for(const [k,off] of [[0,0],[1,.05]]){ const p=[dirp(s*.34,.64,.7),dirp(s*.62,.4,.68),dirp(s*.84,-.04,.54),dirp(s*.8,-.44,.4)]; if(k) for(const q of p) { q[0]+=s*.006; q[2]-=.004; }
        H(tube(p,k?.009:.014,14,5),0,0,0,{swap:true}); } } }
  // 发髻 / 头饰
  const bun=(x,y,z,r,sx=1,sy=.85,sz=1)=>{ H(sph(r,16,12).scale(sx,sy,sz),x,y,z,{cast:true}); H(new THREE.TorusGeometry(r*.8,r*.2,6,16),x,y-r*.1,z,{rot:[Math.PI/2,0,0],s:[sx,sz,1]}); };
  const bk=-.06;
  if(style==='bun'){ bun(0,.27,bk,.12,1.1,.9,1); bun(0,.36,bk-.02,.07,1.05,.9,1); if(Lk.flowerKind) flowerOrn(head,-.07,.31,bk+.09,st.flower??0xf06b8a,Lk.flowerKind,1.15);
    add(new THREE.CylinderGeometry(.006,.006,.34,5),gold,0,.3,bk,head,{rot:[0,0,Math.PI/2+.25]}); add(sph(.016,6,5),gold,-.17,.38,bk,head); add(sph(.018,6,5),pearl,.14,.24,bk,head); }
  else if(style==='lowbun'){ bun(0,-.06,-.25,.115,1.15,.9,.8); add(new THREE.CylinderGeometry(.006,.006,.3,5),gold,0,-.04,-.28,head,{rot:[0,0,Math.PI/2-.2]}); add(sph(.02,6,5),gold,.15,-.1,-.28,head); add(sph(.022,6,5),pearl,-.14,-.0,-.28,head); }
  else if(style==='high'){ bun(-.07,.31,bk,.095,1,.8,1); bun(.07,.31,bk,.095,1,.8,1); bun(0,.36,bk,.085,1.1,.9,1); H(new THREE.CylinderGeometry(.06,.1,.08,12),0,.26,bk,{}); 
    add(new THREE.CylinderGeometry(.006,.006,.38,5),gold,0,.34,bk,head,{rot:[0,0,Math.PI/2]});
    if(Lk.phoenix){ const f=new THREE.Group(); f.position.set(0,.43,.02); head.add(f); add(sph(.05,10,8),gold,0,0,0,f,{s:[.8,.7,1.5]}); add(sph(.028,8,6),gold,0,.03,.1,f); add(new THREE.ConeGeometry(.01,.04,5),stdM(0xc02030),0,.026,.14,f,{rot:[Math.PI/2,0,0]}); for(const s of [-1,1]) add(new THREE.ConeGeometry(.06,.24,4),gold,s*.12,.04,-.02,f,{rot:[0,0,-s*1.25],s:[1,1,.18]}); for(const [a,l] of [[-.5,.2],[0,.28],[.5,.2]]) add(new THREE.ConeGeometry(.012,l,5),gold,Math.sin(a)*.1,.0,-.12-l*.4,f,{rot:[Math.PI/2+.4,0,a]});
      const pc=chain(f,0,-.02,.13,3,.07,(g,i)=>{ add(sph(.014,6,5),pearl,0,-.02,0,g); add(new THREE.CylinderGeometry(.002,.002,.07,3).translate(0,-.03,0),gold,0,0,0,g); },{back:.6,amp:1.5,w:12,f:1.6}); chains.push(pc); }
    else { flowerOrn(head,.14,.3,bk+.06,st.flower??0xe8a0b8,'peony',.9); add(sph(.02,6,5),pearl,-.14,.3,bk+.04,head); }
    if(st.look==='tanchun'||st.look==='qinkeqing'||st.look==='jinghuan'){ for(const s of [-1,1]){ const pc=chain(head,s*.16,.28,bk+.03,2,.09,(g,i)=>{ add(new THREE.CylinderGeometry(.003,.003,.1,3).translate(0,-.045,0),gold,0,0,0,g); add(sph(.016,6,5),i?stdM(0x5ac8a0,{roughness:.2,metalness:.2}):pearl,0,-.1,0,g); },{back:.5,amp:1.4,w:12,f:1.4,side:s*.3}); chains.push(pc); } } }
  else if(style==='twin'){ for(const s of [-1,1]){ bun(s*.15,.21,bk,.09,1,.9,1); add(new THREE.TorusGeometry(.07,.012,5,14),sashM,s*.15,.16,bk,head,{rot:[Math.PI/2,0,0]}); add(sph(.018,6,5),pearl,s*.2,.26,bk+.05,head);
      const tc=chain(head,s*.19,.14,bk-.02,3,.1,(g,i)=>{ H(sph(.05-.008*i,8,6).scale(1,1.5,.9).translate(0,-.05,0),0,0,0,{}); if(i===2) add(sph(.022,6,5),sashM,0,-.12,0,g); },{back:.9,amp:1.3,w:13,side:s*.25,f:1.2}); chains.push(tc); } }
  else if(style==='maid'){ for(const s of [-1,1]){ bun(s*.19,.15,bk+.01,.075,1.1,.95,1); add(new THREE.TorusGeometry(.05,.011,5,12),sashM,s*.17,.12,bk+.01,head,{rot:[Math.PI/2,0,0]}); add(sph(.015,6,5),pearl,s*.22,.2,bk+.06,head); } }
  else if(style==='crown'){ H(sph(.075,14,10).scale(1,1,1),0,.28,bk,{cast:true}); const cg=new THREE.Group(); cg.position.set(0,.3,bk); head.add(cg);
    add(new THREE.CylinderGeometry(.085,.1,.1,18),gold,0,0,0,cg,{cast:true}); add(new THREE.TorusGeometry(.09,.012,6,18),gold,0,-.04,0,cg,{rot:[Math.PI/2,0,0]}); add(sph(.025,8,6),stdM(0xd02838,{roughness:.2,metalness:.2}),0,.075,0,cg);
    for(const s of [-1,1]){ add(new THREE.ConeGeometry(.032,.14,6),gold,s*.11,.05,-.01,cg,{rot:[0,0,-s*.7]}); add(sph(.014,6,5),pearl,s*.16,.1,-.01,cg); }
    // 抹额
    const bnd=add(new THREE.TorusGeometry(1,.1,6,32),stdM(0xb82030,{roughness:.4,metalness:.1}),0,.12,0,head,{rot:[Math.PI/2+.12,0,0],s:[rx*1.06,rz*1.08,.2]}); add(sph(.028,8,6),jadeM(),0,.15,rz*1.06+.0,head); add(new THREE.TorusGeometry(.034,.007,6,14),gold,0,.15,rz*1.06+.01,head);
    if(Lk.braid){ const bc=chain(head,0,-.08,-.2,5,.12,(g,i)=>{ H(sph(.058-.005*i,10,8).scale(1,1.25,1).translate(0,-.06,0),0,0,0,{}); if(i===4){ add(sph(.022,6,5),stdM(0xc02030),0,-.15,0,g); add(sph(.016,6,5),pearl,0,-.19,0,g); } },{back:1.1,amp:1.2,w:12,f:1.0}); chains.push(bc); } }
  else if(style==='hat'){ const hc=st.hatC??0x1a1a22, hmat=silkM(fabricTex(hc,{kind:'plain'}),{rough:.6,sheen:.15}); add(new THREE.CylinderGeometry(.19,.235,.2,16),hmat,0,.3,-.01,head,{cast:true}); add(new THREE.TorusGeometry(.235,.024,6,22),stdM(st.trim??0xd4af37,{roughness:.4,metalness:.4}),0,.2,-.01,head,{rot:[Math.PI/2,0,0]}); for(const s of [-1,1]) add(new RoundedBoxLike(.2,.05,.02),hmat,s*.19,.35,-.2,head,{rot:[0,0,s*.3]}); if(old) add(sph(.02,6,5),gold,0,.4,.15,head); }
  else if(style==='nun'){ const clothM=silkM(fabricTex(st.robe,{kind:'plain'}),{side:THREE.DoubleSide,rough:.7,sheen:.2}); add(new THREE.CylinderGeometry(.2,.26,.12,18,1,true),clothM,0,.2,-.015,head,{cast:true}); add(sph(.2,14,10).scale(1.0,.75,1.04),clothM,0,.3,-.02,head); add(new THREE.TorusGeometry(.19,.014,6,22),trimM,0,.255,0,head,{rot:[Math.PI/2+.1,0,0],s:[1,1.1,1]});
    const nc=chain(head,0,.12,-.2,3,.2,(g,i)=>{ add(new THREE.PlaneGeometry(.38-.05*i,.22).translate(0,-.1,0),clothM,0,0,0,g); },{back:1,amp:1.2,w:11,f:1.0}); chains.push(nc); }
  else if(style==='scarf'){ const cm=silkM(fabricTex(st.robe,{kind:'plain'}),{side:THREE.DoubleSide,rough:.8,sheen:.1}); add(sph(.24,14,10).scale(1,.9,1.06),cm,0,.08,-.02,head,{cast:true}); add(new THREE.TorusGeometry(.2,.03,6,20),cm,0,.18,.0,head,{rot:[Math.PI/2+.15,0,0],s:[1,1.1,1]}); add(sph(.06,8,6),cm,0,-.04,-.26,head); flowerOrn(head,.15,.28,.02,0xd02838,'peony',.7); }
  // 额外：披发（黛玉）
  if(Lk.longhair){ const lc=chain(head,0,.06,-.02,3,.36,(g,i)=>{ const rT=[.255,.26,.235][i], rB=[.26,.235,.11][i]; H(new THREE.CylinderGeometry(rT,rB,.37,22,1,true,Math.PI-1.05,2.1).translate(0,-.18,0),0,0,0,{cast:false}); },{back:1.0,amp:1.0,w:11,zeta:.5,f:.9}); chains.push(lc);
    for(const s of [-1,1]){ const fc=chain(head,s*.2,-.08,.12,3,.16,(g,i)=>{ H(sph(.032-.006*i,8,6).scale(1,2.6,1).translate(0,-.08,0),0,0,0,{}); },{back:.25,amp:1.1,w:12,side:s*.3,f:1.1}); chains.push(fc); } }
  if(st.look==='baochai'||st.look==='xiren'||style==='bun'&&!Lk.longhair&&false){}
}
function RoundedBoxLike(w,h,d){ return new THREE.BoxGeometry(w,h,d); }

// ───────────────────────── 动画 ─────────────────────────
const _w=new THREE.Vector3(), _c=new THREE.Vector3();
const MOODS={ neutral:{hx:0,hy:0,hz:0,bx:0}, smile:{hx:-.03,hy:0,hz:.05,bx:0}, sad:{hx:.15,hy:0,hz:.07,bx:.035}, shy:{hx:.1,hy:.28,hz:-.09,bx:.02}, angry:{hx:-.07,hy:0,hz:0,bx:-.025} };
export function setTalking(ch,on){ const r=ch.userData.rig; if(r) r.talk=!!on; }
export function setEmotion(ch,e='neutral',dur=0){ const r=ch.userData.rig; if(!r) return; r.emo=MOODS[e]?e:'neutral'; r.emoUntil=dur>0?performance.now()/1000+dur:0; }
function applyFace(r,emo,open,blink){ const key=emo+(open?'o':'')+(blink?'b':''); if(key===r.faceKey) return; r.faceKey=key; r.faceMat.map=faceTexture(r.Lk,hex(r.hairHex),{e:emo,open,blink}); }
export function animateCharacter(ch,dt,t,speed){
  const r=ch.userData.rig; if(!r) return; dt=Math.min(dt,.05); const now=performance.now()/1000;
  r.blend+=(clamp(speed/2,0,1)-r.blend)*(1-Math.exp(-dt*9)); const b=r.blend; r.walk+=dt*(2.2+speed*2.6);
  const w=Math.sin(r.walk), w2=Math.sin(r.walk*2), br=Math.sin(t*1.6+r.phase), ph=r.phase;
  const yaw=ch.rotation.y; if(r.lastYaw===null) r.lastYaw=yaw; let dy=Math.atan2(Math.sin(yaw-r.lastYaw),Math.cos(yaw-r.lastYaw)); r.lastYaw=yaw; if(dt>0) r.hv+=(clamp(dy/dt,-6,6)-r.hv)*(1-Math.exp(-dt*8));
  // 距离 LOD
  let lod=0; if(CAM){ ch.getWorldPosition(_w); const d=_w.distanceTo(CAM.position); lod=d>45?2:d>24?1:0; }
  if(lod!==r.lod){ r.lod=lod; ch.traverse(o=>{ if(o.isMesh) o.castShadow=lod<1&&!!o.userData.cs; }); }
  // 情绪
  if(r.emoUntil&&now>r.emoUntil){ r.emo='neutral'; r.emoUntil=0; }
  const M=MOODS[r.emo]; const km=1-Math.exp(-dt*4); const md=r.mood; md.hx+=(M.hx-md.hx)*km; md.hy+=(M.hy-md.hy)*km; md.hz+=(M.hz-md.hz)*km; md.bx+=(M.bx-md.bx)*km;
  r.gA+=((r.talk?1:0)-r.gA)*(1-Math.exp(-dt*5)); const gA=r.gA;
  // 躯干：呼吸、重心转移、行走起伏
  const sway=Math.sin(t*.37+ph);
  r.body.position.y=b*Math.abs(Math.cos(r.walk))*.035+(1-b)*br*.007; r.body.position.x=(1-b)*sway*.012;
  r.body.scale.y=1+br*.004*(1-b); r.body.rotation.z=b*w*.03+(1-b)*sway*.014; r.body.rotation.x=b*.05+md.bx+gA*Math.sin(t*5.2)*.008; r.body.rotation.y=b*w*.06+(1-b)*Math.sin(t*.29+ph)*.03;
  // 手臂（弹簧）+ 说话手势
  for(let k=0;k<2;k++){ const sg=k?-1:1; let tgt=b*sg*w*.5+(1-b)*Math.sin(t*1.05+ph+k)*.04;
    if(k===1) tgt=lerp(tgt,-.5+Math.sin(t*2.1)*.12+Math.sin(t*3.7)*.06,gA); else tgt=lerp(tgt,-.12+Math.sin(t*1.7+1)*.05,gA*.5);
    const acc=(tgt-r.armA[k])*70-r.armV[k]*12; r.armV[k]+=acc*dt; r.armA[k]+=r.armV[k]*dt;
    const a=r.arms[k], f=r.fores[k]; a.rotation.x=r.armA[k]; a.rotation.z=(k?1:-1)*(.07+b*.035+Math.abs(r.armV[k])*.012);
    const ft=-.28-clamp(r.armV[k]*.05,-.25,.35)-(k===1?gA*(.5+Math.sin(t*4.1)*.15):gA*.12)-md.hx*.4; r.fs=r.fs||[0,0]; r.fs[k]+=(ft-r.fs[k])*(1-Math.exp(-dt*14)); f.rotation.x=r.fs[k]; f.rotation.z=(k?-1:1)*(Math.abs(r.armV[k])*.02); }
  // 裙/褙子摆动
  r.skirt.rotation.z=b*w*.04+(1-b)*Math.sin(t*.9+ph)*.008; r.skirt.rotation.x=-b*.05+Math.sin(t*1.1+ph)*.004; r.skirt.scale.x=1+b*w2*.012;
  r.coat.rotation.z=b*Math.sin(r.walk-.5)*.03+(1-b)*Math.sin(t*.9+ph+.4)*.007; r.coat.rotation.x=-b*.07;
  // 双脚
  r.feet[0].position.z=.2+b*w*.16; r.feet[1].position.z=.2-b*w*.16; r.feet[0].position.y=.045+b*Math.max(0,w)*.05; r.feet[1].position.y=.045+b*Math.max(0,-w)*.05;
  // 头：漂移/注视玩家/说话点头
  let ty=(1-b)*Math.sin(t*.35+ph)*.14; r.look=r.look||0;
  if(LOOKAT&&lod===0){ ch.getWorldPosition(_w); _c.copy(LOOKAT).sub(_w); const dist=Math.hypot(_c.x,_c.z); if(dist<9&&dist>.5){ let ang=Math.atan2(_c.x,_c.z)-ch.rotation.y; ang=Math.atan2(Math.sin(ang),Math.cos(ang)); if(Math.abs(ang)<2.2){ ty=clamp(ang,-.85,.85); r.look+=(1-r.look)*(1-Math.exp(-dt*3)); } else r.look+=(0-r.look)*(1-Math.exp(-dt*3)); } else r.look+=(0-r.look)*(1-Math.exp(-dt*3)); }
  r.hy=r.hy||0; r.hy+=(ty+md.hy-r.hy)*(1-Math.exp(-dt*4.5));
  const hd=r.head; hd.rotation.y=r.hy; hd.rotation.x=-b*.04+(1-b)*Math.sin(t*.65+ph)*.02+md.hx+gA*(Math.sin(t*5.5)*.03+Math.sin(t*2.3)*.03); hd.rotation.z=md.hz-b*w*.015+(1-b)*Math.sin(t*.5+ph)*.015;
  // 披风
  if(r.cape){ r.cape.rotation.x+=((b*.34+Math.sin(t*1.1+ph)*.03)-r.cape.rotation.x)*(1-Math.exp(-dt*6)); r.cape.rotation.z+=((-r.hv*.03)-r.cape.rotation.z)*(1-Math.exp(-dt*6)); }
  if(lod<2){ const m={fwd:b,turn:r.hv+r.hy*.0,breath:br,lat:sway}; if(lod===0||(r.lodTick=(r.lodTick||0)+1)%2===0) for(const c of r.chains) stepChain(c,dt*(lod?2:1),t,m); }
  // 眼睛/嘴：眨眼 + 说话口型
  if(lod===0&&dt>0){ if(now>r.nextBlink){ r.blinkT=now+.14; r.nextBlink=now+(Math.random()<.2?.38:2.4+Math.random()*3.6); }
    const open=r.talk&&(Math.sin(now*11.3)+Math.sin(now*6.7+1.3)>.1); applyFace(r,r.emo,open,now<r.blinkT); }
}

// ───────────────────────── 立绘 ─────────────────────────
function paperPortrait(img,w,h,st,Lk){
  const c=cnv(w,h), g=c.getContext('2d'); const base=new THREE.Color(st.robe);
  g.fillStyle='#efe3cc'; g.fillRect(0,0,w,h);
  const rg=g.createRadialGradient(w*.5,h*.38,10,w*.5,h*.45,h*.8); const tint=base.clone().lerp(new THREE.Color(0xefe3cc),.62); rg.addColorStop(0,'#'+tint.clone().lerp(new THREE.Color(0xffffff),.3).getHexString()); rg.addColorStop(.7,'#'+tint.getHexString()); rg.addColorStop(1,'#'+base.clone().lerp(new THREE.Color(0xb89a70),.55).getHexString()); g.fillStyle=rg; g.fillRect(0,0,w,h);
  // 水墨晕染
  _s=(st.robe*7+13)>>>0; for(let i=0;i<9;i++){ const x=rnd()*w, y=h*(.45+rnd()*.55), r=40+rnd()*100; const bg=g.createRadialGradient(x,y,0,x,y,r); const a=.05+rnd()*.07; bg.addColorStop(0,`rgba(60,48,40,${a})`); bg.addColorStop(1,'rgba(60,48,40,0)'); g.fillStyle=bg; g.fillRect(x-r,y-r,r*2,r*2); }
  g.globalAlpha=.07; for(let i=0;i<260;i++){ g.strokeStyle=rnd()>.5?'#fff':'#5a4632'; g.lineWidth=.6; const x=rnd()*w, y=rnd()*h; g.beginPath(); g.moveTo(x,y); g.lineTo(x+rnd()*14-7,y+rnd()*14-7); g.stroke(); } g.globalAlpha=1;
  g.drawImage(img,0,0,w,h);
  const vg=g.createLinearGradient(0,h*.78,0,h); vg.addColorStop(0,'rgba(60,40,30,0)'); vg.addColorStop(1,'rgba(60,40,30,.28)'); g.fillStyle=vg; g.fillRect(0,0,w,h);
  g.strokeStyle='rgba(90,60,40,.75)'; g.lineWidth=3; g.strokeRect(7,7,w-14,h-14); g.strokeStyle='rgba(200,160,90,.7)'; g.lineWidth=1.2; g.strokeRect(13,13,w-26,h-26);
  return c;
}
export function renderPortraits(styles,opts={}){
  const out={}, W=360, H=450; const c=cnv(W,H);
  const rr=new THREE.WebGLRenderer({canvas:c,alpha:true,antialias:true,preserveDrawingBuffer:true}); rr.toneMapping=THREE.ACESFilmicToneMapping; rr.toneMappingExposure=1.05; rr.outputColorSpace=THREE.SRGBColorSpace; rr.setClearColor(0x000000,0);
  const sc=new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff0e0,0x8a7a6a,.95));
  const key=new THREE.DirectionalLight(0xfff0dc,2.2); key.position.set(1.8,2.6,3.2); sc.add(key);
  const rim=new THREE.DirectionalLight(0xbcd6ff,1.7); rim.position.set(-2.4,2.2,-1.8); sc.add(rim);
  const fill=new THREE.DirectionalLight(0xffd8c0,.7); fill.position.set(-1.5,.4,2.5); sc.add(fill);
  const cam=new THREE.PerspectiveCamera(22,W/H,.1,50);
  const moods=opts.moods||{}, bigset=opts.principals||[];
  const shot=(ch,id,mood)=>{ const r=ch.userData.rig; r.emo=mood; applyFace(r,mood,false,false); const M=MOODS[mood]; r.head.rotation.set(M.hx,-.1+M.hy*.5,M.hz); r.body.rotation.x=M.bx;
    ch.updateMatrixWorld(true); r.head.getWorldPosition(_w); const s=ch.scale.x; cam.position.set(_w.x+.0,_w.y-.02,_w.z+3.55); cam.lookAt(_w.x,_w.y-.5*s,_w.z); rr.render(sc,cam);
    const img=new Image(); out[id+(mood==='neutral'?'':':'+mood)]=null; return c; };
  for(const [id,st] of Object.entries(styles)){ const ch=makeCharacter(st); ch.rotation.y=.36; sc.add(ch);
    const list=bigset.includes(id)?['neutral','smile','sad','shy','angry']:['neutral'];
    for(const m of list){ shot(ch,id,m); const p=paperPortrait(c,W,H,st); out[id+(m==='neutral'?'':':'+m)]=p.toDataURL('image/jpeg',.9); }
    sc.remove(ch); ch.traverse(o=>{ if(o.isMesh) o.geometry.dispose(); }); }
  rr.dispose(); rr.forceContextLoss?.(); return out;
}
