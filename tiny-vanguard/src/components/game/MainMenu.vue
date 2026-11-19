<script setup lang="ts">
import { computed, ref } from 'vue';
import logoUrl from '../../assets/logo-ui.png';
import { APP_CONFIG } from '../../config/appConfig';
import type {
  CharacterDefinition,
  EquipmentDefinition,
  GameModeKey,
  LevelDefinition,
} from '../../game/content/definitions/ContentTypes';
import { getTalentUpgradeCost, TALENTS, type TalentId } from '../../game/content/talents/talents';
import type { GemTypeId } from '../../game/content/gems/gems';
import type { GameSettings, LanguageCode, QualityTier, SaveData } from '../../game/core/GameTypes';
import GameModal from '../common/GameModal.vue';
import ArmoryModal from './ArmoryModal.vue';
import CodexModal from './CodexModal.vue';
import SettingsRows from './SettingsRows.vue';
import { useI18n } from './useI18n';

const props = defineProps<{
  levels: readonly LevelDefinition[];
  characters: readonly CharacterDefinition[];
  relics: readonly EquipmentDefinition[];
  saveData: SaveData;
  settings: GameSettings;
  audioOn: boolean;
  touchMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'selectMode', mode: GameModeKey): void;
  (e: 'setQuality', q: QualityTier): void;
  (e: 'setAudio', enabled: boolean): void;
  (e: 'setBgm', enabled: boolean): void;
  (e: 'setDamageNums', enabled: boolean): void;
  (e: 'setLanguage', lang: LanguageCode): void;
  (e: 'toggleAudio'): void;
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

const settingsOpen = ref(false);
const armoryOpen = ref(false);
const codexOpen = ref(false);

const canUpgradeTalent = computed(() =>
  TALENTS.some((def) => {
    const lv = Math.max(0, Math.floor(props.saveData.talents[def.id] ?? 0));
    return lv < def.maxLevel && props.saveData.stars >= getTalentUpgradeCost(def, lv);
  })
);

const { t } = useI18n();

interface ModeEntrySummary {
  mode: GameModeKey;
  themeClass: string;
  icon: string;
  titleKey: string;
  badgeKey: string;
  descKey: string;
  clearedCount: number;
  totalCount: number;
}

const modeEntries = computed<ModeEntrySummary[]>(() => {
  const configs: Array<{
    mode: GameModeKey;
    themeClass: string;
    icon: string;
    titleKey: string;
    badgeKey: string;
    descKey: string;
  }> = [
    {
      mode: 'survival',
      themeClass: 'meadow-theme',
      icon: '🌾',
      titleKey: 'mode.survival.title',
      badgeKey: 'levels.badge.circle',
      descKey: 'mode.survival.desc',
    },
    {
      mode: 'defense',
      themeClass: 'bridge-theme',
      icon: '🌉',
      titleKey: 'mode.defense.title',
      badgeKey: 'levels.badge.bridge',
      descKey: 'mode.defense.desc',
    },
  ];

  return configs.map((c) => {
    const group = props.levels.filter(
      (l) => (l.modeGroup ?? (l.arenaShape === 'bridge' ? 'defense' : 'survival')) === c.mode
    );
    const cleared = group.filter((l) => (props.saveData.bestVictorySecByLevel[l.id] ?? 0) > 0).length;
    return {
      ...c,
      clearedCount: cleared,
      totalCount: group.length,
    };
  });
});
</script>

