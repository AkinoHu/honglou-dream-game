// 程序化 PBR 贴图库：在 CPU 上生成可平铺的 albedo / normal / ORM（R=凹处AO, G=粗糙度, B=金属度）。
// 思路参考 INKWAVE texlib（MIT © 2026 Jayden Davis, https://github.com/amiaoapp/inkwave）：
// 以"高度场"为核心，albedo 与 ORM 由同一高度场派生，法线由高度梯度求得，全部周期化以保证无缝平铺。
import * as THREE from 'three';

let maxAniso = 8;
export function setAnisotropy(n){ maxAniso = n; }
// ---------- 周期噪声 ----------
function hash2(x,y,s){ let h=(x*374761393+y*668265263+s*982451653)|0; h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296; }
function vnoise(x,y,P,s){ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi; const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const m=(a)=>((a%P)+P)%P; const a=hash2(m(xi),m(yi),s), b=hash2(m(xi+1),m(yi),s), c=hash2(m(xi),m(yi+1),s), d=hash2(m(xi+1),m(yi+1),s);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
export function fbm(u,v,P=4,oct=4,s=1){ let f=0,amp=.5,fr=1; for(let i=0;i<oct;i++){ f+=amp*vnoise(u*P*fr,v*P*fr,P*fr,s+i*17); amp*=.5; fr*=2; } return f/(1-Math.pow(.5,oct)); }
function worley(u,v,P,s){ const x=u*P,y=v*P, xi=Math.floor(x), yi=Math.floor(y); let d1=9,d2=9,id=0;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){ const cx=xi+i, cy=yi+j, mx=((cx%P)+P)%P, my=((cy%P)+P)%P; const px=cx+hash2(mx,my,s), py=cy+hash2(mx,my,s+7); const d=Math.hypot(px-x,py-y); if(d<d1){ d2=d1; d1=d; id=hash2(mx,my,s+3);} else if(d<d2) d2=d; }
  return {d1,d2,id}; }
const sat=x=>x<0?0:x>1?1:x, smooth=(a,b,x)=>{ const t=sat((x-a)/(b-a)); return t*t*(3-2*t); };

// ---------- 生成器 ----------
// gen(u,v) → [h, r,g,b (0..1 sRGB), rough, cavity]
function build(N,gen,{normalStrength=2,repeat=[1,1],metal=0}={}){
  const H=new Float32Array(N*N), A=new Uint8ClampedArray(N*N*4), O=new Uint8ClampedArray(N*N*4);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){ const i=y*N+x; const o=gen((x+.5)/N,(y+.5)/N); H[i]=o[0];
    A[i*4]=o[1]*255; A[i*4+1]=o[2]*255; A[i*4+2]=o[3]*255; A[i*4+3]=255; O[i*4]=(o[5]??1)*255; O[i*4+1]=o[4]*255; O[i*4+2]=metal*255; O[i*4+3]=255; }
  const Nn=new Uint8ClampedArray(N*N*4);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){ const h=(xx,yy)=>H[((yy+N)%N)*N+((xx+N)%N)];
    const dx=(h(x+1,y)-h(x-1,y))*normalStrength*N/64, dy=(h(x,y+1)-h(x,y-1))*normalStrength*N/64; const l=Math.hypot(dx,dy,1); const i=(y*N+x)*4;
    Nn[i]=(-dx/l*.5+.5)*255; Nn[i+1]=(dy/l*.5+.5)*255; Nn[i+2]=(1/l*.5+.5)*255; Nn[i+3]=255; }
  const tex=(data,srgb)=>{ const c=document.createElement('canvas'); c.width=c.height=N; c.getContext('2d').putImageData(new ImageData(data,N,N),0,0);
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy=maxAniso; t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace; t.generateMipmaps=true; t.minFilter=THREE.LinearMipmapLinearFilter; return t; };
  return { map:tex(A,true), normalMap:tex(Nn,false), orm:tex(O,false) };
}
// 便捷：生成 MeshStandardMaterial
export function pbr(lib,name,extra={}){ const t=lib[name]; const m=new THREE.MeshStandardMaterial({ map:t.map, normalMap:t.normalMap, roughnessMap:t.orm, aoMap:t.orm, aoMapIntensity:.8, roughness:1, metalness:0, ...extra }); m.userData.lib=name; return m; }
export function cloneTex(set,repeat){ const o={}; for(const k in set){ o[k]=set[k].clone(); o[k].repeat.set(...repeat); o[k].needsUpdate=true; } return o; }

