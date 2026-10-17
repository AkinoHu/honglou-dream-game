// 离线烘焙顶点 AO：node tools/bake-ao.mjs http://localhost:8765/ assets
// 依次导出 大观园 与各地域（按需构建）的 AO 分块：assets/ao_<key>.bin/json
import { chromium } from 'playwright'; import fs from 'fs';
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:320,height:200}}); p.on('console',m=>console.log(m.text().slice(0,200)));
await p.addInitScript(()=>{ localStorage.setItem('honglou_quality','low'); });
await p.goto(process.argv[2]); await p.waitForSelector('#title:not(.hidden)',{timeout:600000});
const dir=process.argv[3]; const only=process.argv[4]?.split(',');
for(const key of ['garden','rongfu','ningfu','street','suburb','taixu']){ if(only&&!only.includes(key)) continue;
  const t=Date.now(); const r=await p.evaluate(async key=>{ const G=window.__game; if(key!=='garden'&&!G.W.regionBuilt(key)) await G.W.buildRegion(G.REGION_DEFS[key]); return G.W.exportAO(key); },key);
  console.log(key,'bake ms',Date.now()-t,r.count,r.meshes,r.hash);
  fs.writeFileSync(`${dir}/ao_${key}.bin`,Buffer.from(r.b64,'base64')); fs.writeFileSync(`${dir}/ao_${key}.json`,JSON.stringify({hash:r.hash,count:r.count,meshes:r.meshes,rays:40,dist:3.2,note:'vertex AO baked offline by tools/bake-ao.mjs'})); }
await b.close();
