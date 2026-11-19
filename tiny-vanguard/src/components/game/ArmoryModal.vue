<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CharacterDefinition, EquipmentDefinition } from '../../game/content/definitions/ContentTypes';
import { ENCHANT_MAP, parseEnchantId, RELIC_ENCHANT_COST } from '../../game/content/enchants/enchants';
import {
  GEMS,
  getGemStatValue,
  getRelicRefineCost,
  makeGemKey,
  MAX_RELIC_RANK,
  parseGemKey,
  RELIC_SOCKET_COST,
  type GemTier,
  type GemTypeId,
} from '../../game/content/gems/gems';
import { getRelicIcon, getRelicTierClass } from '../../game/content/icons/itemIcons';
import {
  getTalentTotalInvested,
  getTalentUpgradeCost,
  TALENTS,
  type TalentDefinition,
  type TalentId,
} from '../../game/content/talents/talents';
import type { SaveData } from '../../game/core/GameTypes';
import GameModal from '../common/GameModal.vue';
import GemSvgIcon from '../common/GemSvgIcon.vue';
import HeroSvgIcon from '../common/HeroSvgIcon.vue';
import { useI18n } from './useI18n';

const props = defineProps<{
  saveData: SaveData;
  characters: readonly CharacterDefinition[];
  relics: readonly EquipmentDefinition[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'upgradeTalent', id: TalentId): void;
  (e: 'resetTalents'): void;
  (e: 'unlockCharacter', id: string): void;
  (e: 'starUpCharacter', id: string): void;
  (e: 'toggleLoadoutRelic', id: string): void;
  (e: 'unlockSecondSlot'): void;
  (e: 'refineRelic', id: string): void;
  (e: 'unlockRelicSocket', id: string): void;
  (e: 'socketGem', relicId: string, gemKey: string): void;
  (e: 'unsocketGem', relicId: string): void;
  (e: 'fuseGem', gemType: GemTypeId, tier: 1 | 2): void;
  (e: 'enchantRelic', relicId: string): void;
}>();

const { lang, t, tc } = useI18n();
const activeTab = ref<'talents' | 'heroes' | 'loadout' | 'gems'>('talents');
const socketingRelicId = ref<string | null>(null);

const investedStars = computed(() => getTalentTotalInvested(props.saveData.talents));

const discoveredRelicDefs = computed(() =>
  props.relics.filter((r) => props.saveData.discoveredRelics.includes(r.id))
);

function getLevel(id: TalentId): number {
  return Math.max(0, Math.floor(props.saveData.talents[id] ?? 0));
}

function getCost(def: TalentDefinition): number {
  return getTalentUpgradeCost(def, getLevel(def.id));
}

function canAfford(def: TalentDefinition): boolean {
  const lv = getLevel(def.id);
  return lv < def.maxLevel && props.saveData.stars >= getCost(def);
}

function isCharUnlocked(id: string): boolean {
  return props.saveData.unlockedCharacters.includes(id);
}

function getCharStar(id: string): number {
  return Math.max(1, Math.min(5, Math.floor(props.saveData.characterStars[id] ?? 1)));
}

function getCharShards(id: string): number {
  return Math.max(0, Math.floor(props.saveData.characterShards[id] ?? 0));
}

function canUnlockChar(id: string): boolean {
  return !isCharUnlocked(id) && (getCharShards(id) >= 20 || props.saveData.stars >= 25);
}

function canStarUpChar(id: string): boolean {
  if (!isCharUnlocked(id)) return false;
  const star = getCharStar(id);
  if (star >= 5) return false;
  return getCharShards(id) >= star * 10 || props.saveData.stars >= star * 22;
}

function getRelicRank(id: string): number {
  return Math.max(0, Math.min(MAX_RELIC_RANK, Math.floor(props.saveData.relicRanks?.[id] ?? 0)));
}

function hasSocket(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(props.saveData.relicSockets ?? {}, id);
}

