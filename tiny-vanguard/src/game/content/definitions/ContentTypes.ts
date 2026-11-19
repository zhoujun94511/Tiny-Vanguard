export interface CharacterDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly baseHp: number;
  readonly baseSpeed: number;
  readonly pickupRadius: number;
  readonly colliderRadius: number;
  readonly startingWeaponId: string;
  readonly primaryColor: number;
  readonly accentColor: number;
}

export type WeaponMechanism = 'projectile' | 'orbit' | 'nova' | 'chain' | 'sniper';

export interface WeaponDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly mechanism: WeaponMechanism;
  readonly behaviorId: string;
  readonly baseDamage: number;
  readonly cooldownSec: number;
  readonly range: number;
  readonly projectileSpeed: number;
  readonly projectileRadius: number;
  readonly projectileLifetimeSec: number;
  readonly count: number;
  readonly spreadRad: number;
  readonly pierce: number;
  readonly knockback: number;
  readonly contactIntervalSec: number;
  readonly color: number;
  readonly params?: Readonly<Record<string, number | boolean | string>>;
}

export type EnemyRole = 'chaser' | 'charger' | 'ranged' | 'elite' | 'boss';

export interface EnemyDefinition {
  readonly id: string;
  readonly name: string;
  readonly role: EnemyRole;
  readonly behaviorId: string;
  readonly isElite: boolean;
  readonly isBoss: boolean;
  readonly maxHp: number;
  readonly speed: number;
  readonly damage: number;
  readonly radius: number;
  readonly xpValue: number;
  readonly color: number;
  readonly accentColor: number;
  readonly scale: number;
  readonly params?: Readonly<Record<string, number | boolean | string>>;
}

export type DebuffId =
  | 'frost-chill'
  | 'deep-freeze'
  | 'burn-ember'
  | 'hellfire-burn'
  | 'venom-poison'
  | 'armor-shred'
  | 'heavy-sunder'
  | 'shock-static'
  | 'stagger-stun'
  | 'weaken-curse'
  | 'bleed-lacerate'
  | 'mark-exposed'
  | 'gravity-snare'
  | 'holy-brand'
  | 'frostbite-brittle'
  | 'scorch-blind'
  | 'plague-spread'
  | 'cripple-hamstring'
  | 'arcane-silence'
  | 'execute-doom';

export interface DebuffDefinition {
  readonly id: DebuffId;
  readonly index: number;
  readonly name: string;
  readonly nameEn: string;
  readonly durationSec: number;
  readonly moveSpeedMult: number;
  readonly damageTakenMult: number;
  readonly enemyDamageMult: number;
  readonly dotDps: number;
  readonly critBonusTaken: number;
  readonly color: number;
  readonly special?: 'bleed-move' | 'holy-death-blast' | 'plague-spread' | 'execute-low-hp' | 'chain-shock' | 'slow-windup';
}

export type UpgradeCategory = 'weapon-unlock' | 'weapon-upgrade' | 'stat' | 'survival';

export interface UpgradeEffect {
  readonly kind:
    | 'unlock-weapon'
    | 'weapon-damage-pct'
    | 'weapon-cooldown-pct'
    | 'weapon-count-add'
    | 'weapon-pierce-add'
    | 'weapon-range-pct'
    | 'weapon-mechanism'
    | 'player-damage-pct'
    | 'player-attack-speed-pct'
    | 'player-move-speed-pct'
    | 'player-max-hp-add'
    | 'player-regen-add'
    | 'player-pickup-pct'
    | 'player-heal-pct'
    | 'player-crit-add'
    | 'player-crit-dmg-add'
    | 'player-life-on-kill-add'
    | 'player-dash-cd-pct'
    | 'player-fury-gain-pct'
    | 'player-shield-add'
    | 'player-imbue-debuff';
  readonly value: number;
  readonly weaponId?: string;
  readonly mechanismFlag?: string;
  readonly debuffId?: DebuffId;
}

export interface UpgradeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: UpgradeCategory;
  readonly maxLevel: number;
  readonly weaponId?: string;
  readonly prerequisites?: readonly string[];
  readonly effects: readonly UpgradeEffect[];
}

