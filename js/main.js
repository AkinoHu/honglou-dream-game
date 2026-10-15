import * as THREE from '../vendor/three.module.min.js';
import { LOCATIONS, CHARS, EVENTS, QUIZ, POEMS, ENDINGS, MAX_DAY, TIMES } from './data.js';

const $ = s => document.querySelector(s);
const CN = ['零','一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六'];
const STAT_NAMES = { talent:'才情', fortune:'家运', zen:'禅心' };
const SAVE_KEY = 'honglou_save_v1', CFG_KEY = 'honglou_ai_cfg';

// ---------------- 状态 ----------------
function freshState(){
  const aff = {}; for (const k in CHARS) aff[k] = 20;
  aff.daiyu = 30; aff.baochai = 25;
  return { day:1, slot:0, aff, talent:10, fortune:50, zen:5, done:{}, used:{}, poems:['haoliao'], pos:[-15,10], ended:null, log:[] };
}
let S = freshState();
let busy = false; // 对话/事件中

// ---------------- 场景 ----------------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xfff2d8, 0x557744, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30, 50, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left:-60, right:60, top:60, bottom:-60, far:150 });
scene.add(sun);
scene.fog = new THREE.Fog(0xcfe3e8, 60, 160);

const M = (c, o={}) => new THREE.MeshStandardMaterial({ color:c, roughness:.85, ...o });
function box(w,h,d,c,x,y,z,parent=scene){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),M(c)); m.position.set(x,y,z); m.castShadow=m.receiveShadow=true; parent.add(m); return m; }
function cyl(rt,rb,h,c,x,y,z,parent=scene,seg=10){ const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),M(c)); m.position.set(x,y,z); m.castShadow=true; parent.add(m); return m; }

// 地面
const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 60, 60), M(0x7fa65a));
{ const p = ground.geometry.attributes.position; for (let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i); const r=Math.hypot(x,y); if (r>55) p.setZ(i, (r-55)*0.25 + Math.sin(x*.2)*Math.cos(y*.2)*2); } ground.geometry.computeVertexNormals(); }
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
// 小径
const pathMat = M(0xd8c9a3);
for (const L of LOCATIONS){ const [x,z]=L.pos; const len=Math.hypot(x,z); const p=new THREE.Mesh(new THREE.PlaneGeometry(2.4,len),pathMat); p.rotation.x=-Math.PI/2; p.rotation.z=Math.atan2(x,z)+Math.PI; p.position.set(x/2,.02,z/2); p.receiveShadow=true; scene.add(p); }
// 沁芳溪 / 池
const water = new THREE.Mesh(new THREE.RingGeometry(4.5, 9, 48), M(0x4a90a8, { roughness:.15, metalness:.3, transparent:true, opacity:.88 }));
water.rotation.x = -Math.PI/2; water.position.y = .05; scene.add(water);
const stream = new THREE.Mesh(new THREE.PlaneGeometry(4, 70), water.material); stream.rotation.x=-Math.PI/2; stream.rotation.z=.5; stream.position.set(8,.04,6); scene.add(stream);
// 围墙
const wallMat = M(0xf0e6d2), tileMat = M(0x3a3a4a);
for (const [x,z,w,d] of [[0,-48,96,1],[0,48,96,1],[-48,0,1,96],[48,0,1,96]]){ box(w,3,d||1,0xf0e6d2,x,1.5,z); box(w+.6,.5,(d||1)+.8,0x3a3a4a,x,3.2,z); }
// 假山
for (let i=0;i<14;i++){ const a=i*2.1, r=12+((i*7)%9); const m=new THREE.Mesh(new THREE.DodecahedronGeometry(1+(i%3)*.6,0),M(0x9a9a8a)); m.position.set(Math.cos(a)*r,.6,Math.sin(a)*r); m.rotation.set(i,i*2,0); m.scale.y=1.4; m.castShadow=true; scene.add(m); }

// 植物
function tree(x,z,kind){
  const g=new THREE.Group(); g.position.set(x,0,z); scene.add(g);
  if (kind==='bamboo'){ for(let i=0;i<5;i++){ const c=cyl(.08,.1,5+Math.random()*2,0x5d8a3a,(Math.random()-.5)*1.4,3,(Math.random()-.5)*1.4,g,5); const l=new THREE.Mesh(new THREE.ConeGeometry(.6,2,5),M(0x6fa04a)); l.position.set(c.position.x,5.5,c.position.z); g.add(l);} return g; }
  cyl(.2,.3,2.4,0x6b4a2a,0,1.2,0,g,6);
  const col = kind==='plum'?0xd02040: kind==='flowers'?0xf4a7b9: kind==='autumn'?0xd98b2b: kind==='willow'?0x9cc25a:0x4f7f3a;
  const f=new THREE.Mesh(new THREE.IcosahedronGeometry(1.6,0),M(col)); f.position.y=3.2; f.castShadow=true; g.add(f);
  return g;
}
for (let i=0;i<70;i++){ const a=Math.random()*Math.PI*2, r=14+Math.random()*32; const x=Math.cos(a)*r, z=Math.sin(a)*r; if (LOCATIONS.some(L=>Math.hypot(L.pos[0]-x,L.pos[1]-z)<7)) continue; tree(x,z,i%4===0?'willow':i%5===0?'flowers':'tree'); }

