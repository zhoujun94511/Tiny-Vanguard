<script setup lang="ts">
defineProps<{
  weaponId: string;
  size?: number;
}>();
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="weapon-svg"
    aria-hidden="true"
  >
    <!-- Star Blaster -->
    <template v-if="weaponId === 'star-blaster'">
      <path d="M12 2L14.6 9.4L22 12L14.6 14.6L12 22L9.4 14.6L2 12L9.4 9.4L12 2Z" fill="#7DD3FC" stroke="#E0F2FE" stroke-width="1.5" stroke-linejoin="round" />
      <circle cx="12" cy="12" r="2.5" fill="#FDE047" />
    </template>

    <!-- Orbit Shields -->
    <template v-else-if="weaponId === 'orbit-shields'">
      <path d="M12 3L19 6V11.8C19 16.2 16 19.8 12 21C8 19.8 5 16.2 5 11.8V6L12 3Z" fill="#0284C7" fill-opacity="0.35" stroke="#38BDF8" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M12 7L15 8.5V12C15 14.4 13.7 16.4 12 17.2C10.3 16.4 9 14.4 9 12V8.5L12 7Z" fill="#BAE6FD" />
    </template>

    <!-- Frost Nova -->
    <template v-else-if="weaponId === 'frost-nova'">
      <path d="M12 2V22M2 12H22M4.9 4.9L19.1 19.1M19.1 4.9L4.9 19.1" stroke="#7DD3FC" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="12" r="3" fill="#E0F2FE" stroke="#0EA5E9" stroke-width="1.5" />
    </template>

    <!-- Thunder Arc -->
    <template v-else-if="weaponId === 'thunder-arc'">
      <path d="M13.5 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13.5 2Z" fill="#C084FC" stroke="#F3E8FF" stroke-width="1.5" stroke-linejoin="round" />
    </template>

    <!-- Rail Sniper -->
    <template v-else-if="weaponId === 'rail-sniper'">
      <circle cx="12" cy="12" r="8" stroke="#FB7185" stroke-width="1.8" />
      <path d="M12 2V6M12 18V22M2 12H6M18 12H22" stroke="#FDA4AF" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="12" cy="12" r="2.6" fill="#FDE047" />
    </template>

    <!-- Boomerang Axe -->
    <template v-else-if="weaponId === 'boomerang-axe'">
      <path d="M5 19L19 5" stroke="#CBD5E1" stroke-width="2.2" stroke-linecap="round" />
      <path d="M13 4C17.5 4 20 6.5 20 11L14.5 9.5L13 4Z" fill="#F59E0B" stroke="#FEF08A" stroke-width="1.4" stroke-linejoin="round" />
    </template>

    <!-- Venom Aura -->
    <template v-else-if="weaponId === 'venom-aura'">
      <circle cx="12" cy="12" r="8.5" stroke="#4ADE80" stroke-width="1.6" stroke-dasharray="3 2.5" />
      <path d="M12 6C9.5 9.2 8 11.4 8 13.8C8 16 9.8 17.8 12 17.8C14.2 17.8 16 16 16 13.8C16 11.4 14.5 9.2 12 6Z" fill="#22C55E" stroke="#BBF7D0" stroke-width="1.4" />
    </template>

    <!-- Seeker Missile -->
    <template v-else-if="weaponId === 'seeker-missile'">
      <path d="M19 5L14 15L10.5 13.5L9 10L19 5Z" fill="#F472B6" stroke="#FCE7F3" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M9 15L5 19M11 17L8 20M7 13L4 16" stroke="#FB923C" stroke-width="1.8" stroke-linecap="round" />
    </template>

    <!-- Fallback Sword -->
    <template v-else>
      <path d="M19 5L9 15M6 12L12 18M5 19L8 16" stroke="#FDE047" stroke-width="2" stroke-linecap="round" />
    </template>
  </svg>
</template>

<style scoped>
.weapon-svg {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
