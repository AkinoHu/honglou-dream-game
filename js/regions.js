// 各地域的装饰：由 world.buildRegion 调用，K 为建造工具，坐标为地域局部坐标
function vboard(K,text,h=3,{bg='#1d2438',fg='#e8c76a',w=.42}={}){ const T=K.THREE; const c=document.createElement('canvas'); c.width=96; c.height=96*Math.max(4,[...text].length); const x=c.getContext('2d');
  x.fillStyle=bg; x.fillRect(0,0,c.width,c.height); x.strokeStyle='#d4af37'; x.lineWidth=6; x.strokeRect(5,5,c.width-10,c.height-10); x.fillStyle=fg; x.font='bold 64px "Ma Shan Zheng","STKaiti","KaiTi",serif'; x.textAlign='center'; x.textBaseline='middle';
  const ch=[...text]; ch.forEach((t,i)=>x.fillText(t,48,(i+.5)*c.height/ch.length));
  const tex=new T.CanvasTexture(c); tex.colorSpace=T.SRGBColorSpace; const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:tex,roughness:.6})); return m; }
function paifang(K,x,z,{span=9,H=5,sign='',couplet=null,rm=null,mat=null}={}){ const {P,BOX,CYL}=K; const g=K.group(x,z,0); const pm=mat||P.marble;
  for(const s of[-1,1]){ CYL(.32,.36,H,pm,s*span/2,H/2,0,g,12); BOX(1,.6,1,pm,s*span/2,.3,0,g); CYL(.24,.28,H*.75,pm,s*span/4.6,H*.375,0,g,10); }
  BOX(span+1.2,.6,.7,P.beam,0,H-.2,0,g); BOX(span*.55,.5,.6,P.beam,0,H*.75-.3,0,g);
  K.roof(g,span+2.6,2.2,1.1,H+.15,{ridge:.6,upturn:.5,mat:rm||K.roofMat});
  if(sign){ const sb=K.signBoard(sign,1.05); sb.position.set(0,H*.75+.35,.42); g.add(sb); }
  if(couplet){ for(const [i,s] of [[0,-1],[1,1]]){ const b=vboard(K,couplet[i],H*.62); b.position.set(s*(span/2-.02),H*.48,.38); g.add(b); } }
  K.rect([-span/2-.6,-span/2+.6,z-.6,z+.6].map((v,i)=>i<2?v+x:v)); K.rect([span/2-.6,span/2+.6,z-.6,z+.6].map((v,i)=>i<2?v+x:v));
  for(const s of[-1,1]) K.rect([x+s*span/4.6-.35,x+s*span/4.6+.35,z-.35,z+.35]); return g; }
function lanternPost(K,x,z,h=3){ const g=K.group(x,z); K.CYL(.07,.09,h,K.P.wood,0,h/2,0,g,6); K.BOX(.7,.08,.08,K.P.wood,.3,h-.05,0,g); K.lantern(g,.55,h-.55,0); K.rect([x-.2,x+.2,z-.2,z+.2]); }
function stall(K,x,z,rot,goods){ const {P,BOX,CYL,M,THREE}=K; const g=K.group(x,z,rot); BOX(2.6,.9,1.2,P.wood,0,.45,0,g); for(const sx of[-1.2,1.2]) for(const sz of[-.55,.55]) CYL(.04,.04,2.2,P.wood,sx,1.1,sz,g,5);
  const aw=K.mesh(new THREE.PlaneGeometry(3,1.7),M(goods.c||0x9e3a2a,{side:THREE.DoubleSide,roughness:.8}),0,2.25,0,g); aw.rotation.x=-Math.PI/2+.25;
  for(let i=0;i<5;i++){ const t=goods.t||'jar'; if(t==='jar') K.mesh(new THREE.SphereGeometry(.16,10,8),M([0x6a4a2a,0x2a4a6a,0x8a6a3a][i%3],{roughness:.4}),-1+i*.5,1.05,0,g); else if(t==='cloth') BOX(.42,.14,.8,M([0xc8102e,0x3f6fb0,0xd4af37,0x5f8f7a,0x8d6fbf][i],{roughness:.8}),-1+i*.5,.97,0,g); else K.mesh(new THREE.SphereGeometry(.12,8,6),M([0xe86f3a,0xf2c14e,0x9acd32][i%3]),-1+i*.5,.98,0,g); }
  const c=Math.cos(rot), s=Math.sin(rot); const hw=Math.abs(c)*1.4+Math.abs(s)*.7, hd=Math.abs(s)*1.4+Math.abs(c)*.7; K.rect([x-hw,x+hw,z-hd,z+hd]); }
