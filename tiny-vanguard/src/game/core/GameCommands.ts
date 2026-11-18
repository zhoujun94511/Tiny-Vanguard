import type { LanguageCode, QualityTier } from './GameTypes';

export type GameCommand =
  | { type: 'loadLevel'; levelId: string }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'exitToMenu' }
  | { type: 'chooseUpgrade'; sessionId: number; requestId: number; upgradeId: string }
  | { type: 'triggerDash' }
  | { type: 'triggerGuard' }
  | { type: 'triggerFury' }
  | { type: 'setQuality'; quality: QualityTier }
  | { type: 'setAudioEnabled'; enabled: boolean }
  | { type: 'setBgmEnabled'; enabled: boolean }
  | { type: 'setShowDamageNumbers'; enabled: boolean }
  | { type: 'setLanguage'; language: LanguageCode };