// 建筑
const locGroups = {};
function building(L){
  const g = new THREE.Group(); const [x,z]=L.pos; g.position.set(x,0,z); g.lookAt(0,0,0); scene.add(g); locGroups[L.id]=g;
  if (L.kind==='pavilion'){
    box(5,.4,5,0xc9b28a,0,.2,0,g); for(const [a,b] of [[-2,-2],[2,-2],[-2,2],[2,2]]) cyl(.18,.18,3,0x8b1a1a,a,1.9,b,g,8);
    const r=new THREE.Mesh(new THREE.ConeGeometry(4.2,2,4),M(L.roof)); r.position.y=4.4; r.rotation.y=Math.PI/4; r.castShadow=true; g.add(r);
    cyl(.1,.25,.8,0xd4af37,0,5.6,0,g); // 宝顶
    // 曲桥
    for(let i=0;i<6;i++) box(1.6,.3,1.4,0xb5651d,0,.35,3.2+i*1.2,g);
    return;
  }
  box(9,.6,6,0xb8a88a,0,.3,0,g);
  box(8,3.4,5,L.color===0xbfbfbf?0xe8e2d6:0xf0e2c4,0,2.3,0,g);
  for(const a of [-3.6,-1.2,1.2,3.6]) cyl(.2,.2,3.4,0x8b1a1a,a,2.3,2.6,g,8);
  box(1.6,2.4,.1,0x5a2a1a,0,1.8,2.55,g); // 门
  // 歇山顶
  const roof=new THREE.Mesh(new THREE.CylinderGeometry(0,1,1,4,1),M(L.roof)); roof.scale.set(7.2,2.4,4.8); roof.rotation.y=Math.PI/4; roof.position.y=5.2; roof.castShadow=true; g.add(roof);
  box(10,.25,6.8,L.roof,0,4.05,0,g);
  // 匾额
  const sign = textSprite(L.name, { bg:'#1a1a3a', fg:'#d4af37', size:40, border:'#d4af37' }); sign.position.set(0,4.6,2.9); sign.scale.set(3,.9,1); g.add(sign);
  // 院中景致
  const kinds = { bamboo:'bamboo', flowers:'flowers', plum:'plum', tree:'autumn', stone:'tree', farm:'tree', hall:'tree' };
  for (let i=0;i<6;i++){ const lx=(i%3-1)*4.5+(Math.random()-.5), lz=-5-Math.floor(i/3)*3; const t=tree(0,0,kinds[L.kind]); g.add(t); t.position.set(lx,0,lz); }
  if (L.kind==='farm'){ for(let i=0;i<20;i++) box(.15,1.2,.15,0xd8b04a,-5+(i%5)*.6,.6,4+Math.floor(i/5)*.6,g); }
  if (L.kind==='stone'){ for(let i=0;i<4;i++){ const m=new THREE.Mesh(new THREE.DodecahedronGeometry(.9,0),M(0xa8a090)); m.position.set(-4+i*2.6,.8,4.5); m.scale.y=1.6; g.add(m);} }
  // 灯笼
  for(const a of [-2.4,2.4]){ const l=new THREE.Mesh(new THREE.SphereGeometry(.35,10,8),new THREE.MeshStandardMaterial({color:0xff3020,emissive:0xff2010,emissiveIntensity:.6})); l.position.set(a,3.4,2.9); l.scale.y=1.3; g.add(l); lanterns.push(l); }
}
const lanterns=[];
LOCATIONS.forEach(building);

// 文本精灵
function textSprite(text, { bg='rgba(250,240,215,.9)', fg='#7a1a1a', size=34, border='#7a1a1a' }={}){
  const c=document.createElement('canvas'), x=c.getContext('2d'); const f=`bold ${size}px "Songti SC","Noto Serif SC",serif`; x.font=f;
  const w=x.measureText(text).width+size; c.width=w; c.height=size*1.6; x.font=f;
  x.fillStyle=bg; x.fillRect(0,0,c.width,c.height); x.strokeStyle=border; x.lineWidth=4; x.strokeRect(2,2,c.width-4,c.height-4);
  x.fillStyle=fg; x.textAlign='center'; x.textBaseline='middle'; x.fillText(text,c.width/2,c.height/2+2);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false})); s.scale.set(c.width/c.height*.7,.7,1); s.renderOrder=10; return s;
}

