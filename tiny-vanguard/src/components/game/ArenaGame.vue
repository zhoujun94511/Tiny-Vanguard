<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { GameModeKey } from '../../game/content/definitions/ContentTypes';
import { GameRuntime } from '../../game/core/GameRuntime';
import type {
  GameSettings,
  GameStateId,
  HudSnapshot,
  LanguageCode,
  LevelUpRequest,
  QualityTier,
  ResultSnapshot,
  SaveData,
} from '../../game/core/GameTypes';
import {
  createF9DoublePressDetector,
  DebugBridge,
  hasDebugUrlFlag,
} from '../../game/debug/DebugBridge';
import { InputController } from '../../game/input/InputController';
import DebugPanel from './DebugPanel.vue';
import GameHud from './GameHud.vue';
import LevelSelect from './LevelSelect.vue';
import LevelUpDialog from './LevelUpDialog.vue';
import MainMenu from './MainMenu.vue';
import PauseMenu from './PauseMenu.vue';
import ResultScreen from './ResultScreen.vue';
import { useI18n } from './useI18n';
import VirtualJoystick from './VirtualJoystick.vue';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const overlayCanvasRef = ref<HTMLCanvasElement | null>(null);
const runtime = new GameRuntime();
const { setLanguageState, t } = useI18n();
setLanguageState(runtime.getSettings().language);

const gameState = ref<GameStateId>('menu');
const bootReady = ref(false);
const menuStep = ref<'main' | 'levels'>('main');
const selectedMode = ref<GameModeKey>('survival');
const hud = ref<HudSnapshot | null>(null);
const levelUpRequest = ref<LevelUpRequest | null>(null);
const result = ref<ResultSnapshot | null>(null);
const errorMsg = ref<string | null>(null);
const toastText = ref<string | null>(null);
let toastTimer = 0;
const splashTimers: number[] = [];
let lastStartLevelMs = 0;
function detectSmallOrMediumViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 1024 || window.innerHeight <= 620;
}

const saveData = ref<SaveData>({ ...runtime.getSaveData() });
const settings = ref<GameSettings>({ ...runtime.getSettings() });
const hasTouchInput = ref(InputController.isCoarsePointer());
const isSmallOrMediumScreen = ref(detectSmallOrMediumViewport());
const isTouchMode = computed(() => isSmallOrMediumScreen.value || hasTouchInput.value);
const debugOpen = ref(hasDebugUrlFlag());
const debugBridge = new DebugBridge(runtime);
const f9Detector = createF9DoublePressDetector(3000);

const visibleLevels = computed(() => runtime.getVisibleLevels());
const modeLevels = computed(() => runtime.getLevelsByMode(selectedMode.value));

const unsubs: Array<() => void> = [];

function onWindowResize() {
  isSmallOrMediumScreen.value = detectSmallOrMediumViewport();
  if (!isSmallOrMediumScreen.value && !InputController.isCoarsePointer()) {
    hasTouchInput.value = false;
  }
}

function onFirstPointerTouch(e: PointerEvent) {
  if (e.pointerType === 'touch') {
    hasTouchInput.value = true;
  }
}

function onUserGestureUnlock() {
  runtime.sound.unlock(true);
}

function onGlobalKeyDown(e: KeyboardEvent) {
  runtime.sound.unlock(true);
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.code === 'F9' || e.key === 'F9') {
    e.preventDefault();
    if (f9Detector.recordPress(performance.now())) {
      debugOpen.value = !debugOpen.value;
      runtime.sound.playUiClick();
    }
    return;
  }

  if (
    e.code === 'KeyW' ||
    e.code === 'KeyA' ||
    e.code === 'KeyS' ||
    e.code === 'KeyD' ||
    e.code === 'Space' ||
    e.code === 'KeyE' ||
    e.code === 'KeyQ'
  ) {
    if (!isSmallOrMediumScreen.value) {
      hasTouchInput.value = false;
    }
    return;
  }

  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (gameState.value === 'playing') {
      e.preventDefault();
      runtime.dispatch({ type: 'pause' });
    } else if (gameState.value === 'paused') {
      e.preventDefault();
      runtime.dispatch({ type: 'resume' });
    } else if (e.code === 'Escape' && gameState.value === 'menu' && menuStep.value === 'levels') {
      e.preventDefault();
      menuStep.value = 'main';
      runtime.setMenuPreviewMode(null);
      runtime.sound.playUiClick();
    }
  }
}

