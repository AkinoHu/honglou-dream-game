// 3D 世界：大观园场景、建筑、植物、水面、天色、人物模型与动画
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { Sky } from '../vendor/addons/objects/Sky.js';

const rand = (()=>{ let s=20261016; return ()=>((s=Math.imul(s^s>>>15,s|1)^(s+Math.imul(s^s>>>7,s|61)), ((s^s>>>14)>>>0)/4294967296)); })();
const R=(a,b)=>a+(b-a)*rand();

// ---------- 程序化贴图 ----------
function canvasTex(w,h,draw,repeat=[1,1],srgb=true){ const c=document.createElement('canvas'); c.width=w;c.height=h; draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(...repeat); if(srgb)t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t; }
function noiseFill(x,w,h,base,vars,n=6000,sz=3){ x.fillStyle=base; x.fillRect(0,0,w,h); for(let i=0;i<n;i++){ x.fillStyle=vars[i%vars.length]; x.globalAlpha=R(.05,.25); x.fillRect(R(0,w),R(0,h),R(1,sz),R(1,sz)); } x.globalAlpha=1; }
const TEX = {};
function makeTextures(){
  TEX.grass=canvasTex(256,256,(x,w,h)=>{ noiseFill(x,w,h,'#6f8f4a',['#5d7d3c','#86a35a','#7c9450','#a3a865','#4f6c33'],9000,4); },[40,40]);
  TEX.path=canvasTex(256,256,(x,w,h)=>{ x.fillStyle='#bfb39a';x.fillRect(0,0,w,h); for(let r=0;r<8;r++)for(let c=0;c<8;c++){ const o=r%2?16:0; x.fillStyle=`hsl(38,${R(10,20)}%,${R(62,74)}%)`; x.fillRect(c*32+o+1,r*32+1,30,30);} x.strokeStyle='#8a7d66'; },[1,8]);
  TEX.tile=canvasTex(128,128,(x,w,h)=>{ x.fillStyle='#2d3238';x.fillRect(0,0,w,h); for(let i=0;i<8;i++){ const g=x.createLinearGradient(i*16,0,i*16+16,0); g.addColorStop(0,'#1c2026');g.addColorStop(.5,'#5a626c');g.addColorStop(1,'#1c2026'); x.fillStyle=g; x.fillRect(i*16,0,16,h);} for(let j=0;j<8;j++){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,j*16,w,2);} },[6,6]);
  TEX.lattice=canvasTex(128,128,(x,w,h)=>{ x.fillStyle='#f3e6c8';x.fillRect(0,0,w,h); x.strokeStyle='#7a2418';x.lineWidth=5; x.strokeRect(2,2,w-4,h-4); x.lineWidth=3; for(let i=1;i<6;i++){x.beginPath();x.moveTo(i*w/6,0);x.lineTo(i*w/6,h);x.stroke();x.beginPath();x.moveTo(0,i*h/6);x.lineTo(w,i*h/6);x.stroke();} x.beginPath(); x.arc(w/2,h/2,22,0,7); x.stroke(); });
  TEX.beam=canvasTex(256,32,(x,w,h)=>{ x.fillStyle='#1f4d5c';x.fillRect(0,0,w,h); x.fillStyle='#3f8a7a'; for(let i=0;i<8;i++){x.beginPath();x.ellipse(i*32+16,16,12,9,0,0,7);x.fill();} x.fillStyle='#d4af37';x.fillRect(0,0,w,3);x.fillRect(0,h-3,w,3); x.fillStyle='#e8c8a0'; for(let i=0;i<8;i++){x.beginPath();x.arc(i*32+16,16,4,0,7);x.fill();} },[2,1]);
  TEX.wall=canvasTex(128,128,(x,w,h)=>noiseFill(x,w,h,'#ece4d4',['#d9d0bd','#f6f0e4','#cfc3aa'],2500,6),[4,1]);
  TEX.stone=canvasTex(128,128,(x,w,h)=>noiseFill(x,w,h,'#9a978c',['#7d7a70','#b5b2a6','#6b6960','#a8a69b'],5000,5));
  TEX.waterN=canvasTex(256,256,(x,w,h)=>{ x.fillStyle='rgb(128,128,255)';x.fillRect(0,0,w,h); for(let i=0;i<500;i++){ const r=R(4,20),cx=R(0,w),cy=R(0,h); const g=x.createRadialGradient(cx,cy,0,cx,cy,r); g.addColorStop(0,`rgba(${R(100,160)|0},${R(100,160)|0},255,.5)`); g.addColorStop(1,'rgba(128,128,255,0)'); x.fillStyle=g; x.fillRect(cx-r,cy-r,2*r,2*r);} },[6,6],false);
}

// ---------- 渲染器 ----------
export const canvas=document.getElementById('c');
export const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
const LOWQ = matchMedia('(max-width:700px)').matches || navigator.hardwareConcurrency<=4;
renderer.setPixelRatio(Math.min(devicePixelRatio, LOWQ?1.25:1.6));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.9;
export const scene=new THREE.Scene();
export const camera=new THREE.PerspectiveCamera(45,1,.1,600);
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(512,512),.35,.6,.82); composer.addPass(bloom);
composer.addPass(new OutputPass());

const sky=new Sky(); sky.scale.setScalar(450); scene.add(sky);
const skyU=sky.material.uniforms; skyU.turbidity.value=6; skyU.rayleigh.value=1.6; skyU.mieCoefficient.value=.006; skyU.mieDirectionalG.value=.85;
const hemi=new THREE.HemisphereLight(0xfff0d8,0x5a6a40,.8); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0d0,2.2); sun.castShadow=true; sun.shadow.mapSize.set(LOWQ?1024:2048,LOWQ?1024:2048);
Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:160}); sun.shadow.bias=-.0004; sun.shadow.normalBias=.03; scene.add(sun,sun.target);
scene.fog=new THREE.FogExp2(0xefe2c4,.005);
const pmrem=new THREE.PMREMGenerator(renderer);

const mats={}; function M(c,o={}){ const k=c+JSON.stringify(Object.keys(o)); if(!o.map&&!o.noCache&&mats[k]) return mats[k]; const {noCache,...oo}=o; const m=new THREE.MeshStandardMaterial({color:c,roughness:.85,...oo}); if(!o.map) mats[k]=m; return m; }
function mesh(geo,mat,x=0,y=0,z=0,parent=scene,shadow=true){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=shadow; m.receiveShadow=true; parent.add(m); return m; }
const BOX=(w,h,d,mat,x,y,z,p)=>mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,p);
const CYL=(rt,rb,h,mat,x,y,z,p,seg=12)=>mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat,x,y,z,p);