// 人物（低多边形）
function figure(robe, hair, { male=false, hat=false }={}){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.ConeGeometry(.75,2.1,10),M(robe)); body.position.y=1.05; body.castShadow=true; g.add(body);
  const sash=new THREE.Mesh(new THREE.TorusGeometry(.38,.06,6,16),M(0xd4af37)); sash.rotation.x=Math.PI/2; sash.position.y=1.45; g.add(sash);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.38,16,12),M(0xf6dcc0)); head.position.y=2.35; head.castShadow=true; g.add(head);
  const h=new THREE.Mesh(new THREE.SphereGeometry(.41,16,12,0,Math.PI*2,0,Math.PI/1.9),M(hair)); h.position.y=2.4; h.rotation.x=-.25; g.add(h);
  if (male){ const cap=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,.3,10),M(0xd4af37)); cap.position.y=2.78; g.add(cap); }
  else { const bun=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),M(hair)); bun.position.set(0,2.8,-.15); g.add(bun); const pin=new THREE.Mesh(new THREE.SphereGeometry(.07,6,6),M(0xd02040,{emissive:0x400010})); pin.position.set(.18,2.82,-.1); g.add(pin); }
  for (const s of [-1,1]){ const a=new THREE.Mesh(new THREE.CylinderGeometry(.12,.2,1,6),M(robe)); a.position.set(.55*s,1.55,0); a.rotation.z=.35*s; g.add(a); }
  return g;
}
const player = figure(0xc8102e, 0x1a1a1a, { male:true }); scene.add(player);
{ const jade=new THREE.Mesh(new THREE.SphereGeometry(.1,8,6),M(0x7fffb0,{emissive:0x2a8a5a})); jade.position.set(0,1.75,.62); player.add(jade); }
const pLabel=textSprite('贾宝玉'); pLabel.position.y=3.3; player.add(pLabel);

const npcs={};
for (const [id,C] of Object.entries(CHARS)){
  const L=LOCATIONS.find(l=>l.id===C.loc); const g=figure(C.robe,C.hair);
  const off = id==='xiren'? [3,6] : id==='xiangyun' ? [-3,-4] : [2.2,5.2];
  const grp=locGroups[C.loc]; const v=new THREE.Vector3(off[0],0,off[1]); grp.localToWorld(v); g.position.set(v.x,0,v.z);
  g.lookAt(0,0,0); const lab=textSprite(C.name); lab.position.y=3.3; g.add(lab);
  g.userData={id, base:g.position.clone(), phase:Math.random()*6}; scene.add(g); npcs[id]=g;
}

// 粒子（花瓣/雪）
const petalGeo=new THREE.BufferGeometry(); const PN=600; const pp=new Float32Array(PN*3);
for(let i=0;i<PN;i++){ pp[i*3]=(Math.random()-.5)*100; pp[i*3+1]=Math.random()*25; pp[i*3+2]=(Math.random()-.5)*100; }
petalGeo.setAttribute('position',new THREE.BufferAttribute(pp,3));
const petals=new THREE.Points(petalGeo,new THREE.PointsMaterial({color:0xffb7c5,size:.35,transparent:true,opacity:.85})); scene.add(petals);

// 天色
const SKY = [ {sky:0xbfe0ef, fog:0xcfe3e8, sun:1.6, hemi:.9, lant:.3, petal:0xffb7c5}, {sky:0xf3d9a4, fog:0xf0d8b0, sun:1.3, hemi:.8, lant:.4, petal:0xffc8a0}, {sky:0x1c2340, fog:0x1c2340, sun:.25, hemi:.35, lant:2.2, petal:0xf0f0ff} ];
function applySky(){ const k=SKY[S.slot]; scene.background=new THREE.Color(k.sky); scene.fog.color.setHex(k.fog); sun.intensity=k.sun; hemi.intensity=k.hemi; lanterns.forEach(l=>l.material.emissiveIntensity=k.lant); petals.material.color.setHex(S.day>=13?0xffffff:k.petal); }