export interface BuffDefinition {
  readonly id: string;
  readonly name: string;
  readonly nameEn: string;
  readonly shortLabel: string;
  readonly shortLabelEn: string;
  readonly effects: readonly UpgradeEffect[];
}

export interface EquipmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly nameEn: string;
  readonly description: string;
  readonly descriptionEn: string;
  readonly tier: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  readonly effects: readonly UpgradeEffect[];
}

export interface WaveSpawnEntry {
  readonly enemyId: string;
  readonly weight: number;
  readonly minStageSec?: number;
}

export type WaveFormationKind =
  | 'ring-surround'
  | 'lane-phalanx'
  | 'side-stampede'
  | 'elite-escort';

export interface LevelStageConfig {
  readonly id: string;
  readonly label: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly spawnIntervalSec: number;
  readonly spawnBatchMin: number;
  readonly spawnBatchMax: number;
  readonly minConcurrentNormal?: number;
  readonly maxConcurrentNormal: number;
  readonly hpMultiplier: number;
  readonly speedMultiplier: number;
  readonly eliteIntervalSec?: number;
  readonly eliteEnemyId?: string;
  readonly formationIntervalSec?: number;
  readonly formationKind?: WaveFormationKind;
  readonly entries: readonly WaveSpawnEntry[];
}

export interface SupplyEventConfig {
  readonly enabled: boolean;
  readonly firstDelaySec: number;
  readonly intervalSec: number;
  readonly durationSec: number;
  readonly maxActive: number;
  readonly minSpawnDist: number;
  readonly maxSpawnDist: number;
  readonly healRatio: number;
  readonly shockwaveRadius: number;
  readonly shockwaveDamage: number;
}

export interface ObstacleConfig {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  readonly color: number;
}

export interface BridgeConfig {
  readonly halfWidth: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly defenseLineZ: number;
  readonly waterColor: number;
  readonly plankColor: number;
  readonly plankAltColor?: number;
  readonly railColor: number;
  readonly lanternColor?: number;
}

export type GameModeKey = 'survival' | 'defense';

export interface LevelDefinition {
  readonly id: string;
  readonly configVersion: number;
  readonly modeGroup?: GameModeKey;
  readonly stageOrder?: number;
  readonly name: string;
  readonly description: string;
  readonly arenaShape?: 'circle' | 'bridge';
  readonly bridgeConfig?: BridgeConfig;
  readonly cameraLocked?: boolean;
  readonly arenaRadius: number;
  readonly groundColor: number;
  readonly gridColor: number;
  readonly pathColor?: number;
  readonly fogColor: number;
  readonly camera: {
    readonly fov: number;
    readonly height: number;
    readonly distance: number;
    readonly minVisibleWidth: number;
    readonly minVisibleDepth: number;
  };
  readonly playerSpawn: { readonly x: number; readonly z: number };
  readonly characterId: string;
  readonly weaponSlotCount: number;
  readonly allowedWeaponIds: readonly string[];
  readonly allowedEnemyIds: readonly string[];
  readonly upgradePoolIds: readonly string[];
  readonly xpCurve: {
    readonly base: number;
    readonly growth: number;
    readonly exponent: number;
  };
  readonly stages: readonly LevelStageConfig[];
  readonly bossStage: {
    readonly triggerSec: number;
    readonly bossEnemyId: string;
    readonly label: string;
    readonly reinforcementIntervalSec: number;
    readonly maxReinforcements: number;
    readonly reinforcementEnemyIds: readonly string[];
  };
  readonly supplyEvents: SupplyEventConfig;
  readonly victoryObjective: {
    readonly behaviorId: string;
    readonly params?: Readonly<Record<string, number | boolean | string>>;
  };
  readonly entityBudgets: {
    readonly maxEnemies: number;
    readonly maxPlayerProjectiles: number;
    readonly maxEnemyProjectiles: number;
    readonly maxDrops: number;
    readonly maxVfx: number;
  };
  readonly obstacles: readonly ObstacleConfig[];
  readonly bridgeBarrels?: boolean;
  readonly hazardZones?: boolean;
  readonly movingGates?: boolean;
  readonly bridgeMeteors?: boolean;
  readonly seed?: number;
  readonly visibleInMenu: boolean;
}
