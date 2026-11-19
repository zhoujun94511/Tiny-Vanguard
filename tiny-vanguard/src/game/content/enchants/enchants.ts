import type { DirectCombatModifiers } from '../../session/SessionEntities';

export type EnchantId =
  | 'ferocity'
  | 'keen'
  | 'fortitude'
  | 'alacrity'
  | 'executioner'
  | 'leech';

export interface EnchantDefinition {
  readonly id: EnchantId;
  readonly icon: string;
  readonly name: string;
  readonly nameEn: string;
  readonly desc: string;
  readonly descEn: string;
  readonly statKey: keyof Pick<
    DirectCombatModifiers,
    | 'damageBonus'
    | 'critChanceBonus'
    | 'maxHpBonus'
    | 'attackSpeedBonus'
    | 'bossDamageBonus'
    | 'lifeOnKillBonus'
  >;
  readonly value: number;
}

export const ENCHANTS: readonly EnchantDefinition[] = [
  {
    id: 'ferocity',
    icon: '🔥',
    name: '狂暴附魔',
    nameEn: 'Ferocity',
    desc: '伤害 +6%',
    descEn: 'DMG +6%',
    statKey: 'damageBonus',
    value: 0.06,
  },
  {
    id: 'keen',
    icon: '🎯',
    name: '锐利附魔',
    nameEn: 'Keen',
    desc: '暴击 +5%',
    descEn: 'Crit +5%',
    statKey: 'critChanceBonus',
    value: 0.05,
  },
  {
    id: 'fortitude',
    icon: '🛡️',
    name: '坚韧附魔',
    nameEn: 'Fortitude',
    desc: '生命 +25',
    descEn: 'Max HP +25',
    statKey: 'maxHpBonus',
    value: 25,
  },
  {
    id: 'alacrity',
    icon: '⚡',
    name: '迅捷附魔',
    nameEn: 'Alacrity',
    desc: '攻速 +5%',
    descEn: 'ATK SPD +5%',
    statKey: 'attackSpeedBonus',
    value: 0.05,
  },
  {
    id: 'executioner',
    icon: '👑',
    name: '弑王附魔',
    nameEn: 'Regicide',
    desc: '首领伤害 +10%',
    descEn: 'Boss DMG +10%',
    statKey: 'bossDamageBonus',
    value: 0.1,
  },
  {
    id: 'leech',
    icon: '🩸',
    name: '汲取附魔',
    nameEn: 'Leech',
    desc: '击杀回血 +1%',
    descEn: 'Kill Heal +1%',
    statKey: 'lifeOnKillBonus',
    value: 0.01,
  },
];

export const ENCHANT_MAP: ReadonlyMap<EnchantId, EnchantDefinition> = new Map(
  ENCHANTS.map((e) => [e.id, e])
);

export const RELIC_ENCHANT_COST = 12;

export function parseEnchantId(raw: unknown): EnchantId | null {
  if (typeof raw !== 'string') return null;
  return ENCHANT_MAP.has(raw as EnchantId) ? (raw as EnchantId) : null;
}