function getSocketedGem(id: string) {
  return parseGemKey(props.saveData.relicSockets?.[id]);
}

function getGemIcon(type: GemTypeId): string {
  return GEMS.find((g) => g.id === type)?.icon ?? '💎';
}

function formatGemEffect(type: GemTypeId, tier: GemTier): string {
  const def = GEMS.find((g) => g.id === type);
  if (!def) return '';
  const val = Math.round(getGemStatValue(type, tier) * def.displayScale);
  return `+${val}${def.unit}`;
}

const ownedGems = computed(() => {
  const out: Array<{ key: string; type: GemTypeId; tier: GemTier; count: number; icon: string; label: string; stat: string }> = [];
  for (const g of GEMS) {
    for (const tier of [1, 2, 3] as const) {
      const key = makeGemKey(g.id, tier);
      const count = props.saveData.gemInventory?.[key] ?? 0;
      if (count > 0) {
        out.push({
          key,
          type: g.id,
          tier,
          count,
          icon: g.icon,
          label: `${lang.value === 'en' ? g.nameEn : g.name} Lv.${tier}`,
          stat: formatGemEffect(g.id, tier),
        });
      }
    }
  }
  return out;
});

const socketingRelicDef = computed(() =>
  socketingRelicId.value ? props.relics.find((r) => r.id === socketingRelicId.value) ?? null : null
);

function getRelicEnchant(id: string) {
  const eid = parseEnchantId(props.saveData.relicEnchants?.[id]);
  return eid ? ENCHANT_MAP.get(eid) ?? null : null;
}

const isResonanceActive = computed(() => {
  let count = 0;
  for (const rid of props.saveData.loadoutRelicIds) {
    const def = props.relics.find((r) => r.id === rid);
    if (def && (def.tier === 'rare' || def.tier === 'epic' || def.tier === 'legendary')) {
      count += 1;
    }
  }
  return count >= 2;
});
</script>

