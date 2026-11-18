# Tiny Vanguard 内容与系统扩展指南

## 1. 只需配置即可完成的新增内容

| 扩展目标 | 修改位置 | 说明 |
|---|---|---|
| 新增同规则关卡 | `src/game/content/levels/levels.ts` | 新增 `LevelDefinition` 对象，配置 `stages`、`bossStage`、`weaponSlotCount`、`allowedWeaponIds` 等字段，`DefaultContent.ts` 会自动注册。 |
| 修改阶段/时长/波次/首领 | `src/game/content/levels/levels.ts` | 调整 `stages[]` 的 `startSec`/`endSec`/生成倍率与 `bossStage.triggerSec`、`bossEnemyId`。 |
| 修改装备槽位上限 | `LevelDefinition.weaponSlotCount` | HUD 槽位显示与 `UpgradeSystem` 解锁判断均动态读取该字段，无硬编码常量。 |
| 新增已有行为的敌人变体 | `src/game/content/enemies/enemies.ts` | 新增 `EnemyDefinition`（复用 `enemy-chaser` / `enemy-charger` / `enemy-ranged` 等已注册 `behaviorId`），并将其 ID 加入关卡的 `allowedEnemyIds` 与波次 `entries`。 |
| 新增属性或武器数值强化 | `src/game/content/upgrades/upgrades.ts` | 新增 `UpgradeDefinition`，组合 `UpgradeEffect`，并将 ID 加入关卡 `upgradePoolIds`。 |

## 2. 需要新增代码模块并显式注册的内容

- **新增武器攻击机制**：
  1. 在 `src/game/systems/CombatSystem.ts`（或拆分为 `src/game/behaviors/weapons/` 独立模块）实现新 `behaviorId` 的逻辑。
  2. 在 `src/game/content/registries/DefaultContent.ts` 的 `weaponBehaviorIds` 集合中显式注册该 `behaviorId`。
  3. 在 `weapons.ts` 中新增引用该 `behaviorId` 的 `WeaponDefinition`。
- **新增敌人 AI 行为**：
  1. 在 `src/game/systems/EnemyWaveSystem.ts` 的 `stepBehavior`（或独立行为表）增加新 `behaviorId` 的状态分支。
  2. 在 `DefaultContent.ts` 的 `enemyBehaviorIds` 中注册该 `behaviorId`。
- **新增通关目标类型**：
  1. 在 `src/game/systems/LevelProgressionSystem.ts` 增加对应 `victoryObjective.behaviorId` 的判定逻辑。
  2. 在 `DefaultContent.ts` 的 `objectiveBehaviorIds` 中注册该 `behaviorId`。
- **新增升级效果类型 (`UpgradeEffect.kind`)**：
  1. 在 `ContentTypes.ts` 扩展 `UpgradeEffect['kind']` 联合类型，并在 `UpgradeSystem.ts` 的 `recalculateStats` / `applyUpgrade` 中实现实际效果。

## 3. 保证新增内容进入单 HTML 构建

- 所有内容定义与行为模块均通过静态 ES `import` 从 `src/main.ts` -> `ArenaGame.vue` -> `GameRuntime.ts` -> `DefaultContent.ts` 引入。
- 避免使用运行时 `fetch()` 加载外部 JSON 或动态路径 `import(variable)`；使用 `npm run build:single` 与 `npm run verify:single` 验证所有新增内容已内联打包进 `dist/tiny-vanguard-<version>-<YYYYMMDD-HHmmss>.html`（并同步至 `../docs/index.html`）。
