import type { DebuffDefinition, DebuffId } from '../definitions/ContentTypes';

export const DEBUFF_DEFS: readonly DebuffDefinition[] = [
  { id: 'frost-chill', index: 0, name: '冰霜减速', nameEn: 'Frost Chill', durationSec: 2.2, moveSpeedMult: 0.65, damageTakenMult: 1, enemyDamageMult: 1, dotDps: 0, critBonusTaken: 0, color: 0x74b9ff },
  { id: 'deep-freeze', index: 1, name: '极寒冻结', nameEn: 'Deep Freeze', durationSec: 1.2, moveSpeedMult: 0.2, damageTakenMult: 1.1, enemyDamageMult: 0.85, dotDps: 4, critBonusTaken: 0.1, color: 0x38bdf8 },
  { id: 'burn-ember', index: 2, name: '余烬灼烧', nameEn: 'Ember Burn', durationSec: 3.0, moveSpeedMult: 1, damageTakenMult: 1, enemyDamageMult: 1, dotDps: 9, critBonusTaken: 0, color: 0xf97316 },
  { id: 'hellfire-burn', index: 3, name: '烈焰焚身', nameEn: 'Hellfire', durationSec: 3.5, moveSpeedMult: 0.95, damageTakenMult: 1.1, enemyDamageMult: 1, dotDps: 18, critBonusTaken: 0, color: 0xef4444 },
  { id: 'venom-poison', index: 4, name: '剧毒腐蚀', nameEn: 'Venom', durationSec: 4.0, moveSpeedMult: 0.9, damageTakenMult: 1.05, enemyDamageMult: 1, dotDps: 11, critBonusTaken: 0, color: 0x84cc16 },
  { id: 'armor-shred', index: 5, name: '破甲裂痕', nameEn: 'Armor Shred', durationSec: 3.5, moveSpeedMult: 1, damageTakenMult: 1.2, enemyDamageMult: 1, dotDps: 0, critBonusTaken: 0.05, color: 0xfbbf24 },
  { id: 'heavy-sunder', index: 6, name: '重度碎甲', nameEn: 'Heavy Sunder', durationSec: 3.0, moveSpeedMult: 0.9, damageTakenMult: 1.35, enemyDamageMult: 1, dotDps: 0, critBonusTaken: 0.1, color: 0xf59e0b },
  { id: 'shock-static', index: 7, name: '感电高压', nameEn: 'Static Shock', durationSec: 2.6, moveSpeedMult: 0.85, damageTakenMult: 1.12, enemyDamageMult: 1, dotDps: 10, critBonusTaken: 0, color: 0x60a5fa, special: 'chain-shock' },
  { id: 'stagger-stun', index: 8, name: '震荡眩晕', nameEn: 'Stagger Stun', durationSec: 0.75, moveSpeedMult: 0.05, damageTakenMult: 1.15, enemyDamageMult: 0.5, dotDps: 0, critBonusTaken: 0.15, color: 0xfde047 },
  { id: 'weaken-curse', index: 9, name: '虚弱诅咒', nameEn: 'Weaken Curse', durationSec: 3.5, moveSpeedMult: 0.9, damageTakenMult: 1.08, enemyDamageMult: 0.75, dotDps: 3, critBonusTaken: 0, color: 0xa855f7 },
  { id: 'bleed-lacerate', index: 10, name: '撕裂流血', nameEn: 'Lacerate', durationSec: 3.2, moveSpeedMult: 0.92, damageTakenMult: 1, enemyDamageMult: 1, dotDps: 12, critBonusTaken: 0, color: 0xdc2626, special: 'bleed-move' },
  { id: 'mark-exposed', index: 11, name: '猎手印记', nameEn: 'Hunter Mark', durationSec: 4.0, moveSpeedMult: 1, damageTakenMult: 1.12, enemyDamageMult: 1, dotDps: 0, critBonusTaken: 0.25, color: 0xfb7185 },
  { id: 'gravity-snare', index: 12, name: '重力牵引', nameEn: 'Gravity Snare', durationSec: 2.0, moveSpeedMult: 0.55, damageTakenMult: 1.05, enemyDamageMult: 1, dotDps: 4, critBonusTaken: 0, color: 0x6366f1 },
  { id: 'holy-brand', index: 13, name: '圣光烙印', nameEn: 'Holy Brand', durationSec: 3.5, moveSpeedMult: 1, damageTakenMult: 1.1, enemyDamageMult: 1, dotDps: 6, critBonusTaken: 0, color: 0xfef08a, special: 'holy-death-blast' },
  { id: 'frostbite-brittle', index: 14, name: '冻伤脆化', nameEn: 'Frostbite', durationSec: 2.8, moveSpeedMult: 0.75, damageTakenMult: 1.25, enemyDamageMult: 1, dotDps: 5, critBonusTaken: 0.2, color: 0x22d3ee },
  { id: 'scorch-blind', index: 15, name: '炫目灼光', nameEn: 'Scorch Blind', durationSec: 2.4, moveSpeedMult: 0.85, damageTakenMult: 1, enemyDamageMult: 0.8, dotDps: 7, critBonusTaken: 0, color: 0xfdba74, special: 'slow-windup' },
  { id: 'plague-spread', index: 16, name: '瘟疫传染', nameEn: 'Plague', durationSec: 4.0, moveSpeedMult: 0.88, damageTakenMult: 1.08, enemyDamageMult: 1, dotDps: 10, critBonusTaken: 0, color: 0x4ade80, special: 'plague-spread' },
  { id: 'cripple-hamstring', index: 17, name: '断筋重创', nameEn: 'Hamstring', durationSec: 2.5, moveSpeedMult: 0.6, damageTakenMult: 1.05, enemyDamageMult: 0.9, dotDps: 4, critBonusTaken: 0, color: 0xf43f5e },
  { id: 'arcane-silence', index: 18, name: '奥术沉默', nameEn: 'Arcane Silence', durationSec: 3.0, moveSpeedMult: 0.95, damageTakenMult: 1.1, enemyDamageMult: 0.85, dotDps: 5, critBonusTaken: 0, color: 0xc084fc, special: 'slow-windup' },
  { id: 'execute-doom', index: 19, name: '斩杀印记', nameEn: 'Doom Mark', durationSec: 3.5, moveSpeedMult: 0.95, damageTakenMult: 1.1, enemyDamageMult: 1, dotDps: 0, critBonusTaken: 0.15, color: 0x991b1b, special: 'execute-low-hp' },
];

export const DEBUFF_BY_ID: Readonly<Record<DebuffId, DebuffDefinition>> = Object.fromEntries(
  DEBUFF_DEFS.map((d) => [d.id, d])
) as Record<DebuffId, DebuffDefinition>;
