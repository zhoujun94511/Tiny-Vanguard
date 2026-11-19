<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    heroId: string;
    size?: number;
  }>(),
  { size: 22 }
);
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="hero-svg-icon"
    aria-hidden="true"
  >
    <!-- Storm Ranger: Bow & Arrow -->
    <template v-if="heroId === 'storm-ranger'">
      <circle cx="12" cy="12" r="10.5" fill="rgba(56, 189, 248, 0.16)" stroke="#38bdf8" stroke-width="1.4" />
      <path
        d="M7.5 16.5C11.5 16.5 15.5 12.5 15.5 6.5"
        stroke="#7dd3fc"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path d="M7.5 16.5L15.5 6.5" stroke="#bae6fd" stroke-width="1.1" stroke-dasharray="1.5 1.5" />
      <path d="M8.5 8.5L16.5 16.5M16.5 16.5H12.5M16.5 16.5V12.5" stroke="#fde047" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <!-- Iron Bastion: Heavy Tower Shield & Hammer -->
    <template v-else-if="heroId === 'iron-bastion'">
      <circle cx="12" cy="12" r="10.5" fill="rgba(251, 146, 60, 0.16)" stroke="#fb923c" stroke-width="1.4" />
      <path
        d="M6.5 7.5L12 5.5L17.5 7.5V12.2C17.5 15.6 15.1 18.2 12 19.2C8.9 18.2 6.5 15.6 6.5 12.2V7.5Z"
        fill="rgba(249, 115, 22, 0.25)"
        stroke="#fdba74"
        stroke-width="1.7"
        stroke-linejoin="round"
      />
      <path d="M12 8.5V15.5M9.2 11.2H14.8" stroke="#fef08a" stroke-width="1.8" stroke-linecap="round" />
    </template>

    <!-- Chibi Knight (Default): Vanguard Sword & Crest -->
    <template v-else>
      <circle cx="12" cy="12" r="10.5" fill="rgba(78, 205, 196, 0.16)" stroke="#4ecdc4" stroke-width="1.4" />
      <path
        d="M15.8 6.2L17.8 8.2L11.2 14.8L9.2 12.8L15.8 6.2Z"
        fill="#a5f3fc"
        stroke="#ecfeff"
        stroke-width="1.1"
        stroke-linejoin="round"
      />
      <path d="M8 12.2L11.8 16M7.2 16.8L9.6 14.4" stroke="#ffd166" stroke-width="1.9" stroke-linecap="round" />
    </template>
  </svg>
</template>

<style scoped>
.hero-svg-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
