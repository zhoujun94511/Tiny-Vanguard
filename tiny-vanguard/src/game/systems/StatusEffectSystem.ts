import { DEBUFF_BY_ID, DEBUFF_DEFS } from '../content/effects/debuffs';
import type { DebuffId } from '../content/definitions/ContentTypes';
import type { EnemyEntity } from '../session/SessionEntities';
import type { GameSession } from '../session/GameSession';

export interface EnemyStatusTickResult {
  dotDamage: number;
  hasSlowWindup: boolean;
}

export class StatusEffectSystem {
  // Reusable scratch result to eliminate ~4,800 per-second object allocations in hot enemy loops
  private readonly tickResult: EnemyStatusTickResult = {
    dotDamage: 0,
    hasSlowWindup: false,
  };

  public applyDebuff(enemy: EnemyEntity, debuffId: DebuffId): void {
    const def = DEBUFF_BY_ID[debuffId];
    if (!def) return;
    if (enemy.debuffTimers[def.index] < def.durationSec) {
      enemy.debuffTimers[def.index] = def.durationSec;
    }
  }

  public clearEnemyStatuses(enemy: EnemyEntity): void {
    enemy.debuffTimers.fill(0);
    enemy.debuffMoveMult = 1;
    enemy.debuffDmgTakenMult = 1;
    enemy.debuffEnemyDmgMult = 1;
    enemy.debuffCritBonus = 0;
    enemy.debuffTickTimer = 0;
  }

  /**
   * Ticks all 20 debuff slots on an enemy with zero allocations and returns reusable tick result.
   */
  public updateEnemyStatuses(
    session: GameSession,
    enemy: EnemyEntity,
    dt: number
  ): Readonly<EnemyStatusTickResult> {
    let moveMult = 1;
    let dmgTakenMult = 1;
    let enemyDmgMult = 1;
    let critBonus = 0;
    let totalDps = 0;
    let hasSlowWindup = false;

    const timers = enemy.debuffTimers;
    for (let i = 0; i < DEBUFF_DEFS.length; i += 1) {
      const rem = timers[i];
      if (rem <= 0) continue;
      timers[i] = Math.max(0, rem - dt);

      const def = DEBUFF_DEFS[i];
      if (def.moveSpeedMult < moveMult) moveMult = def.moveSpeedMult;
      dmgTakenMult *= def.damageTakenMult;
      if (def.enemyDamageMult < enemyDmgMult) enemyDmgMult = def.enemyDamageMult;
      critBonus += def.critBonusTaken;
      totalDps += def.dotDps;

      if (def.special === 'slow-windup') {
        hasSlowWindup = true;
      } else if (def.special === 'execute-low-hp' && enemy.hp <= enemy.maxHp * 0.25) {
        dmgTakenMult *= enemy.isBoss ? 1.15 : 1.45;
      } else if (def.special === 'bleed-move' && enemy.vx * enemy.vx + enemy.vz * enemy.vz > 0.5) {
        totalDps += 8;
      }
    }

    const moveFloor = enemy.isBoss
      ? session.level.arenaShape === 'bridge'
        ? 0.38
        : 0.55
      : 0.05;
    enemy.debuffMoveMult = Math.max(moveFloor, moveMult);
    enemy.debuffDmgTakenMult = Math.min(enemy.isBoss ? 1.45 : 2.6, dmgTakenMult);
    enemy.debuffEnemyDmgMult = Math.max(0.4, enemyDmgMult);
    enemy.debuffCritBonus = Math.min(enemy.isBoss ? 0.25 : 0.6, critBonus);

    let dotDamage = 0;
    if (totalDps > 0) {
      enemy.debuffTickTimer += dt;
      if (enemy.debuffTickTimer >= 0.5) {
        dotDamage = totalDps * enemy.debuffTickTimer;
        enemy.debuffTickTimer = 0;
        if (timers[7] > 0) {
          // shock-static small spark VFX
          session.spawnVfxBurst(enemy.x, 0.7, enemy.z, 0x60a5fa, 2);
        }
      }
    } else {
      enemy.debuffTickTimer = 0;
    }

    this.tickResult.dotDamage = dotDamage;
    this.tickResult.hasSlowWindup = hasSlowWindup;
    return this.tickResult;
  }
}