// ---------------- 控制 ----------------
const keys={}; let target=null, camAngle=.6;
addEventListener('keydown',e=>{ if (e.target.tagName==='INPUT') return; keys[e.key.toLowerCase()]=true; if(e.key.toLowerCase()==='e' && nearest && !busy) openTalk(nearest); });
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
const ray=new THREE.Raycaster(), mouse=new THREE.Vector2();
let downAt=null;
canvas.addEventListener('pointerdown',e=>downAt=[e.clientX,e.clientY]);
canvas.addEventListener('pointerup',e=>{
  if(!downAt||busy||!$('#title').classList.contains('hidden')) return; if (Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>8) return;
  mouse.set(e.clientX/innerWidth*2-1, -e.clientY/innerHeight*2+1); ray.setFromCamera(mouse,camera);
  const hits=ray.intersectObjects(Object.values(npcs),true);
  if (hits.length){ let o=hits[0].object; while(o.parent && !o.userData.id) o=o.parent; if(o.userData.id){ const id=o.userData.id; if (player.position.distanceTo(o.position)<4) openTalk(id); else { target=o.position.clone(); target.userData=id; } return; } }
  const g=ray.intersectObject(ground); if(g.length) target=g[0].point;
});
let dragX=null; canvas.addEventListener('pointermove',e=>{ if(e.buttons&&downAt&&e.pointerType!=='touch'){ if(dragX!==null) camAngle-=(e.clientX-dragX)*.005; dragX=e.clientX; } else dragX=null; });

// ---------------- UI ----------------
function toast(t,ms=2200){ const el=$('#toast'); el.textContent=t; el.style.opacity=1; clearTimeout(toast.h); toast.h=setTimeout(()=>el.style.opacity=0,ms); }
function effText(eff){ return Object.entries(eff||{}).map(([k,v])=>`${STAT_NAMES[k]||CHARS[k]?.name||k}${v>0?'+':''}${v}`).join('　'); }
function applyEff(eff){ for(const [k,v] of Object.entries(eff||{})){ if(k in STAT_NAMES) S[k]=Math.max(0,Math.min(100,S[k]+v)); else if(k in S.aff) S.aff[k]=Math.max(0,Math.min(100,S.aff[k]+v)); } renderStats(); }
function renderStats(){
  $('#dayName').textContent=`第${CN[S.day]}回`; $('#timeName').textContent=TIMES[S.slot]+'（余'+(3-S.slot)+'时辰）';
  const rows=[['才情',S.talent],['家运',S.fortune],['禅心',S.zen],['黛玉',S.aff.daiyu],['宝钗',S.aff.baochai],['湘云',S.aff.xiangyun]];
  $('#stats').innerHTML=rows.map(([n,v])=>`${n} ${v}<div class="bar"><i style="width:${v}%"></i></div>`).join('');
}
function fade(text){ return new Promise(r=>{ const f=$('#fade'); f.textContent=text||''; f.style.opacity=1; setTimeout(()=>{ r(); setTimeout(()=>f.style.opacity=0,700); },1100); }); }

function showDialog(name,title,text){ $('#dialog').classList.remove('hidden'); $('#dlgName').textContent=name; $('#dlgTitle').textContent=title||''; $('#dlgText').textContent=text; $('#dlgChoices').innerHTML=''; $('#chatForm').classList.add('hidden'); busy=true; }
function choice(label, fn, disabled){ const b=document.createElement('button'); b.innerHTML=label; b.disabled=!!disabled; b.onclick=fn; $('#dlgChoices').appendChild(b); return b; }
function closeDialog(){ $('#dialog').classList.add('hidden'); busy=false; currentChat=null; }

// 消耗时辰
async function spendSlot(){
  S.slot++; autosave();
  if (S.slot>=3){ S.slot=0; S.day++; if (S.day>MAX_DAY){ return finish(); } await fade(`第${CN[S.day]}回`); applySky(); toast(dayHint()); }
  else { applySky(); }
  renderStats(); autosave();
}
function dayHint(){ const ev=EVENTS.find(e=>!S.done[e.id] && e.day<=S.day); return ev? `听说${LOCATIONS.find(l=>l.id===ev.loc).name}那边似有动静……` : '园中一切如常。'; }

