# 红楼梦 · 美术方向与「高级感」落地方案

> 依据：https://github.com/gamedev-skills/awesome-gamedev-agent-skills（76 个游戏开发 agent skill + router，Apache-2.0）。
> 本文分三部分：①学了哪些 skill（附 URL）②据此要落地的具体技术 ③可量化的验收清单。
> 技术底座：three.js r186，静态站，全程序化生成（无外部模型），需在普通笔记本与移动低档位流畅运行。

---

## 一、已研读的 skill（均在 `skills/` 下，读过 SKILL.md 全文及关键 references）

仓库根：`https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/`

| skill | URL（相对仓库根） | 与本项目最相关的收获 |
|---|---|---|
| README / router | `README.md`、`router/SKILL.md` | skill 以「引擎→学科→类型→工作流」叠加；three.js 属 web-engines，美术走 create-game-assets，表现层走 shader-programming / game-feel / audio-design |
| **create-game-assets** | `skills/disciplines/create-game-assets/SKILL.md` + `references/art-direction.md` `three-d-pipeline.md` | 先「锁定视觉目标」再批量产出；用形状/剪影/明度/色彩角色/边缘/材质/光/细节/镜头/动态 10 轴描述风格，而不是「好看」「高级」；**按家族出资产**（同一套比例、线宽、光向）；**三距离评估**（缩略/工作/情境）；漂移信号（头身比、线宽、高光方向变化）；3D 需检查比例、枢轴、材质复用 |
| **threejs-materials-lighting** | `skills/web-engines/threejs-materials-lighting/SKILL.md` | PBR 参数含义；r155+ 物理光强（主光 2–3）；阴影三开关与阴影相机贴合；法线/粗糙贴图保持线性，色彩贴图 sRGB；后处理链末端必须 OutputPass；`environmentIntensity` 调 IBL |
| **threejs-scene-setup** | `skills/web-engines/threejs-scene-setup/SKILL.md` | 像素比封顶 ≈2、resize 同步 aspect、控制器阻尼每帧 update |
| **threejs-gltf-loading** | `skills/web-engines/threejs-gltf-loading/SKILL.md` | 若引入模型：GLB + Draco/KTX2/Meshopt，`AnimationMixer`；本项目 Tripo 余额为 0、CC0 人物模型风格无法与工笔统一，故保持程序化管线，但按其「资产验证」要求逐项自检 |
| **shader-programming** | `skills/disciplines/shader-programming/SKILL.md` + `references/effects.md` | 顶点/片元分工；UV+time 驱动效果；`mix/smoothstep` 代替分支；**fresnel 边缘光**、**outline**、**vignette**、色彩分级的标准写法；`smoothstep` 边界必须 e0<e1；`discard` 伤移动端 early‑Z；`onBeforeCompile` 只适用 WebGLRenderer（本项目正是） |
| **game-feel** | `skills/disciplines/game-feel/SKILL.md` + `references/feedback-recipes.md` | 反馈分层且短暂；按重要性分 small/medium/large 三档；缓动选择表（pop=BACK、settle=CUBIC out、镜头=SINE in-out）；trauma 平方震动；**不要线性缓动**；提供「减少动效」开关 |
| **game-ui-ux** | `skills/disciplines/game-ui-ux/SKILL.md` + `references/layout-and-flow.md` | 锚点布局 + 容器，不用绝对像素；安全区；屏幕栈（push/pop）；HUD 事件驱动；字号下限（PC 1080p ≥18px）；鼠标/键盘共存 |
| **camera-systems** | `skills/disciplines/camera-systems/SKILL.md` + `references/follow-and-framing.md` | 用 `1-exp(-rate*dt)` 做与帧率无关的平滑；跟随放在目标移动之后；俯仰角钳制；**震动作为加性偏移最后叠加**；传送/硬切时重置平滑 |
| **audio-design** | `skills/disciplines/audio-design/SKILL.md` + `references/adaptive-music.md` | Music/SFX/Ambience/UI 总线；以 dB 思考；**对白时音乐侧链闪避**；纵向分层（stems 淡入淡出）的自适应音乐；重复 SFX 加随机音高/音量；响度目标 PC≈-24 LUFS、移动≈-18 LUFS，峰值 ≤-1 dBTP |
| **level-design** | `skills/disciplines/level-design/SKILL.md` + `references/pacing-and-flow.md` | 先量人物尺度再定空间；关键路径/黄金路径；张弛节奏；**用光、线、地标引导而非围墙**；先教后考 |
| **performance-optimization** | `skills/disciplines/performance-optimization/SKILL.md` + `references/profiling-and-budgets.md` | 先测后改；CPU/GPU 分流；定预算（帧时间、纹理、draw call）；对象池；降低 overdraw（叠加透明/全屏特效）；每次改动前后量数 |
| **dialogue-systems / visual-novel** | `skills/disciplines/dialogue-systems/SKILL.md`、`skills/genres/visual-novel/SKILL.md` | 内容与呈现分离；打字机应整句设置后递增可见字符数（不切字符串）；立绘/背景/文本框分层；回看、自动、跳过已读；选择必须带来可见后果 |
| **rpg** | `skills/genres/rpg/SKILL.md` | 数据驱动内容；存档带 version；任务进度持久化；选择要改变后续世界状态 |
| **input-systems / save-systems / physics-tuning / game-ai / procedural-gen**（浏览） | `skills/disciplines/*/SKILL.md` | 输入缓冲、固定步长、程序化噪声种子等，用于动画/飘带弹簧稳定性与移动端触控 |
| prototype-fast / game-jam（浏览） | `skills/workflows/*/SKILL.md` | 先垂直切片再铺开：本轮先把「一个角色」做到验收线，再复制到全家族 |

