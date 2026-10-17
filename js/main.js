import * as THREE from 'three';
import * as W from './world.js';
import { LOCATIONS, CHARS, PLAYER_STYLE, INTENTS, EVENTS, QUIZ, POEMS, ENDINGS, ENDING_HINTS, PROLOGUE, MAX_DAY, TIMES } from './data.js';
import { REGIONS, REGION_ORDER, GARDEN_SPOTS, REGION_LOCS, REGION_DEFS, NEW_CHARS, BIOS, NEW_EVENTS, ITEMS, LORE, ITEM_POEMS, EXTRA_VERDICTS, HELP_HTML } from './data2.js';
import { DECOR } from './regions.js';
import { initAudio, setMood, sfx, getVol, setVol } from './audio.js';

const TUTORIAL_ON=true;
const $=s=>document.querySelector(s);
const V3=THREE.Vector3;
const CN=['零','一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六'];
const STAT_NAMES={talent:'才情',fortune:'家运',zen:'禅心'};
const SAVE_KEY='honglou_save_v2', CFG_KEY='honglou_ai_cfg', HINT_KEY='honglou_hints', TUT_OFF='honglou_tut_off';
const isTouch=matchMedia('(pointer:coarse)').matches;
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// ================= 合并内容：大观园 + 各地域 =================
LOCATIONS.push(...GARDEN_SPOTS); for(const L of LOCATIONS) L.region='garden';
for(const [r,ls] of Object.entries(REGION_LOCS)) for(const L of ls) L.region=r;
for(const r of Object.keys(REGION_DEFS)) Object.assign(REGION_DEFS[r],{id:r,locs:REGION_LOCS[r]||[],decor:DECOR[r]});
Object.assign(CHARS,NEW_CHARS); EVENTS.push(...NEW_EVENTS); EVENTS.sort((a,b)=>a.day-b.day); Object.assign(POEMS,ITEM_POEMS);
const ALL_LOCS=[...LOCATIONS,...Object.values(REGION_LOCS).flat()];
const LOC=Object.fromEntries(ALL_LOCS.map(l=>[l.id,l]));
const locsIn=r=>r==='garden'?LOCATIONS:(REGION_LOCS[r]||[]);
const regionOfLoc=id=>LOC[id]?.region||'garden';

// ================= 状态 =================
function freshState(){ const aff={}; for(const k in CHARS) aff[k]=20; aff.daiyu=30; aff.baochai=25; aff.xiren=35; aff.qingwen=30; aff.liulaolao=0;
  return { day:1, slot:0, aff, talent:10, fortune:50, zen:5, done:{}, used:{}, poems:['haoliao'], pos:null, ended:null, log:[],
    region:'garden', visited:{garden:1}, items:{}, lore:Object.fromEntries(Object.entries(LORE).filter(([,l])=>l.start).map(([k])=>[k,1])), met:{}, seen:{}, flags:{}, fog:{}, tut:null }; }
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
  await W.bakeLighting(f=>setLoad(40+Math.round(f*8),'晕染光影……'),'garden'); W.setRegion('garden'); setLoad(48,'安置人物……'); await nextFrame();
  player=W.makeCharacter(PLAYER_STYLE); W.scene.add(player);
  for(const [id,C] of Object.entries(CHARS)){ const g=W.makeCharacter(C.style); W.scene.add(g); npcs[id]={g,id,path:[],wait:R(1,4),speed:0,place:null,present:false}; }
  setLoad(65,'描画众钗容貌……'); await nextFrame();
  try{ await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))]); }catch{}
  W.signs.forEach(s=>s.userData.redraw?.());
  portraits=W.renderPortraits({...Object.fromEntries(Object.entries(CHARS).map(([k,c])=>[k,c.style])), baoyu:PLAYER_STYLE, ...EXTRA_PORTRAITS});
  setLoad(85,'点起灯笼……'); await nextFrame();
  W.applySky(0,1); W.resize(); placeNPCs(true);
  if(!S.pos) player.position.copy(localToWorld('yihong',0,4.4)); W.render(); setLoad(100,'入　梦'); await wait(350);
  $('#loading').style.transition='opacity 1s'; $('#loading').style.opacity=0; setTimeout(()=>$('#loading').classList.add('hidden'),1000);
  $('#title').classList.remove('hidden'); mode='title';
  if(!localStorage.getItem(SAVE_KEY)) $('#continueGame').disabled=true;
}
const R=(a,b)=>a+Math.random()*(b-a);
const EXTRA_PORTRAITS={ yuanchun:{robe:0xe8b830,skirt:0xc8102e,trim:0x9e1f19,sash:0xc8102e,style:'high',face:{skin:'#fbe6d4'},cape:0xd4a020} };
const EXTRA_TITLES={yuanchun:'贤德妃',liwan:'稻香老农',jinghuan:'太虚幻境'};

// ================= 坐标与寻路 =================
const RING=13.6;
function localToWorld(locId,lx,lz){ const v=new V3(lx,0,lz); W.locGroups[locId].localToWorld(v); return v; }
const FRONT={sluice:[0,-3.4]};
const frontOf=L=>FRONT[L.kind]||[0,3.6];
function locTarget(id){ const L=LOC[id]; if(id==='qinfang') return new V3(0,0,player&&player.position.z<0?-2:2);
  if(!W.locGroups[id]){ const o=W.regionOrigin(L.region); return new V3(o.x+L.pos[0],0,L.pos[1]); }
  if(W.isCompound(L)) return localToWorld(id,0,5.8); const f=frontOf(L); return localToWorld(id,f[0],f[1]); }
function gateOut(locId){ const L=LOC[locId]; if(!L||L.kind==='pavilion') return null; if(W.isCompound(L)) return localToWorld(locId,0,11.5); const f=frontOf(L); return localToWorld(locId,f[0],f[1]+(f[1]>0?2.4:-2.4)); }
function ringAngle(v){ return Math.atan2(v.z,v.x); }
function ringPoint(a){ return new V3(Math.cos(a)*RING,0,Math.sin(a)*RING); }
function arc(a0,a1){ let d=a1-a0; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; const pts=[]; const n=Math.ceil(Math.abs(d)/.35); for(let i=1;i<=n;i++) pts.push(ringPoint(a0+d*i/n)); return pts; }
function compoundAt(p,r=S.region){ for(const L of locsIn(r)){ if(!W.isCompound(L)) continue; const g=W.locGroups[L.id]; if(!g) continue; const v=p.clone(); g.worldToLocal(v); const hw=(W.compoundW(L)+9)/2; if(Math.abs(v.x)<hw&&v.z>-8.5&&v.z<8.4) return L.id; }
  if(r==='garden'&&Math.abs(p.x)<200&&Math.hypot(p.x,p.z)<10.6) return 'qinfang'; return null; }
function planGarden(from,to){
  const pts=[]; const rf=compoundAt(from,'garden'), rt=compoundAt(to,'garden');
  if(rf===rt && rf) return [to.clone()];
  let a;
  if(rf && rf!=='qinfang'){ pts.push(localToWorld(rf,0,6.5),localToWorld(rf,0,9.4),gateOut(rf)); a=ringAngle(gateOut(rf)); pts.push(ringPoint(a)); }
  else if(rf==='qinfang'){ const s=from.z>=0?1:-1; pts.push(new V3(0,0,s*3),new V3(0,0,s*11.2)); a=s>0?Math.PI/2:-Math.PI/2; pts.push(ringPoint(a)); }
  else { a=ringAngle(from); pts.push(ringPoint(a)); }
  let b;
  if(rt && rt!=='qinfang'){ b=ringAngle(gateOut(rt)); pts.push(...arc(a,b), gateOut(rt), localToWorld(rt,0,9.4), localToWorld(rt,0,6.5)); }
  else if(rt==='qinfang'){ const s=to.z>=0?1:-1; b=s>0?Math.PI/2:-Math.PI/2; pts.push(...arc(a,b), new V3(0,0,s*11.2), new V3(0,0,s*3)); }
  else { b=ringAngle(to); pts.push(...arc(a,b)); }
  pts.push(to.clone()); return pts;
}
function planRegion(from,to){ const r=S.region, ox=W.regionOrigin(r).x; const rf=compoundAt(from,r), rt=compoundAt(to,r);
  if(rf===rt&&rf) return [to.clone()];
  const pts=[]; if(rf) pts.push(localToWorld(rf,0,6.5),localToWorld(rf,0,9.4),gateOut(rf));
  const a=pts.length?pts[pts.length-1]:from, b=rt?gateOut(rt):to;
  if(Math.abs(a.x-b.x)>6){ pts.push(new V3(ox,0,a.z),new V3(ox,0,b.z)); }
  if(rt) pts.push(gateOut(rt),localToWorld(rt,0,9.4),localToWorld(rt,0,6.5));
  pts.push(to.clone()); return pts; }
const planPath=(f,t)=>S.region==='garden'?planGarden(f,t):planRegion(f,t);

// ================= 门楼与地域连通 =================
function portalsData(r){ if(r==='garden') return GARDEN_SPOTS.filter(g=>g.portal).map(g=>({to:g.portal,at:g.pos,label:`${g.name} · 往${REGIONS[g.portal].name}`,spot:g.id}));
  return (REGION_DEFS[r]?.portals||[]).map(p=>({to:p.to,at:p.at,inward:p.inward,label:p.label})); }
function portalWorld(r,p){ if(p.spot&&W.locGroups[p.spot]) return localToWorld(p.spot,0,0); const o=W.regionOrigin(r); return new V3(o.x+p.at[0],0,p.at[1]); }
function landingFor(r,from){ const p=portalsData(r).find(q=>q.to===from); if(!p) return null; if(p.spot) return localToWorld(p.spot,0,4.5); const o=W.regionOrigin(r); return new V3(o.x+p.at[0]+p.inward[0]*4.5,0,p.at[1]+p.inward[1]*4.5); }
function nextHop(from,to){ if(from===to) return null; const q=[from], prev={[from]:null};
  while(q.length){ const r=q.shift(); for(const p of portalsData(r)){ if(p.to==='taixu'||p.to in prev) continue; prev[p.to]=r; if(p.to===to){ let c=to; while(prev[c]!==from) c=prev[c]; return c; } q.push(p.to); } } return null; }
function nearPortal(){ for(const p of portalsData(S.region)){ const w=portalWorld(S.region,p); if(Math.hypot(w.x-player.position.x,w.z-player.position.z)<3.8) return p; } return null; }

// ================= 迷雾（舆图随脚步揭开） =================
const FOGN=40, FOG={}, FOGC={};
const regionExtent=r=>r==='garden'?52:Math.max(...REGION_DEFS[r].bounds)+6;
function fogArr(r){ return FOG[r]||(FOG[r]=new Uint8Array(FOGN*FOGN)); }
function fogCell(r,lx,lz){ const E=regionExtent(r); return [Math.floor((lx+E)/(2*E)*FOGN),Math.floor((lz+E)/(2*E)*FOGN)]; }
function reveal(r,lx,lz,rad=11){ const a=fogArr(r), E=regionExtent(r), cs=2*E/FOGN, n=Math.ceil(rad/cs); const [ci,cj]=fogCell(r,lx,lz); let ch=false;
  for(let j=cj-n;j<=cj+n;j++) for(let i=ci-n;i<=ci+n;i++){ if(i<0||j<0||i>=FOGN||j>=FOGN) continue; const k=j*FOGN+i; if(a[k]) continue; if(Math.hypot(-E+(i+.5)*cs-lx,-E+(j+.5)*cs-lz)<=rad){ a[k]=1; ch=true; } }
  if(ch) FOGC[r]=null; }
