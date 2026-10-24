// 渲染器与后处理链：MSAA HDR → GTAO → 克制的 Bloom → 红楼调色(Grade) → OutputPass → SMAA
// 结构、GradeShader 与阴影滤波补丁改编自 INKWAVE src/core/renderer.js
// （MIT License, Copyright (c) 2026 Jayden Davis, https://github.com/amiaoapp/inkwave —— 见 vendor/LICENSE-inkwave.txt）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// 红楼调色：暖、低饱和、宣纸般的高光偏暖与阴影偏青，带纸纹与暗角
export const GradeShader = {
  uniforms: { tDiffuse:{value:null}, uSat:{value:.86}, uVib:{value:.06}, uContrast:{value:1.04}, uShadowTint:{value:new THREE.Vector3(.965,.99,1.03)}, uHighTint:{value:new THREE.Vector3(1.045,1.0,.93)},
    uLift:{value:.012}, uExposure:{value:1}, uVignette:{value:.3}, uPaper:{value:.035}, uAspect:{value:1.7}, uTime:{value:0}, uInk:{value:.0}, uBlur:{value:0}, uTexel:{value:new THREE.Vector2(1/1280,1/720)} },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:/* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat,uVib,uContrast,uLift,uExposure,uVignette,uPaper,uAspect,uTime,uInk,uBlur; uniform vec2 uTexel; uniform vec3 uShadowTint,uHighTint; varying vec2 vUv;
    float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y); }
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      // 对话景深：以画面中心为焦点，边缘做 8 点环形模糊（便宜的伪景深）
      if(uBlur>.002){ float rr=smoothstep(.2,.75,length((vUv-.5)*vec2(uAspect,1.)))*uBlur; if(rr>.01){ vec3 a=c.rgb; float R=rr*5.; for(int i=0;i<8;i++){ float an=float(i)*.7854+.3; a+=texture2D(tDiffuse,vUv+vec2(cos(an),sin(an))*uTexel*R*(.5+.5*float(i&1))).rgb; } c.rgb=mix(c.rgb,a/9.,clamp(rr*1.2,0.,1.)); } }
      // 淡墨勾边：亮度十字差分，只压暗（水墨工笔的“线”）
      if(uInk>.002){ float l0=dot(c.rgb,vec3(.2126,.7152,.0722)); float lr=dot(texture2D(tDiffuse,vUv+vec2(uTexel.x,0.)).rgb,vec3(.2126,.7152,.0722)), ll=dot(texture2D(tDiffuse,vUv-vec2(uTexel.x,0.)).rgb,vec3(.2126,.7152,.0722)), lu=dot(texture2D(tDiffuse,vUv+vec2(0.,uTexel.y)).rgb,vec3(.2126,.7152,.0722)), ld=dot(texture2D(tDiffuse,vUv-vec2(0.,uTexel.y)).rgb,vec3(.2126,.7152,.0722));
        float e=(abs(lr-ll)+abs(lu-ld))/(l0+.25); e=smoothstep(.16,.7,e); c.rgb=mix(c.rgb,c.rgb*vec3(.55,.5,.46),uInk*e); }
      c.rgb*=uExposure;
      float l=dot(c.rgb,vec3(.2126,.7152,.0722)); float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)); float chroma=(mx-mn)/max(mx,1e-4);
      c.rgb=max(mix(vec3(l),c.rgb,uSat+uVib*(1.-smoothstep(.1,.7,chroma))),0.);
      c.rgb=.18*pow(max(c.rgb,vec3(1e-6))/.18,vec3(uContrast))+uLift;
      float lt=smoothstep(.015,.6,l); c.rgb*=mix(uShadowTint,uHighTint,lt);
      // 宣纸纤维纹：低频斑 + 高频纤维，乘在亮部
      vec2 pu=vUv*vec2(uAspect,1.)*3.; float paper=vn(pu*3.)*.6+vn(pu*40.+7.)*.4; c.rgb*=1.-uPaper*(paper-.5)*2.*lt;
      vec2 q=(vUv-.5)*vec2(uAspect,1.); float r=length(q); c.rgb*=1.-uVignette*smoothstep(.45,1.25,r);
      gl_FragColor=c; }`,
};

// 阴影：用无噪点的 3×3 双线性比较网格替换 r18x 默认的 Vogel 盘采样（避免颗粒感）
(function patchShadowFilter(){ const chunk=THREE.ShaderChunk.shadowmap_pars_fragment;
  const re=/shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if(!re.test(chunk)){ console.info('[honglou] shadow chunk layout changed; keeping stock PCF'); return; }
  THREE.ShaderChunk.shadowmap_pars_fragment=chunk.replace(re,`vec2 ts = texelSize * max( shadowRadius * 0.55, 0.6 );
    float s9 = 0.0; for ( int sx = -1; sx <= 1; sx ++ ) for ( int sy = -1; sy <= 1; sy ++ ) s9 += texture( shadowMap, vec3( shadowCoord.xy + vec2( float( sx ), float( sy ) ) * ts, shadowCoord.z ) );
    shadow = s9 * ( 1.0 / 9.0 );`); })();

// 画质档位
export const TIERS={
  high:{ name:'高', pixelRatio:1.75, msaa:4, ao:true, bloom:true, shadow:2048, water:true, grass:3200, petals:700 },
  medium:{ name:'中', pixelRatio:1.35, msaa:0, ao:false, bloom:true, shadow:2048, water:false, grass:2200, petals:500 },
  low:{ name:'低', pixelRatio:1, msaa:0, ao:false, bloom:false, shadow:1024, water:false, grass:900, petals:300 },
};
export const isTouch=matchMedia('(pointer:coarse)').matches;
function isAppleGPU(gl){ const ext=gl.getExtension('WEBGL_debug_renderer_info'); const n=String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)); return /Apple/i.test(n)&&!/Intel|AMD|Radeon|NVIDIA/i.test(n); }
export function initialTier(){ const s=localStorage.getItem('honglou_quality')||'auto'; if(s!=='auto'&&TIERS[s]) return s; if(isTouch||navigator.hardwareConcurrency<=4) return 'low'; return 'high'; }

export class Renderer{
  constructor(canvas,scene,camera){
    const r=this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',stencil:false});
    r.outputColorSpace=THREE.SRGBColorSpace; r.toneMapping=THREE.NeutralToneMapping; r.toneMappingExposure=1; r.shadowMap.enabled=true; r.shadowMap.type=THREE.PCFShadowMap;
    this.scene=scene; this.camera=camera; this.apple=isAppleGPU(r.getContext()); this.tierName=initialTier(); this.q=TIERS[this.tierName]; this.auto=(localStorage.getItem('honglou_quality')||'auto')==='auto';
    this.build();
  }
  setTier(name){ if(!TIERS[name]||name===this.tierName) return; this.tierName=name; this.q=TIERS[name]; this.build(); this.onTier?.(name); }
  build(){
    const r=this.renderer, q=this.q; if(this.composer){ this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    const pr=Math.min(devicePixelRatio||1,q.pixelRatio); r.setPixelRatio(pr); const w=innerWidth,h=innerHeight; r.setSize(w,h,false);
    const samples=(this.apple||isTouch)?0:q.msaa; const rt=new THREE.WebGLRenderTarget(w*pr,h*pr,{type:THREE.HalfFloatType,samples});
    const c=this.composer=new EffectComposer(r,rt); c.setPixelRatio(pr); c.setSize(w,h);
    c.addPass(new RenderPass(this.scene,this.camera));
    this.gtao=null; if(q.ao){ const ao=this.gtao=new GTAOPass(this.scene,this.camera,w,h); ao.output=GTAOPass.OUTPUT.Default; ao.blendIntensity=.75;
      ao.updateGtaoMaterial({radius:1.2,distanceExponent:1.6,thickness:1,scale:1.4,samples:12,distanceFallOff:1}); ao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:16});
      if(this.apple){ const set=ao.setSize.bind(ao); ao.setSize=(sw,sh)=>set(Math.ceil(sw/2),Math.ceil(sh/2)); } c.addPass(ao); }
    this.bloom=new UnrealBloomPass(new THREE.Vector2(w,h),.28,.45,2.2); this.bloom.enabled=q.bloom; c.addPass(this.bloom);
    this.grade=new ShaderPass(GradeShader); c.addPass(this.grade); c.addPass(new OutputPass());
    if(!samples) c.addPass(new SMAAPass());
    this.grade.uniforms.uAspect.value=w/h; this.grade.uniforms.uTexel.value.set(1/(w*pr),1/(h*pr)); this.grade.uniforms.uInk.value=this.tierName==='high'?.5:this.tierName==='medium'?.38:0; r.shadowMap.needsUpdate=true; this._w=w; this._h=h;
  }
  resize(){ const w=innerWidth,h=innerHeight; if(w===this._w&&h===this._h) return; this._w=w; this._h=h; this.renderer.setSize(w,h,false); this.composer.setSize(w,h); this.gtao?.setSize(w,h); this.grade.uniforms.uAspect.value=w/h; this.grade.uniforms.uTexel.value.set(1/(w*this.renderer.getPixelRatio()),1/(h*this.renderer.getPixelRatio())); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  setGrade(g){ const u=this.grade.uniforms; for(const k in g){ if(k==='bloom'){ this.bloom.strength=g.bloom[0]; this.bloom.threshold=g.bloom[1]; } else if(u[k]){ if(Array.isArray(g[k])) u[k].value.set(...g[k]); else u[k].value=g[k]; } } this._grade=g; }
  // 自动画质：持续低帧率时降档
  monitor(dt){ if(!this.auto) return; this._acc=(this._acc||0)+dt; this._n=(this._n||0)+1; if(this._acc>=3){ const fps=this._n/this._acc; this._acc=0; this._n=0; this.fps=fps;
      if(fps<42){ if(this.tierName==='high') this.setTier('medium'); else if(this.tierName==='medium') this.setTier('low'); } } }
  render(t){ this.resize(); this.grade.uniforms.uTime.value=t; this.composer.render(); }
}