> 不相关的 Godot / Unity / Unreal / Roblox / Phaser 等引擎 skill 仅浏览目录，未采用。

---

## 二、视觉系统（按 create-game-assets 的 10 轴写成「合同」）

| 轴 | 红楼梦·水墨工笔 的具体约束 |
|---|---|
| 形状 | 人物细长优雅：约 **3.5–4 头身**（Q 版里的雅致款，头略大、颈细长、肩窄削），圆润柔和的曲线，长袖/长裙的流线；建筑横平竖直形成对比 |
| 剪影 | 每个主要角色在 1/4 缩略尺度下可凭**发式+披挂+体量**认出：黛玉（瘦削、单髻垂鬟、手帕）、宝钗（丰润、低髻、宽摆）、宝玉（金冠、抹额、箭袖）、凤姐（高髻、凤钗、斗篷）、湘云（双丫髻、明快短袄）、妙玉（带发修行、风帽、素袍） |
| 明度 | 画面只有 3–4 级明度带：宣纸亮部 / 中间调 / 淡墨 / 浓墨点睛；灰度图中人物必须比背景更「重」 |
| 色彩角色 | **主色**=每位角色一支主色（黛玉烟青、宝钗蜜黄、宝玉朱红、凤姐绛紫、湘云珊瑚、妙玉月白）；**点睛**=朱砂印红 + 金；**环境**=青灰/赭石/暖白；**危险/情绪**=胭脂红。高光偏暖（宣纸）、阴影偏青 |
| 边缘 | **淡墨勾线**（后处理，克制，不描全部）+ 丢失边（lost edge）柔化；脸部线条（眉、眼、唇）为细墨线 |
| 材质 | 丝绸：低粗糙+各向异性式高光带+边缘微亮；棉麻：高粗糙；皮肤：哑光暖瓷；金属：低量 metalness 的暖金；石：冷灰；水：深青 + 菲涅尔 |
| 光 | 主光暖（日）/ 月白（夜），环境半球光偏冷；灯笼与窗内光为暖橙点光 + 泛光；对话时增一盏柔和的**轮廓/眼神光** |
| 细节 | 细节集中在**脸、发饰、袖口/裙摆刺绣**；远处只保留色块 |
| 镜头 | 默认俯视斜 3/4；对话时推近到半身、窄视角、边缘虚化、上下电影黑边 |
| 动态 | 缓、柔、带滞后：呼吸、重心转移、袖/带/发有二级弹簧；不使用弹跳卡通化过冲，仅 UI 点击使用小幅 BACK 过冲 |