// ---------- 曲面屋顶（反宇飞檐） ----------
function roofGeo(w,d,h,{seg=18,upturn=.9,ridge=.0}={}){
  const g=new THREE.BufferGeometry(); const pos=[],uv=[],idx=[];
  for(let j=0;j<=seg;j++)for(let i=0;i<=seg;i++){
    const u=i/seg*2-1, v=j/seg*2-1; const au=Math.abs(u), av=Math.abs(v);
    const m = Math.max(au, av*(1-ridge)+ (ridge?0:0)); const mr = ridge? Math.max(Math.max(0,(au-ridge)/(1-ridge)),av):m;
    let y=h*Math.pow(1-mr,1.7); y+=upturn*Math.pow(au*av,4)+upturn*.25*Math.pow(mr,6);
    pos.push(u*w/2,y,v*d/2); uv.push(u*w/4,v*d/4+y);
  }
  for(let j=0;j<seg;j++)for(let i=0;i<seg;i++){ const a=j*(seg+1)+i,b=a+1,c=a+seg+1,d2=c+1; idx.push(a,c,b,b,c,d2); }
  g.setIndex(idx); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.computeVertexNormals(); return g;
}
let roofMat;
function roof(parent,w,d,h,y,{ridge=0,upturn=.9,ridgeColor=0x222830}={}){
  const r=mesh(roofGeo(w,d,h,{ridge,upturn}),roofMat,0,y,0,parent); 
  const under=mesh(roofGeo(w*.98,d*.98,h*.95,{ridge,upturn}),M(0x5a2a1a,{side:THREE.BackSide}),0,y-.08,0,parent,false);
  if(ridge){ BOX(w*ridge*1.05,.35,.35,M(ridgeColor),0,y+h+.1,0,parent); for(const s of[-1,1]){ const o=mesh(new THREE.ConeGeometry(.18,.6,6),M(ridgeColor),s*w*ridge/2,y+h+.4,0,parent); o.rotation.z=-s*.5; } }
  else mesh(new THREE.SphereGeometry(.28,10,8),M(0xd4af37,{metalness:.7,roughness:.3}),0,y+h+.15,0,parent);
  // 檐角风铃
  for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]]) mesh(new THREE.ConeGeometry(.08,.25,6),M(0xb8860b,{metalness:.8,roughness:.3}),a*w/2,y+upturn-.15,b*d/2,parent,false);
  return r;
}

// ---------- 建筑部件 ----------
const P = {};
function initMats(){
  roofMat=new THREE.MeshStandardMaterial({map:TEX.tile,roughness:.6,metalness:.15,side:THREE.DoubleSide,color:0xbfc6d0});
  Object.assign(P,{ pillar:M(0x8e1b16,{roughness:.45}), stone:new THREE.MeshStandardMaterial({map:TEX.stone,roughness:.95}), marble:M(0xeae6dc,{roughness:.6}),
    lattice:new THREE.MeshStandardMaterial({map:TEX.lattice,roughness:.8}), beam:new THREE.MeshStandardMaterial({map:TEX.beam,roughness:.6}),
    wall:new THREE.MeshStandardMaterial({map:TEX.wall,roughness:.95}), wood:M(0x6a3a22,{roughness:.7}), gold:M(0xd4af37,{metalness:.8,roughness:.3}), dark:M(0x2a2a30) });
}
function hall(parent,w,d,H,{double=false,ridge=.45}={}){
  // 台基+台阶
  BOX(w+2,.7,d+2,P.stone,0,.35,0,parent); for(let i=0;i<3;i++) BOX(3,.23,.5,P.stone,0,.12+i*.23,d/2+1.6-i*.4,parent);
  const cols=Math.max(4,Math.round(w/2.2)); 
  for(let i=0;i<cols;i++){ const x=-w/2+i*w/(cols-1); for(const z of[-d/2,d/2]){ CYL(.2,.22,H,P.pillar,x,.7+H/2,z,parent); CYL(.32,.32,.15,P.stone,x,.78,z,parent); } }
  for(const x of[-w/2,w/2]) CYL(.2,.22,H,P.pillar,x,.7+H/2,0,parent);
  // 墙与格扇窗
  const inner=new THREE.Group(); parent.add(inner);
  for(let i=0;i<cols-1;i++){ const x=-w/2+(i+.5)*w/(cols-1), seg=w/(cols-1)-.45; const isDoor=i===Math.floor((cols-1)/2);
    BOX(seg,isDoor?H-.6:H-1.6,.12,P.lattice,x,.7+(isDoor?(H-.6)/2:1.2+(H-1.6)/2),d/2-.25,inner);
    if(!isDoor) BOX(seg,1.2,.2,P.wood,x,.7+.6,d/2-.25,inner);
    BOX(seg,H-.4,.2,P.wall,x,.7+(H-.4)/2,-d/2+.2,inner); }
  for(const x of[-w/2+.2,w/2-.2]) BOX(.2,H-.4,d-.4,P.wall,x,.7+(H-.4)/2,0,inner);
  // 额枋彩画
  for(const z of[-d/2,d/2]) BOX(w+.4,.5,.3,P.beam,0,.7+H-.1,z,parent);
  for(const x of[-w/2,w/2]) BOX(.3,.5,d+.4,P.beam,x,.7+H-.1,0,parent);
  BOX(w+.6,.25,d+.6,P.wood,0,.7+H+.25,0,parent);
  roof(parent,w+3.2,d+3.2,H*.62,.7+H+.35,{ridge});
  if(double){ const y=.7+H+.35+H*.62*.55; BOX(w*.55,1,d*.55,P.pillar,0,y+.3,0,parent); roof(parent,w*.75,d*.75,H*.5,y+.8,{ridge}); }
}
function pavilion(parent,r,H,{sides=6,double=true}={}){
  mesh(new THREE.CylinderGeometry(r+.6,r+.8,.6,sides),P.stone,0,.3,0,parent);
  for(let i=0;i<sides;i++){ const a=i/sides*Math.PI*2; CYL(.16,.18,H,P.pillar,Math.cos(a)*r,.6+H/2,Math.sin(a)*r,parent); 
    const a2=(i+.5)/sides*Math.PI*2, L=2*r*Math.sin(Math.PI/sides); const rail=BOX(L,.5,.12,P.wood,Math.cos(a2)*r*.92,.95,Math.sin(a2)*r*.92,parent); rail.rotation.y=-a2+Math.PI/2; }
  const ring=mesh(new THREE.CylinderGeometry(r+.15,r+.15,.4,sides,1,true),P.beam,0,.6+H,0,parent);
  const rg=roofGeo(2*r+2.6,2*r+2.6,H*.8,{upturn:.8}); const rf=mesh(rg,roofMat,0,.6+H+.1,0,parent); rf.rotation.y=Math.PI/4;
  if(double){ const r2=mesh(roofGeo(2*r,2*r,H*.6,{upturn:.6}),roofMat,0,.6+H+H*.5,0,parent); }
  mesh(new THREE.SphereGeometry(.3,10,8),P.gold,0,.6+H+H*1.1+.2,0,parent);
}
function compoundWall(parent,w,d,{gate=true}={}){
  const H=2.6, mat=P.wall;
  const seg=(x,z,len,rotY)=>{ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY; parent.add(g); BOX(len,H,.5,mat,0,H/2,0,g); const c=BOX(len+.3,.25,1,roofMat,0,H+.12,0,g); BOX(len+.3,.18,.3,P.dark,0,H+.32,0,g); };
  seg(0,-d/2,w,0); seg(-w/2,0,d,Math.PI/2); seg(w/2,0,d,Math.PI/2);
  const side=(w-5)/2; seg(-w/2+side/2,d/2,side,0); seg(w/2-side/2,d/2,side,0);
  if(gate){ // 月洞门
    const s=new THREE.Shape(); s.moveTo(-2.5,0); s.lineTo(2.5,0); s.lineTo(2.5,H); s.lineTo(-2.5,H); s.closePath();
    const hole=new THREE.Path(); hole.absarc(0,1.25,1.15,0,Math.PI*2,true); s.holes.push(hole);
    const gm=mesh(new THREE.ExtrudeGeometry(s,{depth:.5,bevelEnabled:false}),mat,0,0,d/2-.25,parent);
    const fr=mesh(new THREE.TorusGeometry(1.2,.08,8,40),P.dark,0,1.25,d/2+.27,parent,false);
    BOX(5.3,.25,1,roofMat,0,H+.12,d/2,parent);
  }
}
function railing(parent,len,x,z,rotY){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY; parent.add(g); BOX(len,.08,.08,P.marble,0,.9,0,g); for(let i=0;i<=len;i+=1) BOX(.12,.9,.12,P.marble,-len/2+i,.45,0,g); return g; }

