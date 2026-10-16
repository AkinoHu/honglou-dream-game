import * as THREE from 'three';
import * as W from './world.js';
import { LOCATIONS, CHARS, PLAYER_STYLE, INTENTS, EVENTS, QUIZ, POEMS, ENDINGS, ENDING_HINTS, PROLOGUE, MAX_DAY, TIMES } from './data.js';
import { initAudio, setMood, sfx, getVol, setVol } from './audio.js';

const $=s=>document.querySelector(s);
const CN=['零','一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六'];
const STAT_NAMES={talent:'才情',fortune:'家运',zen:'禅心'};
const SAVE_KEY='honglou_save_v2', CFG_KEY='honglou_ai_cfg', TUT_KEY='honglou_tut';
const LOC=Object.fromEntries(LOCATIONS.map(l=>[l.id,l]));
const isTouch=matchMedia('(pointer:coarse)').matches;
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>r()));

// ================= 状态 =================
function freshState(){ const aff={}; for(const k in CHARS) aff[k]=20; aff.daiyu=30; aff.baochai=25; aff.xiren=35; aff.qingwen=30; aff.liulaolao=0;
  return { day:1, slot:0, aff, talent:10, fortune:50, zen:5, done:{}, used:{}, poems:['haoliao'], pos:null, ended:null, log:[] }; }
let S=freshState();
let mode='loading'; // loading | title | prologue | play | dialog | cine | modal | ending
const isPlay=()=>mode==='play';

// ================= 加载 =================
const setLoad=(p,t)=>{ $('#loadFill').style.width=p+'%'; $('#loadText').textContent=t; };
let portraits={}, player, npcs={};
async function boot(){
  setLoad(10,'铺纸研墨……'); await nextFrame(); await nextFrame();
  W.buildWorld(LOCATIONS); W.registerColliders(LOCATIONS);
  setLoad(40,'起造亭台楼阁……'); await nextFrame();
  await W.bakeLighting(f=>setLoad(40+Math.round(f*8),'晕染光影……')); setLoad(48,'安置人物……'); await nextFrame();
  player=W.makeCharacter(PLAYER_STYLE); W.scene.add(player);
  for(const [id,C] of Object.entries(CHARS)){ const g=W.makeCharacter(C.style); W.scene.add(g); npcs[id]={g,id,path:[],wait:R(1,4),speed:0,place:null}; }
  setLoad(65,'描画众钗容貌……'); await nextFrame();
  try{ await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))]); }catch{}
  W.signs.forEach(s=>s.userData.redraw?.());
  portraits=W.renderPortraits({...Object.fromEntries(Object.entries(CHARS).map(([k,c])=>[k,c.style])), baoyu:PLAYER_STYLE, ...EXTRA_PORTRAITS});
  setLoad(85,'点起灯笼……'); await nextFrame();
  W.applySky(0,1); W.resize(); placeNPCs(true); 
  if(!S.pos) player.position.copy(localToWorld('yihong',1.5,6.2)); W.render(); setLoad(100,'入　梦'); await new Promise(r=>setTimeout(r,350));
  $('#loading').style.transition='opacity 1s'; $('#loading').style.opacity=0; setTimeout(()=>$('#loading').classList.add('hidden'),1000);
  $('#title').classList.remove('hidden'); mode='title';
  if(!localStorage.getItem(SAVE_KEY)) $('#continueGame').disabled=true;
}
const R=(a,b)=>a+Math.random()*(b-a);
const EXTRA_PORTRAITS={ yuanchun:{robe:0xe8b830,skirt:0xc8102e,trim:0x9e1f19,sash:0xc8102e,style:'high',face:{skin:'#fbe6d4'},cape:0xd4a020}, liwan:{robe:0x8a9aa8,skirt:0xdcdcd4,trim:0x4a5a6a,sash:0xe0e0e0,style:'lowbun',face:{skin:'#f6dcc4'}}, jinghuan:{robe:0xf0e8ff,skirt:0xd8c8f0,trim:0x9a7ad8,sash:0xffd8f0,style:'high',face:{skin:'#fff0f0',big:true},cape:0xe8d8ff} };
const EXTRA_TITLES={yuanchun:'贤德妃',liwan:'稻香老农',jinghuan:'太虚幻境'};

// ================= 寻路（院内→院门→环园路→目标） =================
const RING=13.6;
function localToWorld(locId,lx,lz){ const v=new THREE.Vector3(lx,0,lz); W.locGroups[locId].localToWorld(v); return v; }
function gateOut(locId){ return locId==='qinfang'? null : localToWorld(locId,0,11.5); }
function ringAngle(v){ return Math.atan2(v.z,v.x); }
function ringPoint(a){ return new THREE.Vector3(Math.cos(a)*RING,0,Math.sin(a)*RING); }
function arc(a0,a1){ let d=a1-a0; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; const pts=[]; const n=Math.ceil(Math.abs(d)/.35); for(let i=1;i<=n;i++) pts.push(ringPoint(a0+d*i/n)); return pts; }
// 所在区域：某院内 / 园中
function regionOf(p){ for(const L of LOCATIONS){ if(L.kind==='pavilion') continue; const v=p.clone(); W.locGroups[L.id].worldToLocal(v); if(Math.abs(v.x)<10&&v.z>-8&&v.z<8.4) return L.id; } if(Math.hypot(p.x,p.z)<10.6) return 'qinfang'; return null; }
function planPath(from,to){ // from/to: Vector3 世界坐标
  const pts=[]; const rf=regionOf(from), rt=regionOf(to);
  if(rf===rt && rf) return [to.clone()];
  let a;
  if(rf && rf!=='qinfang'){ pts.push(localToWorld(rf,0,6.5),localToWorld(rf,0,9.4),gateOut(rf)); a=ringAngle(gateOut(rf)); pts.push(ringPoint(a)); }
  else if(rf==='qinfang'){ const s=from.z>=0?1:-1; pts.push(new THREE.Vector3(0,0,s*3),new THREE.Vector3(0,0,s*11.2)); a=s>0?Math.PI/2:-Math.PI/2; pts.push(ringPoint(a)); }
  else { a=ringAngle(from); if(Math.hypot(from.x,from.z)<RING+2 || true) pts.push(ringPoint(a)); }
  let b;
  if(rt && rt!=='qinfang'){ b=ringAngle(gateOut(rt)); pts.push(...arc(a,b), gateOut(rt), localToWorld(rt,0,9.4), localToWorld(rt,0,6.5)); }
  else if(rt==='qinfang'){ const s=to.z>=0?1:-1; b=s>0?Math.PI/2:-Math.PI/2; pts.push(...arc(a,b), new THREE.Vector3(0,0,s*11.2), new THREE.Vector3(0,0,s*3)); }
  else { b=ringAngle(to); pts.push(...arc(a,b)); }
  pts.push(to.clone()); return pts;
}

// ================= NPC 日程 =================
function visible(id){ const C=CHARS[id]; if(C.until && S.done[C.until]) return false; if(id==='liulaolao' && S.day<6) return false; return true; }
function placeFor(id){ const C=CHARS[id]; const h=(S.day*7+id.length*3)%5; if(S.slot===1 && C.roam.length && h<3) return C.roam[(S.day+id.length)%C.roam.length]; if(S.slot===2 && C.roam.length && h===4) return C.roam[0]; return C.loc; }
function spotsAt(locId,id){ const k=Object.keys(CHARS).indexOf(id);
  if(locId==='qinfang'){ const s=k%2?1:-1; return [new THREE.Vector3(1.5*s,0,s*12.6+(k%3)),new THREE.Vector3(-1.8*s,0,s*13.2),new THREE.Vector3(2.8*s,0,s*12)]; }
  const own=CHARS[id].loc===locId; if(own) return [localToWorld(locId,-2.6+(k%2)*5.2,5.6),localToWorld(locId,(k%2?2:-2)*1.4,6.6),localToWorld(locId,(k%2?1:-1)*3.4,4.9)];
  return [localToWorld(locId,(k%2?2.4:-2.4),12.4),localToWorld(locId,(k%2?3.6:-3.6),13.4)]; }
