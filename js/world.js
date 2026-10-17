// 3D 世界：大观园场景、建筑、植物、水面、天色、人物模型与动画
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Renderer, TIERS } from './render.js';
import { createTextureLibrary, pbr, setAnisotropy, cloneTex } from './texlib.js';
import { mergeStatic, mergeChildren, computeAO, applyAO, loadBaked, layoutHash } from './bake.js';

let _seed=20261016; export function reseed(v){ _seed=v>>>0; }
const rand = (()=>{ return ()=>{ let s=_seed; const r=((s=Math.imul(s^s>>>15,s|1)^(s+Math.imul(s^s>>>7,s|61)), ((s^s>>>14)>>>0)/4294967296)); _seed=s; return r; }; })();
const R=(a,b)=>a+(b-a)*rand();

// ---------- 程序化贴图 ----------
function canvasTex(w,h,draw,repeat=[1,1],srgb=true){ const c=document.createElement('canvas'); c.width=w;c.height=h; draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(...repeat); if(srgb)t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t; }
function noiseFill(x,w,h,base,vars,n=6000,sz=3){ x.fillStyle=base; x.fillRect(0,0,w,h); for(let i=0;i<n;i++){ x.fillStyle=vars[i%vars.length]; x.globalAlpha=R(.05,.25); x.fillRect(R(0,w),R(0,h),R(1,sz),R(1,sz)); } x.globalAlpha=1; }
const TEX = {}; let LIB;
function makeTextures(){
  setAnisotropy(renderer.capabilities.getMaxAnisotropy()); LIB=createTextureLibrary(LOWQ?128:256);
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
export const scene=new THREE.Scene();
// 多地域：每个地域一个根节点，沿 x 轴相隔 1000（超出相机远裁面，互不可见）；当前地域之外的根节点隐藏
export const REGION_IDX={garden:0,rongfu:1,ningfu:2,street:3,suburb:4,taixu:5};
export const regionRoots={}; let ROOT=scene; export let CUR='garden';
export const regionOrigin=id=>new THREE.Vector3((REGION_IDX[id]||0)*1000,0,0);
export function regionOfX(x){ const i=Math.round(x/1000); return Object.keys(REGION_IDX).find(k=>REGION_IDX[k]===i)||'garden'; }
function makeRoot(id){ const g=new THREE.Group(); g.position.copy(regionOrigin(id)); g.name='region:'+id; scene.add(g); regionRoots[id]=g; g.updateMatrixWorld(true); return g; }
export function setRoot(g){ ROOT=g||scene; }
export const camera=new THREE.PerspectiveCamera(45,1,.1,600);
const RR=new Renderer(canvas,scene,camera); export { RR as R }; export const renderer=RR.renderer;
const LOWQ = RR.tierName==='low';

const sky=new Sky(); sky.scale.setScalar(450); scene.add(sky);
const skyU=sky.material.uniforms; skyU.turbidity.value=6; skyU.rayleigh.value=1.6; skyU.mieCoefficient.value=.006; skyU.mieDirectionalG.value=.85;
const hemi=new THREE.HemisphereLight(0xfff0d8,0x5a6a40,.8); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0d0,2.2); sun.castShadow=true; sun.shadow.mapSize.set(RR.q.shadow,RR.q.shadow); sun.shadow.radius=3;
RR.onTier=()=>{ sun.shadow.mapSize.set(RR.q.shadow,RR.q.shadow); sun.shadow.map?.dispose(); sun.shadow.map=null; };
Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:160}); sun.shadow.bias=-.0004; sun.shadow.normalBias=.03; scene.add(sun,sun.target);
scene.fog=new THREE.FogExp2(0xefe2c4,.005);
const pmrem=new THREE.PMREMGenerator(renderer);

const mats={}; function M(c,o={}){ const k=c+JSON.stringify(Object.keys(o)); if(!o.map&&!o.noCache&&mats[k]) return mats[k]; const {noCache,...oo}=o; const m=new THREE.MeshStandardMaterial({color:c,roughness:.85,...oo}); if(!o.map) mats[k]=m; return m; }
function mesh(geo,mat,x=0,y=0,z=0,parent=ROOT,shadow=true){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=shadow; m.receiveShadow=true; parent.add(m); return m; }
// 圆角盒：所有可见方块都带倒角；UV 按"米"展开（2m 一个贴图周期），保证 PBR 贴图比例一致
const _rb=new Map();
function boxUV(g,sc=2){ const P=g.attributes.position,N=g.attributes.normal,U=g.attributes.uv; for(let i=0;i<P.count;i++){ const nx=Math.abs(N.getX(i)),ny=Math.abs(N.getY(i)),nz=Math.abs(N.getZ(i)); const x=P.getX(i),y=P.getY(i),z=P.getZ(i);
  if(ny>=nx&&ny>=nz) U.setXY(i,x/sc,z/sc); else if(nx>=nz) U.setXY(i,z/sc,y/sc); else U.setXY(i,x/sc,y/sc); } U.needsUpdate=true; return g; }
function rbox(w,h,d){ const k=w.toFixed(3)+','+h.toFixed(3)+','+d.toFixed(3); let g=_rb.get(k); if(!g){ const r=Math.min(.06,Math.min(w,h,d)*.22); g=boxUV(new RoundedBoxGeometry(w,h,d,1,r)); _rb.set(k,g); } return g; }
const BOX=(w,h,d,mat,x,y,z,p)=>mesh(rbox(w,h,d),mat,x,y,z,p);
const CYL=(rt,rb,h,mat,x,y,z,p,seg=20)=>mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat,x,y,z,p);

// ---------- 曲面屋顶（反宇飞檐） ----------
// 屋面高度场：u,v∈[-1,1]；mr=到屋脊的"坡向距离"，凹曲面(反宇) + 四角起翘(飞檐)
function roofY(u,v,h,ridge,upturn){ const au=Math.abs(u), av=Math.abs(v); const mr=ridge?Math.max(Math.max(0,(au-ridge)/(1-ridge)),av):Math.max(au,av);
  return h*Math.pow(Math.max(0,1-mr),1.7)+upturn*Math.pow(au*av,4)+upturn*.25*Math.pow(mr,6); }
function roofGeo(w,d,h,{seg=22,upturn=.9,ridge=0}={}){
  const g=new THREE.BufferGeometry(); const pos=[],uv=[],idx=[];
  for(let j=0;j<=seg;j++)for(let i=0;i<=seg;i++){ const u=i/seg*2-1, v=j/seg*2-1; const y=roofY(u,v,h,ridge,upturn); const x=u*w/2, z=v*d/2;
    // 瓦垄沿坡向：前后坡 u 为横向、侧坡 z 为横向
    const side=ridge?(Math.max(0,(Math.abs(u)-ridge)/(1-ridge))>Math.abs(v)):Math.abs(u)>Math.abs(v);
    pos.push(x,y,z); uv.push(side?z/1.6:x/1.6, side?x/1.6:z/1.6); }
  for(let j=0;j<seg;j++)for(let i=0;i<seg;i++){ const a=j*(seg+1)+i,b=a+1,c=a+seg+1,d2=c+1; idx.push(a,c,b,b,c,d2); }
  g.setIndex(idx); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.computeVertexNormals(); return g;
}
let roofMat, roofMats={};
const _rafterGeo=new THREE.CylinderGeometry(.035,.035,.42,6); _rafterGeo.rotateX(Math.PI/2);
// 屋顶：屋面 + 望板底面 + 圆管正脊/垂脊 + 鸱吻 + 戗脊走兽 + 檐椽（InstancedMesh）
function roof(parent,w,d,h,y,{ridge=0,upturn=.9,ridgeColor=0x222830,mat=roofMat,rotY=0,noTop=false}={}){
  const g=new THREE.Group(); g.position.y=y; g.rotation.y=rotY; parent.add(g);
  const r=mesh(roofGeo(w,d,h,{ridge,upturn}),mat,0,0,0,g); r.userData.roof=true;
  const under=mesh(roofGeo(w*.985,d*.985,h*.96,{ridge,upturn,seg:16}),P.underRoof,0,-.1,0,g,false); under.userData.roof=true;
  const rm=M(ridgeColor,{roughness:.45,metalness:.1});
  const tube=(pts,rad)=>{ const t=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(8,pts.length*2),rad,8,false),rm,0,0,0,g); t.userData.roof=true; return t; };
  const P3=(u,v,lift)=>new THREE.Vector3(u*w/2,roofY(u,v,h,ridge,upturn)+lift,v*d/2);
  // 垂脊/戗脊：从脊端沿屋面曲线到翼角
  for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const pts=[]; for(let k=noTop?5:0;k<=12;k++){ const t=k/12; pts.push(P3(a*(ridge+(1-ridge)*t),b*t,.1)); } tube(pts,.09);
    // 走兽：翼角处一列小兽
    for(let k=0;k<3;k++){ const t=.72+k*.08; const q=P3(a*(ridge+(1-ridge)*t),b*t,.22); const s=mesh(new THREE.SphereGeometry(.09,8,6),rm,q.x,q.y,q.z,g,false); s.userData.roof=true; const c=mesh(new THREE.ConeGeometry(.05,.14,6),rm,q.x,q.y+.1,q.z,g,false); c.userData.roof=true; }
    // 檐角风铃
    const tip=P3(a*1.02,b*1.02,-.05); const bell=mesh(new THREE.ConeGeometry(.08,.25,8),P.gold,tip.x,tip.y-.2,tip.z,g,false); bell.userData.roof=true; }
  if(noTop){} else if(ridge){ const pts=[]; for(let k=0;k<=8;k++) pts.push(new THREE.Vector3((-ridge+2*ridge*k/8)*w/2,h+.14,0)); tube(pts,.17); mesh(rbox(w*ridge+.2,.22,.3),rm,0,h+.02,0,g).userData.roof=true;
    // 鸱吻：卷尾
    for(const s of[-1,1]){ const c=[]; for(let k=0;k<=10;k++){ const t=k/10, a=t*Math.PI*1.4; c.push(new THREE.Vector3(s*(ridge*w/2+.02-Math.sin(a)*.12*t),h+.18+t*.3+Math.cos(a)*.04,0)); } tube(c,.07); mesh(rbox(.22,.32,.2),rm,s*(ridge*w/2-.02),h+.3,0,g).userData.roof=true; } }
  else { const f=mesh(new THREE.SphereGeometry(.28,16,12),P.gold,0,h+.15,0,g); f.userData.roof=true; const f2=mesh(new THREE.ConeGeometry(.12,.5,12),P.gold,0,h+.5,0,g); f2.userData.roof=true; }
  // 檐椽：沿四周檐口一圈
  if(!LOWQ){ const rs=[]; const step=.42; for(const [ax,bx] of [[1,0],[0,1]]) for(const sg of[-1,1]){ const L=ax?w:d; for(let t=-L/2+.3;t<L/2-.3;t+=step){ const u=ax?t/(w/2)*.94:sg*.9, v=ax?sg*.9:t/(d/2)*.94; const q=P3(u,v,-.24); rs.push([q, ax?0:Math.PI/2*sg, ax?sg:0]); } }
    const inst=new THREE.InstancedMesh(_rafterGeo,P.rafter,rs.length); const o=new THREE.Object3D(); rs.forEach(([q,ry,s],i)=>{ o.position.copy(q); o.rotation.set(0,ry,0); if(!s) o.rotation.y=ry; o.updateMatrix(); inst.setMatrixAt(i,o.matrix); }); inst.castShadow=false; g.add(inst); }
  return r;
}