// ---------- 植物 ----------
const plantInst=[]; // 用于风动
const trunks=[];
function willow(x,z,s=1){ const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); scene.add(g);
  trunks.push(CYL(.18,.32,3.4,M(0x5a4030),0,1.7,0,g,7));
  const crown=mesh(new THREE.SphereGeometry(1.6,10,8),M(0x8fae55,{roughness:.9}),0,3.8,0,g); crown.scale.y=.6;
  const strand=new THREE.CylinderGeometry(.03,.015,1,3); strand.translate(0,-.5,0);
  const inst=new THREE.InstancedMesh(strand,M(0x9cbf5a,{roughness:.9}),46); const o=new THREE.Object3D();
  for(let i=0;i<46;i++){ const a=R(0,6.28), r=R(.6,2); o.position.set(Math.cos(a)*r,R(3.4,4.1),Math.sin(a)*r); o.scale.set(R(2,4),R(2,3.4),R(2,4)); o.rotation.set(R(-.05,.05),0,R(-.05,.05)); o.updateMatrix(); inst.setMatrixAt(i,o.matrix);} inst.castShadow=true; g.add(inst);
  plantInst.push({o:g,k:.02,ph:R(0,6)}); return g; }
function plum(x,z,s=1,col=0xd2304a){ const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); scene.add(g);
  const bm=M(0x3a2a22); const tips=[];
  const branch=(p,dir,len,r,depth)=>{ const e=p.clone().addScaledVector(dir,len); const c=mesh(new THREE.CylinderGeometry(r*.6,r,len,5),bm,0,0,0,g); c.position.copy(p).lerp(e,.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir); if(depth<3){ for(let k=0;k<2;k++){ const nd=dir.clone().add(new THREE.Vector3(R(-.9,.9),R(-.1,.6),R(-.9,.9))).normalize(); branch(e,nd,len*.7,r*.6,depth+1);} } else tips.push(e); };
  branch(new THREE.Vector3(0,0,0),new THREE.Vector3(R(-.2,.2),1,R(-.2,.2)).normalize(),1.8,.22,0);
  const inst=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.13,0),M(col,{emissive:col,emissiveIntensity:.15,roughness:.6}),tips.length*9); const o=new THREE.Object3D(); let n=0;
  for(const t of tips) for(let k=0;k<9;k++){ o.position.copy(t).add(new THREE.Vector3(R(-.6,.6),R(-.5,.4),R(-.6,.6))); o.scale.setScalar(R(.6,1.3)); o.updateMatrix(); inst.setMatrixAt(n++,o.matrix);} g.add(inst);
  return g; }
function broadTree(x,z,s=1,cols=[0x4d7a3a,0x5e8c45,0x3f6a30]){ const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); scene.add(g);
  trunks.push(CYL(.22,.38,3,M(0x4a3626),0,1.5,0,g,7));
  for(let i=0;i<5;i++){ const b=mesh(new THREE.IcosahedronGeometry(R(1,1.6),1),M(cols[i%cols.length],{flatShading:true,roughness:.9}),R(-1,1),R(3.2,4.6),R(-1,1),g); b.scale.y=R(.7,.9); }
  plantInst.push({o:g,k:.01,ph:R(0,6)}); return g; }
function pine(x,z,s=1){ const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); scene.add(g); CYL(.2,.35,4,M(0x5a3a28),0,2,0,g,6);
  for(let i=0;i<4;i++){ const p=mesh(new THREE.CylinderGeometry(.2,R(1.2,1.8),.5,8),M(0x2f5a3a,{flatShading:true}),R(-.6,.6),2.2+i*.8,R(-.6,.6),g); } return g; }
function bambooGrove(cx,cz,n=40,rad=4){ const culm=new THREE.CylinderGeometry(.07,.09,1,6); culm.translate(0,.5,0);
  const inst=new THREE.InstancedMesh(culm,M(0x6f9a48,{roughness:.5}),n); const leafG=new THREE.ConeGeometry(.5,1.6,4); const leaves=new THREE.InstancedMesh(leafG,M(0x5c8f3e,{flatShading:true}),n*3); const o=new THREE.Object3D();
  for(let i=0;i<n;i++){ const a=R(0,6.28),r=Math.sqrt(rand())*rad, h=R(5,8); o.position.set(cx+Math.cos(a)*r,0,cz+Math.sin(a)*r); o.rotation.set(R(-.08,.08),0,R(-.08,.08)); o.scale.set(1,h,1); o.updateMatrix(); inst.setMatrixAt(i,o.matrix);
    for(let k=0;k<3;k++){ const l=new THREE.Object3D(); l.position.set(o.position.x+R(-.4,.4),h*R(.65,1),o.position.z+R(-.4,.4)); l.rotation.set(R(-.6,.6),R(0,6),R(-.6,.6)); l.updateMatrix(); leaves.setMatrixAt(i*3+k,l.matrix);} }
  inst.castShadow=leaves.castShadow=true; scene.add(inst,leaves); }
function rockery(x,z,s=1){ const geo=new THREE.IcosahedronGeometry(1,2); const p=geo.attributes.position; for(let i=0;i<p.count;i++){ const v=new THREE.Vector3().fromBufferAttribute(p,i); const n=1+.35*Math.sin(v.x*3.1+v.y*2)*Math.cos(v.z*2.7)+.2*Math.sin(v.y*7); v.multiplyScalar(n); p.setXYZ(i,v.x,v.y,v.z);} geo.computeVertexNormals();
  const g=new THREE.Group(); g.position.set(x,0,z); scene.add(g);
  for(let i=0;i<3;i++){ const m=mesh(geo,new THREE.MeshStandardMaterial({map:TEX.stone,color:0xb8bcc0,roughness:.95,flatShading:true}),R(-.8,.8)*s,R(.8,1.6)*s,R(-.8,.8)*s,g); m.scale.set(s*R(.7,1),s*R(1.2,2),s*R(.7,1)); m.rotation.set(R(0,3),R(0,3),R(0,3)); }
  return g; }