### 色彩剧本（Color Script）
晨：青白雾 + 淡金 → 午：暖白通透 → 昏：朱橙 + 紫灰 → 夜：靛蓝 + 灯笼橙。随游戏日期推进，整体向**秋赭**偏移（高光更暖、饱和略降），呼应「繁华落尽」。

---

## 三、要落地的具体技术（对应 skill → 本项目改动）

### 1. 人物管线（create-game-assets / shader-programming / threejs-materials-lighting）
1. **比例重做**：统一骨架参数（头高:总高≈1:3.7，颈细长，肩窄，腰收，裙摆放），按角色用 `build` 系数微调（黛玉 .92 / 宝钗 1.08 / 凤姐 +高）。
2. **脸**：不再依赖球面 UV（原先脸只占 64px 宽）。头骨网格改为**正面平面投影 UV**，脸贴图 256–384px 全幅：柳叶眉、含情眼（眼白/虹膜/瞳孔高光/上睑线/睫毛）、鼻影、唇形与高光、腮红、眉间花钿；每角色有独立「眼型+眉型+唇色」（黛玉罥烟眉含情目、凤姐丹凤眼、宝钗圆润、宝玉俊朗、妙玉清冷）。**表情集**：neutral / blink / talk / smile / sad / shy / angry，通过**换 map**实现（零重编译），眨眼与说话口型自动轮换。
3. **发**：发帽 + 逐绺发丝法线/高光（自定义 shader：沿 V 方向的细条纹 + 天使环高光带）+ 刘海片 + 鬓角垂绺 + 背后长发段（弹簧摆动）；发饰：珠花、金簪、步摇（带摆动流苏）、冠、抹额。
4. **衣**：裙/袍的 Lathe 剖面加**垂直褶皱**（角度正弦位移，随高度衰减）、**交领右衽**领口条、腰封、袖口翻边、披帛/飘带多段链；袍服使用**每角色刺绣贴图**（竹、牡丹、梅、云、凤、莲、水波，画在下摆带与散点），配合原有丝绸 shader 的边缘光。
5. **二级运动**：袖（已有弹簧）+ **飘带 3–5 段链** + **背发段** + **步摇流苏**，都用 `1-exp(-k·dt)` 的临界阻尼跟随（camera-systems 的与帧率无关平滑），并钳制幅度；低档位只保留袖与带。
6. **动画**：待机（呼吸 + 重心转移 + 轻微头部漂移 + 随机眨眼）、走路（髋摆、对侧摆臂、步幅随速度）、说话（点头 + 手势 + 口型）、情绪（`emote(kind)`：害羞低头、悲伤垂肩、喜悦轻跳、愠怒侧身）。
7. **对话立绘**：专用渲染器，半身构图（FOV 窄）、三点光（暖主光+冷轮廓+眼神光）、**宣纸晕染背景**（径向淡彩 + 纸纹 + 角色主色晕）、方形印章式边框；按情绪生成不同立绘。