function placeNPCs(instant){
  for(const [id,n] of Object.entries(npcs)){ const vis=visible(id); n.g.visible=vis; if(!vis) continue;
    const place=placeFor(id); if(place===n.place && !instant) continue; n.place=place; n.spots=spotsAt(place,id);
    if(instant){ n.g.position.copy(n.spots[0]); n.path=[]; } else n.path=planPath(n.g.position,n.spots[0]); }
}
function updateNPCs(dt,t){
  for(const n of Object.values(npcs)){ if(!n.g.visible) continue; let sp=0;
    if(n.talking){ W.animateCharacter(n.g,dt,t,0); continue; }
    if(n.path.length){ const tg=n.path[0]; const d=new THREE.Vector3(tg.x-n.g.position.x,0,tg.z-n.g.position.z); const L=d.length();
      if(L<.25) n.path.shift(); else { sp=1.7; d.multiplyScalar(Math.min(L,sp*dt)/L); n.g.position.add(d); turnTo(n.g,Math.atan2(d.x,d.z),dt*6); } }
    else { n.wait-=dt; if(n.wait<0){ n.wait=R(4,10); const s=n.spots[Math.floor(Math.random()*n.spots.length)]; n.path=[s.clone().add(new THREE.Vector3(R(-.4,.4),0,R(-.4,.4)))]; } }
    n.g.position.y=W.groundHeight(n.g.position.x,n.g.position.z); n.speed+=(sp-n.speed)*Math.min(1,dt*8); W.animateCharacter(n.g,dt,t,n.speed); }
}
function turnTo(o,yaw,k){ let d=yaw-o.rotation.y; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; o.rotation.y+=d*Math.min(1,k); }

// ================= 镜头与操控 =================
const cam={ yaw:-0.6, pitch:.42, dist:15, tDist:15, focus:new THREE.Vector3(), cine:null };
const keys={}; let playerPath=[], marker;
addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT') return; const k=e.key.toLowerCase(); keys[k]=true;
  if(isPlay()){ if(k==='e'&&nearest) openTalk(nearest); if(k==='m') openPage('map'); if(k==='j') openPage('journal'); }
  else if(mode==='dialog' && (k===' '||k==='enter')){ const b=$('#dlgChoices button.next'); if(b){ e.preventDefault(); b.click(); } }
  if(k==='escape' && mode==='modal') closeModal(); });
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
addEventListener('blur',()=>{ for(const k in keys) keys[k]=false; });
const ray=new THREE.Raycaster(), mouse=new THREE.Vector2(); const pointers=new Map(); let pinch0=0, dragMoved=false, downPos=null;
W.canvas.addEventListener('pointerdown',e=>{ pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); downPos={x:e.clientX,y:e.clientY}; dragMoved=false; if(pointers.size===2){ const [a,b]=[...pointers.values()]; pinch0=Math.hypot(a.x-b.x,a.y-b.y); } W.canvas.setPointerCapture(e.pointerId); });
W.canvas.addEventListener('pointermove',e=>{ const p=pointers.get(e.pointerId); if(!p) return; const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
  if(Math.hypot(e.clientX-downPos.x,e.clientY-downPos.y)>6) dragMoved=true;
  if(pointers.size===2){ const [a,b]=[...pointers.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); cam.tDist=THREE.MathUtils.clamp(cam.tDist*pinch0/d,7,30); pinch0=d; return; }
  if(dragMoved && (isPlay()||mode==='dialog')){ cam.yaw-=dx*.006; cam.pitch=THREE.MathUtils.clamp(cam.pitch+dy*.004,.12,1.2); } });
W.canvas.addEventListener('pointerup',e=>{ pointers.delete(e.pointerId); if(dragMoved||!isPlay()) return; tapAt(e.clientX,e.clientY); });
W.canvas.addEventListener('pointercancel',e=>pointers.delete(e.pointerId));
W.canvas.addEventListener('wheel',e=>{ cam.tDist=THREE.MathUtils.clamp(cam.tDist+e.deltaY*.012,7,30); },{passive:true});
function tapAt(x,y){
  mouse.set(x/innerWidth*2-1,-y/innerHeight*2+1); ray.setFromCamera(mouse,W.camera);
  const vis=Object.values(npcs).filter(n=>n.g.visible).map(n=>n.g); const hits=ray.intersectObjects(vis,true);
  if(hits.length){ let o=hits[0].object; const n=Object.values(npcs).find(n=>{ let p=o; while(p){ if(p===n.g) return true; p=p.parent; } return false; });
    if(n){ if(player.position.distanceTo(n.g.position)<3.5) openTalk(n.id); else { walkTo(n.g.position.clone()); pendingTalk=n.id; } return; } }
  const g=ray.intersectObject(W.getGround()); if(g.length){ walkTo(g[0].point); }
}
let pendingTalk=null;
function walkTo(p){ pendingTalk=null; p.y=0; playerPath=planPath(player.position.clone(),p); showMarker(p); tut('moved'); }
function showMarker(p){ if(!marker){ marker=new THREE.Mesh(new THREE.RingGeometry(.35,.5,32),new THREE.MeshBasicMaterial({color:0xf0c060,transparent:true,depthWrite:false})); marker.rotation.x=-Math.PI/2; W.scene.add(marker); } marker.position.set(p.x,W.groundHeight(p.x,p.z)+.08,p.z); marker.material.opacity=1; marker.scale.setScalar(1); }
// 触屏摇杆
const joy={x:0,y:0,id:null};
if(isTouch){ $('#joy').classList.remove('hidden'); $('#hint').classList.add('hidden');
  const el=$('#joy'), kn=$('#joyKnob'); const upd=e=>{ const r=el.getBoundingClientRect(); let x=e.clientX-r.left-r.width/2, y=e.clientY-r.top-r.height/2; const m=Math.hypot(x,y), max=r.width/2-20; if(m>max){x*=max/m;y*=max/m;} joy.x=x/max; joy.y=y/max; kn.style.transform=`translate(${x}px,${y}px)`; };
  el.addEventListener('pointerdown',e=>{ joy.id=e.pointerId; el.setPointerCapture(e.pointerId); upd(e); playerPath=[]; });
  el.addEventListener('pointermove',e=>{ if(e.pointerId===joy.id) upd(e); });
  const end=()=>{ joy.id=null; joy.x=joy.y=0; kn.style.transform=''; }; el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end); }

// ================= UI 小件 =================
function toast(t,ms=2600){ const el=$('#toast'); el.textContent=t; el.style.opacity=1; clearTimeout(toast.h); toast.h=setTimeout(()=>el.style.opacity=0,ms); }
const nameOf=k=>STAT_NAMES[k]||CHARS[k]?.name?.replace(/^(林|薛|史|贾|王|花)/,'')||k;
function effHTML(eff){ const s=Object.entries(eff||{}).map(([k,v])=>`${nameOf(k)}${v>0?'＋':'－'}${Math.abs(v)}`).join('　'); return s?`<div class="eff">${s}</div>`:''; }
function applyEff(eff){ let good=0; for(const [k,v] of Object.entries(eff||{})){ good+=v; if(k in STAT_NAMES) S[k]=clamp(S[k]+v); else if(k in S.aff) S.aff[k]=clamp(S.aff[k]+v); } renderStats(); sfx(good>=0?'good':'bad'); }
const clamp=v=>Math.max(0,Math.min(100,v));
function renderStats(){
  $('#dayName').textContent=`第${CN[Math.min(S.day,MAX_DAY)]}回`; $('#timeName').textContent=`${TIMES[S.slot]}时 · 余${3-S.slot}时辰 · 共${MAX_DAY}回`; $('#clockSeal').textContent=TIMES[S.slot];
  const bar=(n,v,c='')=>`<div class="row"><span>${n}</span><span>${v}</span></div><div class="bar ${c}"><i style="width:${v}%"></i></div>`;
  $('#stats').innerHTML=bar('才情',S.talent)+bar('家运',S.fortune,'jade')+bar('禅心',S.zen,'zen')+'<h4>情　缘</h4>'+[['黛玉','daiyu'],['宝钗','baochai'],['湘云','xiangyun'],['探春','tanchun']].map(([n,k])=>bar(n,S.aff[k])).join('');
  renderObjective();
}
function pendingEvents(){ return EVENTS.filter(e=>!S.done[e.id] && S.day>=e.day && (!e.needChar||visible(e.needChar))); }
function renderObjective(){ const ev=pendingEvents()[0]; const nx=EVENTS.filter(e=>!S.done[e.id]&&e.day>S.day).sort((a,b)=>a.day-b.day)[0];
  $('#objective').innerHTML= ev? `<b>◆ ${ev.chap}</b><br>去${LOC[ev.loc].name}看看` : nx? `<b>◇ 闲游园中</b><br>拜访众人、增进情缘<br><small>第${CN[nx.day]}回将有大事</small>` : `<b>◇ 终卷将至</b><br>第${CN[MAX_DAY]}回暮时合卷`; }