function fogKnown(r,lx,lz){ const [i,j]=fogCell(r,lx,lz); if(i<0||j<0||i>=FOGN||j>=FOGN) return true; return !!fogArr(r)[j*FOGN+i]; }
function fogCanvas(r){ if(FOGC[r]) return FOGC[r]; const c=document.createElement('canvas'); c.width=c.height=FOGN; const x=c.getContext('2d'); const im=x.createImageData(FOGN,FOGN), a=fogArr(r); const col=r==='taixu'?[52,36,78]:[222,208,178];
  for(let k=0;k<a.length;k++){ im.data[k*4]=col[0]; im.data[k*4+1]=col[1]; im.data[k*4+2]=col[2]; im.data[k*4+3]=a[k]?0:238; } x.putImageData(im,0,0); return FOGC[r]=c; }
const packFog=a=>{ let s=''; for(let k=0;k<a.length;k+=8){ let b=0; for(let q=0;q<8;q++) if(a[k+q]) b|=1<<q; s+=String.fromCharCode(b); } return btoa(s); };
const unpackFog=s=>{ const a=new Uint8Array(FOGN*FOGN); try{ const t=atob(s); for(let k=0;k<t.length;k++){ const b=t.charCodeAt(k); for(let q=0;q<8;q++) if(b&(1<<q)) a[k*8+q]=1; } }catch{} return a; };
const localOf=p=>({x:p.x-W.regionOrigin(S.region).x,z:p.z});

// ================= NPC 日程 =================
function visible(id){ const C=CHARS[id]; if(C.until && S.done[C.until]) return false; if(id==='liulaolao' && S.day<6) return false; if(C.needFlag&&!S.flags[C.needFlag]) return false; return true; }
function placeFor(id){ const C=CHARS[id]; const h=(S.day*7+id.length*3)%5; if(S.slot===1 && C.roam.length && h<3) return C.roam[(S.day+id.length)%C.roam.length]; if(S.slot===2 && C.roam.length && h===4) return C.roam[0]; return C.loc; }
function spotsAt(locId,id){ const k=Object.keys(CHARS).indexOf(id); const L=LOC[locId];
  if(locId==='qinfang'){ const s=k%2?1:-1; return [new V3(1.5*s,0,s*12.6+(k%3)),new V3(-1.8*s,0,s*13.2),new V3(2.8*s,0,s*12)]; }
  if(!W.isCompound(L)){ const [fx,fz]=frontOf(L), s=fz>0?1:-1; return [localToWorld(locId,fx+(k%2?1.7:-1.7),fz+s*(.6+(k%3)*.5)),localToWorld(locId,fx+(k%2?.8:-.8),fz+s*1.6),localToWorld(locId,fx+(k%2?2.6:-2.6),fz+s*.3)]; }
  const own=CHARS[id].loc===locId; if(own) return [localToWorld(locId,-2.6+(k%2)*5.2,5.6),localToWorld(locId,(k%2?2:-2)*1.4,6.6),localToWorld(locId,(k%2?1:-1)*3.4,4.9)];
  return [localToWorld(locId,(k%2?2.4:-2.4),12.4),localToWorld(locId,(k%2?3.6:-3.6),13.4)]; }
function placeNPCs(instant){
  for(const [id,n] of Object.entries(npcs)){ const place=placeFor(id); const pr=visible(id)&&regionOfLoc(place)===S.region&&!!W.locGroups[place]; const was=n.present; n.present=pr; n.g.visible=pr;
    if(!pr){ n.place=null; n.path=[]; continue; }
    if(place===n.place && !instant && was) continue; n.place=place; n.spots=spotsAt(place,id);
    if(instant||!was){ n.g.position.copy(n.spots[0]); n.path=[]; } else n.path=planPath(n.g.position,n.spots[0]); }
}
function updateNPCs(dt,t){
  for(const n of Object.values(npcs)){ if(!n.present) continue; let sp=0;
    if(n.talking){ W.animateCharacter(n.g,dt,t,0); continue; }
    if(n.path.length){ const tg=n.path[0]; const d=new V3(tg.x-n.g.position.x,0,tg.z-n.g.position.z); const L=d.length();
      if(L<.25) n.path.shift(); else { sp=1.7; d.multiplyScalar(Math.min(L,sp*dt)/L); n.g.position.add(d); turnTo(n.g,Math.atan2(d.x,d.z),dt*6); } }
    else { n.wait-=dt; if(n.wait<0){ n.wait=R(4,10); const s=n.spots[Math.floor(Math.random()*n.spots.length)]; n.path=[s.clone().add(new V3(R(-.4,.4),0,R(-.4,.4)))]; } }
    n.g.position.y=W.groundHeight(n.g.position.x,n.g.position.z); n.speed+=(sp-n.speed)*Math.min(1,dt*8); W.animateCharacter(n.g,dt,t,n.speed); }
}
function turnTo(o,yaw,k){ let d=yaw-o.rotation.y; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; o.rotation.y+=d*Math.min(1,k); }

// ================= 可拾取之物 =================
const pickObj={};
function syncPickups(){ for(const it of ITEMS){ const has=pickObj[it.id];
  if(S.items[it.id]){ if(has){ W.removePickup(has); delete pickObj[it.id]; } continue; }
  if(!has && W.regionBuilt(it.region)){ const o=W.regionOrigin(it.region); pickObj[it.id]=W.addPickup(new V3(o.x+it.pos[0],0,it.pos[1]),it.region==='taixu'?0xc8a0ff:0x7fe0b0); } } }
function collect(it){ S.items[it.id]=1; syncPickups(); sfx('good'); applyEff(it.eff); if(it.lore) unlockLore(it.lore);
  toast(`拾得「${it.name}」　${it.text}`,5200); hint('pickup'); autosave(); }
function unlockLore(k){ if(!LORE[k]||S.lore[k]) return; S.lore[k]=1; setTimeout(()=>toast(`📖 百科新增：${LORE[k].title}`,3000),1800); }

// ================= 镜头与操控 =================
const cam={ yaw:-0.6, pitch:.42, dist:15, tDist:15, focus:new V3(), cine:null };
const keys={}; let playerPath=[], marker;
addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT') return; const k=e.key.toLowerCase(); keys[k]=true;
  if(isPlay()){ if(k==='e'){ if(nearest) openTalk(nearest); else { const p=nearPortal(); if(p) usePortal(p); } } if(k==='m') openPage('map'); if(k==='j') openPage('journal'); if(k==='h') openPage('help'); }
  else if(mode==='dialog' && (k===' '||k==='enter')){ const b=$('#dlgChoices button.next'); if(b){ e.preventDefault(); b.click(); } }
  if(k==='escape' && mode==='modal') closeModal(); });
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
addEventListener('blur',()=>{ for(const k in keys) keys[k]=false; });
const ray=new THREE.Raycaster(), mouse=new THREE.Vector2(); const pointers=new Map(); let pinch0=0, dragMoved=false, downPos=null;
W.canvas.addEventListener('pointerdown',e=>{ pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); downPos={x:e.clientX,y:e.clientY}; dragMoved=false; if(pointers.size===2){ const [a,b]=[...pointers.values()]; pinch0=Math.hypot(a.x-b.x,a.y-b.y); } W.canvas.setPointerCapture(e.pointerId); });
W.canvas.addEventListener('pointermove',e=>{ const p=pointers.get(e.pointerId); if(!p) return; const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
  if(Math.hypot(e.clientX-downPos.x,e.clientY-downPos.y)>6) dragMoved=true;
  if(pointers.size===2){ const [a,b]=[...pointers.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); cam.tDist=THREE.MathUtils.clamp(cam.tDist*pinch0/d,7,30); pinch0=d; T.rot+=.05; return; }
  if(dragMoved && (isPlay()||mode==='dialog')){ cam.yaw-=dx*.006; cam.pitch=THREE.MathUtils.clamp(cam.pitch+dy*.004,.12,1.2); T.rot+=Math.abs(dx*.006)+Math.abs(dy*.004); } });
W.canvas.addEventListener('pointerup',e=>{ pointers.delete(e.pointerId); if(dragMoved||!isPlay()) return; tapAt(e.clientX,e.clientY); });
W.canvas.addEventListener('pointercancel',e=>pointers.delete(e.pointerId));
W.canvas.addEventListener('wheel',e=>{ cam.tDist=THREE.MathUtils.clamp(cam.tDist+e.deltaY*.012,7,30); T.rot+=.12; },{passive:true});
function tapAt(x,y){
  mouse.set(x/innerWidth*2-1,-y/innerHeight*2+1); ray.setFromCamera(mouse,W.camera);
  const vis=Object.values(npcs).filter(n=>n.present&&n.g.visible).map(n=>n.g); const hits=ray.intersectObjects(vis,true);
  if(hits.length){ let o=hits[0].object; const n=Object.values(npcs).find(n=>{ let p=o; while(p){ if(p===n.g) return true; p=p.parent; } return false; });
    if(n){ if(player.position.distanceTo(n.g.position)<3.5) openTalk(n.id); else { walkTo(n.g.position.clone()); pendingTalk=n.id; } return; } }
  const g=ray.intersectObject(W.getGround()); if(g.length){ walkTo(g[0].point); }
}
let pendingTalk=null;
function walkTo(p){ pendingTalk=null; p.y=0; playerPath=planPath(player.position.clone(),p); showMarker(p); }
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
function applyEff(eff){ let good=0; for(const [k,v] of Object.entries(eff||{})){ good+=v; if(k in STAT_NAMES) S[k]=clamp(S[k]+v); else if(k in S.aff){ const o=S.aff[k]; S.aff[k]=clamp(S.aff[k]+v); if([35,50,60].some(t=>o<t&&S.aff[k]>=t)) setTimeout(()=>hint('aff'),600); } } renderStats(); sfx(good>=0?'good':'bad'); }
const clamp=v=>Math.max(0,Math.min(100,v));
function renderStats(){
  $('#dayName').textContent=`第${CN[Math.min(S.day,MAX_DAY)]}回`; $('#timeName').textContent=`${TIMES[S.slot]}时 · 余${3-S.slot}时辰 · ${REGIONS[S.region].name}`; $('#clockSeal').textContent=TIMES[S.slot];
  const bar=(n,v,c='')=>`<div class="row"><span>${n}</span><span>${v}</span></div><div class="bar ${c}"><i style="width:${v}%"></i></div>`;
  $('#stats').innerHTML=bar('才情',S.talent)+bar('家运',S.fortune,'jade')+bar('禅心',S.zen,'zen')+'<h4>情　缘</h4>'+[['黛玉','daiyu'],['宝钗','baochai'],['湘云','xiangyun'],['探春','tanchun']].map(([n,k])=>bar(n,S.aff[k])).join('');
  trT=1; }
function pendingEvents(){ return EVENTS.filter(e=>!S.done[e.id] && S.day>=e.day && (!e.needChar||visible(e.needChar)) && (!e.needFlag||S.flags[e.needFlag])); }
function fade(text,hold=900){ if(window.__fast) return Promise.resolve(); return new Promise(r=>{ const f=$('#fade'); f.textContent=text||''; f.classList.add('on'); setTimeout(()=>{ r(); setTimeout(()=>f.classList.remove('on'),250); },900+hold); }); }

// ================= 当前目标 / 任务指引 =================
let quest=null, questW=null, trT=1;
function computeQuest(){
  if(S.tut?.on){ const st=TUT_STEPS[S.tut.step]; const t=st?.target?.(); if(t) return t; }
  const ev=pendingEvents()[0]; if(ev){ const L=LOC[ev.loc]; return {rid:L.region,loc:ev.loc,label:`${ev.chap}：去${L.name}`,sub:ev.title.split(' · ')[0],ev:ev.id}; }
  for(const r of ['rongfu','ningfu','street','suburb']) if(!S.visited[r]) return {rid:r,label:`去${REGIONS[r].name}走走`,sub:REGIONS[r].sub+'——那里有新的人物和故事'};
  const it=ITEMS.find(i=>!S.items[i.id]&&i.region===S.region); if(it) return {rid:it.region,pos:it.pos,label:`拾取「${it.name}」`,sub:'地上发光的小物件'};
  const nx=EVENTS.filter(e=>!S.done[e.id]&&e.day>S.day)[0];
  return {rid:null,label:nx?'闲游拜访，增进情缘':'终卷将至',sub:nx?`第${CN[nx.day]}回将有大事（${nx.chap}）`:`第${CN[MAX_DAY]}回暮时合卷`}; }
