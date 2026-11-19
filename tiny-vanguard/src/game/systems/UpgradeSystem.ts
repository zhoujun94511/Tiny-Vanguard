import { RUNTIME_CONFIG } from '../config/runtimeConfig';
import type { UpgradeDefinition, UpgradeEffect } from '../content/definitions/ContentTypes';
import { ENCHANT_MAP, parseEnchantId } from '../content/enchants/enchants';
import { GEM_MAP, getGemStatValue, MAX_RELIC_RANK, parseGemKey } from '../content/gems/gems';
import { TALENT_MAP } from '../content/talents/talents';
import type { UpgradeChoiceView } from '../core/GameTypes';
import type { GameSession } from '../session/GameSession';

export class UpgradeSystem {
  public static computeComboTier(combo: number): number {
    if (combo >= 120) return 3;
    if (combo >= 60) return 2;
    if (combo >= 25) return 1;
    return 0;
  }

  public recalculateStats(session: GameSession): void {
    const p = session.player;
    const ch = session.character;
    const dm = p.directModifiers;

    let maxHpBonus = dm.maxHpBonus;
    let moveMult = 1 + dm.moveSpeedBonus;
    let dmgMult = 1 + p.supplyDamageBonus + dm.damageBonus;
    let atkSpdMult = 1 + dm.attackSpeedBonus;
    let pickupMult = 1 + dm.pickupBonus;
    let critChance = 0.08 + dm.critChanceBonus;
    let critDamageMult = 1.65 + dm.critDamageBonus;
    let lifeOnKill = dm.lifeOnKillBonus;
    let dashCdReduction = dm.dashCdReduction;
    let furyGainMult = 1 + dm.furyGainBonus;

    p.imbuedDebuffs.length = 0;
    for (const deb of dm.imbuedDebuffs) {
      p.imbuedDebuffs.push(deb);
    }

    // Reset per-weapon derived modifiers and level
    for (const w of p.weapons) {
      w.level = 1;
      w.damageMult = 1;
      w.cooldownMult = 1;
      w.rangeMult = 1;
      w.bonusCount = w.weaponId === 'star-blaster' ? dm.bonusStarBlasterCount : 0;
      w.bonusPierce = w.weaponId === 'star-blaster' ? dm.bonusStarBlasterPierce : 0;
      w.mechanisms.clear();
    }

    for (const [upgId, lvl] of p.upgradeLevels.entries()) {
      if (lvl <= 0) continue;
      const def = session.registries.upgrades.get(upgId);
      if (!def) continue;
      if (def.category === 'weapon-upgrade' && def.weaponId) {
        const wUp = p.weapons.find((ws) => ws.weaponId === def.weaponId);
        if (wUp) wUp.level += lvl;
      }

      for (const eff of def.effects) {
        switch (eff.kind) {
          case 'player-max-hp-add':
            maxHpBonus += eff.value * lvl;
            break;
          case 'player-move-speed-pct':
            moveMult += eff.value * lvl;
            break;
          case 'player-damage-pct':
            dmgMult += eff.value * lvl;
            break;
          case 'player-attack-speed-pct':
            atkSpdMult += eff.value * lvl;
            break;
          case 'player-pickup-pct':
            pickupMult += eff.value * lvl;
            break;
          case 'player-crit-add':
            critChance += eff.value * lvl;
            break;
          case 'player-crit-dmg-add':
            critDamageMult += eff.value * lvl;
            break;
          case 'player-life-on-kill-add':
            lifeOnKill += eff.value * lvl;
            break;
          case 'player-dash-cd-pct':
            dashCdReduction += eff.value * lvl;
            break;
          case 'player-fury-gain-pct':
            furyGainMult += eff.value * lvl;
            break;
          case 'player-imbue-debuff':
            if (eff.debuffId && !p.imbuedDebuffs.includes(eff.debuffId)) {
              p.imbuedDebuffs.push(eff.debuffId);
            }
            break;
          case 'weapon-damage-pct': {
            const w = p.weapons.find((ws) => ws.weaponId === eff.weaponId);
            if (w) w.damageMult += eff.value * lvl;
            break;
          }
          case 'weapon-cooldown-pct': {
            const w = p.weapons.find((ws) => ws.weaponId === eff.weaponId);
            if (w) w.cooldownMult = Math.max(0.4, w.cooldownMult - eff.value * lvl);
            break;
          }
          case 'weapon-range-pct': {
            const w = p.weapons.find((ws) => ws.weaponId === eff.weaponId);
            if (w) w.rangeMult += eff.value * lvl;
            break;
          }
          case 'weapon-count-add': {
            const w = p.weapons.find((ws) => ws.weaponId === eff.weaponId);
            if (w) w.bonusCount += Math.round(eff.value * lvl);
            break;
          }
          case 'weapon-pierce-add': {
            const w = p.weapons.find((ws) => ws.weaponId === eff.weaponId);
            if (w) w.bonusPierce += Math.round(eff.value * lvl);
            break;
          }
          case 'weapon-mechanism': {
            const w = p.weapons.find((ws) => ws.weaponId === eff.weaponId);
            if (w && eff.mechanismFlag) w.mechanisms.add(eff.mechanismFlag);
            break;
          }
          default:
            break;
        }
      }
    }

    // Combo Fever Tier scaling (25 / 60 / 120 combo streaks)
    const comboTier = UpgradeSystem.computeComboTier(session.combo);
    session.comboTier = comboTier;
    if (comboTier > 0) {
      atkSpdMult += comboTier * 0.08;
      moveMult += comboTier === 3 ? 0.14 : comboTier * 0.05;
      critChance += comboTier === 3 ? 0.15 : comboTier === 2 ? 0.08 : 0;
    }

    // Weapon x Relic Super Synergy Awakening (triggers evolved mechanism + bonus power)
    const relics = p.equippedRelics;
    for (const w of p.weapons) {
      if (w.weaponId === 'star-blaster' && relics.includes('eq-pierce-quiver')) {
        w.mechanisms.add('splitOnHit');
        w.level += 1;
        w.bonusCount += 1;
        w.bonusPierce += 1;
      } else if (w.weaponId === 'orbit-shields' && relics.includes('eq-holy-relic')) {
        w.mechanisms.add('breathingOrbit');
        w.level += 1;
        w.bonusCount += 1;
        w.damageMult += 0.25;
      } else if (w.weaponId === 'frost-nova' && relics.includes('eq-frost-ring')) {
        w.mechanisms.add('echoWave');
        w.level += 1;
        w.rangeMult += 0.25;
      } else if (w.weaponId === 'thunder-arc' && relics.includes('eq-storm-amulet')) {
        w.mechanisms.add('overloadShock');
        w.level += 1;
        w.bonusCount += 3;
      } else if (w.weaponId === 'rail-sniper' && relics.includes('eq-executioner-blade')) {
        w.mechanisms.add('armorBreaker');
        w.level += 1;
        w.damageMult += 0.25;
        w.bonusPierce += 1;
      }
    }

    p.maxHp = ch.baseHp + maxHpBonus;
    if (session.hasGlassCannon) {
      dmgMult += 0.55;
      p.maxHp = Math.max(20, Math.round(p.maxHp * 0.65));
    }
    p.hp = Math.min(p.hp, p.maxHp);
    p.moveSpeedMult = Math.min(RUNTIME_CONFIG.maxPlayerSpeedMultiplier, moveMult);
    p.damageMult = dmgMult;
    p.attackSpeedMult = Math.min(RUNTIME_CONFIG.maxAttackSpeedMultiplier, atkSpdMult);
    p.critChance = Math.min(0.75, critChance);
    p.critDamageMult = Math.min(3.5, critDamageMult);
    p.lifeOnKill = Math.min(0.12, lifeOnKill);
    p.dashCooldownMult = Math.max(0.4, 1 - dashCdReduction);
    p.furyGainMult = Math.min(2.5, furyGainMult);
    p.pickupMult = pickupMult;
    p.pickupRadius = ch.pickupRadius * p.pickupMult;

    for (const w of p.weapons) {
      w.bonusCount = Math.min(RUNTIME_CONFIG.maxBonusProjectiles, w.bonusCount);
    }
  }