function fade(text,hold=900){ if(window.__fast) return Promise.resolve(); return new Promise(r=>{ const f=$('#fade'); f.textContent=text||''; f.classList.add('on'); setTimeout(()=>{ r(); setTimeout(()=>f.classList.remove('on'),250); },900+hold); }); }

// ================= 对话框 =================
let typing=null;
function portraitFor(speaker){ if(!speaker) return null; if(speaker==='你'||speaker==='宝玉') return 'baoyu'; const ex={元春:'yuanchun',李纨:'liwan',警幻仙姑:'jinghuan'}[speaker]; if(ex) return ex; return Object.keys(CHARS).find(k=>CHARS[k].name.endsWith(speaker)||CHARS[k].name===speaker||speaker===CHARS[k].name.slice(1)); }
function setSpeaker(name,title,pid,sealText){
  $('#dlgName').textContent=name||''; $('#dlgTitle').textContent=title||'';
  const p=$('#portrait'); if(pid&&portraits[pid]){ p.classList.remove('none'); $('#portraitImg').src=portraits[pid]; $('#portraitSeal').textContent=(pid==='baoyu'?'宝玉':CHARS[pid]?CHARS[pid].name.slice(-2):name.slice(-2)); }
  else if(sealText){ p.classList.remove('none'); $('#portraitImg').src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 188"><rect width="150" height="188" fill="#efe2c4"/><text x="75" y="120" font-size="80" text-anchor="middle" fill="#9e1f19" font-family="serif">${sealText}</text></svg>`); $('#portraitSeal').textContent=sealText; }
  else p.classList.add('none');
}
function showDialog(){ $('#dialog').classList.remove('hidden'); $('#chatForm').classList.add('hidden'); $('#dlgChoices').innerHTML=''; if(mode!=='cine') mode='dialog'; }
function typeText(html,plainLen){ const el=$('#dlgText'); clearInterval(typing); el.innerHTML=html; const full=el.textContent; if(full.length<4||window.__fast){ return; }
  // 逐字显现：用 clip 方式逐渐显示文本节点
  const walker=[]; const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n; while((n=tw.nextNode())) walker.push([n,n.textContent]); walker.forEach(([n])=>n.textContent='');
  let i=0, idx=0; typing=setInterval(()=>{ for(let k=0;k<2;k++){ if(idx>=walker.length){ clearInterval(typing); typing=null; return; } const [node,txt]=walker[idx]; node.textContent=txt.slice(0,++i); if(i>=txt.length){ idx++; i=0; } } },22);
  el.onclick=()=>{ if(typing){ clearInterval(typing); typing=null; walker.forEach(([n,t])=>n.textContent=t); } };
}
function finishTyping(){ if(typing) $('#dlgText').click(); }
function choice(label,fn,{disabled=false,cls=''}={}){ const b=document.createElement('button'); b.innerHTML=label; b.disabled=!!disabled; if(cls) b.className=cls; b.onclick=()=>{ if(typing){ finishTyping(); if(cls==='next') return; } sfx('click'); fn(); }; $('#dlgChoices').appendChild(b); return b; }
function closeDialog(){ $('#dialog').classList.add('hidden'); clearInterval(typing); typing=null; for(const n of Object.values(npcs)) n.talking=false; cam.cine=null; endCine(); mode='play'; currentChat=null; }
function parseLine(line){ const m=line.match(/^([^｜]{1,6})｜(.*)$/s); return m?{sp:m[1],tx:m[2]}:{sp:null,tx:line}; }
// 播放一组台词，结束后回调
function playLines(lines,{defName,defTitle,defPid,seal}={},done){
  let i=0; const step=()=>{ const {sp,tx}=parseLine(lines[i]); showDialog();
    if(sp){ const pid=portraitFor(sp); setSpeaker(sp==='你'?'贾宝玉':(CHARS[pid]?CHARS[pid].name:sp), CHARS[pid]?CHARS[pid].title:(EXTRA_TITLES[pid]||''), pid, pid?null:sp.slice(0,1)); typeText(`<span>${esc(tx)}</span>`); }
    else { setSpeaker(defName||'',defTitle||'',defPid,seal); typeText(`<span class="narr">${esc(tx)}</span>`); }
    if(i<lines.length-1) choice('▸ 继续',()=>{ i++; step(); },{cls:'next'}); else done(); };
  step();
}
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

// ================= 交谈 =================
let nearest=null, currentChat=null; const occRay=new THREE.Raycaster();
function tier(id){ const a=S.aff[id]; return a>=60?'close':a>=35?'warm':'cold'; }
function faceEachOther(id){ const n=npcs[id]; n.talking=true; n.path=[]; const p=player.position, q=n.g.position; n.g.rotation.y=Math.atan2(p.x-q.x,p.z-q.z); player.rotation.y=Math.atan2(q.x-p.x,q.z-p.z);
  const mid=p.clone().lerp(q,.5), axis=new THREE.Vector3(q.x-p.x,0,q.z-p.z).normalize(), side=new THREE.Vector3(axis.z,0,-axis.x);
  const look=mid.clone().add(new THREE.Vector3(0,1.55,0)); const narrow=W.camera.aspect<1; const D=narrow?6.5:5.4;
  const dirs=[]; const base=narrow?[[-1,.35],[1,.35],[-1,-.35],[1,-.35]]:[[ -.3,1],[-.3,-1],[-.7,.7],[-.7,-.7],[.3,1],[.3,-1]]; // [沿轴(负=玩家身后), 侧向]
  for(const [a,b] of base) dirs.push(axis.clone().multiplyScalar(a).addScaledVector(side,b).normalize());
  const heads=[p.clone().setY(1.9),q.clone().setY(1.9),look];
  const clear=cp=>heads.every(h=>{ const d=cp.clone().sub(h); const L=d.length(); return W.rayOcc(h,d.normalize(),L,true).dist>=L; });
  let pos=null; for(const h of [1.1,2.6]){ for(const d of dirs){ const cp=look.clone().addScaledVector(d,D).add(new THREE.Vector3(0,h,0)); if(clear(cp)){ pos=cp; break; } } if(pos) break; }
  if(!pos){ for(const d of dirs){ const cp=look.clone().addScaledVector(d,3.2).add(new THREE.Vector3(0,5,0)); if(clear(cp)){ pos=cp; break; } } }
  if(!pos){ cam.cine=null; return; }
  look.y-=narrow?.1:.35; cam.cine={pos,look}; }
function openTalk(id){
  const C=CHARS[id]; if(!C||!npcs[id].g.visible) return; playerPath=[]; pendingTalk=null; faceEachOther(id); sfx('open'); tut('talked');
  showDialog(); setSpeaker(C.name,`${C.title} · 好感 ${S.aff[id]}`,id);
  const g=C.greet[tier(id)]; typeText(esc(g[(S.day+S.slot)%g.length]));
  C.talks.forEach((t,i)=>{ const key=id+i, used=S.used[key]; const lack=t.need&&Object.entries(t.need).some(([k,v])=>(S.aff[k]??S[k])<v);
    choice(`${used?'✓':'◆'} ${t.q}<span class="eff" style="display:inline;margin-left:8px">${used?'已叙过':lack?'（情缘未到）':'耗一时辰'}</span>`,()=>{
      S.used[key]=1; S.log.push(`第${CN[S.day]}回 · ${C.name}：${t.q}`);
      playLines(t.a,{defName:C.name,defTitle:C.title,defPid:id},()=>{ applyEff(t.eff); if(t.poem&&!S.poems.includes(t.poem)) { S.poems.push(t.poem); toast(`收录《${POEMS[t.poem].title}》`); } $('#dlgText').insertAdjacentHTML('beforeend',effHTML(t.eff)); choice('（告辞）',async()=>{ closeDialog(); await spendSlot(); }); });
    },{disabled:used||lack}); });
  choice('💬 随意闲谈（不耗时辰）',()=>startChat(id));
  choice('（告辞）',closeDialog);
}
function startChat(id){ const C=CHARS[id]; currentChat={id,history:[],recent:[]}; showDialog(); setSpeaker(C.name,C.title+(aiCfg().key?' · 大模型':' · 闲谈'),id);
  typeText(esc(C.greet[tier(id)][0])); $('#chatForm').classList.remove('hidden'); if(!isTouch) $('#chatInput').focus(); choice('（告辞）',closeDialog); }
$('#chatForm').onsubmit=async e=>{ e.preventDefault(); const inp=$('#chatInput'); const msg=inp.value.trim(); if(!msg||!currentChat) return; inp.value='';
  const id=currentChat.id, C=CHARS[id]; $('#dlgText').innerHTML=`<span class="narr">你：${esc(msg)}</span>\n\n……`;
  let reply=null; const cfg=aiCfg(); if(cfg.key){ try{ reply=await llm(id,currentChat.history,msg,cfg); }catch(err){ console.warn(err); toast('大模型连接失败，已改用离线对话'); } }
  if(!reply) reply=offlineReply(id,msg,currentChat);
  currentChat.history.push({role:'user',content:msg},{role:'assistant',content:reply});
  typeText(`<span class="narr">你：${esc(msg)}</span>\n\n${esc(reply)}`);
  const k='chat'+id+S.day; if(!S.used[k]){ S.used[k]=1; S.aff[id]=clamp(S.aff[id]+2); renderStats(); toast(`${C.name} 好感 ＋2（每回首次闲谈）`); } };
// 离线对话引擎：意图识别 + 好感分层 + 去重 + 时令
function offlineReply(id,msg,ctx){ const C=CHARS[id]; const hits=INTENTS.filter(([,kw])=>kw.some(k=>msg.includes(k))).map(([n])=>n);
  // 提到自己名字的 other_* 不算
  const me={daiyu:'other_daiyu',baochai:'other_baochai',xiangyun:'other_xiangyun'}[id]; const intents=hits.filter(h=>h!==me);
  const pool=[]; for(const it of intents){ if(C.say[it]) pool.push(...C.say[it]); if(pool.length) break; }
  if(!pool.length && intents.some(i=>i.startsWith('other_'))){ const who={other_daiyu:'林妹妹',other_baochai:'宝姐姐',other_xiangyun:'云丫头'}[intents.find(i=>i.startsWith('other_'))]; pool.push(`${who}？她自然有她的好处，你何苦来问我。`); }
  if(!pool.length && intents.includes('season')) pool.push(['今儿早起的露水重，花儿倒开得精神。','这会子日头正好，园子里到处是蜂儿蝶儿。','月亮上来了，你瞧那池子里，也有一个。'][S.slot]);
  if(!pool.length) pool.push(...C.fallback);
  const fresh=pool.filter(p=>!ctx.recent.includes(p)); const pick=(fresh.length?fresh:pool)[Math.floor(Math.random()*(fresh.length?fresh:pool).length)]; ctx.recent.push(pick); if(ctx.recent.length>6) ctx.recent.shift();
  const t=tier(id); const pre= t==='close'&&Math.random()<.4? '（她看了你一眼，眼里有些笑意）' : t==='cold'&&Math.random()<.3 ? '（她淡淡地）' : ''; return pre+pick; }
function aiCfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY))||{}; }catch{ return {}; } }
async function llm(id,history,msg,cfg){ const C=CHARS[id]; const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),20000);
  const r=await fetch((cfg.base||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions',{method:'POST',signal:ctrl.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},
    body:JSON.stringify({model:cfg.model||'gpt-4o-mini',max_tokens:220,temperature:.9,messages:[{role:'system',content:`${C.persona} 现在是大观园第${S.day}回${TIMES[S.slot]}时，地点${LOC[npcs[id].place]?.name||'园中'}。你对宝玉的好感度是${S.aff[id]}/100（越高越亲近）。只以角色身份说话。`},...history.slice(-10),{role:'user',content:'宝玉说：'+msg}]})});
  clearTimeout(to); if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json(); return j.choices?.[0]?.message?.content?.trim(); }

