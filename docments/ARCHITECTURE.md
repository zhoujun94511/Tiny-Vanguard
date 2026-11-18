# Tiny Vanguard 架构说明

## 1. 四层职责边界

| 层次 | 目录 | 职责 |
|---|---|---|
| 引擎基础 | `src/game/core/`, `pool/`, `spatial/`, `input/`, `scene/`, `audio/` | 固定步长主循环、状态机、事件/命令总线、对象池、空间网格、输入、Three.js 渲染与 Web Audio |
| 游戏系统 | `src/game/systems/`, `src/game/session/` | 移动、战斗与碰撞、敌潮生成与 AI、经验拾取、升级计算、关卡阶段与补给推进 |
| 内容定义 | `src/game/content/` | 不可变的角色、武器、敌人、升级与关卡定义、注册表及启动前配置校验 |
| Vue UI | `src/components/game/` | 主菜单、关卡选择、HUD、三选一弹窗、暂停菜单、结算界面与虚拟摇杆 |

## 2. 主循环、时间步长与状态机

- **主循环 (`GameRuntime`)**：全局唯一 `requestAnimationFrame` 循环，统一调度固定步长模拟与渲染。
- **时间步长 (`GameClock`)**：固定模拟步长 `1/60s`，单帧真实 `dt` 上限 `0.1s`，每帧最多补算 `5` 次；达到补算上限后裁剪多余累积时间，防止螺旋卡顿。暂停或切后台恢复时调用 `resetTimeBaseline()`，不补算暂停期间时间。
- **状态机 (`GameStateMachine`)**：支持 `menu`、`loading`、`playing`、`paused`、`level-up`、`victory`、`game-over`、`error`。暂停原因（`manual`、`hidden`、`level-up`、`context-lost`）集中由 `Set<PauseReason>` 管理，仅当所有暂停原因都解除时才恢复 `playing`。
- **更新顺序**：输入与玩家移动 → 敌潮生成与空间网格重建/AI/局部避让 → 武器攻击与投射物扫掠碰撞 → 经验吸附与升级排队 → 关卡计时、补给与胜负终态判定（同帧优先判定玩家死亡）。

## 3. 对象池、空间查询与渲染优化

- **对象池 (`ObjectPool<T>`)**：固定容量、带 `generation` 代次标记防陈旧引用、双释放保护、无数组拷贝的逆序活跃遍历，以及为首领预留的 `acquireReserved()` 槽位，避免普通敌人占满池导致首领无法生成。
- **空间网格 (`SpatialGrid`)**：基于定长 `Int32Array` 链表的 2D XZ 平面空间哈希网格，零每帧分配，限制单次查询最大返回候选数以控制最坏 CPU 开销。
- **渲染 (`EntityRenderer` & `SceneArena`)**：普通敌人、敌方/友方弹丸、经验宝石与粒子均使用 `THREE.InstancedMesh` 批处理渲染，并通过 `setColorAt` 实现单体受击闪白/减速染色，避免共享材质全员闪烁。

## 4. 工程规范、交互隔离与离线单文件构建

| 模块 | 实现机制 | 工程目标 |
|---|---|---|
| 工程分层 | `src/game/`（纯 TS 运行时）与 `src/components/`（Vue UI）单向解耦 | 通过 `prebuild-check.mjs` Gate 1 确保 0 循环依赖 |
| 生命周期管理 | `GameRuntime.destroy()`、`SceneArena.dispose()`、`EntityRenderer.hideAll()/dispose()`、`SoundEngine.dispose()` | 退回主菜单或切换玩法时彻底隐藏/释放场景与音频资源 |
| 输入与音频安全 | `WASD` 桌面移动 + `Space/E/Q` 缓冲、`pointerId` 触控摇杆隔离、`navigator.userActivation` 音频解锁 | 消除误触、多指串扰与浏览器自动播放控制台警告 |
| HUD 响应式优化 | 8.3Hz 双缓冲 `HudSnapshot` 与极坐标弧形轮盘 `arcSkills` 样式预计算 | 消除 UI 周期性 GC 与小屏遮挡 |
| 二级选关 3D 预览 | `GameRuntime.setMenuPreviewMode(mode)` 按玩法实时切换草甸 / 栈桥 3D 背景 | 彻底消除退回菜单时的上一局残影，强化模式辨识度 |
| 单 HTML 构建 | `vite-plugin-singlefile` + `finalize-single.mjs` + `verify-single.mjs` | 输出零外链、经典脚本自洽、`< 1.5 MiB` 的离线单文件 |
