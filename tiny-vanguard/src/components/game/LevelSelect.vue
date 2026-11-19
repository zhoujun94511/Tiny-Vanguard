<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import type {
  CharacterDefinition,
  EquipmentDefinition,
  GameModeKey,
  LevelDefinition,
} from '../../game/content/definitions/ContentTypes';
import { getRelicIcon, getWeaponZhName } from '../../game/content/icons/itemIcons';
import {
  CHALLENGE_MODIFIERS,
  type ChallengeModifierId,
} from '../../game/content/modifiers/modifiers';
import type { SaveData } from '../../game/core/GameTypes';
import { computePreRunPreviewStats } from '../../game/core/PreRunPreview';
import HeroSvgIcon from '../common/HeroSvgIcon.vue';
import PaginationBar from '../common/PaginationBar.vue';
import { usePagination } from '../common/usePagination';
import { useI18n } from './useI18n';

const DESKTOP_STAGES_PER_PAGE = 4;
const MOBILE_STAGES_PER_PAGE = 3;
const LANDSCAPE_SHORT_STAGES_PER_PAGE = 2;

const props = defineProps<{
  mode: GameModeKey;
  levels: readonly LevelDefinition[];
  characters: readonly CharacterDefinition[];
  relics?: readonly EquipmentDefinition[];
  saveData: SaveData;
  unlockedLevelIds?: Record<string, boolean>;
}>();

const emit = defineEmits<{
  (e: 'select', levelId: string): void;
  (e: 'selectEndless', levelId: string): void;
  (e: 'selectCharacter', characterId: string): void;
  (e: 'toggleModifier', modifierId: ChallengeModifierId): void;
  (e: 'back'): void;
}>();

const { lang, t, tc, formatTime } = useI18n();

function computePageSize(): number {
  if (typeof window === 'undefined') return DESKTOP_STAGES_PER_PAGE;
  if (window.innerHeight <= 540) return LANDSCAPE_SHORT_STAGES_PER_PAGE;
  if (window.innerWidth <= 640 || window.innerHeight <= 680) return MOBILE_STAGES_PER_PAGE;
  return DESKTOP_STAGES_PER_PAGE;
}

const pageSize = ref(computePageSize());

let mqWidth: MediaQueryList | null = null;
let mqHeight: MediaQueryList | null = null;
function handleMediaChange() {
  pageSize.value = computePageSize();
}

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mqWidth = window.matchMedia('(max-width: 640px)');
    mqHeight = window.matchMedia('(max-height: 540px)');
    handleMediaChange();
    mqWidth.addEventListener('change', handleMediaChange);
    mqHeight.addEventListener('change', handleMediaChange);
  }
});

onUnmounted(() => {
  mqWidth?.removeEventListener('change', handleMediaChange);
  mqHeight?.removeEventListener('change', handleMediaChange);
  mqWidth = null;
  mqHeight = null;
});

const clearedCount = computed(
  () => props.levels.filter((l) => (props.saveData.bestVictorySecByLevel[l.id] ?? 0) > 0).length
);

const recommendedIndex = computed(() => {
  const idx = props.levels.findIndex(
    (l) => (props.saveData.bestVictorySecByLevel[l.id] ?? 0) <= 0
  );
  return idx >= 0 ? idx : Math.max(0, props.levels.length - 1);
});

const recommendedId = computed(() => props.levels[recommendedIndex.value]?.id ?? null);

const levelsRef = toRef(props, 'levels');
const {
  currentPage,
  totalPages,
  startIndex,
  pagedItems,
  goToPage,
  jumpToIndex,
} = usePagination(levelsRef, pageSize);

// Jump to the page holding the player's current recommended stage when switching modes
watch(
  [() => props.mode, recommendedIndex],
  () => {
    jumpToIndex(recommendedIndex.value);
  },
  { immediate: true }
);

function formatRecord(sec: number | undefined): string {
  if (!sec || sec <= 0) return t('levels.noRecord');
  return formatTime(sec);
}

function isVolcanicPalette(hex: number): boolean {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  return r >= g;
}

