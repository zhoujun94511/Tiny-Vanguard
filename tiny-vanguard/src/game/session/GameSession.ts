import { RUNTIME_CONFIG } from '../config/runtimeConfig';
import type { CharacterDefinition, LevelDefinition } from '../content/definitions/ContentTypes';
import type { ContentRegistries } from '../content/registries/ContentRegistry';
import type { LanguageCode, UpgradeChoiceView } from '../core/GameTypes';
import { SeededRandom } from '../core/SeededRandom';
import { ObjectPool } from '../pool/ObjectPool';
import { SpatialGrid } from '../spatial/SpatialGrid';
import {
  createEmptyBeam,
  createEmptyDrop,
  createEmptyEnemy,
  createEmptyProjectile,
  createEmptyShockwave,
  createEmptyVfx,
  type DropEntity,
  type EnemyEntity,
  type PlayerRuntimeState,
  type ProjectileEntity,
  type SupplyCrateState,
  type VfxBeam,
  type VfxBeamKind,
  type VfxParticle,
  type VfxShockwave,
  type WeaponRuntimeState,
  type BridgeGateState,
  type DamagePopupSlot,
  type BridgeGateRewardKind,
} from './SessionEntities';

export class GameSession {
  public readonly sessionId: number;
  public readonly level: LevelDefinition;
  public readonly character: CharacterDefinition;
  public readonly registries: ContentRegistries;
  public readonly rng: SeededRandom;

  public readonly enemies: ObjectPool<EnemyEntity>;
  public readonly playerProjectiles: ObjectPool<ProjectileEntity>;
  public readonly enemyProjectiles: ObjectPool<ProjectileEntity>;
  public readonly drops: ObjectPool<DropEntity>;
  public readonly vfx: ObjectPool<VfxParticle>;
  public readonly beams: ObjectPool<VfxBeam>;
  public readonly shockwaves: ObjectPool<VfxShockwave>;
  public readonly enemyGrid: SpatialGrid;

  public readonly player: PlayerRuntimeState;
  public readonly supply: SupplyCrateState;
  public readonly bridgeGates: [BridgeGateState, BridgeGateState];
  public readonly damagePopups: DamagePopupSlot[];
  private damagePopupCursor = 0;

  public elapsedSec = 0;
  public language: LanguageCode = 'zh';
  public godMode = false;
  public combo = 0;
  public comboTier = 0;
  public bridgeGateTimer = 10;
  public currentStageIndex = 0;
  public spawnTimer = 0;
  public eliteTimer = 0;
  public formationTimer = 28;
  public supplySpawnTimer = 0;
  public bossSpawned = false;
  public bossKilled = false;
  public bossReinforceTimer = 0;
  public bossSlot = -1;
  public bossGen = 0;

  public pendingLevelUps = 0;
  public upgradeRequestSeq = 0;
  public activeUpgradeRequestId = 0;
  public activeUpgradeChoices: UpgradeChoiceView[] = [];

  // Reusable scratch array for SpatialGrid queries
  public readonly queryScratch: number[] = [];

