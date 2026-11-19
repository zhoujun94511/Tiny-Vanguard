import type { DirectCombatModifiers } from '../../session/SessionEntities';

export type GemTypeId = 'ruby' | 'emerald' | 'sapphire' | 'topaz';
export type GemTier = 1 | 2 | 3;

export interface GemDefinition {
  readonly id: GemTypeId;
  readonly icon: string;
  readonly name: string;
  readonly nameEn: string;
  readonly statKey: keyof Pick<
    DirectCombatModifiers,
    'damageBonus' | 'critChanceBonus' | 'maxHpBonus' | 'moveSpeedBonus'
  >;
  readonly valuesByTier: readonly [number, number, number];
  readonly unit: '%' | 'HP';
  readonly displayScale: number;
}

export const GEMS: readonly GemDefinition[] = [
  {
    id: 'ruby',
    icon: '🔴',
    name: '红宝石',
    nameEn: 'Ruby',
    statKey: 'damageBonus',
    valuesByTier: [0.04, 0.08, 0.14],
    unit: '%',
    displayScale: 100,
  },
  {
    id: 'emerald',
    icon: '🟢',
    name: '翡翠',
    nameEn: 'Emerald',
    statKey: 'critChanceBonus',
    valuesByTier: [0.03, 0.06, 0.1],
    unit: '%',
    displayScale: 100,
  },
  {
    id: 'sapphire',
    icon: '🔵',
    name: '蓝宝石',
    nameEn: 'Sapphire',
    statKey: 'maxHpBonus',
    valuesByTier: [20, 42, 75],
    unit: 'HP',
    displayScale: 1,
  },
  {
    id: 'topaz',
    icon: '🟡',
    name: '黄玉',
    nameEn: 'Topaz',
    statKey: 'moveSpeedBonus',
    valuesByTier: [0.04, 0.08, 0.13],
    unit: '%',
    displayScale: 100,
  },
];

export const GEM_MAP: ReadonlyMap<GemTypeId, GemDefinition> = new Map(
  GEMS.map((g) => [g.id, g])
);

export const MAX_RELIC_RANK = 5;
export const RELIC_SOCKET_COST = 15;

export function getRelicRefineCost(currentRank: number): number {
  return (Math.max(0, Math.floor(currentRank)) + 1) * 8;
}

export function makeGemKey(type: GemTypeId, tier: GemTier): string {
  return `${type}:${tier}`;
}

export function parseGemKey(key: string | null | undefined): { type: GemTypeId; tier: GemTier } | null {
  if (typeof key !== 'string') return null;
  const parts = key.split(':');
  if (parts.length !== 2) return null;
  const type = parts[0] as GemTypeId;
  const tierNum = Number(parts[1]);
  if (!GEM_MAP.has(type) || (tierNum !== 1 && tierNum !== 2 && tierNum !== 3)) {
    return null;
  }
  return { type, tier: tierNum };
}

export function getGemStatValue(type: GemTypeId, tier: GemTier): number {
  const def = GEM_MAP.get(type);
  if (!def) return 0;
  return def.valuesByTier[tier - 1] ?? 0;
}
