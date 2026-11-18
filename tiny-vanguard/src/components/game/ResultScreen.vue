<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type { ResultSnapshot } from '../../game/core/GameTypes';
import { useI18n } from './useI18n';

const props = defineProps<{
  result: ResultSnapshot;
}>();

const emit = defineEmits<{
  (e: 'nextStage', levelId: string): void;
  (e: 'restart'): void;
  (e: 'exit'): void;
}>();

const { t, tc, formatTime } = useI18n();

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat) return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (props.result.victory && props.result.nextLevelId) {
      emit('nextStage', props.result.nextLevelId);
    } else {
      emit('restart');
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div class="overlay modal-backdrop">
    <div class="card result-card">
      <div class="banner" :class="result.victory ? 'win' : 'lose'">
        {{ result.victory ? t('res.win') : t('res.lose') }}
      </div>
      <p class="reason">
        {{ tc(result.levelId, 'name', result.levelName) }} ·
        {{ result.victory ? t('res.winReason') : t('res.loseReason') }}
      </p>

      <div class="summary-grid">
        <div class="sum-box">
          <span class="sum-label">{{ t('res.time') }}</span>
          <span class="sum-val">{{ formatTime(result.elapsedSec) }}</span>
        </div>
        <div class="sum-box">
          <span class="sum-label">{{ t('res.kills') }}</span>
          <span class="sum-val">{{ result.kills }}</span>
        </div>
        <div class="sum-box">
          <span class="sum-label">{{ t('res.level') }}</span>
          <span class="sum-val">Lv.{{ result.playerLevel }}</span>
        </div>
      </div>

      <div class="weapons-used">
        <span class="wu-label">{{ t('res.weapons') }}</span>
        <span v-for="w in result.weapons" :key="w.weaponId" class="wu-chip">
          {{ tc(w.weaponId, 'name', w.name) }}<template v-if="w.isEvolved"> ★</template>
        </span>
      </div>

      <div class="actions">
        <button
          v-if="result.victory && result.nextLevelId"
          class="btn-primary"
          type="button"
          @click="emit('nextStage', result.nextLevelId)"
        >
          {{ t('res.nextStage', { name: tc(result.nextLevelId, 'name', result.nextLevelName ?? '') }) }}
        </button>
        <button
          :class="result.victory && result.nextLevelId ? 'btn-ghost' : 'btn-primary'"
          type="button"
          @click="emit('restart')"
        >
          {{ t('res.restart') }}
        </button>
        <button class="btn-ghost" type="button" @click="emit('exit')">{{ t('res.exit') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  background: rgba(10, 15, 30, 0.82);
}
.result-card {
  max-width: 440px;
  width: 92%;
  max-height: 92dvh;
  overflow-y: auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.banner {
  font-size: 28px;
  font-weight: 900;
}
.banner.win {
  color: #ffd166;
}
.banner.lose {
  color: #ff6b6b;
}
.reason {
  margin: 0;
  font-size: 13px;
  color: #cbd5e1;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.sum-box {
  background: rgba(15, 23, 42, 0.6);
  border-radius: 12px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sum-label {
  font-size: 11px;
  color: #94a3b8;
}
.sum-val {
  font-size: 18px;
  font-weight: 800;
  color: #f8fafc;
}
.weapons-used {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
}
.wu-chip {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(78, 205, 196, 0.2);
  color: #72efdd;
  font-weight: 700;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
@media (max-height: 520px) {
  .result-card {
    gap: 8px;
    padding: 14px;
  }
  .banner {
    font-size: 22px;
  }
  .sum-box {
    padding: 6px 6px;
  }
  .sum-val {
    font-size: 15px;
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