function getStageTheme(lvl: LevelDefinition): string {
  if (lvl.arenaShape === 'bridge') {
    return (lvl.bridgeConfig?.lanternColor ?? 0) === 0x38bdf8 ? 'frost-theme' : 'bridge-theme';
  }
  return isVolcanicPalette(lvl.groundColor) ? 'ember-theme' : 'meadow-theme';
}

function getStageIcon(lvl: LevelDefinition): string {
  if (lvl.id === 'shadow-ruins') return '🔮';
  if (lvl.id === 'iron-viaduct') return '⚙️';
  if (lvl.id === 'astral-throne') return '👑';
  if (lvl.id === 'abyss-span') return '🌌';
  if (lvl.arenaShape === 'bridge') {
    return (lvl.bridgeConfig?.lanternColor ?? 0) === 0x38bdf8 ? '❄️' : '🌉';
  }
  return isVolcanicPalette(lvl.groundColor) ? '🔥' : '🌾';
}

function isHeroUnlocked(id: string): boolean {
  return props.saveData.unlockedCharacters?.includes(id) ?? id === 'chibi-knight';
}

function getHeroStars(id: string): number {
  return props.saveData.characterStars?.[id] ?? 1;
}

function isLevelUnlocked(id: string): boolean {
  return props.unlockedLevelIds ? Boolean(props.unlockedLevelIds[id]) : true;
}

function canDirectEndless(lvl: LevelDefinition): boolean {
  return (lvl.stageOrder ?? 0) >= 4 && (props.saveData.bestVictorySecByLevel[lvl.id] ?? 0) > 0;
}

const selectedHero = computed(
  () =>
    props.characters.find((c) => c.id === props.saveData.selectedCharacterId) ??
    props.characters[0] ??
    null
);

const buildSummary = computed(() =>
  selectedHero.value
    ? computePreRunPreviewStats(selectedHero.value, props.saveData, props.relics ?? [])
    : null
);

function getStageStatus(lvl: LevelDefinition): 'cleared' | 'recommended' | 'open' | 'locked' {
  if (!isLevelUnlocked(lvl.id)) return 'locked';
  if ((props.saveData.bestVictorySecByLevel[lvl.id] ?? 0) > 0) return 'cleared';
  if (recommendedId.value === lvl.id) return 'recommended';
  return 'open';
}

function formatOrderNum(order: number | undefined, absIndex: number): string {
  const n = order ?? absIndex + 1;
  return String(n).padStart(2, '0');
}
</script>