function dismissBootSplash() {
  const splash = document.getElementById('boot-splash');
  if (!splash) {
    bootReady.value = true;
    return;
  }
  const fill = document.getElementById('boot-splash-fill');
  const status = document.getElementById('boot-splash-status');

  splashTimers.push(
    window.setTimeout(() => {
      if (fill) fill.style.width = '78%';
      if (status) status.textContent = t('splash.loading');
    }, 150),
    window.setTimeout(() => {
      if (fill) fill.style.width = '100%';
      if (status) status.textContent = t('splash.ready');
    }, 520),
    window.setTimeout(() => {
      splash.classList.add('fade-out');
      bootReady.value = true;
      splashTimers.push(window.setTimeout(() => splash.remove(), 450));
    }, 860)
  );
}

onMounted(() => {
  window.addEventListener('pointerdown', onFirstPointerTouch, { passive: true });
  window.addEventListener('click', onUserGestureUnlock, { capture: true, passive: true });
  window.addEventListener('touchend', onUserGestureUnlock, { capture: true, passive: true });
  window.addEventListener('keydown', onGlobalKeyDown);
  window.addEventListener('resize', onWindowResize);
  const fill = document.getElementById('boot-splash-fill');
  if (fill) fill.style.width = '68%';

  unsubs.push(
    runtime.events.on('stateChange', ({ state }) => {
      gameState.value = state;
      if (state !== 'level-up') {
        levelUpRequest.value = null;
      }
      if (state === 'menu') {
        result.value = null;
        hud.value = null;
        saveData.value = { ...runtime.getSaveData() };
      }
    }),
    runtime.events.on('hud', (snap) => {
      hud.value = snap;
    }),
    runtime.events.on('levelUpRequest', (req) => {
      levelUpRequest.value = req;
    }),
    runtime.events.on('result', (res) => {
      result.value = res;
      saveData.value = { ...runtime.getSaveData() };
    }),
    runtime.events.on('error', (err) => {
      errorMsg.value = err.message;
    }),
    runtime.events.on('toast', (msg) => {
      toastText.value = msg.text;
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastText.value = null;
      }, 2200);
    })
  );

  if (canvasRef.value) {
    runtime.mount(canvasRef.value, overlayCanvasRef.value);
  }
  dismissBootSplash();
});

onUnmounted(() => {
  window.removeEventListener('pointerdown', onFirstPointerTouch);
  window.removeEventListener('click', onUserGestureUnlock, { capture: true });
  window.removeEventListener('touchend', onUserGestureUnlock, { capture: true });
  window.removeEventListener('keydown', onGlobalKeyDown);
  window.removeEventListener('resize', onWindowResize);
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = 0;
  }
  for (const tid of splashTimers) {
    window.clearTimeout(tid);
  }
  splashTimers.length = 0;
  for (const fn of unsubs) fn();
  unsubs.length = 0;
  runtime.destroy();
});

function handleSelectLevel(levelId: string) {
  const now = performance.now();
  if (gameState.value === 'loading' || now - lastStartLevelMs < 260) return;
  lastStartLevelMs = now;
  result.value = null;
  levelUpRequest.value = null;
  if (runtime.loadLevel(levelId)) {
    runtime.start();
  }
}

function handleChooseUpgrade(upgradeId: string) {
  if (!levelUpRequest.value) return;
  runtime.dispatch({
    type: 'chooseUpgrade',
    sessionId: levelUpRequest.value.sessionId,
    requestId: levelUpRequest.value.requestId,
    upgradeId,
  });
}

function handleJoystickMove(x: number, y: number) {
  runtime.input.setJoystickVector(x, y);
}

function handleSetQuality(quality: QualityTier) {
  runtime.dispatch({ type: 'setQuality', quality });
  settings.value = { ...runtime.getSettings() };
}

function handleSetAudio(enabled: boolean) {
  runtime.dispatch({ type: 'setAudioEnabled', enabled });
  settings.value = { ...runtime.getSettings() };
}

function handleSetBgm(enabled: boolean) {
  runtime.dispatch({ type: 'setBgmEnabled', enabled });
  settings.value = { ...runtime.getSettings() };
}

function handleToggleMasterAudio() {
  const anyOn = settings.value.audioEnabled || settings.value.bgmEnabled;
  const next = !anyOn;
  runtime.dispatch({ type: 'setAudioEnabled', enabled: next });
  runtime.dispatch({ type: 'setBgmEnabled', enabled: next });
  settings.value = { ...runtime.getSettings() };
  if (next) runtime.sound.playUiClick();
}

function handleSetDamageNums(enabled: boolean) {
  runtime.dispatch({ type: 'setShowDamageNumbers', enabled });
  settings.value = { ...runtime.getSettings() };
}