// ---------- 建筑部件 ----------
const P = {};
function initMats(){
  roofMat=pbr(LIB,'tile',{side:THREE.DoubleSide,color:0xd0d6dc,envMapIntensity:.8});
  roofMats={ tile:roofMat, glaze:pbr(LIB,'glaze',{side:THREE.DoubleSide,envMapIntensity:1.2}), gold:pbr(LIB,'glazeY',{side:THREE.DoubleSide,envMapIntensity:1.2}) };
  const lac=cloneTex(LIB.lacquer,[1,2]);
  Object.assign(P,{ pillar:new THREE.MeshStandardMaterial({map:lac.map,normalMap:lac.normalMap,roughnessMap:lac.orm,roughness:1,envMapIntensity:1.1}),
    stone:pbr(LIB,'paving'), brick:pbr(LIB,'brick'), marble:pbr(LIB,'marble',{envMapIntensity:1}), rock:pbr(LIB,'rock',{color:0xc8ccd0}),
    lattice:new THREE.MeshStandardMaterial({map:TEX.lattice,roughness:.8}), beam:new THREE.MeshStandardMaterial({map:TEX.beam,roughness:.55}),
    wall:pbr(LIB,'plaster'), wood:pbr(LIB,'wood'), gold:M(0xd4af37,{metalness:.85,roughness:.28}), dark:M(0x2a2a30,{roughness:.6}),
    underRoof:M(0x6a2c1a,{side:THREE.BackSide,roughness:.8}), rafter:M(0x4a2418,{roughness:.7}) });
}
function hall(parent,w,d,H,{double=false,ridge=.45,rm=roofMat}={}){
  // 台基+台阶
  BOX(w+2,.55,d+2,P.brick,0,.275,0,parent); BOX(w+2.15,.16,d+2.15,P.stone,0,.62,0,parent); for(let i=0;i<3;i++) BOX(3,.23,.5,P.stone,0,.12+i*.23,d/2+1.6-i*.4,parent);
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
  roof(parent,w+3.2,d+3.2,H*.62,.7+H+.35,{ridge,mat:rm,noTop:double});
  if(double){ const y=.7+H+.35+H*.62*.55; BOX(w*.55,1,d*.55,P.pillar,0,y+.3,0,parent); roof(parent,w*.75,d*.75,H*.5,y+.8,{ridge,mat:rm}); }
}
function pavilion(parent,r,H,{sides=6,double=true}={}){
  mesh(new THREE.CylinderGeometry(r+.6,r+.8,.6,sides),P.stone,0,.3,0,parent);
  for(let i=0;i<sides;i++){ const a=i/sides*Math.PI*2; CYL(.16,.18,H,P.pillar,Math.cos(a)*r,.6+H/2,Math.sin(a)*r,parent); 
    const a2=(i+.5)/sides*Math.PI*2, L=2*r*Math.sin(Math.PI/sides); const rail=BOX(L,.5,.12,P.wood,Math.cos(a2)*r*.92,.95,Math.sin(a2)*r*.92,parent); rail.rotation.y=-a2+Math.PI/2; }
  const ring=mesh(new THREE.CylinderGeometry(r+.15,r+.15,.4,sides,1,true),P.beam,0,.6+H,0,parent);
  roof(parent,2*r+2.6,2*r+2.6,H*.8,.6+H+.1,{upturn:.8,rotY:Math.PI/4,mat:roofMats.glaze,noTop:double});
  if(double) roof(parent,2*r,2*r,H*.6,.6+H+H*.5,{upturn:.6,mat:roofMats.glaze});
}
function compoundWall(parent,w,d,{gate=true}={}){
  const H=2.6, mat=P.wall;
  const seg=(x,z,len,rotY)=>{ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY; parent.add(g); BOX(len,H-.6,.5,mat,0,.6+(H-.6)/2,0,g); BOX(len+.04,.6,.56,P.brick,0,.3,0,g); const c=BOX(len+.3,.25,1,roofMat,0,H+.12,0,g); BOX(len+.3,.18,.3,P.dark,0,H+.32,0,g); };
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
// ---------- 植被：平滑扰动树冠（顶点色：内暗外亮）+ 透明叶片卡打破轮廓 ----------
let leafTex, willowTex, barkM;
function foliageTex(){ if(leafTex) return;
  leafTex=canvasTex(128,128,(x,w,h)=>{ x.clearRect(0,0,w,h); for(let i=0;i<22;i++){ const cx=R(14,114),cy=R(14,114),a=R(0,6.28),l=R(10,18); x.save(); x.translate(cx,cy); x.rotate(a); const g=x.createLinearGradient(-l,0,l,0); g.addColorStop(0,'#cfd8b8'); g.addColorStop(1,'#f4f8e8'); x.fillStyle=g; x.beginPath(); x.ellipse(0,0,l,l*.42,0,0,7); x.fill(); x.strokeStyle='rgba(90,110,60,.6)'; x.lineWidth=1; x.beginPath(); x.moveTo(-l,0); x.lineTo(l,0); x.stroke(); x.restore(); } });
  willowTex=canvasTex(32,256,(x,w,h)=>{ x.clearRect(0,0,w,h); x.strokeStyle='#c8d8a8'; x.lineWidth=1.2; x.beginPath(); x.moveTo(16,0); x.lineTo(16,h); x.stroke(); for(let y=6;y<h;y+=7){ for(const s of[-1,1]){ x.save(); x.translate(16,y); x.rotate(s*(.5+R(0,.3))); x.fillStyle=`hsl(${R(75,95)},40%,${R(80,92)}%)`; x.beginPath(); x.ellipse(s*6,4,6.5,1.8,0,0,7); x.fill(); x.restore(); } } });
  const bt=LIB.rock; barkM=new THREE.MeshStandardMaterial({color:0x6a5040,normalMap:bt.normalMap,roughnessMap:bt.orm,roughness:1,normalScale:new THREE.Vector2(1.5,1.5)}); }
const _crownCache={}, _crownMats={}; const crownMat=c=>_crownMats[c]||(_crownMats[c]=new THREE.MeshStandardMaterial({color:c,vertexColors:true,roughness:.9}));
function crownGeo(rad,seed){ const key=rad.toFixed(1)+'|'+(seed%5); if(_crownCache[key]) return _crownCache[key]; let g=new THREE.IcosahedronGeometry(rad,LOWQ?2:3); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g=mergeVertices(g); const p=g.attributes.position, col=[]; const v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i); const n=v.clone().normalize(); const d=1+.18*Math.sin(n.x*5+seed)*Math.cos(n.z*4+seed*.7)+.1*Math.sin(n.y*9+seed); v.multiplyScalar(d); v.y*=.82; p.setXYZ(i,v.x,v.y,v.z); const t=.62+.38*(n.y*.5+.5); col.push(t,t,t*.95); }
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); g.computeVertexNormals(); return _crownCache[key]=g; }
function leafCards(g,centers,n,color,size=.9){ const q=new THREE.PlaneGeometry(size,size); const m=new THREE.MeshStandardMaterial({map:leafTex,color,alphaTest:.5,side:THREE.DoubleSide,roughness:.85}); const inst=new THREE.InstancedMesh(q,m,n); const o=new THREE.Object3D();
  for(let i=0;i<n;i++){ const [c,r]=centers[i%centers.length]; const d=new THREE.Vector3(R(-1,1),R(-.5,1),R(-1,1)).normalize(); o.position.copy(c).addScaledVector(d,r*R(.85,1.05)); o.lookAt(o.position.clone().add(d)); o.rotateZ(R(0,6)); o.scale.setScalar(R(.7,1.2)); o.updateMatrix(); inst.setMatrixAt(i,o.matrix); }
  inst.castShadow=true; inst.receiveShadow=true; g.add(inst); return inst; }
function willow(x,z,s=1){ foliageTex(); const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); ROOT.add(g); treeGroups.push(g);
  const tr=CYL(.18,.34,3.4,barkM,0,1.7,0,g,10); tr.rotation.z=R(-.08,.08); trunks.push(tr);
  const cm=crownMat(0x92b45a); const cen=[]; for(let i=0;i<3;i++){ const c=new THREE.Vector3(R(-.6,.6),R(3.6,4.1),R(-.6,.6)); const r=R(1,1.4); const b=mesh(crownGeo(r,i+x),cm,c.x,c.y,c.z,g); b.scale.y=.55; cen.push([c,r]); }
  const N=LOWQ?40:90; const strand=new THREE.PlaneGeometry(.22,1); strand.translate(0,-.5,0); const inst=new THREE.InstancedMesh(strand,new THREE.MeshStandardMaterial({map:willowTex,color:0x6f8f45,alphaTest:.45,side:THREE.DoubleSide,roughness:.85}),N); const o=new THREE.Object3D();
  for(let i=0;i<N;i++){ const a=R(0,6.28), r=R(.5,2.2); o.position.set(Math.cos(a)*r,R(3.4,4.2),Math.sin(a)*r); o.rotation.set(R(-.06,.06),R(0,3.14),R(-.06,.06)); o.scale.set(1,R(1.8,3.4),1); o.updateMatrix(); inst.setMatrixAt(i,o.matrix);} inst.castShadow=true; g.add(inst);
  plantInst.push({o:g,k:.02,ph:R(0,6)}); return g; }
function plum(x,z,s=1,col=0xd2304a){ const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); ROOT.add(g); treeGroups.push(g);
  const bm=M(0x3a2a22); const tips=[];
  const branch=(p,dir,len,r,depth)=>{ const e=p.clone().addScaledVector(dir,len); const c=mesh(new THREE.CylinderGeometry(r*.6,r,len,5),bm,0,0,0,g); c.position.copy(p).lerp(e,.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir); if(depth<3){ for(let k=0;k<2;k++){ const nd=dir.clone().add(new THREE.Vector3(R(-.9,.9),R(-.1,.6),R(-.9,.9))).normalize(); branch(e,nd,len*.7,r*.6,depth+1);} } else tips.push(e); };
  branch(new THREE.Vector3(0,0,0),new THREE.Vector3(R(-.2,.2),1,R(-.2,.2)).normalize(),1.8,.22,0);
  const inst=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.11,1),M(col,{emissive:col,emissiveIntensity:.15,roughness:.6}),tips.length*9); const o=new THREE.Object3D(); let n=0;
  for(const t of tips) for(let k=0;k<9;k++){ o.position.copy(t).add(new THREE.Vector3(R(-.6,.6),R(-.5,.4),R(-.6,.6))); o.scale.setScalar(R(.6,1.3)); o.updateMatrix(); inst.setMatrixAt(n++,o.matrix);} g.add(inst);
  return g; }
function broadTree(x,z,s=1,cols=[0x4d7a3a,0x5e8c45,0x3f6a30]){ foliageTex(); const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); ROOT.add(g); treeGroups.push(g);
  trunks.push(CYL(.22,.4,3,barkM,0,1.5,0,g,10)); for(const a of [0,2.1,4.2]){ const br=CYL(.07,.14,1.6,barkM,Math.cos(a)*.4,3,Math.sin(a)*.4,g,6); br.rotation.set(Math.sin(a)*.6,0,-Math.cos(a)*.6); }
  const cen=[]; for(let i=0;i<5;i++){ const c=new THREE.Vector3(R(-1,1),R(3.3,4.6),R(-1,1)); const r=R(1,1.6); const b=mesh(crownGeo(r,i*3+z),crownMat(cols[i%cols.length]),c.x,c.y,c.z,g); cen.push([c,r*.9]); }
  if(!LOWQ) leafCards(g,cen,70,new THREE.Color(cols[0]).multiplyScalar(1.15),.8);
  plantInst.push({o:g,k:.01,ph:R(0,6)}); return g; }
function pine(x,z,s=1){ foliageTex(); const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); ROOT.add(g); treeGroups.push(g); const tr=CYL(.2,.36,4.4,barkM,0,2.2,0,g,10); trunks.push(tr);
  const pm=crownMat(0x2f5a3a); const cen=[];
  for(let i=0;i<5;i++){ const c=new THREE.Vector3(R(-.9,.9),2.4+i*.6,R(-.9,.9)); const r=R(.9,1.3)*(1-i*.12); const b=mesh(crownGeo(r,i+x*2),pm,c.x,c.y,c.z,g); b.scale.set(1.3,.38,1.3); cen.push([c,r*.8]); }
  if(!LOWQ) leafCards(g,cen,40,new THREE.Color(0x3d6a45),.7); return g; }
function bambooGrove(cx,cz,n=40,rad=4){ const culm=new THREE.CylinderGeometry(.07,.09,1,8); culm.translate(0,.5,0);
  foliageTex(); const bt=cloneTex(LIB.bamboo,[1,3]); const inst=new THREE.InstancedMesh(culm,new THREE.MeshStandardMaterial({map:bt.map,normalMap:bt.normalMap,roughness:.45,color:0xd8e8c0}),n); const leafG=new THREE.PlaneGeometry(1.3,1.3); const leaves=new THREE.InstancedMesh(leafG,new THREE.MeshStandardMaterial({map:leafTex,color:0x6a9a48,alphaTest:.5,side:THREE.DoubleSide,roughness:.8}),n*3); const o=new THREE.Object3D();
  for(let i=0;i<n;i++){ const a=R(0,6.28),r=Math.sqrt(rand())*rad, h=R(5,8); o.position.set(cx+Math.cos(a)*r,0,cz+Math.sin(a)*r); o.rotation.set(R(-.08,.08),0,R(-.08,.08)); o.scale.set(1,h,1); o.updateMatrix(); inst.setMatrixAt(i,o.matrix);
    for(let k=0;k<3;k++){ const l=new THREE.Object3D(); l.position.set(o.position.x+R(-.4,.4),h*R(.65,1),o.position.z+R(-.4,.4)); l.rotation.set(R(-.6,.6),R(0,6),R(-.6,.6)); l.updateMatrix(); leaves.setMatrixAt(i*3+k,l.matrix);} }
  inst.castShadow=leaves.castShadow=true; ROOT.add(inst,leaves); }