function flowers(cx,cz,n,rad,cols){ const inst=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.12,0),new THREE.MeshStandardMaterial({roughness:.6}),n); const o=new THREE.Object3D(); const c=new THREE.Color();
  for(let i=0;i<n;i++){ const a=R(0,6.28),r=Math.sqrt(rand())*rad; o.position.set(cx+Math.cos(a)*r,R(.15,.5),cz+Math.sin(a)*r); o.updateMatrix(); inst.setMatrixAt(i,o.matrix); inst.setColorAt(i,c.setHex(cols[i%cols.length])); } scene.add(inst); }
function grassTufts(n){ const g=new THREE.ConeGeometry(.035,.32,3); g.translate(0,.16,0); const inst=new THREE.InstancedMesh(g,M(0x86a855),n); const o=new THREE.Object3D(); let k=0;
  while(k<n){ const x=R(-46,46),z=R(-46,46); if(Math.hypot(x,z)<11) continue; o.position.set(x,0,z); o.rotation.set(R(-.3,.3),R(0,3),R(-.3,.3)); o.scale.setScalar(R(.6,1.3)); o.updateMatrix(); inst.setMatrixAt(k++,o.matrix);} inst.receiveShadow=true; scene.add(inst); }

// ---------- 大观园 ----------
export const locGroups={}; export const occluders=[]; export const lanterns=[]; const lights=[];
let water, ground, stars, moon, petals, fireflies;
export function getGround(){ return ground; }
function lantern(parent,x,y,z){ const l=mesh(new THREE.SphereGeometry(.32,12,10),new THREE.MeshStandardMaterial({color:0xd8301c,emissive:0xff4020,emissiveIntensity:.3,roughness:.5}),x,y,z,parent,false); l.scale.y=1.25; BOX(.3,.08,.3,P.gold,x,y+.42,z,parent); BOX(.04,.25,.04,M(0xd4af37),x,y-.5,z,parent); lanterns.push(l); return l; }