// ================= 时辰 =================
async function spendSlot(){
  S.slot++; if(S.slot>=3){ S.slot=0; S.day++; if(S.day>MAX_DAY){ S.day=MAX_DAY; return finish(); }
    S.fortune=clamp(S.fortune-2); mode='cine'; sfx('bell'); await fade(`第${CN[S.day]}回`,700); W.applySky(0,S.day); placeNPCs(true); mode='play';
    const ev=pendingEvents()[0]; toast(ev?`听说${LOC[ev.loc].name}那边似有动静……`:'又是新的一日。园中一切如常。',3500); }
  else { mode='cine'; await fade(TIMES[S.slot]==='暮'?'暮　色':'日　午',100); W.applySky(S.slot,S.day); placeNPCs(false); mode='play'; if(S.slot===1) tut('slot'); }
  setMood(S.slot===2?'night':'day'); renderStats(); autosave(); }

// ================= 剧情事件（过场） =================
function startCine(locId){ $('#cine').classList.remove('hidden'); const L=LOC[locId]; const c=new THREE.Vector3(L.pos[0],0,L.pos[1]); const v=locId==='qinfang'?new THREE.Vector3(0,0,1):c.clone().normalize().negate();
  const front=locId==='qinfang'?new THREE.Vector3(0,0,0):c.clone().addScaledVector(v.clone().negate(),-6); cam.cine={orbit:true, center:locId==='qinfang'?new THREE.Vector3(0,2,0):front.setY(2.2), r:locId==='qinfang'?16:17, t0:performance.now(), a0:Math.atan2(v.x,v.z)}; }
function endCine(){ $('#cine').classList.add('hidden'); $('#chapterCard').classList.remove('show'); }
async function runEvent(ev){
  mode='cine'; playerPath=[]; startCine(ev.loc); setMood(ev.mood==='night'||ev.mood==='snow'?'night':'sad'); if(ev.mood==='night'&&S.slot!==2) W.applySky(2,S.day);
  $('#chapNo').textContent=ev.chap; $('#chapTitle').textContent=ev.title; sfx('bell'); await new Promise(r=>setTimeout(r,250)); $('#chapterCard').classList.add('show');
  await new Promise(r=>setTimeout(r,window.__fast?0:2600)); $('#chapterCard').classList.remove('show');
  playLines(ev.text,{defName:ev.chap,defTitle:ev.title,seal:'红'},()=>{ if(ev.quiz) return runQuiz(ev);
    ev.choices.forEach(c=>{ const lack=c.need&&Object.entries(c.need).some(([k,v])=>(S.aff[k]??S[k])<v);
      choice('◆ '+c.t+(lack?'<span class="eff" style="display:inline"> （须先与刘姥姥结下善缘）</span>':''),()=>{
        S.done[ev.id]=1; S.log.push(`${ev.chap} ${ev.title}：${c.t}`);
        playLines(c.r,{defName:ev.chap,defTitle:ev.title,seal:'红'},()=>{ applyEff(c.eff); let extra=''; if(c.poem&&!S.poems.includes(c.poem)){ S.poems.push(c.poem); extra=`<div class="eff">📜 收录《${POEMS[c.poem].title}》</div>`; }
          $('#dlgText').insertAdjacentHTML('beforeend',effHTML(c.eff)+extra); choice('（合卷）',async()=>{ closeDialog(); await spendSlot(); }); });
      },{disabled:lack}); }); });
}
function runQuiz(ev){ const qs=[...QUIZ].sort(()=>Math.random()-.5).slice(0,5); let n=0,score=0;
  const ask=()=>{ showDialog(); setSpeaker('李纨','稻香老农 · 掌坛','liwan');
    if(n>=qs.length){ const eff={talent:score*3,tanchun:5,daiyu:score>=4?8:3,baochai:score>=3?6:2}; S.done[ev.id]=1; ['haitang','haitang2','liuxu'].forEach(p=>{ if(!S.poems.includes(p)) S.poems.push(p); }); S.log.push(`${ev.chap} 海棠诗社：接句 ${score}/5`);
      const v=score>=5?'"怡红公子此番压尽群芳！竟是我们都小看了你。"':score>=3?'"若论风流别致，自是这首；若论含蓄浑厚，终让蘅稿。怡红公子亦可。"':'"怡红公子是压尾，你服不服？"\n你｜"我的那首原不好了，这评的最公。"';
      typeText(esc(`接句 ${score}/5。\n${v}`)); applyEff(eff); $('#dlgText').insertAdjacentHTML('beforeend',effHTML(eff)+'<div class="eff">📜 收录《咏白海棠》二首、《临江仙·柳絮》</div>'); choice('（散社）',async()=>{ closeDialog(); await spendSlot(); }); return; }
    const q=qs[n]; $('#dlgTitle').textContent=`第 ${n+1}/5 题 · 已得 ${score}`; typeText(esc(q.q));
    q.o.map((o,i)=>[o,i]).sort(()=>Math.random()-.5).forEach(([o,i])=>choice(o,()=>{ const ok=i===q.a; if(ok){score++; sfx('good');} else sfx('bad'); toast(ok?'✔ 妙！':'✘ 原句：'+q.o[q.a]); n++; ask(); })); };
  ask(); }