const mix=(a,b,t)=>a+(b-a)*t;
const col=(hex)=>[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255];
const lerp3=(a,b,t)=>[mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];

export function createTextureLibrary(N=256){
  const L={};
  // 琉璃/青瓦：沿 u 方向的筒瓦与板瓦交替，v 方向分层搭接
  const tileGen=(c1,c2,gl)=>(u,v)=>{ const cols=6, rows=6; const fu=(u*cols)%1, fv=(v*rows)%1; const row=Math.floor(v*rows);
    const tube=Math.pow(Math.max(0,Math.sin(fu*Math.PI)),.6); const lap=smooth(.0,.85,fv); const h=tube*.6+lap*.35 - (fv<.06?.25:0);
    const n=fbm(u,v,8,3,5+row); const c=lerp3(col(c1),col(c2),tube*.5+n*.4); const spec=gl? (.18+(1-tube)*.15+n*.1) : (.55+n*.25);
    const cav=fv<.08||tube<.05?.55:1; return [h,c[0]*(.8+lap*.25),c[1]*(.8+lap*.25),c[2]*(.8+lap*.25),spec,cav]; };
  L.tile=build(N,tileGen(0x2a3036,0x5e6a74,false),{normalStrength:5});
  L.glaze=build(N,tileGen(0x1f5a48,0x4f9a7a,true),{normalStrength:5});
  L.glazeY=build(N,tileGen(0x9a6a10,0xe8b830,true),{normalStrength:5});
  // 朱漆木：竖向木纹 + 漆面细微起伏
  L.lacquer=build(N,(u,v)=>{ const g=fbm(u*1,v*.12,8,4,11); const grain=Math.sin((u*40+g*6)*Math.PI)*.5+.5; const n=fbm(u,v,16,2,3);
    const c=lerp3(col(0x7a1410),col(0xa82a1e),g*.6+grain*.15+n*.2); return [grain*.15+n*.1, c[0],c[1],c[2], .28+n*.15, 1]; },{normalStrength:1});
  L.wood=build(N,(u,v)=>{ const plank=Math.floor(u*4); const g=fbm(u*1,v*.15,8,4,21+plank); const grain=Math.sin((u*30+g*8)*Math.PI)*.5+.5; const seam=(u*4)%1<.03?1:0;
    const c=lerp3(col(0x3e2414),col(0x6e4426),g*.7+grain*.2); return [grain*.2-seam*.6, c[0]*(1-seam*.5),c[1]*(1-seam*.5),c[2]*(1-seam*.5), .6+g*.2, seam?.5:1]; },{normalStrength:1.5});
  // 方砖铺地：错缝方砖 + 灰缝 + 每块色差
  L.paving=build(N,(u,v)=>{ const rows=4; const r=Math.floor(v*rows); const off=r%2?.5/rows*rows/4:0; const uu=(u*4+off*0+ (r%2?.5:0)); const cx=Math.floor(uu), fu=uu%1, fv=(v*rows)%1;
    const e=Math.min(fu,1-fu,fv,1-fv); const grout=1-smooth(.02,.06,e); const id=hash2((cx%4+4)%4,r,9); const n=fbm(u,v,8,4,31);
    const c=lerp3(col(0x8f8a80),col(0xc2baa8),id*.6+n*.35); const g=lerp3(c,col(0x5a554c),grout); const h=(1-grout)*.5+n*.15-(1-smooth(0,.12,e))*.1;
    return [h,g[0],g[1],g[2], .8+n*.15-(1-grout)*.1, grout>.5?.6:1]; },{normalStrength:3});
  // 青砖：长条砖错缝
  L.brick=build(N,(u,v)=>{ const rows=8; const r=Math.floor(v*rows); const uu=u*4+(r%2?.5:0); const fu=uu%1, fv=(v*rows)%1; const e=Math.min(fu*.5,(1-fu)*.5,fv,1-fv);
    const mortar=1-smooth(.04,.09,e); const id=hash2(Math.floor(uu)%4,r,4); const n=fbm(u,v,8,4,41); const c=lerp3(col(0x5c6066),col(0x8a8e92),id*.5+n*.4);
    const g=lerp3(c,col(0xb8b4aa),mortar); return [(1-mortar)*.5+n*.2,g[0],g[1],g[2],.85+n*.1,mortar>.5?.65:1]; },{normalStrength:3});
  // 白粉墙：微起伏、雨渍
  L.plaster=build(N,(u,v)=>{ const n=fbm(u,v,4,5,51), m=fbm(u*1,v*1,8,3,52); const stain=smooth(.55,.8,fbm(u,v*.5,4,4,53)); const c=lerp3(col(0xf2ece0),col(0xcfc6b2),stain*.6+m*.15);
    return [n*.3+m*.1,c[0],c[1],c[2],.92,1-stain*.15]; },{normalStrength:1.2});
  // 汉白玉 / 水磨石：细纹理、较光滑
  L.marble=build(N,(u,v)=>{ const n=fbm(u,v,4,5,61); const vein=Math.pow(1-Math.abs(Math.sin((u+v*.6+n*1.2)*Math.PI*3)),18); const c=lerp3(col(0xeeeae0),col(0xb8b4ac),vein*.6+n*.15);
    return [n*.1-vein*.05,c[0],c[1],c[2],.22+n*.1,1]; },{normalStrength:.8});
  // 太湖石：孔洞与褶皱
  L.rock=build(N,(u,v)=>{ const w=worley(u,v,6,71); const n=fbm(u,v,4,5,72); const pit=1-smooth(0,.25,w.d1); const c=lerp3(col(0x8c9196),col(0xc4c6c4),n*.7-pit*.4);
    return [n*.6-pit*.6+(w.d2-w.d1)*.3,c[0],c[1],c[2],.9,1-pit*.5]; },{normalStrength:4});
  // 竹：竹节与纵纹
  L.bamboo=build(N,(u,v)=>{ const node=Math.exp(-Math.pow(((v*3)%1-.5)*24,2)); const n=fbm(u*2,v*.2,8,3,81); const c=lerp3(col(0x5d8a3a),col(0x9cbf5a),n*.6+node*.3);
    return [node*.6+Math.sin(u*Math.PI*24)*.03,c[0],c[1],c[2],.4,1-node*.2]; },{normalStrength:2});
  // 地面草：多层色斑
  L.grass=build(N,(u,v)=>{ const n=fbm(u,v,8,5,91), m=fbm(u,v,2,3,92); const blade=fbm(u,v,64,2,93); const c=lerp3(lerp3(col(0x3f5a2c),col(0x6a8044),n),col(0x857c50),smooth(.6,.85,m)*.5);
    return [blade*.4+n*.2,c[0]*(.85+blade*.3),c[1]*(.85+blade*.3),c[2]*(.85+blade*.3),.95,1]; },{normalStrength:1.5});
  // 绸缎刺绣纹（人物衣料）：云纹 + 织纹
  L.silk=build(N,(u,v)=>{ const weave=(Math.sin(u*Math.PI*128)*Math.sin(v*Math.PI*128))*.5+.5; const cu=(u*4)%1-.5, cv=(v*4)%1-.5; const r=Math.hypot(cu,cv); const cloud=smooth(.22,.2,Math.abs(r-.22+Math.sin(Math.atan2(cv,cu)*3)*.04));
    const g=.82+weave*.08+cloud*.25; return [weave*.15+cloud*.3,g,g,g,.55-cloud*.2,1]; },{normalStrength:1.5});
  return L;
}
