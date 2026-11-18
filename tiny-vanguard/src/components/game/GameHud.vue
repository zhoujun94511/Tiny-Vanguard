<script setup lang="ts">
import { computed } from 'vue';
import type { HudSnapshot } from '../../game/core/GameTypes';
import { useI18n } from './useI18n';

const props = defineProps<{
  hud: HudSnapshot;
  touchMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'pause'): void;
  (e: 'dash'): void;
  (e: 'guard'): void;
  (e: 'fury'): void;
}>();

const { t, tc, formatTime } = useI18n();

const hpPct = computed(() =>
  Math.max(0, Math.min(100, (props.hud.hp / Math.max(1, props.hud.maxHp)) * 100))
);
const shieldPct = computed(() =>
  props.hud.maxHp > 0
    ? Math.max(0, Math.min(100, (props.hud.shield / Math.max(1, props.hud.maxHp)) * 100))
    : 0
);
const xpPct = computed(() =>
  Math.max(0, Math.min(100, (props.hud.xp / Math.max(1, props.hud.xpToNext)) * 100))
);
const bossHpPct = computed(() =>
  props.hud.boss
    ? Math.max(0, Math.min(100, (props.hud.boss.hp / Math.max(1, props.hud.boss.maxHp)) * 100))
    : 0
);

const bossPhaseText = computed(() => {
  if (!props.hud.boss) return '';
  if (props.hud.boss.phaseKey === 'shield') return t('hud.bossShield');
  if (props.hud.boss.phaseKey === 'slam') return t('hud.bossSlam');
  if (props.hud.boss.phaseKey === 'dash') return t('hud.bossDash');
  if (props.hud.boss.phaseKey === 'enrage') return t('hud.bossEnrage');
  return t('hud.bossFight');
});

const supplyArrowAngle = computed(() => {
  if (!props.hud.supply) return 0;
  return (Math.atan2(props.hud.supply.dirX, -props.hud.supply.dirZ) * 180) / Math.PI;
});

const WEAPON_ICONS: Record<string, string> = {
  'star-blaster': '✨',
  'orbit-shields': '🛡️',
  'frost-nova': '❄️',
  'thunder-arc': '⚡',
  'rail-sniper': '🎯',
};

function weaponIcon(weaponId: string): string {
  return WEAPON_ICONS[weaponId] ?? '⚔️';
}

const RING_CIRCUMFERENCE = 175.93;

type ActiveSkillId = 'dash' | 'guard' | 'fury';
interface ArcSkillItem {
  id: ActiveSkillId;
  cls: string;
  icon: string;
  label: string;
  keyLabel: string;
  ratio: number;
  ready: boolean;
  disabled: boolean;
  style: Record<string, string>;
}

const arcSkills = computed<ArcSkillItem[]>(() => [
  {
    id: 'dash',
    cls: 'dash-btn',
    icon: '💨',
    label: t('hud.dash'),
    keyLabel: 'Space',
    ratio: props.hud.dashReadyRatio,
    ready: props.hud.dashReadyRatio >= 0.99,
    disabled: false,
    style: getArcSlotStyle(0, 3),
  },
  {
    id: 'guard',
    cls: 'guard-btn',
    icon: '🛡️',
    label: t('hud.guard'),
    keyLabel: 'E',
    ratio: props.hud.guardReadyRatio,
    ready: props.hud.guardReadyRatio >= 0.99,
    disabled: false,
    style: getArcSlotStyle(1, 3),
  },
  {
    id: 'fury',
    cls: 'fury-btn',
    icon: '☄️',
    label: t('hud.fury'),
    keyLabel: 'Q',
    ratio: props.hud.furyRatio,
    ready: props.hud.furyRatio >= 1,
    disabled: props.hud.furyRatio < 1,
    style: getArcSlotStyle(2, 3),
  },
]);

function getArcSlotStyle(idx: number, count: number): Record<string, string> {
  const startDeg = 168;
  const endDeg = 92;
  const deg = count <= 1 ? 130 : startDeg - (idx / (count - 1)) * (startDeg - endDeg);
  const rad = (deg * Math.PI) / 180;
  return {
    '--ux': (-Math.cos(rad)).toFixed(4),
    '--uy': Math.sin(rad).toFixed(4),
    '--arc-spread': count > 3 ? `${(count - 3) * 18}px` : '0px',
  };
}

let lastSkillTapAt = 0;
function emitSkill(kind: ActiveSkillId) {
  if (kind === 'fury') emit('fury');
  else if (kind === 'guard') emit('guard');
  else emit('dash');
}