// ================= 结局 =================
export function decideEnding(s=S){ const a=s.aff;
  if(a.daiyu>=65&&s.fortune>=30&&a.daiyu>=a.baochai) return 'muShi';
  if(a.tanchun>=45&&s.fortune>=65) return 'zhongXing';
  if(a.baochai>=60&&s.fortune>=30) return 'jinYu';
  if(a.xiangyun>=55&&s.fortune>=25) return 'xiangYun';
  if(s.zen>=30) return 'chuJia';
  return 'baiMang'; }
async function finish(){
  const id=decideEnding(); S.ended=id; const seen=JSON.parse(localStorage.getItem('honglou_endings')||'[]'); if(!seen.includes(id)){ seen.push(id); localStorage.setItem('honglou_endings',JSON.stringify(seen)); }
  localStorage.removeItem(SAVE_KEY); mode='cine'; setMood('sad'); W.applySky(0,14); await fade('终　卷',1200); const E=ENDINGS[id];
  openModal(`<div class="ending"><div class="seal" style="margin-bottom:10px">${E.cls==='good'?'圆':E.cls==='mid'?'憾':'空'}</div><h2>${E.title}</h2><div class="sub">${E.sub}</div><p class="body">${esc(E.text)}</p>
    <hr style="border:0;border-top:1px dashed #b08850;margin:18px 0"><div class="tiny" style="opacity:1;color:#6a4a2a">才情 ${S.talent} · 家运 ${S.fortune} · 禅心 ${S.zen} · 黛玉 ${S.aff.daiyu} · 宝钗 ${S.aff.baochai} · 湘云 ${S.aff.xiangyun} · 探春 ${S.aff.tanchun}</div>
    <h3>已得结局 ${seen.length}/${Object.keys(ENDINGS).length}</h3><div class="endlist">${Object.entries(ENDINGS).map(([k,e])=>`<span class="${seen.includes(k)?'got':''}" title="${ENDING_HINTS[k]}">${e.title}</span>`).join('')}</div>
    <p class="tiny" style="color:#6a4a2a">悬停/长按未得结局可见提示</p><button class="btn" onclick="location.reload()">重　读</button></div>`,true); mode='ending'; }

// ================= 弹窗页面 =================
function openModal(html,noClose){ $('#modalBody').innerHTML=html+(noClose?'':'<div style="text-align:center;margin-top:16px"><button class="btn" id="mClose">合　上</button></div>'); $('#modal').classList.remove('hidden'); if(mode!=='title') mode='modal'; const c=$('#mClose'); if(c) c.onclick=closeModal; sfx('open'); }
function closeModal(){ $('#modal').classList.add('hidden'); mode=$('#title').classList.contains('hidden')?'play':'title'; }
const PAGES={
  about:()=>`<h2>卷首 · 玩法</h2><p>你是<b>贾宝玉</b>。自青埂峰下一梦入园，将在大观园中度过<b>十五回</b>光阴，每回分<b>晨、午、暮</b>三个时辰。</p>
  <div class="card">🚶 <b>行走</b>：WASD / 方向键，或点击地面（会自动绕路）；手机用左下摇杆或点按。<br>🎥 <b>视角</b>：拖动旋转，滚轮 / 双指缩放。<br>💬 <b>交谈</b>：走近人物按 E、点击人物或点底部按钮。"心事"选项各耗一时辰；"随意闲谈"可自由打字，不耗时辰。<br>🗺 <b>园图</b>（M）：点地名即可自动前往。📜 <b>簿册</b>（J）：人物、判词、诗集、回目。</div>
  <div class="card">📖 <b>回目</b>：元妃省亲、黛玉葬花、海棠诗社、撕扇、刘姥姥进园、湘云醉眠、探春理家、宝玉挨打、抄检大观园、中秋联诗、锦衣军查抄——到时候去对应之处便会发生。右上角会提示去向。<br>🌙 <b>歇息</b>：直接跳过一个时辰。家运每过一回会自然衰减。</div>
  <div class="card">🎭 <b>六种结局</b>：木石前盟、金玉良缘、兰桂齐芳、因麒麟伏白首双星、悬崖撒手、白茫茫大地真干净——由情缘、才情、家运、禅心共同决定。</div>
  <div class="card">🤖 <b>大模型对话（可选）</b>：在"设置"里填入兼容 OpenAI 的接口地址、模型与密钥，人物即由大模型扮演；不填则使用内置离线对话，游戏完全可玩。</div>`,
  journal:(tab='aff')=>{ const tabs=`<div class="tabs">${[['aff','人物'],['verdict','金陵判词'],['poems','诗集'],['log','回目'],['end','结局']].map(([k,n])=>`<button class="${k===tab?'on':''}" data-tab="${k}">${n}</button>`).join('')}</div>`; let body='';
    if(tab==='aff') body=`<div class="card">才情 ${S.talent}　·　家运 ${S.fortune}　·　禅心 ${S.zen}</div><div class="cardgrid">`+Object.entries(CHARS).filter(([k])=>visible(k)||S.aff[k]>0).map(([k,C])=>`<div class="card char"><img src="${portraits[k]}"><div><b>${C.name}</b><br><small>${C.title} · ${LOC[C.loc].name}</small><br>好感 ${S.aff[k]} · ${({cold:'疏',warm:'亲',close:'知心'})[tier(k)]}</div></div>`).join('')+'</div>';
    if(tab==='verdict') body='<p class="tiny" style="color:#6a4a2a">好感达 50，可在太虚幻境薄命司中揭开她的判词。</p>'+Object.entries(CHARS).map(([k,C])=>S.aff[k]>=50?`<div class="card"><b>${C.name}</b><br>${C.verdict}</div>`:`<div class="card locked">${C.name}　—— 册页尚封（${S.aff[k]}/50）</div>`).join('');
    if(tab==='poems') body=S.poems.map(p=>`<div class="card"><b>《${POEMS[p].title}》</b>　${POEMS[p].author}<div style="white-space:pre-wrap;margin-top:4px">${POEMS[p].text}</div></div>`).join('')+`<p class="tiny" style="color:#6a4a2a">已收录 ${S.poems.length}/${Object.keys(POEMS).length}</p>`;
    if(tab==='log') body=(S.log.length?S.log.map(l=>`<div class="card">${l}</div>`).join(''):'<p>尚无记载。</p>')+'<h3>未了之事</h3>'+EVENTS.filter(e=>!S.done[e.id]).map(e=>`<div class="card locked">${e.chap} ${e.title}　—— 第${CN[e.day]}回后 · ${LOC[e.loc].name}</div>`).join('');
    if(tab==='end'){ const seen=JSON.parse(localStorage.getItem('honglou_endings')||'[]'); body=Object.entries(ENDINGS).map(([k,e])=>`<div class="card ${seen.includes(k)?'':'locked'}"><b>${e.title}</b> ${seen.includes(k)?'· 已得':''}<br><small>${ENDING_HINTS[k]}</small></div>`).join(''); }
    return `<h2>簿　册</h2>${tabs}${body}`; },
  save:()=>{ const has=localStorage.getItem(SAVE_KEY+'_manual'); return `<h2>存　档</h2><p>每过一个时辰自动存档（浏览器本地）。</p><div class="menu" style="margin:0 auto"><button id="doSave">手动存档</button><button id="doLoad" ${has?'':'disabled'}>读取手动存档</button><button id="doExport">导出存档</button><button id="doImport">导入存档</button><button id="doReset">重新开卷</button></div>`; },
  settings:()=>{ const c=aiCfg(), v=getVol(); return `<h2>设　置</h2>
    <h3>声　音</h3><label>琴曲 <input type="range" min="0" max="1" step=".05" value="${v.music}" data-vol="music"></label><label>环境（风、鸟、虫） <input type="range" min="0" max="1" step=".05" value="${v.amb}" data-vol="amb"></label><label>音效 <input type="range" min="0" max="1" step=".05" value="${v.sfx}" data-vol="sfx"></label>
    <h3>画　质</h3><label>画质档位 <select id="qualitySel">${[["auto","自动"],["high","高（环境光遮蔽+倒影）"],["medium","中"],["low","低（手机）"]].map(([k,n])=>`<option value="${k}" ${(localStorage.getItem("honglou_quality")||"auto")===k?"selected":""}>${n}</option>`).join("")}</select></label><p class="hint" style="font-size:12px;opacity:.7">当前：${W.R.q.name}档${W.R.fps?`，约 ${W.R.fps.toFixed(0)} 帧`:""}。切换"倒影/草量"需重新载入页面。</p>
    <h3>大模型对话（可选）</h3><p class="tiny" style="color:#6a4a2a">填写任意兼容 OpenAI Chat Completions 的服务（OpenAI、DeepSeek、xAI、Moonshot 等）。密钥只保存在你的浏览器里，由浏览器直接发给该服务。留空则用离线对话。</p>
    <label>API 地址</label><input class="f" id="cfgBase" value="${c.base||''}" placeholder="https://api.deepseek.com/v1"><label>模型名</label><input class="f" id="cfgModel" value="${c.model||''}" placeholder="deepseek-chat"><label>API Key</label><input class="f" id="cfgKey" type="password" value="${c.key||''}" placeholder="sk-...">
    <div style="margin-top:12px;display:flex;gap:8px"><button class="btn" id="cfgSave">保存</button><button class="btn" id="cfgClear">清除密钥</button></div>`; },
  map:()=>`<h2>大观园图</h2><canvas id="mapCanvas" width="600" height="600"></canvas><p class="tiny" style="color:#6a4a2a;text-align:center">点击地名即可前往 · ◆ 为可发生的回目 · 红点为你</p>`,
};
function openPage(name,arg){ if(!(isPlay()||mode==='modal'||mode==='title')) return; openModal(PAGES[name](arg)); bindPage(name); if(name==='map') tut('map'); }
function bindPage(name){
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>openPage('journal',b.dataset.tab));
  if(name==='save'){ $('#doSave').onclick=()=>{ localStorage.setItem(SAVE_KEY+'_manual',JSON.stringify(snap())); toast('已存档'); closeModal(); };
    $('#doLoad').onclick=()=>{ load(JSON.parse(localStorage.getItem(SAVE_KEY+'_manual'))); toast('已读档'); closeModal(); };
    $('#doExport').onclick=()=>{ const t=btoa(unescape(encodeURIComponent(JSON.stringify(snap())))); navigator.clipboard?.writeText(t).then(()=>toast('存档文本已复制到剪贴板'),()=>prompt('复制以下存档文本',t)); };
    $('#doImport').onclick=()=>{ const t=prompt('粘贴存档文本'); if(!t) return; try{ load(JSON.parse(decodeURIComponent(escape(atob(t.trim()))))); toast('已导入'); closeModal(); }catch{ toast('存档文本有误'); } };
    $('#doReset').onclick=()=>{ if(confirm('确定清除进度，重新开卷？')){ localStorage.removeItem(SAVE_KEY); location.reload(); } }; }
  if(name==='settings'){ document.querySelectorAll('[data-vol]').forEach(r=>r.oninput=()=>setVol(r.dataset.vol,+r.value)); const qs=$('#qualitySel'); if(qs) qs.onchange=()=>{ localStorage.setItem('honglou_quality',qs.value); W.R.auto=qs.value==='auto'; if(qs.value!=='auto') W.R.setTier(qs.value); };
    $('#cfgSave').onclick=()=>{ localStorage.setItem(CFG_KEY,JSON.stringify({base:$('#cfgBase').value.trim(),model:$('#cfgModel').value.trim(),key:$('#cfgKey').value.trim()})); toast('已保存'); closeModal(); };
    $('#cfgClear').onclick=()=>{ localStorage.removeItem(CFG_KEY); toast('已清除，改用离线对话'); closeModal(); }; }
  if(name==='map'){ const c=$('#mapCanvas'); drawMap(c.getContext('2d'),600,true); c.onclick=e=>{ const r=c.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width*600, y=(e.clientY-r.top)/r.height*600; const wx=(x-300)/5.6, wz=(y-300)/5.6;
      const L=LOCATIONS.reduce((b,l)=>{ const d=Math.hypot(l.pos[0]-wx,l.pos[1]-wz); return d<b.d?{l,d}:b; },{d:1e9}).l; closeModal();
      const to=L.id==='qinfang'?new THREE.Vector3(0,0,player.position.z>=0?2:-2):localToWorld(L.id,0,5.8); walkTo(to); toast(`往${L.name}去`); }; }
}
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openPage(b.dataset.open));
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal'&&$('#mClose')) closeModal(); });
$('#restBtn').onclick=async()=>{ if(!isPlay()) return; await spendSlot(); };
$('#minimap').onclick=()=>openPage('map');

