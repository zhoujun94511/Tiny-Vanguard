import type { DebuffId, EnemyRole } from '../content/definitions/ContentTypes';
import type { PoolItem } from '../pool/ObjectPool';

export type EnemyAiState =
  | 'chase'
  | 'telegraph'
  | 'dash'
  | 'recover'
  | 'windup'
  | 'boss-slam-telegraph'
  | 'boss-dash-telegraph';

export interface EnemyEntity extends PoolItem {
  defId: string;
  name: string;
  role: EnemyRole;
  behaviorId: string;
  isElite: boolean;
  isBoss: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  kbVx: number;
  kbVz: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  xpValue: number;
  baseColor: number;
  accentColor: number;
  scale: number;
  facingRad: number;
  hitFlashTimer: number;
  slowTimer: number;
  slowFactor: number;
  armorReduction: number;
  debuffTimers: Float32Array;
  debuffMoveMult: number;
  debuffDmgTakenMult: number;
  debuffEnemyDmgMult: number;
  debuffCritBonus: number;
  debuffTickTimer: number;
  lastOrbitHitSec: number;
  aiState: EnemyAiState;
  aiTimer: number;
  aiCooldown: number;
  dirX: number;
  dirZ: number;
  slamX: number;
  slamZ: number;
  slamRadius: number;
  bossPhaseToggle: number;
  bossPhase: number;
  bossShieldTimer: number;
}

export interface ProjectileEntity extends PoolItem {
  isEnemy: boolean;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  radius: number;
  damage: number;
  knockback: number;
  remainingLifeSec: number;
  pierceLeft: number;
  color: number;
  splitOnHit: boolean;
  isSplitChild: boolean;
  hitSlots: Int32Array;
  hitGens: Int32Array;
  hitCount: number;
}

export interface DropEntity extends PoolItem {
  x: number;
  z: number;
  xpValue: number;
  magnetized: boolean;
  color: number;
}

export interface VfxParticle extends PoolItem {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
  lifeSec: number;
  maxLifeSec: number;
  color: number;
}

export type VfxBeamKind = 'lightning' | 'laser' | 'dash-trail';

export interface VfxBeam extends PoolItem {
  kind: VfxBeamKind;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  width: number;
  color: number;
  lifeSec: number;
  maxLifeSec: number;
  seed: number;
}

export interface VfxShockwave extends PoolItem {
  /** 0 = frost jagged wave, 1 = solar fury supernova, 2 = electric/holy/supply pulse */
  style: 0 | 1 | 2;
  x: number;
  z: number;
  startRadius: number;
  maxRadius: number;
  color: number;
  lifeSec: number;
  maxLifeSec: number;
  hasPillar: boolean;
}

export interface SupplyCrateState {
  active: boolean;
  x: number;
  z: number;
  remainingSec: number;
  totalSec: number;
  healRatio: number;
  shockwaveRadius: number;
  shockwaveDamage: number;
}

export type BridgeGateRewardKind = string;

export interface BridgeBarrelState {
  active: boolean;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  radius: number;
}

export interface HazardZoneState {
  active: boolean;
  x: number;
  z: number;
  radius: number;
  telegraphSec: number;
  remainingSec: number;
  tickTimer: number;
}

export interface BridgeMeteorState {
  active: boolean;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  radius: number;
}

export interface BridgeGateState {
  active: boolean;
  x: number;
  z: number;
  halfWidth: number;
  hp: number;
  maxHp: number;
  gateMode: 'break' | 'charge';
  gateEffect: 'buff' | 'summon-drones' | 'blast-wave';
  corrupted: boolean;
  chargeTier: number;
  maxChargeTier: number;
  buffId: string;
  rewardKind: BridgeGateRewardKind;
  label: string;
  labelEn?: string;
}

export interface WeaponRuntimeState {
  weaponId: string;
  level: number;
  cooldownTimer: number;
  orbitAngle: number;
  echoTimer: number;
  echoPending: boolean;
  damageMult: number;
  cooldownMult: number;
  rangeMult: number;
  bonusCount: number;
  bonusPierce: number;
  mechanisms: Set<string>;
}

export interface DirectCombatModifiers {
  damageBonus: number;
  attackSpeedBonus: number;
  moveSpeedBonus: number;
  maxHpBonus: number;
  critChanceBonus: number;
  critDamageBonus: number;
  lifeOnKillBonus: number;
  dashCdReduction: number;
  furyGainBonus: number;
  pickupBonus: number;
  bossDamageBonus: number;
  bonusStarBlasterCount: number;
  bonusStarBlasterPierce: number;
  imbuedDebuffs: Set<DebuffId>;
}

