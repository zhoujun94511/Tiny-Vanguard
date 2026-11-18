import type { QualityTier } from '../core/GameTypes';

export interface QualityProfile {
  tier: QualityTier;
  label: string;
  maxPixelRatio: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  maxVfxMultiplier: number;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: 'low',
    label: '省电 (低)',
    maxPixelRatio: 1.25,
    shadowsEnabled: false,
    shadowMapSize: 512,
    maxVfxMultiplier: 0.5,
  },
  medium: {
    tier: 'medium',
    label: '均衡 (中)',
    maxPixelRatio: 1.75,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    maxVfxMultiplier: 0.8,
  },
  high: {
    tier: 'high',
    label: '高清 (高)',
    maxPixelRatio: 2.0,
    shadowsEnabled: true,
    shadowMapSize: 1536,
    maxVfxMultiplier: 1.0,
  },
};
