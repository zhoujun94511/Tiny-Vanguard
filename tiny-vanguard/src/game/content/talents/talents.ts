export type TalentId =
  | 'might'
  | 'vitality'
  | 'haste'
  | 'swiftness'
  | 'magnet'
  | 'greed'
  | 'dice'
  | 'bossSlayer';

export interface TalentDefinition {
  readonly id: TalentId;
  readonly icon: string;
  readonly name: string;
  readonly nameEn: string;
  readonly desc: string;
  readonly descEn: string;
  readonly maxLevel: number;
  readonly baseCost: number;
  readonly costStep: number;
  readonly bonusPerLevel: number;
  readonly unit: '%' | 'HP' | '';
}

export const TALENTS: readonly TalentDefinition[] = [
  {
    id: 'might',
    icon: '⚔️',
    name: '星耀锋芒',
    nameEn: 'Vanguard Might',
    desc: '每级永久提升 +6% 全局伤害',
    descEn: '+6% global damage per rank',
    maxLevel: 5,
    baseCost: 12,
    costStep: 10,
    bonusPerLevel: 6,
    unit: '%',
  },
  {
    id: 'vitality',
    icon: '🛡️',
    name: '圣盾体魄',
    nameEn: 'Bastion Vitality',
    desc: '每级永久提升 +18 最大生命值',
    descEn: '+18 max HP per rank',
    maxLevel: 5,
    baseCost: 10,
    costStep: 8,
    bonusPerLevel: 18,
    unit: 'HP',
  },
  {
    id: 'swiftness',
    icon: '⚡',
    name: '迅捷装填',
    nameEn: 'Rapid Trigger',
    desc: '每级永久提升 +5% 攻击速度',
    descEn: '+5% attack speed per rank',
    maxLevel: 5,
    baseCost: 12,
    costStep: 10,
    bonusPerLevel: 5,
    unit: '%',
  },
  {
    id: 'haste',
    icon: '🥾',
    name: '疾风战靴',
    nameEn: 'Wind Stride',
    desc: '每级永久提升 +4% 移动速度',
    descEn: '+4% move speed per rank',
    maxLevel: 5,
    baseCost: 10,
    costStep: 8,
    bonusPerLevel: 4,
    unit: '%',
  },
  {
    id: 'magnet',
    icon: '🧲',
    name: '星核引力',
    nameEn: 'Core Magnet',
    desc: '每级永久提升 +12% 经验拾取范围',
    descEn: '+12% XP pickup radius per rank',
    maxLevel: 5,
    baseCost: 8,
    costStep: 8,
    bonusPerLevel: 12,
    unit: '%',
  },
  {
    id: 'greed',
    icon: '⭐',
    name: '星耀掠夺',
    nameEn: 'Star Plunder',
    desc: '每级额外提升 +15% 结算星耀徽记获取',
    descEn: '+15% Star Medals earned per rank',
    maxLevel: 5,
    baseCost: 14,
    costStep: 12,
    bonusPerLevel: 15,
    unit: '%',
  },
  {
    id: 'dice',
    icon: '🎲',
    name: '命运骰子',
    nameEn: 'Fate Dice',
    desc: '每级开局升级重随次数 +1',
    descEn: '+1 Starting Upgrade Reroll per rank',
    maxLevel: 3,
    baseCost: 16,
    costStep: 14,
    bonusPerLevel: 1,
    unit: '',
  },
  {
    id: 'bossSlayer',
    icon: '💀',
    name: '弑王锋芒',
    nameEn: 'Titan Slayer',
    desc: '每级对精英与首领伤害 +8%',
    descEn: '+8% DMG vs Elites & Bosses per rank',
    maxLevel: 5,
    baseCost: 14,
    costStep: 12,
    bonusPerLevel: 8,
    unit: '%',
  },
];

export const TALENT_MAP: ReadonlyMap<string, TalentDefinition> = new Map(
  TALENTS.map((t) => [t.id, t])
);

export function getTalentUpgradeCost(def: TalentDefinition, currentLevel: number): number {
  return def.baseCost + currentLevel * def.costStep;
}

export function getTalentTotalInvested(talents: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const def of TALENTS) {
    const lvl = Math.max(0, Math.min(def.maxLevel, Math.floor(talents[def.id] ?? 0)));
    for (let i = 0; i < lvl; i += 1) {
      total += getTalentUpgradeCost(def, i);
    }
  }
  return total;
}
