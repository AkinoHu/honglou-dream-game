// 静态建筑：按材质合并几何（减少 draw call）+ 顶点 AO（射线遮蔽，可离线烘焙进 assets/ao.bin）
// AO 色调曲线与半球采样方式参照 INKWAVE build/bake-ao.cjs（MIT © 2026 Jayden Davis）：
//   ao = max(floor, 1 − strength · occ^gamma)，occ = 按距离加权的命中率，余弦加权 Hammersley 半球方向。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const OPTS={ rays:40, dist:3.2, floor:.5, strength:1.0, gamma:1.0 };
const vcMats=new Map();
function vcMat(m){ let v=vcMats.get(m); if(!v){ v=m.clone(); v.vertexColors=true; vcMats.set(m,v); } return v; }
function norm(geo){ let g=geo; for(const k of Object.keys(g.attributes)) if(!['position','normal','uv','color'].includes(k)) g.deleteAttribute(k);
  if(!g.attributes.uv) g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(!g.index){ const n=g.attributes.position.count; const idx=new (n>65535?Uint32Array:Uint16Array)(n); for(let i=0;i<n;i++) idx[i]=i; g.setIndex(new THREE.BufferAttribute(idx,1)); }
  g.morphAttributes={}; g.clearGroups(); return g; }

// 合并 group 内静态网格；返回合并后的网格列表（按创建顺序，确定性）
export function mergeStatic(group,{skip=()=>false}={}){
  group.updateMatrixWorld(true); const inv=group.matrixWorld.clone().invert(); const buckets=new Map(); const kill=[]; const boxes=[];
  group.traverse(o=>{ if(!o.isMesh||o.isInstancedMesh||o.isPoints||skip(o)||!o.visible) return; if(o.material.transparent&&!o.userData.roof) return;
    const m=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld); const g=norm(o.geometry.clone().applyMatrix4(m));
    if(o.userData.occ!==false){ g.computeBoundingBox(); const b=g.boundingBox; const sz=b.getSize(new THREE.Vector3()); if(Math.min(sz.x,sz.y,sz.z)>.03) boxes.push({b:b.clone(),roof:!!o.userData.roof}); }
    const key=o.material.uuid+'|'+(o.geometry.attributes.color?'c':'')+'|'+(o.userData.roof?1:0)+'|'+(o.castShadow?1:0); if(!buckets.has(key)) buckets.set(key,{mat:o.material,roof:!!o.userData.roof,cast:o.castShadow,geos:[]}); buckets.get(key).geos.push(g); kill.push(o); });
  for(const o of kill) o.parent.remove(o);
  const out=[];
  for(const {mat,roof,cast,geos} of buckets.values()){ const g=mergeGeometries(geos,false); if(!g) continue; const mm=new THREE.Mesh(g,mat); mm.castShadow=cast; mm.receiveShadow=true; mm.userData.roof=roof; mm.userData.boxes=boxes; group.add(mm); out.push(mm); }
  return out;
}
// 余弦加权半球（Hammersley）
const DIRS=[]; for(let k=0;k<OPTS.rays;k++){ let b=k,rv=0,f=.5; while(b){ if(b&1) rv+=f; b>>=1; f*=.5; } const u1=(k+.5)/OPTS.rays, r=Math.sqrt(u1), ph=2*Math.PI*rv; DIRS.push([r*Math.cos(ph),r*Math.sin(ph),Math.sqrt(1-u1)]); }
function rayBox(o,d,b,maxT){ let t0=0,t1=maxT; for(let a=0;a<3;a++){ const k='xyz'[a]; const inv=1/d[k]; let tn=(b.min[k]-o[k])*inv, tf=(b.max[k]-o[k])*inv; if(tn>tf){ const t=tn; tn=tf; tf=t; } t0=Math.max(t0,tn); t1=Math.min(t1,tf); if(t0>t1) return -1; } return t0; }
// 计算一个合并网格的逐顶点 AO（局部空间，地面 y=0 也算遮挡体）
export function computeAO(mesh){
  const g=mesh.geometry, P=g.attributes.position, N=g.attributes.normal, n=P.count, out=new Uint8Array(n); const boxes=mesh.userData.boxes.map(x=>x.b);
  const p=new THREE.Vector3(), nn=new THREE.Vector3(), t=new THREE.Vector3(), bt=new THREE.Vector3(), d=new THREE.Vector3(), near=[], tmp=new THREE.Box3();
  for(let i=0;i<n;i++){ nn.fromBufferAttribute(N,i).normalize(); p.fromBufferAttribute(P,i).addScaledVector(nn,.04);
    near.length=0; for(const b of boxes){ if(b.containsPoint(p)) continue; if(b.distanceToPoint(p)<OPTS.dist) near.push(b); }
    t.set(Math.abs(nn.y)<.9?0:1,Math.abs(nn.y)<.9?1:0,0).cross(nn).normalize(); bt.crossVectors(nn,t);
    const rot=((i*2654435761)>>>0)/4294967296*6.283, cr=Math.cos(rot), sr=Math.sin(rot); let occ=0;
    for(const [a0,b0,c] of DIRS){ const a=a0*cr-b0*sr, b=a0*sr+b0*cr; d.set(0,0,0).addScaledVector(t,a).addScaledVector(bt,b).addScaledVector(nn,c);
      let best=OPTS.dist; if(d.y<-1e-4){ const tg=-p.y/d.y; if(tg>0&&tg<best) best=tg; }
      for(const b of near){ const h=rayBox(p,d,b,best); if(h>=0&&h<best) best=h; }
      if(best<OPTS.dist) occ+=1-best/OPTS.dist; }
    out[i]=Math.round(Math.max(OPTS.floor,1-OPTS.strength*Math.pow(occ/OPTS.rays,OPTS.gamma))*255); }
  return out;
}
export function applyAO(mesh,ao){ const n=ao.length, c=new Float32Array(n*3); for(let i=0;i<n;i++){ const v=ao[i]/255; c[i*3]=c[i*3+1]=c[i*3+2]=v; } mesh.geometry.setAttribute('color',new THREE.BufferAttribute(c,3)); mesh.material=vcMat(mesh.material); }
// 读取离线烘焙结果；布局 hash 不匹配时返回 null（运行时再算）
export async function loadBaked(){ try{ const [meta,bin]=await Promise.all([fetch('assets/ao.json').then(r=>r.ok?r.json():null),fetch('assets/ao.bin').then(r=>r.ok?r.arrayBuffer():null)]); if(!meta||!bin) return null; return {meta,data:new Uint8Array(bin)}; }catch(e){ return null; } }
export function layoutHash(meshes){ let h=2166136261; for(const m of meshes){ h=Math.imul(h^m.geometry.attributes.position.count,16777619); const p=m.geometry.attributes.position.array; for(let i=0;i<p.length;i+=97) h=Math.imul(h^Math.round(p[i]*100),16777619); } return (h>>>0).toString(16); }

// 只合并直接子网格（用于人物骨骼分组、植物），不计算遮挡代理
export function mergeChildren(group){ const buckets=new Map(), kill=[]; for(const o of group.children){ if(!o.isMesh||o.isInstancedMesh) continue; o.updateMatrix(); const g=norm(o.geometry.clone().applyMatrix4(o.matrix));
    const key=o.material.uuid+'|'+(g.attributes.color?'c':'')+'|'+o.castShadow; if(!buckets.has(key)) buckets.set(key,{mat:o.material,cast:o.castShadow,geos:[]}); buckets.get(key).geos.push(g); kill.push(o); }
  if(kill.length<2) return; for(const o of kill) group.remove(o);
  for(const {mat,cast,geos} of buckets.values()){ const g=mergeGeometries(geos,false); const m=new THREE.Mesh(g,mat); m.castShadow=cast; m.receiveShadow=true; group.add(m); } }