<template>
  <GameModal
    badge-icon="🛡️"
    tone="gold"
    :title="t('armory.title')"
    max-width="540px"
    closable
    close-on-backdrop
    @close="emit('close')"
  >
    <div class="armory-wallet">
      <span class="wallet-label">{{ t('armory.stars') }}</span>
      <strong class="wallet-val">⭐ {{ saveData.stars }}</strong>
    </div>

    <div class="armory-tabs">
      <button
        type="button"
        class="arm-tab"
        :class="{ active: activeTab === 'talents' }"
        @click="activeTab = 'talents'"
      >
        ⚔️ {{ t('armory.tabTalents') }}
      </button>
      <button
        type="button"
        class="arm-tab"
        :class="{ active: activeTab === 'heroes' }"
        @click="activeTab = 'heroes'"
      >
        🧩 {{ t('armory.tabHeroes') }}
      </button>
      <button
        type="button"
        class="arm-tab"
        :class="{ active: activeTab === 'loadout' }"
        @click="activeTab = 'loadout'; socketingRelicId = null"
      >
        👑 {{ t('armory.tabLoadout') }} ({{ saveData.loadoutRelicIds.length }}/{{ saveData.loadoutSlotsUnlocked }})
      </button>
      <button
        type="button"
        class="arm-tab"
        :class="{ active: activeTab === 'gems' }"
        @click="activeTab = 'gems'; socketingRelicId = null"
      >
        💎 {{ t('armory.tabGems') }}
      </button>
    </div>

    <!-- Tab 1: Meta Talents -->
    <div v-if="activeTab === 'talents'" class="talent-grid">
      <div v-for="def in TALENTS" :key="def.id" class="talent-card">
        <div class="talent-head">
          <span class="talent-icon">{{ def.icon }}</span>
          <div class="talent-titles">
            <div class="talent-name">{{ lang === 'en' ? def.nameEn : def.name }}</div>
            <div class="talent-desc">{{ lang === 'en' ? def.descEn : def.desc }}</div>
          </div>
          <span class="talent-rank">
            {{ t('armory.rank', { lv: getLevel(def.id), max: def.maxLevel }) }}
          </span>
        </div>

        <div class="talent-pips">
          <span
            v-for="pip in def.maxLevel"
            :key="pip"
            class="rank-pip"
            :class="{ filled: pip <= getLevel(def.id) }"
          ></span>
        </div>

        <div class="talent-foot">
          <span class="talent-active">
            {{
              t('armory.current', {
                val: getLevel(def.id) * def.bonusPerLevel,
                unit: def.unit,
              })
            }}
          </span>

          <button
            v-if="getLevel(def.id) < def.maxLevel"
            type="button"
            class="talent-btn"
            :disabled="!canAfford(def)"
            @click="emit('upgradeTalent', def.id)"
          >
            {{ t('armory.upgrade', { cost: getCost(def) }) }}
          </button>
          <span v-else class="talent-maxed">{{ t('armory.maxed') }}</span>
        </div>
      </div>
    </div>

    <!-- Tab 2: Hero Shards & Star Progression -->
    <div v-else-if="activeTab === 'heroes'" class="hero-roster-list">
      <div v-for="ch in characters" :key="ch.id" class="hero-up-card">
        <div class="hero-up-head">
          <HeroSvgIcon :hero-id="ch.id" :size="26" />
          <div class="hero-up-info">
            <div class="talent-name">
              {{ tc(ch.id, 'name', ch.name) }}
              <span v-if="isCharUnlocked(ch.id)" class="star-tag">★{{ getCharStar(ch.id) }}/5</span>
              <span v-else class="lock-tag">🔒</span>
            </div>
            <div class="talent-desc">
              {{ tc(ch.startingWeaponId, 'name', ch.startingWeaponId) }} · 🧩 {{ getCharShards(ch.id) }}
            </div>
          </div>

          <button
            v-if="!isCharUnlocked(ch.id)"
            type="button"
            class="talent-btn"
            :disabled="!canUnlockChar(ch.id)"
            @click="emit('unlockCharacter', ch.id)"
          >
            {{ getCharShards(ch.id) >= 20 ? '🧩 20' : '⭐ 25' }}
          </button>
          <button
            v-else-if="getCharStar(ch.id) < 5"
            type="button"
            class="talent-btn"
            :disabled="!canStarUpChar(ch.id)"
            @click="emit('starUpCharacter', ch.id)"
          >
            {{
              getCharShards(ch.id) >= getCharStar(ch.id) * 10
                ? `🧩 ${getCharStar(ch.id) * 10}`
                : `⭐ ${getCharStar(ch.id) * 22}`
            }}
          </button>
          <span v-else class="talent-maxed">{{ t('armory.maxed') }}</span>
        </div>
      </div>
    </div>

    <!-- Tab 3: Relic Loadout, Refinement & Sockets -->
    <div v-else-if="activeTab === 'loadout'" class="loadout-panel">
      <div class="loadout-slots-bar">
        <span class="loadout-hint">{{ t('armory.loadoutHint') }}</span>
        <button
          v-if="saveData.loadoutSlotsUnlocked < 2"
          type="button"
          class="talent-btn"
          :disabled="saveData.stars < 40"
          @click="emit('unlockSecondSlot')"
        >
          +1 {{ t('armory.slotBtn') }} (⭐ 40)
        </button>
      </div>
      <div class="resonance-banner" :class="{ active: isResonanceActive }">
        {{ isResonanceActive ? t('armory.resonanceActive') : t('armory.resonanceHint') }}
      </div>

      <div v-if="socketingRelicDef" class="gem-picker-box">
        <div class="gem-picker-head">
          <span>
            {{
              t('armory.gemSelectPrompt', {
                name: lang === 'en' ? socketingRelicDef.nameEn : socketingRelicDef.name,
              })
            }}
          </span>
          <button type="button" class="mini-chip-btn" @click="socketingRelicId = null">✕</button>
        </div>
        <div v-if="ownedGems.length === 0" class="empty-loadout" style="padding: 10px">
          {{ t('armory.gemEmpty') }}
        </div>
        <div v-else class="gem-picker-list">
          <button
            v-for="g in ownedGems"
            :key="g.key"
            type="button"
            class="mini-chip-btn"
            @click="
              emit('socketGem', socketingRelicDef.id, g.key);
              socketingRelicId = null;
            "
          >
            <GemSvgIcon :gem-type="g.type" :tier="g.tier" :size="14" /> {{ g.label }} ({{ g.stat }}) ×{{ g.count }}
          </button>
        </div>
      </div>

      <div v-if="discoveredRelicDefs.length === 0" class="empty-loadout">
        {{ t('armory.loadoutEmpty') }}
      </div>
      <div v-else class="loadout-grid">
        <div
          v-for="r in discoveredRelicDefs"
          :key="r.id"
          class="loadout-relic-wrap"
          :class="[
            getRelicTierClass(r.tier),
            { equipped: saveData.loadoutRelicIds.includes(r.id) },
          ]"
        >
          <button
            type="button"
            class="loadout-relic-main"
            @click="emit('toggleLoadoutRelic', r.id)"
          >
            <span class="lr-icon">{{ getRelicIcon(r.id) }}</span>
            <div class="lr-text">
              <div class="lr-name">
                {{ lang === 'en' ? r.nameEn : r.name }}
                <span class="tier-pill" :class="getRelicTierClass(r.tier)">{{ t(`tier.${r.tier}`) }}</span>
                <span v-if="getRelicRank(r.id) > 0" class="rank-badge">+{{ getRelicRank(r.id) }}</span>
              </div>
              <div class="lr-desc">{{ lang === 'en' ? r.descriptionEn : r.description }}</div>
              <div v-if="getRelicEnchant(r.id)" class="lr-enchant">
                {{ getRelicEnchant(r.id)!.icon }}
                {{ lang === 'en' ? getRelicEnchant(r.id)!.nameEn : getRelicEnchant(r.id)!.name }} ·
                {{ lang === 'en' ? getRelicEnchant(r.id)!.descEn : getRelicEnchant(r.id)!.desc }}
              </div>
            </div>
            <span v-if="saveData.loadoutRelicIds.includes(r.id)" class="lr-check">✓</span>
          </button>

          <div class="lr-actions">
            <button
              v-if="getRelicRank(r.id) < MAX_RELIC_RANK"
              type="button"
              class="mini-chip-btn"
              :disabled="saveData.stars < getRelicRefineCost(getRelicRank(r.id))"
              @click="emit('refineRelic', r.id)"
            >
              ⚒️ {{ t('armory.refineBtn') }} ⭐{{ getRelicRefineCost(getRelicRank(r.id)) }}
            </button>
            <span v-else class="mini-max-tag">+{{ MAX_RELIC_RANK }} MAX</span>

            <button
              type="button"
              class="mini-chip-btn"
              :disabled="saveData.stars < RELIC_ENCHANT_COST"
              @click="emit('enchantRelic', r.id)"
            >
              ✨ {{ t('armory.enchantBtn') }} ⭐{{ RELIC_ENCHANT_COST }}
            </button>

            <button
              v-if="!hasSocket(r.id)"
              type="button"
              class="mini-chip-btn"
              :disabled="saveData.stars < RELIC_SOCKET_COST"
              @click="emit('unlockRelicSocket', r.id)"
            >
              🔩 {{ t('armory.socketUnlock') }} ⭐{{ RELIC_SOCKET_COST }}
            </button>
            <template v-else-if="getSocketedGem(r.id)">
              <button
                type="button"
                class="mini-chip-btn active"
                @click="socketingRelicId = r.id"
              >
                <GemSvgIcon
                  :gem-type="getSocketedGem(r.id)!.type"
                  :tier="getSocketedGem(r.id)!.tier"
                  :size="13"
                />
                Lv.{{ getSocketedGem(r.id)!.tier }}
              </button>
              <button
                type="button"
                class="mini-chip-btn"
                @click="emit('unsocketGem', r.id)"
              >
                {{ t('armory.unsocket') }}
              </button>
            </template>
            <button
              v-else
              type="button"
              class="mini-chip-btn"
              @click="socketingRelicId = r.id"
            >
              💎 {{ t('armory.socketEmpty') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 4: Gem Workshop & 3-to-1 Fusion -->
    <div v-else class="loadout-panel">
      <div class="loadout-hint">{{ t('armory.gemHint') }}</div>
      <div v-if="ownedGems.length === 0" class="empty-loadout">
        {{ t('armory.gemEmpty') }}
      </div>
      <div v-else class="gem-list">
        <div v-for="g in ownedGems" :key="g.key" class="gem-row">
          <GemSvgIcon :gem-type="g.type" :tier="g.tier" :size="20" />
          <div class="gem-info">
            <div class="lr-name">{{ g.label }} · ×{{ g.count }}</div>
            <div class="lr-desc">{{ g.stat }}</div>
          </div>
          <button
            v-if="g.tier < 3"
            type="button"
            class="talent-btn"
            :disabled="g.count < 3"
            @click="emit('fuseGem', g.type, g.tier as 1 | 2)"
          >
            ✨ {{ t('armory.fuseBtn') }}
          </button>
          <span v-else class="talent-maxed">MAX</span>
        </div>
      </div>
    </div>

    <template #actions>
      <div class="armory-actions">
        <button
          v-if="activeTab === 'talents'"
          type="button"
          class="armory-reset-btn"
          :disabled="investedStars <= 0"
          @click="emit('resetTalents')"
        >
          {{ t('armory.reset') }}
        </button>
        <button type="button" class="armory-done-btn" @click="emit('close')">
          {{ t('armory.done') }}
        </button>
      </div>
    </template>
  </GameModal>
</template>

<style scoped>
.armory-wallet {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.32);
  margin-bottom: 10px;
}

.wallet-label {
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
}

.wallet-val {
  font-size: 17px;
  font-weight: 900;
  color: #fde047;
}

.armory-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}

