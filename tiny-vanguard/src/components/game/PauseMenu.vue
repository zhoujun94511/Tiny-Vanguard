<script setup lang="ts">
import type { GameSettings, LanguageCode, QualityTier } from '../../game/core/GameTypes';
import GameModal from '../common/GameModal.vue';
import SettingsRows from './SettingsRows.vue';
import { useI18n } from './useI18n';

defineProps<{
  settings: GameSettings;
  endlessMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'resume'): void;
  (e: 'restart'): void;
  (e: 'extract'): void;
  (e: 'exit'): void;
  (e: 'setQuality', q: QualityTier): void;
  (e: 'setAudio', enabled: boolean): void;
  (e: 'setBgm', enabled: boolean): void;
  (e: 'setDamageNums', enabled: boolean): void;
  (e: 'setLanguage', lang: LanguageCode): void;
}>();

const { t } = useI18n();
</script>

<template>
  <GameModal
    badge-icon="⏸"
    :title="t('pause.title')"
    max-width="390px"
    closable
    @close="emit('resume')"
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
      <button class="btn-primary" type="button" @click="emit('resume')">{{ t('pause.resume') }}</button>
      <button class="btn-secondary" type="button" @click="emit('restart')">{{ t('pause.restart') }}</button>
      <button
        v-if="endlessMode"
        class="btn-ghost"
        type="button"
        @click="emit('extract')"
      >
        {{ t('pause.extract') }}
      </button>
      <button v-else class="btn-ghost" type="button" @click="emit('exit')">{{ t('pause.exit') }}</button>
    </template>
  </GameModal>
</template>