export interface PlayerRuntimeState {
  x: number;
  z: number;
  facingRad: number;
  isMoving: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  baseSpeed: number;
  moveSpeedMult: number;
  damageMult: number;
  supplyDamageBonus: number;
  attackSpeedMult: number;
  critChance: number;
  critDamageMult: number;
  lifeOnKill: number;
  dashCooldownMult: number;
  furyGainMult: number;
  pickupRadius: number;
  pickupMult: number;
  colliderRadius: number;
  invulnTimer: number;
  hitFlashTimer: number;
  dashTimer: number;
  dashCooldown: number;
  guardCooldown: number;
  attackCooldown: number;
  bridgeDroneTimer: number;
  bridgeDronePower: number;
  bridgeDroneFireTimer: number;
  dashDirX: number;
  dashDirZ: number;
  furyCharge: number;
  xp: number;
  xpToNext: number;
  level: number;
  kills: number;
  weapons: WeaponRuntimeState[];
  upgradeLevels: Map<string, number>;
  equippedRelics: string[];
  directModifiers: DirectCombatModifiers;
  imbuedDebuffs: DebuffId[];
}

export interface DamagePopupSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  lifeSec: number;
  maxLifeSec: number;
  amount: number;
  isCritOrBig: boolean;
  isHeal: boolean;
}
export function createEmptyEnemy(slotIndex: number): EnemyEntity {
  return {
    slotIndex,
    active: false,
    generation: 1,
    defId: '',
    name: '',
    role: 'chaser',
    behaviorId: '',
    isElite: false,
    isBoss: false,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    kbVx: 0,
    kbVz: 0,
    hp: 1,
    maxHp: 1,
    speed: 1,
    damage: 1,
    radius: 0.5,
    xpValue: 1,
    baseColor: 0xffffff,
    accentColor: 0xffffff,
    scale: 1,
    facingRad: 0,
    hitFlashTimer: 0,
    slowTimer: 0,
    slowFactor: 1,
    armorReduction: 0,
    debuffTimers: new Float32Array(20),
    debuffMoveMult: 1,
    debuffDmgTakenMult: 1,
    debuffEnemyDmgMult: 1,
    debuffCritBonus: 0,
    debuffTickTimer: 0,
    lastOrbitHitSec: -999,
    aiState: 'chase',
    aiTimer: 0,
    aiCooldown: 0,
    dirX: 0,
    dirZ: 1,
    slamX: 0,
    slamZ: 0,
    slamRadius: 0,
    bossPhaseToggle: 0,
    bossPhase: 1,
    bossShieldTimer: 0,
  };
}

export function createEmptyProjectile(slotIndex: number): ProjectileEntity {
  return {
    slotIndex,
    active: false,
    generation: 1,
    isEnemy: false,
    x: 0,
    z: 0,
    prevX: 0,
    prevZ: 0,
    vx: 0,
    vz: 0,
    radius: 0.25,
    damage: 10,
    knockback: 0,
    remainingLifeSec: 1,
    pierceLeft: 1,
    color: 0xffffff,
    splitOnHit: false,
    isSplitChild: false,
    hitSlots: new Int32Array(8),
    hitGens: new Int32Array(8),
    hitCount: 0,
  };
}

export function createEmptyDrop(slotIndex: number): DropEntity {
  return {
    slotIndex,
    active: false,
    generation: 1,
    x: 0,
    z: 0,
    xpValue: 1,
    magnetized: false,
    color: 0x38bdf8,
  };
}

export function createEmptyVfx(slotIndex: number): VfxParticle {
  return {
    slotIndex,
    active: false,
    generation: 1,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    scale: 0.2,
    lifeSec: 0,
    maxLifeSec: 0.3,
    color: 0xffffff,
  };
}

export function createEmptyBeam(slotIndex: number): VfxBeam {
  return {
    slotIndex,
    active: false,
    generation: 1,
    kind: 'lightning',
    x0: 0,
    y0: 0.9,
    z0: 0,
    x1: 0,
    y1: 0.9,
    z1: 1,
    width: 0.35,
    color: 0x7dd3fc,
    lifeSec: 0,
    maxLifeSec: 0.2,
    seed: 0,
  };
}

export function createEmptyShockwave(slotIndex: number): VfxShockwave {
  return {
    slotIndex,
    active: false,
    generation: 1,
    style: 0,
    x: 0,
    z: 0,
    startRadius: 0.5,
    maxRadius: 5,
    color: 0x67e8f9,
    lifeSec: 0,
    maxLifeSec: 0.4,
    hasPillar: false,
  };
}
