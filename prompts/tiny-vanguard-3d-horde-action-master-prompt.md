# Master Prompt — 《Tiny Vanguard》3D 动作割草与防线守卫单文件离线 Web 游戏

> **使用说明（项目级工程基准与复用 Prompt）**：
> 本文件基于《Tiny Vanguard》当前完整可运行工程提炼而成，沉淀了项目在 **双模式割草玩法、零后处理 GLSL 光效、硬面 3D 视觉去卡通化、组件化动态音频、多端适配、QA 调试台与五道静态/性能门禁** 上的实战准则。可直接用于指导本项目后续新关卡/新战技扩展或复刻同规格 Web 3D 动作生存游戏。

---

## 1. 核心定位与技术红线

- **游戏定位**：100% 离线运行的 **3D 动作割草生存游戏**，包含「荒野生存（Wild Survival）」与「通道守卫（Bridge Defense）」两大核心玩法。严禁使用低幼/萌系/二次元甜腻文案与 Q 版圆球豆豆眼美术风格。
- **技术栈与双产物交付**：
  - 源码采用 **Vue 3 + TypeScript + Vite + Three.js** 模块化架构（位于 `tiny-vanguard/src/`）；
  - 通过 `vite-plugin-singlefile` + `scripts/finalize-single.mjs` 输出经典 `<script defer>` 自包含单 HTML 文件（体积 `< 1.5 MiB`，同步至 `docs/index.html`），支持 `file://` 双击离线运行与 GitHub Pages 静态托管，**零外部脚本、字体、贴图、模型与音频请求**。
- **绝对工程红线（`scripts/prebuild-check.mjs` 五道门禁机器强制校验）**：
  1. **Gate 1（0 循环依赖）**：纯 TS 运行时（`src/game/`）与 Vue UI（`src/components/`）单向解耦，`0` 循环引用。
  2. **Gate 2（安全与离线）**：严禁 `innerHTML`、`eval`、`new Function` 或任何 `http(s)://` 远程资源引用。
  3. **Gate 3（单文件完整性）**：同步构建产物与内嵌 Favicon，经典脚本自洽运行。
  4. **Gate 4（热循环零 GC）**：`update*`、`step*`、`sync*`、`render*` 热路径严禁 `new THREE.Vector3/Color/Matrix4`、`.clone()`、`Object.keys/values/entries()` 或每帧创建临时返回对象。
  5. **Gate 5（内容配额与关卡解耦）**：Debuff `>= 20`、Buff `>= 20`、Equipment `>= 20`、Upgrade `>= 20`、可见关卡 `>= 4`；业务系统与调试台严禁硬编码具体关卡 ID（全部通过注册表 `registries.levels` 动态读取）。

---

## 2. 核心玩法与战斗节奏规范

### 2.1 双模式与分页关卡序列
- **主菜单与选关预览**：主界面始终只展示「荒野生存」与「通道守卫」两大入口；点击大类进入分页关卡序列（`usePagination` + `PaginationBar`：桌面 `4/页`、竖屏 `3/页`、横屏矮视口 `2/页`），选关界面实时渲染对应模式 3D 预览背景（`meadow-arena` vs `bridge-defense`）。
- **荒野生存（`arenaShape: 'circle'`）**：42° 3D 动作斜视角，4.5～6 分钟递进节奏（发育 → 阵型波 → 精英与流派成型 → 高密度割草 → 终局泰坦首领战），采用校准经验曲线 `xpCurve: { base: 68, growth: 1.17, exponent: 1.02 }`，含限时全息空投补给舱与直接穿戴遗物。
- **通道守卫（`arenaShape: 'bridge'`）**：锁定防线纵向俯视视角，连续木桥甲板（`maxZ: 26`）+ 扫掠线段光门碰撞（`segmentIntersectsGate`）+ 双路无框全息激光光栅（左路击破即时增益，右路射击升阶 Lv.1→Lv.3 或净化红框污染门获得 Lv.2 双倍收益）+ 重盾先锋阵列（45% 减伤，可被碎甲/感电破盾）+ 击杀直穿战技与遗物。
- **操控与弧形技能轮盘**：桌面端仅响应 `WASD` 移动（移除方向键冲突），右下角配备 3 槽极坐标扇弧技能轮盘（`Space` 冲刺、`E` 圣盾、`Q` 星爆）；触屏设备自动显示 `pointerId` 隔离的左虚拟摇杆并隐藏键盘键帽。

