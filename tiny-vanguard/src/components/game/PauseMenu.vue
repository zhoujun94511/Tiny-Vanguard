<script setup lang="ts">
import { computed } from 'vue';
import type { GameSettings, LanguageCode, QualityTier } from '../../game/core/GameTypes';
import { useI18n } from './useI18n';

defineProps<{
  settings: GameSettings;
}>();

const emit = defineEmits<{
  (e: 'resume'): void;
  (e: 'restart'): void;
  (e: 'exit'): void;
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
  <div class="overlay modal-backdrop">
    <div class="card pause-card" role="dialog" aria-modal="true" :aria-label="t('pause.title')">
      <h2 class="title">{{ t('pause.title') }}</h2>

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

      <div class="actions">
        <button class="btn-primary" type="button" @click="emit('resume')">{{ t('pause.resume') }}</button>
        <button class="btn-secondary" type="button" @click="emit('restart')">{{ t('pause.restart') }}</button>
        <button class="btn-ghost" type="button" @click="emit('exit')">{{ t('pause.exit') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  background: rgba(10, 15, 30, 0.78);
}
.pause-card {
  max-width: 380px;
  width: 90%;
  max-height: 92dvh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.title {
  margin: 0;
  text-align: center;
  color: #fff;
  font-size: 20px;
}
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.55);
  padding: 10px 12px;
  border-radius: 10px;
}
.seg-group {
  display: flex;
  gap: 6px;
}
.seg-btn {
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(30, 41, 59, 0.8);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.seg-btn.active {
  background: #ffd166;
  color: #1e293b;
  border-color: #ffd166;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
@media (max-height: 520px) {
  .pause-card {
    gap: 8px;
    padding: 14px;
  }
  .title {
    font-size: 17px;
  }
  .setting-row {
    padding: 7px 10px;
    font-size: 12px;
  }
  .actions {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
  .actions button {
    flex: 1 1 30%;
  }
}
</style>
