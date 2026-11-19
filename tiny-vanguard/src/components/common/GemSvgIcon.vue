<script setup lang="ts">
import { computed } from 'vue';
import type { GemTier, GemTypeId } from '../../game/content/gems/gems';

const props = withDefaults(
  defineProps<{
    gemType: GemTypeId;
    tier?: GemTier;
    size?: number;
  }>(),
  { tier: 1, size: 18 }
);

const palette = computed(() => {
  if (props.gemType === 'ruby') {
    return { main: '#f43f5e', light: '#fda4af', dark: '#9f1239' };
  }
  if (props.gemType === 'emerald') {
    return { main: '#22c55e', light: '#86efac', dark: '#166534' };
  }
  if (props.gemType === 'sapphire') {
    return { main: '#38bdf8', light: '#bae6fd', dark: '#075985' };
  }
  return { main: '#facc15', light: '#fef08a', dark: '#a16207' };
});
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="gem-svg-icon"
    aria-hidden="true"
  >
    <polygon
      points="12,2 20,8 17,20 7,20 4,8"
      :fill="palette.main"
      :stroke="tier >= 3 ? '#fef08a' : palette.light"
      :stroke-width="tier >= 2 ? 1.8 : 1.2"
      stroke-linejoin="round"
    />
    <polygon points="12,2 16.5,8.5 12,13 7.5,8.5" :fill="palette.light" opacity="0.65" />
    <polygon points="7.5,8.5 12,13 7,20 4,8" :fill="palette.dark" opacity="0.45" />
    <polygon points="16.5,8.5 20,8 17,20 12,13" :fill="palette.dark" opacity="0.3" />
    <circle v-if="tier >= 2" cx="12" cy="8.5" r="1.3" fill="#ffffff" opacity="0.9" />
  </svg>
</template>

<style scoped>
.gem-svg-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
