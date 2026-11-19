import type { ChallengeModifierId } from '../content/modifiers/modifiers';

export type GameStateId =
  | 'menu'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'level-up'
  | 'victory'
  | 'game-over'
  | 'error';

export type PauseReason = 'manual' | 'hidden' | 'level-up' | 'context-lost';

export type QualityTier = 'low' | 'medium' | 'high';

export type LanguageCode = 'zh' | 'en';

export interface WeaponSlotSnapshot {
  weaponId: string;
  name: string;
  level: number;
  cooldownRatio: number;
  isEvolved: boolean;
}

export interface BossHudSnapshot {
  bossId: string;
  name: string;
  hp: number;
  maxHp: number;
  phaseKey: 'slam' | 'dash' | 'shield' | 'enrage' | 'fight';
  phaseLabel: string;
}

export interface SupplyIndicatorSnapshot {
  active: boolean;
  remainingSec: number;
  totalSec: number;
  dirX: number;
  dirZ: number;
  distance: number;
  rewardLabel: string;
}

export interface HudSnapshot {
  sessionId: number;
  levelId: string;
  arenaShape: 'circle' | 'bridge';
  levelName: string;
  state: GameStateId;
  endlessMode: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  relicCount: number;
  relicIds: string[];
  xp: number;
  xpToNext: number;
  level: number;
  elapsedSec: number;
  stageId: string;
  stageLabel: string;
  stageProgress: number;
  kills: number;
  combo: number;
  comboTier: number;
  dashReadyRatio: number; // 1 = ready, 0..1 recharging
  guardReadyRatio: number; // 1 = ready, 0..1 recharging
  furyRatio: number; // 0..1 (1 = ready to cast)
  attackReadyRatio: number; // 1 = ready, 0..1 recharging
  weaponSlots: WeaponSlotSnapshot[];
  maxWeaponSlots: number;
  boss: BossHudSnapshot | null;
  supply: SupplyIndicatorSnapshot | null;
  activeEnemyCount: number;
}

export interface UpgradeChoiceView {
  upgradeId: string;
  name: string;
  description: string;
  category: 'weapon-unlock' | 'weapon-upgrade' | 'stat' | 'survival';
  currentLevel: number;
  nextLevel: number;
  maxLevel: number;
  currentEffectText: string;
  nextEffectText: string;
  badge: string;
}

export interface LevelUpRequest {
  sessionId: number;
  requestId: number;
  playerLevel: number;
  rerollsRemaining: number;
  choices: UpgradeChoiceView[];
}

export interface ResultSnapshot {
  sessionId: number;
  victory: boolean;
  levelId: string;
  levelName: string;
  nextLevelId: string | null;
  nextLevelName: string | null;
  elapsedSec: number;
  kills: number;
  playerLevel: number;
  weapons: WeaponSlotSnapshot[];
  relicIds: string[];
  newlyDiscoveredRelicIds: string[];
  isNewBestTime: boolean;
  isEndless: boolean;
  earnedStars: number;
  earnedShards: Record<string, number>;
  earnedGems: Record<string, number>;
  reason: string;
}

export interface GameSettings {
  quality: QualityTier;
  audioEnabled: boolean;
  bgmEnabled: boolean;
  showDamageNumbers: boolean;
  language: LanguageCode;
}

export interface SaveData {
  bestSurvivalSecByLevel: Record<string, number>;
  bestVictorySecByLevel: Record<string, number>;
  bestEndlessSecByLevel: Record<string, number>;
  victories: number;
  totalRuns: number;
  stars: number;
  totalStarsEarned: number;
  talents: Record<string, number>;
  selectedCharacterId: string;
  unlockedCharacters: string[];
  characterShards: Record<string, number>;
  characterStars: Record<string, number>;
  loadoutRelicIds: string[];
  loadoutSlotsUnlocked: number;
  relicRanks: Record<string, number>;
  gemInventory: Record<string, number>;
  relicSockets: Record<string, string | null>;
  relicEnchants: Record<string, string>;
  activeModifiers: ChallengeModifierId[];
  discoveredRelics: string[];
  discoveredEvolvedWeapons: string[];
  unlockedAchievements: string[];
  settings: GameSettings;
}