  public applyMetaTalents(
    session: GameSession,
    talents: Readonly<Record<string, number>>,
    characterStars?: Readonly<Record<string, number>>,
    loadoutRelicIds?: readonly string[],
    relicRanks?: Readonly<Record<string, number>>,
    relicSockets?: Readonly<Record<string, string | null>>,
    relicEnchants?: Readonly<Record<string, string>>
  ): void {
    const dm = session.player.directModifiers;
    const clampLvl = (id: string): number => {
      const def = TALENT_MAP.get(id);
      const raw = talents[id] ?? 0;
      if (!def || !Number.isFinite(raw) || raw <= 0) return 0;
      return Math.min(def.maxLevel, Math.floor(raw));
    };

    dm.damageBonus += clampLvl('might') * 0.06;
    dm.maxHpBonus += clampLvl('vitality') * 18;
    dm.attackSpeedBonus += clampLvl('swiftness') * 0.05;
    dm.moveSpeedBonus += clampLvl('haste') * 0.04;
    dm.pickupBonus += clampLvl('magnet') * 0.12;
    dm.bossDamageBonus += clampLvl('bossSlayer') * 0.08;
    session.rerollsRemaining = 2 + clampLvl('dice');

    // Apply hero star rank progression (1★..5★)
    const starLv = Math.max(
      1,
      Math.min(5, Math.floor(characterStars?.[session.character.id] ?? 1))
    );
    if (starLv > 1) {
      const extraStars = starLv - 1;
      dm.maxHpBonus += extraStars * 12;
      dm.damageBonus += extraStars * 0.05;
      if (session.character.id === 'storm-ranger') {
        dm.critChanceBonus += extraStars * 0.03;
      } else if (session.character.id === 'iron-bastion') {
        session.player.maxShield = Math.max(session.player.maxShield, extraStars * 10);
        session.player.shield = session.player.maxShield;
      } else {
        dm.attackSpeedBonus += extraStars * 0.04;
      }
    }

    // Equip pre-selected loadout relics at run start (with refinement, gem, enchant & resonance)
    if (loadoutRelicIds && loadoutRelicIds.length > 0) {
      let highTierCount = 0;
      for (const rid of loadoutRelicIds) {
        const rank = Math.max(0, Math.min(MAX_RELIC_RANK, Math.floor(relicRanks?.[rid] ?? 0)));
        this.equipItemById(session, rid, rank);
        const eqDef = session.registries.equipment.get(rid);
        if (eqDef && (eqDef.tier === 'rare' || eqDef.tier === 'epic' || eqDef.tier === 'legendary')) {
          highTierCount += 1;
        }
        const gemParsed = parseGemKey(relicSockets?.[rid]);
        if (gemParsed) {
          const gemDef = GEM_MAP.get(gemParsed.type);
          if (gemDef) {
            dm[gemDef.statKey] += getGemStatValue(gemParsed.type, gemParsed.tier);
          }
        }
        const enchantId = parseEnchantId(relicEnchants?.[rid]);
        if (enchantId) {
          const enchDef = ENCHANT_MAP.get(enchantId);
          if (enchDef) {
            dm[enchDef.statKey] += enchDef.value;
          }
        }
      }
      if (highTierCount >= 2) {
        dm.damageBonus += 0.08;
        dm.maxHpBonus += 20;
      }
    }

    this.recalculateStats(session);
    session.player.hp = session.player.maxHp;
  }