<template>
  <div class="subscreen-backdrop" :class="`mode-${mode}`">
    <div class="stage-panel">
      <div class="panel-header">
        <div class="header-left">
          <span class="mode-badge-icon">{{ mode === 'defense' ? '🌉' : '🌾' }}</span>
          <div class="header-titles">
            <h2 class="heading">{{ t(`levels.modeTitle.${mode}`) }}</h2>
            <span class="progress-sub">
              {{ t('mode.progress', { cleared: clearedCount, total: levels.length }) }}
            </span>
          </div>
        </div>
        <button class="btn-back" type="button" @click="emit('back')">{{ t('levels.back') }}</button>
      </div>

      <!-- Hero Roster Selector -->
      <div v-if="characters.length > 0" class="hero-strip">
        <button
          v-for="ch in characters"
          :key="ch.id"
          type="button"
          class="hero-chip"
          :class="{
            active: saveData.selectedCharacterId === ch.id,
            locked: !isHeroUnlocked(ch.id),
          }"
          :disabled="!isHeroUnlocked(ch.id)"
          @click="emit('selectCharacter', ch.id)"
        >
          <HeroSvgIcon :hero-id="ch.id" :size="22" />
          <span class="hero-info">
            <strong class="hero-name">
              {{ tc(ch.id, 'name', ch.name) }}
              <span v-if="!isHeroUnlocked(ch.id)"> 🔒</span>
              <span v-else class="hero-star-tag"> ★{{ getHeroStars(ch.id) }}</span>
            </strong>
            <span class="hero-meta">
              {{ tc(ch.startingWeaponId, 'name', getWeaponZhName(ch.startingWeaponId)) }} · ❤️{{ ch.baseHp }}
            </span>
          </span>
        </button>
      </div>

      <!-- Pre-Run Build Summary Strip -->
      <div v-if="buildSummary" class="build-summary-strip">
        <span class="bs-title">{{ t('levels.buildSummary') }}</span>
        <span class="bs-stat">❤️ {{ buildSummary.maxHp }}</span>
        <span class="bs-stat">⚔️ {{ t('levels.dmgLabel') }} +{{ buildSummary.damageBonusPct }}%</span>
        <span class="bs-stat">🎯 {{ t('levels.critLabel') }} {{ buildSummary.critChancePct }}%</span>
        <span class="bs-stat">🎲 {{ t('levels.rerollLabel') }} ×{{ buildSummary.rerolls }}</span>
        <span v-for="rid in saveData.loadoutRelicIds" :key="rid" class="bs-relic">
          {{ getRelicIcon(rid) }}
        </span>
        <span v-if="buildSummary.resonanceActive" class="bs-res">{{ t('levels.resonanceTag') }}</span>
      </div>

      <!-- Challenge Modifiers Strip -->
      <div class="mod-strip">
        <button
          v-for="mod in CHALLENGE_MODIFIERS"
          :key="mod.id"
          type="button"
          class="mod-chip"
          :class="{ active: saveData.activeModifiers.includes(mod.id) }"
          :title="lang === 'en' ? mod.descEn : mod.desc"
          @click="emit('toggleModifier', mod.id)"
        >
          <span>{{ mod.icon }} {{ lang === 'en' ? mod.nameEn : mod.name }}</span>
          <span class="mod-bonus">+{{ mod.starBonusPct }}%⭐</span>
        </button>
      </div>

      <div class="stage-list">
        <div
          v-for="(lvl, localIdx) in pagedItems"
          :key="lvl.id"
          role="button"
          :tabindex="isLevelUnlocked(lvl.id) ? 0 : -1"
          class="stage-card"
          :class="[
            getStageTheme(lvl),
            {
              recommended: getStageStatus(lvl) === 'recommended',
              locked: !isLevelUnlocked(lvl.id),
            },
          ]"
          :aria-disabled="!isLevelUnlocked(lvl.id)"
          @click="isLevelUnlocked(lvl.id) && emit('select', lvl.id)"
          @keydown.enter="isLevelUnlocked(lvl.id) && emit('select', lvl.id)"
        >
          <div class="card-accent"></div>

          <div class="stage-index-col">
            <span class="stage-index">{{ formatOrderNum(lvl.stageOrder, startIndex + localIdx) }}</span>
            <span class="stage-icon">{{ isLevelUnlocked(lvl.id) ? getStageIcon(lvl) : '🔒' }}</span>
          </div>

          <div class="stage-body">
            <div class="stage-top-row">
              <span class="stage-seq-pill">
                {{ t('levels.stageNum', { num: lvl.stageOrder ?? startIndex + localIdx + 1 }) }}
              </span>
              <span class="stage-name">{{ tc(lvl.id, 'name', lvl.name) }}</span>
              <span class="status-chip" :class="getStageStatus(lvl)">
                <template v-if="getStageStatus(lvl) === 'locked'">🔒 {{ t('levels.lockedHint') }}</template>
                <template v-else-if="getStageStatus(lvl) === 'cleared'">✓ {{ t('levels.cleared') }}</template>
                <template v-else-if="getStageStatus(lvl) === 'recommended'">{{ t('levels.recommended') }}</template>
                <template v-else>{{ t('levels.open') }}</template>
              </span>
            </div>

            <p class="stage-desc">{{ tc(lvl.id, 'description', lvl.description) }}</p>

            <div class="stage-meta-row">
              <span class="meta-item">
                {{ t('levels.bestSurv') }}: <strong>{{ formatRecord(saveData.bestSurvivalSecByLevel[lvl.id]) }}</strong>
              </span>
              <span v-if="saveData.bestVictorySecByLevel[lvl.id]" class="meta-item">
                {{ t('levels.bestWin') }}: <strong>{{ formatRecord(saveData.bestVictorySecByLevel[lvl.id]) }}</strong>
              </span>
              <span v-if="(saveData.bestEndlessSecByLevel[lvl.id] ?? 0) > 0" class="meta-item">
                {{ t('levels.bestEndless') }}: <strong>{{ formatRecord(saveData.bestEndlessSecByLevel[lvl.id]) }}</strong>
              </span>
            </div>
          </div>

          <div class="stage-action-col">
            <button
              type="button"
              class="deploy-btn"
              :disabled="!isLevelUnlocked(lvl.id)"
              @click.stop="emit('select', lvl.id)"
            >
              {{ isLevelUnlocked(lvl.id) ? t('levels.deploy') : '🔒' }}
            </button>
            <button
              v-if="canDirectEndless(lvl)"
              type="button"
              class="deploy-btn endless-btn"
              @click.stop="emit('selectEndless', lvl.id)"
            >
              {{ t('levels.directEndless') }}
            </button>
          </div>
        </div>
      </div>

      <PaginationBar
        :current-page="currentPage"
        :total-pages="totalPages"
        :total-items="levels.length"
        @change="goToPage"
      />
    </div>
  </div>