.arm-tab {
  padding: 7px 6px;
  border-radius: 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.58);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.arm-tab.active {
  border-color: rgba(251, 191, 36, 0.72);
  background: rgba(251, 191, 36, 0.14);
  color: #fde047;
}

.talent-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-height: 44vh;
  overflow-y: auto;
  padding-right: 2px;
}

.talent-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 11px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.talent-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.talent-icon {
  font-size: 20px;
  line-height: 1.2;
}

.talent-titles {
  flex: 1;
  min-width: 0;
}

.talent-name {
  font-size: 13px;
  font-weight: 800;
  color: #f8fafc;
}

.talent-desc {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.35;
  color: #94a3b8;
}

.talent-rank {
  font-size: 11px;
  font-weight: 800;
  color: #fbbf24;
  white-space: nowrap;
}

.talent-pips {
  display: flex;
  gap: 4px;
}

.rank-pip {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
}

.rank-pip.filled {
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.55);
}

.talent-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.talent-active {
  font-size: 11px;
  font-weight: 700;
  color: #38bdf8;
}

.talent-btn {
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid rgba(251, 191, 36, 0.45);
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #0f172a;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.talent-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.talent-btn:disabled {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(148, 163, 184, 0.2);
  color: #64748b;
  cursor: not-allowed;
}