function rockery(x,z,s=1){ let geo=new THREE.IcosahedronGeometry(1,LOWQ?2:3); geo.deleteAttribute('normal'); geo=mergeVertices(geo); const p=geo.attributes.position; for(let i=0;i<p.count;i++){ const v=new THREE.Vector3().fromBufferAttribute(p,i); const n=1+.35*Math.sin(v.x*3.1+v.y*2)*Math.cos(v.z*2.7)+.2*Math.sin(v.y*7); v.multiplyScalar(n); p.setXYZ(i,v.x,v.y,v.z);} geo.computeVertexNormals();
  const g=new THREE.Group(); g.position.set(x,0,z); ROOT.add(g); treeGroups.push(g);
  for(let i=0;i<3;i++){ const m=mesh(geo,P.rock,R(-.8,.8)*s,R(.8,1.6)*s,R(-.8,.8)*s,g); m.scale.set(s*R(.7,1),s*R(1.2,2),s*R(.7,1)); m.rotation.set(R(0,3),R(0,3),R(0,3)); }
  return g; }
function flowers(cx,cz,n,rad,cols){ const inst=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.12,0),new THREE.MeshStandardMaterial({roughness:.6}),n); const o=new THREE.Object3D(); const c=new THREE.Color();
  for(let i=0;i<n;i++){ const a=R(0,6.28),r=Math.sqrt(rand())*rad; o.position.set(cx+Math.cos(a)*r,R(.15,.5),cz+Math.sin(a)*r); o.updateMatrix(); inst.setMatrixAt(i,o.matrix); inst.setColorAt(i,c.setHex(cols[i%cols.length])); } ROOT.add(inst); }
let grassMat=null;
// 草：锥形弯曲草叶（实例化），顶点着色器里做风动，实例色做深浅变化
function grassTufts(n){ const g=new THREE.PlaneGeometry(.07,.42,1,4); g.translate(0,.21,0); const P2=g.attributes.position; for(let i=0;i<P2.count;i++){ const y=P2.getY(i)/.42; P2.setX(i,P2.getX(i)*(1-y*.85)); P2.setZ(i,y*y*.12); } g.computeVertexNormals();
  grassMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,side:THREE.DoubleSide}); const T={value:0}; grassMat.userData.t=T;
  grassMat.onBeforeCompile=sh=>{ sh.uniforms.uT=T; sh.vertexShader='uniform float uT;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    vec4 ip=instanceMatrix[3]; float h=position.y/.42; float w=sin(uT*1.7+ip.x*.35+ip.z*.27)*.5+sin(uT*3.1+ip.x*1.3)*.2; transformed.x+=w*h*h*.12; transformed.z+=w*h*h*.06;`); };
  const inst=new THREE.InstancedMesh(g,grassMat,n); const o=new THREE.Object3D(); const c=new THREE.Color(); let k=0;
  while(k<n){ const x=R(-46,46),z=R(-46,46); if(Math.hypot(x,z)<11.5) continue; const cl=Math.floor(k/6); o.position.set(x,0,z); o.rotation.set(R(-.25,.25),R(0,6.28),R(-.25,.25)); o.scale.setScalar(R(.7,1.5)); o.updateMatrix();
    for(let j=0;j<6&&k<n;j++){ const oo=o.clone(); oo.position.x+=R(-.25,.25); oo.position.z+=R(-.25,.25); oo.rotation.y=R(0,6.28); oo.updateMatrix(); inst.setMatrixAt(k,oo.matrix); inst.setColorAt(k,c.setHSL(R(.2,.27),R(.35,.5),R(.3,.45))); k++; } }
  inst.receiveShadow=true; ROOT.add(inst); }

// ---------- 大观园 ----------
// ---------- 静态合并 / AO / 遮挡代理 ----------
const staticGroups=[], treeGroups=[]; export const occGroups=[]; const trunkBoxes=[]; let CHUNK='garden'; const chunks={garden:[]};
function addStatic(g,occ){ const ms=mergeStatic(g,{skip:o=>lanterns.includes(o)||signs.includes(o)||o.userData.dyn}); (chunks[CHUNK]||(chunks[CHUNK]=[])).push(...ms); if(!ms.length) return;
  g.updateMatrixWorld(true); const og={g,inv:g.matrixWorld.clone().invert(),boxes:ms[0].userData.boxes,meshes:ms.filter(m=>!m.userData.roof),roofs:ms.filter(m=>m.userData.roof),occ}; if(occ) occGroups.push(og); occluders.push(...ms); }
const _o=new THREE.Vector3(), _d=new THREE.Vector3();
function slab(o,d,b,far){ let t0=0,t1=far; for(const k of ['x','y','z']){ const inv=1/d[k]; let tn=(b.min[k]-o[k])*inv, tf=(b.max[k]-o[k])*inv; if(tn>tf){ const t=tn; tn=tf; tf=t; } if(tn>t0) t0=tn; if(tf<t1) t1=tf; if(t0>t1) return -1; } return t0; }
// 射线 vs 建筑代理盒（世界坐标进出）：includeRoofs=false 时忽略屋顶（屋顶由淡出处理）
export function rayOcc(o,d,far,includeRoofs=true){ let best={dist:Infinity};
  for(const og of occGroups){ if(Math.abs(og.g.matrixWorld.elements[12]-o.x)>far+40||Math.abs(og.g.matrixWorld.elements[14]-o.z)>far+40) continue; _o.copy(o).applyMatrix4(og.inv); _d.copy(d).transformDirection(og.inv);
    for(const bx of og.boxes){ if(bx.roof&&!includeRoofs) continue; if(bx.b.containsPoint(_o)) continue; const t=slab(_o,_d,bx.b,far); if(t>=0&&t<best.dist) best={dist:t,og,roof:bx.roof}; } }
  for(const bx of trunkBoxes){ if(Math.abs(bx.b.min.x-o.x)>far+5) continue; if(bx.b.containsPoint(o)) continue; const t=slab(o,d,bx.b,far); if(t>=0&&t<best.dist) best={dist:t,og:null,roof:false}; }
  return best; }
export function rayOccAll(o,d,far){ const out=[]; for(const og of occGroups){ if(Math.abs(og.g.matrixWorld.elements[12]-o.x)>far+40||Math.abs(og.g.matrixWorld.elements[14]-o.z)>far+40) continue; _o.copy(o).applyMatrix4(og.inv); _d.copy(d).transformDirection(og.inv); let hit=null;
    for(const bx of og.boxes){ if(bx.b.containsPoint(_o)) continue; const t=slab(_o,_d,bx.b,far); if(t>=0){ if(!bx.roof){ hit={og,roof:false}; break; } hit=hit||{og,roof:true}; } } if(hit) out.push(hit); } return out; }
// 顶点 AO：优先读取离线烘焙（assets/ao.bin），布局变化时运行时补算
export async function bakeLighting(onProgress,key='garden'){ const allMerged=chunks[key]||[]; const hash=layoutHash(allMerged); const baked=await loadBaked(key); let off=0;
  const ok=baked&&baked.meta.hash===hash; if(!ok) console.info('[honglou] AO bake missing/stale for '+key+', computing at runtime');
  for(let i=0;i<allMerged.length;i++){ const m=allMerged[i]; const n=m.geometry.attributes.position.count; let ao;
    if(ok){ ao=baked.data.subarray(off,off+n); } else { ao=computeAO(m); if(i%4===0){ onProgress?.(i/allMerged.length); await new Promise(r=>setTimeout(r)); } }
    off+=n; applyAO(m,ao); }
  return {hash,baked:ok}; }
export function exportAO(key='garden'){ const allMerged=chunks[key]||[]; const hash=layoutHash(allMerged); const parts=allMerged.map(m=>computeAO(m)); const n=parts.reduce((a,p)=>a+p.length,0); const all=new Uint8Array(n); let o=0; for(const p of parts){ all.set(p,o); o+=p.length; }
  let bin=''; for(let i=0;i<all.length;i+=0x8000) bin+=String.fromCharCode.apply(null,all.subarray(i,i+0x8000)); return {hash,count:n,meshes:allMerged.length,b64:btoa(bin)}; }
export const locGroups={}; export const occluders=[]; export const lanterns=[]; const lights=[];
let water, ground, stars, moon, petals, fireflies, waterMat; export const grounds={};
const skyDecor=new THREE.Group(); scene.add(skyDecor);
export function getGround(){ return grounds[CUR]||ground; }
function lantern(parent,x,y,z){ const l=mesh(new THREE.SphereGeometry(.32,12,10),new THREE.MeshStandardMaterial({color:0xd8301c,emissive:0xff4020,emissiveIntensity:.3,roughness:.5}),x,y,z,parent,false); l.scale.y=1.25; BOX(.3,.08,.3,P.gold,x,y+.42,z,parent); BOX(.04,.25,.04,M(0xd4af37),x,y-.5,z,parent); lanterns.push(l); return l; }