function triggerSkillTap(kind: ActiveSkillId) {
  const now = performance.now();
  if (now - lastSkillTapAt < 120) return;
  lastSkillTapAt = now;
  emitSkill(kind);
}
</script>

<template>
  <div class="hud-layer">
    <div class="hud-top">
      <!-- Top Left: HP + XP + Level + Compact Weapon Slots -->
      <div class="hud-left-col">
        <div class="hud-panel player-panel">
          <div class="row-between">
            <span class="lv-badge">Lv.{{ hud.level }}</span>
            <span class="hp-text">
              {{ hud.hp }} / {{ hud.maxHp }}
              <span v-if="hud.shield > 0" class="shield-badge">+{{ hud.shield }}</span>
            </span>
          </div>
          <div class="bar-track hp-track">
            <div class="bar-fill hp-fill" :style="{ width: hpPct + '%' }"></div>
            <div v-if="hud.shield > 0" class="bar-fill shield-fill" :style="{ width: shieldPct + '%' }"></div>
          </div>
          <div class="bar-track xp-track">
            <div class="bar-fill xp-fill" :style="{ width: xpPct + '%' }"></div>
          </div>
        </div>

        <div class="weapons-bar">
          <div
            v-for="idx in hud.maxWeaponSlots"
            :key="idx"
            class="weapon-slot"
            :class="{ empty: !hud.weaponSlots[idx - 1], evolved: hud.weaponSlots[idx - 1]?.isEvolved }"
          >
            <template v-if="hud.weaponSlots[idx - 1]">
              <span class="w-icon">{{ weaponIcon(hud.weaponSlots[idx - 1].weaponId) }}</span>
              <span class="w-name">{{ tc(hud.weaponSlots[idx - 1].weaponId, 'name', hud.weaponSlots[idx - 1].name) }}</span>
              <span v-if="hud.weaponSlots[idx - 1].level > 1" class="w-lv">Lv.{{ hud.weaponSlots[idx - 1].level }}</span>
              <span v-if="hud.weaponSlots[idx - 1].isEvolved" class="w-evo">★</span>
              <span
                class="w-cd-bar"
                :style="{ width: `${Math.max(0, Math.min(100, (1 - (hud.weaponSlots[idx - 1].cooldownRatio ?? 0)) * 100))}%` }"
              ></span>
            </template>
            <template v-else>
              <span class="w-empty">{{ t('hud.emptySlot') }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- Top Center: Timer + Stage + Boss -->
      <div class="hud-center">
        <div class="timer-pill" :class="{ boss: hud.stageProgress >= 1 }">
          <span v-if="hud.stageProgress >= 1" class="stage-boss-icon" aria-hidden="true">💀</span>
          <span class="time-val">{{ formatTime(hud.elapsedSec) }}</span>
          <span class="stage-name">{{ tc(hud.stageId, 'label', hud.stageLabel) }}</span>
          <span class="stage-progress-track">
            <span
              class="stage-progress-fill"
              :style="{ width: `${Math.max(0, Math.min(100, Math.round(hud.stageProgress * 100)))}%` }"
            ></span>
          </span>
        </div>

        <div v-if="hud.boss" class="boss-bar-wrap">
          <div class="boss-header">
            <span>{{ tc(hud.boss.bossId, 'name', hud.boss.name) }}</span>
            <span class="boss-phase">{{ bossPhaseText }}</span>
          </div>
          <div class="bar-track boss-track">
            <div class="bar-fill boss-fill" :style="{ width: bossHpPct + '%' }"></div>
          </div>
        </div>

        <div v-if="hud.supply && hud.arenaShape !== 'bridge'" class="supply-pill">
          <span class="supply-arrow" :style="{ transform: `rotate(${supplyArrowAngle}deg)` }">▲</span>
          <span>{{ t('hud.supply') }} · {{ hud.supply.distance }}m ({{ Math.ceil(hud.supply.remainingSec) }}s)</span>
        </div>
      </div>

      <!-- Top Right: Relics + Combo + Kills + Pause -->
      <div class="hud-right">
        <div
          v-if="hud.relicCount > 0"
          class="relic-pill"
          :class="{ 'tier-epic': hud.relicCount >= 5 && hud.relicCount < 12, 'tier-mythic': hud.relicCount >= 12 }"
        >
          🏅 {{ t('hud.relics', { count: hud.relicCount }) }}
        </div>
        <div
          v-if="hud.combo >= 3"
          class="combo-pill"
          :class="{ 'tier-2': hud.comboTier === 2, 'tier-3': hud.comboTier >= 3 }"
        >
          🔥 x{{ hud.combo }}<template v-if="hud.comboTier >= 2"> · {{ t('hud.fever') }}</template>
        </div>
        <div class="kills-pill">{{ t('hud.kills', { count: hud.kills }) }}</div>
        <button class="pause-btn" type="button" :aria-label="t('hud.pauseAria')" @click="emit('pause')">
          ⏸
        </button>
      </div>
    </div>

    <!-- Bottom Right: Honor-of-Kings Style Radial Fan Arc Skill Wheel -->
    <div class="moba-skill-cluster">
      <div class="core-anchor-emblem" aria-hidden="true">
        <span class="core-anchor-ring"></span>
        <span class="core-anchor-icon">⚔️</span>
      </div>

      <button
        v-for="skill in arcSkills"
        :key="skill.id"
        type="button"
        class="skill-btn arc-skill-btn"
        :class="[skill.cls, { ready: skill.ready }]"
        :style="skill.style"
        :disabled="skill.disabled"
        @pointerdown.prevent="triggerSkillTap(skill.id)"
        @click="($event.detail === 0) && emitSkill(skill.id)"
      >
        <svg class="skill-ring-svg" viewBox="0 0 64 64" aria-hidden="true">
          <circle class="skill-ring-track" cx="32" cy="32" r="28" />
          <circle
            class="skill-ring-fill"
            cx="32"
            cy="32"
            r="28"
            :stroke-dasharray="RING_CIRCUMFERENCE"
            :stroke-dashoffset="RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, skill.ratio)))"
          />
        </svg>
        <span class="skill-icon">{{ skill.icon }}</span>
        <span class="skill-label">{{ skill.label }}</span>
        <span v-if="!touchMode" class="skill-key">{{ skill.keyLabel }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.hud-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
    max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  z-index: 10;
}
.hud-top {
  display: grid;
  grid-template-columns: minmax(120px, 210px) 1fr auto;
  align-items: start;
  gap: 8px;
}
.hud-left-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hud-panel {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 7px 10px;
}
.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #f8fafc;
  margin-bottom: 4px;
}
.lv-badge {
  color: #ffe066;
}
.bar-track {
  width: 100%;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  overflow: hidden;
}
.hp-track {
  position: relative;
  height: 8px;
  margin-bottom: 4px;
}
.hp-fill {
  height: 100%;
  background: linear-gradient(90deg, #ef476f, #ff758f);
  transition: width 0.1s linear;
}
.shield-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.78), rgba(147, 197, 253, 0.9));
  border-right: 1px solid #e0f2fe;
  transition: width 0.1s linear;
}
.shield-badge {
  color: #7dd3fc;
  margin-left: 4px;
  font-weight: 800;
}
.xp-track {
  height: 5px;
}
.xp-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  transition: width 0.1s linear;
}
.hud-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.timer-pill {
  position: relative;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  padding: 5px 14px 7px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f8fafc;
  font-size: 13px;
}
.timer-pill.boss {
  border-color: rgba(239, 71, 111, 0.58);
}
.stage-boss-icon {
  font-size: 13px;
  line-height: 1;
}
.stage-progress-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  pointer-events: none;
}
.stage-progress-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #fbbf24);
  transition: width 0.2s linear;
}
.timer-pill.boss .stage-progress-fill {
  background: linear-gradient(90deg, #ef4444, #f97316);
}
.time-val {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #ffd166;
}
.stage-name {
  font-size: 12px;
  color: #cbd5e1;
  white-space: nowrap;
}
.boss-bar-wrap {
  width: min(320px, 52vw);
  background: rgba(15, 23, 42, 0.84);
  border: 1px solid rgba(239, 71, 111, 0.52);
  border-radius: 10px;
  padding: 4px 10px;
}
.boss-header {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  color: #fecdd3;
  margin-bottom: 2px;
}
.boss-phase {
  color: #ffd166;
}
.boss-track {
  height: 6px;
}
.boss-fill {
  height: 100%;
  background: linear-gradient(90deg, #dc2626, #f97316);
}
.supply-pill {
  background: rgba(17, 94, 89, 0.85);
  border: 1px solid rgba(128, 255, 219, 0.55);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #ccfbf1;
  display: flex;
  align-items: center;
  gap: 6px;
}
.supply-arrow {
  display: inline-block;
  color: #80ffdb;
}
.hud-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kills-pill {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 6px 11px;
  font-size: 12px;
  font-weight: 700;
  color: #f8fafc;
}
.relic-pill {
  background: rgba(30, 58, 138, 0.82);
  border: 1px solid #60a5fa;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 800;
  color: #dbeafe;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.relic-pill.tier-epic {
  background: rgba(88, 28, 135, 0.85);
  border-color: #d946ef;
  color: #fae8ff;
  box-shadow: 0 0 10px rgba(217, 70, 239, 0.35);
}
.relic-pill.tier-mythic {
  background: linear-gradient(135deg, rgba(120, 53, 15, 0.9), rgba(146, 64, 14, 0.88));
  border-color: #fbbf24;
  color: #fef08a;
  box-shadow: 0 0 14px rgba(251, 191, 36, 0.45);
}
.combo-pill {
  background: rgba(180, 83, 9, 0.85);
  border: 1px solid #fbbf24;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 800;
  color: #fef08a;
}
.combo-pill.tier-2 {
  background: rgba(126, 34, 206, 0.88);
  border-color: #e879f9;
  color: #f5d0fe;
  box-shadow: 0 0 14px rgba(232, 121, 249, 0.45);
}
.combo-pill.tier-3 {
  background: linear-gradient(135deg, #f59e0b, #dc2626);
  border-color: #fde047;
  color: #ffffff;
  box-shadow: 0 0 18px rgba(251, 191, 36, 0.65);
}
.pause-btn {
  pointer-events: auto;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(15, 23, 42, 0.82);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}
.weapons-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.moba-skill-cluster {
  --anchor-c: 44px;
  --arc-r: 108px;
  --skill-sz: 62px;
  position: fixed;
  right: env(safe-area-inset-right, 0px);
  bottom: env(safe-area-inset-bottom, 0px);
  width: 220px;
  height: 220px;
  pointer-events: none;
  z-index: 12;
}
.core-anchor-emblem {
  position: absolute;
  right: var(--anchor-c);
  bottom: var(--anchor-c);
  width: 64px;
  height: 64px;
  transform: translate(50%, 50%);
  border-radius: 50%;
  border: 2px solid rgba(92, 232, 255, 0.52);
  background: radial-gradient(circle at 38% 35%, rgba(28, 62, 92, 0.88), rgba(10, 18, 32, 0.94));
  box-shadow: 0 0 18px rgba(56, 189, 248, 0.25), inset 0 0 12px rgba(92, 232, 255, 0.2);
  display: grid;
  place-items: center;
}
.core-anchor-ring {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 1px dashed rgba(92, 232, 255, 0.34);
}
.core-anchor-icon {
  font-size: 24px;
  filter: drop-shadow(0 2px 6px rgba(56, 189, 248, 0.65));
}
.skill-btn {
  pointer-events: auto;
  position: absolute;
  right: calc(var(--anchor-c) + var(--ux, 0) * (var(--arc-r) + var(--arc-spread, 0px)));
  bottom: calc(var(--anchor-c) + var(--uy, 0) * (var(--arc-r) + var(--arc-spread, 0px)));
  transform: translate(50%, 50%);
  width: var(--skill-sz);
  height: var(--skill-sz);
  border-radius: 50%;
  border: 1.5px solid rgba(116, 224, 255, 0.36);
  background: radial-gradient(circle at 40% 30%, rgba(26, 42, 68, 0.92), rgba(10, 18, 32, 0.96));
  color: #f2f8ff;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  line-height: 1;
  text-align: center;
  cursor: pointer;
  touch-action: none;
  padding: 0;
  margin: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.52);
  transition: transform 0.08s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.skill-btn:active:not(:disabled) {
  transform: translate(50%, 50%) scale(0.92);
}
.skill-ring-svg {
  position: absolute;
  inset: -3px;
  width: calc(100% + 6px);
  height: calc(100% + 6px);
  transform: rotate(-90deg);
  pointer-events: none;
}
.skill-ring-track {
  fill: none;
  stroke: rgba(148, 163, 184, 0.24);
  stroke-width: 3.5;
}
.skill-ring-fill {
  fill: none;
  stroke: #38bdf8;
  stroke-width: 3.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.08s linear;
}
.dash-btn.ready {
  border-color: #9af5ff;
  box-shadow: 0 0 18px rgba(56, 189, 248, 0.45), 0 6px 18px rgba(0, 0, 0, 0.5);
}
.dash-btn .skill-ring-fill {
  stroke: #38bdf8;
}
.guard-btn .skill-ring-fill {
  stroke: #4ade80;
}
.guard-btn.ready {
  border-color: #86efac;
  background: radial-gradient(circle at 40% 30%, rgba(16, 78, 62, 0.92), rgba(10, 26, 26, 0.96));
  box-shadow: 0 0 18px rgba(74, 222, 128, 0.44), 0 6px 18px rgba(0, 0, 0, 0.5);
}
.fury-btn .skill-ring-fill {
  stroke: #fbbf24;
}
.fury-btn.ready {
  background: linear-gradient(145deg, rgba(217, 107, 24, 0.94), rgba(234, 88, 12, 0.94));
  border-color: #fde047;
  color: #ffffff;
  box-shadow: 0 0 22px rgba(251, 191, 36, 0.62), 0 6px 18px rgba(0, 0, 0, 0.5);
}
.skill-btn:disabled {
  opacity: 0.68;
  cursor: default;
}
.skill-icon {
  position: relative;
  z-index: 1;
  font-size: 17px;
  line-height: 1;
  display: block;
}
.skill-label {
  position: relative;
  z-index: 1;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.05;
  display: block;
}
.skill-key {
  position: relative;
  z-index: 1;
  font-size: 8.5px;
  font-weight: 800;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.72);
  color: #e2e8f0;
  display: block;
}
.weapon-slot {
  position: relative;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  padding: 6px 10px 7px;
  font-size: 12px;
  font-weight: 700;
  color: #f8fafc;
  display: flex;
  align-items: center;
  gap: 5px;
}
.w-icon {
  font-size: 13px;
  line-height: 1;
}
.w-lv {
  font-size: 10px;
  font-weight: 800;
  color: #7dd3fc;
  background: rgba(14, 165, 233, 0.18);
  border-radius: 4px;
  padding: 1px 4px;
}
.w-cd-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, #38bdf8, #a855f7);
  transition: width 0.08s linear;
  pointer-events: none;
}
.weapon-slot.empty {
  color: #64748b;
  border-style: dashed;
}
.weapon-slot.evolved {
  border-color: #ffd166;
  color: #ffe066;
  box-shadow: 0 0 8px rgba(255, 209, 102, 0.28);
}
.weapon-slot.evolved .w-cd-bar {
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
}
@media (max-width: 640px) {
  .hud-top {
    grid-template-columns: minmax(152px, 1fr) auto;
    gap: 6px;
  }
  .hud-left-col {
    display: contents;
  }
  .player-panel {
    grid-column: 1;
    grid-row: 1;
    align-self: start;
  }
  .hud-right {
    grid-column: 2;
    grid-row: 1;
    align-self: start;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
    max-width: 54vw;
  }
  .hud-center {
    grid-column: 1 / -1;
    order: 3;
  }
  .kills-pill,
  .relic-pill,
  .combo-pill {
    padding: 4px 8px;
    font-size: 11px;
  }
  .pause-btn {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }
  .weapons-bar {
    grid-column: 1 / -1;
    order: 2;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }
  .weapon-slot {
    padding: 4px 7px 5px;
    font-size: 11px;
    gap: 4px;
    min-width: 0;
  }
  .w-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .w-lv {
    font-size: 9.5px;
    padding: 0 4px;
  }
  .moba-skill-cluster {
    --anchor-c: 38px;
    --arc-r: 96px;
    --skill-sz: 54px;
  }
  .core-anchor-emblem {
    width: 56px;
    height: 56px;
  }
  .core-anchor-icon {
    font-size: 20px;
  }
  .skill-icon {
    font-size: 15px;
  }
  .stage-name {
    display: none;
  }
}
@media (max-height: 520px) {
  .hud-layer {
    padding: max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right))
      max(6px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
  }
  .hud-panel {
    padding: 5px 8px;
  }
  .weapon-slot {
    padding: 3px 7px;
    font-size: 11px;
  }
  .timer-pill {
    padding: 3px 10px;
    font-size: 12px;
  }
  .moba-skill-cluster {
    --anchor-c: 34px;
    --arc-r: 82px;
    --skill-sz: 48px;
  }
  .core-anchor-emblem {
    width: 50px;
    height: 50px;
  }
  .core-anchor-icon {
    font-size: 18px;
  }
  .skill-icon {
    font-size: 14px;
  }
  .skill-label {
    font-size: 9.5px;
  }
  .skill-key {
    display: none;
  }
}
@media (pointer: coarse) {
  .skill-key {
    display: none;
  }
}
</style>