// 园图绘制
function drawMap(x,S0,big){ const k=S0/107, o=S0/2; const P=(a,b)=>[o+a*k,o+b*k];
  x.fillStyle='#ead9b2'; x.fillRect(0,0,S0,S0); x.fillStyle='rgba(120,90,50,.06)'; for(let i=0;i<300;i++) x.fillRect(Math.random()*S0,Math.random()*S0,2,2);
  x.strokeStyle='#8a6a3a'; x.lineWidth=big?3:2; x.strokeRect(...P(-50,-50),100*k,100*k);
  x.strokeStyle='#c8b080'; x.lineWidth=big?7:4; x.beginPath(); x.arc(o,o,RING*k,0,7); x.stroke();
  for(const L of LOCATIONS){ if(L.kind==='pavilion') continue; const g=gateOut(L.id); x.beginPath(); x.moveTo(...P(Math.cos(ringAngle(g))*RING,Math.sin(ringAngle(g))*RING)); x.lineTo(...P(g.x,g.z)); x.stroke(); }
  x.fillStyle='#7fa8b0'; x.beginPath(); x.arc(o,o,10.8*k,0,7); x.fill(); x.fillStyle='#c8b080'; x.fillRect(o-1.1*k,o-10.5*k,2.2*k,21*k); x.fillStyle='#9e1f19'; x.beginPath(); x.arc(o,o,3*k,0,7); x.fill();
  const pend=new Set(pendingEvents().map(e=>e.loc));
  for(const L of LOCATIONS){ const [px,pz]=P(...L.pos);
    if(L.kind!=='pavilion'){ x.save(); x.translate(px,pz); x.rotate(Math.atan2(L.pos[0],-L.pos[1])); x.fillStyle='rgba(243,232,207,.9)'; x.strokeStyle='#6a4a2a'; x.lineWidth=1.5; const w=(L.kind==='hall'?20:18)*k/2; x.fillRect(-w,-8*k,2*w,16*k); x.strokeRect(-w,-8*k,2*w,16*k); x.fillStyle='#3a3a44'; x.fillRect(-5*k,-3.5*k,10*k,7*k); x.restore(); }
    if(big||true){ x.fillStyle='#2a1a12'; x.font=`${big?22:13}px "Ma Shan Zheng","KaiTi",serif`; x.textAlign='center'; x.fillText(L.name,px,pz+(L.kind==='pavilion'?(big?-26:-14):4)); }
    if(pend.has(L.id)){ x.fillStyle='#c0392b'; x.font=`${big?26:16}px serif`; x.fillText('◆',px,pz-(big?22:12)); } }
  for(const n of Object.values(npcs)){ if(!n.g.visible) continue; x.fillStyle='#3f7a64'; x.beginPath(); x.arc(...P(n.g.position.x,n.g.position.z),big?5:3,0,7); x.fill(); if(big){ x.fillStyle='#3f7a64'; x.font='13px serif'; x.fillText(CHARS[n.id].name.slice(-2),...P(n.g.position.x,n.g.position.z+2.4)); } }
  const [px,pz]=P(player.position.x,player.position.z); x.save(); x.translate(px,pz); x.rotate(-player.rotation.y+Math.PI); x.fillStyle='#d02020'; x.strokeStyle='#fff'; x.lineWidth=2; x.beginPath(); x.moveTo(0,-(big?11:8)); x.lineTo(big?7:5,big?7:5); x.lineTo(-(big?7:5),big?7:5); x.closePath(); x.fill(); x.stroke(); x.restore(); }

// ================= 教程 =================
const TUT={ start:isTouch?'用左下的<b>摇杆</b>行走，或<b>点按地面</b>前往。拖动画面可旋转视角，双指缩放。':'用 <b>WASD / 方向键</b> 行走，或<b>点击地面</b>前往。按住拖动旋转视角，滚轮缩放。',
  moved:'右上角会提示<b>下一个去处</b>。先往园心的<b>沁芳亭</b>去，元妃省亲就要开始了。',
  talked:'"◆ 心事"选项会<b>耗一个时辰</b>，影响好感与才情、家运、禅心；"随意闲谈"可以自由打字，不耗时辰。',
  slot:'每回有<b>晨、午、暮</b>三个时辰，人物也会随时辰在园中走动。打开<b>园图（M）</b>可以看到大家在哪里。',
  map:'在园图上<b>点击地名</b>就会自动走过去。◆ 标记的是此刻可以发生的回目。' };