export function buildWorld(LOCATIONS){
  makeTextures(); initMats(); ROOT=makeRoot('garden'); CHUNK='garden';
  // 地形
  const gg=new THREE.PlaneGeometry(260,260,90,90); const p=gg.attributes.position;
  for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i); const r=Math.max(Math.abs(x),Math.abs(y)); let h=Math.sin(x*.15)*Math.cos(y*.13)*.15; if(r>52) h+=(r-52)*.5+Math.sin(x*.08)*Math.cos(y*.09)*6; p.setZ(i,h);} gg.computeVertexNormals();
  const gt=cloneTex(LIB.grass,[36,36]); ground=new THREE.Mesh(gg,new THREE.MeshStandardMaterial({map:gt.map,normalMap:gt.normalMap,roughnessMap:gt.orm,roughness:1,normalScale:new THREE.Vector2(.6,.6)})); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; ROOT.add(ground); grounds.garden=ground;
  // 远山（水墨）
  for(let i=0;i<14;i++){ const a=i/14*Math.PI*2, r=R(150,190); const m=mesh(new THREE.ConeGeometry(R(25,45),R(25,50),7),new THREE.MeshBasicMaterial({color:0x8a9aa0,fog:true}),Math.cos(a)*r,0,Math.sin(a)*r,ROOT,false); m.position.y=m.geometry.parameters.height/2-3; }
  // 中心池塘（沁芳池）+ 溪
  const shape=new THREE.Shape(); for(let i=0;i<=48;i++){ const a=i/48*Math.PI*2, r=11+Math.sin(a*3)*1.6+Math.cos(a*5)*.8; i?shape.lineTo(Math.cos(a)*r,Math.sin(a)*r):shape.moveTo(Math.cos(a)*r,Math.sin(a)*r);} 
  const wm=waterMat=new THREE.MeshStandardMaterial({color:0x3f6f78,roughness:.08,metalness:.35,normalMap:TEX.waterN,normalScale:new THREE.Vector2(.35,.35),transparent:true,opacity:.92});
  if(RR.q.water&&!LOWQ){ // 高/中档：带实时倒影的水面（three Water：平面反射 + 法线扰动）
    water=new Water(new THREE.ShapeGeometry(shape,64),{textureWidth:RR.tierName==='high'?768:512,textureHeight:RR.tierName==='high'?768:512,waterNormals:TEX.waterN,sunDirection:new THREE.Vector3(.5,.6,.3).normalize(),sunColor:0xfff0d8,waterColor:0x2c4f52,distortionScale:1.1,fog:true,alpha:1});
    water.material.uniforms.size.value=2.2; water.position.y=.12; water.rotation.x=-Math.PI/2; ROOT.add(water); water.userData.reflect=true; }
  else { water=mesh(new THREE.ShapeGeometry(shape,64),wm,0,.12,0,ROOT,false); water.rotation.x=-Math.PI/2; }
  const bank=mesh(new THREE.TorusGeometry(11.3,.5,10,96),P.rock,0,.1,0,ROOT); bank.rotation.x=Math.PI/2; bank.scale.set(1.08,1.04,.6);
  const stream=mesh(new THREE.PlaneGeometry(3.4,58),wm,10,.11,22,ROOT,false); stream.rotation.set(-Math.PI/2,0,.62);
  // 荷叶荷花
  const pad=new THREE.CircleGeometry(.55,14,.3,5.9); pad.rotateX(-Math.PI/2); const pads=new THREE.InstancedMesh(pad,M(0x4f8a3c,{side:THREE.DoubleSide,roughness:.6}),70); const o=new THREE.Object3D();
  const lotusPetal=new THREE.SphereGeometry(.22,8,6,0,Math.PI,0,Math.PI/2); lotusPetal.scale(.6,1.7,1); lotusPetal.translate(0,.05,.12); const lotusG=new THREE.Group();
  let k=0; while(k<70){ const a=R(0,6.28), r=R(5,10); const x=Math.cos(a)*r,z=Math.sin(a)*r; if(Math.abs(x)<2.4) continue; o.position.set(x,.16,z); o.rotation.y=R(0,6); o.scale.setScalar(R(.7,1.4)); o.updateMatrix(); pads.setMatrixAt(k++,o.matrix);
    if(k%5===0){ for(let q=0;q<5;q++){ const f=mesh(lotusPetal,M(0xf3a6bd,{emissive:0xff8aa8,emissiveIntensity:.12,roughness:.5}),x,.3,z,lotusG,false); f.rotation.set(.55,q/5*6.28,0,'YXZ'); f.scale.setScalar(.7); } mesh(new THREE.SphereGeometry(.07,8,6),M(0xf0d040),x,.4,z,lotusG,false); } } ROOT.add(pads,lotusG); treeGroups.push(lotusG);
  // 小径（铺地）
  for(const L of LOCATIONS){ if(L.kind==='pavilion'||L.kind==='sluice') continue; const [x,z]=L.pos; const len=Math.hypot(x,z)-11-(isCompound(L)?0:4); const t=cloneTex(LIB.paving,[1.3,len/2]);
    const pm=mesh(new THREE.PlaneGeometry(2.6,len),new THREE.MeshStandardMaterial({map:t.map,normalMap:t.normalMap,roughnessMap:t.orm,roughness:1,polygonOffset:true,polygonOffsetFactor:-2}),0,.05,0,ROOT,false); pm.receiveShadow=true; const dx=x/Math.hypot(x,z),dz=z/Math.hypot(x,z); pm.position.set(dx*(11+len/2),.05,dz*(11+len/2)); pm.rotation.set(-Math.PI/2,0,Math.atan2(dx,dz)); pm.rotation.order='YXZ'; pm.rotation.set(-Math.PI/2,Math.atan2(dx,dz),0); }
  // 外围园墙
  for(const [x,z,w,rot] of [[0,-50,100,0],[0,50,100,0],[-50,0,100,Math.PI/2],[50,0,100,Math.PI/2]]){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rot; ROOT.add(g); staticGroups.push({g,occ:false}); BOX(w,2.8,.7,P.wall,0,2,0,g); BOX(w+.04,.6,.76,P.brick,0,.3,0,g); BOX(w+.6,.3,1.3,roofMat,0,3.55,0,g); BOX(w+.6,.2,.35,P.dark,0,3.8,0,g); for(let i=-w/2+6;i<w/2;i+=12){ const win=BOX(1.2,1.2,.75,P.lattice,i,2,0,g);} }
  // 各处院落
  for(const L of LOCATIONS){ const g=new THREE.Group(); const [x,z]=L.pos; g.position.set(x,0,z); g.lookAt(0,0,0); if(L.rot!=null) g.rotation.set(0,L.rot,0); ROOT.add(g); locGroups[L.id]=g; buildLoc(L,g,isCompound(L)||!!SPOT_OCC[L.kind]); }
  // 拱桥（沁芳闸桥）连亭
  for(const ang of [Math.PI/2, -Math.PI/2]) archBridge(Math.cos(ang)*6.6, Math.sin(ang)*6.6, ang);
  // 长廊：沁芳亭→秋爽斋、→怡红院 方向
  for(const id of ['qiushuang','yihong','hengwu']){ const L=LOCATIONS.find(l=>l.id===id); const d=new THREE.Vector3(L.pos[0],0,L.pos[1]); const n=d.length(); d.normalize(); corridor(d.clone().multiplyScalar(13.5), d.clone().multiplyScalar(n-9)); }
  // 景观植物
  for(let i=0;i<10;i++){ const a=i/10*Math.PI*2+.2; willow(Math.cos(a)*13.5,Math.sin(a)*13.5,R(.9,1.15)); }
  for(let i=0;i<45;i++){ const x=R(-46,46),z=R(-46,46); if(Math.hypot(x,z)<15||LOCATIONS.some(L=>Math.hypot(L.pos[0]-x,L.pos[1]-z)<14)) continue; [broadTree,broadTree,pine,plum][i%4](x,z,R(.8,1.2)); }
  for(let i=0;i<12;i++){ const a=R(0,6.28),r=R(14,40); const x=Math.cos(a)*r,z=Math.sin(a)*r; if(LOCATIONS.some(L=>Math.hypot(L.pos[0]-x,L.pos[1]-z)<14)) continue; rockery(x,z,R(.7,1.2)); }
  for(const t of trunks){ t.updateWorldMatrix(true,false); const b=new THREE.Box3().setFromObject(t); b.expandByScalar(-.08); trunkBoxes.push({b,roof:false}); }
  for(const g of staticGroups) addStatic(g.g,g.occ);
  for(const g of treeGroups) mergeChildren(g);
  rockery(-4,-12.5,1.4); rockery(5,12.8,1.1); staticGroups.length=0; treeGroups.length=0;
  grassTufts(RR.q.grass);
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
  stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:1.4,sizeAttenuation:false,transparent:true,fog:false})); skyDecor.add(stars);
  moon=new THREE.Mesh(new THREE.CircleGeometry(14,32),new THREE.MeshBasicMaterial({color:0xfff6d8,fog:false})); moon.position.set(-150,160,-250); moon.lookAt(0,0,0); skyDecor.add(moon);
  // 夜灯（少量点光）
  for(const id of ['yihong','xiaoxiang','qinfang','hengwu']){ const L=LOCATIONS.find(l=>l.id===id); const pl=new THREE.PointLight(0xff9a50,0,18,1.6); pl.position.set(L.pos[0]*.85,3,L.pos[1]*.85); ROOT.add(pl); lights.push(pl); }
  ROOT=scene;
}
// 院落种类 → 正房面阔
const COMPOUND_KINDS={flowers:9,bamboo:9,plum:9,stone:9,hall:11,tree:9,farm:8,grand:13,court:10,tower:9,temple:11,nunnery:8,boming:13};
const SPOT_OCC={smallhall:1,hut:1,shop:1,gate:1,sluice:0};
export function isCompound(L){ return L.kind in COMPOUND_KINDS; }
export function compoundW(L){ return L.w||COMPOUND_KINDS[L.kind]||9; }
const HALL_H={hall:4,grand:4.4,tower:4,temple:4.2,boming:4.4};
function roofOf(L){ return L.roof==='gold'?roofMats.gold:L.roof==='glaze'?roofMats.glaze:L.roof==='purple'?(roofMats.purple||(roofMats.purple=pbr(LIB,'glaze',{side:THREE.DoubleSide,color:0xc8a8f0,envMapIntensity:1.3}))):L.roof==='tile'?roofMat:null; }
function buildLoc(L,g,occ){ staticGroups.push({g,occ});
  const flip=new THREE.Group(); flip.rotation.y=0; g.add(flip);
  if(L.kind==='pavilion'){ pavilion(flip,2.6,3.2,{sides:6}); for(const a of [1.2,-1.2,2.4]) lantern(flip,Math.sin(a)*2.6,3.2,Math.cos(a)*2.6); return; }
  if(!isCompound(L)) return buildSpot(L,g,flip);
  // 院落：正房+院墙+月洞门（门朝向 +z）
  const W=compoundW(L), H=HALL_H[L.kind]||3.4;
  hall(flip,W,5.5,H,{double:!!HALL_H[L.kind]||L.id==='yihong'||!!L.double,rm:roofOf(L)||(L.kind==='hall'?roofMats.gold:L.id==='yihong'?roofMats.glaze:roofMat)});
  compoundWall(flip,W+9,16,{});
  const sign=signBoard(L.sign||L.name); sign.position.set(0,.7+H+.05,5.5/2+.35); flip.add(sign);
  const gateSign=signBoard(L.name,.7); gateSign.position.set(0,3.25,8.3); flip.add(gateSign);
  lantern(flip,-2.2,3,8.6); lantern(flip,2.2,3,8.6); lantern(flip,-2.6,3.6,3.4); lantern(flip,2.6,3.6,3.4);
  // 院中景致
  g.updateMatrixWorld(true); ROOT.updateMatrixWorld(true);
  const toWorld=(lx,lz)=>{ const v=new THREE.Vector3(lx,0,lz); g.localToWorld(v); return ROOT.worldToLocal(v); };
  const plant=(fn,lx,lz,...a)=>{ const v=toWorld(lx,lz); fn(v.x,v.z,...a); };
  if(L.kind==='bamboo'){ const v=toWorld(-5,0); bambooGrove(v.x,v.z,60,3.5); const v2=toWorld(5.5,0); bambooGrove(v2.x,v2.z,50,3); const v3=toWorld(0,-9.5); bambooGrove(v3.x,v3.z,50,6); }
  if(L.kind==='flowers'){ plant(broadTree,-5,5,1,[0x5c9a3a,0x6fae45]); plant(plum,5,5,1.1,0xf06b8a); plant(plum,-6,-1,.9,0xf6a6bd); const v=toWorld(4,6); flowers(v.x,v.z,60,1.8,[0xe8455a,0xf6a6bd]); }
  if(L.kind==='stone'){ plant(rockery,-5,5,1); plant(rockery,5,4,.9); plant(rockery,0,-9,1.4); const v=toWorld(0,6); flowers(v.x,v.z,40,3,[0x9acd32,0xe6e6a0]); }
  if(L.kind==='plum'){ for(const [a,b] of [[-5,5],[5,5],[-6,-1],[6,-1],[-3,-9],[4,-9]]) plant(plum,a,b,R(1,1.3),0xc8102e); }
  if(L.kind==='tree'){ plant(broadTree,-5,5,1.3,[0xc98a2b,0xd9a441,0xa8642a]); plant(broadTree,5,5,1.1,[0x5c8a3a,0x6f9e45]); }
  if(L.kind==='farm'){ // 稻田：细秆 + 垂穗，实例化
    const stalk=new THREE.CylinderGeometry(.012,.018,1,4); stalk.translate(0,.5,0); const ear=new THREE.CapsuleGeometry(.035,.22,2,5); ear.rotateZ(.7); ear.translate(.08,1.02,0); const sg=mergeGeometries([stalk.toNonIndexed(),ear.toNonIndexed()]);
    const N=700; const rows=new THREE.InstancedMesh(sg,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}),N); const o=new THREE.Object3D(); const cc=new THREE.Color();
    for(let i=0;i<N;i++){ const lv=toWorld(-6.5+(i%35)*.38+R(-.08,.08),11.6+Math.floor(i/35)*.32+R(-.08,.08)); o.position.set(lv.x,0,lv.z); o.rotation.set(R(-.12,.12),R(0,6.28),R(-.12,.12)); o.scale.set(1,R(.8,1.15),1); o.updateMatrix(); rows.setMatrixAt(i,o.matrix); rows.setColorAt(i,cc.setHSL(R(.11,.14),R(.5,.65),R(.45,.58))); }
    rows.castShadow=true; rows.receiveShadow=true; ROOT.add(rows); plant(willow,-6,5,.9); plant(broadTree,6,4,1); }
  if(L.kind==='hall'){ plant(pine,-6,5,1.2); plant(pine,6,5,1.2); const v=toWorld(0,6); /* 铜鼎 */ CYL(.6,.45,.9,P.gold,0,1.1,5.5,flip); }
  if(L.kind==='grand'){ plant(pine,-8,4.5,1.3); plant(pine,8,4.5,1.3); CYL(.7,.5,1,P.gold,0,1.2,5.8,flip); for(const sg of[-1,1]){ stoneLion(flip,sg*3.4,10.2,sg); CYL(.55,.45,.8,M(0x6a4a2a,{roughness:.5,metalness:.4}),sg*5,.4,5.5,flip); } }
  if(L.kind==='court'){ plant(broadTree,-5.5,5,1.1,[0x5c9a3a,0x6fae45]); plant(plum,5,5,1,0xf6a6bd); const v=toWorld(3,6); flowers(v.x,v.z,40,1.6,[0xe8455a,0xf2c14e,0xffffff]); CYL(.5,.4,.6,M(0x4a6a5a,{roughness:.4,metalness:.3}),-3,.3,6,flip); }
  if(L.kind==='tower'){ plant(plum,-5,5,1.1,0xf06b8a); plant(broadTree,5,4.5,1,[0x5c8a3a,0x6f9e45]); plant(rockery,-6,-1,.8); }
  if(L.kind==='temple'){ plant(pine,-6,5,1.4); plant(pine,6,5,1.3); plant(pine,-6,-2,1.1); const b=CYL(.6,.7,.9,M(0x5a4a3a,{roughness:.5,metalness:.5}),0,.8,5.6,flip); CYL(.75,.75,.12,M(0x5a4a3a,{roughness:.5,metalness:.5}),0,1.3,5.6,flip); for(let i=0;i<3;i++){ const a=i/3*6.28; CYL(.06,.06,.5,M(0x5a4a3a),Math.cos(a)*.5,.25,5.6+Math.sin(a)*.5,flip,5); } }
  if(L.kind==='nunnery'){ plant(broadTree,-5,5,1); plant(plum,5,4,1,0xffffff); plant(pine,0,-9,1); }
  if(L.kind==='boming'){ // 薄命司：十数个大橱，封条上写着各省地名
    for(const [x,lab] of [[-3.6,'正册'],[0,'副册'],[3.6,'又副册']]){ BOX(2.2,3.2,1,P.wood,x,1.6,5.2,flip); BOX(2.3,.2,1.1,P.gold,x,3.25,5.2,flip); const sb=signBoard('金陵·'+lab,.55); sb.position.set(x,2.5,5.72); flip.add(sb); }
    for(const sg of[-1,1]) plant(plum,sg*6,5,1.1,0xe8b8ff); }
}
function stoneLion(parent,x,z,sg){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=-sg*.25; parent.add(g); const m=P.marble;
  BOX(1,.6,1.3,m,0,.3,0,g); const b=mesh(new THREE.SphereGeometry(.42,14,10),m,0,1,-.1,g); b.scale.set(1,1.15,1.2); const h=mesh(new THREE.SphereGeometry(.34,14,10),m,0,1.55,.22,g); mesh(new THREE.SphereGeometry(.2,10,8),m,0,1.45,.48,g); for(const s of[-1,1]) mesh(new THREE.SphereGeometry(.12,8,6),m,s*.18,.75,.42,g); }