function questWorld(q){ if(!q||!q.rid) return null;
  if(q.rid!==S.region){ const hop=nextHop(S.region,q.rid); if(!hop) return null; const p=portalsData(S.region).find(p=>p.to===hop); return {pos:portalWorld(S.region,p),via:p}; }
  if(q.npc){ const n=npcs[q.npc]; return n.present?{pos:n.g.position.clone()}:null; }
  if(q.loc) return W.locGroups[q.loc]?{pos:locTarget(q.loc)}:null;
  if(q.pos){ const o=W.regionOrigin(q.rid); return {pos:new V3(o.x+q.pos[0],0,q.pos[1])}; }
  return null; }
function renderTracker(){ quest=computeQuest(); questW=questWorld(quest); W.setBeacon(isPlay()||mode==='dialog'||mode==='modal'?questW?.pos||null:null);
  let h=`<div class="tk-h">当前目标${S.tut?.on?' · 引导':''}</div><div class="tk-t">◆ ${quest.label}</div>`;
  if(questW?.via) h+=`<div class="tk-s">先往「${questW.via.label}」</div>`;
  else if(quest.rid==='taixu'&&S.region!=='taixu') h+=`<div class="tk-s">暮时打开地图，可"入梦"太虚幻境</div>`;
  else if(quest.sub) h+=`<div class="tk-s">${quest.sub}</div>`;
  if(questW&&player){ const d=new V3().subVectors(questW.pos,player.position); d.y=0; const D=d.length(); const fw=new V3(-Math.sin(cam.yaw),0,-Math.cos(cam.yaw)), rt=new V3(-fw.z,0,fw.x); const deg=Math.atan2(d.dot(rt),d.dot(fw))*180/Math.PI;
    h+=`<div class="tk-d"><i class="tk-arrow" style="transform:rotate(${deg.toFixed(0)}deg)">↑</i>${D<3?'就在这里':`约 ${Math.round(D)} 步`}</div>`; }
  const el=$('#tracker'); if(el.dataset.h!==h){ el.dataset.h=h; el.innerHTML=h; } }