function tut(k){ const seen=JSON.parse(localStorage.getItem(TUT_KEY)||'{}'); if(seen[k]||!TUT[k]) return; seen[k]=1; localStorage.setItem(TUT_KEY,JSON.stringify(seen)); setTimeout(()=>{ $('#tutText').innerHTML=TUT[k]; $('#tutorial').classList.remove('hidden'); },k==='moved'?2500:300); }
$('#tutNext').onclick=()=>$('#tutorial').classList.add('hidden');

// ================= 存档 =================
function snap(){ S.pos=[player.position.x,player.position.z]; return S; }
function autosave(){ if(!S.ended) localStorage.setItem(SAVE_KEY,JSON.stringify(snap())); }
function load(d){ const f=freshState(); S=Object.assign(f,d); S.aff=Object.assign(f.aff,d.aff||{}); player.position.set(S.pos[0],0,S.pos[1]); W.applySky(S.slot,S.day); placeNPCs(true); setMood(S.slot===2?'night':'day'); renderStats(); }

// ================= 序章 =================
const ART={ stone:`<svg viewBox="0 0 560 300"><defs><filter id="ink"><feTurbulence baseFrequency=".03" numOctaves="3"/><feDisplacementMap in="SourceGraphic" scale="14"/></filter><radialGradient id="g"><stop offset="0" stop-color="#6a6a6a"/><stop offset="1" stop-color="#1a1a1a"/></radialGradient></defs><path d="M0 260 Q140 180 280 230 T560 210 V300 H0Z" fill="#2a2420" filter="url(#ink)"/><path d="M40 240 L120 90 L200 230Z M330 230 L420 60 L520 240Z" fill="#3a332c" opacity=".7" filter="url(#ink)"/><ellipse cx="280" cy="220" rx="70" ry="44" fill="url(#g)" filter="url(#ink)"/></svg>`,
  monk:`<svg viewBox="0 0 560 300"><defs><filter id="ink"><feTurbulence baseFrequency=".04" numOctaves="3"/><feDisplacementMap in="SourceGraphic" scale="10"/></filter></defs><path d="M0 260 Q140 200 280 240 T560 220 V300 H0Z" fill="#2a2420" filter="url(#ink)"/><g fill="#d8cdb8" filter="url(#ink)"><circle cx="220" cy="140" r="14"/><path d="M200 156 L240 156 L252 240 L188 240Z"/><circle cx="340" cy="136" r="14"/><path d="M320 152 L360 152 L374 240 L306 240Z"/><path d="M372 120 L380 250" stroke="#d8cdb8" stroke-width="4"/></g><ellipse cx="280" cy="236" rx="40" ry="20" fill="#555" filter="url(#ink)"/></svg>`,
  jade:`<svg viewBox="0 0 560 300"><defs><radialGradient id="j"><stop offset="0" stop-color="#d8ffe8"/><stop offset=".5" stop-color="#5fbf8f"/><stop offset="1" stop-color="#1f5a40" stop-opacity="0"/></radialGradient></defs><circle cx="280" cy="150" r="120" fill="url(#j)" opacity=".35"/><ellipse cx="280" cy="150" rx="36" ry="48" fill="#8fdcb0" stroke="#e8ffe8" stroke-width="2"/><text x="280" y="158" text-anchor="middle" font-size="20" fill="#1f5a40" font-family="serif">通灵宝玉</text><path d="M280 102 V60" stroke="#c9a24a" stroke-width="3"/></svg>`,
  taixu:`<svg viewBox="0 0 560 300"><defs><filter id="ink"><feTurbulence baseFrequency=".02" numOctaves="2"/><feDisplacementMap in="SourceGraphic" scale="12"/></filter><linearGradient id="c" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3a2a4a"/><stop offset="1" stop-color="#0d0806"/></linearGradient></defs><rect width="560" height="300" fill="url(#c)"/><g fill="#e8dcc4" opacity=".15" filter="url(#ink)"><ellipse cx="120" cy="240" rx="160" ry="30"/><ellipse cx="440" cy="250" rx="180" ry="30"/></g><g fill="#c9a24a"><rect x="150" y="70" width="14" height="190"/><rect x="396" y="70" width="14" height="190"/><path d="M120 70 Q280 30 440 70 L430 90 Q280 54 130 90Z"/><rect x="210" y="92" width="140" height="40" fill="#1d2438" stroke="#c9a24a" stroke-width="3"/></g><text x="280" y="120" text-anchor="middle" font-size="24" fill="#e8c76a" font-family="'Ma Shan Zheng',serif">太虚幻境</text></svg>`,
  garden:`<svg viewBox="0 0 560 300"><defs><filter id="ink"><feTurbulence baseFrequency=".03" numOctaves="3"/><feDisplacementMap in="SourceGraphic" scale="8"/></filter></defs><path d="M0 200 Q100 150 200 190 T400 170 T560 190 V300 H0Z" fill="#2a3a30" filter="url(#ink)"/><g fill="#9e1f19"><rect x="230" y="150" width="6" height="50"/><rect x="324" y="150" width="6" height="50"/></g><path d="M200 152 Q280 110 360 152 L350 160 Q280 128 210 160Z" fill="#2a2a32"/><g fill="#ff5a3a"><circle cx="140" cy="140" r="6"/><circle cx="420" cy="130" r="6"/><circle cx="250" cy="170" r="5"/><circle cx="310" cy="170" r="5"/></g><circle cx="460" cy="60" r="26" fill="#f6ecc8" opacity=".85"/></svg>` };
let proI=0;
function startPrologue(){ mode='prologue'; $('#title').classList.add('hidden'); $('#prologue').classList.remove('hidden'); proI=0; showPro(); setMood('sad'); }
function showPro(){ const p=PROLOGUE[proI]; const a=$('#proArt'); if(a.dataset.s!==p.s){ a.dataset.s=p.s; a.innerHTML=ART[p.s]; } const t=$('#proText'); t.className=p.big?'big':''; t.style.animation='none'; t.offsetHeight; t.style.animation=''; const m=p.t.match(/^([^｜]{1,6})｜(.*)$/); t.innerHTML=m?`<b style="color:#e0b860">${m[1]}</b>：${esc(m[2])}`:esc(p.t); }
$('#prologue').onclick=e=>{ if(e.target.id==='proSkip') return; sfx('click'); proI++; if(proI>=PROLOGUE.length) endPrologue(); else showPro(); };
$('#proSkip').onclick=()=>endPrologue();
async function endPrologue(){ await fade('第一回',600); $('#prologue').classList.add('hidden'); startPlay(); }

// ================= 开始 =================
function startPlay(){ $('#hud').classList.remove('hidden'); mode='play'; W.applySky(S.slot,S.day); placeNPCs(true); setMood(S.slot===2?'night':'day'); renderStats();
  cam.yaw=Math.atan2(player.position.x,player.position.z); cam.pitch=.5; cam.focus.copy(player.position).setY(1.6); W.camera.position.set(cam.focus.x+Math.sin(cam.yaw)*12,cam.focus.y+7,cam.focus.z+Math.cos(cam.yaw)*12); tut('start'); }
$('#newGame').onclick=()=>{ initAudio(); localStorage.removeItem(SAVE_KEY); S=freshState(); player.position.copy(localToWorld('yihong',1.5,6.2)); player.rotation.y=0; startPrologue(); };
$('#continueGame').onclick=async()=>{ initAudio(); const d=localStorage.getItem(SAVE_KEY); if(!d) return; load(JSON.parse(d)); await fade('续　读',200); $('#title').classList.add('hidden'); startPlay(); };