  /**
   * Shared effect applicator used by Buffs and Equipment Relics so all 22 Buffs & 20 Equipment
   * wire through one authoritative math path.
   */
  public applyDirectEffects(session: GameSession, effects: readonly UpgradeEffect[]): void {
    const p = session.player;
    const dm = p.directModifiers;

    for (const eff of effects) {
      switch (eff.kind) {
        case 'unlock-weapon':
          if (eff.weaponId) {
            if (!p.weapons.some((w) => w.weaponId === eff.weaponId)) {
              if (p.weapons.length < session.level.weaponSlotCount) {
                p.weapons.push(session.createWeaponState(eff.weaponId));
              } else {
                dm.damageBonus += 0.15;
              }
            } else {
              if (eff.weaponId === 'star-blaster') dm.bonusStarBlasterCount += 1;
              else dm.damageBonus += 0.18;
            }
          }
          break;
        case 'player-damage-pct':
          dm.damageBonus += eff.value;
          break;
        case 'player-attack-speed-pct':
          dm.attackSpeedBonus += eff.value;
          break;
        case 'player-move-speed-pct':
          dm.moveSpeedBonus += eff.value;
          break;
        case 'player-max-hp-add':
          dm.maxHpBonus += eff.value;
          break;
        case 'player-crit-add':
          dm.critChanceBonus += eff.value;
          break;
        case 'player-crit-dmg-add':
          dm.critDamageBonus += eff.value;
          break;
        case 'player-life-on-kill-add':
          dm.lifeOnKillBonus += eff.value;
          break;
        case 'player-dash-cd-pct':
          dm.dashCdReduction += eff.value;
          break;
        case 'player-fury-gain-pct':
          dm.furyGainBonus += eff.value;
          break;
        case 'player-pickup-pct':
          dm.pickupBonus += eff.value;
          break;
        case 'player-imbue-debuff':
          if (eff.debuffId) dm.imbuedDebuffs.add(eff.debuffId);
          break;
        case 'weapon-count-add':
          if (eff.weaponId === 'star-blaster') dm.bonusStarBlasterCount += Math.round(eff.value);
          break;
        case 'weapon-pierce-add':
          if (eff.weaponId === 'star-blaster') dm.bonusStarBlasterPierce += Math.round(eff.value);
          break;
        default:
          break;
      }
    }

    this.recalculateStats(session);

    for (const eff of effects) {
      if (eff.kind === 'player-max-hp-add') {
        p.hp = Math.min(p.maxHp, p.hp + eff.value);
      } else if (eff.kind === 'player-heal-pct') {
        const healAmt = p.maxHp * eff.value;
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        session.spawnDamagePopup(p.x, 1.4, p.z, healAmt, true, true);
      } else if (eff.kind === 'player-shield-add') {
        p.maxShield = Math.max(p.maxShield, p.shield + eff.value);
        p.shield = Math.min(p.maxShield, p.shield + eff.value);
      }
    }
  }