  constructor(
    sessionId: number,
    level: LevelDefinition,
    registries: ContentRegistries
  ) {
    this.sessionId = sessionId;
    this.level = level;
    this.registries = registries;
    this.character = registries.characters.getOrThrow(level.characterId, 'Character');
    this.rng = new SeededRandom(level.seed ?? (Date.now() ^ sessionId));

    const caps = RUNTIME_CONFIG.defaultPoolCapacities;
    this.enemies = new ObjectPool(caps.enemies, createEmptyEnemy, caps.bossReservedSlots);
    this.playerProjectiles = new ObjectPool(caps.playerProjectiles, createEmptyProjectile);
    this.enemyProjectiles = new ObjectPool(caps.enemyProjectiles, createEmptyProjectile);
    this.drops = new ObjectPool(caps.drops, createEmptyDrop);
    this.vfx = new ObjectPool(caps.vfx, createEmptyVfx);
    this.beams = new ObjectPool(36, createEmptyBeam);
    this.shockwaves = new ObjectPool(16, createEmptyShockwave);
    this.enemyGrid = new SpatialGrid(level.arenaRadius + 16, 2.5, caps.enemies);

    const startWeapon = this.createWeaponState(this.character.startingWeaponId);
    const baseXp = this.computeXpToNext(1);

    this.player = {
      x: level.playerSpawn.x,
      z: level.playerSpawn.z,
      facingRad: level.arenaShape === 'bridge' ? Math.PI : 0,
      isMoving: false,
      hp: this.character.baseHp,
      maxHp: this.character.baseHp,
      shield: 0,
      maxShield: 0,
      baseSpeed: this.character.baseSpeed,
      moveSpeedMult: 1,
      damageMult: 1,
      supplyDamageBonus: 0,
      attackSpeedMult: 1,
      critChance: 0.08,
      critDamageMult: 1.65,
      lifeOnKill: 0,
      dashCooldownMult: 1,
      furyGainMult: 1,
      pickupRadius: this.character.pickupRadius,
      pickupMult: 1,
      colliderRadius: this.character.colliderRadius,
      invulnTimer: 0,
      hitFlashTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      guardCooldown: 0,
      dashDirX: 0,
      dashDirZ: -1,
      furyCharge: 0,
      xp: 0,
      xpToNext: baseXp,
      level: 1,
      kills: 0,
      weapons: [startWeapon],
      upgradeLevels: new Map(),
      equippedRelics: [],
      directModifiers: {
        damageBonus: 0,
        attackSpeedBonus: 0,
        moveSpeedBonus: 0,
        maxHpBonus: 0,
        critChanceBonus: 0,
        critDamageBonus: 0,
        lifeOnKillBonus: 0,
        dashCdReduction: 0,
        furyGainBonus: 0,
        pickupBonus: 0,
        bonusStarBlasterCount: 0,
        bonusStarBlasterPierce: 0,
        imbuedDebuffs: new Set(),
      },
      imbuedDebuffs: [],
    };

    this.supply = {
      active: false,
      x: 0,
      z: 0,
      remainingSec: 0,
      totalSec: level.supplyEvents.durationSec,
      healRatio: level.supplyEvents.healRatio,
      shockwaveRadius: level.supplyEvents.shockwaveRadius,
      shockwaveDamage: level.supplyEvents.shockwaveDamage,
    };

    this.bridgeGates = [
      { active: false, x: -2.45, z: -20, halfWidth: 2.1, hp: 60, maxHp: 60, gateMode: 'break', corrupted: false, chargeTier: 1, maxChargeTier: 1, buffId: 'buff-dmg-25', rewardKind: 'buff-dmg-25', label: '+25% 伤害', labelEn: '+25% DMG' },
      { active: false, x: 2.45, z: -20, halfWidth: 2.1, hp: 60, maxHp: 60, gateMode: 'charge', corrupted: false, chargeTier: 1, maxChargeTier: 3, buffId: 'buff-rate-20', rewardKind: 'buff-rate-20', label: '+20% 攻速', labelEn: '+20% SPD' },
    ];

    this.damagePopups = Array.from({ length: 48 }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      lifeSec: 0,
      maxLifeSec: 0.55,
      amount: 0,
      isCritOrBig: false,
      isHeal: false,
    }));

    this.supplySpawnTimer = level.supplyEvents.enabled ? level.supplyEvents.firstDelaySec : 999999;
    this.eliteTimer = level.stages[0]?.eliteIntervalSec ?? 45;
    this.formationTimer = level.stages[0]?.formationIntervalSec ?? 28;
  }

  public createWeaponState(weaponId: string): WeaponRuntimeState {
    return {
      weaponId,
      level: 1,
      cooldownTimer: 0.15,
      orbitAngle: 0,
      echoTimer: 0,
      echoPending: false,
      damageMult: 1,
      cooldownMult: 1,
      rangeMult: 1,
      bonusCount: 0,
      bonusPierce: 0,
      mechanisms: new Set(),
    };
  }

  public computeXpToNext(level: number): number {
    const { base, growth, exponent } = this.level.xpCurve;
    return Math.round(base * Math.pow(growth, Math.pow(level - 1, exponent)));
  }

  public spawnVfxBurst(x: number, y: number, z: number, color: number, count = 5): void {
    for (let i = 0; i < count; i += 1) {
      const p = this.vfx.acquire();
      if (!p) break;
      const ang = this.rng.range(0, Math.PI * 2);
      const spd = this.rng.range(1.5, 4.5);
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(ang) * spd;
      p.vy = this.rng.range(1.8, 4.2);
      p.vz = Math.sin(ang) * spd;
      p.scale = this.rng.range(0.18, 0.34);
      p.maxLifeSec = this.rng.range(0.22, 0.4);
      p.lifeSec = p.maxLifeSec;
      p.color = color;
    }
  }

  public spawnBeam(
    kind: VfxBeamKind,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    width: number,
    color: number,
    lifeSec = 0.2
  ): void {
    const b = this.beams.acquire();
    if (!b) return;
    b.kind = kind;
    b.x0 = x0;
    b.y0 = y0;
    b.z0 = z0;
    b.x1 = x1;
    b.y1 = y1;
    b.z1 = z1;
    b.width = width;
    b.color = color;
    b.lifeSec = lifeSec;
    b.maxLifeSec = lifeSec;
    b.seed = this.rng.next() * 100;
  }

  public spawnShockwave(
    style: 0 | 1 | 2,
    x: number,
    z: number,
    startRadius: number,
    maxRadius: number,
    color: number,
    lifeSec = 0.42,
    hasPillar = false
  ): void {
    const sw = this.shockwaves.acquire();
    if (!sw) return;
    sw.style = style;
    sw.x = x;
    sw.z = z;
    sw.startRadius = startRadius;
    sw.maxRadius = maxRadius;
    sw.color = color;
    sw.lifeSec = lifeSec;
    sw.maxLifeSec = lifeSec;
    sw.hasPillar = hasPillar;
  }

  public spawnDamagePopup(
    x: number,
    y: number,
    z: number,
    amount: number,
    isCritOrBig = false,
    isHeal = false
  ): void {
    const slot = this.damagePopups[this.damagePopupCursor];
    this.damagePopupCursor = (this.damagePopupCursor + 1) % this.damagePopups.length;
    slot.active = true;
    slot.x = x + (this.rng.next() - 0.5) * 0.45;
    slot.y = y;
    slot.z = z;
    slot.vy = 2.2;
    slot.maxLifeSec = 0.55;
    slot.lifeSec = 0.55;
    slot.amount = Math.round(amount);
    slot.isCritOrBig = isCritOrBig;
    slot.isHeal = isHeal;
  }

  public dispose(): void {
    for (const dp of this.damagePopups) dp.active = false;
    this.enemies.releaseAll();
    this.playerProjectiles.releaseAll();
    this.enemyProjectiles.releaseAll();
    this.drops.releaseAll();
    this.vfx.releaseAll();
    this.beams.releaseAll();
    this.shockwaves.releaseAll();
    this.enemyGrid.clear();
  }
}
