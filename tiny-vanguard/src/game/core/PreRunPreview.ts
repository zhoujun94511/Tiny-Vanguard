import type { CharacterDefinition, EquipmentDefinition } from '../content/definitions/ContentTypes';
import { ENCHANT_MAP, parseEnchantId } from '../content/enchants/enchants';
import { GEM_MAP, getGemStatValue, MAX_RELIC_RANK, parseGemKey } from '../content/gems/gems';
import { TALENT_MAP } from '../content/talents/talents';
import type { SaveData } from './GameTypes';

export interface PreRunPreviewStats {
  maxHp: number;
  damageBonusPct: number;
  critChancePct: number;
  rerolls: number;
  resonanceActive: boolean;
}

export function computePreRunPreviewStats(
  character: CharacterDefinition,
  saveData: SaveData,
  relics: readonly EquipmentDefinition[]
): PreRunPreviewStats {
  const clampTalent = (id: string): number => {
    const def = TALENT_MAP.get(id);
    const raw = saveData.talents[id] ?? 0;
    if (!def || !Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(def.maxLevel, Math.floor(raw));
  };

  let maxHpBonus = clampTalent('vitality') * 18;
  let damageBonus = clampTalent('might') * 0.06;
  let critChanceBonus = 0;
  const rerolls = 2 + clampTalent('dice');

  const starLv = Math.max(
    1,
    Math.min(5, Math.floor(saveData.characterStars[character.id] ?? 1))
  );
  if (starLv > 1) {
    const extraStars = starLv - 1;
    maxHpBonus += extraStars * 12;
    damageBonus += extraStars * 0.05;
    if (character.id === 'storm-ranger') {
      critChanceBonus += extraStars * 0.03;
    }
  }

  let highTierCount = 0;
  const relicMap = new Map(relics.map((r) => [r.id, r]));
  for (const rid of saveData.loadoutRelicIds) {
    const eq = relicMap.get(rid);
    if (eq) {
      if (eq.tier === 'rare' || eq.tier === 'epic' || eq.tier === 'legendary') {
        highTierCount += 1;
      }
      const rank = Math.max(0, Math.min(MAX_RELIC_RANK, Math.floor(saveData.relicRanks?.[rid] ?? 0)));
      const mult = 1 + rank * 0.15;
      for (const eff of eq.effects) {
        if (eff.kind === 'player-max-hp-add') maxHpBonus += eff.value * mult;
        else if (eff.kind === 'player-damage-pct') damageBonus += eff.value * mult;
        else if (eff.kind === 'player-crit-add') critChanceBonus += eff.value * mult;
      }
    }

    const gemParsed = parseGemKey(saveData.relicSockets?.[rid]);
    if (gemParsed) {
      const gemDef = GEM_MAP.get(gemParsed.type);
      const val = getGemStatValue(gemParsed.type, gemParsed.tier);
      if (gemDef?.statKey === 'maxHpBonus') maxHpBonus += val;
      else if (gemDef?.statKey === 'damageBonus') damageBonus += val;
      else if (gemDef?.statKey === 'critChanceBonus') critChanceBonus += val;
    }

    const enchantId = parseEnchantId(saveData.relicEnchants?.[rid]);
    if (enchantId) {
      const ench = ENCHANT_MAP.get(enchantId);
      if (ench?.statKey === 'maxHpBonus') maxHpBonus += ench.value;
      else if (ench?.statKey === 'damageBonus') damageBonus += ench.value;
      else if (ench?.statKey === 'critChanceBonus') critChanceBonus += ench.value;
    }
  }

  const resonanceActive = highTierCount >= 2;
  if (resonanceActive) {
    damageBonus += 0.08;
    maxHpBonus += 20;
  }

  return {
    maxHp: Math.max(1, Math.round(character.baseHp + maxHpBonus)),
    damageBonusPct: Math.round(damageBonus * 100),
    critChancePct: Math.round(Math.min(0.9, 0.08 + critChanceBonus) * 100),
    rerolls,
    resonanceActive,
  };
}