// 交谈
let currentChat=null;
function openTalk(id){
  const C=CHARS[id]; if(!C) return; target=null;
  const g=npcs[id]; g.lookAt(player.position.x,0,player.position.z);
  showDialog(C.name,C.title+`　好感 ${S.aff[id]}`, C.greet[(S.day+S.slot)%C.greet.length]);
  C.talks.forEach((t,i)=>{ const key=id+i; const used=S.used[key]; choice(`${used?'✓ ':'◆ '}${t.q}<span class="eff">${used?'（已做过）':'（耗一时辰）'}</span>`, async ()=>{
    S.used[key]=1; applyEff(t.eff); S.log.push(`${C.name}：${t.q}`);
    showDialog(C.name,C.title,t.a+'\n'); $('#dlgText').insertAdjacentHTML('beforeend',`<div class="eff">${effText(t.eff)}</div>`);
    choice('（告辞）', async ()=>{ closeDialog(); await spendSlot(); });
  }, used); });
  choice('💬 随意闲谈（不耗时辰）', ()=>startChat(id));
  choice('（告辞）', closeDialog);
}
function startChat(id){
  const C=CHARS[id]; currentChat={id, history:[]};
  showDialog(C.name, C.title+(aiCfg().key?'　· 大模型对话':'　· 离线对话'), C.greet[0]);
  $('#chatForm').classList.remove('hidden'); $('#chatInput').focus();
  choice('（告辞）', closeDialog);
}
$('#chatForm').onsubmit=async e=>{
  e.preventDefault(); const inp=$('#chatInput'); const msg=inp.value.trim(); if(!msg||!currentChat) return; inp.value='';
  const id=currentChat.id, C=CHARS[id];
  $('#dlgText').textContent=`宝玉：${msg}\n\n${C.name}：……`;
  let reply=null; const cfg=aiCfg();
  if (cfg.key){ try{ reply=await llm(C, currentChat.history, msg, cfg); }catch(err){ console.warn(err); toast('大模型连接失败，已切换离线对话'); } }
  if(!reply) reply=offlineReply(C,msg);
  currentChat.history.push({role:'user',content:msg},{role:'assistant',content:reply});
  $('#dlgText').textContent=`宝玉：${msg}\n\n${C.name}：${reply}`;
  const k='chat'+id+S.day; if(!S.used[k]){ S.used[k]=1; applyEff({[id]:2}); toast(`${C.name}好感 +2`); }
};
function offlineReply(C,msg){ for(const [k,v] of Object.entries(C.kw)) if(msg.includes(k)) return v; return C.fallback[Math.floor(Math.random()*C.fallback.length)]; }
function aiCfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY))||{}; }catch{ return {}; } }
async function llm(C,history,msg,cfg){
  const ctrl=new AbortController(); setTimeout(()=>ctrl.abort(),20000);
  const r=await fetch((cfg.base||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions',{ method:'POST', signal:ctrl.signal,
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},
    body:JSON.stringify({ model:cfg.model||'gpt-4o-mini', max_tokens:200, temperature:.9,
      messages:[{role:'system',content:C.persona+` 现在是第${S.day}回，你对宝玉的好感度是${S.aff[Object.keys(CHARS).find(k=>CHARS[k]===C)]}/100。只以角色身份说话，不要跳出角色。`},...history.slice(-8),{role:'user',content:'宝玉说：'+msg}] }) });
  if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json(); return j.choices?.[0]?.message?.content?.trim();
}

// 剧情事件
function runEvent(ev){
  busy=true; target=null; let i=0;
  const step=()=>{
    showDialog(ev.title,'',ev.text[i]);
    if (i<ev.text.length-1){ choice('▶ 继续', ()=>{ i++; step(); }); return; }
    if (ev.quiz) return runQuiz(ev);
    ev.choices.forEach(c=>{ const lack=c.need && Object.entries(c.need).some(([k,v])=>(S.aff[k]??S[k])<v);
      choice(c.t+(lack?'<span class="eff">（需与刘姥姥结下善缘）</span>':''), ()=>{
        S.done[ev.id]=1; applyEff(c.eff); if(c.poem && !S.poems.includes(c.poem)) S.poems.push(c.poem); S.log.push(ev.title+'：'+c.t);
        showDialog(ev.title,'',c.r+'\n'); $('#dlgText').insertAdjacentHTML('beforeend',`<div class="eff">${effText(c.eff)}${c.poem?'　📜 收录《'+POEMS[c.poem].title+'》':''}</div>`);
        choice('（合卷）', async ()=>{ closeDialog(); await spendSlot(); });
      }, lack); });
  };
  step();
}
function runQuiz(ev){
  const qs=[...QUIZ].sort(()=>Math.random()-.5).slice(0,5); let n=0, score=0;
  const ask=()=>{
    if(n>=qs.length){ const eff={ talent:score*3, tanchun:5, daiyu:score>=4?8:2, baochai:score>=3?6:2 };
      S.done[ev.id]=1; applyEff(eff); ['haitang','liuxu'].forEach(p=>{ if(!S.poems.includes(p)) S.poems.push(p); });
      const verdict= score>=5?'李纨评道："怡红公子此番压尽群芳！"': score>=3?'李纨评道："论风流别致，自是潇湘妃子；论含蓄浑厚，终让蘅芜君。怡红公子亦可。"':'李纨评道："怡红公子压尾，你服不服？"宝玉笑道："我的那首原不好。"';
      showDialog('海棠诗社','',`答对 ${score}/5。\n${verdict}\n`); $('#dlgText').insertAdjacentHTML('beforeend',`<div class="eff">${effText(eff)}　📜 收录《咏白海棠》《临江仙·柳絮》</div>`);
      choice('（散社）', async ()=>{ closeDialog(); await spendSlot(); }); return; }
    const q=qs[n]; showDialog('海棠诗社',`第 ${n+1}/5 题　已得 ${score}`,q.q);
    q.o.map((o,i)=>[o,i]).sort(()=>Math.random()-.5).forEach(([o,i])=>choice(o,()=>{ const ok=i===q.a; if(ok) score++; toast(ok?'✔ 妙！':'✘ 正解：'+q.o[q.a]); n++; ask(); }));
  };
  ask();
}