export function buildWorld(LOCATIONS){
  makeTextures(); initMats();
  // 地形
  const gg=new THREE.PlaneGeometry(260,260,90,90); const p=gg.attributes.position;
  for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i); const r=Math.max(Math.abs(x),Math.abs(y)); let h=Math.sin(x*.15)*Math.cos(y*.13)*.15; if(r>52) h+=(r-52)*.5+Math.sin(x*.08)*Math.cos(y*.09)*6; p.setZ(i,h);} gg.computeVertexNormals();
  ground=new THREE.Mesh(gg,new THREE.MeshStandardMaterial({map:TEX.grass,roughness:1})); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
  // 远山（水墨）
  for(let i=0;i<14;i++){ const a=i/14*Math.PI*2, r=R(150,190); const m=mesh(new THREE.ConeGeometry(R(25,45),R(25,50),7),new THREE.MeshBasicMaterial({color:0x8a9aa0,fog:true}),Math.cos(a)*r,0,Math.sin(a)*r,scene,false); m.position.y=m.geometry.parameters.height/2-3; }
  // 中心池塘（沁芳池）+ 溪
  const shape=new THREE.Shape(); for(let i=0;i<=48;i++){ const a=i/48*Math.PI*2, r=11+Math.sin(a*3)*1.6+Math.cos(a*5)*.8; i?shape.lineTo(Math.cos(a)*r,Math.sin(a)*r):shape.moveTo(Math.cos(a)*r,Math.sin(a)*r);} 
  const wm=new THREE.MeshStandardMaterial({color:0x3f6f78,roughness:.08,metalness:.35,normalMap:TEX.waterN,normalScale:new THREE.Vector2(.35,.35),transparent:true,opacity:.92});
  water=mesh(new THREE.ShapeGeometry(shape,64),wm,0,.12,0,scene,false); water.rotation.x=-Math.PI/2;
  const bank=mesh(new THREE.TorusGeometry(11.3,.5,6,64),P.stone,0,.1,0,scene); bank.rotation.x=Math.PI/2; bank.scale.set(1.08,1.04,.6);
  const stream=mesh(new THREE.PlaneGeometry(3.4,58),wm,10,.11,22,scene,false); stream.rotation.set(-Math.PI/2,0,.62);
  // 荷叶荷花
  const pad=new THREE.CircleGeometry(.55,14,.3,5.9); pad.rotateX(-Math.PI/2); const pads=new THREE.InstancedMesh(pad,M(0x4f8a3c,{side:THREE.DoubleSide,roughness:.6}),70); const o=new THREE.Object3D();
  const lotusPetal=new THREE.SphereGeometry(.22,8,6,0,Math.PI*2,0,Math.PI/2); lotusPetal.scale(1,1.6,1);
  let k=0; while(k<70){ const a=R(0,6.28), r=R(5,10); const x=Math.cos(a)*r,z=Math.sin(a)*r; if(Math.abs(x)<2.4) continue; o.position.set(x,.16,z); o.rotation.y=R(0,6); o.scale.setScalar(R(.7,1.4)); o.updateMatrix(); pads.setMatrixAt(k++,o.matrix);
    if(k%5===0){ const f=mesh(lotusPetal,M(0xf3a6bd,{emissive:0xff8aa8,emissiveIntensity:.15}),x,.35,z,scene,false); } } scene.add(pads);
  // 小径（铺地）
  for(const L of LOCATIONS){ if(L.kind==='pavilion') continue; const [x,z]=L.pos; const len=Math.hypot(x,z)-11; const t=TEX.path.clone(); t.repeat.set(1,len/3); t.needsUpdate=true;
    const pm=mesh(new THREE.PlaneGeometry(2.6,len),new THREE.MeshStandardMaterial({map:t,roughness:.95}),0,.05,0,scene,false); const dx=x/Math.hypot(x,z),dz=z/Math.hypot(x,z); pm.position.set(dx*(11+len/2),.05,dz*(11+len/2)); pm.rotation.set(-Math.PI/2,0,Math.atan2(dx,dz)); pm.rotation.order='YXZ'; pm.rotation.set(-Math.PI/2,Math.atan2(dx,dz),0); }
  // 外围园墙
  for(const [x,z,w,rot] of [[0,-50,100,0],[0,50,100,0],[-50,0,100,Math.PI/2],[50,0,100,Math.PI/2]]){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rot; scene.add(g); BOX(w,3.4,.7,P.wall,0,1.7,0,g); BOX(w+.6,.3,1.3,roofMat,0,3.55,0,g); BOX(w+.6,.2,.35,P.dark,0,3.8,0,g); for(let i=-w/2+6;i<w/2;i+=12){ const win=BOX(1.2,1.2,.75,P.lattice,i,2,0,g);} }
  // 各处院落
  for(const L of LOCATIONS){ const g=new THREE.Group(); const [x,z]=L.pos; g.position.set(x,0,z); g.lookAt(0,0,0); scene.add(g); locGroups[L.id]=g; buildLoc(L,g); if(L.kind!=='pavilion') g.traverse(o=>{ if(o.isMesh&&!o.isInstancedMesh) occluders.push(o); }); }
  // 拱桥（沁芳闸桥）连亭
  for(const ang of [Math.PI/2, -Math.PI/2]) archBridge(Math.cos(ang)*6.6, Math.sin(ang)*6.6, ang);
  // 长廊：沁芳亭→秋爽斋、→怡红院 方向
  for(const id of ['qiushuang','yihong','hengwu']){ const L=LOCATIONS.find(l=>l.id===id); const d=new THREE.Vector3(L.pos[0],0,L.pos[1]); const n=d.length(); d.normalize(); corridor(d.clone().multiplyScalar(13.5), d.clone().multiplyScalar(n-9)); }
  // 景观植物
  for(let i=0;i<10;i++){ const a=i/10*Math.PI*2+.2; willow(Math.cos(a)*13.5,Math.sin(a)*13.5,R(.9,1.15)); }
  for(let i=0;i<45;i++){ const x=R(-46,46),z=R(-46,46); if(Math.hypot(x,z)<15||LOCATIONS.some(L=>Math.hypot(L.pos[0]-x,L.pos[1]-z)<14)) continue; [broadTree,broadTree,pine,plum][i%4](x,z,R(.8,1.2)); }
  for(let i=0;i<12;i++){ const a=R(0,6.28),r=R(14,40); const x=Math.cos(a)*r,z=Math.sin(a)*r; if(LOCATIONS.some(L=>Math.hypot(L.pos[0]-x,L.pos[1]-z)<14)) continue; rockery(x,z,R(.7,1.2)); }
  occluders.push(...trunks);
  rockery(-4,-12.5,1.4); rockery(5,12.8,1.1);
  grassTufts(LOWQ?900:2200);
  for(let i=0;i<10;i++){ const a=R(0,6.28),r=R(15,42); flowers(Math.cos(a)*r,Math.sin(a)*r,40,2,[0xf2c14e,0xe86f8a,0xffffff,0xb07ad8]); }
  // 粒子：花瓣 / 雪
  const PN=LOWQ?350:700, pg=new THREE.BufferGeometry(), pa=new Float32Array(PN*3); for(let i=0;i<PN;i++){ pa[i*3]=R(-60,60); pa[i*3+1]=R(0,25); pa[i*3+2]=R(-60,60);} pg.setAttribute('position',new THREE.BufferAttribute(pa,3));
  const pt=canvasTex(32,32,(x)=>{ const g=x.createRadialGradient(16,16,0,16,16,16); g.addColorStop(0,'#fff');g.addColorStop(.5,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.beginPath(); x.ellipse(16,16,15,9,.6,0,7); x.fill(); });
  petals=new THREE.Points(pg,new THREE.PointsMaterial({color:0xffb7c5,size:.42,map:pt,transparent:true,depthWrite:false})); scene.add(petals);
  // 萤火虫（夜）
  const FN=120, fg=new THREE.BufferGeometry(), fa=new Float32Array(FN*3); for(let i=0;i<FN;i++){ fa[i*3]=R(-40,40); fa[i*3+1]=R(.5,3); fa[i*3+2]=R(-40,40);} fg.setAttribute('position',new THREE.BufferAttribute(fa,3));
  fireflies=new THREE.Points(fg,new THREE.PointsMaterial({color:0xffe9a0,size:.25,map:pt,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); scene.add(fireflies);
  // 星与月
  const SN=800, sg=new THREE.BufferGeometry(), sa=new Float32Array(SN*3); for(let i=0;i<SN;i++){ const v=new THREE.Vector3(R(-1,1),R(.15,1),R(-1,1)).normalize().multiplyScalar(400); sa.set([v.x,v.y,v.z],i*3);} sg.setAttribute('position',new THREE.BufferAttribute(sa,3));
  stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:1.4,sizeAttenuation:false,transparent:true,fog:false})); scene.add(stars);
  moon=new THREE.Mesh(new THREE.CircleGeometry(14,32),new THREE.MeshBasicMaterial({color:0xfff6d8,fog:false})); moon.position.set(-150,160,-250); moon.lookAt(0,0,0); scene.add(moon);
  // 夜灯（少量点光）
  for(const id of ['yihong','xiaoxiang','qinfang','hengwu']){ const L=LOCATIONS.find(l=>l.id===id); const pl=new THREE.PointLight(0xff9a50,0,18,1.6); pl.position.set(L.pos[0]*.85,3,L.pos[1]*.85); scene.add(pl); lights.push(pl); }
}
function buildLoc(L,g){
  const flip=new THREE.Group(); flip.rotation.y=0; g.add(flip);
  if(L.kind==='pavilion'){ pavilion(flip,2.6,3.2,{sides:6}); for(const a of [1.2,-1.2,2.4]) lantern(flip,Math.sin(a)*2.6,3.2,Math.cos(a)*2.6); return; }
  // 院落：正房+院墙+月洞门（门朝向园心，即 +z）
  const W=L.kind==='hall'?11:L.kind==='farm'?8:9;
  hall(flip,W,5.5,L.kind==='hall'?4:3.4,{double:L.kind==='hall'||L.id==='yihong'});
  compoundWall(flip,W+9,16,{}); flip.children.forEach(c=>{}); 
  // 院墙整体向后：正房在院内北侧
  // 匾额
  const sign=signBoard(L.name); sign.position.set(0,.7+(L.kind==='hall'?4:3.4)+.05,5.5/2+.35); flip.add(sign);
  const gateSign=signBoard(L.name,.7); gateSign.position.set(0,3.25,8.3); flip.add(gateSign);
  lantern(flip,-2.2,3,8.6); lantern(flip,2.2,3,8.6); lantern(flip,-2.6,3.6,3.4); lantern(flip,2.6,3.6,3.4);
  // 院中景致
  const toWorld=(lx,lz)=>{ const v=new THREE.Vector3(lx,0,lz); g.localToWorld(v); return v; };
  g.updateMatrixWorld(true);
  const plant=(fn,lx,lz,...a)=>{ const v=toWorld(lx,lz); fn(v.x,v.z,...a); };
  if(L.kind==='bamboo'){ const v=toWorld(-5,0); bambooGrove(v.x,v.z,60,3.5); const v2=toWorld(5.5,0); bambooGrove(v2.x,v2.z,50,3); const v3=toWorld(0,-9.5); bambooGrove(v3.x,v3.z,50,6); }
  if(L.kind==='flowers'){ plant(broadTree,-5,5,1,[0x5c9a3a,0x6fae45]); plant(plum,5,5,1.1,0xf06b8a); plant(plum,-6,-1,.9,0xf6a6bd); const v=toWorld(4,6); flowers(v.x,v.z,60,1.8,[0xe8455a,0xf6a6bd]); }
  if(L.kind==='stone'){ plant(rockery,-5,5,1); plant(rockery,5,4,.9); plant(rockery,0,-9,1.4); const v=toWorld(0,6); flowers(v.x,v.z,40,3,[0x9acd32,0xe6e6a0]); }
  if(L.kind==='plum'){ for(const [a,b] of [[-5,5],[5,5],[-6,-1],[6,-1],[-3,-9],[4,-9]]) plant(plum,a,b,R(1,1.3),0xc8102e); }
  if(L.kind==='tree'){ plant(broadTree,-5,5,1.3,[0xc98a2b,0xd9a441,0xa8642a]); plant(broadTree,5,5,1.1,[0x5c8a3a,0x6f9e45]); }
  if(L.kind==='farm'){ const v=toWorld(0,14); const rows=new THREE.InstancedMesh(new THREE.ConeGeometry(.12,1,4),M(0xd8b04a),300); const o=new THREE.Object3D(); for(let i=0;i<300;i++){ const lv=toWorld(-6+(i%30)*.42,12+Math.floor(i/30)*.6); o.position.set(lv.x,.5,lv.z); o.updateMatrix(); rows.setMatrixAt(i,o.matrix);} scene.add(rows); plant(willow,-6,5,.9); plant(broadTree,6,4,1); }
  if(L.kind==='hall'){ plant(pine,-6,5,1.2); plant(pine,6,5,1.2); const v=toWorld(0,6); /* 铜鼎 */ CYL(.6,.45,.9,P.gold,0,1.1,5.5,flip); }
}
function signBoard(text,s=1){ const c=document.createElement('canvas'); c.width=256;c.height=96; const x=c.getContext('2d'); x.fillStyle='#1d2438';x.fillRect(0,0,256,96); x.strokeStyle='#d4af37';x.lineWidth=8;x.strokeRect(6,6,244,84); x.fillStyle='#e8c76a'; x.font='bold 52px "Ma Shan Zheng","STKaiti","KaiTi",serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(text,128,52);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; const m=new THREE.Mesh(new THREE.PlaneGeometry(2.4*s,.9*s),new THREE.MeshStandardMaterial({map:t,roughness:.6})); m.userData.redraw=()=>{ x.fillStyle='#1d2438';x.fillRect(12,12,232,72); x.fillStyle='#e8c76a'; x.font='bold 52px "Ma Shan Zheng","STKaiti","KaiTi",serif'; x.fillText(text,128,52); t.needsUpdate=true; }; signs.push(m); return m; }
export const signs=[];
function archBridge(x,z,ang){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=-ang; scene.add(g);
  const s=new THREE.Shape(); const L=5,H=1.4; s.moveTo(-L/2-.6,0); s.quadraticCurveTo(0,H*2,L/2+.6,0); s.lineTo(L/2,0); s.quadraticCurveTo(0,H*1.2,-L/2,0); s.closePath();
  const geo=new THREE.ExtrudeGeometry(s,{depth:2.2,bevelEnabled:false,curveSegments:24}); geo.translate(0,0,-1.1); mesh(geo,P.marble,0,0,0,g);
  for(const zz of[-1.15,1.15]){ for(let i=-5;i<=5;i++){ const t=i/5; const xx=t*(L/2+.3), y=H*(1-t*t)+.05; BOX(.1,.7,.1,P.marble,xx,y+.35,zz,g);} const rail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-L/2-.3,.7,zz),new THREE.Vector3(0,H*2+.7,zz),new THREE.Vector3(L/2+.3,.7,zz)),20,.05,5),P.marble); g.add(rail); }
}
function corridor(a,b){ const dir=b.clone().sub(a), len=dir.length(); const g=new THREE.Group(); g.position.copy(a).lerp(b,.5); g.rotation.y=Math.atan2(dir.x,dir.z); scene.add(g);
  BOX(2.6,.3,len,P.stone,0,.15,0,g); for(let i=0;i<=len;i+=2.2) for(const s of[-1,1]){ CYL(.11,.12,2.6,P.pillar,s*1.1,1.6,-len/2+i,g,8); }
  for(const s of[-1,1]) BOX(.15,.25,len,P.beam,s*1.1,2.9,0,g);
  mesh(roofGeo(3.8,len+1,.9,{upturn:.35}),roofMat,0,3,0,g);
  for(let i=1;i<len;i+=4.4) lantern(g,0,2.6,-len/2+i);
}

