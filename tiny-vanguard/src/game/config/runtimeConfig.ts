export const RUNTIME_CONFIG = {
  fixedStepSec: 1 / 60,
  maxFrameDtSec: 0.1,
  maxSubStepsPerFrame: 5,
  hudUpdateIntervalSec: 0.12, // ~8.3 Hz
  playerInvulnSec: 0.45,
  maxPlayerSpeedMultiplier: 2.2,
  maxAttackSpeedMultiplier: 2.8,
  maxBonusProjectiles: 4,
  maxKnockbackImpulse: 12,
  sameFrameTerminalPriority: 'player-death-first' as const,
  farEnemyRecycleMargin: 18,
  defaultPoolCapacities: {
    enemies: 220,
    bossReservedSlots: 4,
    playerProjectiles: 320,
    enemyProjectiles: 140,
    drops: 260,
    vfx: 180,
    damageNumbers: 96,
  },
} as const;