</template>

<style scoped>
.subscreen-backdrop {
  position: fixed;
  inset: 0;
  z-index: 25;
  display: grid;
  place-items: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: radial-gradient(circle at 50% 24%, rgba(30, 58, 95, 0.72) 0%, rgba(7, 11, 20, 0.86) 100%);
  animation: fadeIn 0.2s ease-out;
}
.subscreen-backdrop.mode-survival {
  background: radial-gradient(circle at 50% 22%, rgba(20, 74, 52, 0.64) 0%, rgba(7, 16, 14, 0.84) 100%);
}
.subscreen-backdrop.mode-defense {
  background: radial-gradient(circle at 50% 22%, rgba(24, 54, 98, 0.66) 0%, rgba(7, 12, 24, 0.85) 100%);
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.stage-panel {
  width: min(820px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 22px;
  padding: 20px 22px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 14px;
}
.hero-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.hero-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.55);
  color: #cbd5e1;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.12s ease;
}
.hero-chip:hover {
  transform: translateY(-1px);
  border-color: rgba(251, 191, 36, 0.45);
}
.hero-chip.active {
  border-color: #fbbf24;
  background: rgba(251, 191, 36, 0.14);
  color: #f8fafc;
}
.hero-chip.locked {
  opacity: 0.48;
  cursor: not-allowed;
}
.hero-chip.locked:hover {
  transform: none;
  border-color: rgba(148, 163, 184, 0.2);
}
.hero-star-tag {
  color: #fbbf24;
  font-size: 11px;
}
.build-summary-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(56, 189, 248, 0.22);
  background: rgba(15, 23, 42, 0.55);
  font-size: 11px;
}
.bs-title {
  font-weight: 800;
  color: #7dd3fc;
  margin-right: 2px;
}
.bs-stat {
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(30, 41, 59, 0.85);
  color: #e2e8f0;
  font-weight: 700;
}
.bs-relic {
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(251, 191, 36, 0.16);
  border: 1px solid rgba(251, 191, 36, 0.35);
}
.bs-res {
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.22);
  color: #fde047;
  font-weight: 800;
}
.hero-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.35);
}
.hero-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.hero-name {
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero-meta {
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 640px) {
  .hero-strip {
    gap: 5px;
  }
  .hero-chip {
    padding: 6px 7px;
    gap: 6px;
  }
  .hero-dot {
    width: 9px;
    height: 9px;
  }
  .hero-name {
    font-size: 11px;
  }
  .hero-meta {
    font-size: 9px;
  }
  .mod-strip {
    gap: 5px;
  }
  .mod-chip {
    padding: 5px 6px;
    font-size: 10px;
  }
}
.mod-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.mod-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.48);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.mod-chip:hover {
  border-color: rgba(248, 113, 113, 0.5);
  color: #e2e8f0;
}
.mod-chip.active {
  border-color: rgba(248, 113, 113, 0.78);
  background: rgba(239, 68, 68, 0.14);
  color: #fecaca;
}
.mod-bonus {
  color: #fde047;
  font-weight: 800;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mode-badge-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255, 209, 102, 0.14);
  border: 1px solid rgba(255, 209, 102, 0.3);
  font-size: 22px;
}
.header-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.heading {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #ffd166;
}
.progress-sub {
  font-size: 12.5px;
  color: #94a3b8;
  font-weight: 700;
}
.btn-back {
  min-width: 76px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(30, 41, 59, 0.8);
  color: #f8fafc;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.btn-back:hover {
  border-color: #ffd166;
  color: #ffd166;
}
.stage-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stage-card {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 64px 1fr auto;
  align-items: center;
  gap: 16px;
  text-align: left;
  background: rgba(23, 34, 56, 0.9);
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 15px 18px;
  color: #f8fafc;
  cursor: pointer;
  transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease;
}
.stage-card.recommended {
  border-color: rgba(255, 209, 102, 0.48);
}
.stage-card.locked {
  opacity: 0.52;
  cursor: not-allowed;
}
.stage-card:hover {
  transform: translateY(-2px);
  background: rgba(30, 44, 72, 0.98);
  border-color: #ffd166;
}
.stage-card.locked:hover {
  transform: none;
  background: rgba(23, 34, 56, 0.9);
  border-color: rgba(255, 255, 255, 0.12);
}
.card-accent {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 4px;
}
.meadow-theme .card-accent {
  background: linear-gradient(180deg, #4ade80, #a3e635);
}
.ember-theme .card-accent {
  background: linear-gradient(180deg, #f97316, #ef4444);
}
.bridge-theme .card-accent {
  background: linear-gradient(180deg, #38bdf8, #818cf8);
}
.frost-theme .card-accent {
  background: linear-gradient(180deg, #38bdf8, #e0f2fe);
}
.stage-index-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 8px 6px;
}
.stage-index {
  font-size: 12px;
  font-weight: 900;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
.stage-icon {
  font-size: 22px;
  line-height: 1;
}
.stage-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.stage-top-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.stage-seq-pill {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}
.stage-name {
  font-size: 17px;
  font-weight: 800;
  color: #ffd166;
}
.status-chip {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 9px;
  border-radius: 999px;
}
.status-chip.cleared {
  background: rgba(74, 222, 128, 0.18);
  color: #4ade80;
}
.status-chip.recommended {
  background: rgba(255, 209, 102, 0.2);
  color: #ffd166;
}
.status-chip.open {
  background: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}
.status-chip.locked {
  background: rgba(100, 116, 139, 0.22);
  color: #94a3b8;
}
.stage-desc {
  margin: 0;
  font-size: 13px;
  color: #cbd5e1;
  line-height: 1.45;
}
.stage-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 12px;
  color: #94a3b8;
}
.meta-item strong {
  color: #e2e8f0;
}
.stage-action-col {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.deploy-btn {
  min-width: 96px;
  text-align: center;
  padding: 8px 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #ffd166, #f4a261);
  color: #1e293b;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.deploy-btn:disabled {
  cursor: not-allowed;
}
.deploy-btn.endless-btn {
  background: linear-gradient(135deg, #a855f7, #38bdf8);
  color: #f8fafc;
}
@media (max-width: 640px) {
  .stage-panel {
    padding: 14px 14px;
    max-height: 92dvh;
  }
  .stage-card {
    grid-template-columns: 52px 1fr;
    gap: 10px;
    padding: 12px 14px;
  }
  .stage-action-col {
    grid-column: 1 / -1;
    flex-direction: row;
    justify-content: flex-end;
  }
}
@media (max-height: 540px) {
  .subscreen-backdrop {
    padding: max(8px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
      max(8px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }
  .stage-panel {
    padding: 12px 16px;
    gap: 8px;
    max-height: 94dvh;
    overflow-y: auto;
  }
  .panel-header {
    padding-bottom: 8px;
  }
  .mode-badge-icon {
    width: 34px;
    height: 34px;
    font-size: 18px;
  }
  .heading {
    font-size: 16px;
  }
  .stage-list {
    gap: 8px;
  }
  .stage-card {
    padding: 10px 14px;
    gap: 12px;
  }
  .stage-desc {
    font-size: 12px;
    line-height: 1.3;
  }
}
</style>