// ---------- 人物 ----------
function faceTex(style){ return canvasTex(256,128,(x,w,h)=>{ x.fillStyle=style.skin||'#f6dcc4'; x.fillRect(0,0,w,h); const cx=w*.25, cy=h*.56;
  // 腮红
  for(const s of[-1,1]){ const g=x.createRadialGradient(cx+s*15,cy+10,0,cx+s*15,cy+10,10); g.addColorStop(0,style.blush||'rgba(235,120,130,.45)'); g.addColorStop(1,'rgba(235,120,130,0)'); x.fillStyle=g; x.fillRect(cx+s*15-12,cy-2,24,24); }
  // 眉
  x.strokeStyle='#2a1a14'; x.lineWidth=1.6; for(const s of[-1,1]){ x.beginPath(); x.moveTo(cx+s*5,cy-12+(style.sad?s*0:0)); x.quadraticCurveTo(cx+s*10,cy-(style.sad?11:15),cx+s*17,cy-(style.sad?9:12)); x.stroke(); }
  // 眼
  x.fillStyle='#1a1010'; for(const s of[-1,1]){ x.beginPath(); x.ellipse(cx+s*10,cy-3,3.4,style.big?2.4:1.6,s*-.15,0,7); x.fill(); x.fillStyle='#fff'; x.fillRect(cx+s*10+.5,cy-4.5,1,1); x.fillStyle='#1a1010'; }
  // 唇
  x.fillStyle=style.lip||'#c43a3a'; x.beginPath(); x.ellipse(cx,cy+12,3.2,1.6,0,0,7); x.fill();
  if(style.old){ x.strokeStyle='rgba(120,80,60,.5)'; x.lineWidth=1; for(const s of[-1,1]){ x.beginPath(); x.arc(cx+s*14,cy+4,6,.2,1.2); x.stroke(); } }
}); }
// 风格：robe 外衣, skirt 裙, trim 镶边, hair, style 发式
export function makeCharacter(st){
  const root=new THREE.Group(); const body=new THREE.Group(); root.add(body);
  const robeM=M(st.robe,{roughness:.75,noCache:true}), skirtM=M(st.skirt??st.robe,{roughness:.8,noCache:true}), trimM=M(st.trim??0xd4af37,{roughness:.5,noCache:true}), hairM=M(st.hair??0x15100c,{roughness:.45,noCache:true});
  // 裙（车削）
  const prof=[[.0,0],[.62,0],[.6,.15],[.5,.6],[.38,1.05],[.3,1.25],[0,1.25]].map(([r,y])=>new THREE.Vector2(r*(st.wide||1),y));
  const skirt=mesh(new THREE.LatheGeometry(prof,20),skirtM,0,0,0,body); 
  const hem=mesh(new THREE.TorusGeometry(.6*(st.wide||1),.035,6,24),trimM,0,.1,0,body,false); hem.rotation.x=Math.PI/2;
  // 上衣
  const torso=mesh(new THREE.CylinderGeometry(.2,.32,.75,14),robeM,0,1.55,0,body);
  const coat=mesh(new THREE.LatheGeometry([[.0,0],[.48,0],[.42,.4],[.3,.8],[.0,.8]].map(([r,y])=>new THREE.Vector2(r,y)),16),robeM,0,.85,0,body); // 外衫下摆
  coat.scale.set(st.male?1:.95,1,st.male?1:.9);
  const collar=mesh(new THREE.TorusGeometry(.2,.05,6,16),trimM,0,1.9,.02,body,false); collar.rotation.x=Math.PI/2.3;
  const sash=mesh(new THREE.CylinderGeometry(.33,.35,.12,16),M(st.sash??0xd4af37,{noCache:true}),0,1.3,0,body,false);
  for(const s of[-1,1]){ const rb=mesh(new THREE.BoxGeometry(.06,.7,.02),M(st.sash??0xd4af37),s*.08,.95,.35,body,false); rb.rotation.z=s*.08; }
  if(st.cape){ const cp=mesh(new THREE.CylinderGeometry(.3,.62,1.3,16,1,true,Math.PI*.15,Math.PI*1.7),M(st.cape,{side:THREE.DoubleSide,noCache:true}),0,1.3,0,body); cp.rotation.y=Math.PI; }
  // 臂与广袖
  const arms=[]; for(const s of[-1,1]){ const sh=new THREE.Group(); sh.position.set(s*.27,1.84,0); body.add(sh);
    const sleeve=mesh(new THREE.CylinderGeometry(.07,st.male?.13:.17,.85,10,1,true),M(st.robe,{side:THREE.DoubleSide,noCache:true}),0,-.42,0,sh); sleeve.rotation.z=s*.08;
    const cuff=mesh(new THREE.TorusGeometry(st.male?.13:.17,.025,5,16),trimM,0,-.84,0,sh,false); cuff.rotation.x=Math.PI/2;
    const hand=mesh(new THREE.SphereGeometry(.07,8,6),M(0xf6dcc4),0,-.86,.02,sh,false);
    sh.rotation.z=s*.08; arms.push(sh); }
  // 头
  const head=new THREE.Group(); head.position.y=2.18; head.scale.setScalar(.88); body.add(head);
  mesh(new THREE.CylinderGeometry(.08,.1,.18,8),M(0xf6dcc4),0,-.16,0,head);
  const skull=mesh(new THREE.SphereGeometry(.27,24,18),new THREE.MeshStandardMaterial({map:faceTex(st.face||{}),roughness:.7}),0,.08,0,head); skull.scale.set(.92,1.05,.95);
  const hairCap=mesh(new THREE.SphereGeometry(.285,20,14,0,Math.PI*2,0,Math.PI*.55),hairM,0,.11,-.02,head); hairCap.rotation.x=-.35;
  const ornaments=[];
  const style=st.style||'bun';
  if(style==='crown'){ // 宝玉：束发嵌宝紫金冠 + 抹额
    const c=mesh(new THREE.CylinderGeometry(.11,.14,.18,10),P.gold,0,.38,-.02,head); mesh(new THREE.SphereGeometry(.05,8,6),M(0xd02040,{emissive:0x600010}),0,.42,.11,head);
    const band=mesh(new THREE.TorusGeometry(.265,.025,6,24),M(0xd4af37),0,.17,.0,head,false); band.rotation.x=Math.PI/2+.1; mesh(new THREE.SphereGeometry(.04,8,6),M(0x2fbf71,{emissive:0x0a4020}),0,.2,.26,head);
    mesh(new THREE.CylinderGeometry(.06,.02,.7,6),hairM,0,-.2,-.24,head).rotation.x=.2; }
  if(style==='twin'){ for(const s of[-1,1]){ const b=mesh(new THREE.TorusGeometry(.1,.045,8,16),hairM,s*.2,.38,-.05,head); b.rotation.y=Math.PI/2; } mesh(new THREE.ConeGeometry(.16,.6,8),hairM,0,-.12,-.22,head).rotation.x=Math.PI+.25; }
  if(style==='bun'||style==='lowbun'){ const y=style==='bun'?.36:.12; mesh(new THREE.SphereGeometry(.16,12,10),hairM,0,y,-.2,head); ornaments.push(mesh(new THREE.CylinderGeometry(.012,.012,.42,4),P.gold,.12,y+.02,-.2,head,false)); ornaments[0].rotation.z=1.2; }
  if(style==='high'){ const b=mesh(new THREE.SphereGeometry(.2,12,10),hairM,0,.42,-.08,head); b.scale.set(1.3,.8,.9); for(const s of[-1,0,1]){ const f=mesh(new THREE.ConeGeometry(.04,.3,5),P.gold,s*.16,.55,-.04,head,false); f.rotation.z=-s*.6; } mesh(new THREE.SphereGeometry(.05,8,6),M(0xd02040,{emissive:0x900010}),0,.52,.12,head); }
  if(style==='nun'){ const c=mesh(new THREE.CylinderGeometry(.24,.3,.22,16),M(0x9a9a9e),0,.3,-.02,head); mesh(new THREE.CylinderGeometry(.3,.34,.6,16,1,true),M(0x9a9a9e,{side:THREE.DoubleSide}),0,0,-.1,head); }
  if(style==='scarf'){ const sc=mesh(new THREE.SphereGeometry(.3,14,10,0,Math.PI*2,0,Math.PI*.6),M(0x5a6a8a),0,.12,-.03,head); sc.rotation.x=-.4; }
  if(style==='maid'){ for(const s of[-1,1]) mesh(new THREE.SphereGeometry(.11,10,8),hairM,s*.19,.3,-.08,head); }
  if(st.accessory==='jade'){ mesh(new THREE.SphereGeometry(.07,10,8),M(0x7fe0b0,{emissive:0x1a6040,roughness:.2}),0,1.68,.3,body,false); }
  if(st.accessory==='lock'){ mesh(new THREE.BoxGeometry(.16,.12,.03),P.gold,0,1.66,.3,body,false); }
  if(st.accessory==='qilin'){ mesh(new THREE.TorusKnotGeometry(.05,.015,30,5),P.gold,.18,1.2,.3,body,false); }
  if(st.accessory==='hoe'){ const h=new THREE.Group(); h.position.set(.36,1.1,.15); h.rotation.z=-.3; body.add(h); CYL(.02,.02,1.6,M(0x6a4a2a),0,0,0,h,5); BOX(.2,.12,.03,P.gold,0,.8,.05,h); }
  if(st.accessory==='whisk'){ CYL(.015,.015,.6,M(0x6a4a2a),.38,1.05,.2,body,5); }
  // 鞋
  const feet=[]; for(const s of[-1,1]){ const f=mesh(new THREE.SphereGeometry(.09,8,6),M(st.shoe??0x8e1b16),s*.13,.05,.22,root,false); f.scale.set(1,.6,1.8); feet.push(f); }
  const scale=st.scale||1; root.scale.setScalar(scale);
  root.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
  root.userData.rig={body,arms,head,skirt,feet,coat,walk:0,phase:R(0,6)};
  return root;
}
export function animateCharacter(ch,dt,t,speed){
  const r=ch.userData.rig; const moving=speed>.05; r.walk+=dt*speed*3.2;
  const w=Math.sin(r.walk), blend=Math.min(1,speed/2);
  r.body.position.y=moving?Math.abs(Math.cos(r.walk))*.06:Math.sin(t*1.6+r.phase)*.012;
  r.body.rotation.z=moving?w*.03:0; r.body.rotation.x=moving?.06:0;
  r.arms[0].rotation.x=moving? w*.55*blend : Math.sin(t*1.1+r.phase)*.04; r.arms[1].rotation.x=moving?-w*.55*blend:Math.sin(t*1.1+r.phase+1)*.04;
  r.arms[0].rotation.z=-.07-(moving?.04:0); r.arms[1].rotation.z=.07+(moving?.04:0);
  r.skirt.rotation.z=moving?w*.05:Math.sin(t+r.phase)*.01; r.coat.rotation.z=r.skirt.rotation.z*.6;
  r.feet[0].position.z=.22+(moving?w*.18:0); r.feet[1].position.z=.22-(moving?w*.18:0);
  r.head.rotation.y=moving?0:Math.sin(t*.4+r.phase)*.25; r.head.rotation.x=moving?-.05:Math.sin(t*.7+r.phase)*.03;
}
// 立绘：用独立小渲染器把人物半身渲染为图片
export function renderPortraits(styles){
  const out={}; const c=document.createElement('canvas'); c.width=320;c.height=400;
  const rr=new THREE.WebGLRenderer({canvas:c,alpha:true,antialias:true,preserveDrawingBuffer:true}); rr.toneMapping=THREE.ACESFilmicToneMapping; rr.outputColorSpace=THREE.SRGBColorSpace;
  const sc=new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e0,0x8a7050,1.4)); const dl=new THREE.DirectionalLight(0xffffff,1.6); dl.position.set(1.5,3,4); sc.add(dl);
  const cam=new THREE.PerspectiveCamera(26,320/400,.1,50); cam.position.set(.5,2.05,3.6); cam.lookAt(0,1.8,0);
  for(const [id,st] of Object.entries(styles)){ const ch=makeCharacter(st); ch.scale.setScalar(1); ch.rotation.y=.25; animateCharacter(ch,0,1,0); sc.add(ch); rr.render(sc,cam); out[id]=c.toDataURL('image/png'); sc.remove(ch); ch.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); } }); }
  rr.dispose(); rr.forceContextLoss?.(); return out;
}

