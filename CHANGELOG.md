# 更新日志

本文件记录《Tiny Vanguard》对外交付版本。版本号对应 `tiny-vanguard/package.json` 的 `version`。构建文件名为 `tiny-vanguard/dist/tiny-vanguard-<版本>-<YYYYMMDD-HHmmss>.html`，每次构建只保留最新一份并同步至 `docs/index.html`，页面内的 `<meta name="version">` 与 `<meta name="build-time">` 与文件名一致。

## 1.2.2（移动端显示与 GPU 清晰度适配版） — 2026-11-20

聚焦移动端小屏选关交互、42° 俯视角英雄辨识度与旗舰手机 GPU 清晰度适配。

- **小屏选关界面滑动与词缀排布修复**：修复 [LevelSelect.vue](tiny-vanguard/src/components/game/LevelSelect.vue) 小屏模式下无法上下滑动查看第 3、4 关的问题，并修复「玻璃大炮」「精英狂潮」「疾速虫海」在小屏下的竖排折行。
- **三名英雄 3D 外观高辨识度重构**：[CharacterVisualFactory.ts](tiny-vanguard/src/game/scene/CharacterVisualFactory.ts) 拉开体型缩放（`1.0x` / `0.90x` / `1.24x`）、主甲色调（圣光白 / 深海靛蓝 / 熔岩赤铜）与脚底光环样式。
- **主流手机 GPU 清晰度适配**：[qualityConfig.ts](tiny-vanguard/src/game/config/qualityConfig.ts)、[ProceduralTextures.ts](tiny-vanguard/src/game/scene/ProceduralTextures.ts) 与 [GameRuntime.ts](tiny-vanguard/src/game/core/GameRuntime.ts) 为 Adreno 7xx / Apple GPU 等旗舰移动 GPU 在高清档放开 `3.0` DPR（老旧低端移动 GPU 收敛至 `2.25`），启用 `4x` 斜视角地面/桥面各向异性过滤、阴影贴图对齐 `2048`，并支持切换画质即时刷新分辨率；Vitest 单测扩充至 **65 项**全通过。

---

## 1.2.1（无尽直入与体验打磨版） — 2026-11-19

在 1.2.0 养成与无尽闭环基础上，重点优化双模式无尽触达率、通道守卫英雄开局体验、QA 工具效率及极端数值容错。

- **双模式「♾️ 直入无尽」快捷入口**：荒野生存与通道守卫第 4 关（`星渊王座` / `深渊断桥`）通关后，选关卡片固定显示 **`♾️ 直入无尽`** 按钮与无尽最佳时长；点击直入时自动给予 Lv.5 起步战力与开局 3 次升级/副武器补偿。
- **通道守卫开局远程副武器**：非星辉连弹初始英雄（如「重装铁卫」「雷霆游侠」）在通道守卫模式开局自动附带基础远程 `star-blaster` 副武器，兼具近身/连锁特色与远程自动充能光栅能力，并与 `J` 键手动爆发并存。
- **QA 调试台「直接通关 (1-4)」**：[DebugPanel.vue](tiny-vanguard/src/components/game/DebugPanel.vue) 新增 `直接通关 (1-4)` 按钮，仅对双模式第 1–4 关常规对局生效（无尽模式下自动禁用）。
- **界面精简与 Windows 预览适配**：移除主界面顶栏冗余语言切换按钮（统一收敛至设置/暂停页）；适配 [index.html](tiny-vanguard/index.html) 启动封面在 Windows 资源管理器预览窗格的居中与标题防隐身显示。
- **无尽极限容错加固**：为 `computeXpToNext` 经验曲线与 `initEnemyFromDef` 怪物血量/伤害补充安全整型与 `Number.isFinite` 钳制；Vitest 单测扩充至 **63 项**全通过。

---

## 1.2.0（暗黑式养成闭环与无尽深渊版） — 2026-11-19

在 1.0.0 战斗核心之上，全面补齐双模式 8 关递进、无尽深渊与巅峰超限突破、暗黑式三阶段局外养成闭环，并完成多端矢量 UI 与 3D 表现质感升级。

### 玩法扩展与无尽深渊

1. **双模式 8 关扩充与渐进解锁**：荒野生存新增「幽影废墟」「星渊王座」，通道守卫新增「钢铁高架」「深渊断桥」；同模式需通关前一关逐步解锁（保留 `?debug=1` / `F9` 全开通道），升级池扩充至 **34 项**。
2. **无尽深渊与巅峰超限突破（Limit Break）**：双模式第 4 关首领击杀后可主动进入无尽深渊（每 45 秒升 1 阶、每 55 秒刷新无尽首领、支持随时撤离完整结算）；每次击破无尽首领永久在本局叠加 `+14% 伤害 / +10% 暴伤 / +15 HP / +4% 攻速`，荒野满级池后升级自动转为无限可选的「深渊巅峰突破」（`+6% 伤害 / +10 HP / 回血 35%`），并同步无尽怪物温和伤害缩放（最高 `3x`）。
3. **战前出征总览、挑战词缀与图鉴里程碑**：选关页新增高风险高收益「挑战词缀」与实时计算的战前出征战力总览条（`PreRunPreview`）；新增 `CodexModal` 图鉴与里程碑成就系统，结算页支持碎片/宝石掉落及新点亮圣物 `NEW` 角标。