<template>
  <div class="title-screen">
    <div class="bg-grid" aria-hidden="true"></div>

    <!-- Top Utility Bar -->
    <div class="title-top">
      <span class="ver-pill">v{{ APP_CONFIG.version }}</span>

      <div class="top-actions">
        <button
          type="button"
          class="record-pill armory-pill"
          :aria-label="t('menu.armoryAria')"
          @click="armoryOpen = true"
        >
          <span>🛡️ <span class="armory-text">{{ t('menu.armoryPill') }}</span></span>
          <span class="sep">·</span>
          <span class="star-amt">⭐ {{ saveData.stars }}</span>
          <span v-if="canUpgradeTalent" class="armory-dot" aria-hidden="true"></span>
        </button>
        <div class="record-pill">
          <span>🏆 {{ saveData.victories }}</span>
          <span class="sep">·</span>
          <span>⚔ {{ saveData.totalRuns }}</span>
        </div>
        <button
          type="button"
          class="audio-pill"
          :class="{ muted: !audioOn }"
          :aria-label="t('menu.audioAria')"
          @click="emit('toggleAudio')"
        >
          {{ audioOn ? '🔊' : '🔇' }}
        </button>
        <button
          type="button"
          class="audio-pill"
          :aria-label="t('menu.codexAria')"
          @click="codexOpen = true"
        >
          📖
        </button>
        <button
          type="button"
          class="audio-pill"
          :aria-label="t('menu.settingsAria')"
          @click="settingsOpen = true"
        >
          ⚙️
        </button>
      </div>
    </div>

    <!-- Upper-Center Project Logo -->
    <div class="logo-section">
      <div class="logo-glow"></div>
      <img :src="logoUrl" alt="Tiny Vanguard" class="hero-logo" />
    </div>

    <!-- Lower-Center Two Core Gameplay Mode Cards (Never Expands With Stage Count) -->
    <div class="modes-section">
      <div class="modes-row">
        <button
          v-for="entry in modeEntries"
          :key="entry.mode"
          type="button"
          class="mode-card"
          :class="entry.themeClass"
          @click="emit('selectMode', entry.mode)"
        >
          <div class="card-accent"></div>
          <div class="mode-head">
            <span class="mode-icon">{{ entry.icon }}</span>
            <span class="mode-name">{{ t(entry.titleKey) }}</span>
            <span class="mode-tag">{{ t(entry.badgeKey) }}</span>
          </div>
          <p class="mode-desc">{{ t(entry.descKey) }}</p>
          <div class="mode-foot">
            <span class="mode-best">
              {{ t('mode.progress', { cleared: entry.clearedCount, total: entry.totalCount }) }}
            </span>
            <span class="mode-cta">{{ t('mode.enter') }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Bottom Adaptive Controls Hint Bar (Desktop Keyboard vs Small/Medium Touch) -->
    <div class="hint-strip">
      <template v-if="touchMode">
        <span class="hint-chip">🕹️ {{ t('menu.hintMoveTouch') }}</span>
        <span class="hint-chip">🎯 {{ t('menu.hintSkillTouch') }}</span>
        <span class="hint-chip">⚡ {{ t('menu.hintAuto') }}</span>
      </template>
      <template v-else>
        <span class="hint-chip"><kbd>WASD</kbd> {{ t('menu.hintMoveDesktop') }}</span>
        <span class="hint-chip"><kbd>Space</kbd> / <kbd>E</kbd> / <kbd>Q</kbd> {{ t('menu.hintSkillDesktop') }}</span>
        <span class="hint-chip">⚡ {{ t('menu.hintAuto') }}</span>
      </template>
    </div>
    <!-- Top-Level Menu Settings Modal -->
    <GameModal
      v-if="settingsOpen"
      badge-icon="⚙️"
      :title="t('menu.settingsTitle')"
      max-width="390px"
      closable
      close-on-backdrop
      @close="settingsOpen = false"
    >
      <SettingsRows
        :settings="settings"
        @set-quality="(q) => emit('setQuality', q)"
        @set-audio="(v) => emit('setAudio', v)"
        @set-bgm="(v) => emit('setBgm', v)"
        @set-damage-nums="(v) => emit('setDamageNums', v)"
        @set-language="(l) => emit('setLanguage', l)"
      />
      <template #actions>
        <button class="btn-primary" type="button" @click="settingsOpen = false">
          {{ t('menu.settingsClose') }}
        </button>
      </template>
    </GameModal>

    <ArmoryModal
      v-if="armoryOpen"
      :save-data="saveData"
      :characters="characters"
      :relics="relics"
      @close="armoryOpen = false"
      @upgrade-talent="(id) => emit('upgradeTalent', id)"
      @reset-talents="emit('resetTalents')"
      @unlock-character="(id) => emit('unlockCharacter', id)"
      @star-up-character="(id) => emit('starUpCharacter', id)"
      @toggle-loadout-relic="(id) => emit('toggleLoadoutRelic', id)"
      @unlock-second-slot="emit('unlockSecondSlot')"
      @refine-relic="(id) => emit('refineRelic', id)"
      @unlock-relic-socket="(id) => emit('unlockRelicSocket', id)"
      @socket-gem="(rid, gkey) => emit('socketGem', rid, gkey)"
      @unsocket-gem="(id) => emit('unsocketGem', id)"
      @fuse-gem="(gt, tier) => emit('fuseGem', gt, tier)"
      @enchant-relic="(id) => emit('enchantRelic', id)"
    />

    <CodexModal
      v-if="codexOpen"
      :save-data="saveData"
      :relics="relics"
      @close="codexOpen = false"
    />
  </div>
</template>

<style scoped>
.title-screen {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: max(16px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
  background:
    radial-gradient(circle at 22% 78%, rgba(56, 189, 248, 0.12) 0%, transparent 45%),
    radial-gradient(circle at 78% 78%, rgba(74, 222, 128, 0.1) 0%, transparent 45%),
    radial-gradient(circle at 50% 24%, #1e3a5f 0%, #0f172a 58%, #070b14 100%);
  overflow-y: auto;
  animation: menuFadeIn 0.32s ease-out;
}
.bg-grid {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.7), transparent 82%);
}
@keyframes menuFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.title-top {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.ver-pill {
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(255, 209, 102, 0.14);
  border: 1px solid rgba(255, 209, 102, 0.3);
  color: #ffd166;
  font-size: 12px;
  font-weight: 800;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.record-pill {
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 13px;
  font-weight: 700;
  color: #ffd166;
  display: flex;
  gap: 6px;
}
.armory-pill {
  cursor: pointer;
  border-color: rgba(251, 191, 36, 0.42);
  color: #f8fafc;
  transition: transform 0.14s ease, border-color 0.14s ease;
}
.armory-pill:hover {
  transform: translateY(-1px);
  border-color: rgba(251, 191, 36, 0.78);
}
.armory-pill .star-amt {
  color: #fde047;
  font-weight: 800;
}
.armory-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.9);
}
.sep {
  color: #64748b;
}
.audio-pill {
  min-width: 38px;
  text-align: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(15, 23, 42, 0.8);
  color: #f8fafc;
  font-size: 13px;
  cursor: pointer;
}
.audio-pill.muted {
  opacity: 0.65;
  border-color: rgba(148, 163, 184, 0.28);
}
.audio-pill:hover {
  border-color: #ffd166;
}
.logo-section {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  margin-top: 8px;
}
.logo-glow {
  position: absolute;
  width: clamp(200px, 28vw, 300px);
  height: clamp(200px, 28vw, 300px);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 209, 102, 0.3) 0%,
    rgba(78, 205, 196, 0.14) 48%,
    transparent 72%
  );
  pointer-events: none;
}
.hero-logo {
  position: relative;
  width: clamp(148px, 22vw, 224px);
  height: clamp(148px, 22vw, 224px);
  object-fit: contain;
  border-radius: 32px;
  filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.58));
}
.modes-section {
  position: relative;
  z-index: 1;
  width: min(1060px, 100%);
  display: flex;
  justify-content: center;
}
.modes-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  width: 100%;
}
.mode-card {
  position: relative;
  overflow: hidden;
  text-align: left;
  background: rgba(23, 34, 56, 0.88);
  border: 2px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  padding: 20px 22px;
  color: #f8fafc;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}
.card-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
}
.meadow-theme .card-accent {
  background: linear-gradient(90deg, #4ade80, #a3e635);
}
.bridge-theme .card-accent {
  background: linear-gradient(90deg, #38bdf8, #818cf8);
}
.mode-card:hover {
  transform: translateY(-4px);
  background: rgba(30, 44, 72, 0.96);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.48);
}
.meadow-theme:hover {
  border-color: #4ade80;
}
.bridge-theme:hover {
  border-color: #38bdf8;
}
.mode-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.mode-icon {
  font-size: 24px;
}
.mode-name {
  font-size: 20px;
  font-weight: 800;
  color: #ffd166;
}
.mode-tag {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(78, 205, 196, 0.18);
  color: #72efdd;
}
.mode-desc {
  margin: 0;
  font-size: 13.5px;
  color: #cbd5e1;
  line-height: 1.55;
  min-height: 3.1em;
  flex: 1;
}
.mode-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 12px;
  font-size: 13px;
}
.mode-best {
  color: #94a3b8;
  font-weight: 700;
}
.mode-cta {
  min-width: 108px;
  text-align: center;
  padding: 7px 18px;
  border-radius: 10px;
  background: linear-gradient(135deg, #ffd166, #f4a261);
  color: #1e293b;
  font-size: 13px;
  font-weight: 800;
}
.hint-strip {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
.hint-chip {
  font-size: 12px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  padding: 5px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
kbd {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  color: #ffd166;
}
@media (max-width: 720px) {
  .title-screen {
    padding: max(12px, env(safe-area-inset-top)) 14px max(12px, env(safe-area-inset-bottom)) 14px;
    gap: 12px;
  }
  .hero-logo {
    width: 132px;
    height: 132px;
  }
  .modes-row {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .mode-card {
    padding: 15px 16px;
  }
  .hint-strip {
    gap: 6px;
  }
  .hint-chip {
    font-size: 11px;
    padding: 4px 9px;
  }
}
@media (max-width: 640px) {
  .title-top {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .ver-pill {
    margin-right: auto;
  }
  .top-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }
}
@media (max-width: 480px) {
  .ver-pill,
  .armory-text,
  .armory-pill .sep {
    display: none;
  }
  .record-pill {
    padding: 5px 10px;
    font-size: 12px;
  }
}
@media (max-height: 520px) {
  .title-screen {
    padding: max(8px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(8px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    gap: 8px;
  }
  .logo-section {
    margin-top: 0;
  }
  .logo-glow {
    width: 110px;
    height: 110px;
  }
  .hero-logo {
    width: 82px;
    height: 82px;
    border-radius: 20px;
  }
  .modes-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .mode-card {
    padding: 12px 14px;
    gap: 6px;
  }
  .mode-name {
    font-size: 16px;
  }
  .mode-desc {
    font-size: 12px;
    line-height: 1.35;
    min-height: 2.6em;
  }
  .mode-foot {
    padding-top: 8px;
  }
  .hint-strip {
    display: none;
  }
}
</style>
