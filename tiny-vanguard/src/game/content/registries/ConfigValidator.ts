import { RUNTIME_CONFIG } from '../../config/runtimeConfig';
import type { ContentRegistries } from './ContentRegistry';
import type { LevelDefinition } from '../definitions/ContentTypes';

export interface ValidationIssue {
  levelId: string;
  field: string;
  message: string;
}

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function isFiniteNonNeg(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

export function validateLevelConfig(
  level: LevelDefinition,
  registries: ContentRegistries
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (field: string, message: string) => {
    issues.push({ levelId: level.id, field, message });
  };

  if (!level.id) push('id', 'Level id must be non-empty');
  if (!isFinitePositive(level.arenaRadius)) push('arenaRadius', 'Must be finite > 0');
  if (!isFinitePositive(level.weaponSlotCount) || level.weaponSlotCount < 1) {
    push('weaponSlotCount', 'Must be >= 1');
  }

  // Character & starting weapon
  const char = registries.characters.get(level.characterId);
  if (!char) {
    push('characterId', `Character "${level.characterId}" not found`);
  } else {
    if (!registries.weapons.has(char.startingWeaponId)) {
      push('character.startingWeaponId', `Weapon "${char.startingWeaponId}" not found`);
    }
    if (!level.allowedWeaponIds.includes(char.startingWeaponId)) {
      push('allowedWeaponIds', `Must include startingWeaponId "${char.startingWeaponId}"`);
    }
  }

  // Allowed weapons & behaviors
  for (const wid of level.allowedWeaponIds) {
    const w = registries.weapons.get(wid);
    if (!w) {
      push('allowedWeaponIds', `Weapon "${wid}" not registered`);
      continue;
    }
    if (!registries.weaponBehaviorIds.has(w.behaviorId)) {
      push(`weapon.${wid}.behaviorId`, `Weapon behavior "${w.behaviorId}" not registered`);
    }
  }

  // Allowed enemies & behaviors
  for (const eid of level.allowedEnemyIds) {
    const e = registries.enemies.get(eid);
    if (!e) {
      push('allowedEnemyIds', `Enemy "${eid}" not registered`);
      continue;
    }
    if (!registries.enemyBehaviorIds.has(e.behaviorId)) {
      push(`enemy.${eid}.behaviorId`, `Enemy behavior "${e.behaviorId}" not registered`);
    }
  }

  // Upgrade pool
  for (const uid of level.upgradePoolIds) {
    const upg = registries.upgrades.get(uid);
    if (!upg) {
      push('upgradePoolIds', `Upgrade "${uid}" not registered`);
      continue;
    }
    if (upg.weaponId && !level.allowedWeaponIds.includes(upg.weaponId)) {
      push(`upgrade.${uid}.weaponId`, `References weapon "${upg.weaponId}" not in level allowedWeaponIds`);
    }
    if (upg.prerequisites) {
      for (const pre of upg.prerequisites) {
        if (!registries.upgrades.has(pre)) {
          push(`upgrade.${uid}.prerequisites`, `Prerequisite "${pre}" not registered`);
        }
      }
    }
  }

  // XP curve
  if (!isFinitePositive(level.xpCurve.base)) push('xpCurve.base', 'Must be finite > 0');
  if (!isFinitePositive(level.xpCurve.growth)) push('xpCurve.growth', 'Must be finite > 0');
  if (!isFinitePositive(level.xpCurve.exponent)) push('xpCurve.exponent', 'Must be finite > 0');

  // Stages
  if (level.stages.length === 0) {
    push('stages', 'Must define at least 1 survival stage');
  }
  for (let i = 0; i < level.stages.length; i += 1) {
    const st = level.stages[i];
    if (!isFiniteNonNeg(st.startSec) || !isFinitePositive(st.endSec) || st.endSec <= st.startSec) {
      push(`stages[${i}]`, `Invalid time range [${st.startSec}, ${st.endSec}]`);
    }
    if (i > 0 && st.startSec < level.stages[i - 1].endSec) {
      push(`stages[${i}].startSec`, `Overlaps or precedes stages[${i - 1}].endSec (${level.stages[i - 1].endSec})`);
    }
    if (!isFinitePositive(st.spawnIntervalSec)) {
      push(`stages[${i}].spawnIntervalSec`, 'Must be > 0');
    }
    if (st.entries.length === 0) {
      push(`stages[${i}].entries`, 'Stage must have at least 1 enemy spawn entry');
    }
    for (const entry of st.entries) {
      if (!level.allowedEnemyIds.includes(entry.enemyId)) {
        push(`stages[${i}].entries`, `Enemy "${entry.enemyId}" not in allowedEnemyIds`);
      }
      if (!isFinitePositive(entry.weight)) {
        push(`stages[${i}].entries`, `Weight for "${entry.enemyId}" must be > 0`);
      }
    }
    if (st.eliteEnemyId && !level.allowedEnemyIds.includes(st.eliteEnemyId)) {
      push(`stages[${i}].eliteEnemyId`, `Elite "${st.eliteEnemyId}" not in allowedEnemyIds`);
    }
  }

  // Boss stage & victory objective trigger source
  if (!isFinitePositive(level.bossStage.triggerSec)) {
    push('bossStage.triggerSec', 'Must be > 0');
  }
  const bossDef = registries.enemies.get(level.bossStage.bossEnemyId);
  if (!bossDef) {
    push('bossStage.bossEnemyId', `Boss "${level.bossStage.bossEnemyId}" not registered`);
  } else if (!bossDef.isBoss) {
    push('bossStage.bossEnemyId', `Enemy "${level.bossStage.bossEnemyId}" must have isBoss=true`);
  }
  for (const rid of level.bossStage.reinforcementEnemyIds) {
    if (!level.allowedEnemyIds.includes(rid)) {
      push('bossStage.reinforcementEnemyIds', `Reinforcement "${rid}" not in allowedEnemyIds`);
    }
    if (!registries.enemies.has(rid)) {
      push('bossStage.reinforcementEnemyIds', `Reinforcement "${rid}" not registered`);
    }
  }

  if (!registries.objectiveBehaviorIds.has(level.victoryObjective.behaviorId)) {
    push(
      'victoryObjective.behaviorId',
      `Objective behavior "${level.victoryObjective.behaviorId}" not registered`
    );
  }

  // Entity budgets vs runtime pool capacities
  const caps = RUNTIME_CONFIG.defaultPoolCapacities;
  if (level.entityBudgets.maxEnemies > caps.enemies - caps.bossReservedSlots) {
    push(
      'entityBudgets.maxEnemies',
      `Exceeds normal enemy pool capacity (${caps.enemies - caps.bossReservedSlots})`
    );
  }
  if (level.entityBudgets.maxPlayerProjectiles > caps.playerProjectiles) {
    push('entityBudgets.maxPlayerProjectiles', `Exceeds pool capacity (${caps.playerProjectiles})`);
  }
  if (level.entityBudgets.maxEnemyProjectiles > caps.enemyProjectiles) {
    push('entityBudgets.maxEnemyProjectiles', `Exceeds pool capacity (${caps.enemyProjectiles})`);
  }
  if (level.entityBudgets.maxDrops > caps.drops) {
    push('entityBudgets.maxDrops', `Exceeds pool capacity (${caps.drops})`);
  }

  return issues;
}