// ---------- 园中小景（无院墙）：每种返回局部碰撞矩形 ----------
function kiosk(parent,x,z,r,H,{sides=4,rm=roofMats.glaze,base=.2}={}){ const g=new THREE.Group(); g.position.set(x,0,z); parent.add(g);
  mesh(new THREE.CylinderGeometry(r+.5,r+.6,base,sides,1),P.stone,0,base/2,0,g).rotation.y=Math.PI/sides;
  for(let i=0;i<sides;i++){ const a=(i+.5)/sides*Math.PI*2; CYL(.13,.15,H,P.pillar,Math.cos(a)*r,base+H/2,Math.sin(a)*r,g,10); }
  const R2=r*Math.SQRT2*(sides===4?1:.85); roof(g,2*R2+1.6,2*R2+1.6,H*.7,base+H+.1,{upturn:.7,rotY:sides===4?0:Math.PI/4,mat:rm}); return g; }
function pond(parent,x,z,r){ const sh=new THREE.Shape(); for(let i=0;i<=40;i++){ const a=i/40*Math.PI*2, rr=r*(1+Math.sin(a*3)*.08+Math.cos(a*5)*.05); i?sh.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):sh.moveTo(Math.cos(a)*rr,Math.sin(a)*rr); }
  const w=mesh(new THREE.ShapeGeometry(sh,40),waterMat,x,.1,z,parent,false); w.rotation.x=-Math.PI/2; w.userData.dyn=true;
  const bank=mesh(new THREE.TorusGeometry(r*1.02,.32,8,48),P.rock,x,.08,z,parent); bank.rotation.x=Math.PI/2; bank.scale.z=.55; return w; }
function flatBridge(parent,x,z0,z1,w=1.8){ const len=Math.abs(z1-z0), zc=(z0+z1)/2; BOX(w,.18,len,P.marble,x,.32,zc,parent); for(const s of[-1,1]){ BOX(.1,.1,len,P.marble,x+s*(w/2-.05),.95,zc,parent); for(let t=0;t<=len;t+=1.1) BOX(.12,.65,.12,P.marble,x+s*(w/2-.05),.62,zc-len/2+t,parent); } }
function reeds(parent,x,z,r,n=160){ const geo=new THREE.CylinderGeometry(.015,.025,1,4); geo.translate(0,.5,0); const inst=new THREE.InstancedMesh(geo,M(0xc8b878,{roughness:.9}),n); const o=new THREE.Object3D();
  for(let i=0;i<n;i++){ const a=R(0,6.28), rr=r+R(-.6,.9); o.position.set(x+Math.cos(a)*rr,0,z+Math.sin(a)*rr); o.rotation.set(R(-.15,.15),0,R(-.15,.15)); o.scale.set(1,R(1.2,2.2),1); o.updateMatrix(); inst.setMatrixAt(i,o.matrix); } inst.castShadow=true; parent.add(inst);
  const tops=new THREE.InstancedMesh(new THREE.ConeGeometry(.06,.35,5),M(0xe8dcc0,{roughness:.9}),n); for(let i=0;i<n;i++){ const m=new THREE.Matrix4(); inst.getMatrixAt(i,m); const p=new THREE.Vector3().setFromMatrixPosition(m); const sy=new THREE.Vector3().setFromMatrixScale(m).y; o.position.set(p.x,sy,p.z); o.rotation.set(0,0,0); o.scale.setScalar(1); o.updateMatrix(); tops.setMatrixAt(i,o.matrix); } parent.add(tops); }
function gateHouse(parent,label,{w=5.2,lions=true}={}){ for(const s of[-1,1]){ CYL(.28,.3,3.6,P.pillar,s*w/2,1.8,0,parent); BOX(1.2,3.4,.9,P.wall,s*(w/2+1.1),1.7,-.2,parent); }
  BOX(w-.4,3.2,.22,new THREE.MeshStandardMaterial({color:0x8e1b16,roughness:.45,envMapIntensity:1}),0,1.6,-.3,parent);
  for(let i=0;i<5;i++) for(let j=0;j<5;j++) for(const s of[-1,1]) mesh(new THREE.SphereGeometry(.05,6,5),P.gold,s*(w/4)+(-2+i)*.28,.6+j*.5,-.17,parent,false);
  BOX(w+.6,.5,1.2,P.beam,0,3.75,0,parent); roof(parent,w+3.6,3.4,1.5,4.05,{ridge:.5,upturn:.5}); BOX(w+1,.25,2.4,P.stone,0,.12,.4,parent);
  const sb=signBoard(label,.9); sb.position.set(0,4.4,.62); parent.add(sb); if(lions) for(const s of[-1,1]) stoneLion(parent,s*(w/2+1.8),1.6,s); }
