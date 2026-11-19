<script setup lang="ts">
import { onUnmounted, ref } from 'vue';

const emit = defineEmits<{
  (e: 'move', x: number, y: number): void;
}>();

const zoneRef = ref<HTMLElement | null>(null);
const baseRef = ref<HTMLElement | null>(null);
const active = ref(false);
const floatX = ref(0);
const floatY = ref(0);
const knobX = ref(0);
const knobY = ref(0);

let activePointerId: number | null = null;
let originX = 0;
let originY = 0;
const MAX_RADIUS = 34;
const MAX_FLOAT = 28;
const DEAD_ZONE = 0.045;

function resetJoystick() {
  if (activePointerId !== null && zoneRef.value) {
    try {
      if (zoneRef.value.hasPointerCapture?.(activePointerId)) {
        zoneRef.value.releasePointerCapture(activePointerId);
      }
    } catch {
      // Ignore synthetic / lost capture edge cases
    }
  }
  active.value = false;
  activePointerId = null;
  floatX.value = 0;
  floatY.value = 0;
  knobX.value = 0;
  knobY.value = 0;
  emit('move', 0, 0);
}

function updateDelta(clientX: number, clientY: number) {
  const dx = clientX - originX;
  const dy = clientY - originY;
  const dist = Math.hypot(dx, dy);

  let clampedX = dx;
  let clampedY = dy;
  if (dist > MAX_RADIUS) {
    clampedX = (dx / dist) * MAX_RADIUS;
    clampedY = (dy / dist) * MAX_RADIUS;
  }
  knobX.value = clampedX;
  knobY.value = clampedY;

  const norm = Math.min(1, dist / MAX_RADIUS);
  if (norm <= DEAD_ZONE || dist < 1e-4) {
    emit('move', 0, 0);
    return;
  }
  const remapped = (norm - DEAD_ZONE) / (1 - DEAD_ZONE);
  const curved = Math.min(1, Math.pow(remapped, 0.8));
  emit('move', (dx / dist) * curved, (dy / dist) * curved);
}

function onPointerDown(e: PointerEvent) {
  if (activePointerId !== null) return;
  const zone = zoneRef.value;
  const base = baseRef.value;
  if (!zone || !base) return;

  activePointerId = e.pointerId;
  const rect = base.getBoundingClientRect();
  const baseCx = rect.left + rect.width * 0.5;
  const baseCy = rect.top + rect.height * 0.5;

  // 26px floating thumb-anchor so initial tap never feels off-center
  const rawOffX = e.clientX - baseCx;
  const rawOffY = e.clientY - baseCy;
  const offDist = Math.hypot(rawOffX, rawOffY);
  const fx = offDist > MAX_FLOAT ? (rawOffX / offDist) * MAX_FLOAT : rawOffX;
  const fy = offDist > MAX_FLOAT ? (rawOffY / offDist) * MAX_FLOAT : rawOffY;
  floatX.value = fx;
  floatY.value = fy;
  originX = baseCx + fx;
  originY = baseCy + fy;
  active.value = true;

  try {
    zone.setPointerCapture(e.pointerId);
  } catch {
    // Ignore if synthetic pointer cannot be captured
  }
  updateDelta(e.clientX, e.clientY);
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return;
  updateDelta(e.clientX, e.clientY);
}

function onPointerUpOrCancel(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return;
  resetJoystick();
}

onUnmounted(() => {
  resetJoystick();
});
</script>

<template>
  <div
    ref="zoneRef"
    class="touch-joy-zone"
    @pointerdown.prevent.stop="onPointerDown"
    @pointermove.prevent.stop="onPointerMove"
    @pointerup="onPointerUpOrCancel"
    @pointercancel="onPointerUpOrCancel"
    @lostpointercapture="resetJoystick"
  >
    <div
      ref="baseRef"
      class="touch-joy-base"
      :class="{ active }"
      :style="{ transform: `translate3d(${floatX.toFixed(1)}px, ${floatY.toFixed(1)}px, 0)` }"
    >
      <span class="joy-tick top" aria-hidden="true">▲</span>
      <span class="joy-tick bottom" aria-hidden="true">▼</span>
      <span class="joy-tick left" aria-hidden="true">◀</span>
      <span class="joy-tick right" aria-hidden="true">▶</span>
      <div
        class="touch-joy-knob"
        :style="{ transform: `translate3d(${knobX.toFixed(1)}px, ${knobY.toFixed(1)}px, 0)` }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.touch-joy-zone {
  position: fixed;
  left: max(16px, env(safe-area-inset-left, 16px));
  bottom: calc(env(safe-area-inset-bottom, 0px) + 22px);
  width: 156px;
  height: 156px;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
  z-index: 22;
}
.touch-joy-base {
  position: relative;
  width: 116px;
  height: 116px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(20, 36, 58, 0.58) 0%, rgba(10, 18, 30, 0.82) 100%);
  border: 2px solid rgba(92, 232, 255, 0.46);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  will-change: transform;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.touch-joy-base.active {
  border-color: #5ce8ff;
  background: radial-gradient(circle, rgba(32, 62, 96, 0.68) 0%, rgba(12, 22, 38, 0.88) 100%);
  box-shadow: 0 0 22px rgba(92, 232, 255, 0.45);
}
.joy-tick {
  position: absolute;
  font-size: 9px;
  line-height: 1;
  color: rgba(154, 245, 255, 0.48);
  pointer-events: none;
}
.joy-tick.top {
  top: 7px;
  left: 50%;
  transform: translateX(-50%);
}
.joy-tick.bottom {
  bottom: 7px;
  left: 50%;
  transform: translateX(-50%);
}
.joy-tick.left {
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
}
.joy-tick.right {
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}
.touch-joy-knob {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #9af5ff, #2ca8d9);
  border: 2px solid #e6fcff;
  box-shadow: 0 4px 14px rgba(44, 188, 255, 0.58);
  will-change: transform;
}
@media (max-width: 1024px) {
  .touch-joy-zone {
    left: max(16px, env(safe-area-inset-left, 16px));
    bottom: calc(env(safe-area-inset-bottom, 0px) + 34px);
    width: 144px;
    height: 144px;
  }
  .touch-joy-base {
    width: 116px;
    height: 116px;
  }
}
@media (max-width: 640px) {
  .touch-joy-zone {
    left: max(14px, env(safe-area-inset-left, 14px));
    bottom: calc(env(safe-area-inset-bottom, 0px) + 38px);
    width: 136px;
    height: 136px;
  }
  .touch-joy-base {
    width: 116px;
    height: 116px;
  }
  .touch-joy-knob {
    width: 44px;
    height: 44px;
  }
}
@media (max-height: 520px) {
  .touch-joy-zone {
    width: 116px;
    height: 116px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
  }
  .touch-joy-base {
    width: 96px;
    height: 96px;
  }
  .touch-joy-knob {
    width: 40px;
    height: 40px;
  }
}
</style>