// ================= 遮挡淡出 =================
const faded=new Map(); const _seg=new THREE.Line3(), _cp=new THREE.Vector3(); let occT=0, want=new Set();
function segDist(a,b,p){ _seg.set(a,b); _seg.closestPointToPoint(p,true,_cp); return _cp.distanceTo(p); }
// 镜头与目标之间的建筑淡出：用每座院落的代理包围盒做射线检测（合并网格后仍然廉价），10Hz 更新
function updateOcclusion(dt){
  const active=(mode==='play'||mode==='dialog')&&!window.__camOverride;
  if((occT+=dt)>.1){ occT=0; want=new Set();
    if(active){ const camP=W.camera.position; const tgts=mode==='dialog'&&cam.cine?[cam.cine.look,player.position.clone().setY(1.2)]:[player.position.clone().setY(.4),player.position.clone().setY(1.8)];
      for(const t of tgts) for(const [ox,oy] of [[0,0],[.6,0],[-.6,0],[0,.6]]){ const e=t.clone().add(new THREE.Vector3(ox,oy,0)); const d=e.sub(camP); const L=d.length(); d.normalize();
        for(const h of W.rayOccAll(camP,d,L-.6)) h.og.roofs.forEach(m=>want.add(m)); } } }
  for(const m of want){ if(!faded.has(m)){ faded.set(m,{orig:m.material,a:1}); const mm=m.material.clone(); mm.transparent=true; mm.depthWrite=false; m.material=mm; } }
  for(const [m,f] of faded){ const tgt=want.has(m)?.18:1; f.a+= (tgt-f.a)*Math.min(1,dt*8); m.material.opacity=f.a; m.castShadow=f.a>.9; if(!want.has(m)&&f.a>.97){ m.material.dispose(); m.material=f.orig; m.castShadow=true; faded.delete(m); } }
  // 对话时隐藏挡镜的旁人
  for(const n of Object.values(npcs)){ if(!visible(n.id)) continue; let hide=false;
    if(mode==='dialog'&&cam.cine&&!n.talking){ const c=W.camera.position; hide=segDist(c,cam.cine.look,n.g.position.clone().setY(1.3))<1.4||n.g.position.distanceTo(c)<3; }
    n.g.visible=!hide; }
}

// ================= 主循环 =================
let curLoc=null, stepT=0, mmT=0; const clock=new THREE.Timer(); const tmp=new THREE.Vector3();
function loop(){
  clock.update(); const dt=Math.min(clock.getDelta(),.05), t=clock.getElapsed();
  // 玩家移动
  let mv=new THREE.Vector3();
  if(isPlay()){
    const f=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0)-joy.y, s=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+joy.x;
    if(Math.abs(f)>.1||Math.abs(s)>.1){ playerPath=[]; pendingTalk=null; const fw=new THREE.Vector3(-Math.sin(cam.yaw),0,-Math.cos(cam.yaw)), rt=new THREE.Vector3(-fw.z,0,fw.x); mv.addScaledVector(fw,f).addScaledVector(rt,s); if(mv.length()>1) mv.normalize(); tut('moved'); }
    else if(playerPath.length){ const tg=playerPath[0]; mv.set(tg.x-player.position.x,0,tg.z-player.position.z); const d=mv.length(); const last=playerPath.length===1;
      if(pendingTalk && last && player.position.distanceTo(npcs[pendingTalk].g.position)<2.6){ playerPath=[]; const id=pendingTalk; pendingTalk=null; mv.set(0,0,0); openTalk(id); }
      else if(d<(last?.2:.6)){ playerPath.shift(); if(!playerPath.length) mv.set(0,0,0); } else mv.normalize();
      if(pendingTalk && npcs[pendingTalk] && last) playerPath[0]=npcs[pendingTalk].g.position.clone(); }
  }
  const speed=mv.length()*6.2;
  if(speed>0){ const step=mv.clone().multiplyScalar(6.2*dt); const p=player.position;
    if(!W.blocked(p.x+step.x,p.z+step.z)){ p.x+=step.x; p.z+=step.z; } else if(!W.blocked(p.x+step.x,p.z)){ p.x+=step.x; } else if(!W.blocked(p.x,p.z+step.z)){ p.z+=step.z; } else if(playerPath.length) playerPath.shift();
    turnTo(player,Math.atan2(mv.x,mv.z),dt*10); stepT+=dt; if(stepT>.36){ stepT=0; sfx('step'); } }
  player.position.y=W.groundHeight(player.position.x,player.position.z);
  W.animateCharacter(player,dt,t,speed*.45);
  if(marker){ marker.material.opacity=Math.max(0,marker.material.opacity-dt*.7); marker.scale.setScalar(1+(1-marker.material.opacity)*.6); }
  updateNPCs(dt,t);
  // 最近人物
  nearest=null; let nd=3.4; for(const n of Object.values(npcs)){ if(!n.g.visible) continue; const d=n.g.position.distanceTo(player.position); if(d<nd){ nd=d; nearest=n.id; } }
  const tb=$('#talkBtn'); if(nearest&&isPlay()){ tb.textContent=`与 ${CHARS[nearest].name} 交谈${isTouch?'':'（E）'}`; tb.classList.remove('hidden'); tb.onclick=()=>openTalk(nearest); } else tb.classList.add('hidden');
  // 地点与事件
  if(isPlay()){ let loc=null; const r=regionOf(player.position); if(r) loc=LOC[r]; else { for(const L of LOCATIONS){ if(L.kind==='pavilion') continue; if(player.position.distanceTo(gateOut(L.id))<3.2) loc=L; } }
    if(loc!==curLoc){ curLoc=loc; const el=$('#locName'); if(loc){ el.textContent=loc.name; el.style.opacity=1; toast(loc.desc,3800); clearTimeout(el.h); el.h=setTimeout(()=>el.style.opacity=0,2400); } }
    if(loc && r===loc.id){ const ev=pendingEvents().find(e=>e.loc===loc.id); if(ev&&!window.__noEvents) runEvent(ev); } }
  // 镜头
  if(window.__camOverride){ const o=window.__camOverride; W.camera.position.set(...o.pos); W.camera.lookAt(...o.look); }
  else if(mode==='title'||mode==='loading'||mode==='prologue'){ const a=t*.04; W.camera.position.set(Math.sin(a)*58,26,Math.cos(a)*58); W.camera.lookAt(0,2,0); }
  else if(cam.cine&&cam.cine.orbit){ const c=cam.cine, a=c.a0+(performance.now()-c.t0)/1000*.06; tmp.set(c.center.x+Math.sin(a)*c.r,c.center.y+6.5,c.center.z+Math.cos(a)*c.r); W.camera.position.lerp(tmp,1-Math.exp(-dt*1.6)); cam.focus.lerp(c.center,1-Math.exp(-dt*2.5)); W.camera.lookAt(cam.focus); }
  else if(cam.cine){ W.camera.position.lerp(cam.cine.pos,1-Math.exp(-dt*5)); cam.focus.lerp(cam.cine.look,1-Math.exp(-dt*6)); W.camera.lookAt(cam.focus); }
  else { cam.dist+=(cam.tDist-cam.dist)*(1-Math.exp(-dt*6)); const tgt=player.position.clone().add(new THREE.Vector3(0,1.6,0)); cam.focus.lerp(tgt,1-Math.exp(-dt*9));
    const offAt=pt=>new THREE.Vector3(Math.sin(cam.yaw)*Math.cos(pt),Math.sin(pt),Math.cos(cam.yaw)*Math.cos(pt));
    let pt=cam.pitch, dir=offAt(pt); for(let i=0;i<6;i++){ if(W.rayOcc(cam.focus,dir,cam.dist,false).dist>=cam.dist) break; pt=Math.min(1.0,pt+.1); dir=offAt(pt); }
    cam.boost=(cam.boost??cam.pitch)+(pt-(cam.boost??cam.pitch))*(1-Math.exp(-dt*3)); dir=offAt(Math.max(cam.boost,cam.pitch)); let dd=cam.dist; const oh=W.rayOcc(cam.focus,dir,cam.dist,false); if(oh.dist<cam.dist) dd=Math.max(3,oh.dist-.4);
    tmp.copy(cam.focus).addScaledVector(dir,dd); tmp.y=Math.max(tmp.y,1.2); W.camera.position.lerp(tmp,1-Math.exp(-dt*7)); W.camera.lookAt(cam.focus);
    if(speed>0&&!keys.q&&!keys.r&&!pointers.size){ /* 轻微自动跟随朝向 */ } if(keys.q) cam.yaw+=dt*1.6; if(keys.r) cam.yaw-=dt*1.6; }
  updateOcclusion(dt);
  W.followSun(mode==='title'?new THREE.Vector3():player.position); W.tick(dt,t); W.render();
  if(isPlay()&&(mmT+=dt)>.15){ mmT=0; drawMap($('#minimap').getContext('2d'),180,false); }
  requestAnimationFrame(loop);
}
addEventListener('resize',W.resize);
boot().then(()=>loop()).catch(e=>{ console.error(e); $('#loadText').textContent='加载出错：'+e.message; });

// 调试 / 自动化测试接口
window.__game={ cam, W, get S(){return S;}, set S(v){S=v;}, openTalk, runEvent, finish, spendSlot, EVENTS, CHARS, decideEnding, get mode(){return mode;}, npcs, get player(){return player;}, walkTo, startPlay, load };