// 结局
function decideEnding(){
  const a=S.aff;
  if (a.daiyu>=65 && S.fortune>=30 && a.daiyu>=a.baochai) return 'muShi';
  if (a.tanchun>=45 && S.fortune>=65) return 'zhongXing';
  if (a.baochai>=60 && S.fortune>=30) return 'jinYu';
  if (a.xiangyun>=55 && S.fortune>=25) return 'xiangYun';
  if (S.zen>=30) return 'chuJia';
  return 'baiMang';
}
async function finish(){
  const id=decideEnding(); S.ended=id; S.day=MAX_DAY; const seen=JSON.parse(localStorage.getItem('honglou_endings')||'[]'); if(!seen.includes(id)){ seen.push(id); localStorage.setItem('honglou_endings',JSON.stringify(seen)); }
  localStorage.removeItem(SAVE_KEY); await fade('终　卷');
  const E=ENDINGS[id];
  openModal(`<div class="ending"><h2>${E.title}</h2><p>${E.text}</p><hr><p class="tiny">才情 ${S.talent}　家运 ${S.fortune}　禅心 ${S.zen}　黛玉 ${S.aff.daiyu}　宝钗 ${S.aff.baochai}　湘云 ${S.aff.xiangyun}　探春 ${S.aff.tanchun}<br>已解锁结局 ${seen.length}/${Object.keys(ENDINGS).length}：${seen.map(s=>ENDINGS[s].title.replace('结局 · ','')).join('、')}</p><div style="text-align:center"><button class="btn" onclick="location.reload()">重读一回</button></div></div>`, true);
}