  public grantBuffById(session: GameSession, buffId: string): boolean {
    const buff = session.registries.buffs.get(buffId);
    if (!buff) return false;
    this.applyDirectEffects(session, buff.effects);
    return true;
  }

  public equipItemById(session: GameSession, eqId: string, refineRank = 0): boolean {
    const eq = session.registries.equipment.get(eqId);
    if (!eq) return false;
    if (session.player.equippedRelics.includes(eqId)) return false;
    session.player.equippedRelics.push(eqId);
    const clampedRank = Math.max(0, Math.min(MAX_RELIC_RANK, Math.floor(refineRank)));
    if (clampedRank <= 0) {
      this.applyDirectEffects(session, eq.effects);
      return true;
    }
    const mult = 1 + clampedRank * 0.15;
    const scaled: UpgradeEffect[] = eq.effects.map((eff) => ({
      ...eff,
      value: eff.kind === 'player-imbue-debuff' ? eff.value : eff.value * mult,
    }));
    this.applyDirectEffects(session, scaled);
    return true;
  }

  public isUpgradeEligible(session: GameSession, def: UpgradeDefinition): boolean {
    const p = session.player;
    const currentLevel = p.upgradeLevels.get(def.id) ?? 0;
    if (!(session.endlessMode && def.id === 'stat-heal-fallback') && currentLevel >= def.maxLevel) {
      return false;
    }

    if (def.prerequisites) {
      for (const pre of def.prerequisites) {
        if ((p.upgradeLevels.get(pre) ?? 0) <= 0) return false;
      }
    }

    if (def.category === 'weapon-unlock') {
      if (!def.weaponId) return false;
      if (p.weapons.length >= session.level.weaponSlotCount) return false;
      if (p.weapons.some((w) => w.weaponId === def.weaponId)) return false;
      if (!session.level.allowedWeaponIds.includes(def.weaponId)) return false;
    } else if (def.category === 'weapon-upgrade') {
      if (!def.weaponId) return false;
      if (!p.weapons.some((w) => w.weaponId === def.weaponId)) return false;
    }

    return true;
  }