### 暗黑式三阶段局外养成闭环（4 标签页军备库）

- **Stage 1 — 核心闭环**：20 件圣物按白→绿→蓝→紫→橙 5 档品质分级；军备天赋新增「命运骰子」与「弑王锋芒」（共 8 项）；3 名英雄支持碎片解锁与 1★→5★ 升星（老胜利存档自动兼容解锁）；开放最多 2 个本命圣物出战槽直接带入开局。
- **Stage 2 — 圣物精炼与宝石工坊**：支持已发现圣物 `+1~+5` 精炼（每级 `+15%` 圣物效果）、15⭐ 开孔与 4 种×3 阶宝石（通关/无尽首领掉落、3 合 1 升阶、无损镶嵌卸下）。
- **Stage 3 — 附魔洗练与圣物共鸣**：支持 12⭐ 随机洗练 6 种实战附魔词条；双槽同时出战 2 件稀有及以上圣物可激活「✨ 圣物共鸣（+8% 伤害 / +20 HP）」。

### 界面质感、3D 节制与门禁构建

- **UI/UX/UE 与矢量图标升级**：统一 `GameModal` 弹窗体系，新增 `WeaponSvgIcon`、`HeroSvgIcon`、`GemSvgIcon` 矢量徽记替换纯色圆点与部分 Emoji，适配桌面 4 列 / 手机 2×2 军备库、首领降临脉冲动效及 `225 / 225` 中英文双语对称词条。
- **3D 画质节制与全链路验证**：按画质档位节制粒子/阴影倍率（热循环零 GC），Vitest 单元测试扩充至 **59 项**全通过，并通过 Chrome 多视口实机走查与 `npm run gate` 单文件离线验证。

---

## 1.0.0（全面重塑与验收版） — 2026-11-18

在初版核心闭环基础上完成玩法扩容、战斗节奏重构、组件化音画、多端适配、全链路审计与 3D 光效视觉重塑。

### 玩法、节奏与内容体系

- **2 大核心模式 + 分页关卡序列**：
  - 主菜单收敛为「荒野生存」与「通道守卫」两大模式入口，内部采用可复用分页组件 `usePagination` + `PaginationBar` 展示关卡序列，现已实装 **4 个正式关卡**：`翠风草甸`、`熔岩峡谷`、`木桥防线`、`霜雪栈桥`。
- **5 大武装与海量内容矩阵**：新增专劈密集怪堆质心的 `雷鸣链刃` 与专点高血精英/首领的 `星轨重狙`；扩展至 **20 种 Debuff**、**22 种通道增益**、**20 件遗物装备**、**28 项升级** 与 **5 对武器×遗物超武共鸣觉醒**。
- **动态场控导演（Wave Director）与通道光栅进化**：
  - 引入最低在场敌数保底（`minConcurrentNormal`）与多种阵型事件波（`ring-surround`、`side-stampede`、`elite-escort`、`lane-phalanx`）；
  - 桥守模式新增「射爆/充能升阶/红框污染净化」双路无框全息激光光栅与 45% 减伤重盾先锋；
  - 接入 25/60/120 连杀狂热（含百斩全图磁吸圣爆），击杀回血统一为百分比最大生命回复（`1.5%` / `2%`）。

### 3D 视觉、光效、音频与工程质量

- **3D 硬朗战甲重塑与零后处理 GLSL 光效**：新建 [VfxShaderFactory.ts](tiny-vanguard/src/game/scene/VfxShaderFactory.ts)，采用 Additive Fake Bloom + 单 Pass GLSL 激波/旋转能量光轨/垂直星陨光柱 + Fresnel 轮廓光 + 三点冷暖布光 + 42° 动作斜视角，重塑 3.5 头身战甲先锋、5 类立体非卡通敌群、重甲泰坦首领与科幻空投补给舱。
- **组件化动态配乐与音效**：新增 [MusicSequencer.ts](tiny-vanguard/src/game/audio/MusicSequencer.ts) 与三总线 [SoundEngine.ts](tiny-vanguard/src/game/audio/SoundEngine.ts)，随模式、阶段、狂热与首领战实时切换曲风与 BPM，暂停页支持 BGM/SFX 独立开关。
- **QA 调试台与全端屏幕适配**：支持 3 秒内双击 `F9` 呼出中英双语 [DebugPanel.vue](tiny-vanguard/src/components/game/DebugPanel.vue)；提升窄竖屏相机缩放上限至 `2.15x`，补齐横屏矮视口、异形屏安全区与 `visualViewport` / `orientationchange` 监听。
- **全链路审计与性能修复**：修复 `window.blur` 暂停死锁、非模拟态 BGM 时钟归零、破线连杀属性残留；升级 `SpatialGrid` 中心螺旋扩张、`ObjectPool` 并发快照迭代、静态场景 `InstancedMesh` 合批、地形纹理缓存与 `webglcontextrestored` 资源重建。
- **门禁与构建**：`npm run gate`（5 道门禁 + `vue-tsc` + **38 项** Vitest 测试 + `verify:single`）全通过，最新单文件产物 `1.017 MiB`。

---

## 1.0.0（初版） — 2026-11-17

首次可玩版本。基于 Vue 3 + TypeScript + Vite + Three.js 完成模块化 3D 自动战斗生存核心闭环、可扩展内容注册体系与单 HTML 离线构建（`0.653 MiB`）。
