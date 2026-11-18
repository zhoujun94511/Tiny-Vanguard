<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { LanguageCode } from '../../game/core/GameTypes';
import type { DebugBridge, DebugTelemetry } from '../../game/debug/DebugBridge';
import { useI18n } from './useI18n';

const props = defineProps<{
  bridge: DebugBridge;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'setLanguage', lang: LanguageCode): void;
}>();

const { lang, t, tc, formatTime } = useI18n();

const collapsed = ref(false);
const telemetry = ref<DebugTelemetry>(props.bridge.getTelemetry());
const allLevels = props.bridge.getAllLevels();

let pollTimer = 0;

function refresh() {
  telemetry.value = props.bridge.getTelemetry();
}

onMounted(() => {
  refresh();
  pollTimer = window.setInterval(refresh, 250);
});

onUnmounted(() => {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }
});

function runAndRefresh(fn: () => unknown) {
  fn();
  refresh();
}
</script>

<template>
  <div class="debug-root" @pointerdown.stop @click.stop>
    <button
      v-if="collapsed"
      type="button"
      class="debug-pill"
      @click="collapsed = false"
    >
      {{ t('debug.pill', { fps: telemetry.fps }) }}
    </button>

    <aside v-else class="debug-panel" role="region" :aria-label="t('debug.title')">
      <header class="debug-head">
        <div class="debug-title-wrap">
          <span class="debug-title">🛠 {{ t('debug.title') }}</span>
          <span class="debug-sub">{{ t('debug.hint') }}</span>
        </div>
        <div class="debug-head-btns">
          <button
            type="button"
            class="mini-btn"
            @click="emit('setLanguage', lang === 'zh' ? 'en' : 'zh')"
          >
            {{ lang === 'zh' ? 'EN' : '中文' }}
          </button>
          <button type="button" class="mini-btn" @click="collapsed = true">
            {{ t('debug.collapse') }}
          </button>
          <button type="button" class="mini-btn danger" @click="emit('close')">
            {{ t('debug.close') }}
          </button>
        </div>
      </header>

      <div class="debug-body">
        <!-- Live Telemetry -->
        <section class="dbg-sec">
          <div class="sec-label">{{ t('debug.secState') }}</div>
          <div class="tele-grid">
            <span>{{ t('debug.tele.fps') }}: <b>{{ telemetry.fps }}</b></span>
            <span>{{ t('debug.tele.state') }}: <b>{{ t(`debug.state.${telemetry.state}`) }}</b></span>
            <span>{{ t('debug.tele.time') }}: <b>{{ formatTime(telemetry.elapsedSec) }}</b></span>
            <span>{{ t('debug.tele.stage') }}: <b>S{{ telemetry.stageIndex }}</b></span>
            <span>{{ t('debug.tele.mobs') }}: <b>{{ telemetry.activeEnemies }}</b></span>
            <span>{{ t('debug.tele.proj') }}: <b>{{ telemetry.activeProjectiles }}</b></span>
            <span>{{ t('debug.tele.hp') }}: <b>{{ telemetry.hp }}/{{ telemetry.maxHp }}</b></span>
            <span>{{ t('debug.tele.lvKills') }}: <b>{{ telemetry.level }}/{{ telemetry.kills }}</b></span>
            <span>{{ t('debug.tele.combo') }}: <b>{{ telemetry.combo }} (T{{ telemetry.comboTier }})</b></span>
            <span>{{ t('debug.tele.relicsWeapons') }}: <b>{{ telemetry.relicCount }}/{{ telemetry.weaponCount }}</b></span>
          </div>
        </section>

        <!-- Speed & God Mode -->
        <section class="dbg-sec">
          <div class="sec-label">{{ t('debug.secSpeed') }}</div>
          <div class="btn-row">
            <button
              type="button"
              class="dbg-btn"
              :class="{ active: telemetry.godMode }"
              @click="runAndRefresh(() => bridge.toggleGodMode())"
            >
              {{ telemetry.godMode ? t('debug.godOn') : t('debug.godOff') }}
            </button>
            <button
              v-for="spd in ([1, 2, 4] as const)"
              :key="spd"
              type="button"
              class="dbg-btn"
              :class="{ active: telemetry.timeScale === spd }"
              @click="runAndRefresh(() => bridge.setTimeScale(spd))"
            >
              {{ spd }}x
            </button>
          </div>
        </section>

        <!-- Dynamic Level Jump (Registry-driven, zero hardcoded IDs) -->
        <section class="dbg-sec">
          <div class="sec-label">{{ t('debug.secLevels') }}</div>
          <div class="btn-row wrap">
            <button
              v-for="lvl in allLevels"
              :key="lvl.id"
              type="button"
              class="dbg-btn"
              :class="{ active: telemetry.levelId === lvl.id }"
              @click="runAndRefresh(() => bridge.jumpLevel(lvl.id))"
            >
              {{ tc(lvl.id, 'name', lvl.name) }}
            </button>
          </div>
        </section>

        <!-- Power & Build -->
        <section class="dbg-sec">
          <div class="sec-label">{{ t('debug.secPower') }}</div>
          <div class="btn-row wrap">
            <button type="button" class="dbg-btn" @click="runAndRefresh(() => bridge.levelUpNow())">
              {{ t('debug.lvUp') }}
            </button>
            <button type="button" class="dbg-btn" @click="runAndRefresh(() => bridge.unlockAllWeapons())">
              {{ t('debug.allWeapons') }}
            </button>
            <button type="button" class="dbg-btn" @click="runAndRefresh(() => bridge.grantRelic(false))">
              {{ t('debug.addRelic') }}
            </button>
            <button type="button" class="dbg-btn" @click="runAndRefresh(() => bridge.grantRelic(true))">
              {{ t('debug.allRelics') }}
            </button>
            <button type="button" class="dbg-btn" @click="runAndRefresh(() => bridge.setCombo(120))">
              {{ t('debug.maxCombo') }}
            </button>
            <button type="button" class="dbg-btn" @click="runAndRefresh(() => bridge.fillFury())">
              {{ t('debug.fullFury') }}
            </button>
          </div>
        </section>

        <!-- Waves & Gates -->
        <section class="dbg-sec">
          <div class="sec-label">{{ t('debug.secEvents') }}</div>
          <div class="btn-row wrap">
            <button type="button" class="dbg-btn" @click="runAndRefresh(() => bridge.triggerFormation())">
              {{ t('debug.formation') }}
            </button>
            <button
              v-if="telemetry.arenaShape === 'bridge'"
              type="button"
              class="dbg-btn"
              @click="runAndRefresh(() => bridge.spawnBridgeGates(false))"
            >
              {{ t('debug.gatesNormal') }}
            </button>
            <button
              v-if="telemetry.arenaShape === 'bridge'"
              type="button"
              class="dbg-btn warn"
              @click="runAndRefresh(() => bridge.spawnBridgeGates(true))"
            >
              {{ t('debug.gatesCorrupt') }}
            </button>
            <button type="button" class="dbg-btn warn" @click="runAndRefresh(() => bridge.jumpToBoss())">
              {{ t('debug.jumpBoss') }}
            </button>
            <button type="button" class="dbg-btn" @click="runAndRefresh(() => bridge.clearNormalEnemies())">
              {{ t('debug.clearMobs') }}
            </button>
          </div>
        </section>

        <!-- Audio Cues -->
        <section class="dbg-sec">
          <div class="sec-label">{{ t('debug.secAudio') }}</div>
          <div class="btn-row wrap">
            <button type="button" class="dbg-btn" @click="bridge.testAudioCue('boss')">
              {{ t('debug.sfxBoss') }}
            </button>
            <button type="button" class="dbg-btn" @click="bridge.testAudioCue('purify')">
              {{ t('debug.sfxPurify') }}
            </button>
            <button type="button" class="dbg-btn" @click="bridge.testAudioCue('fever')">
              {{ t('debug.sfxFever') }}
            </button>
          </div>
        </section>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.debug-root {
  position: fixed;
  top: max(56px, calc(env(safe-area-inset-top) + 48px));
  right: max(10px, env(safe-area-inset-right));
  z-index: 60;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.debug-pill {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(56, 189, 248, 0.55);
  background: rgba(15, 23, 42, 0.9);
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.debug-panel {
  width: min(336px, calc(100vw - 20px));
  max-height: min(82dvh, 620px);
  display: flex;
  flex-direction: column;
  background: rgba(9, 14, 28, 0.93);
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 14px;
  color: #e2e8f0;
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  overflow: hidden;
}
.debug-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: rgba(30, 41, 59, 0.85);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.debug-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.debug-title {
  font-size: 13px;
  font-weight: 900;
  color: #ffd166;
}
.debug-sub {
  font-size: 10px;
  color: #94a3b8;
}
.debug-head-btns {
  display: flex;
  gap: 5px;
}
.mini-btn {
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.mini-btn.danger:hover {
  border-color: #f87171;
  color: #fca5a5;
}
.debug-body {
  padding: 10px 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dbg-sec {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sec-label {
  font-size: 10.5px;
  font-weight: 800;
  color: #38bdf8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tele-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
  color: #94a3b8;
}
.tele-grid b {
  color: #f8fafc;
}
.btn-row {
  display: flex;
  gap: 5px;
}
.btn-row.wrap {
  flex-wrap: wrap;
}
.dbg-btn {
  padding: 5px 8px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(30, 41, 59, 0.85);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.dbg-btn:hover {
  border-color: #38bdf8;
  background: rgba(51, 65, 85, 0.95);
}
.dbg-btn.active {
  background: #ffd166;
  border-color: #ffd166;
  color: #0f172a;
}
.dbg-btn.warn {
  border-color: rgba(248, 113, 113, 0.55);
  color: #fecaca;
}
.dbg-btn.warn:hover {
  background: rgba(185, 28, 28, 0.5);
  border-color: #ef4444;
}
@media (max-width: 640px) {
  .debug-root {
    top: max(88px, calc(env(safe-area-inset-top) + 80px));
  }
}
</style>
