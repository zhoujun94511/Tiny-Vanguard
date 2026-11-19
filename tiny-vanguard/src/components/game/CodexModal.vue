<script setup lang="ts">
import { ref } from 'vue';
import {
  ACHIEVEMENTS,
  SYNERGY_RECIPES,
} from '../../game/content/achievements/achievements';
import type { EquipmentDefinition } from '../../game/content/definitions/ContentTypes';
import {
  getRelicIcon,
  getRelicTierClass,
} from '../../game/content/icons/itemIcons';
import type { SaveData } from '../../game/core/GameTypes';
import GameModal from '../common/GameModal.vue';
import WeaponSvgIcon from '../common/WeaponSvgIcon.vue';
import { useI18n } from './useI18n';

const props = defineProps<{
  saveData: SaveData;
  relics: readonly EquipmentDefinition[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { lang, t, tc } = useI18n();
const activeTab = ref<'relics' | 'achievements'>('relics');

function isRelicDiscovered(id: string): boolean {
  return props.saveData.discoveredRelics.includes(id);
}

function isSynergyDiscovered(weaponId: string): boolean {
  return props.saveData.discoveredEvolvedWeapons.includes(weaponId);
}

function isAchievementUnlocked(id: string): boolean {
  return props.saveData.unlockedAchievements.includes(id);
}

function getRelicName(relicId: string): string {
  const found = props.relics.find((r) => r.id === relicId);
  if (!found) return relicId;
  return lang.value === 'en' ? found.nameEn : found.name;
}
</script>

<template>
  <GameModal
    badge-icon="📖"
    :title="t('codex.title')"
    max-width="560px"
    closable
    close-on-backdrop
    @close="emit('close')"
  >
    <div class="codex-tabs">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'relics' }"
        @click="activeTab = 'relics'"
      >
        👑 {{ t('codex.tabRelics', { found: saveData.discoveredRelics.length, total: relics.length }) }}
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'achievements' }"
        @click="activeTab = 'achievements'"
      >
        🏆 {{ t('codex.tabAch', { done: saveData.unlockedAchievements.length, total: ACHIEVEMENTS.length }) }}
      </button>
    </div>

    <div v-if="activeTab === 'relics'" class="codex-scroll">
      <div class="section-sub">{{ t('codex.synergies') }}</div>
      <div class="synergy-grid">
        <div
          v-for="syn in SYNERGY_RECIPES"
          :key="syn.weaponId"
          class="synergy-chip"
          :class="{ unlocked: isSynergyDiscovered(syn.weaponId) }"
        >
          <strong><WeaponSvgIcon :weapon-id="syn.weaponId" :size="15" /> {{ lang === 'en' ? syn.evolvedNameEn : syn.evolvedName }}</strong>
          <span><WeaponSvgIcon :weapon-id="syn.weaponId" :size="12" /> {{ tc(syn.weaponId, 'name', syn.weaponId) }} + {{ getRelicIcon(syn.relicId) }} {{ getRelicName(syn.relicId) }}</span>
        </div>
      </div>

      <div class="section-sub" style="margin-top: 10px">{{ t('codex.relicsTitle') }}</div>
      <div class="relic-grid">
        <div
          v-for="r in relics"
          :key="r.id"
          class="relic-card"
          :class="[getRelicTierClass(r.tier), { unlocked: isRelicDiscovered(r.id) }]"
        >
          <span class="relic-badge">{{ isRelicDiscovered(r.id) ? getRelicIcon(r.id) : '❓' }}</span>
          <div class="relic-meta">
            <div class="relic-name">
              {{ isRelicDiscovered(r.id) ? (lang === 'en' ? r.nameEn : r.name) : '???' }}
              <span v-if="isRelicDiscovered(r.id)" class="tier-pill" :class="getRelicTierClass(r.tier)">
                {{ t(`tier.${r.tier}`) }}
              </span>
            </div>
            <div class="relic-desc">
              {{ isRelicDiscovered(r.id) ? (lang === 'en' ? r.descriptionEn : r.description) : t('codex.lockedHint') }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="codex-scroll">
      <div class="ach-list">
        <div
          v-for="ach in ACHIEVEMENTS"
          :key="ach.id"
          class="ach-card"
          :class="{ unlocked: isAchievementUnlocked(ach.id) }"
        >
          <span class="ach-icon">{{ ach.icon }}</span>
          <div class="ach-body">
            <div class="ach-name">{{ lang === 'en' ? ach.nameEn : ach.name }}</div>
            <div class="ach-desc">{{ lang === 'en' ? ach.descEn : ach.desc }}</div>
          </div>
          <span class="ach-reward">
            {{ isAchievementUnlocked(ach.id) ? '✓' : `+⭐${ach.rewardStars}` }}
          </span>
        </div>
      </div>
    </div>

    <template #actions>
      <button type="button" class="btn-primary" @click="emit('close')">
        {{ t('menu.settingsClose') }}
      </button>
    </template>
  </GameModal>
</template>

<style scoped>
.codex-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.tab-btn {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.6);
  color: #94a3b8;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.tab-btn.active {
  border-color: rgba(251, 191, 36, 0.68);
  background: rgba(251, 191, 36, 0.14);
  color: #fde047;
}
.codex-scroll {
  max-height: 48vh;
  overflow-y: auto;
  padding-right: 4px;
}
.section-sub {
  font-size: 11px;
  font-weight: 800;
  color: #38bdf8;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.synergy-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.synergy-chip {
  padding: 6px 9px;
  border-radius: 9px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0.6;
}
.synergy-chip.unlocked {
  opacity: 1;
  border-color: rgba(192, 132, 252, 0.55);
  background: rgba(168, 85, 247, 0.12);
}
.synergy-chip strong {
  font-size: 12px;
  color: #f8fafc;
}
.synergy-chip span {
  font-size: 10px;
  color: #94a3b8;
}
.relic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.relic-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 9px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.14);
  opacity: 0.55;
}
.relic-card.unlocked {
  opacity: 1;
  border-color: rgba(148, 163, 184, 0.45);
}
.relic-card.unlocked.tier-uncommon {
  border-color: rgba(74, 222, 128, 0.55);
  background: rgba(34, 197, 94, 0.08);
}
.relic-card.unlocked.tier-rare {
  border-color: rgba(56, 189, 248, 0.55);
  background: rgba(56, 189, 248, 0.08);
}
.relic-card.unlocked.tier-epic {
  border-color: rgba(192, 132, 252, 0.65);
  background: rgba(168, 85, 247, 0.1);
}
.relic-card.unlocked.tier-legendary {
  border-color: rgba(251, 146, 60, 0.78);
  background: rgba(249, 115, 22, 0.12);
}
.relic-badge {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.relic-meta {
  min-width: 0;
  flex: 1;
}
.relic-name {
  font-size: 12px;
  font-weight: 800;
  color: #f8fafc;
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
.relic-desc {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
}
.ach-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.ach-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.16);
  opacity: 0.65;
}
.ach-card.unlocked {
  opacity: 1;
  border-color: rgba(74, 222, 128, 0.52);
  background: rgba(74, 222, 128, 0.08);
}
.ach-icon {
  font-size: 20px;
}
.ach-body {
  flex: 1;
  min-width: 0;
}
.ach-name {
  font-size: 13px;
  font-weight: 800;
  color: #f8fafc;
}
.ach-desc {
  font-size: 11px;
  color: #94a3b8;
}
.ach-reward {
  font-size: 12px;
  font-weight: 800;
  color: #fde047;
}
.ach-card.unlocked .ach-reward {
  color: #4ade80;
}
@media (max-width: 520px) {
  .synergy-grid,
  .relic-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-height: 540px) {
  .codex-scroll {
    max-height: 38vh;
  }
  .codex-tabs {
    margin-bottom: 7px;
  }
}
</style>