.talent-maxed {
  font-size: 11px;
  font-weight: 800;
  color: #4ade80;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(74, 222, 128, 0.12);
}

.hero-roster-list,
.loadout-panel {
  max-height: 44vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-up-card {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.hero-up-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hero-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.hero-up-info {
  flex: 1;
  min-width: 0;
}

.star-tag {
  margin-left: 6px;
  font-size: 11px;
  color: #fde047;
}

.lock-tag {
  margin-left: 6px;
  font-size: 11px;
}

.loadout-slots-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.loadout-hint {
  font-size: 11px;
  color: #94a3b8;
}

.empty-loadout {
  text-align: center;
  padding: 24px 12px;
  font-size: 12px;
  color: #64748b;
}

.loadout-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.loadout-relic {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.6);
  text-align: left;
  cursor: pointer;
}

.loadout-relic.tier-uncommon { border-color: rgba(74, 222, 128, 0.45); }
.loadout-relic.tier-rare { border-color: rgba(56, 189, 248, 0.55); }
.loadout-relic.tier-epic { border-color: rgba(192, 132, 252, 0.65); }
.loadout-relic.tier-legendary { border-color: rgba(251, 146, 60, 0.78); }

.loadout-relic.equipped {
  background: rgba(251, 191, 36, 0.16);
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.5);
}