function handleSetLanguage(language: LanguageCode) {
  runtime.dispatch({ type: 'setLanguage', language });
  settings.value = { ...runtime.getSettings() };
  setLanguageState(language);
}
</script>

<template>
  <div class="arena-shell">
    <canvas ref="canvasRef" class="game-canvas"></canvas>
    <canvas ref="overlayCanvasRef" class="damage-overlay"></canvas>

    <!-- Top-Level Menu: 2 Core Gameplay Mode Entries -->
    <MainMenu
      v-if="bootReady && gameState === 'menu' && menuStep === 'main'"
      :levels="visibleLevels"
      :save-data="saveData"
      :audio-on="settings.audioEnabled || settings.bgmEnabled"
      :touch-mode="isTouchMode"
      @select-mode="(m) => { runtime.sound.playUiClick(); selectedMode = m; menuStep = 'levels'; runtime.setMenuPreviewMode(m); }"
      @set-language="handleSetLanguage"
      @toggle-audio="handleToggleMasterAudio"
    />

    <!-- Mode Stage Sequence Sub-Screen (1, 2, 3...) -->
    <LevelSelect
      v-if="bootReady && gameState === 'menu' && menuStep === 'levels'"
      :mode="selectedMode"
      :levels="modeLevels"
      :save-data="saveData"
      @select="handleSelectLevel"
      @back="menuStep = 'main'; runtime.setMenuPreviewMode(null)"
    />

    <!-- In-Game HUD -->
    <GameHud
      v-if="hud && gameState !== 'menu'"
      :hud="hud"
      :touch-mode="isTouchMode"
      @pause="runtime.dispatch({ type: 'pause' })"
      @dash="runtime.dispatch({ type: 'triggerDash' })"
      @guard="runtime.dispatch({ type: 'triggerGuard' })"
      @fury="runtime.dispatch({ type: 'triggerFury' })"
    />

    <!-- Touch Virtual Joystick -->
    <VirtualJoystick
      v-if="isTouchMode && gameState === 'playing'"
      @move="handleJoystickMove"
    />

    <!-- Level Up Modal -->
    <LevelUpDialog
      v-if="gameState === 'level-up' && levelUpRequest"
      :key="levelUpRequest.requestId"
      :request="levelUpRequest"
      :touch-mode="isTouchMode"
      @choose="handleChooseUpgrade"
    />

    <!-- Pause Modal -->
    <PauseMenu
      v-if="gameState === 'paused'"
      :settings="settings"
      @resume="runtime.dispatch({ type: 'resume' })"
      @restart="runtime.dispatch({ type: 'restart' })"
      @exit="menuStep = 'main'; runtime.dispatch({ type: 'exitToMenu' })"
      @set-quality="handleSetQuality"
      @set-audio="handleSetAudio"
      @set-bgm="handleSetBgm"
      @set-damage-nums="handleSetDamageNums"
      @set-language="handleSetLanguage"
    />

    <!-- Victory / Defeat Result -->
    <ResultScreen
      v-if="(gameState === 'victory' || gameState === 'game-over') && result"
      :result="result"
      @next-stage="handleSelectLevel"
      @restart="runtime.dispatch({ type: 'restart' })"
      @exit="menuStep = 'main'; runtime.dispatch({ type: 'exitToMenu' })"
    />

    <!-- Non-blocking Power-up Toast -->
    <div v-if="toastText && gameState === 'playing'" class="toast-banner">
      {{ toastText }}
    </div>

    <!-- Lazy-Mounted QA Debug Console (2x F9 within 3s) -->
    <DebugPanel
      v-if="debugOpen"
      :bridge="debugBridge"
      @close="debugOpen = false"
      @set-language="handleSetLanguage"
    />

    <!-- Error Fallback -->
    <div v-if="errorMsg" class="overlay modal-backdrop">
      <div class="card error-card">
        <h3>{{ t('err.title') }}</h3>
        <p>{{ errorMsg }}</p>
        <button class="btn-primary" type="button" @click="errorMsg = null; menuStep = 'main'; runtime.dispatch({ type: 'exitToMenu' })">
          {{ t('err.back') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arena-shell {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #0f172a;
}
.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.damage-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 8;
}
.error-card {
  max-width: 400px;
  width: 90%;
  text-align: center;
  color: #fff;
}
.toast-banner {
  position: fixed;
  bottom: max(18px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100vw - 24px);
  text-align: center;
  z-index: 18;
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid #ffd166;
  color: #ffd166;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
@media (max-width: 1024px) {
  .toast-banner {
    bottom: max(142px, calc(env(safe-area-inset-bottom) + 132px));
    font-size: 12px;
    padding: 5px 12px;
  }
}
</style>