  public generateChoices(session: GameSession, count = 3): UpgradeChoiceView[] {
    const eligible: UpgradeDefinition[] = [];
    for (const uid of session.level.upgradePoolIds) {
      if (uid === 'stat-heal-fallback') continue;
      const def = session.registries.upgrades.get(uid);
      if (def && this.isUpgradeEligible(session, def)) {
        eligible.push(def);
      }
    }

    for (let i = eligible.length - 1; i > 0; i -= 1) {
      const j = session.rng.int(0, i + 1);
      const tmp = eligible[i];
      eligible[i] = eligible[j];
      eligible[j] = tmp;
    }

    const picked = eligible.slice(0, count);

    const fallbackDef = session.registries.upgrades.get('stat-heal-fallback');
    while (picked.length < count && fallbackDef) {
      picked.push(fallbackDef);
    }

    return picked.map((def) => this.toChoiceView(session, def));
  }

  private toChoiceView(session: GameSession, def: UpgradeDefinition): UpgradeChoiceView {
    const cur = session.player.upgradeLevels.get(def.id) ?? 0;
    const next = Math.min(def.maxLevel, cur + 1);
    const isEndlessLimitBreak = session.endlessMode && def.id === 'stat-heal-fallback';
    const badge =
      isEndlessLimitBreak
        ? session.language === 'en'
          ? 'Limit Break'
          : '巅峰突破'
        : def.category === 'weapon-unlock'
          ? '新武器'
          : def.category === 'weapon-upgrade'
            ? '武器强化'
            : def.category === 'survival'
              ? '生存补给'
              : '属性提升';

    return {
      upgradeId: def.id,
      name: isEndlessLimitBreak
        ? session.language === 'en'
          ? 'Abyssal Limit Break'
          : '深渊巅峰突破'
        : def.name,
      description: isEndlessLimitBreak
        ? session.language === 'en'
          ? 'Permanent DMG +6%, Max HP +10 & Heal 35%'
          : '永久伤害 +6%、最大生命 +10 并回复 35% 生命'
        : def.description,
      category: def.category,
      currentLevel: cur,
      nextLevel: next,
      maxLevel: def.maxLevel,
      currentEffectText: cur === 0 ? '未获得' : `当前 Lv.${cur}`,
      nextEffectText: isEndlessLimitBreak ? '♾️ +1' : `升级至 Lv.${next}`,
      badge,
    };
  }

  public applyUpgrade(session: GameSession, upgradeId: string): boolean {
    const def = session.registries.upgrades.get(upgradeId);
    if (!def || !this.isUpgradeEligible(session, def)) {
      return false;
    }

    const prev = session.player.upgradeLevels.get(upgradeId) ?? 0;
    session.player.upgradeLevels.set(upgradeId, prev + 1);

    if (session.endlessMode && upgradeId === 'stat-heal-fallback') {
      session.player.directModifiers.damageBonus += 0.06;
      session.player.directModifiers.maxHpBonus += 10;
    }

    for (const eff of def.effects) {
      if (eff.kind === 'unlock-weapon' && eff.weaponId) {
        if (!session.player.weapons.some((w) => w.weaponId === eff.weaponId)) {
          session.player.weapons.push(session.createWeaponState(eff.weaponId));
        }
      }
    }

    this.recalculateStats(session);

    for (const eff of def.effects) {
      if (eff.kind === 'player-max-hp-add') {
        session.player.hp = Math.min(session.player.maxHp, session.player.hp + eff.value);
      } else if (eff.kind === 'player-heal-pct') {
        const healAmt = session.player.maxHp * eff.value;
        session.player.hp = Math.min(session.player.maxHp, session.player.hp + healAmt);
        session.spawnDamagePopup(session.player.x, 1.4, session.player.z, healAmt, true, true);
      } else if (eff.kind === 'player-shield-add') {
        session.player.maxShield = Math.max(session.player.maxShield, session.player.shield + eff.value);
        session.player.shield = Math.min(session.player.maxShield, session.player.shield + eff.value);
      }
    }

    return true;
  }
}