function updateQArrow(){ const el=$('#qArrow'); if(!isPlay()||!questW){ el.classList.add('hidden'); return; }
  const p=questW.pos.clone().setY(2.5).project(W.camera); let x=p.x, y=p.y; const behind=p.z>1; if(behind){ x=-x; y=-y; if(Math.hypot(x,y)<.2) y=-1; }
  if(!behind&&Math.abs(x)<.9&&Math.abs(y)<.85){ el.classList.add('hidden'); return; }
  const m=Math.max(Math.abs(x)/.88,Math.abs(y)/.78); x/=m; y/=m;
  el.style.left=((x+1)/2*innerWidth)+'px'; el.style.top=((1-y)/2*innerHeight)+'px'; el.style.transform=`translate(-50%,-50%) rotate(${Math.atan2(x,y)}rad)`; el.classList.remove('hidden'); }

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
  const C=CHARS[id]; if(!C||!npcs[id].present) return;
  if(S.tut?.on && TUT_STEPS[S.tut.step]?.id==='talk' && id==='xiren') return tutTalk();
  playerPath=[]; pendingTalk=null; faceEachOther(id); sfx('open'); S.met[id]=1;
  showDialog(); setSpeaker(C.name,`${C.title} · 好感 ${S.aff[id]}`,id);
  const g=C.greet[tier(id)]; typeText(esc(g[(S.day+S.slot)%g.length]));
  C.talks.forEach((t,i)=>{ const key=id+i, used=S.used[key]; const lack=t.need&&Object.entries(t.need).some(([k,v])=>(S.aff[k]??S[k])<v);
    choice(`${used?'✓':'◆'} ${t.q}<span class="eff" style="display:inline;margin-left:8px">${used?'已叙过':lack?'（情缘未到）':'耗一时辰'}</span>`,()=>{
      S.used[key]=1; S.log.push(`第${CN[S.day]}回 · ${C.name}：${t.q}`);
      playLines(t.a,{defName:C.name,defTitle:C.title,defPid:id},()=>{ applyEff(t.eff); if(t.lore) unlockLore(t.lore); if(t.poem&&!S.poems.includes(t.poem)) { S.poems.push(t.poem); toast(`收录《${POEMS[t.poem].title}》`); } $('#dlgText').insertAdjacentHTML('beforeend',effHTML(t.eff)); choice('（告辞）',async()=>{ closeDialog(); await spendSlot(); }); });
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
    const ev=pendingEvents()[0]; toast(ev?`听说${LOC[ev.loc].name}那边似有动静……`:'又是新的一日。一切如常。',3500); }
  else { mode='cine'; await fade(TIMES[S.slot]==='暮'?'暮　色':'日　午',100); W.applySky(S.slot,S.day); placeNPCs(false); mode='play'; if(S.slot===2) hint('night'); }
  setMood(S.slot===2||S.region==='taixu'?'night':'day'); renderStats(); autosave(); }

// ================= 剧情事件（过场） =================
function startCine(locId){ $('#cine').classList.remove('hidden'); const L=LOC[locId];
  if(locId==='qinfang'){ cam.cine={orbit:true,center:new V3(0,2,0),r:16,t0:performance.now(),a0:0}; return; }
  const g=W.locGroups[locId]; const c=g.getWorldPosition(new V3()); const f=new V3(0,0,1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())); f.y=0; f.normalize();
  const comp=W.isCompound(L); cam.cine={orbit:true,center:c.clone().addScaledVector(f,comp?6:2.5).setY(2.2),r:comp?17:13,t0:performance.now(),a0:Math.atan2(f.x,f.z)}; }
function endCine(){ $('#cine').classList.add('hidden'); $('#chapterCard').classList.remove('show'); }
async function runEvent(ev){
  mode='cine'; playerPath=[]; startCine(ev.loc); if(ev.loc==='qinfang') T.follow=1; setMood(ev.mood==='night'||ev.mood==='snow'?'night':'sad'); if(ev.mood==='night'&&S.slot!==2) W.applySky(2,S.day);
  $('#chapNo').textContent=ev.chap; $('#chapTitle').textContent=ev.title; sfx('bell'); await wait(250); $('#chapterCard').classList.add('show');
  await wait(window.__fast?0:2600); $('#chapterCard').classList.remove('show');
  hint(ev.quiz?'quiz':'event');
  playLines(ev.text,{defName:ev.chap,defTitle:ev.title,seal:'红'},()=>{ if(ev.quiz) return runQuiz(ev);
    ev.choices.forEach(c=>{ const lack=c.need&&Object.entries(c.need).some(([k,v])=>(S.aff[k]??S[k])<v);
      choice('◆ '+c.t+(lack?'<span class="eff" style="display:inline"> （情缘未到）</span>':''),()=>{
        S.done[ev.id]=1; S.log.push(`${ev.chap} ${ev.title.split(' · ')[0]}：${c.t}`); if(c.flag) S.flags[c.flag]=1; if(c.lore) unlockLore(c.lore); if(ev.lore) unlockLore(ev.lore);
        playLines(c.r,{defName:ev.chap,defTitle:ev.title,seal:'红'},()=>{ applyEff(c.eff); let extra=''; if(c.poem&&!S.poems.includes(c.poem)){ S.poems.push(c.poem); extra=`<div class="eff">📜 收录《${POEMS[c.poem].title}》</div>`; }
          if(c.flag==='verdicts') extra+='<div class="eff">📖 簿册「金陵判词」已全部揭开</div>';
          $('#dlgText').insertAdjacentHTML('beforeend',effHTML(c.eff)+extra); choice('（合卷）',async()=>{ closeDialog(); await afterEvent(ev); }); });
      },{disabled:lack}); }); });
}
async function afterEvent(ev){
  if(ev.after==='taixu'){ S.flags.taixu=1; unlockLore('taixu'); await travel('taixu',{dream:true}); return; }
  if(ev.after==='wake'){ await travel('garden',{land:'yihong'}); toast('……"可卿救我！"你一身冷汗醒来，袭人正替你掖被角。',5000); await spendSlot(); return; }
  await spendSlot(); }
function runQuiz(ev){ const qs=[...QUIZ].sort(()=>Math.random()-.5).slice(0,5); let n=0,score=0;
  const ask=()=>{ showDialog(); setSpeaker('李纨','稻香老农 · 掌坛','liwan');
    if(n>=qs.length){ const eff={talent:score*3,tanchun:5,daiyu:score>=4?8:3,baochai:score>=3?6:2}; S.done[ev.id]=1; ['haitang','haitang2','liuxu'].forEach(p=>{ if(!S.poems.includes(p)) S.poems.push(p); }); S.log.push(`${ev.chap} 海棠诗社：接句 ${score}/5`);
      const v=score>=5?'"怡红公子此番压尽群芳！竟是我们都小看了你。"':score>=3?'"若论风流别致，自是这首；若论含蓄浑厚，终让蘅稿。怡红公子亦可。"':'"怡红公子是压尾，你服不服？"\n你｜"我的那首原不好了，这评的最公。"';
      typeText(esc(`接句 ${score}/5。\n${v}`)); applyEff(eff); $('#dlgText').insertAdjacentHTML('beforeend',effHTML(eff)+'<div class="eff">📜 收录《咏白海棠》二首、《临江仙·柳絮》</div>'); choice('（散社）',async()=>{ closeDialog(); await spendSlot(); }); return; }
    const q=qs[n]; $('#dlgTitle').textContent=`第 ${n+1}/5 题 · 已得 ${score}`; typeText(esc(q.q));
    q.o.map((o,i)=>[o,i]).sort(()=>Math.random()-.5).forEach(([o,i])=>choice(o,()=>{ const ok=i===q.a; if(ok){score++; sfx('good');} else sfx('bad'); toast(ok?'✔ 妙！':'✘ 原句：'+q.o[q.a]); n++; ask(); })); };
  ask(); }


// ================= 地域往来 =================
let traveling=false;
function usePortal(p){ if(p.to==='taixu') return; travel(p.to); }
async function travel(to,{land,dream,then}={}){
  if(traveling) return; if(to===S.region&&!land) return; traveling=true; const from=S.region; mode='cine'; playerPath=[]; pendingTalk=null; cam.cine=null; $('#talkBtn').classList.add('hidden');
  const RG=REGIONS[to], tv=$('#travel'); $('#tvName').textContent=RG.name; $('#tvSub').textContent=dream?'恍恍惚惚，似梦非梦……':RG.sub; $('#tvPoem').textContent=RG.poem; $('#tvFill').style.width='5%';
  tv.classList.remove('hidden'); tv.classList.toggle('dream',to==='taixu'); await nextFrame(); tv.classList.add('on'); sfx('open');
  await wait(window.__fast?0:700);
  try{ if(!W.regionBuilt(to)){ await W.buildRegion(REGION_DEFS[to],f=>$('#tvFill').style.width=Math.round(5+f*90)+'%'); syncPickups(); } }
  catch(e){ console.error(e); traveling=false; tv.classList.remove('on'); tv.classList.add('hidden'); mode='play'; toast('此路暂不通：'+e.message); return; }
  $('#tvFill').style.width='100%';
  W.setRegion(to); S.region=to;
  const p=land==='yihong'?localToWorld('yihong',0,4.4):(landingFor(to,from)||(to==='garden'?localToWorld('yihong',0,4.4):landingFor(to,portalsData(to)[0]?.to)||W.regionOrigin(to)));
  player.position.copy(p); const pt=portalsData(to).find(q=>q.to===from); if(pt&&pt.inward) player.rotation.y=Math.atan2(pt.inward[0],pt.inward[1]); else if(to!=='garden'&&portalsData(to)[0]?.inward){ const iw=portalsData(to)[0].inward; player.rotation.y=Math.atan2(iw[0],iw[1]); }
  placeNPCs(true); W.applySky(S.slot,S.day); setMood(S.slot===2||to==='taixu'?'night':'day'); snapCam(); const lo=localOf(p); reveal(to,lo.x,lo.z,14);
  const first=!S.visited[to]; S.visited[to]=1; curLoc=null;
  await wait(window.__fast?0:500); tv.classList.remove('on'); setTimeout(()=>tv.classList.add('hidden'),700);
  mode='play'; traveling=false; renderStats(); renderTracker(); autosave();
  const el=$('#locName'); el.textContent=RG.name; el.style.opacity=1; clearTimeout(el.h); el.h=setTimeout(()=>el.style.opacity=0,2600);
  if(first) toast(RG.desc,6000); hint(to==='taixu'?'taixu':'travel'); then?.(); }
function snapCam(){ cam.yaw=player.rotation.y+Math.PI; cam.pitch=.5; cam.focus.copy(player.position).setY(1.6); W.camera.position.set(cam.focus.x+Math.sin(cam.yaw)*12,cam.focus.y+7,cam.focus.z+Math.cos(cam.yaw)*12); }
async function fastTravel(rid,locId){ const go=()=>{ if(locId){ walkTo(locTarget(locId)); toast(`往${LOC[locId].name}去`); } };
  if(rid===S.region){ go(); return; }
  if(rid==='taixu'){ if(!S.flags.taixu) return toast('太虚幻境，须得机缘方能梦到。'); if(S.slot!==2) return toast('须到暮时，方能入梦。'); }
  else if(!S.visited[rid]) return toast(`尚未去过${REGIONS[rid].name}，须先走到门楼过去。`);
  await travel(rid,{dream:rid==='taixu',then:go}); }

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
const KEYS=isTouch?'左下摇杆行走 / 点地前往 · 拖动转视角 · 双指缩放':'WASD 行走 · 点地前往 · 拖动/Q R 转视角 · 滚轮缩放 · E 交谈/过门 · M 地图 · J 簿册 · H 玩法';
const mapView={rid:'garden',zoom:1,cx:0,cz:0};
const PAGES={
  about:()=>`<h2>卷　首</h2><p>你是<b>贾宝玉</b>。自青埂峰下一梦入世，将在<b>十五回</b>光阴里，往来于<b>大观园、荣国府、宁国府、京城街市、城外</b>五处，偶尔还会梦入<b>太虚幻境</b>。</p>
  <div class="card">🧭 第一次玩？开卷后袭人会一步一步教你（可在设置里重来）。不知道做什么时，看右上角的<b>「当前目标」</b>，跟着地上的<b>金色光柱</b>走。</div>
  <div class="card">🎭 <b>六种结局</b>：木石前盟、金玉良缘、兰桂齐芳、因麒麟伏白首双星、悬崖撒手、白茫茫大地真干净——由情缘、才情、家运、禅心共同决定。</div>
  <div class="card">🤖 <b>大模型对话（可选）</b>：在「设置」里填入兼容 OpenAI 的接口，人物即由大模型扮演；不填则用内置离线对话。</div>
  <div style="text-align:center"><button class="btn" data-goto="help">详细玩法说明 »</button></div>`,
  help:()=>HELP_HTML+`<div class="card"><b>操作</b><br>${KEYS}</div>`,
  journal:(tab='aff')=>{ const tabs=`<div class="tabs">${[['aff','人物'],['verdict','金陵判词'],['codex','百科'],['poems','诗集'],['log','回目'],['end','结局']].map(([k,n])=>`<button class="${k===tab?'on':''}" data-tab="${k}">${n}</button>`).join('')}</div>`; let body='';
    if(tab==='aff') body=`<div class="card">才情 ${S.talent}　·　家运 ${S.fortune}　·　禅心 ${S.zen}</div><div class="cardgrid">`+Object.entries(CHARS).filter(([k])=>S.met[k]||(!(k in NEW_CHARS)&&visible(k))).map(([k,C])=>`<div class="card char"><img src="${portraits[k]}"><div><b>${C.name}</b><br><small>${C.title} · ${REGIONS[regionOfLoc(C.loc)].name}${LOC[C.loc].name}</small><br>好感 ${S.aff[k]} · ${({cold:'疏',warm:'亲',close:'知心'})[tier(k)]}</div></div>`).join('')+'</div><p class="tiny" style="color:#6a4a2a">园外的人物，见过之后才会记在这里。</p>';
    if(tab==='verdict'){ const all=!!S.flags.verdicts; body=`<p class="tiny" style="color:#6a4a2a">${all?'你在薄命司中已见过全部册子。':'好感达 50 可揭开她的判词；梦游太虚幻境、翻开薄命司的册子，则可一并看见。'}</p>`+Object.entries(CHARS).filter(([,C])=>C.verdict).map(([k,C])=>all||S.aff[k]>=50?`<div class="card"><b>${C.name}</b><br>${C.verdict}</div>`:`<div class="card locked">${C.name}　—— 册页尚封（${S.aff[k]}/50）</div>`).join('')+EXTRA_VERDICTS.map(v=>all?`<div class="card"><b>${v.name}</b><br>${v.text}</div>`:`<div class="card locked">${v.name}　—— 册页尚封</div>`).join(''); }
    if(tab==='codex') body=codexHTML();
    if(tab==='poems') body=S.poems.map(p=>`<div class="card"><b>《${POEMS[p].title}》</b>　${POEMS[p].author}<div style="white-space:pre-wrap;margin-top:4px">${POEMS[p].text}</div></div>`).join('')+`<p class="tiny" style="color:#6a4a2a">已收录 ${S.poems.length}/${Object.keys(POEMS).length}</p>`;
    if(tab==='log') body=(S.log.length?S.log.map(l=>`<div class="card">${l}</div>`).join(''):'<p>尚无记载。</p>')+'<h3>未了之事</h3>'+EVENTS.filter(e=>!S.done[e.id]).map(e=>`<div class="card locked">${e.chap} ${e.title.split(' · ')[0]}　—— 第${CN[e.day]}回后 · ${REGIONS[regionOfLoc(e.loc)].name}${LOC[e.loc].name}</div>`).join('');
    if(tab==='end'){ const seen=JSON.parse(localStorage.getItem('honglou_endings')||'[]'); body=Object.entries(ENDINGS).map(([k,e])=>`<div class="card ${seen.includes(k)?'':'locked'}"><b>${e.title}</b> ${seen.includes(k)?'· 已得':''}<br><small>${ENDING_HINTS[k]}</small></div>`).join(''); }
    return `<h2>簿　册</h2>${tabs}${body}`; },
  save:()=>{ const has=localStorage.getItem(SAVE_KEY+'_manual'); return `<h2>存　档</h2><p>每过一个时辰、每次换地方都会自动存档（浏览器本地）。</p><div class="menu" style="margin:0 auto"><button id="doSave">手动存档</button><button id="doLoad" ${has?'':'disabled'}>读取手动存档</button><button id="doExport">导出存档</button><button id="doImport">导入存档</button><button id="doReset">重新开卷</button></div>`; },
  settings:()=>{ const c=aiCfg(), v=getVol(); const inGame=$('#title').classList.contains('hidden'); return `<h2>设　置</h2>
    <h3>新手引导</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="tutReplay">${inGame?'重新开始新手引导':'开卷时显示新手引导'}</button>${inGame&&S.tut?.on?'<button class="btn" id="tutSkip2">跳过引导</button>':''}<button class="btn" id="hintReset">重新显示所有提示</button><button class="btn" data-goto="help">玩法说明</button></div>
    <p class="tiny" style="color:#6a4a2a">${localStorage.getItem(TUT_OFF)?'当前：新开卷时不显示引导。':'当前：新开卷时会由袭人带你走一遍。'}</p>
    <h3>声　音</h3><label>琴曲 <input type="range" min="0" max="1" step=".05" value="${v.music}" data-vol="music"></label><label>环境（风、鸟、虫） <input type="range" min="0" max="1" step=".05" value="${v.amb}" data-vol="amb"></label><label>音效 <input type="range" min="0" max="1" step=".05" value="${v.sfx}" data-vol="sfx"></label>
    <h3>画　质</h3><label>画质档位 <select id="qualitySel">${[["auto","自动"],["high","高（环境光遮蔽+倒影）"],["medium","中"],["low","低（手机）"]].map(([k,n])=>`<option value="${k}" ${(localStorage.getItem("honglou_quality")||"auto")===k?"selected":""}>${n}</option>`).join("")}</select></label><p class="hint" style="font-size:12px;opacity:.7">当前：${W.R.q.name}档${W.R.fps?`，约 ${W.R.fps.toFixed(0)} 帧`:""}。切换"倒影/草量"需重新载入页面。</p>
    <h3>大模型对话（可选）</h3><p class="tiny" style="color:#6a4a2a">填写任意兼容 OpenAI Chat Completions 的服务（OpenAI、DeepSeek、xAI、Moonshot 等）。密钥只保存在你的浏览器里，由浏览器直接发给该服务。留空则用离线对话。</p>
    <label>API 地址</label><input class="f" id="cfgBase" value="${c.base||''}" placeholder="https://api.deepseek.com/v1"><label>模型名</label><input class="f" id="cfgModel" value="${c.model||''}" placeholder="deepseek-chat"><label>API Key</label><input class="f" id="cfgKey" type="password" value="${c.key||''}" placeholder="sk-...">
    <div style="margin-top:12px;display:flex;gap:8px"><button class="btn" id="cfgSave">保存</button><button class="btn" id="cfgClear">清除密钥</button></div>`; },
  map:(rid)=>{ if(rid) mapView.rid=rid; const tabs=[['world','京城舆图'],...REGION_ORDER.map(r=>[r,REGIONS[r].name])];
    return `<h2>舆　图</h2><div class="tabs maptabs">${tabs.map(([k,n])=>`<button class="${k===mapView.rid?'on':''} ${k!=='world'&&!S.visited[k]?'unseen':''}" data-maptab="${k}">${n}${k!=='world'&&!S.visited[k]?'<small>·未至</small>':''}${quest?.rid===k?'<b class="qdot">◆</b>':''}</button>`).join('')}</div>
    <div class="mapwrap"><canvas id="mapCanvas" width="720" height="720"></canvas>${mapView.rid!=='world'?'<div class="mapzoom"><button data-z="in" title="放大">＋</button><button data-z="out" title="缩小">－</button><button data-z="me" title="回到自己">◎</button></div>':''}</div>
    <p class="tiny maplegend" id="mapInfo">${mapView.rid==='world'?'点地域查看详图 · 红点为你所在 · ◆ 为当前目标':'滚轮/＋－缩放 · 拖动平移 · 点地名前往（去过的地域可直接乘轿过去） · <b style="color:#c0392b">◆</b> 目标 · <span style="color:#3f7a64">●</span> 人物 · <span style="color:#d4a020">✦</span> 物件 · 云雾处尚未走到'}</p>`; },
};
function codexHTML(){ const sec=(t,items)=>`<h3>${t}</h3>`+items.join('');
  const places=REGION_ORDER.filter(r=>S.visited[r]).map(r=>`<div class="card"><b>${REGIONS[r].name}</b> · ${REGIONS[r].sub}<br>${REGIONS[r].desc}<div class="tiny" style="color:#6a4a2a;opacity:1">${REGIONS[r].poem}</div></div>`);
  const lockedP=REGION_ORDER.filter(r=>!S.visited[r]).map(r=>`<div class="card locked">${REGIONS[r].name}　—— 尚未去过</div>`);
  const people=Object.entries(CHARS).filter(([k])=>S.met[k]).map(([k,C])=>`<div class="card char"><img src="${portraits[k]}"><div><b>${C.name}</b> · ${C.title}<br><small>${BIOS[k]||C.bio||''}</small></div></div>`);
  const lore=Object.entries(LORE).map(([k,l])=>S.lore[k]?`<div class="card"><b>${l.title}</b><br>${l.text}</div>`:`<div class="card locked">？？？　—— 拾取物件、经历回目可解锁</div>`);
  const items=ITEMS.map(it=>S.items[it.id]?`<div class="card"><b>${it.name}</b> · ${REGIONS[it.region].name}<br><small>${it.text}</small></div>`:`<div class="card locked">未得之物 · 藏在${S.visited[it.region]?REGIONS[it.region].name:'某处'}</div>`);
  return `<p class="tiny" style="color:#6a4a2a">地点 ${places.length}/${REGION_ORDER.length} · 人物 ${people.length} · 典故 ${Object.keys(S.lore).length}/${Object.keys(LORE).length} · 物件 ${Object.keys(S.items).length}/${ITEMS.length}</p>`
    +sec('地　点',[...places,...lockedP])+sec('人　物',people.length?people:['<p>尚未见过谁。</p>'])+sec('典　故',lore)+sec('物　件',items); }
function openPage(name,arg){ if(!(isPlay()||mode==='modal'||mode==='title')) return; if(name==='map'&&!arg) { mapView.rid=S.region; const lo=player?localOf(player.position):{x:0,z:0}; mapView.zoom=1; mapView.cx=lo.x; mapView.cz=lo.z; clampView(); }
  openModal(PAGES[name](arg)); bindPage(name); if(name==='map') T.map=1; if(name==='journal') T.journal=1; }
function clampView(){ if(mapView.rid==='world') return; const E=regionExtent(mapView.rid); const lim=E*(1-1/mapView.zoom); mapView.cx=THREE.MathUtils.clamp(mapView.cx,-lim,lim); mapView.cz=THREE.MathUtils.clamp(mapView.cz,-lim,lim); }
function bindPage(name){
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>openPage('journal',b.dataset.tab));
  document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>openPage(b.dataset.goto));
  if(name==='save'){ $('#doSave').onclick=()=>{ localStorage.setItem(SAVE_KEY+'_manual',JSON.stringify(snap())); toast('已存档'); T.save=1; closeModal(); };
    $('#doLoad').onclick=async()=>{ closeModal(); await load(JSON.parse(localStorage.getItem(SAVE_KEY+'_manual'))); toast('已读档'); };
    $('#doExport').onclick=()=>{ const t=btoa(unescape(encodeURIComponent(JSON.stringify(snap())))); navigator.clipboard?.writeText(t).then(()=>toast('存档文本已复制到剪贴板'),()=>prompt('复制以下存档文本',t)); };
    $('#doImport').onclick=async()=>{ const t=prompt('粘贴存档文本'); if(!t) return; try{ const d=JSON.parse(decodeURIComponent(escape(atob(t.trim())))); closeModal(); await load(d); toast('已导入'); }catch{ toast('存档文本有误'); } };
    $('#doReset').onclick=()=>{ if(confirm('确定清除进度，重新开卷？')){ localStorage.removeItem(SAVE_KEY); location.reload(); } }; }
  if(name==='settings'){ document.querySelectorAll('[data-vol]').forEach(r=>r.oninput=()=>setVol(r.dataset.vol,+r.value)); const qs=$('#qualitySel'); if(qs) qs.onchange=()=>{ localStorage.setItem('honglou_quality',qs.value); W.R.auto=qs.value==='auto'; if(qs.value!=='auto') W.R.setTier(qs.value); };
    $('#tutReplay').onclick=()=>{ localStorage.removeItem(TUT_OFF); if($('#title').classList.contains('hidden')){ closeModal(); startTutorial(); } else { toast('开卷时将显示新手引导'); openPage('settings'); } };
    const sk=$('#tutSkip2'); if(sk) sk.onclick=()=>{ skipTutorial(); closeModal(); };
    $('#hintReset').onclick=()=>{ localStorage.removeItem(HINT_KEY); toast('提示已重置，遇到时会再次出现'); };
    $('#cfgSave').onclick=()=>{ localStorage.setItem(CFG_KEY,JSON.stringify({base:$('#cfgBase').value.trim(),model:$('#cfgModel').value.trim(),key:$('#cfgKey').value.trim()})); toast('已保存'); closeModal(); };
    $('#cfgClear').onclick=()=>{ localStorage.removeItem(CFG_KEY); toast('已清除，改用离线对话'); closeModal(); }; }
  if(name==='map') bindMap();
}
function bindMap(){ document.querySelectorAll('[data-maptab]').forEach(b=>b.onclick=()=>{ const r=b.dataset.maptab; mapView.rid=r; mapView.zoom=1; if(r===S.region&&player){ const lo=localOf(player.position); mapView.cx=lo.x; mapView.cz=lo.z; } else { mapView.cx=0; mapView.cz=0; } clampView(); openPage('map',r); });
  const c=$('#mapCanvas'), x=c.getContext('2d'), S0=720; const redraw=()=>{ if(mapView.rid==='world') drawWorldMap(x,S0); else drawRegionMap(x,mapView.rid,S0,mapView,true); }; redraw();
  document.querySelectorAll('[data-z]').forEach(b=>b.onclick=()=>{ const z=b.dataset.z; if(z==='in') mapView.zoom=Math.min(4,mapView.zoom*1.4); if(z==='out') mapView.zoom=Math.max(1,mapView.zoom/1.4); if(z==='me'&&mapView.rid===S.region){ const lo=localOf(player.position); mapView.cx=lo.x; mapView.cz=lo.z; mapView.zoom=Math.max(mapView.zoom,1.8); } clampView(); redraw(); });
  const toCanvas=e=>{ const r=c.getBoundingClientRect(); return [(e.clientX-r.left)/r.width*S0,(e.clientY-r.top)/r.height*S0]; };
  let drag=null, moved=false;
  c.onpointerdown=e=>{ drag=toCanvas(e); moved=false; c.setPointerCapture(e.pointerId); };
  c.onpointermove=e=>{ if(!drag||mapView.rid==='world') return; const p=toCanvas(e); const dx=p[0]-drag[0], dy=p[1]-drag[1]; if(!moved&&Math.hypot(dx,dy)>5) moved=true; if(!moved) return; const k=S0/(2*regionExtent(mapView.rid))*mapView.zoom; mapView.cx-=dx/k; mapView.cz-=dy/k; drag=p; clampView(); redraw(); };
  c.onpointerup=e=>{ const p=toCanvas(e); const wasMoved=moved; drag=null; if(wasMoved) return; mapClick(p[0],p[1]); };
  c.onwheel=e=>{ if(mapView.rid==='world') return; e.preventDefault(); const p=toCanvas(e); const E=regionExtent(mapView.rid), k=S0/(2*E)*mapView.zoom; const wx=mapView.cx+(p[0]-S0/2)/k, wz=mapView.cz+(p[1]-S0/2)/k;
    mapView.zoom=THREE.MathUtils.clamp(mapView.zoom*(e.deltaY<0?1.2:1/1.2),1,4); const k2=S0/(2*E)*mapView.zoom; mapView.cx=wx-(p[0]-S0/2)/k2; mapView.cz=wz-(p[1]-S0/2)/k2; clampView(); redraw(); };
}
function mapClick(px,py){ const S0=720;
  if(mapView.rid==='world'){ for(const [r,[nx,ny]] of Object.entries(WORLD_NODES)){ if(Math.abs(px-nx*S0)<80&&Math.abs(py-ny*S0)<40){ mapView.rid=r; mapView.zoom=1; mapView.cx=0; mapView.cz=0; if(r===S.region){ const lo=localOf(player.position); mapView.cx=lo.x; mapView.cz=lo.z; clampView(); } openPage('map',r); return; } } return; }
  const r=mapView.rid, E=regionExtent(r), k=S0/(2*E)*mapView.zoom; const lx=mapView.cx+(px-S0/2)/k, lz=mapView.cz+(py-S0/2)/k;
  for(const p of portalsData(r)){ if(Math.hypot(p.at[0]-lx,p.at[1]-lz)<4.5){ if(r===S.region){ closeModal(); walkTo(portalWorld(r,p)); toast(`往${p.label}去`); } else $('#mapInfo').textContent=`${p.label}`; return; } }
  let best=null, bd=1e9; for(const L of locsIn(r)){ if(L.kind==='gate') continue; const d=Math.hypot(L.pos[0]-lx,L.pos[1]-lz); if(d<bd){ bd=d; best=L; } }
  if(!best||bd>12) return;
  if(r!==S.region&&!S.visited[r]){ $('#mapInfo').textContent=`尚未去过${REGIONS[r].name}。跟着门楼走过去，之后便可直接乘轿前往。`; return; }
  if(r==='taixu'&&r!==S.region){ if(!S.flags.taixu){ $('#mapInfo').textContent='太虚幻境，须得机缘方能梦到。'; return; } if(S.slot!==2){ $('#mapInfo').textContent='须到暮时，方能入梦。'; return; } }
  closeModal(); fastTravel(r,best.id); }

