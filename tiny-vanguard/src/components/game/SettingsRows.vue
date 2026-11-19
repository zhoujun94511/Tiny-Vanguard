<script setup lang="ts">
import { computed } from 'vue';
import type { GameSettings, LanguageCode, QualityTier } from '../../game/core/GameTypes';
import { useI18n } from './useI18n';

defineProps<{
  settings: GameSettings;
}>();

const emit = defineEmits<{
  (e: 'setQuality', q: QualityTier): void;
  (e: 'setAudio', enabled: boolean): void;
  (e: 'setBgm', enabled: boolean): void;
  (e: 'setDamageNums', enabled: boolean): void;
  (e: 'setLanguage', lang: LanguageCode): void;
}>();

const { t } = useI18n();

const tiers = computed<{ id: QualityTier; label: string }[]>(() => [
  { id: 'low', label: t('pause.qLow') },
  { id: 'medium', label: t('pause.qMed') },
  { id: 'high', label: t('pause.qHigh') },
]);
</script>

<template>
  <div class="settings-list">
    <div class="setting-row">
      <span>{{ t('pause.quality') }}</span>
      <div class="seg-group">
        <button
          v-for="tier in tiers"
          :key="tier.id"
          type="button"
          class="seg-btn"
          :class="{ active: settings.quality === tier.id }"
          @click="emit('setQuality', tier.id)"
        >
          {{ tier.label }}
        </button>
      </div>
    </div>

    <div class="setting-row">
      <span>{{ t('pause.bgm') }}</span>
      <button
        type="button"
        class="seg-btn"
        :class="{ active: settings.bgmEnabled }"
        @click="emit('setBgm', !settings.bgmEnabled)"
      >
        {{ settings.bgmEnabled ? t('pause.audioOn') : t('pause.audioOff') }}
      </button>
    </div>

    <div class="setting-row">
      <span>{{ t('pause.audio') }}</span>
      <button
        type="button"
        class="seg-btn"
        :class="{ active: settings.audioEnabled }"
        @click="emit('setAudio', !settings.audioEnabled)"
      >
        {{ settings.audioEnabled ? t('pause.audioOn') : t('pause.audioOff') }}
      </button>
    </div>

    <div class="setting-row">
      <span>{{ t('pause.damageNums') }}</span>
      <button
        type="button"
        class="seg-btn"
        :class="{ active: settings.showDamageNumbers }"
        @click="emit('setDamageNums', !settings.showDamageNumbers)"
      >
        {{ settings.showDamageNumbers ? t('pause.audioOn') : t('pause.audioOff') }}
      </button>
    </div>

    <div class="setting-row">
      <span>{{ t('pause.lang') }}</span>
      <div class="seg-group">
        <button
          type="button"
          class="seg-btn"
          :class="{ active: settings.language === 'zh' }"
          @click="emit('setLanguage', 'zh')"
        >
          中文
        </button>
        <button
          type="button"
          class="seg-btn"
          :class="{ active: settings.language === 'en' }"
          @click="emit('setLanguage', 'en')"
        >
          EN
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  background: rgba(10, 17, 34, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.14);
  padding: 10px 12px;
  border-radius: 12px;
  transition: border-color 0.15s ease;
}
.setting-row:hover {
  border-color: rgba(92, 232, 255, 0.28);
}
.seg-group {
  display: flex;
  gap: 6px;
}
.seg-btn {
  padding: 5px 11px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(20, 32, 56, 0.85);
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s ease;
}
.seg-btn.active {
  background: linear-gradient(135deg, #ffd166, #f59e0b);
  color: #1e293b;
  border-color: #ffd166;
  box-shadow: 0 0 12px rgba(255, 209, 102, 0.28);
}
@media (max-height: 520px) {
  .settings-list {
    gap: 7px;
  }
  .setting-row {
    padding: 7px 10px;
    font-size: 12px;
  }
}
</style>