### 2.2 动态场控、多战技差异化索敌与连杀狂热
- **Wave Director**：配置 `minConcurrentNormal` 最低在场敌数保底，玩家清怪越快补刷越快（压至 `0.18s`），消除成型后冷场；定期插入 `ring-surround`、`side-stampede`、`elite-escort`、`lane-phalanx` 阵型波。
- **差异化索敌**：
  - `star-blaster`（星辉连弹）：最近威胁 / 桥守最接近红线的敌人；
  - `thunder-arc`（雷鸣链刃）：基于零 GC 密度查询 `findDensestEnemyClusterCenter()` 专劈怪堆质心；
  - `rail-sniper`（星轨重狙）：基于 `findHighestHpEnemy()` 专点首领 > 精英 > 重盾 > 最高血量目标；
  - `orbit-shields`（守护星环） / `frost-nova`（寒霜震荡波）：近身护体光刃与范围减速控场。
- **连杀狂热与超武共鸣**：25 / 60 / 120 连杀三档实时叠加攻速、移速与暴击；每 100 连杀触发全图磁吸 + 清场圣爆；5 对战技×遗物自动激活「超武共鸣觉醒」（含分裂星弹、呼吸星轨、双重余震、超载感电、破盾穿甲）。
- **双模式差异化 BOSS 平衡**：所有首领均具备动态战力血量缩放、残余护甲（破甲后保留一半）、易伤上限 `1.45x`、单次承伤 `<= 8%` 最大生命与 50% 血二阶段护盾；且按 `arenaShape` 隔离行为——`circle`（可风筝）保留冲锋/砸地与 `0.55x` 减速下限，`bridge`（不可风筝）改为 `0.45x` 血量系数 + `0.68x` 攻城移速 + `0.38x` 减速下限 + 禁用冲锋/全桥砸地，改为可躲避前向扇形弹幕与红线 `45%` 重创击退。

---

## 3. 3D 视觉去卡通化与零后处理 GLSL 光效规范

- **放弃重型全屏 `UnrealBloomPass`**：采用 **Additive Blending + 预烘焙柔光/星芒/流光贴图 + 单 Pass GLSL Shader**（[VfxShaderFactory.ts](../tiny-vanguard/src/game/scene/VfxShaderFactory.ts)），整帧控制 `< 40 Draw Calls`。
- **技能光效池**：定长预分配 `BeamPool`（36 槽，折线高压闪电链、穿透激光束、冲刺残影）与 `ShockwavePool`（16 槽，GLSL 寒霜锯齿激波、星爆超新星、电弧脉动、天降星陨垂直光柱）；粒子统一使用加色混合速度拉伸菱形火花。
- **3D 立体纵深与硬面建模**：
  - 三点冷暖布光（压低 `HemisphereLight` 至 `0.48`，主暖光 + 冷蓝背光 `rimLight`）+ 轻量 `onBeforeCompile` Fresnel 边缘轮廓光；
  - 3.5 头身硬面战甲先锋主角（倒梯形胸甲、发光胸核、重装肩甲、V 型光缝头盔、随狂热变色的双翼尾焰、等离子长剑）；
  - 5 类 `InstancedMesh` 非卡通立体敌群与重甲泰坦首领；静态环境树木/火山塔/桥板/立柱/灯笼/岩岛全部 `InstancedMesh` 合批并缓存程序化地形纹理。

---

## 4. 并发安全、组件化音频、多端适配与 QA 调试

- **核心竞态红线**：
  - `window.blur` 走软暂停 `'manual'`，防止与 `hidden` 暂停栈死锁；
  - `GameClock` 严格分离 `wallDt`（音频/FPS）与 `rawDt`（模拟），保证主菜单与升级界面 BGM 连续流畅；
  - `ObjectPool.forEachActive` 使用预分配 `Int32Array` 快照与代际校验，免疫循环内分裂/连锁死亡导致的增删并发错乱；
  - `SpatialGrid` 按切比雪夫中心环由内向外查询，消除西北象限截断偏置，并在敌怪移动后刷新网格；
  - `HudSnapshot` 采用 8.3Hz 双缓冲推送，避免高频逐帧刷新触发 Vue 响应式抖动。
- **组件化动态音频**：`MusicSequencer` + 三总线 `SoundEngine`（`masterGain` / `bgmGain` / `sfxGain` + `DynamicsCompressorNode`），基于 `navigator.userActivation.hasBeenActive` 安全解锁（`click`/`touchend`/`keydown`），按菜单/生存/守卫/首领/狂热以 `82–114 BPM`、`triangle` 柔和音色与呼吸留白稳态演奏。
- **全端适配、测试与 QA 调试台**：窄竖屏相机缩放上限 `2.15x`，监听 `resize` / `orientationchange` / `visualViewport`，补齐横屏矮视口（`max-height: 520px/540px`）与安全区样式；3 秒内双击 `F9` 呼出中英双语 QA 调试台（`DebugBridge` + `DebugPanel.vue`），并通过 38 项 Vitest 单元测试与 `npm run gate` 全链路门禁校验。