// ---------- 舆图绘制 ----------
const WORLD_NODES={ taixu:[.5,.11], garden:[.5,.33], rongfu:[.26,.52], ningfu:[.74,.52], street:[.5,.7], suburb:[.5,.9] };
const ICON={waterside:'榭',dicui:'亭',smallhall:'屋',hut:'庵',sluice:'闸',cave:'洞',gate:'门',shop:'铺',spotgarden:'园',changting:'亭',pavilion:'亭'};
function paper(x,S0,col='#ead9b2'){ x.fillStyle=col; x.fillRect(0,0,S0,S0); x.fillStyle='rgba(120,90,50,.06)'; for(let i=0;i<S0*.6;i++){ x.fillRect((i*7919)%S0,(i*104729)%S0,2,2); } }
const font=px=>`${px}px "Ma Shan Zheng","KaiTi",serif`;
function drawWorldMap(x,S0){ paper(x,S0); x.lineCap='round';
  const links=new Set(); for(const r of REGION_ORDER) for(const p of portalsData(r)){ const key=[r,p.to].sort().join('-'); if(links.has(key)) continue; links.add(key); const a=WORLD_NODES[r], b=WORLD_NODES[p.to]; const dream=r==='taixu'||p.to==='taixu';
    x.strokeStyle=dream?'rgba(140,110,200,.6)':'#b89a68'; x.setLineDash(dream?[8,10]:[]); x.lineWidth=7; x.beginPath(); x.moveTo(a[0]*S0,a[1]*S0); x.lineTo(b[0]*S0,b[1]*S0); x.stroke(); }
  x.setLineDash([]);
  for(const [r,[nx,ny]] of Object.entries(WORLD_NODES)){ const X=nx*S0, Y=ny*S0, v=S.visited[r], cur=S.region===r;
    x.fillStyle=r==='taixu'?(v?'#e4d8f4':'#cfc6d8'):(v?'#f3e8cf':'#d8ccb4'); x.strokeStyle=cur?'#9e1f19':'#6a4a2a'; x.lineWidth=cur?5:2.5; x.beginPath(); x.roundRect(X-78,Y-38,156,76,12); x.fill(); x.stroke();
    x.fillStyle=v?'#2a1a12':'#8a7a6a'; x.font=font(30); x.textAlign='center'; x.fillText(REGIONS[r].name,X,Y+6); x.font='13px serif'; x.fillText(v?REGIONS[r].sub:'尚未去过',X,Y+28);
    if(cur){ x.fillStyle='#d02020'; x.beginPath(); x.arc(X-64,Y-26,9,0,7); x.fill(); }
    if(quest?.rid===r){ x.fillStyle='#c0392b'; x.font='30px serif'; x.fillText('◆',X+66,Y-18); } }
  x.fillStyle='#6a4a2a'; x.font=font(22); x.textAlign='left'; x.fillText('京　城',20,36); x.font='13px serif'; x.fillText('虚线：梦中方可到达',20,58); }
