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
    maxVfxMultiplier: 0.65,
  },
  medium: {
    tier: 'medium',
    label: '均衡 (中)',
    maxPixelRatio: 1.75,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    maxVfxMultiplier: 0.85,
  },
  high: {
    tier: 'high',
    label: '高清 (高)',
    maxPixelRatio: 3.0,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    maxVfxMultiplier: 1.0,
  },
};

const LOW_TIER_MOBILE_GPU_RE =
  /Adreno\s*\(TM\)\s*(?:[345]\d\d|61\d)|Mali-[GT][45678]\d\b|PowerVR/i;

export function resolveEffectiveMaxDpr(tier: QualityTier, gpuRendererName?: string | null): number {
  const base = QUALITY_PROFILES[tier].maxPixelRatio;
  if (tier === 'high' && gpuRendererName && LOW_TIER_MOBILE_GPU_RE.test(gpuRendererName)) {
    return Math.min(base, 2.25);
  }
  return base;
}