function facade(K,x,z,rot,name){ const g=K.group(x,z,rot); const sub=new K.THREE.Group(); sub.position.z=-1; g.add(sub); K.hall(sub,8,4.2,3,{ridge:.5}); const sb=K.signBoard(name,.75); sb.position.set(0,3.65,1.45); g.add(sb);
  const ax=Math.abs(Math.sin(rot))>.5; K.rect(ax?[x-4.6,x+4.6,z-5.4,z+5.4]:[x-5.4,x+5.4,z-4.6,z+4.6]); }
function chuihua(K,x,z,sign){ const {P,BOX,CYL}=K; const g=K.group(x,z,0); for(const s of[-1,1]){ CYL(.2,.22,3.4,P.pillar,s*2.4,1.7,0,g,12); K.rect([x+s*2.4-.3,x+s*2.4+.3,z-.3,z+.3]); const p=K.mesh(new K.THREE.CylinderGeometry(.14,.06,.6,8),P.pillar,s*2.4,3.05,.9,g); }
  BOX(5.6,.4,.5,P.beam,0,3.3,0,g); BOX(5.2,.25,1.9,P.wood,0,3.55,.2,g); K.roof(g,6.8,3,1.2,3.7,{ridge:.5,upturn:.45}); if(sign){ const sb=K.signBoard(sign,.6); sb.position.set(0,2.95,.3); g.add(sb); } }
function pagoda(K,x,z,tiers=5){ const {P,BOX,CYL}=K; const g=K.group(x,z,0); BOX(5,1,5,P.stone,0,.5,0,g); let y=1, r=1.9;
  for(let i=0;i<tiers;i++){ const h=2.2-i*.15; K.mesh(new K.THREE.CylinderGeometry(r,r,h,8),P.wall,0,y+h/2,0,g); K.roof(g,r*2+1.6,r*2+1.6,.9,y+h,{upturn:.55,rotY:Math.PI/8}); y+=h+.6; r*=.84; }
  K.mesh(new K.THREE.ConeGeometry(.25,1.6,8),P.gold,0,y+.5,0,g); K.rect([x-2.6,x+2.6,z-2.6,z+2.6]); }
function mound(K,x,z,r=1.6){ const m=K.mesh(new K.THREE.SphereGeometry(r,16,10,0,Math.PI*2,0,Math.PI/2),K.M(0x6f8a4a,{roughness:1}),x,0,z); m.scale.y=.6; K.BOX(.6,.9,.15,K.P.stone,x,.45,z+r+.1); K.rect([x-r,x+r,z-r,z+r+.3]); }