function drawRegionMap(x,rid,S0,view,big){ const E=regionExtent(rid), k=S0/(2*E)*view.zoom; const P=(a,b)=>[S0/2+(a-view.cx)*k,S0/2+(b-view.cz)*k]; const fs=s=>Math.max(9,s*Math.sqrt(view.zoom));
  paper(x,S0,rid==='taixu'?'#d6cbe6':rid==='suburb'?'#dcd8b0':'#ead9b2'); x.textAlign='center';
  const locRot=L=>rid==='garden'?(L.rot??Math.atan2(-L.pos[0],-L.pos[1])):(L.rot||0);
  const toM=(L,lx,lz)=>{ const th=locRot(L), c=Math.cos(th), s=Math.sin(th); return P(L.pos[0]+c*lx+s*lz, L.pos[1]-s*lx+c*lz); };
  if(rid==='garden'){ x.strokeStyle='#8a6a3a'; x.lineWidth=big?3:2; x.strokeRect(...P(-50,-50),100*k,100*k);
    x.strokeStyle='#7fa8b0'; x.lineWidth=2.6*k; x.beginPath(); x.moveTo(...P(-6.8,-1.6)); x.lineTo(...P(28.9,48.5)); x.stroke();
    x.strokeStyle='#c8b080'; x.lineWidth=big?7:4; x.beginPath(); x.arc(...P(0,0),RING*k,0,7); x.stroke();
    for(const L of LOCATIONS){ if(!W.isCompound(L)) continue; const th=locRot(L); const gx=L.pos[0]+Math.sin(th)*11.5, gz=L.pos[1]+Math.cos(th)*11.5; const a=Math.atan2(gz,gx); x.beginPath(); x.moveTo(...P(Math.cos(a)*RING,Math.sin(a)*RING)); x.lineTo(...P(gx,gz)); x.stroke(); }
    x.fillStyle='#7fa8b0'; x.beginPath(); x.arc(...P(0,0),10.8*k,0,7); x.fill(); x.fillStyle='#c8b080'; x.fillRect(...P(-1.1,-10.5),2.2*k,21*k); x.fillStyle='#9e1f19'; x.beginPath(); x.arc(...P(0,0),3*k,0,7); x.fill(); }
  else { const [bx,bz]=REGION_DEFS[rid].bounds;
    if(rid==='taixu'){ x.fillStyle='rgba(255,255,255,.35)'; for(let i=0;i<14;i++){ x.beginPath(); x.ellipse(...P(Math.sin(i*2.3)*bx,Math.cos(i*1.7)*bz),9*k,4*k,0,0,7); x.fill(); } }
    if(rid==='suburb'){ x.fillStyle='#8fb0b8'; x.fillRect(...P(32,-bz),8*k,2*bz*k); }
    x.strokeStyle='#8a6a3a'; x.lineWidth=big?3:2; if(!REGION_DEFS[rid].walls) x.setLineDash([6,6]); x.strokeRect(...P(-bx,-bz),2*bx*k,2*bz*k); x.setLineDash([]);
    x.fillStyle=rid==='taixu'?'rgba(200,170,90,.35)':'#d4bf94'; x.fillRect(...P(-2.6,-bz),5.2*k,2*bz*k); }
  const pend=new Set(pendingEvents().map(e=>e.loc));
  for(const L of locsIn(rid)){ if(L.kind==='gate') continue; const known=fogKnown(rid,L.pos[0],L.pos[1]); const [px,pz]=P(...L.pos);
    if(W.isCompound(L)){ const hw=(W.compoundW(L)+9)/2; x.fillStyle='rgba(243,232,207,.92)'; x.strokeStyle='#6a4a2a'; x.lineWidth=1.5; x.beginPath(); for(const [a,b] of [[-hw,-8],[hw,-8],[hw,8],[-hw,8]]) x.lineTo(...toM(L,a,b)); x.closePath(); x.fill(); x.stroke();
      const hb=W.compoundW(L)/2; x.fillStyle=L.kind==='temple'||L.kind==='nunnery'?'#6a5a4a':'#3a3a44'; x.beginPath(); for(const [a,b] of [[-hb,-3.5],[hb,-3.5],[hb,3.5],[-hb,3.5]]) x.lineTo(...toM(L,a,b)); x.closePath(); x.fill();
      x.fillStyle='#9e1f19'; x.beginPath(); x.arc(...toM(L,0,8),Math.max(2,.9*k),0,7); x.fill(); }
    else if(L.kind!=='pavilion'){ x.fillStyle='rgba(243,232,207,.95)'; x.strokeStyle='#6a4a2a'; x.lineWidth=1.3; const s=Math.max(7,2.6*k); x.beginPath(); x.roundRect(px-s,pz-s,2*s,2*s,3); x.fill(); x.stroke(); x.fillStyle='#6a4a2a'; x.font=`${Math.round(s*1.2)}px serif`; x.fillText(ICON[L.kind]||'景',px,pz+s*.42); }
    if(big||view.zoom>1.4){ x.fillStyle=known?'#2a1a12':'rgba(60,40,30,.45)'; x.font=font(fs(big?20:12)); x.fillText(known?L.name:'？',px,pz+(W.isCompound(L)?4:(L.kind==='pavilion'?-24:Math.max(7,2.6*k)+fs(big?18:11)))); }
    if(pend.has(L.id)&&big){ x.fillStyle='#c0392b'; x.font='22px serif'; x.fillText('◆',px,pz-20); } }
  for(const p of portalsData(rid)){ const [px,pz]=P(...p.at); x.fillStyle='#9e1f19'; x.strokeStyle='#f3e8cf'; x.lineWidth=2; const s=big?11:6; x.beginPath(); x.roundRect(px-s,pz-s*.7,2*s,1.4*s,2); x.fill(); x.stroke(); x.fillStyle='#f3e8cf'; x.font=`${big?14:8}px serif`; x.fillText('门',px,pz+s*.35);
    if(big){ x.fillStyle='#6a1a12'; x.font='14px serif'; const ly=pz<S0/2?pz+s+16:pz-s-6; x.fillText('往'+REGIONS[p.to].name,THREE.MathUtils.clamp(px,50,S0-50),ly); } }
  for(const it of ITEMS){ if(it.region!==rid||S.items[it.id]||!fogKnown(rid,it.pos[0],it.pos[1])) continue; const [px,pz]=P(...it.pos); x.fillStyle='#d4a020'; x.font=`${big?20:11}px serif`; x.fillText('✦',px,pz+6); }
  if(rid===S.region){ const ox=W.regionOrigin(rid).x; for(const n of Object.values(npcs)){ if(!n.present) continue; const [nx,nz]=P(n.g.position.x-ox,n.g.position.z); x.fillStyle='#3f7a64'; x.beginPath(); x.arc(nx,nz,big?5:3,0,7); x.fill(); if(big){ x.font='13px serif'; x.fillText(CHARS[n.id].name.slice(-2),nx,nz+16); } } }
  x.save(); x.imageSmoothingEnabled=true; const fc=fogCanvas(rid); const [fx,fz]=P(-E,-E); x.drawImage(fc,fx,fz,2*E*k,2*E*k); x.globalAlpha=.5; x.drawImage(fc,fx-k*1.2,fz-k*1.2,2*E*k+2.4*k,2*E*k+2.4*k); x.restore();
  if(quest?.rid){ let q=null; if(quest.rid===rid){ if(quest.loc) q=LOC[quest.loc].pos; else if(quest.pos) q=quest.pos; else if(quest.npc&&rid===S.region&&npcs[quest.npc].present){ const n=npcs[quest.npc].g.position; q=[n.x-W.regionOrigin(rid).x,n.z]; } }
    else if(rid===S.region&&questW?.via) q=questW.via.at;
    if(q){ const [qx,qz]=P(...q); x.fillStyle='#c0392b'; x.strokeStyle='#fff8e0'; x.lineWidth=3; x.font=`${big?36:18}px serif`; x.strokeText('◆',qx,qz-(big?8:4)); x.fillText('◆',qx,qz-(big?8:4)); } }
  if(rid===S.region&&player){ const lo=localOf(player.position); const [px,pz]=P(lo.x,lo.z); x.save(); x.translate(px,pz); x.rotate(-player.rotation.y+Math.PI); x.fillStyle='#d02020'; x.strokeStyle='#fff'; x.lineWidth=2; x.beginPath(); x.moveTo(0,-(big?12:8)); x.lineTo(big?8:5,big?8:5); x.lineTo(-(big?8:5),big?8:5); x.closePath(); x.fill(); x.stroke(); x.restore(); }
  if(big){ x.fillStyle='#6a4a2a'; x.font=font(24); x.textAlign='left'; x.fillText(REGIONS[rid].name,16,34); x.font='13px serif'; x.fillText(REGIONS[rid].sub,16,54); }
}
function drawMinimap(){ const c=$('#minimap'), x=c.getContext('2d'), S0=180, Z=S.region==='garden'?1.8:1.6; const lo=localOf(player.position); drawRegionMap(x,S.region,S0,{zoom:Z,cx:lo.x,cz:lo.z},false);
  if(questW){ const E=regionExtent(S.region), k=S0/(2*E)*Z; const ql=localOf(questW.pos); let dx=(ql.x-lo.x)*k, dz=(ql.z-lo.z)*k; const m=Math.hypot(dx,dz); if(m>S0/2-14){ dx*=(S0/2-14)/m; dz*=(S0/2-14)/m; x.save(); x.translate(S0/2+dx,S0/2+dz); x.rotate(Math.atan2(dx,-dz)); x.fillStyle='#c0392b'; x.strokeStyle='#fff'; x.lineWidth=1.5; x.beginPath(); x.moveTo(0,-9); x.lineTo(7,6); x.lineTo(-7,6); x.closePath(); x.fill(); x.stroke(); x.restore(); } } }
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openPage(b.dataset.open));
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal'&&$('#mClose')) closeModal(); });
$('#restBtn').onclick=async()=>{ if(!isPlay()) return; await spendSlot(); };
$('#minimap').onclick=()=>openPage('map');