.lr-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.lr-text {
  flex: 1;
  min-width: 0;
}

.lr-name {
  font-size: 11.5px;
  font-weight: 800;
  color: #f8fafc;
}

.lr-desc {
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lr-check {
  font-size: 13px;
  font-weight: 900;
  color: #4ade80;
}

.loadout-relic-wrap {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 9px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.58);
}
.loadout-relic-wrap.tier-uncommon { border-color: rgba(74, 222, 128, 0.45); }
.loadout-relic-wrap.tier-rare { border-color: rgba(56, 189, 248, 0.55); }
.loadout-relic-wrap.tier-epic { border-color: rgba(192, 132, 252, 0.65); }
.loadout-relic-wrap.tier-legendary { border-color: rgba(251, 146, 60, 0.78); }
.loadout-relic-wrap.equipped {
  background: rgba(251, 191, 36, 0.16);
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.5);
}
.loadout-relic-main {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.rank-badge {
  margin-left: 4px;
  font-size: 10px;
  font-weight: 900;
  color: #fbbf24;
}
.lr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.mini-chip-btn {
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(30, 41, 59, 0.85);
  color: #e2e8f0;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}
.mini-chip-btn.active {
  border-color: rgba(56, 189, 248, 0.65);
  background: rgba(56, 189, 248, 0.16);
  color: #bae6fd;
}
.mini-chip-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.mini-max-tag {
  font-size: 10px;
  font-weight: 800;
  color: #4ade80;
}
.gem-picker-box {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gem-picker-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 800;
  color: #bae6fd;
}
.gem-picker-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.gem-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.gem-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.6);
}
.gem-icon {
  font-size: 18px;
}
.gem-info {
  flex: 1;
  min-width: 0;
}
.resonance-banner {
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.resonance-banner.active {
  color: #fde047;
  background: rgba(251, 191, 36, 0.14);
  border-color: rgba(251, 191, 36, 0.45);
}
.lr-enchant {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 700;
  color: #c4b5fd;
}
.tier-pill {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 800;
  background: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}
.tier-pill.tier-uncommon { background: rgba(34, 197, 94, 0.2); color: #86efac; }
.tier-pill.tier-rare { background: rgba(56, 189, 248, 0.22); color: #7dd3fc; }
.tier-pill.tier-epic { background: rgba(168, 85, 247, 0.25); color: #d8b4fe; }
.tier-pill.tier-legendary { background: rgba(249, 115, 22, 0.28); color: #fdba74; }

.armory-actions {
  display: flex;
  gap: 10px;
}

.armory-reset-btn {
  flex: 1;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.6);
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.armory-reset-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.armory-done-btn {
  flex: 1.4;
  padding: 11px 14px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #0f172a;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
}

@media (max-width: 520px) {
  .armory-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .talent-grid,
  .loadout-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-height: 540px) {
  .armory-wallet {
    padding: 7px 12px;
    margin-bottom: 6px;
  }
  .talent-grid,
  .hero-roster-list,
  .loadout-panel {
    max-height: 36vh;
    gap: 7px;
  }
  .talent-card {
    padding: 7px 9px;
    gap: 5px;
  }
}
</style>