export const GATE_HOUSE=1;
function buildSpot(L,g,flip){ const rects=[]; g.updateMatrixWorld(true); ROOT.updateMatrixWorld(true);
  const toLocal=(lx,lz)=>{ const v=new THREE.Vector3(lx,0,lz); g.localToWorld(v); return ROOT.worldToLocal(v); }; const plant=(fn,lx,lz,...a)=>{ const v=toLocal(lx,lz); fn(v.x,v.z,...a); };
  const k=L.kind;
  if(k==='waterside'||k==='dicui'){ pond(flip,0,-5,5); kiosk(flip,0,-5.6,1.9,3,{sides:k==='dicui'?6:4,rm:k==='dicui'?roofMats.glaze:roofMat}); flatBridge(flip,0,-.2,-3.4);
    const sb=signBoard(L.name,.7); sb.position.set(0,3.25,-3.7); flip.add(sb); lantern(flip,-1.3,2.8,-3.7); lantern(flip,1.3,2.8,-3.7);
    if(k==='waterside'){ plant(willow,-6.5,-2,1); plant(broadTree,6.5,-1,1,[0x5c9a3a,0x6fae45]); } else { plant(willow,6,-2,1.05); plant(plum,-6,-1,.9,0xf6a6bd); }
    rects.push([-6,-1.1,-10.5,.3],[1.1,6,-10.5,.3],[-6,6,-10.5,-7.9]); }
  if(k==='smallhall'){ const sub=new THREE.Group(); sub.position.z=-2; flip.add(sub); hall(sub,7,4.5,3.2,{ridge:.45,rm:L.roof==='glaze'?roofMats.glaze:roofMat});
    const sb=signBoard(L.name,.75); sb.position.set(0,3.95,.6); flip.add(sb); lantern(flip,-2.2,3.3,.9); lantern(flip,2.2,3.3,.9);
    for(const s of[-1,1]) railing(flip,4,s*5.6,2.4,Math.PI/2);
    if(L.id==='ziling'){ pond(flip,0,-10,4.6); reeds(flip,0,-10,4.8,140); plant(willow,-6,-6,1); plant(willow,6,-7,.95); rects.push([-5,5,-14.8,-5.4]); }
    else { for(const [a,b] of [[-6,1],[6,1],[-5,-6],[5,-6]]) plant(plum,a,b,R(1,1.2),0xc8102e); const v=toLocal(0,4); flowers(v.x,v.z,30,2,[0xe8455a,0xffffff]); }
    rects.push([-4.7,4.7,-5.6,1.7]); }
  if(k==='hut'){ const sub=new THREE.Group(); sub.position.z=-1.5; flip.add(sub); BOX(5.4,.4,4.4,P.wood,0,.2,0,sub); for(const [x,z] of [[-2.4,-1.9],[2.4,-1.9],[-2.4,1.9],[2.4,1.9]]) CYL(.12,.14,2.8,P.wood,x,1.6,z,sub,8);
    BOX(4.6,2.2,.12,P.lattice,0,1.5,-1.9,sub); roof(sub,7,6,1.9,3.1,{ridge:.35,upturn:.2,mat:thatchMat(),ridgeColor:0x7a6a48});
    const sb=signBoard(L.name,.7); sb.position.set(0,2.75,.75); flip.add(sb); pond(flip,0,-9.5,4.2); reeds(flip,0,-9.5,4.4,200); plant(plum,-5.5,1,1,0xc8102e); plant(plum,5.5,0,1.1,0xc8102e);
    rects.push([-3,3,-4,1],[-4.8,4.8,-14,-5.2]); }
  if(k==='sluice'){ for(const s of[-1,1]) BOX(1.4,3.2,2.2,P.stone,s*2.4,1.6,0,flip); BOX(6.4,.6,2.4,P.stone,0,3.4,0,flip); for(let i=0;i<5;i++) BOX(.62,2.4,.12,P.wood,-1.4+i*.7,1.3,.1,flip);
    const sb=signBoard(L.name,.8); sb.position.set(0,3.4,1.25); flip.add(sb); const w=mesh(new THREE.PlaneGeometry(3.4,3),waterMat,0,.11,2.4,flip,false); w.rotation.x=-Math.PI/2; w.userData.dyn=true; plant(willow,-4.5,2,1); plant(willow,4.5,2.5,.9);
    rects.push([-3.2,3.2,-1.2,1.2]); }
  if(k==='cave'){ for(const s of[-1,1]){ const v=toLocal(s*3.1,0); rockery(v.x,v.z,1.5); const v2=toLocal(s*4.6,-1.5); rockery(v2.x,v2.z,1.2); }
    let geo=new THREE.IcosahedronGeometry(1,3); geo.deleteAttribute('normal'); geo=mergeVertices(geo); const pp=geo.attributes.position; for(let i=0;i<pp.count;i++){ const v=new THREE.Vector3().fromBufferAttribute(pp,i); v.multiplyScalar(1+.25*Math.sin(v.x*3.1+v.y*2)*Math.cos(v.z*2.7)); pp.setXYZ(i,v.x,v.y,v.z); } geo.computeVertexNormals();
    const lin=mesh(geo,P.rock,0,3.4,0,flip); lin.scale.set(3.6,.9,1.6); const tab=BOX(1.4,1.8,.25,P.marble,-2.4,.9,2.4,flip); const sb=signBoard(L.sign||L.name,.55); sb.position.set(-2.4,1.1,2.54); flip.add(sb);
    const v=toLocal(0,4); flowers(v.x,v.z,20,2,[0x9acd32,0xe6e6a0]); rects.push([-6.4,-1.35,-3,2],[1.35,6.4,-3,2]); }
  if(k==='gate'){ const sub=new THREE.Group(); sub.position.z=-1.2; flip.add(sub); gateHouse(sub,L.sign||L.name); rects.push([-6,6,-2.4,.3]); }
  if(k==='shop'){ const sub=new THREE.Group(); sub.position.z=-3.6; flip.add(sub); hall(sub,8,5,3.2,{ridge:.5,double:!!L.double,rm:roofOf(L)||roofMat});
    const sb=signBoard(L.sign||L.name,.8); sb.position.set(0,4,-.6+.1); flip.add(sb); BOX(3.4,1,1,P.wood,0,.5,1.1,flip);
    const pole=CYL(.06,.06,4.2,P.wood,4.8,2.1,.6,flip,6); const flag=new THREE.Mesh(new THREE.PlaneGeometry(.9,2.2),new THREE.MeshStandardMaterial({map:bannerTex(L.flag||L.name.slice(0,1)),side:THREE.DoubleSide,roughness:.8})); flag.position.set(4.3,3,.6); flag.userData.dyn=true; flip.add(flag);
    lantern(flip,-3,2.6,.6); lantern(flip,3,2.6,.6); rects.push([-5.2,5.2,-7,-.2],[-1.9,1.9,.5,1.7]); }
  if(k==='spotgarden'){ pond(flip,0,-4,5.5); const kk=kiosk(flip,0,4.5,1.6,2.8,{sides:6}); const sb=signBoard(L.name,.7); sb.position.set(0,3.2,6.1); flip.add(sb);
    for(const [a,b] of [[-7,2],[7,1],[-6,-8],[6,-9],[0,-11]]) plant(plum,a,b,R(1,1.25),[0xc8102e,0xf06b8a,0xf6a6bd][Math.floor(R(0,3))]); plant(rockery,-8,-4,1.1); plant(rockery,8,-3,.9);
    rects.push([-6,6,-10,1.2]); }
  if(k==='changting'){ kiosk(flip,0,0,2,3,{sides:4,rm:roofMat}); BOX(2.4,.45,.6,P.stone,0,.42,0,flip); const sb=signBoard(L.name,.7); sb.position.set(0,3.25,1.62); flip.add(sb); plant(willow,-5,1,1.1); plant(willow,5,-1,1); plant(willow,-4,-5,.9); }
  if(rects.length) colliders.push({g,rects});
}
let _thatch=null; function thatchMat(){ if(_thatch) return _thatch; const t=canvasTex(128,128,(x,w,h)=>{ noiseFill(x,w,h,'#b89a5a',['#8a7040','#d8c088','#a08048','#c8b070'],4000,2); x.strokeStyle='rgba(80,60,30,.35)'; for(let i=0;i<60;i++){ x.beginPath(); const xx=R(0,w); x.moveTo(xx,R(0,h)); x.lineTo(xx+R(-3,3),R(0,h)); x.stroke(); } },[3,3]); return _thatch=new THREE.MeshStandardMaterial({map:t,roughness:.95,side:THREE.DoubleSide}); }
function bannerTex(ch){ return canvasTex(64,160,(x,w,h)=>{ x.fillStyle='#f0e6c8'; x.fillRect(0,0,w,h); x.fillStyle='#9e1f19'; x.fillRect(0,0,w,10); x.fillRect(0,h-14,w,14); x.fillStyle='#2a1a12'; x.font='bold 44px "Ma Shan Zheng","KaiTi",serif'; x.textAlign='center'; x.textBaseline='middle'; [...ch].slice(0,2).forEach((c,i,a)=>x.fillText(c,w/2,h/2+(i-(a.length-1)/2)*50)); }); }
function signBoard(text,s=1){ const c=document.createElement('canvas'); c.width=256;c.height=96; const x=c.getContext('2d'); x.fillStyle='#1d2438';x.fillRect(0,0,256,96); x.strokeStyle='#d4af37';x.lineWidth=8;x.strokeRect(6,6,244,84); x.fillStyle='#e8c76a'; x.font='bold 52px "Ma Shan Zheng","STKaiti","KaiTi",serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(text,128,52);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; const m=new THREE.Mesh(new THREE.PlaneGeometry(2.4*s,.9*s),new THREE.MeshStandardMaterial({map:t,roughness:.6})); m.userData.redraw=()=>{ x.fillStyle='#1d2438';x.fillRect(12,12,232,72); x.fillStyle='#e8c76a'; x.font='bold 52px "Ma Shan Zheng","STKaiti","KaiTi",serif'; x.fillText(text,128,52); t.needsUpdate=true; }; signs.push(m); return m; }
export const signs=[];
function archBridge(x,z,ang){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=-ang; ROOT.add(g); staticGroups.push({g,occ:false});
  const s=new THREE.Shape(); const L=5,H=1.4; s.moveTo(-L/2-.6,0); s.quadraticCurveTo(0,H*2,L/2+.6,0); s.lineTo(L/2,0); s.quadraticCurveTo(0,H*1.2,-L/2,0); s.closePath();
  const geo=new THREE.ExtrudeGeometry(s,{depth:2.2,bevelEnabled:false,curveSegments:24}); geo.translate(0,0,-1.1); mesh(geo,P.marble,0,0,0,g);
  for(const zz of[-1.15,1.15]){ for(let i=-5;i<=5;i++){ const t=i/5; const xx=t*(L/2+.3), y=H*(1-t*t)+.05; BOX(.1,.7,.1,P.marble,xx,y+.35,zz,g);} const rail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-L/2-.3,.7,zz),new THREE.Vector3(0,H*2+.7,zz),new THREE.Vector3(L/2+.3,.7,zz)),20,.05,5),P.marble); g.add(rail); }
}
function corridor(a,b){ const dir=b.clone().sub(a), len=dir.length(); const g=new THREE.Group(); g.position.copy(a).lerp(b,.5); g.rotation.y=Math.atan2(dir.x,dir.z); ROOT.add(g); staticGroups.push({g,occ:false});
  BOX(2.6,.3,len,P.stone,0,.15,0,g); for(let i=0;i<=len;i+=2.2) for(const s of[-1,1]){ CYL(.11,.12,2.6,P.pillar,s*1.1,1.6,-len/2+i,g,8); }
  for(const s of[-1,1]) BOX(.15,.25,len,P.beam,s*1.1,2.9,0,g);
  mesh(roofGeo(3.8,len+1,.9,{upturn:.35}),roofMat,0,3,0,g).userData.roof=true; mesh(roofGeo(3.7,len+.9,.86,{upturn:.35,seg:12}),P.underRoof,0,2.92,0,g,false).userData.roof=true;
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
// 布料材质：丝绸织纹/云纹 + 边缘压暗（体积感）+ 类次表面背光 sheen
let SILK=null;
function fabric(color,{pattern=true,side=THREE.FrontSide,rough=.72}={}){ if(!SILK) SILK=cloneTex(LIB.silk,[4,3]);
  const m=new THREE.MeshStandardMaterial({color,roughness:rough,side,map:pattern?SILK.map:null,normalMap:SILK.normalMap,normalScale:new THREE.Vector2(.5,.5)});
  m.onBeforeCompile=sh=>{ sh.fragmentShader=sh.fragmentShader.replace('#include <opaque_fragment>',`{ vec3 Vd=normalize(vViewPosition); float rim=1.0-saturate(abs(dot(normal,Vd)));
      outgoingLight*=1.0-0.3*pow(rim,1.6);
      outgoingLight+=diffuseColor.rgb*pow(rim,3.0)*0.35; }
    #include <opaque_fragment>`); };
  m.customProgramCacheKey=()=>'fabric'+(side===THREE.DoubleSide?'2':'1'); return m; }
export function makeCharacter(st){
  const root=new THREE.Group(); const body=new THREE.Group(); root.add(body); const W2=st.wide||1;
  const robeM=fabric(st.robe), robe2=fabric(st.robe,{side:THREE.DoubleSide}), skirtM=fabric(st.skirt??st.robe,{rough:.78}), trimM=M(st.trim??0xd4af37,{roughness:.45,metalness:.25,noCache:true}), hairM=M(st.hair??0x15100c,{roughness:.38,noCache:true});
  hairM.envMapIntensity=1.3;
  // 裙（车削，多段曲线：腰收、裙摆外扩）
  const prof=[[0,0],[.6,0],[.64,.04],[.6,.14],[.53,.42],[.45,.75],[.37,1.05],[.3,1.24],[0,1.26]].map(([r,y])=>new THREE.Vector2(r*W2,y));
  const skirt=mesh(new THREE.LatheGeometry(prof,28),skirtM,0,0,0,body);
  const hem=mesh(new THREE.TorusGeometry(.62*W2,.03,6,32),trimM,0,.07,0,body,false); hem.rotation.x=Math.PI/2;
  // 上身（车削：肩—胸—腰）
  const torso=mesh(new THREE.LatheGeometry([[0,0],[.3,0],[.27,.2],[.24,.42],[.25,.58],[.22,.68],[.12,.76],[0,.78]].map(([r,y])=>new THREE.Vector2(r*(st.male?1.08:1),y)),20),robeM,0,1.18,0,body); torso.scale.z=.82;
  // 外衫：女子褙子前襟敞开露出裙，男子直裰合襟；下摆略外扩
  const gap=st.male?0:.42; const cp=[[.2,.0],[.33,.05],[.4,.35],[.47,.75],[.53,1.05],[.56,1.12]].map(([r,y])=>new THREE.Vector2(r*(st.male?1.05:1)*Math.max(1,W2*.92),1.12-y));
  const coat=mesh(new THREE.LatheGeometry(cp,26,gap,Math.PI*2-gap*2),robe2,0,.68,0,body); coat.scale.z=.9;
  if(gap){ for(const sg of[-1,1]){ const pts=cp.map(v=>new THREE.Vector3(Math.sin(sg*gap)*v.x,v.y+.68,Math.cos(gap)*v.x*.9+.005)); const band=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),12,.022,5),trimM,0,0,0,body,false); } }
  const coatHem=mesh(new THREE.TorusGeometry(.56*Math.max(1,W2*.92),.025,5,32,Math.PI*2-gap*2),trimM,0,.68,0,body,false); coatHem.rotation.set(Math.PI/2,0,Math.PI/2+gap); coatHem.scale.y=.9;
  const collar=mesh(new THREE.TorusGeometry(.17,.04,8,20),trimM,0,1.9,.02,body,false); collar.rotation.x=Math.PI/2.3;
  const sash=mesh(new THREE.CylinderGeometry(.27,.29,.1,20),M(st.sash??0xd4af37,{noCache:true,roughness:.5}),0,1.3,0,body,false); sash.scale.z=.85;
  for(const s of[-1,1]){ const rb=mesh(new THREE.PlaneGeometry(.07,.75),M(st.sash??0xd4af37,{side:THREE.DoubleSide,roughness:.5}),s*.07,.92,.27,body,false); rb.rotation.z=s*.06; }
  if(st.cape){ const cp2=mesh(new THREE.CylinderGeometry(.3,.66,1.3,24,4,true,Math.PI*.15,Math.PI*1.7),fabric(st.cape,{side:THREE.DoubleSide}),0,1.3,0,body); cp2.rotation.y=Math.PI; }
  // 臂：内袖（裙色、窄）+ 外层广袖（外扩、镶边）
  const arms=[]; for(const s of[-1,1]){ const sh=new THREE.Group(); sh.position.set(s*.27,1.84,0); body.add(sh);
    mesh(new THREE.CylinderGeometry(.075,.1,.82,14,1,true),fabric(st.skirt??st.robe,{side:THREE.DoubleSide}),0,-.42,0,sh);
    const sleeve=mesh(new THREE.CylinderGeometry(.09,st.male?.17:.23,.7,18,3,true),robe2,0,-.37,0,sh); sleeve.rotation.z=s*.06;
    const cuff=mesh(new THREE.TorusGeometry(st.male?.17:.23,.026,6,24),trimM,s*-.02,-.72,0,sh,false); cuff.rotation.x=Math.PI/2;
    const hand=mesh(new THREE.SphereGeometry(.065,12,10),M(0xf6dcc4,{roughness:.6}),0,-.88,.02,sh,false); hand.scale.set(.9,1.1,.8);
    sh.rotation.z=s*.08; arms.push(sh); }
  // 头
  const head=new THREE.Group(); head.position.y=2.18; head.scale.setScalar(.88); body.add(head);
  mesh(new THREE.CylinderGeometry(.08,.1,.18,8),M(0xf6dcc4),0,-.16,0,head);
  const skull=mesh(new THREE.SphereGeometry(.27,24,18),new THREE.MeshStandardMaterial({map:faceTex(st.face||{}),roughness:.7}),0,.08,0,head); skull.scale.set(.92,1.05,.95);
  const hairCap=mesh(new THREE.SphereGeometry(.285,20,14,0,Math.PI*2,0,Math.PI*.55),hairM,0,.11,-.02,head); hairCap.rotation.x=-.35;
  const ornaments=[];
  if(!st.male&&!['nun','scarf'].includes(st.style)){ // 女子：脑后长发 + 两鬓垂发
    const back=mesh(new THREE.SphereGeometry(.27,18,14,0,Math.PI*2,Math.PI*.35,Math.PI*.55),hairM,0,-.06,-.07,head); back.scale.set(.98,1.5,.9);
    for(const sg of[-1,1]){ const lk=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(sg*.22,.2,.08),new THREE.Vector3(sg*.25,.02,.1),new THREE.Vector3(sg*.23,-.18,.06)]),8,.028,5),hairM,0,0,0,head,false); } }
  const style=st.style||'bun';
  if(style==='crown'){ // 宝玉：束发嵌宝紫金冠 + 抹额
    const c=mesh(new THREE.CylinderGeometry(.11,.14,.18,10),P.gold,0,.38,-.02,head); mesh(new THREE.SphereGeometry(.05,8,6),M(0xd02040,{emissive:0x600010}),0,.42,.11,head);
    const band=mesh(new THREE.TorusGeometry(.265,.025,6,24),M(0xd4af37),0,.17,.0,head,false); band.rotation.x=Math.PI/2+.1; mesh(new THREE.SphereGeometry(.04,8,6),M(0x2fbf71,{emissive:0x0a4020}),0,.2,.26,head);
    mesh(new THREE.CylinderGeometry(.06,.02,.7,6),hairM,0,-.2,-.24,head).rotation.x=.2; }
  if(style==='twin'){ for(const s of[-1,1]){ const b=mesh(new THREE.TorusGeometry(.1,.045,8,16),hairM,s*.2,.38,-.05,head); b.rotation.y=Math.PI/2; } mesh(new THREE.ConeGeometry(.16,.6,8),hairM,0,-.12,-.22,head).rotation.x=Math.PI+.25; }
  if(style==='bun'||style==='lowbun'){ const y=style==='bun'?.36:.12; mesh(new THREE.SphereGeometry(.16,16,12),hairM,0,y,-.2,head); const wrap=mesh(new THREE.TorusGeometry(.13,.04,8,20),hairM,0,y,-.2,head,false); wrap.rotation.x=.6; mesh(new THREE.SphereGeometry(.035,8,6),M(0xe8e0f0,{roughness:.2,metalness:.1}),.1,y+.08,-.12,head,false); ornaments.push(mesh(new THREE.CylinderGeometry(.012,.012,.42,4),P.gold,.12,y+.02,-.2,head,false)); ornaments[0].rotation.z=1.2; }
  if(style==='high'){ const b=mesh(new THREE.SphereGeometry(.2,12,10),hairM,0,.42,-.08,head); b.scale.set(1.3,.8,.9); for(const s of[-1,0,1]){ const f=mesh(new THREE.ConeGeometry(.04,.3,5),P.gold,s*.16,.55,-.04,head,false); f.rotation.z=-s*.6; } mesh(new THREE.SphereGeometry(.05,8,6),M(0xd02040,{emissive:0x900010}),0,.52,.12,head); }
  if(style==='nun'){ const c=mesh(new THREE.CylinderGeometry(.24,.3,.22,16),M(0x9a9a9e),0,.3,-.02,head); mesh(new THREE.CylinderGeometry(.3,.34,.6,16,1,true),M(0x9a9a9e,{side:THREE.DoubleSide}),0,0,-.1,head); }
  if(style==='scarf'){ const sc=mesh(new THREE.SphereGeometry(.3,14,10,0,Math.PI*2,0,Math.PI*.6),M(0x5a6a8a),0,.12,-.03,head); sc.rotation.x=-.4; }
  if(style==='hat'){ const c=mesh(new THREE.CylinderGeometry(.2,.26,.26,14),M(st.hatC??0x1a1a22,{roughness:.6}),0,.34,-.02,head); const br=mesh(new THREE.CylinderGeometry(.34,.34,.03,16),M(st.hatC??0x1a1a22,{roughness:.6}),0,.22,-.02,head,false); for(const s of[-1,1]){ const w=mesh(new RoundedBoxGeometry(.24,.06,.02,1,.01),M(st.hatC??0x1a1a22),s*.22,.36,-.2,head,false); w.rotation.z=s*.3; } }
  if(style==='maid'){ for(const s of[-1,1]) mesh(new THREE.SphereGeometry(.11,10,8),hairM,s*.19,.3,-.08,head); }
  if(st.accessory==='jade'){ mesh(new THREE.SphereGeometry(.07,10,8),M(0x7fe0b0,{emissive:0x1a6040,roughness:.2}),0,1.68,.3,body,false); }
  if(st.accessory==='lock'){ mesh(new RoundedBoxGeometry(.16,.12,.03,2,.012),P.gold,0,1.66,.3,body,false); }
  if(st.accessory==='qilin'){ mesh(new THREE.TorusKnotGeometry(.05,.015,30,5),P.gold,.18,1.2,.3,body,false); }
  if(st.accessory==='hoe'){ const h=new THREE.Group(); h.position.set(.36,1.1,.15); h.rotation.z=-.3; body.add(h); CYL(.02,.02,1.6,M(0x6a4a2a),0,0,0,h,5); BOX(.2,.12,.03,P.gold,0,.8,.05,h); }
  if(st.accessory==='whisk'){ CYL(.015,.015,.6,M(0x6a4a2a),.38,1.05,.2,body,5); }
  // 鞋
  const feet=[]; for(const s of[-1,1]){ const f=mesh(new THREE.SphereGeometry(.09,8,6),M(st.shoe??0x8e1b16),s*.13,.05,.22,root,false); f.scale.set(1,.6,1.8); feet.push(f); }
  const scale=st.scale||1; root.scale.setScalar(scale);
  root.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
  // 合并：躯干/裙/外衫在动画里各自摆动，保留；其余饰件按材质合并以减少 draw call
  const keep=new Set([skirt,coat]); const tmpParent=new THREE.Group(); for(const o of [...body.children]) if(keep.has(o)){ body.remove(o); tmpParent.add(o); }
  mergeChildren(body); for(const o of [...tmpParent.children]) body.add(o); for(const a of arms) mergeChildren(a); mergeChildren(head);
  root.userData.rig={body,arms,head,skirt,feet,coat,walk:0,phase:R(0,6),blend:0,armV:[0,0],armA:[0,0],lod:0};
  return root;
}
const _cp2=new THREE.Vector3();
export function animateCharacter(ch,dt,t,speed){
  const r=ch.userData.rig; r.blend+=(Math.min(1,speed/2)-r.blend)*(1-Math.exp(-dt*8)); const b=r.blend; r.walk+=dt*speed*3.2;
  const w=Math.sin(r.walk), breathe=Math.sin(t*1.6+r.phase);
  r.body.position.y=b*Math.abs(Math.cos(r.walk))*.05+(1-b)*breathe*.01; r.body.rotation.z=b*w*.03; r.body.rotation.x=b*.06; r.body.rotation.y=b*w*.06;
  // 手臂：目标角 + 弹簧（广袖随身晃动有惯性）
  for(let k=0;k<2;k++){ const sg=k?-1:1; const tgt=b*sg*w*.5+(1-b)*Math.sin(t*1.1+r.phase+k)*.04; const acc=(tgt-r.armA[k])*90-r.armV[k]*14; r.armV[k]+=acc*Math.min(dt,.05); r.armA[k]+=r.armV[k]*Math.min(dt,.05);
    r.arms[k].rotation.x=r.armA[k]; r.arms[k].rotation.z=(k?1:-1)*(.07+b*.05+Math.abs(r.armV[k])*.02); }
  r.skirt.rotation.z=b*w*.04+(1-b)*Math.sin(t+r.phase)*.008; r.skirt.rotation.x=-b*.04; r.coat.rotation.z=r.skirt.rotation.z*.7; r.coat.rotation.x=-b*.07;
  r.feet[0].position.z=.22+b*w*.18; r.feet[1].position.z=.22-b*w*.18; r.feet[0].position.y=.05+b*Math.max(0,w)*.05; r.feet[1].position.y=.05+b*Math.max(0,-w)*.05;
  r.head.rotation.y=(1-b)*Math.sin(t*.4+r.phase)*.25; r.head.rotation.x=-b*.05+(1-b)*Math.sin(t*.7+r.phase)*.03; r.head.rotation.z=b*w*-.02;
  // LOD：远处隐藏细小饰件并关闭投影
  const d=ch.getWorldPosition(_cp2).distanceTo(camera.position); const lod=d>45?2:d>24?1:0;
  if(lod!==r.lod){ r.lod=lod; ch.traverse(o=>{ if(o.isMesh) o.castShadow=lod<1; }); }
}
// 立绘：用独立小渲染器把人物半身渲染为图片
export function renderPortraits(styles){
  const out={}; const c=document.createElement('canvas'); c.width=320;c.height=400;
  const rr=new THREE.WebGLRenderer({canvas:c,alpha:true,antialias:true,preserveDrawingBuffer:true}); rr.toneMapping=THREE.NeutralToneMapping; rr.outputColorSpace=THREE.SRGBColorSpace;
  const sc=new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e0,0x8a7050,1.4)); const dl=new THREE.DirectionalLight(0xffffff,1.6); dl.position.set(1.5,3,4); sc.add(dl);
  const cam=new THREE.PerspectiveCamera(26,320/400,.1,50); cam.position.set(.5,2.05,3.6); cam.lookAt(0,1.8,0);
  for(const [id,st] of Object.entries(styles)){ const ch=makeCharacter(st); ch.scale.setScalar(1); ch.rotation.y=.25; animateCharacter(ch,0,1,0); sc.add(ch); rr.render(sc,cam); out[id]=c.toDataURL('image/png'); sc.remove(ch); ch.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); } }); }
  rr.dispose(); rr.forceContextLoss?.(); return out;
}

