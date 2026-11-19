<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { getRelicIcon } from '../../game/content/icons/itemIcons';
import type { ResultSnapshot } from '../../game/core/GameTypes';
import GameModal from '../common/GameModal.vue';
import WeaponSvgIcon from '../common/WeaponSvgIcon.vue';
import { useI18n } from './useI18n';

const props = defineProps<{
  result: ResultSnapshot;
}>();

const earnedShardCount = computed(() =>
  Object.values(props.result.earnedShards ?? {}).reduce((sum, v) => sum + v, 0)
);
const earnedGemCount = computed(() =>
  Object.values(props.result.earnedGems ?? {}).reduce((sum, v) => sum + v, 0)
);

const emit = defineEmits<{
  (e: 'nextStage', levelId: string): void;
  (e: 'enterEndless'): void;
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
  <GameModal
    :tone="result.victory ? 'gold' : 'danger'"
    max-width="440px"
    :aria-label="result.victory ? t('res.win') : t('res.lose')"
  >
    <div class="result-body">
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
          <WeaponSvgIcon :weapon-id="w.weaponId" :size="14" /> {{ tc(w.weaponId, 'name', w.name) }}<template v-if="w.isEvolved"> ★</template>
        </span>
      </div>

      <div v-if="result.relicIds.length > 0" class="weapons-used" style="margin-top: 8px">
        <span class="wu-label">{{ t('res.relics') }}</span>
        <span
          v-for="rid in result.relicIds.slice(0, 8)"
          :key="rid"
          class="wu-chip relic-chip"
          :class="{ 'is-new': result.newlyDiscoveredRelicIds?.includes(rid) }"
        >
          {{ getRelicIcon(rid) }}
          <span v-if="result.newlyDiscoveredRelicIds?.includes(rid)" class="new-badge">NEW</span>
        </span>
        <span v-if="result.relicIds.length > 8" class="wu-chip relic-chip">+{{ result.relicIds.length - 8 }}</span>
      </div>

      <div class="rewards-row">
        <div class="earned-stars-pill">
          ⭐ {{ t('res.earnedStars', { count: result.earnedStars }) }}
        </div>
        <div v-if="earnedShardCount > 0" class="earned-stars-pill shard-pill">
          🧩 {{ t('res.earnedShards', { count: earnedShardCount }) }}
        </div>
        <div v-if="earnedGemCount > 0" class="earned-stars-pill shard-pill">
          💎 {{ t('res.earnedGems', { count: earnedGemCount }) }}
        </div>
      </div>
    </div>

    <template #actions>
      <button
        v-if="result.victory && result.nextLevelId"
        class="btn-primary"
        type="button"
        @click="emit('nextStage', result.nextLevelId)"
      >
        {{ t('res.nextStage', { name: tc(result.nextLevelId, 'name', result.nextLevelName ?? '') }) }}
      </button>
      <button
        v-if="result.victory && !result.isEndless && !result.nextLevelId"
        class="btn-ghost"
        type="button"
        @click="emit('enterEndless')"
      >
        {{ t('res.endless') }}
      </button>
      <button
        :class="result.victory && result.nextLevelId ? 'btn-ghost' : 'btn-primary'"
        type="button"
        @click="emit('restart')"
      >
        {{ t('res.restart') }}
      </button>
      <button class="btn-ghost" type="button" @click="emit('exit')">{{ t('res.exit') }}</button>
    </template>
  </GameModal>
</template>

<style scoped>
.result-body {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
.rewards-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.shard-pill {
  border-color: rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.14);
  color: #bae6fd;
}
.relic-chip.is-new {
  background: rgba(251, 191, 36, 0.24);
  border: 1px solid rgba(251, 191, 36, 0.65);
  color: #fde047;
}
.new-badge {
  margin-left: 3px;
  font-size: 9px;
  font-weight: 900;
  color: #fde047;
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
.earned-stars-pill {
  margin-top: 10px;
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.14);
  border: 1px solid rgba(251, 191, 36, 0.36);
  color: #fde047;
  font-size: 12px;
  font-weight: 800;
}
</style>