// 弹窗
function openModal(html, noClose){ $('#modalBody').innerHTML=html+(noClose?'':'<div style="text-align:center;margin-top:14px"><button class="btn" id="mClose">合上</button></div>'); $('#modal').classList.remove('hidden'); busy=true; const c=$('#mClose'); if(c) c.onclick=closeModal; }
function closeModal(){ $('#modal').classList.add('hidden'); busy=!$('#dialog').classList.contains('hidden'); }
const PAGES={
  about:()=>`<h2>卷首 · 玩法</h2><p>你是<b>贾宝玉</b>，在大观园中度过十五回光阴，每回分<b>晨、午、暮</b>三个时辰。</p>
  <div class="card">🚶 <b>行走</b>：WASD/方向键，或点击地面；拖动鼠标或 Q/R 旋转视角。<br>💬 <b>交谈</b>：走近人物按 E，或点击人物。每项"心事"选项消耗一个时辰；"随意闲谈"不耗时辰，可自由输入文字。<br>📖 <b>剧情</b>：元妃省亲、黛玉葬花、海棠诗社、刘姥姥进园、湘云醉眠、探春理家、抄检大观园、中秋联诗、查抄宁府——到对应回目前往对应地点即可触发。<br>🌙 <b>歇息</b>：在任意处可直接跳过当前时辰。<br>💾 <b>存档</b>：每消耗一个时辰自动存档，亦可手动存/读。</div>
  <div class="card">🎭 <b>结局</b>：木石前盟、金玉良缘、兰桂齐芳、因麒麟伏白首双星、悬崖撒手、白茫茫大地真干净——由好感、才情、家运、禅心共同决定。</div>
  <div class="card">🤖 <b>大模型对话（可选）</b>：在"设置"中填入兼容 OpenAI 接口的地址与密钥，人物即由大模型扮演；未设置时使用内置离线台词，游戏完全可玩。</div>`,
  journal:(tab='aff')=>{
    const tabs=`<div class="tabs">${[['aff','人物'],['verdict','金陵判词'],['poems','诗集'],['log','回目']].map(([k,n])=>`<button class="${k===tab?'on':''}" data-tab="${k}">${n}</button>`).join('')}</div>`;
    let body='';
    if(tab==='aff') body=Object.entries(CHARS).map(([k,C])=>`<div class="card"><b>${C.name}</b>（${C.title}）　好感 ${S.aff[k]}<div class="bar" style="height:5px;background:#e3d3b0"><i style="display:block;height:5px;width:${S.aff[k]}%;background:#a3211b"></i></div><small>住处：${LOCATIONS.find(l=>l.id===C.loc).name}</small></div>`).join('')+`<div class="card">才情 ${S.talent}　家运 ${S.fortune}　禅心 ${S.zen}</div>`;
    if(tab==='verdict') body='<p class="tiny">好感达 50 可揭开太虚幻境薄命司中的判词。</p>'+Object.entries(CHARS).map(([k,C])=>S.aff[k]>=50?`<div class="card"><b>${C.name}</b><br>${C.verdict}</div>`:`<div class="card locked">${C.name}　—— 册页尚封（好感 ${S.aff[k]}/50）</div>`).join('');
    if(tab==='poems') body=S.poems.map(p=>`<div class="card"><b>《${POEMS[p].title}》</b> ${POEMS[p].author}<pre style="font-family:inherit;white-space:pre-wrap">${POEMS[p].text}</pre></div>`).join('')+`<p class="tiny">已收录 ${S.poems.length}/${Object.keys(POEMS).length}</p>`;
    if(tab==='log') body=(S.log.length?S.log.map(l=>`<div class="card">${l}</div>`).join(''):'<p>尚无记载。</p>')+'<h3>待发生</h3>'+EVENTS.filter(e=>!S.done[e.id]).map(e=>`<div class="card locked">${e.title.split(' · ')[1]}　—— 第${CN[e.day]}回后·${LOCATIONS.find(l=>l.id===e.loc).name}</div>`).join('');
    return `<h2>簿册</h2>${tabs}${body}`;
  },
  save:()=>{ const has=localStorage.getItem(SAVE_KEY+'_manual'); return `<h2>存档</h2><p>自动存档：每过一个时辰自动保存（浏览器本地）。</p><div class="menu"><button id="doSave">手动存档</button><button id="doLoad" ${has?'':'disabled'}>读取手动存档</button><button id="doExport">导出存档（复制文本）</button><button id="doReset">重新开卷（清除进度）</button></div>`; },
  settings:()=>{ const c=aiCfg(); return `<h2>设置 · 大模型对话</h2><p class="tiny">可选。填写任意兼容 OpenAI Chat Completions 的服务（如 OpenAI、DeepSeek、xAI、月之暗面等）。密钥仅保存在你的浏览器本地，直接由浏览器发往该服务。留空即使用离线台词。</p>
  <label>API 地址（Base URL）</label><input class="f" id="cfgBase" value="${c.base||''}" placeholder="https://api.deepseek.com/v1">
  <label>模型名</label><input class="f" id="cfgModel" value="${c.model||''}" placeholder="deepseek-chat">
  <label>API Key</label><input class="f" id="cfgKey" type="password" value="${c.key||''}" placeholder="sk-...">
  <div style="margin-top:12px"><button class="btn" id="cfgSave">保存</button> <button class="btn" id="cfgClear">清除</button></div>`; },
};
function openPage(name,arg){ openModal(PAGES[name](arg)); bindPage(name); }
function bindPage(name){
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>openPage('journal',b.dataset.tab));
  if(name==='save'){ $('#doSave').onclick=()=>{ localStorage.setItem(SAVE_KEY+'_manual',JSON.stringify(snap())); toast('已存档'); closeModal(); };
    $('#doLoad').onclick=()=>{ load(JSON.parse(localStorage.getItem(SAVE_KEY+'_manual'))); toast('已读档'); closeModal(); };
    $('#doExport').onclick=()=>{ navigator.clipboard?.writeText(btoa(unescape(encodeURIComponent(JSON.stringify(snap()))))); toast('存档文本已复制'); };
    $('#doReset').onclick=()=>{ if(confirm('确定清除进度，重新开卷？')){ localStorage.removeItem(SAVE_KEY); location.reload(); } }; }
  if(name==='settings'){ $('#cfgSave').onclick=()=>{ localStorage.setItem(CFG_KEY,JSON.stringify({base:$('#cfgBase').value.trim(),model:$('#cfgModel').value.trim(),key:$('#cfgKey').value.trim()})); toast('已保存'); closeModal(); };
    $('#cfgClear').onclick=()=>{ localStorage.removeItem(CFG_KEY); toast('已清除，使用离线对话'); closeModal(); }; }
}
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openPage(b.dataset.open));
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal' && $('#mClose')) closeModal(); });
$('#restBtn').onclick=async()=>{ if(busy) return; busy=true; await spendSlot(); busy=false; toast('歇了一个时辰。'); };

// 存档
function snap(){ S.pos=[player.position.x,player.position.z]; return S; }
function autosave(){ if(!S.ended) localStorage.setItem(SAVE_KEY,JSON.stringify(snap())); }
function load(d){ S=Object.assign(freshState(),d); S.aff=Object.assign(freshState().aff,d.aff||{}); player.position.set(S.pos[0],0,S.pos[1]); applySky(); renderStats(); }

