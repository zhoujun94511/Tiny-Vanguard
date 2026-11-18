<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../game/useI18n';

const props = withDefaults(
  defineProps<{
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemUnitLabel?: string;
    alwaysShowSummary?: boolean;
  }>(),
  {
    itemUnitLabel: '',
    alwaysShowSummary: false,
  }
);

const emit = defineEmits<{
  (e: 'change', page: number): void;
}>();

const { t } = useI18n();

const pageNumbers = computed<Array<number | 'ellipsis'>>(() => {
  const total = props.totalPages;
  const cur = props.currentPage;
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const out: Array<number | 'ellipsis'> = [1];
  const left = Math.max(2, cur - 1);
  const right = Math.min(total - 1, cur + 1);
  if (left > 2) out.push('ellipsis');
  for (let p = left; p <= right; p += 1) out.push(p);
  if (right < total - 1) out.push('ellipsis');
  out.push(total);
  return out;
});
</script>

<template>
  <div v-if="totalPages > 1 || alwaysShowSummary" class="pagination-bar" role="navigation">
    <span class="pager-summary">
      {{ t('pager.summary', { page: currentPage, total: totalPages, count: totalItems }) }}
    </span>

    <div v-if="totalPages > 1" class="pager-controls">
      <button
        type="button"
        class="pager-btn"
        :disabled="currentPage <= 1"
        @click="emit('change', currentPage - 1)"
      >
        {{ t('pager.prev') }}
      </button>

      <template v-for="(entry, idx) in pageNumbers" :key="`${entry}-${idx}`">
        <span v-if="entry === 'ellipsis'" class="pager-ellipsis">…</span>
        <button
          v-else
          type="button"
          class="pager-page"
          :class="{ active: entry === currentPage }"
          @click="emit('change', entry)"
        >
          {{ entry }}
        </button>
      </template>

      <button
        type="button"
        class="pager-btn"
        :disabled="currentPage >= totalPages"
        @click="emit('change', currentPage + 1)"
      >
        {{ t('pager.next') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.pager-summary {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
.pager-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pager-btn,
.pager-page {
  min-width: 34px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(30, 41, 59, 0.85);
  color: #e2e8f0;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
}
.pager-btn:hover:not(:disabled),
.pager-page:hover:not(.active) {
  border-color: #ffd166;
  color: #ffd166;
}
.pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pager-page.active {
  background: linear-gradient(135deg, #ffd166, #f4a261);
  border-color: #ffd166;
  color: #1e293b;
  font-weight: 800;
}
.pager-ellipsis {
  color: #64748b;
  padding: 0 4px;
  font-size: 12px;
}
</style>