// ================= 新手引导（袭人） =================
const T={moved:0,rot:0,talk:0,choose:0,map:0,follow:0,journal:0,gate:0,save:0};
const kb=s=>s.split(' ').map(k=>`<kbd>${k}</kbd>`).join('');
const TUT_STEPS=[
  {id:'move',text:()=>isTouch?'二爷醒了？先活动活动。用左下角的<b>摇杆</b>走几步，或者<b>点一下地面</b>，就会自己走过去。':`二爷醒了？先活动活动。按 ${kb('W A S D')}（或方向键）走几步；也可以<b>点击地面</b>，就会自己走过去。`,hl:()=>isTouch?'#joy':null,done:()=>T.moved>=4},
  {id:'camera',text:()=>isTouch?'在画面上用一根手指<b>拖动</b>，转转视角；两指捏合可以拉近拉远。':`按住鼠标<b>拖动</b>画面，转转视角（或按 ${kb('Q')} ${kb('R')}）；<b>滚轮</b>可以拉近拉远。`,done:()=>T.rot>=1},
  {id:'talk',text:()=>`走到我跟前来，${isTouch?'点下方的<b>「与 袭人 交谈」</b>按钮':`按 ${kb('E')}，或点下方<b>「交谈」</b>按钮`}，也可以直接点我。`,target:()=>({rid:'garden',npc:'xiren',label:'和袭人说话',sub:'走到袭人身边'}),hl:()=>$('#talkBtn').classList.contains('hidden')?null:'#talkBtn',arrowNpc:'xiren',done:()=>T.talk},
  {id:'choose',text:()=>'说话时，下面会出现几个<b>选项</b>。挑一个回我——说不同的话，好感变化也不同。',hl:()=>mode==='dialog'?'#dlgChoices':null,done:()=>T.choose},
  {id:'map',text:()=>`打开<b>地图</b>看看：${isTouch?'点右上角的小地图':`按 ${kb('M')}，或点右上角的小地图`}。`,hl:()=>mode==='modal'?null:'#minimap',done:()=>T.map},
  {id:'follow',text:()=>'地图上的 <b style="color:#c0392b">◆</b> 就是该去的地方。合上地图，跟着地上的<b>金色光柱</b>（或屏幕边上的红箭头）走到园心的<b>沁芳亭</b>。',target:()=>({rid:'garden',loc:'qinfang',label:'去沁芳亭',sub:'元妃省亲就要开始了'}),hl:()=>mode==='modal'?'#mClose':'#tracker',done:()=>T.follow||curLoc?.id==='qinfang'},
  {id:'journal',text:()=>`看完了？${isTouch?'点下方工具栏的':`按 ${kb('J')}，或点工具栏的`}<b>「簿册」</b>。人物好感、判词、百科、诗、回目都记在里头。`,hl:()=>mode==='modal'?null:'#tbJournal',done:()=>T.journal},
  {id:'gate',text:()=>`园子外头还有荣府、宁府、街市……走到园西的<b>大观园正门</b>（跟着金色光柱），${isTouch?'点下方按钮':`按 ${kb('E')} 或点下方按钮`}，就能出园去荣国府。换地方不耗时辰。`,target:()=>({rid:'garden',loc:'gardengate',label:'出园去荣国府',sub:'走到大观园正门'}),hl:()=>mode==='modal'?'#mClose':$('#talkBtn').classList.contains('hidden')?'#tracker':'#talkBtn',done:()=>T.gate||S.region!=='garden'},
  {id:'save',text:()=>'到荣国府了！最后学存档：点<b>「存档」</b>，再点<b>「手动存档」</b>。（每过一个时辰、每次换地方，也会自动存。）',hl:()=>$('#doSave')?'#doSave':mode==='modal'?'#mClose':'#tbSave',done:()=>T.save},
];
function startTutorial(){ for(const k in T) T[k]=0; S.tut={on:true,step:0}; $('#guideText').dataset.h=''; renderGuide(); trT=1; }
function skipTutorial(){ if(S.tut) S.tut.on=false; localStorage.setItem(TUT_OFF,'1'); $('#guide').classList.add('hidden'); setHL(null); toast('已跳过引导。可在「设置」中重新开始。'); trT=1; }
function finishTutorial(){ S.tut={on:false,done:true}; localStorage.setItem(TUT_OFF,'1'); setHL(null); sfx('good');
  $('#guideStep').textContent='完成'; $('#guideDots').innerHTML=''; $('#guideText').dataset.h=''; $('#guideText').innerHTML='都学会了！往后不知道做什么，就看右上角的<b>「当前目标」</b>，跟着金色光柱走。荣府、宁府、街上、城外都去走走——细则在工具栏的<b>「玩法」</b>里。';
  $('#guideSkip').textContent='好'; $('#guide').classList.remove('hidden'); clearTimeout(finishTutorial.h); finishTutorial.h=setTimeout(()=>{ if(!S.tut?.on) $('#guide').classList.add('hidden'); },12000); trT=1; autosave(); }
function tutTalk(){ const id='xiren', C=CHARS[id]; playerPath=[]; pendingTalk=null; faceEachOther(id); sfx('open'); S.met[id]=1; showDialog(); setSpeaker(C.name,`${C.title} · 好感 ${S.aff[id]}`,id); T.talk=1;
  typeText(esc('二爷可算醒了。这园子大，园子外头更大——荣府、宁府、街上、城外，处处有人有事。往后每一回有晨、午、暮三个时辰，可得省着用。二爷，你今儿心里头最想做什么？'));
  const done=S.used.tutXiren; const opts=[['去看看林妹妹。',{daiyu:2,xiren:1},'就知道你心里只惦记着林姑娘。也罢，晚些时候再去潇湘馆不迟。'],['读书作诗，长些才情。',{talent:2,xiren:1},'这才是正经。老爷知道了也欢喜。'],['陪着你说说话。',{xiren:3},'（袭人红了脸）……二爷又混说了。']];
  for(const [t,eff0,r] of opts) choice('◆ '+t,()=>{ const eff=done?{}:eff0; T.choose=1; S.used.tutXiren=1; $('#dlgChoices').innerHTML=''; typeText(esc(r)); applyEff(eff); $('#dlgText').insertAdjacentHTML('beforeend',effHTML(eff)+'<div class="eff" style="color:#6a4a2a">选项会改变好感与属性（左上角可看）。和人说"◆ 心事"会耗一个时辰，这次不算。</div>'); choice('（好）',closeDialog); }); }
function renderGuide(){ const g=$('#guide'); if(!S.tut?.on) return; const st=TUT_STEPS[S.tut.step]; if(!st) return;
  if(portraits.xiren&&$('#guideImg').src!==portraits.xiren) $('#guideImg').src=portraits.xiren; $('#guideStep').textContent=`第 ${S.tut.step+1} / ${TUT_STEPS.length} 步`; $('#guideSkip').textContent='跳过引导';
  const h=st.text(); if($('#guideText').dataset.h!==h){ $('#guideText').dataset.h=h; $('#guideText').innerHTML=h; g.classList.remove('pop'); void g.offsetWidth; g.classList.add('pop');
    $('#guideDots').innerHTML=TUT_STEPS.map((_,i)=>`<i class="${i<S.tut.step?'ok':i===S.tut.step?'cur':''}"></i>`).join(''); } }
let hlEl=null;
function setHL(sel,npcId){ const el=sel?$(sel):null; if(el!==hlEl){ hlEl?.classList.remove('tut-hl'); hlEl=el; el?.classList.add('tut-hl'); }
  const a=$('#tutArrow'); let pt=null, up=false;
  if(el&&el.getClientRects().length){ const r=el.getBoundingClientRect(); if(r.top>90){ pt=[r.left+r.width/2,r.top-4]; } else { pt=[r.left+r.width/2,r.bottom+4]; up=true; } }
  else if(npcId&&npcs[npcId]?.present&&mode==='play'){ const p=npcs[npcId].g.position.clone().setY(2.7).project(W.camera); if(p.z<1&&Math.abs(p.x)<.95&&Math.abs(p.y)<.95) pt=[(p.x+1)/2*innerWidth,(1-p.y)/2*innerHeight]; }
  if(pt){ a.style.left=pt[0]+'px'; a.style.top=pt[1]+'px'; a.className=up?'up':'down'; a.textContent=up?'▲':'▼'; } else a.className='hidden'; }
function updateTutorial(){ const g=$('#guide');
  if(!S.tut?.on){ if(hlEl||$('#tutArrow').className!=='hidden') setHL(null); return; }
  const show=mode==='play'||mode==='dialog'||mode==='modal'; g.classList.toggle('hidden',!show);
  const st=TUT_STEPS[S.tut.step]; if(!st) return finishTutorial();
  if(st.done()){ S.tut.step++; sfx('good'); trT=1; if(S.tut.step>=TUT_STEPS.length) return finishTutorial(); renderGuide(); return; }
  if(show){ renderGuide(); setHL(st.hl?.()||null,st.arrowNpc); } else setHL(null); }
$('#guideSkip').onclick=()=>{ if(S.tut?.on) skipTutorial(); else $('#guide').classList.add('hidden'); };

// ================= 情境提示（不打断） =================
const HINTS={
  event:['回目开演','这是书里的一段大事。看完要做一个选择——不同选择会改变好感，以及才情、家运、禅心。经历一个回目会用掉一个时辰。'],
  quiz:['诗社接句','从四个选项里选出原著中的下一句。答对越多，才情加得越多；答错了会告诉你原句。'],
  night:['入夜了','暮时天色转暗，灯笼点起，有的人回房歇息。这是本回最后一个时辰，用完便到下一回。暮时还可以在地图里"入梦"（若已有机缘）。'],
  travel:['到了新地方','每个地域都有自己的人物、回目和物件。走到门楼前按 E（或点按钮）就能去别处；去过的地方，可以在地图里点地名直接乘轿过去。换地方不耗时辰。'],
  pickup:['拾得一件物事','地上发光的小物件，走过去就能拾起，会解锁「簿册 → 百科」里的典故。每个地域都藏着两件。'],
  taixu:['太虚幻境','这里是梦中之境。去薄命司翻翻册子；南边的"梦醒处"可以回到怡红院。'],
  aff:['好感到了一个坎','好感达 35 变「亲」、60 变「知心」，能说的心事更多；达 50 还会揭开她在「簿册 → 金陵判词」里的判词。结局也看好感——想走谁的结局，就多陪她。'],
  portal:['门楼','这里通往别的地域。按 E 或点下方按钮就能过去，不耗时辰。'],
};
const hintQ=[];
function hint(k){ if(!HINTS[k]) return; let seen={}; try{ seen=JSON.parse(localStorage.getItem(HINT_KEY)||'{}'); }catch{} if(seen[k]) return; seen[k]=1; localStorage.setItem(HINT_KEY,JSON.stringify(seen)); hintQ.push(k); if(hintQ.length===1) showHint(); }
function showHint(){ const k=hintQ[0]; if(!k) return; const [t,x]=HINTS[k]; $('#hintTitle').textContent='💡 '+t; $('#hintText').textContent=x; const c=$('#hintCard'); c.classList.remove('hidden'); requestAnimationFrame(()=>c.classList.add('on')); clearTimeout(showHint.h); showHint.h=setTimeout(closeHint,11000); }
function closeHint(){ $('#hintCard').classList.remove('on'); setTimeout(()=>{ $('#hintCard').classList.add('hidden'); hintQ.shift(); if(hintQ.length) setTimeout(showHint,400); },300); }
$('#hintOk').onclick=()=>{ clearTimeout(showHint.h); closeHint(); };

// ================= 存档 =================
function snap(){ S.pos=[player.position.x,player.position.z]; S.fog=Object.fromEntries(Object.entries(FOG).map(([r,a])=>[r,packFog(a)])); return S; }
function autosave(){ if(!S.ended&&mode!=='title') localStorage.setItem(SAVE_KEY,JSON.stringify(snap())); }
async function load(d){ const f=freshState(); S=Object.assign(f,d); S.aff=Object.assign(f.aff,d.aff||{}); S.lore=Object.assign(f.lore,d.lore||{});
  for(const r in FOG) delete FOG[r]; for(const r in FOGC) delete FOGC[r]; for(const [r,s] of Object.entries(S.fog||{})) FOG[r]=unpackFog(s);
  const r=S.region||'garden'; S.region='garden'; W.setRegion('garden');
  if(r!=='garden'){ if(!W.regionBuilt(r)){ const tv=$('#travel'); tv.classList.remove('hidden'); tv.classList.add('on'); $('#tvName').textContent=REGIONS[r].name; $('#tvSub').textContent='续读中……'; $('#tvPoem').textContent=REGIONS[r].poem; await W.buildRegion(REGION_DEFS[r],f=>$('#tvFill').style.width=Math.round(f*100)+'%'); tv.classList.remove('on'); tv.classList.add('hidden'); } W.setRegion(r); S.region=r; }
  syncPickups(); if(S.pos) player.position.set(S.pos[0],0,S.pos[1]); W.applySky(S.slot,S.day); placeNPCs(true); setMood(S.slot===2||r==='taixu'?'night':'day'); renderStats(); if(S.tut?.on){ for(const k in T) T[k]=0; $('#guideText').dataset.h=''; renderGuide(); } }

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
async function endPrologue(){ await fade('第一回',600); $('#prologue').classList.add('hidden'); startPlay(true); }

