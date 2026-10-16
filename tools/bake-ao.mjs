import { chromium } from 'playwright'; import fs from 'fs';
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:320,height:200}}); p.on('console',m=>console.log(m.text().slice(0,200)));
await p.addInitScript(()=>{ localStorage.setItem('honglou_quality','low'); });
await p.goto(process.argv[2]); await p.waitForSelector('#title:not(.hidden)',{timeout:200000});
const t=Date.now(); const r=await p.evaluate(()=>__game.W.exportAO()); console.log('bake ms',Date.now()-t,r.count,r.meshes,r.hash);
const dir=process.argv[3]; fs.writeFileSync(dir+'/ao.bin',Buffer.from(r.b64,'base64')); fs.writeFileSync(dir+'/ao.json',JSON.stringify({hash:r.hash,count:r.count,meshes:r.meshes,rays:40,dist:3.2,note:'vertex AO baked offline by tools/bake-ao.mjs (raycast vs proxy boxes + ground)'}));
await b.close();