export const DECOR = {
  rongfu(K){ const {P,BOX,THREE,M}=K;
    const path=K.mesh(new THREE.PlaneGeometry(4.2,96),P.marble,0,.03,4,undefined,false); path.rotation.x=-Math.PI/2;
    chuihua(K,0,10,'垂花门'); chuihua(K,0,-20,'');
    for(const z of [44,34,24,-2,-12]){ for(const s of[-1,1]) lanternPost(K,s*4.2,z); }
    for(const z of [46,38,30,22]){ K.pine(-9,z,1.1); K.pine(9,z,1.05); }
    for(const s of[-1,1]){ K.CYL(.7,.55,1,M(0x6a4a2a,{roughness:.45,metalness:.45}),s*6.5,.5,-21.5); K.rect([s*6.5-.8,s*6.5+.8,-22.3,-20.7]); K.stoneLion(K.group(0,0),s*3.4,47.5,s); K.rect([s*3.4-.6,s*3.4+.6,46.8,48.2]); }
    K.broadTree(-30,40,1.2,[0x5c9a3a,0x6fae45]); K.broadTree(30,44,1.1); K.plum(-28,32,1.1,0xf06b8a); K.rockery(-30,46,1); K.plum(32,34,1,0xf6a6bd); K.broadTree(-34,-40,1.2); K.broadTree(34,-40,1.1); K.pine(-28,-30,1.2); K.pine(28,-30,1.2);
    K.flowers(-24,36,50,3,[0xe8455a,0xf2c14e,0xffffff]); K.flowers(24,40,50,3,[0xf6a6bd,0xb07ad8]); },
  ningfu(K){ const {P,THREE,M}=K;
    const path=K.mesh(new THREE.PlaneGeometry(4.2,96),P.marble,0,.03,4,undefined,false); path.rotation.x=-Math.PI/2;
    chuihua(K,0,12,'仪门'); paifang(K,0,-20,{span:8,H:5,sign:'星辉辅弼',couplet:['勋业有光昭日月','功名无间及儿孙'],mat:P.marble});
    for(const z of [44,30,-4,-12]){ for(const s of[-1,1]) lanternPost(K,s*4.2,z); }
    for(let z=-28;z<=40;z+=8){ if(Math.abs(z+20)<3) continue; K.pine(-8.5,z,1.15); K.pine(8.5,z,1.1); }
    for(const s of[-1,1]){ K.stoneLion(K.group(0,0),s*3.4,47.5,s); K.rect([s*3.4-.6,s*3.4+.6,46.8,48.2]); }
    K.plum(-30,24,1.2,0xc8102e); K.plum(-32,34,1.1,0xf06b8a); K.broadTree(-30,44,1.2); K.rockery(-34,14,1.1); K.broadTree(33,-38,1.1); K.pine(-30,-38,1.3); K.flowers(-26,30,40,3,[0xe8455a,0xffffff]); },
  street(K){ const {P,THREE,M}=K;
    const path=K.mesh(new THREE.PlaneGeometry(9,110),M(0xb8ac94,{roughness:.95}),0,.02,0,undefined,false); path.rotation.x=-Math.PI/2;
    paifang(K,0,-44,{span:10,H:5.4,sign:'宁荣街',couplet:['宁国荣国','钟鸣鼎食']});
    for(const [x,z,r,t,c] of [[-7.4,-34,Math.PI/2,'jar',0x9e3a2a],[7.4,-36,-Math.PI/2,'fruit',0x3f6f8a],[-7.4,-12,Math.PI/2,'cloth',0x5a4a8a],[7.4,-10,-Math.PI/2,'jar',0x8a5a2a],[-7.4,18,Math.PI/2,'fruit',0x2f6a4a],[7.4,20,-Math.PI/2,'cloth',0x9e3a2a],[-7.4,34,Math.PI/2,'jar',0x6a4a8a],[7.4,40,-Math.PI/2,'fruit',0x9e5a2a]]) stall(K,x,z,r,{t,c});
    for(const [x,z,rot,n] of [[-21,-42,Math.PI/2,'绸缎庄'],[21,-42,-Math.PI/2,'钱庄'],[-21,-8,Math.PI/2,'书坊'],[21,-8,-Math.PI/2,'香料铺'],[-21,20,Math.PI/2,'酒肆'],[21,20,-Math.PI/2,'成衣铺'],[-21,36,Math.PI/2,'米行'],[21,36,-Math.PI/2,'客栈']]) facade(K,x,z,rot,n);
    for(const z of [-30,0,30]){ const rope=K.mesh(new THREE.CylinderGeometry(.02,.02,24,4),P.dark,0,5,z,undefined,false); rope.rotation.z=Math.PI/2; const g=K.group(0,z); for(let i=-5;i<=5;i++) K.lantern(g,i*2,4.5,0); for(const s of[-12,12]){ K.CYL(.1,.12,5.2,P.wood,s,2.6,z); K.rect([s-.25,s+.25,z-.25,z+.25]); } }
    K.willow(-9,48,1); K.willow(9,47,1.05); K.broadTree(-26,48,1.1); K.broadTree(26,50,1); K.willow(-26,-50,1); K.willow(26,-50,1);
    const cart=K.group(9,46,.3); K.BOX(2.2,.5,1.3,P.wood,0,.9,0,cart); for(const s of[-1,1]){ const w=K.mesh(new THREE.TorusGeometry(.55,.08,6,16),P.wood,0,.6,s*.75,cart); } K.rect([7.6,10.4,44.8,47.2]); },
  suburb(K){ const {P,THREE,M}=K;
    const road=K.mesh(new THREE.PlaneGeometry(5,70),M(0xb8a888,{roughness:1}),0,.02,20,undefined,false); road.rotation.x=-Math.PI/2;
    const road2=K.mesh(new THREE.PlaneGeometry(4,40),M(0xb8a888,{roughness:1}),-10,.02,-12,undefined,false); road2.rotation.x=-Math.PI/2; road2.rotation.z=.5;
    const river=K.mesh(new THREE.PlaneGeometry(8,140),K.waterMat,36,.08,0,undefined,false); river.rotation.x=-Math.PI/2; river.userData.dyn=true; K.rect([32,40,-70,70]);
    for(let z=-50;z<=50;z+=10){ K.rockery(31.5,z+K.R(-2,2),.6); if(z%20===0) K.willow(29,z+3,K.R(.9,1.1)); }
    pagoda(K,-36,-40,5); for(const [x,z] of [[-34,-12],[-29,-8],[-37,-6],[-31,-16]]) mound(K,x,z,K.R(1.2,1.7));
    for(const [x,z,c] of [[-30,32,0x8aa84a],[-18,40,0xc8b050],[16,32,0x7a9a40],[22,44,0xb8a848]]){ const f=K.mesh(new THREE.PlaneGeometry(10,7),M(c,{roughness:1}),x,.03,z,undefined,false); f.rotation.x=-Math.PI/2; for(let i=-3;i<=3;i++){ const r=K.BOX(10,.12,.18,M(0x6a5a3a),x,.06,z+i); } }
    for(const [x,z] of [[-28,-48],[-6,-46],[-40,-28],[4,-30]]) K.pine(x,z,K.R(1.1,1.4)); for(const [x,z] of [[10,10],[-24,6],[-30,48],[10,50],[-6,40]]) K.broadTree(x,z,K.R(.9,1.2));
    K.flowers(-20,26,40,4,[0xf2c14e,0xffffff,0xb07ad8]); K.flowers(8,24,30,3,[0xe86f8a,0xf2c14e]); },
  taixu(K){ const {P,THREE,M}=K; const pm=M(0xf2eaff,{roughness:.35,metalness:.05,emissive:0x2a1a40,emissiveIntensity:.3});
    const path=K.mesh(new THREE.PlaneGeometry(5,90),M(0xd8c8f8,{roughness:.4,emissive:0x5a40a0,emissiveIntensity:.35}),0,.03,6,undefined,false); path.rotation.x=-Math.PI/2;
    paifang(K,0,26,{span:9,H:5.8,sign:'太虚幻境',couplet:['假作真时真亦假','无为有处有还无'],mat:pm,rm:K.roofMats.purple||K.roofMats.glaze});
    paifang(K,0,4,{span:8,H:5.2,sign:'孽海情天',couplet:['厚地高天堪叹古今情不尽','痴男怨女可怜风月债难偿'],mat:pm,rm:K.roofMats.purple||K.roofMats.glaze});
    const puff=M(0xf6f0ff,{roughness:.9,emissive:0x8a70c0,emissiveIntensity:.35});
    for(let i=0;i<46;i++){ const a=K.R(0,6.28), r=K.R(14,40); const x=Math.cos(a)*r*.8, z=Math.sin(a)*r; if(Math.abs(x)<7) continue; const s=K.R(1.2,3.2); const m=K.mesh(new THREE.SphereGeometry(1,14,10),puff,x,K.R(-.4,.6),z); m.scale.set(s*1.6,s*.55,s); }
    for(let i=0;i<10;i++){ const a=i/10*6.28, r=K.R(48,64); const g=K.rockery(Math.cos(a)*r,Math.sin(a)*r,K.R(1.4,2.4)); g.position.y=K.R(6,16); }
    for(const z of [36,16,-6,-16]){ for(const s of[-1,1]) lanternPost(K,s*3.6,z,3.4); }
    for(const [x,z] of [[-12,14],[12,12],[-14,-14],[14,-16],[-9,36],[9,38]]) K.plum(x,z,K.R(1,1.3),[0xe8b8ff,0xf6d0f0,0xffffff][Math.floor(K.R(0,3))]);
    K.flowers(-10,-8,40,3,[0xe8b8ff,0xffffff,0xf6a6bd]); K.flowers(10,-8,40,3,[0xe8b8ff,0xffffff,0xb07ad8]); },
};
