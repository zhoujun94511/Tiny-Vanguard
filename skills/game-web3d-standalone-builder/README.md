# game-web3d-standalone-builder

> 沉淀「模块化 TypeScript 源码 + 零外部依赖单文件离线 HTML」形态的精品 Web 3D 动作割草与防线守卫游戏开发、GLSL 零开销光效、多端响应式与五道门禁验收工序。

## 供应链位置

Web 3D 独立游戏生产线 · 工程构建与多端打磨段（玩法需求 → 可离线交付单 HTML 成品）

```
  玩法方案与设计约束 ──┐
  模块化源码与资产   ──┼─▶ [game-web3d-standalone-builder] ──▶ 模块化源码仓 (tiny-vanguard/src/)
  实机走查与性能审计 ──┘                                    └──▶ 零外部请求离线构建包 (dist/*.html + docs/index.html)
```

## 核心解决的 5 大工程痛点

1. **画面像“粗糙几何体 Demo / 2.5D 卡通”** — 采用 42° 动作斜视角、三点冷暖布光 + `onBeforeCompile` Fresnel 轮廓光、3.5 头身硬面战甲建模、立体非卡通敌群，以及全部静态/动态 `InstancedMesh` 合批。
2. **技能缺少打击感与高燃光效** — 放弃吃垮手机 GPU 的全屏 `UnrealBloomPass`，改为 **Additive Fake Bloom + 单 Pass GLSL Shader**（激波噪波环、旋转能量光轨、全息星陨光柱）+ 池化折线闪电链与激光束，稳帧 60 FPS。
3. **热循环 GC、高刷屏重影与并发竞态隐患** — 固定步长与墙钟分离（防菜单 BGM 归零）、**零 GC 亚帧渲染插值**（消除 120Hz/144Hz 屏下 60Hz 物理步长导致的角色移动重影）、软暂停防失焦死锁、`ObjectPool` 预分配快照免疫分裂/连锁死亡并发增删、`SpatialGrid` 中心螺旋扩张消除象限截断偏置。
4. **音画与调试工具缺失** — 内置纯 Web Audio `MusicSequencer` + 三总线 `SoundEngine`（按模式/狂热/首领战动态变奏，BGM/SFX 独立开关）与 3 秒内双击 `F9` 呼出的中英双语 QA 调试台。
5. **多端屏幕遮挡与触控冲突** — 窄竖屏相机 `2.15x` 自适应缩放、横屏矮视口（`max-height: 520px/540px`）紧凑布局、`safe-area-inset` 虚拟摇杆与 `pointerId` 多指隔离。

## 交付工程与构建验证

当前仓库核心工程位于 `tiny-vanguard/`，构建产出为 `tiny-vanguard/dist/tiny-vanguard-<版本>-<YYYYMMDD-HHmmss>.html`（同步至 `docs/index.html`）。

### Windows PowerShell 5.1 / Bash

```powershell
cd tiny-vanguard
npm install
npm run gate
```

`npm run gate` 会依次执行：
1. `npm run check`：5 道构建前门禁（0 循环依赖、安全离线红线、构建同步、热循环零 GC、内容配额 >= 20 与关卡解耦）；
2. `npm run type-check`：`vue-tsc --noEmit` 严格类型检查；
3. `npm test`：66 项 Vitest 单元测试与无头全流程模拟；
4. `npm run build:single`：打包单 HTML 并同步 `../docs/index.html`；
5. `npm run verify:single`：验证零外链、经典脚本兼容性、隔离目录运行及体积（当前约 `1.143 MiB <= 1.5 MiB`）。

也可运行通用离线纯净度审计脚本：

```powershell
node ../skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
```