### 2. 审美与后期（shader-programming / threejs-materials-lighting / camera-systems）
1. **后处理链**（已有 MSAA→GTAO→Bloom→Grade→Output→SMAA）：Grade 追加 **淡墨描边**（亮度 Sobel 4 tap，仅中/高档）、**对话边缘虚化**（径向模糊近似景深）、随日期的**秋赭偏移**、纸纹保留。低档位全部关闭。
2. **水/天/云/雾**：水面菲涅尔 + 缓流法线；天空渐变随时段；云用大尺度柔边面片；**雾层**用 2–4 张软边渐隐面片贴地漂移（透明叠加数量受限，控制 overdraw）。
3. **灯光**：夜晚灯笼与窗内光（暖橙 emissive + 轻 bloom）；对话时加轮廓光。
4. **镜头**：对话镜头 = 目标点 + 偏移，`1-exp(-r·dt)` 平滑，窄 FOV，电影黑边；切换时重置平滑避免甩镜。
5. **UI 重绘**（game-ui-ux）：**季节印章**、**笺纸**面板（纸纹 + 细金线边）、**卷轴**式弹窗（上下轴头）、毛笔字标题；按钮 hover 上浮、press 缩放（BACK 过冲 ≤ 8%），文本**墨晕渐显**打字机；所有尺寸用 clamp/vh，保证移动端可用；尊重 `prefers-reduced-motion`。
6. **音频**（audio-design）：新增 UI 总线；对话开始时**侧链闪避**音乐 −6 dB 并在结束后恢复；脚步随材质（石板/木桥/草地）变音色并随机音高；夜间虫鸣层、水声层随地点淡入淡出；总响度目标 −24 LUFS（PC）。

### 3. 性能（performance-optimization）
- 人物数量 ≤ 当前区域的 NPC 数（≈6–12）；每人 draw call ≤ 18，**合并静态子网格**；发/衣材质按「配置键」缓存复用；表情贴图 256px 并用 mipmap；脸贴图按需懒生成。
- 弹簧链只在**距相机 < 28 单位**时更新（LOD）；远处人物冻结二级运动。
- 描边、雾层、边缘虚化按档位开关；自动画质降档（已有 `monitor`）继续生效。
- 预算：高档位笔记本 ≥ 50 FPS（swiftshader 无参考意义，仅验证功能），移动低档 ≥ 30 FPS；纹理总量 ≤ 64 MB；每帧 JS < 6 ms。

---

## 四、可量化验收清单

**人物（每位主角色都要过）**
- [ ] 总高/头高 ∈ [3.4, 4.2]（脚本量取包围盒，写入 `/workspace/after6/metrics.json`）
- [ ] 脸贴图宽度 ≥ 256px，脸区占头部可见面积 ≥ 60%（对比旧版 64px）
- [ ] 至少 4 套表情贴图可切换（neutral/blink/talk + 1 种情绪），眨眼间隔 2.5–6 s 随机
- [ ] 6 位主角（黛玉/宝钗/宝玉/凤姐/湘云/妙玉）剪影互不相同（发式、披挂、体量三者至少两项不同）
- [ ] 每人刺绣母题不同（≥5 种母题），下摆刺绣带在 2 倍变焦截图中可辨
- [ ] 二级运动：袖、飘带、背发（≥3 个独立弹簧链），走/停时可见滞后；`dt` 变化 3 倍幅度不发散
- [ ] 立绘 ≥ 6 张，含 ≥2 种情绪；背景为宣纸晕染，非纯色

**审美**
- [ ] 描边/虚化/雾层均有开关，低档位全关
- [ ] 灰度截图下人物与背景的平均亮度差 ≥ 0.08
- [ ] 同一时段截图色相集中在色彩剧本的 4 组之内（人工评审 + 直方图）
- [ ] UI：印章、笺纸、卷轴三类组件各 ≥1 处落地；hover/press 动效 ≤ 200ms；`prefers-reduced-motion` 下关闭

**性能与稳定**
- [ ] 高档位 draw calls（区域内）≤ 基线 +25%；`renderer.info.render.calls` 记录在 metrics.json
- [ ] 低档位纹理总量与三角面不高于基线 +15%
- [ ] 线上 0 个 console error；新手引导 9 步可走通；至少 2 种结局可达
- [ ] 3 轮截图评审（`/workspace/after6/round1..3`），每轮含 6 位主角 before/after 特写
