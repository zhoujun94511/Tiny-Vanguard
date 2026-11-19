export type ChallengeModifierId = 'glass-cannon' | 'double-elites' | 'hyper-horde';

export interface ChallengeModifierDefinition {
  readonly id: ChallengeModifierId;
  readonly icon: string;
  readonly name: string;
  readonly nameEn: string;
  readonly desc: string;
  readonly descEn: string;
  readonly starBonusPct: number;
}

export const CHALLENGE_MODIFIERS: readonly ChallengeModifierDefinition[] = [
  {
    id: 'glass-cannon',
    icon: '💥',
    name: '玻璃大炮',
    nameEn: 'Glass Cannon',
    desc: '伤害 +55% · 生命上限 -35% · 星耀 +25%',
    descEn: 'DMG +55% · Max HP -35% · Stars +25%',
    starBonusPct: 25,
  },
  {
    id: 'double-elites',
    icon: '👹',
    name: '精英狂潮',
    nameEn: 'Elite Surge',
    desc: '精英刷新 -40% · 敌速 +12% · 星耀 +30%',
    descEn: 'Elite CD -40% · Enemy Spd +12% · Stars +30%',
    starBonusPct: 30,
  },
  {
    id: 'hyper-horde',
    icon: '🌊',
    name: '疾速虫海',
    nameEn: 'Hyper Horde',
    desc: '刷怪间隔 -25% · 经验 +20% · 星耀 +20%',
    descEn: 'Spawn -25% · XP +20% · Stars +20%',
    starBonusPct: 20,
  },
];

export const CHALLENGE_MODIFIER_MAP: ReadonlyMap<string, ChallengeModifierDefinition> = new Map(
  CHALLENGE_MODIFIERS.map((m) => [m.id, m])
);
