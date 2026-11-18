---
name: game-web3d-standalone-builder
description: "当用户要求从零开发、重构或打磨可离线运行的 Three.js / Web 3D 独立游戏（动作割草、通道守卫或立体探索），解决程序化 3D 像粗糙 Demo、技能无光效、热循环 GC、状态机竞态、多分辨率遮挡与手机触控适配时触发 —— 完成数据驱动架构、Additive GLSL 光效、InstancedMesh 合批、动态 Web Audio 与单文件离线 HTML 交付。"
permissions:
  allow:
    - "Bash(npm install *)"
    - "Bash(npm run *)"
    - "Bash(node scripts/*)"
    - "Bash(node ../skills/game-web3d-standalone-builder/scripts/*)"
dependencies:
  mcp:
    - name: ide-browser
      config: "内置浏览器（用于多视口 3D 视觉收敛、断网模拟与 QA 调试台实测）"
  cli:
    - name: node
      verify: "node --version"
    - name: npm
      verify: "npm --version"
  api_keys: []
  scripts:
    - skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
smoke_test:
  command: "node --version && npm --version"
  expected_exit: 0
  description: "验证本地 Node.js 与 npm 打包及无头校验运行时可用"
---

# Skill: 单文件离线 Web 3D 精品游戏构建与打磨 (game-web3d-standalone-builder)

> **你是资深 Web 3D 游戏工程师、技术美术（TA）与系统策划。** 你的职责是在保持模块化 TypeScript 源码可维护性的前提下，构建并交付 **100% 离线自包含、零外部网络请求、支持桌面与手机横竖屏双端、60 FPS 稳帧** 的完整可玩 Three.js 3D 游戏；通过硬面 3D 建模、三点冷暖布光、Fresnel 轮廓光、Additive GLSL 技能光效、`InstancedMesh` 合批、零 GC 对象池与多端响应式 HUD 彻底消除“粗糙几何体 Demo 感”。

## 执行流程

### Phase 0: 工程结构与质量门禁骨架

1. 本仓库核心工程位于 `tiny-vanguard/`（Vue 3 + TypeScript + Vite + Three.js），根目录 `prompts/` 与 `skills/` 存放工程规范与校验工具。
2. 建立 **五道构建前门禁**（`scripts/prebuild-check.mjs`）：
   - `Gate 1`：0 循环依赖（`src/game/` 与 `src/components/` 单向解耦）；
   - `Gate 2`：安全与离线红线（无 `innerHTML` / `eval` / 远程 URL）；
   - `Gate 3`：单文件离线打包与 Favicon 完整性；
   - `Gate 4`：热循环零 GC 校验（`update*`/`step*`/`sync*`/`render*` 禁分配向量/闭包/对象键枚举）；
   - `Gate 5`：内容配额校验（Debuff/Buff/Equipment/Upgrade 各 `>= 20`）与系统层关卡 ID 零硬编码。

### Phase 1: 数据驱动权威运行时与零竞态核心

1. **固定步长 + 双时钟分离（`GameClock`）**：`rawDt` 驱动固定步长物理模拟，`wallDt`（不受暂停归零）驱动动态配乐与 FPS 采样，避免菜单或升级界面音乐卡死。
2. **暂停栈防死锁（`GameStateMachine`）**：区分 `'manual'`、`'hidden'`、`'level-up'`、`'context-lost'`；`window.blur` 走软暂停 `'manual'`，防止可见标签页失焦后“继续战斗”死锁。
3. **快照安全 `ObjectPool` & 中心螺旋 `SpatialGrid`**：
   - `ObjectPool.forEachActive` 使用预分配 `Int32Array` 快照 + 代际校验，免疫分裂弹生成与死亡连锁释放引发的并发遍历错乱；
   - `SpatialGrid.queryCircleCandidates` 按切比雪夫环由内向外扫描，消除密集怪潮下的西北象限截断偏置，并在敌怪移动后刷新网格。
4. **可复用 Scratch 零 GC 约定**：`StatusEffectSystem`、`LevelProgressionSystem`、`EnemyWaveSystem` 返回值全部复用类成员对象，杜绝千次/秒临时对象分配。

### Phase 2: 3D 硬面建模、三点布光与零后处理 GLSL 光效

