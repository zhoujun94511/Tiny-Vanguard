<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    badgeIcon?: string;
    tone?: 'default' | 'gold' | 'danger';
    maxWidth?: string;
    closable?: boolean;
    closeOnBackdrop?: boolean;
    ariaLabel?: string;
  }>(),
  {
    tone: 'default',
    maxWidth: '400px',
    closable: false,
    closeOnBackdrop: false,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <div class="overlay gm-backdrop" @click.self="closeOnBackdrop && emit('close')">
    <div
      class="gm-shell"
      :class="`tone-${tone}`"
      :style="{ maxWidth }"
      role="dialog"
      aria-modal="true"
      :aria-label="ariaLabel ?? title"
    >
      <div v-if="title || closable" class="gm-header">
        <div class="gm-title-wrap">
          <span v-if="badgeIcon" class="gm-badge" aria-hidden="true">{{ badgeIcon }}</span>
          <h2 v-if="title" class="gm-title">{{ title }}</h2>
        </div>
        <button
          v-if="closable"
          type="button"
          class="gm-close"
          aria-label="Close"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="gm-body">
        <slot />
      </div>

      <div v-if="$slots.actions" class="gm-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gm-backdrop {
  background: radial-gradient(circle at 50% 42%, rgba(16, 28, 56, 0.72), rgba(5, 9, 20, 0.88));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.gm-shell {
  position: relative;
  width: 92%;
  max-height: 92dvh;
  overflow-y: auto;
  border-radius: 18px;
  padding: 20px;
  background: linear-gradient(168deg, rgba(18, 30, 56, 0.96) 0%, rgba(9, 15, 29, 0.98) 100%);
  border: 1px solid rgba(116, 224, 255, 0.24);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.68),
    0 0 32px rgba(56, 189, 248, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.gm-shell::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 16px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #38bdf8, #ffd166, transparent);
  opacity: 0.85;
}
.gm-shell.tone-gold {
  border-color: rgba(255, 209, 102, 0.34);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.68),
    0 0 36px rgba(255, 209, 102, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.gm-shell.tone-gold::before {
  background: linear-gradient(90deg, transparent, #ffd166, #f59e0b, transparent);
}
.gm-shell.tone-danger {
  border-color: rgba(255, 107, 107, 0.34);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.68),
    0 0 34px rgba(255, 107, 107, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.gm-shell.tone-danger::before {
  background: linear-gradient(90deg, transparent, #ff6b6b, #fb923c, transparent);
}
.gm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.gm-title-wrap {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.gm-badge {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(56, 189, 248, 0.14);
  border: 1px solid rgba(56, 189, 248, 0.32);
  display: grid;
  place-items: center;
  font-size: 16px;
  flex-shrink: 0;
}
.gm-shell.tone-gold .gm-badge {
  background: rgba(255, 209, 102, 0.14);
  border-color: rgba(255, 209, 102, 0.34);
}
.gm-shell.tone-danger .gm-badge {
  background: rgba(255, 107, 107, 0.14);
  border-color: rgba(255, 107, 107, 0.34);
}
.gm-title {
  margin: 0;
  color: #f8fafc;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.2px;
}
.gm-close {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.72);
  color: #94a3b8;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}
.gm-close:hover {
  color: #f8fafc;
  border-color: rgba(116, 224, 255, 0.42);
  background: rgba(30, 41, 59, 0.9);
}
.gm-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.gm-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
}
@media (max-height: 520px) {
  .gm-shell {
    padding: 14px 16px;
    gap: 10px;
  }
  .gm-title {
    font-size: 16px;
  }
  .gm-badge {
    width: 28px;
    height: 28px;
    font-size: 14px;
  }
  .gm-body {
    gap: 8px;
  }
  .gm-actions {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
  .gm-actions :deep(button) {
    flex: 1 1 30%;
  }
}
</style>