// 开始
function start(){ $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden'); busy=false; applySky(); renderStats(); setTimeout(()=>toast('来到大观园。去沁芳亭看看元妃省亲罢。',3500),400); }
$('#newGame').onclick=()=>{ S=freshState(); player.position.set(S.pos[0],0,S.pos[1]); start(); };
$('#continueGame').onclick=()=>{ const d=localStorage.getItem(SAVE_KEY); if(!d) return toast('尚无存档'); load(JSON.parse(d)); start(); };
if(!localStorage.getItem(SAVE_KEY)) $('#continueGame').disabled=true;
busy=true; player.position.set(S.pos[0],0,S.pos[1]); applySky(); renderStats();

// ---------------- 主循环 ----------------
let nearest=null, curLoc=null; const clock=new THREE.Clock();
function resize(){ renderer.setSize(innerWidth,innerHeight,false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize',resize); resize();
const camOff=new THREE.Vector3();
function loop(){
  const dt=Math.min(clock.getDelta(),.05), t=clock.elapsedTime;
  const inTitle=!$('#title').classList.contains('hidden');
  if(keys['q']) camAngle+=dt*1.5; if(keys['r']) camAngle-=dt*1.5;
  // 移动
  let mv=new THREE.Vector3();
  if(!busy && !inTitle){
    const f=(keys['w']||keys['arrowup']?1:0)-(keys['s']||keys['arrowdown']?1:0), s=(keys['d']||keys['arrowright']?1:0)-(keys['a']||keys['arrowleft']?1:0);
    if(f||s){ target=null; const fw=new THREE.Vector3(-Math.sin(camAngle),0,-Math.cos(camAngle)), rt=new THREE.Vector3(-fw.z,0,fw.x); mv.addScaledVector(fw,f).addScaledVector(rt,s); }
    else if(target){ mv.subVectors(target,player.position); mv.y=0; const d=mv.length(); const stop=target.userData?3:.3; if(d<stop){ const id=target.userData; target=null; mv.set(0,0,0); if(id) openTalk(id); } }
  }
  if(mv.lengthSq()>0){ mv.normalize().multiplyScalar(8*dt); const np=player.position.clone().add(mv); if(Math.abs(np.x)<46&&Math.abs(np.z)<46) player.position.copy(np); player.rotation.y=Math.atan2(mv.x,mv.z); player.position.y=Math.abs(Math.sin(t*12))*.12; } else player.position.y=0;
  // NPC
  nearest=null; let nd=3.8;
  for(const [id,g] of Object.entries(npcs)){ g.position.y=Math.sin(t*2+g.userData.phase)*.05; const d=g.position.distanceTo(player.position); if(d<nd){nd=d;nearest=id;} }
  const tb=$('#talkBtn'); if(nearest&&!busy&&!inTitle){ tb.textContent=`与 ${CHARS[nearest].name} 交谈 (E)`; tb.classList.remove('hidden'); tb.onclick=()=>openTalk(nearest); } else tb.classList.add('hidden');
  // 地点 & 事件
  let loc=null; for(const L of LOCATIONS){ if(Math.hypot(L.pos[0]-player.position.x,L.pos[1]-player.position.z)<(L.kind==='pavilion'?7:9)) loc=L; }
  if(loc!==curLoc){ curLoc=loc; const el=$('#locName'); if(loc){ el.textContent=loc.name; el.style.opacity=1; if(!inTitle) toast(loc.desc,3000); setTimeout(()=>{ if(curLoc===loc) el.style.opacity=0; },2500); } }
  if(loc && !busy && !inTitle && !S.ended){ const ev=EVENTS.find(e=>!S.done[e.id]&&e.loc===loc.id&&S.day>=e.day); if(ev) runEvent(ev); }
  // 特效
  const p=petalGeo.attributes.position; for(let i=0;i<PN;i++){ let y=p.getY(i)-dt*(1+(i%5)*.3); if(y<0)y=25; p.setY(i,y); p.setX(i,p.getX(i)+Math.sin(t+i)*dt*.6); } p.needsUpdate=true;
  water.material.color.setHSL(.54,.4,.42+Math.sin(t)*.03);
  // 相机
  if(inTitle){ camAngle+=dt*.08; camOff.set(Math.sin(camAngle)*55,30,Math.cos(camAngle)*55); camera.position.copy(camOff); camera.lookAt(0,0,0); }
  else { camOff.set(Math.sin(camAngle)*16,13,Math.cos(camAngle)*16).add(player.position); camera.position.lerp(camOff,.1); camera.lookAt(player.position.x,1.5,player.position.z); }
  sun.position.set(player.position.x+30,50,player.position.z+20); sun.target.position.copy(player.position); sun.target.updateMatrixWorld();
  renderer.render(scene,camera); requestAnimationFrame(loop);
}
loop();
window.__game={S, get state(){return S;}, openTalk, runEvent, finish, EVENTS};