1. **三点冷暖布光 + Fresnel 轮廓光**：压低扁平环境光（`HemisphereLight <= 0.5`），主暖光 + 侧后冷蓝背光（`rimLight`）+ `onBeforeCompile` Fresnel 边缘高光，搭配 42°–45° 动作斜视角突出 3D 体积感。
2. **Additive Fake Bloom + 单 Pass GLSL Shader（`VfxShaderFactory.ts`）**：
   - 严禁在移动端硬上吃垮 GPU 的全屏 `UnrealBloomPass`；改用预烘焙 64×64 柔光核/星芒/流光贴图 + `THREE.AdditiveBlending` + 单 Pass GLSL 激波/能量光轨/垂直全息光柱；
   - 定长池化 `BeamPool`（动态折线闪电链、穿透激光、冲刺残影）与 `ShockwavePool`（寒霜锯齿波、星爆超新星、电弧脉动）。
3. **全静态 + 动态 `InstancedMesh` 合批与纹理缓存**：
   - 敌群、弹幕、掉落晶体、粒子、外围森林/火山塔、桥面木板/立柱/灯笼/岩岛全部走 `InstancedMesh`（整帧 `< 40 Draw Calls`）；
   - 程序化 256×256 地形纹理通过 `getCachedTerrainSurfaceTexture` 缓存，重开关卡秒开；`webglcontextrestored` 自动重建 PMREM 与标脏纹理。

### Phase 3: 组件化动态音频（MusicSequencer + SoundEngine）

1. 三总线（`masterGain` / `bgmGain` / `sfxGain`）+ `DynamicsCompressorNode` 防多音效削波，`onended` 及时断连。
2. `MusicSequencer` 按玩法模式（菜单 / 荒野生存 / 通道守卫）、阶段、连杀狂热（Fever）与首领战以 `82–114 BPM` 稳态呼吸留白与 `triangle` 柔和音色实时变奏，基于 `navigator.userActivation.hasBeenActive` 安全解锁，暂停/升级自动 ducking，切后台自动 `suspend()`。

### Phase 4: 多端屏幕适配与双语 QA 调试控制台

1. **多端屏幕适配**：窄竖屏相机缩放上限 `2.15x`，监听 `resize` / `orientationchange` / `visualViewport`；所有界面覆盖 `@media (max-width: 640px)`、`@media (max-height: 520px/540px)` 横屏矮视口、`env(safe-area-inset-*)` 与 `@media (pointer: coarse)` 触屏键帽隐藏。桌面端 `WASD` 移动配右下角 3 槽弧形技能轮盘（`Space`/`E`/`Q`），触屏端独立左虚拟摇杆。
2. **双击 `F9` QA 调试台（`DebugBridge.ts` + `DebugPanel.vue`）**：3 秒内双击 `F9` 懒挂载，提供中英双语实时遥测与快捷操控，严禁硬编码关卡 ID，且收起态悬浮胶囊错位避开右上角 `⏸` 按钮。

### Phase 5: 门禁验收与单文件离线打包

在 `tiny-vanguard/` 目录一条命令执行完整门禁链：

```powershell
cd tiny-vanguard
npm run gate
```

或配合通用离线纯净度审计脚本校验最新构建：

```powershell
node ../skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
```

详细 L2 用户视角验收场景清单见 [SCENARIOS.md](SCENARIOS.md)。

## 硬性规则

1. **零外部运行时依赖** — 最终单 HTML 内联全部 JS/CSS/贴图/着色器/Web Audio，严禁 CDN、外链或运行时网络请求。
2. **热循环零 GC 与 GPU 全生命周期释放** — 禁止每帧分配向量/状态返回对象；关卡切换与销毁时必须完整释放 `InstancedMesh`、几何体、材质与阴影贴图。
3. **非卡通硬面视觉与零后处理光效** — 角色/怪物/道具保持硬面 3D 轮廓与光影对比；特效走 Additive GLSL 管线，不堆叠重型后处理。
4. **双端无遮挡与无锁死状态机** — 桌面失焦、横竖屏切换、多指 `pointerId` 触控与暂停恢复必须经过浏览器实机验证。
5. **BOSS 动态平衡与双模式机制隔离** — 首领须具备动态战力血量缩放、残余护甲、单次爆发软上限（`<= 8%` 最大生命）、易伤上限（`<= 1.45x`）与 50% 血二阶段护盾转阶段；同时必须按 `arenaShape` 严格区分行为：开放圆形生存场（可风筝）保留冲锋/砸地与 `0.55x` 减速下限，狭路通道守卫（不可风筝）禁用冲锋与全桥砸地、改为 `0.68x` 攻城推进 + `0.38x` 减速下限 + 扇形可躲避弹幕 + 越线重创击退（非满血秒杀）。
