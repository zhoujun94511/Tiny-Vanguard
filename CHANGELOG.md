# 更新日志

本文件记录《Tiny Vanguard》对外交付版本。版本号对应 `tiny-vanguard/package.json` 的 `version`。构建文件名为 `tiny-vanguard/dist/tiny-vanguard-<版本>-<YYYYMMDD-HHmmss>.html`，每次构建只保留最新一份并同步至 `docs/index.html`，页面内的 `<meta name="version">` 与 `<meta name="build-time">` 与文件名一致。

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