// ---------- 天色 ----------
const SKIES=[ // 晨 午 暮(夜)
  {elev:16,az:120,exp:.95,sun:2.0,sunC:0xffdcae,hemi:.85,fog:0xf0dcc0,fogD:.0055,lant:.25,night:0,grade:{uSat:.82,uContrast:1.05,uHighTint:[1.05,1.0,.92],uShadowTint:[.97,.99,1.03],uVignette:.3,uPaper:.04,uExposure:1,bloom:[.28,3.4]}},
  {elev:42,az:200,exp:.9,sun:2.2,sunC:0xfff1d8,hemi:.9,fog:0xe8e4d6,fogD:.0045,lant:.2,night:0,grade:{uSat:.8,uContrast:1.04,uHighTint:[1.04,1.0,.93],uShadowTint:[.97,.99,1.03],uVignette:.28,uPaper:.04,uExposure:1,bloom:[.26,3.6]}},
  {elev:-6,az:250,exp:.8,sun:.9,sunC:0xa8b8e8,hemi:.6,fog:0x1e2640,fogD:.009,lant:3.2,night:1,grade:{uSat:.8,uContrast:1.06,uHighTint:[1.08,.98,.86],uShadowTint:[.93,.97,1.08],uVignette:.4,uPaper:.03,uExposure:1.1,bloom:[.55,1.1]}},
];
let curSky=0, envRT=null;
export function applySky(slot,day){
  const RL=regionLook; let k=SKIES[slot]; if(RL&&RL.night) k={...SKIES[2],fog:RL.fog,fogD:RL.fogD,lant:RL.lant,grade:RL.grade,sun:RL.sun[1],sunC:RL.sun[0],hemi:RL.hemi[2]}; else if(RL&&RL.fogMul) k={...k,fogD:k.fogD*RL.fogMul}; curSky=k; const phi=THREE.MathUtils.degToRad(90-k.elev), th=THREE.MathUtils.degToRad(k.az);
  const sunDir=new THREE.Vector3().setFromSphericalCoords(1,phi,th); skyU.sunPosition.value.copy(sunDir);
  sky.visible=!k.night; scene.background=k.night?new THREE.Color(0x0e1426):null;
  sun.position.copy(k.night?new THREE.Vector3(-.5,.8,-.6):sunDir).multiplyScalar(60); sun.color.setHex(k.sunC); sun.intensity=k.sun;
  hemi.intensity=k.hemi; hemi.color.setHex(k.night?0x8090c8:0xfff0d8); hemi.groundColor.setHex(k.night?0x2a2a3a:0x5a6a40); scene.fog.color.setHex(k.fog); scene.fog.density=k.fogD; renderer.toneMappingExposure=k.exp; if(water.userData.reflect){ water.material.uniforms.sunDirection.value.copy(sunDir).normalize(); water.material.uniforms.sunColor.value.setHex(k.night?0x8090c8:k.sunC); water.material.uniforms.waterColor.value.setHex(k.night?0x0e1a26:0x2c4f52); }
  lanterns.forEach(l=>l.material.emissiveIntensity=k.lant); lights.forEach(l=>l.intensity=k.night?14:0); RR.setGrade(k.grade);
  stars.visible=moon.visible=fireflies.visible=!!k.night;
  if(RL&&RL.bg){ scene.background=new THREE.Color(RL.bg); hemi.color.setHex(RL.hemi[0]); hemi.groundColor.setHex(RL.hemi[1]); moon.visible=false; }
  const winter=day>=13; petals.material.color.setHex(RL&&RL.petal?RL.petal:winter?0xffffff:k.night?0xd8d0ff:0xffb7c5); petals.material.size=winter?.5:.42;
  // 环境反射
  if(envRT) envRT.dispose(); if(!k.night){ const s2=new THREE.Scene(); const sk=sky.clone(); sk.position.set(0,0,0); s2.add(sk); envRT=pmrem.fromScene(s2,0,1,1000); scene.environment=envRT.texture; } else { const s2=new THREE.Scene(); s2.background=new THREE.Color(0x1c2546); envRT=pmrem.fromScene(s2,0,1,1000); scene.environment=envRT.texture; }
  scene.environmentIntensity=k.night?.6:.55;
}
// ---------- 每帧 ----------
export function tick(dt,t){
  const p=petals.geometry.attributes.position; for(let i=0;i<p.count;i++){ let y=p.getY(i)-dt*(.8+(i%5)*.25); if(y<0)y=25; p.setY(i,y); p.setX(i,p.getX(i)+Math.sin(t*.7+i)*dt*.8); p.setZ(i,p.getZ(i)+Math.cos(t*.5+i*.3)*dt*.4);} p.needsUpdate=true;
  if(fireflies.visible){ const f=fireflies.geometry.attributes.position; for(let i=0;i<f.count;i++){ f.setY(i,1.5+Math.sin(t*1.3+i)*1.2); f.setX(i,f.getX(i)+Math.sin(t*.6+i*2)*dt*.6);} f.needsUpdate=true; fireflies.material.opacity=.6+Math.sin(t*3)*.3; }
  if(water.userData.reflect) water.material.uniforms.time.value=t*.35; else water.material.normalMap.offset.set(t*.012,t*.007); if(grassMat) grassMat.userData.t.value=t; RR.monitor(dt);
  for(const pl of plantInst){ pl.o.rotation.z=Math.sin(t*.9+pl.ph)*pl.k; pl.o.rotation.x=Math.cos(t*.7+pl.ph)*pl.k*.6; }
  lanterns.forEach((l,i)=>{ l.rotation.z=Math.sin(t*1.5+i)*.06; });
  if(beacon&&beacon.visible){ beacon.userData.d.rotation.y=t*1.6; beacon.userData.d.position.y=4.2+Math.sin(t*2)*.25; }
  for(const g of pickups){ g.children[0].rotation.y=t*1.8; g.children[0].position.y=1.1+Math.sin(t*2.4+g.position.x)*.15; }
}
export function followSun(target){ const d=sun.position.clone().normalize(); sun.position.copy(target).addScaledVector(d,60); sun.target.position.copy(target); sun.target.updateMatrixWorld(); }
export function resize(){ RR.resize(); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
export function render(){ sky.position.copy(camera.position); skyDecor.position.copy(camera.position); RR.render(performance.now()/1000); }

// ---------- 碰撞 ----------
const colliders=[]; // {g, rects:[[x0,x1,z0,z1]]}（局部坐标）
const compoundRects=W=>{ const hw=(W+9)/2; return [[-W/2-1.1,W/2+1.1,-3.9,3.9],[-hw-.5,hw+.5,-8.5,-7.5],[-hw-.5,-hw+.5,-8.5,8.5],[hw-.5,hw+.5,-8.5,8.5],[-hw-.5,-1.05,7.6,8.6],[1.05,hw+.5,7.6,8.6]]; };
export function registerColliders(LOCS){ for(const L of LOCS){ if(!isCompound(L)) continue; colliders.push({g:locGroups[L.id],rects:compoundRects(compoundW(L))}); } }
const regionBounds={}; // id -> {bx,bz, rects:[[x0,x1,z0,z1]] 局部(相对地域原点)}
const _v=new THREE.Vector3();
export function blocked(x,z){
  const i=Math.round(x/1000);
  if(i===0){ if(Math.abs(x)>48.5||Math.abs(z)>48.5) return true;
    const r=Math.hypot(x,z); if(r<10.6 && r>3.5 && !(Math.abs(x)<1.05 && Math.abs(z)<10.2)) return true; }
  else { const id=regionOfX(x), B=regionBounds[id]; if(!B) return true; const lx=x-i*1000; if(Math.abs(lx)>B.bx||Math.abs(z)>B.bz) return true; for(const [a,b,e,f] of B.rects) if(lx>a&&lx<b&&z>e&&z<f) return true; }
  for(const c of colliders){ const gx=c.g.matrixWorld.elements[12]; if(Math.abs(gx-x)>40) continue; _v.set(x,0,z); c.g.worldToLocal(_v); for(const [a,b,e,f] of c.rects) if(_v.x>a&&_v.x<b&&_v.z>e&&_v.z<f) return true; }
  return false;
}
export function groundHeight(x,z){ if(Math.abs(x)>500) return 0; const r=Math.hypot(x,z); if(r<=3.5) return .6; if(Math.abs(x)<1.1&&Math.abs(z)>=3.5&&Math.abs(z)<9.9){ const t=(Math.abs(z)-6.6)/3.2; return Math.max(.6*(Math.abs(z)<4.5?1:0), 1.45*(1-t*t)); } return 0; }

// ---------- 地域切换 / 其余地域按需构建（流式） ----------
let regionLook=null;
export function setRegion(id){ CUR=id; for(const [k,g] of Object.entries(regionRoots)) g.visible=(k===id); const o=regionOrigin(id); petals.position.copy(o); fireflies.position.copy(o); regionLook=REGION_LOOKS[id]||null; }
export function regionBuilt(id){ return !!regionRoots[id]; }
const REGION_LOOKS={ taixu:{fog:0x3a2a58,fogD:.011,bg:0x1c1030,hemi:[0xc8b0ff,0x3a2a50,.9],sun:[0xd8c0ff,1.1],lant:2.6,night:1,petal:0xf0d8ff,grade:{uSat:.86,uContrast:1.05,uHighTint:[1.04,.98,1.08],uShadowTint:[.98,.94,1.1],uVignette:.45,uPaper:.03,uExposure:1.15,bloom:[.7,1.0]}},
  suburb:{fogMul:.8} };
// def: {id, bounds:[bx,bz], ground:'grass'|'paving'|'cloud', walls:bool, locs:[...], portals:[...], decor(K,root), rects:[]}
export async function buildRegion(def,onProgress){
  if(regionRoots[def.id]) return; reseed(0x9e3779b1^def.id.split('').reduce((a,c)=>a*31+c.charCodeAt(0)|0,7));
  ROOT=makeRoot(def.id); CHUNK=def.id; staticGroups.length=0; treeGroups.length=0; const t0=trunks.length;
  const [bx,bz]=def.bounds; regionBounds[def.id]={bx,bz,rects:def.rects||[]};
  // 地面
  const gw=def.ground==='cloud'?300:Math.max(bx,bz)*2+160; const gg=new THREE.PlaneGeometry(gw,gw,60,60); const gp=gg.attributes.position;
  for(let i=0;i<gp.count;i++){ const x=gp.getX(i),y=gp.getY(i); const r=Math.max(Math.abs(x)/bx,Math.abs(y)/bz); let h=0; if(def.ground!=='cloud'&&r>1.12) h=(r-1.12)*(def.hills||18)+Math.sin(x*.08)*Math.cos(y*.09)*4*(r>1.3?1:0); gp.setZ(i,h); } gg.computeVertexNormals();
  let gm; if(def.ground==='cloud'){ gm=new THREE.MeshStandardMaterial({color:0xe8dcff,emissive:0x3a2a60,emissiveIntensity:.5,roughness:.9,transparent:false}); }
  else { const tex=cloneTex(LIB[def.ground==='paving'?'paving':'grass'],def.ground==='paving'?[gw/3.2,gw/3.2]:[gw/7,gw/7]); gm=new THREE.MeshStandardMaterial({map:tex.map,normalMap:tex.normalMap,roughnessMap:tex.orm,roughness:1,normalScale:new THREE.Vector2(.6,.6),color:def.groundTint??0xffffff}); }
  const gr=new THREE.Mesh(gg,gm); gr.rotation.x=-Math.PI/2; gr.receiveShadow=true; ROOT.add(gr); grounds[def.id]=gr;
  // 外墙
  if(def.walls){ for(const [x,z,w,rot] of [[0,-bz-1,2*bx+2,0],[0,bz+1,2*bx+2,0],[-bx-1,0,2*bz+2,Math.PI/2],[bx+1,0,2*bz+2,Math.PI/2]]){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rot; ROOT.add(g); staticGroups.push({g,occ:false}); BOX(w,3.2,.8,P.wall,0,2.2,0,g); BOX(w+.04,.7,.86,P.brick,0,.35,0,g); BOX(w+.6,.3,1.4,roofMat,0,3.95,0,g); BOX(w+.6,.2,.36,P.dark,0,4.2,0,g); } }
  // 院落/小景
  for(const L of def.locs){ const g=new THREE.Group(); g.position.set(L.pos[0],0,L.pos[1]); g.rotation.y=L.rot||0; ROOT.add(g); locGroups[L.id]=g; g.updateMatrixWorld(true); buildLoc(L,g,isCompound(L)||!!SPOT_OCC[L.kind]); }
  registerColliders(def.locs);
  // 门楼（传送口）
  for(const pt of def.portals||[]){ if(pt.noHouse) continue; const g=new THREE.Group(); g.position.set(pt.at[0],0,pt.at[1]); g.rotation.y=Math.atan2(pt.inward[0],pt.inward[1]); ROOT.add(g); staticGroups.push({g,occ:true}); g.updateMatrixWorld(true); const sub=new THREE.Group(); sub.position.z=-1.2; g.add(sub); gateHouse(sub,pt.sign||pt.label,{lions:pt.lions!==false}); colliders.push({g,rects:[[-6,6,-2.4,.3]]}); }
  MISC=new THREE.Group(); ROOT.add(MISC); staticGroups.push({g:MISC,occ:false}); RID=def.id;
  def.decor?.(K,ROOT);
  for(const g of staticGroups) addStatic(g.g,g.occ); for(const g of treeGroups) mergeChildren(g); staticGroups.length=0; treeGroups.length=0;
  for(let i=t0;i<trunks.length;i++){ const t=trunks[i]; t.updateWorldMatrix(true,false); const b=new THREE.Box3().setFromObject(t); b.expandByScalar(-.08); trunkBoxes.push({b,roof:false}); }
  if(def.lights) for(const [x,z] of def.lights){ const pl=new THREE.PointLight(def.id==='taixu'?0xc090ff:0xff9a50,0,18,1.6); pl.position.set(x,3,z); ROOT.add(pl); lights.push(pl); }
  ROOT.visible=false; const r=await bakeLighting(onProgress,def.id); ROOT=scene; return r;
}
// 供地域装饰函数使用的建造工具
let MISC=null, RID=null;
export const K={ rect:r=>regionBounds[RID].rects.push(r), get P(){return P;}, get roofMats(){return roofMats;}, get roofMat(){return roofMat;}, get waterMat(){return waterMat;}, M, mesh:(g,m,x,y,z,p,sh)=>mesh(g,m,x,y,z,p??MISC,sh), BOX:(w,h,d,m,x,y,z,p)=>BOX(w,h,d,m,x,y,z,p??MISC), CYL:(a,b,h,m,x,y,z,p,sg)=>CYL(a,b,h,m,x,y,z,p??MISC,sg), rbox, roof, hall, pavilion, kiosk, pond, flatBridge, reeds, compoundWall, railing, willow, plum, broadTree, pine, bambooGrove, rockery, flowers, lantern, signBoard, stoneLion, gateHouse, corridor:(a,b)=>corridor(a,b), group:(x,z,rot=0)=>{ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rot; ROOT.add(g); staticGroups.push({g,occ:false}); return g; }, R, THREE, bannerTex, thatchMat, mergeVertices };

// ---------- 任务指引光柱 / 可拾取之物 ----------
let beacon=null; const pickups=[];
export function setBeacon(p){ if(!beacon){ beacon=new THREE.Group(); const m=new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false});
    const col=new THREE.Mesh(new THREE.CylinderGeometry(.5,.9,26,16,1,true),m); col.position.y=13; beacon.add(col); const d=new THREE.Mesh(new THREE.OctahedronGeometry(.55),new THREE.MeshStandardMaterial({color:0xc0392b,emissive:0xff4020,emissiveIntensity:.8,roughness:.3})); d.position.y=4.2; d.scale.y=1.4; beacon.add(d); beacon.userData.d=d; scene.add(beacon); }
  beacon.visible=!!p; if(p) beacon.position.set(p.x,0,p.z); }
export function addPickup(p,color=0x7fe0b0){ const g=new THREE.Group(); g.position.copy(p); const m=new THREE.Mesh(new THREE.OctahedronGeometry(.32),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.9,roughness:.25,metalness:.2})); m.position.y=1.1; g.add(m);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.45,.6,24),new THREE.MeshBasicMaterial({color:0xfff0b0,transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide})); halo.rotation.x=-Math.PI/2; halo.position.y=.06; g.add(halo); scene.add(g); pickups.push(g); return g; }
export function removePickup(g){ scene.remove(g); const i=pickups.indexOf(g); if(i>=0) pickups.splice(i,1); }