// ---------- 天色 ----------
const SKIES=[ // 晨 午 暮(夜)
  {elev:16,az:120,exp:.95,sun:2.3,sunC:0xffdcae,hemi:.85,fog:0xf0dcc0,fogD:.0055,lant:.25,night:0,bloom:.3},
  {elev:42,az:200,exp:.9,sun:2.6,sunC:0xfff1d8,hemi:.9,fog:0xe8e4d6,fogD:.0045,lant:.2,night:0,bloom:.25},
  {elev:-6,az:250,exp:.8,sun:.9,sunC:0xa8b8e8,hemi:.6,fog:0x1e2640,fogD:.009,lant:3.2,night:1,bloom:.9},
];
let curSky=0, envRT=null;
export function applySky(slot,day){
  const k=SKIES[slot]; curSky=k; const phi=THREE.MathUtils.degToRad(90-k.elev), th=THREE.MathUtils.degToRad(k.az);
  const sunDir=new THREE.Vector3().setFromSphericalCoords(1,phi,th); skyU.sunPosition.value.copy(sunDir);
  sky.visible=!k.night; scene.background=k.night?new THREE.Color(0x0e1426):null;
  sun.position.copy(k.night?new THREE.Vector3(-.5,.8,-.6):sunDir).multiplyScalar(60); sun.color.setHex(k.sunC); sun.intensity=k.sun;
  hemi.intensity=k.hemi; hemi.color.setHex(k.night?0x8090c8:0xfff0d8); hemi.groundColor.setHex(k.night?0x2a2a3a:0x5a6a40); scene.fog.color.setHex(k.fog); scene.fog.density=k.fogD; renderer.toneMappingExposure=k.exp;
  lanterns.forEach(l=>l.material.emissiveIntensity=k.lant); lights.forEach(l=>l.intensity=k.night?14:0); bloom.strength=k.bloom;
  stars.visible=moon.visible=fireflies.visible=!!k.night;
  const winter=day>=13; petals.material.color.setHex(winter?0xffffff:k.night?0xd8d0ff:0xffb7c5); petals.material.size=winter?.5:.42;
  // 环境反射
  if(envRT) envRT.dispose(); if(!k.night){ const s2=new THREE.Scene(); const sk=sky.clone(); s2.add(sk); envRT=pmrem.fromScene(s2,0,1,1000); scene.environment=envRT.texture; } else { scene.environment=null; envRT=null; }
  scene.environment&&(scene.environmentIntensity=.5);
}
// ---------- 每帧 ----------
export function tick(dt,t){
  const p=petals.geometry.attributes.position; for(let i=0;i<p.count;i++){ let y=p.getY(i)-dt*(.8+(i%5)*.25); if(y<0)y=25; p.setY(i,y); p.setX(i,p.getX(i)+Math.sin(t*.7+i)*dt*.8); p.setZ(i,p.getZ(i)+Math.cos(t*.5+i*.3)*dt*.4);} p.needsUpdate=true;
  if(fireflies.visible){ const f=fireflies.geometry.attributes.position; for(let i=0;i<f.count;i++){ f.setY(i,1.5+Math.sin(t*1.3+i)*1.2); f.setX(i,f.getX(i)+Math.sin(t*.6+i*2)*dt*.6);} f.needsUpdate=true; fireflies.material.opacity=.6+Math.sin(t*3)*.3; }
  water.material.normalMap.offset.set(t*.012,t*.007);
  for(const pl of plantInst){ pl.o.rotation.z=Math.sin(t*.9+pl.ph)*pl.k; pl.o.rotation.x=Math.cos(t*.7+pl.ph)*pl.k*.6; }
  lanterns.forEach((l,i)=>{ l.rotation.z=Math.sin(t*1.5+i)*.06; });
}
export function followSun(target){ const d=sun.position.clone().normalize(); sun.position.copy(target).addScaledVector(d,60); sun.target.position.copy(target); sun.target.updateMatrixWorld(); }
export function resize(){ renderer.setSize(innerWidth,innerHeight,false); composer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
export function render(){ composer.render(); }

// ---------- 碰撞 ----------
const colliders=[]; // {g, rects:[[x0,x1,z0,z1]]}（局部坐标）
export function registerColliders(LOCATIONS){ for(const L of LOCATIONS){ if(L.kind==='pavilion') continue; const W=L.kind==='hall'?11:L.kind==='farm'?8:9; const hw=(W+9)/2;
  colliders.push({g:locGroups[L.id],rects:[[-W/2-1.1,W/2+1.1,-3.9,3.9],[-hw-.5,hw+.5,-8.5,-7.5],[-hw-.5,-hw+.5,-8.5,8.5],[hw-.5,hw+.5,-8.5,8.5],[-hw-.5,-1.05,7.6,8.6],[1.05,hw+.5,7.6,8.6]]}); } }
const _v=new THREE.Vector3();
export function blocked(x,z){
  if(Math.abs(x)>48.5||Math.abs(z)>48.5) return true;
  const r=Math.hypot(x,z); if(r<10.6 && r>3.5 && !(Math.abs(x)<1.05 && Math.abs(z)<10.2)) return true;
  for(const c of colliders){ _v.set(x,0,z); c.g.worldToLocal(_v); for(const [a,b,e,f] of c.rects) if(_v.x>a&&_v.x<b&&_v.z>e&&_v.z<f) return true; }
  return false;
}
export function groundHeight(x,z){ const r=Math.hypot(x,z); if(r<=3.5) return .6; if(Math.abs(x)<1.1&&Math.abs(z)>=3.5&&Math.abs(z)<9.9){ const t=(Math.abs(z)-6.6)/3.2; return Math.max(.6*(Math.abs(z)<4.5?1:0), 1.45*(1-t*t)); } return 0; }