// ================= 开始 =================
function startPlay(fresh){ $('#hud').classList.remove('hidden'); mode='play'; W.applySky(S.slot,S.day); syncPickups(); placeNPCs(true); setMood(S.slot===2||S.region==='taixu'?'night':'day'); renderStats();
  cam.yaw=S.region==='garden'?Math.atan2(player.position.x,player.position.z):player.rotation.y+Math.PI; cam.pitch=.5; cam.focus.copy(player.position).setY(1.6); W.camera.position.set(cam.focus.x+Math.sin(cam.yaw)*12,cam.focus.y+7,cam.focus.z+Math.cos(cam.yaw)*12);
  const lo=localOf(player.position); reveal(S.region,lo.x,lo.z,16); if(fresh===true){ reveal('garden',0,0,12); if(TUTORIAL_ON&&!localStorage.getItem(TUT_OFF)) startTutorial(); } else if(S.tut?.on) renderGuide();
  $('#hint').textContent=KEYS; renderTracker(); }
$('#newGame').onclick=()=>{ initAudio(); localStorage.removeItem(SAVE_KEY); S=freshState(); for(const r in FOG) delete FOG[r]; for(const r in FOGC) delete FOGC[r]; W.setRegion('garden'); player.position.copy(localToWorld('yihong',0,4.4)); player.rotation.y=0; startPrologue(); };
$('#continueGame').onclick=async()=>{ initAudio(); const d=localStorage.getItem(SAVE_KEY); if(!d) return; await load(JSON.parse(d)); await fade('续　读',200); $('#title').classList.add('hidden'); startPlay(); };

// ================= 遮挡淡出 =================
const faded=new Map(); const _seg=new THREE.Line3(), _cp=new V3(); let occT=0, want=new Set();
function segDist(a,b,p){ _seg.set(a,b); _seg.closestPointToPoint(p,true,_cp); return _cp.distanceTo(p); }
function updateOcclusion(dt){
  const active=(mode==='play'||mode==='dialog')&&!window.__camOverride;
  if((occT+=dt)>.1){ occT=0; want=new Set();
    if(active){ const camP=W.camera.position; const tgts=mode==='dialog'&&cam.cine?[cam.cine.look,player.position.clone().setY(1.2)]:[player.position.clone().setY(.4),player.position.clone().setY(1.8)];
      for(const t of tgts) for(const [ox,oy] of [[0,0],[.6,0],[-.6,0],[0,.6]]){ const e=t.clone().add(new V3(ox,oy,0)); const d=e.sub(camP); const L=d.length(); d.normalize();
        for(const h of W.rayOccAll(camP,d,L-.6)) h.og.roofs.forEach(m=>want.add(m)); } } }
  for(const m of want){ if(!faded.has(m)){ faded.set(m,{orig:m.material,a:1}); const mm=m.material.clone(); mm.transparent=true; mm.depthWrite=false; m.material=mm; } }
  for(const [m,f] of faded){ const tgt=want.has(m)?.18:1; f.a+= (tgt-f.a)*Math.min(1,dt*8); m.material.opacity=f.a; m.castShadow=f.a>.9; if(!want.has(m)&&f.a>.97){ m.material.dispose(); m.material=f.orig; m.castShadow=true; faded.delete(m); } }
  for(const n of Object.values(npcs)){ if(!n.present) continue; let hide=false;
    if(mode==='dialog'&&cam.cine&&!n.talking){ const c=W.camera.position; hide=segDist(c,cam.cine.look,n.g.position.clone().setY(1.3))<1.4||n.g.position.distanceTo(c)<3; }
    n.g.visible=!hide; }
}

// ================= 主循环 =================
let curLoc=null, stepT=0, mmT=0, fogT=0, metT=0; const clock=new THREE.Timer(); const tmp=new V3();
function locAt(p){ const r=S.region; const c=compoundAt(p,r); if(c) return LOC[c];
  for(const L of locsIn(r)){ if(W.isCompound(L)||L.kind==='pavilion'||L.kind==='gate') continue; const g=W.locGroups[L.id]; if(!g) continue; const v=p.clone(); g.worldToLocal(v); const [fx,fz]=frontOf(L); if(Math.hypot(v.x-fx,v.z-fz)<4.4||Math.hypot(v.x,v.z)<3.2) return L; }
  return null; }
function loop(){
  clock.update(); const dt=Math.min(clock.getDelta(),.05), t=clock.getElapsed();
  let mv=new V3();
  if(isPlay()){
    const f=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0)-joy.y, s=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+joy.x;
    if(Math.abs(f)>.1||Math.abs(s)>.1){ playerPath=[]; pendingTalk=null; const fw=new V3(-Math.sin(cam.yaw),0,-Math.cos(cam.yaw)), rt=new V3(-fw.z,0,fw.x); mv.addScaledVector(fw,f).addScaledVector(rt,s); if(mv.length()>1) mv.normalize(); }
    else if(playerPath.length){ const tg=playerPath[0]; mv.set(tg.x-player.position.x,0,tg.z-player.position.z); const d=mv.length(); const last=playerPath.length===1;
      if(pendingTalk && last && player.position.distanceTo(npcs[pendingTalk].g.position)<2.6){ playerPath=[]; const id=pendingTalk; pendingTalk=null; mv.set(0,0,0); openTalk(id); }
      else if(d<(last?.2:.6)){ playerPath.shift(); if(!playerPath.length) mv.set(0,0,0); } else mv.normalize();
      if(pendingTalk && npcs[pendingTalk] && last) playerPath[0]=npcs[pendingTalk].g.position.clone(); }
  }
  const speed=mv.length()*6.2;
  if(speed>0){ const step=mv.clone().multiplyScalar(6.2*dt); const p=player.position; const ox=p.x, oz=p.z;
    if(!W.blocked(p.x+step.x,p.z+step.z)){ p.x+=step.x; p.z+=step.z; } else if(!W.blocked(p.x+step.x,p.z)){ p.x+=step.x; } else if(!W.blocked(p.x,p.z+step.z)){ p.z+=step.z; } else if(playerPath.length) playerPath.shift();
    T.moved+=Math.hypot(p.x-ox,p.z-oz); turnTo(player,Math.atan2(mv.x,mv.z),dt*10); stepT+=dt; if(stepT>.36){ stepT=0; sfx('step'); } }
  player.position.y=W.groundHeight(player.position.x,player.position.z);
  W.animateCharacter(player,dt,t,speed*.45);
  if(marker){ marker.material.opacity=Math.max(0,marker.material.opacity-dt*.7); marker.scale.setScalar(1+(1-marker.material.opacity)*.6); }
  updateNPCs(dt,t);
  nearest=null; let nd=3.4; for(const n of Object.values(npcs)){ if(!n.present||!n.g.visible) continue; const d=n.g.position.distanceTo(player.position); if(d<nd){ nd=d; nearest=n.id; } }
  const tb=$('#talkBtn'); const portal=isPlay()&&!nearest?nearPortal():null;
  if(nearest&&isPlay()){ tb.textContent=`与 ${CHARS[nearest].name} 交谈${isTouch?'':'（E）'}`; tb.classList.remove('hidden','portal'); tb.onclick=()=>openTalk(nearest); }
  else if(portal){ tb.textContent=`前往${REGIONS[portal.to].name}${isTouch?'':'（E）'}`; tb.classList.remove('hidden'); tb.classList.add('portal'); tb.onclick=()=>usePortal(portal); hint('portal'); }
  else tb.classList.add('hidden');
  if(isPlay()){ const loc=locAt(player.position);
    if(loc!==curLoc){ curLoc=loc; const el=$('#locName'); if(loc){ el.textContent=loc.name; el.style.opacity=1; if(!S.seen[loc.id]){ S.seen[loc.id]=1; toast(loc.desc,3800); } clearTimeout(el.h); el.h=setTimeout(()=>el.style.opacity=0,2400); } }
    if(loc){ const ev=pendingEvents().find(e=>e.loc===loc.id); if(ev&&!window.__noEvents) runEvent(ev); }
    for(const it of ITEMS){ if(it.region!==S.region||S.items[it.id]) continue; const o=W.regionOrigin(it.region); if(Math.hypot(player.position.x-o.x-it.pos[0],player.position.z-it.pos[1])<1.5){ collect(it); break; } }
    if((fogT+=dt)>.25){ fogT=0; const lo=localOf(player.position); reveal(S.region,lo.x,lo.z,11); }
    if((metT+=dt)>.5){ metT=0; for(const n of Object.values(npcs)) if(n.present&&n.g.position.distanceTo(player.position)<7) S.met[n.id]=1; } }
  if(window.__camOverride){ const o=window.__camOverride; W.camera.position.set(...o.pos); W.camera.lookAt(...o.look); }
  else if(mode==='title'||mode==='loading'||mode==='prologue'){ const a=t*.04; W.camera.position.set(Math.sin(a)*58,26,Math.cos(a)*58); W.camera.lookAt(0,2,0); }
  else if(cam.cine&&cam.cine.orbit){ const c=cam.cine, a=c.a0+(performance.now()-c.t0)/1000*.06; tmp.set(c.center.x+Math.sin(a)*c.r,c.center.y+6.5,c.center.z+Math.cos(a)*c.r); W.camera.position.lerp(tmp,1-Math.exp(-dt*1.6)); cam.focus.lerp(c.center,1-Math.exp(-dt*2.5)); W.camera.lookAt(cam.focus); }
  else if(cam.cine){ W.camera.position.lerp(cam.cine.pos,1-Math.exp(-dt*5)); cam.focus.lerp(cam.cine.look,1-Math.exp(-dt*6)); W.camera.lookAt(cam.focus); }
  else if(!traveling){ cam.dist+=(cam.tDist-cam.dist)*(1-Math.exp(-dt*6)); const tgt=player.position.clone().add(new V3(0,1.6,0)); cam.focus.lerp(tgt,1-Math.exp(-dt*9));
    const offAt=pt=>new V3(Math.sin(cam.yaw)*Math.cos(pt),Math.sin(pt),Math.cos(cam.yaw)*Math.cos(pt));
    let pt=cam.pitch, dir=offAt(pt); for(let i=0;i<6;i++){ if(W.rayOcc(cam.focus,dir,cam.dist,false).dist>=cam.dist) break; pt=Math.min(1.0,pt+.1); dir=offAt(pt); }
    cam.boost=(cam.boost??cam.pitch)+(pt-(cam.boost??cam.pitch))*(1-Math.exp(-dt*3)); dir=offAt(Math.max(cam.boost,cam.pitch)); let dd=cam.dist; const oh=W.rayOcc(cam.focus,dir,cam.dist,false); if(oh.dist<cam.dist) dd=Math.max(3,oh.dist-.4);
    tmp.copy(cam.focus).addScaledVector(dir,dd); tmp.y=Math.max(tmp.y,1.2); W.camera.position.lerp(tmp,1-Math.exp(-dt*7)); W.camera.lookAt(cam.focus);
    if(keys.q){ cam.yaw+=dt*1.6; T.rot+=dt*1.6; } if(keys.r){ cam.yaw-=dt*1.6; T.rot+=dt*1.6; } }
  updateOcclusion(dt);
  W.followSun(mode==='title'?new V3():player.position); W.tick(dt,t); W.render();
  if(mode!=='title'&&mode!=='loading'&&mode!=='prologue'){ if((trT+=dt)>.3){ trT=0; renderTracker(); } updateQArrow(); updateTutorial(); }
  if(isPlay()&&(mmT+=dt)>.15){ mmT=0; drawMinimap(); }
  requestAnimationFrame(loop);
}
addEventListener('resize',W.resize);
boot().then(()=>loop()).catch(e=>{ console.error(e); $('#loadText').textContent='加载出错：'+e.message; });

// 调试 / 自动化测试接口
window.__game={ cam, W, get S(){return S;}, set S(v){S=v;}, openTalk, runEvent, finish, spendSlot, EVENTS, CHARS, LOC, ITEMS, REGION_DEFS, decideEnding, get mode(){return mode;}, npcs, get player(){return player;}, walkTo, startPlay, load, travel, fastTravel, T, TUT_STEPS, startTutorial, skipTutorial, openPage, closeModal, get quest(){return quest;}, get questW(){return questW;}, nearPortal, usePortal, locTarget, reveal, portalsData, portalWorld, collect, hint, syncPickups };
