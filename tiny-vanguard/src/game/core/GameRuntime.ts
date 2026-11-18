import * as THREE from 'three';
import { SoundEngine } from '../audio/SoundEngine';
import { QUALITY_PROFILES } from '../config/qualityConfig';
import { RUNTIME_CONFIG } from '../config/runtimeConfig';
import type { GameModeKey, LevelDefinition } from '../content/definitions/ContentTypes';
import { validateLevelConfig } from '../content/registries/ConfigValidator';
import type { ContentRegistries } from '../content/registries/ContentRegistry';
import { createDefaultRegistries } from '../content/registries/DefaultContent';
import { translateContent, translateUi } from '../i18n/i18n';
import { InputController } from '../input/InputController';
import { CameraController } from '../scene/CameraController';
import { EntityRenderer } from '../scene/EntityRenderer';
import { SceneArena } from '../scene/SceneArena';
import { GameSession } from '../session/GameSession';
import { SaveStorage } from '../session/SaveStorage';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyWaveSystem } from '../systems/EnemyWaveSystem';
import { ExperienceSystem } from '../systems/ExperienceSystem';
import { LevelProgressionSystem } from '../systems/LevelProgressionSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { GameClock } from './GameClock';
import type { GameCommand } from './GameCommands';
import { GameEventBus } from './GameEvents';
import { GameStateMachine } from './GameStateMachine';
import type {
  BossHudSnapshot,
  GameSettings,
  HudSnapshot,
  PauseReason,
  QualityTier,
  ResultSnapshot,
  SaveData,
  SupplyIndicatorSnapshot,
  WeaponSlotSnapshot,
} from './GameTypes';

export class GameRuntime {
  public readonly events = new GameEventBus();
  public readonly registries: ContentRegistries;
  public readonly input = new InputController();
  public readonly sound = new SoundEngine();

  private readonly storage = new SaveStorage();
  private saveData: SaveData;

  private readonly clock = new GameClock();
  private readonly fsm = new GameStateMachine();

  private readonly movement = new MovementSystem();
  private readonly combat = new CombatSystem();
  private readonly enemyWave = new EnemyWaveSystem();
  private readonly experience = new ExperienceSystem();
  private readonly upgradeSys = new UpgradeSystem();
  private readonly progression = new LevelProgressionSystem();

  private canvas: HTMLCanvasElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private overlayWidth = 1;
  private overlayHeight = 1;
  private overlayHasContent = false;
  private readonly projScratch = new THREE.Vector3();
  private renderer: THREE.WebGLRenderer | null = null;
  private arena: SceneArena | null = null;
  private entityRenderer: EntityRenderer | null = null;
  private cameraCtrl = new CameraController();
  private resizeObserver: ResizeObserver | null = null;

  private session: GameSession | null = null;
  private sessionSeq = 0;
  private activeLevelId: string | null = null;
  private menuPreviewMode: GameModeKey | null = null;
  private menuPreviewTime = 0;

  private rafId = 0;
  private loopRunning = false;
  private destroyed = false;
  private hudEmitTimer = 0;
  private fpsSmoothed = 60;
  private debugTimeScale: 1 | 2 | 4 = 1;
  private debugGodMode = false;
  private hudBufferIdx = 0;
  private readonly hudBossBuffers: [BossHudSnapshot, BossHudSnapshot] = [
    { bossId: '', name: '', hp: 0, maxHp: 1, phaseKey: 'fight', phaseLabel: '' },
    { bossId: '', name: '', hp: 0, maxHp: 1, phaseKey: 'fight', phaseLabel: '' },
  ];
  private readonly hudSupplyBuffers: [SupplyIndicatorSnapshot, SupplyIndicatorSnapshot] = [
    { active: false, remainingSec: 0, totalSec: 1, dirX: 0, dirZ: 0, distance: 0, rewardLabel: '' },
    { active: false, remainingSec: 0, totalSec: 1, dirX: 0, dirZ: 0, distance: 0, rewardLabel: '' },
  ];
  private readonly hudBuffers: [HudSnapshot, HudSnapshot] = [
    GameRuntime.createEmptyHudSnapshot(),
    GameRuntime.createEmptyHudSnapshot(),
  ];

  private static createEmptyHudSnapshot(): HudSnapshot {
    return {
      sessionId: 0,
      levelId: '',
      arenaShape: 'circle',
      levelName: '',
      state: 'menu',
      hp: 0,
      maxHp: 1,
      shield: 0,
      maxShield: 0,
      relicCount: 0,
      xp: 0,
      xpToNext: 1,
      level: 1,
      elapsedSec: 0,
      stageId: '',
      stageLabel: '',
      stageProgress: 0,
      kills: 0,
      combo: 0,
      comboTier: 0,
      dashReadyRatio: 1,
      guardReadyRatio: 1,
      furyRatio: 0,
      weaponSlots: [],
      maxWeaponSlots: 3,
      boss: null,
      supply: null,
      activeEnemyCount: 0,
    };
  }

  private readonly onVisibilityChange = () => {
    if (this.destroyed) return;
    if (document.hidden) {
      this.input.clearAll();
      this.sound.suspend();
      if (this.fsm.state === 'playing' || this.fsm.state === 'level-up') {
        this.pause('hidden');
      }
    } else {
      this.clock.resetTimeBaseline(performance.now());
      this.resume('hidden');
      if (this.saveData.settings.audioEnabled || this.saveData.settings.bgmEnabled) {
        this.sound.unlock(false);
      }
    }
  };

  private readonly onWindowBlur = () => {
    this.input.clearAll();
    if (this.fsm.state === 'playing') {
      // Soft-pause via 'manual' so returning to a still-visible tab can always resume with one click
      this.pause('manual');
    }
  };

  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
    this.input.clearAll();
    this.pause('context-lost');
    this.events.emit('toast', {
      text: translateUi(this.saveData.settings.language, 'toast.contextLost'),
      tone: 'warn',
    });
  };

  private readonly onContextRestored = () => {
    if (this.renderer) {
      this.arena?.restoreEnvironment(this.renderer);
    }
    this.entityRenderer?.markTexturesDirty();
    this.handleResize();
    this.clock.resetTimeBaseline(performance.now());
    this.resume('context-lost');
    this.events.emit('toast', {
      text: translateUi(this.saveData.settings.language, 'toast.contextRestored'),
      tone: 'info',
    });
  };

  constructor(registries = createDefaultRegistries()) {
    this.registries = registries;
    this.saveData = this.storage.load();
    this.sound.setEnabled(this.saveData.settings.audioEnabled);
    this.sound.setBgmEnabled(this.saveData.settings.bgmEnabled);
  }

  public getSaveData(): Readonly<SaveData> {
    return this.saveData;
  }

  public getSettings(): Readonly<GameSettings> {
    return this.saveData.settings;
  }

  public getVisibleLevels(): readonly LevelDefinition[] {
    return this.registries.levels.list().filter((l) => l.visibleInMenu);
  }

  public getLevelsByMode(mode: GameModeKey): readonly LevelDefinition[] {
    return this.getVisibleLevels()
      .filter((l) => (l.modeGroup ?? (l.arenaShape === 'bridge' ? 'defense' : 'survival')) === mode)
      .sort((a, b) => (a.stageOrder ?? 999) - (b.stageOrder ?? 999));
  }

  public getNextLevelInMode(levelId: string): LevelDefinition | null {
    const cur = this.registries.levels.get(levelId);
    if (!cur) return null;
    const mode: GameModeKey = cur.modeGroup ?? (cur.arenaShape === 'bridge' ? 'defense' : 'survival');
    const ordered = this.getLevelsByMode(mode);
    const idx = ordered.findIndex((l) => l.id === levelId);
    if (idx < 0 || idx + 1 >= ordered.length) return null;
    return ordered[idx + 1];
  }

  public mount(canvas: HTMLCanvasElement, overlayCanvas?: HTMLCanvasElement | null): boolean {
    if (this.destroyed || this.renderer) return false;
    this.canvas = canvas;
    this.overlayCanvas = overlayCanvas ?? null;
    this.overlayCtx = this.overlayCanvas ? this.overlayCanvas.getContext('2d') : null;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      this.fsm.setState('error');
      this.emitStateAndHud();
      this.events.emit('error', {
        message: '当前浏览器或设备不支持 WebGL，无法启动 3D 渲染。',
        fatal: true,
      });
      return false;
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.arena = new SceneArena();
    this.arena.initEnvironment(this.renderer);
    this.entityRenderer = new EntityRenderer(this.arena.scene);

    this.applyQualityProfile(this.saveData.settings.quality);
    this.handleResize();

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('blur', this.onWindowBlur);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(canvas.parentElement ?? canvas);
    }
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);

    this.startLoop();
    return true;
  }

  private readonly handleResize = () => {
    if (!this.canvas || !this.renderer) return;
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent ? parent.clientWidth : window.innerWidth);
    const height = Math.max(1, parent ? parent.clientHeight : window.innerHeight);

    const profile = QUALITY_PROFILES[this.saveData.settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.cameraCtrl.resize(width, height);

    this.overlayWidth = width;
    this.overlayHeight = height;
    if (this.overlayCanvas) {
      this.overlayCanvas.width = Math.round(width * dpr);
      this.overlayCanvas.height = Math.round(height * dpr);
      if (this.overlayCtx) {
        this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
  };

  private applyQualityProfile(tier: QualityTier): void {
    const profile = QUALITY_PROFILES[tier];
    if (this.renderer) {
      this.renderer.shadowMap.enabled = profile.shadowsEnabled;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const dpr = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
      this.renderer.setPixelRatio(dpr);
    }
    if (this.arena) {
      this.arena.dirLight.castShadow = profile.shadowsEnabled;
      this.arena.dirLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      if (this.arena.dirLight.shadow.map) {
        this.arena.dirLight.shadow.map.dispose();
        this.arena.dirLight.shadow.map = null;
      }
    }
  }

  public dispatch(cmd: GameCommand): void {
    if (this.destroyed) return;
    this.sound.unlock(false);

    switch (cmd.type) {
      case 'loadLevel':
        this.loadLevel(cmd.levelId);
        break;
      case 'start':
        this.start();
        break;
      case 'pause':
        this.pause('manual');
        break;
      case 'resume':
        this.resume('manual');
        break;
      case 'restart':
        this.restart();
        break;
      case 'exitToMenu':
        this.exitToMenu();
        break;
      case 'chooseUpgrade':
        this.handleChooseUpgrade(cmd.sessionId, cmd.requestId, cmd.upgradeId);
        break;
      case 'triggerDash':
        this.input.queueDash();
        break;
      case 'triggerGuard':
        this.input.queueGuard();
        break;
      case 'triggerFury':
        this.input.queueFury();
        break;
      case 'setQuality':
        this.saveData.settings.quality = cmd.quality;
        this.storage.save(this.saveData);
        this.applyQualityProfile(cmd.quality);
        this.handleResize();
        break;
      case 'setAudioEnabled':
        this.saveData.settings.audioEnabled = cmd.enabled;
        this.storage.save(this.saveData);
        this.sound.setEnabled(cmd.enabled);
        if (cmd.enabled) this.sound.unlock(true);
        break;
      case 'setBgmEnabled':
        this.saveData.settings.bgmEnabled = cmd.enabled;
        this.storage.save(this.saveData);
        this.sound.setBgmEnabled(cmd.enabled);
        if (cmd.enabled) this.sound.unlock(true);
        break;
      case 'setShowDamageNumbers':
        this.saveData.settings.showDamageNumbers = cmd.enabled;
        this.storage.save(this.saveData);
        break;
      case 'setLanguage':
        this.saveData.settings.language = cmd.language;
        if (this.session) {
          this.session.language = cmd.language;
        }
        this.storage.save(this.saveData);
        break;
    }
  }

  public loadLevel(levelId: string): boolean {
    const level = this.registries.levels.get(levelId);
    if (!level) {
      this.events.emit('error', { message: `关卡 "${levelId}" 不存在`, fatal: false });
      return false;
    }

    const issues = validateLevelConfig(level, this.registries);
    if (issues.length > 0) {
      const detail = issues.map((i) => `[${i.levelId}.${i.field}] ${i.message}`).join('; ');
      this.fsm.setState('error');
      this.emitStateAndHud();
      this.events.emit('error', { message: `关卡配置校验失败: ${detail}`, fatal: false });
      return false;
    }

    this.fsm.setState('loading');
    this.menuPreviewMode = null;
    this.disposeCurrentSession();

    this.sessionSeq += 1;
    this.activeLevelId = levelId;
    this.session = new GameSession(this.sessionSeq, level, this.registries);
    this.session.language = this.saveData.settings.language;
    this.session.godMode = this.debugGodMode;
    if (level.arenaShape === 'bridge') {
      this.session.player.facingRad = Math.PI;
    }

    const lockZ = level.arenaShape === 'bridge' ? 3.0 : 0;
    this.cameraCtrl.configure(level.camera, Boolean(level.cameraLocked), 0, lockZ);
    if (!level.cameraLocked) {
      this.cameraCtrl.snapTo(this.session.player.x, this.session.player.z);
    }

    if (this.arena) {
      this.arena.buildLevelEnvironment(level, this.session.character);
      this.arena.updatePlayerVisual(
        this.session.player.x,
        this.session.player.z,
        this.session.player.facingRad,
        false,
        0,
        0,
        false
      );
      this.combat.resetVisuals(this.arena);
    }

    this.clock.resetSession();
    this.hudEmitTimer = 0;
    return true;
  }

  public start(): boolean {
    if (!this.session || !this.fsm.setState('playing')) return false;
    this.input.setEnabled(true);
    this.clock.resetTimeBaseline(performance.now());
    this.saveData.totalRuns += 1;
    this.storage.save(this.saveData);
    this.emitStateAndHud();
    return true;
  }

  public pause(reason: PauseReason = 'manual'): void {
    if (this.fsm.addPauseReason(reason)) {
      this.input.setEnabled(false);
      this.emitStateAndHud();
    }
  }

  public resume(reason: PauseReason = 'manual'): void {
    let resumedToPlaying = this.fsm.removePauseReason(reason);
    // Safety net: if user explicitly resumes while tab is visible, also clear any stale 'hidden' reason
    if (
      reason === 'manual' &&
      !resumedToPlaying &&
      (typeof document === 'undefined' || !document.hidden)
    ) {
      resumedToPlaying = this.fsm.removePauseReason('hidden');
    }
    if (resumedToPlaying) {
      this.clock.resetTimeBaseline(performance.now());
      this.input.setEnabled(true);
    }
    this.emitStateAndHud();
  }

  public restart(): void {
    if (!this.activeLevelId) return;
    if (this.loadLevel(this.activeLevelId)) {
      this.start();
    }
  }

  public exitToMenu(): void {
    this.input.setEnabled(false);
    this.menuPreviewMode = null;
    this.disposeCurrentSession();
    this.fsm.resetToMenu();
    if (this.renderer && this.arena) {
      this.arena.scene.background = new THREE.Color(0x0b1220);
      this.renderer.render(this.arena.scene, this.cameraCtrl.camera);
    }
    this.events.emit('stateChange', { state: 'menu', sessionId: 0 });
  }

  public setMenuPreviewMode(mode: GameModeKey | null): void {
    if (this.destroyed || this.fsm.state !== 'menu') return;
    if (mode === null) {
      this.menuPreviewMode = null;
      this.entityRenderer?.hideAll();
      this.combat.resetVisuals(this.arena);
      this.arena?.clearLevelEnvironment();
      if (this.renderer && this.arena) {
        this.arena.scene.background = new THREE.Color(0x0b1220);
        this.renderer.render(this.arena.scene, this.cameraCtrl.camera);
      }
      return;
    }

    if (this.menuPreviewMode === mode) return;
    this.menuPreviewMode = mode;
    const previewLevel = this.getLevelsByMode(mode)[0];
    if (!previewLevel || !this.arena) return;
    const ch = this.registries.characters.get(previewLevel.characterId);
    if (!ch) return;

    this.entityRenderer?.hideAll();
    this.arena.buildLevelEnvironment(previewLevel, ch);
    const lockZ = previewLevel.arenaShape === 'bridge' ? 3.0 : 0;
    this.cameraCtrl.configure(previewLevel.camera, true, 0, lockZ);
    this.cameraCtrl.snapTo(0, lockZ);
    const facing = previewLevel.arenaShape === 'bridge' ? Math.PI : 0;
    this.arena.updatePlayerVisual(
      previewLevel.playerSpawn.x,
      previewLevel.playerSpawn.z,
      facing,
      false,
      this.menuPreviewTime,
      0,
      false
    );
    this.combat.resetVisuals(this.arena);
    if (this.renderer) {
      this.renderer.render(this.arena.scene, this.cameraCtrl.camera);
    }
  }

  private disposeCurrentSession(): void {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    this.entityRenderer?.hideAll();
    this.combat.resetVisuals(this.arena);
    this.arena?.clearLevelEnvironment();
  }

  private startLoop(): void {
    if (this.loopRunning) return;
    this.loopRunning = true;
    this.clock.resetTimeBaseline(performance.now());

    const tick = (nowMs: number) => {
      if (this.destroyed || !this.loopRunning) return;
      this.rafId = requestAnimationFrame(tick);

      const simulating = this.fsm.isSimulating() && this.session !== null;
      const { wallDt, rawDt, steps } = this.clock.tick(nowMs, simulating);
      if (wallDt > 0.001 && wallDt < 0.5) {
        this.fpsSmoothed = this.fpsSmoothed * 0.9 + (1 / wallDt) * 0.1;
      }

      // Dynamic procedural BGM uses wallDt so Menu overture & Level-Up ducking advance smoothly
      const bgmMode =
        !this.session || this.fsm.state === 'menu'
          ? 'menu'
          : this.session.level.arenaShape === 'bridge'
            ? 'defense'
            : 'survival';
      const isBossActive = Boolean(this.session && this.session.bossSpawned && !this.session.bossKilled);
      const bgmPaused =
        this.fsm.state === 'paused' ||
        this.fsm.state === 'victory' ||
        this.fsm.state === 'game-over' ||
        this.fsm.state === 'error';
      const bgmDucked = bgmPaused || this.fsm.state === 'level-up';
      this.sound.updateBgm(
        wallDt,
        bgmMode,
        this.session ? this.session.currentStageIndex : 0,
        this.session ? this.session.comboTier : 0,
        isBossActive,
        bgmPaused,
        bgmDucked
      );

      if (simulating && this.session) {
        const totalSteps = Math.min(20, steps * this.debugTimeScale);
        const stepStartMs = this.debugTimeScale > 1 ? performance.now() : 0;
        for (let i = 0; i < totalSteps; i += 1) {
          this.stepSimulation(this.session, this.clock.fixedStep);
          if (!this.fsm.isSimulating()) break;
          if (this.debugTimeScale > 1 && i >= 1 && performance.now() - stepStartMs > 12) {
            break;
          }
        }
        this.cameraCtrl.setTarget(this.session.player.x, this.session.player.z);
        this.cameraCtrl.update(rawDt);
        this.syncVisualsNow(rawDt);

        this.hudEmitTimer += rawDt;
        if (this.hudEmitTimer >= RUNTIME_CONFIG.hudUpdateIntervalSec) {
          this.hudEmitTimer = 0;
          this.events.emit('hud', this.buildHudSnapshot(this.session));
        }
      }

      if (this.renderer && this.arena && this.fsm.state !== 'menu') {
        this.renderer.render(this.arena.scene, this.cameraCtrl.camera);
        this.drawDamageOverlay();
      } else if (this.renderer && this.arena && this.menuPreviewMode !== null) {
        this.menuPreviewTime += wallDt;
        const previewLevel = this.getLevelsByMode(this.menuPreviewMode)[0];
        if (previewLevel) {
          const facing = previewLevel.arenaShape === 'bridge' ? Math.PI : 0;
          this.arena.updatePlayerVisual(
            previewLevel.playerSpawn.x,
            previewLevel.playerSpawn.z,
            facing,
            false,
            this.menuPreviewTime,
            wallDt,
            false
          );
        }
        this.renderer.render(this.arena.scene, this.cameraCtrl.camera);
        if (this.overlayCtx && this.overlayHasContent) {
          this.overlayCtx.clearRect(0, 0, this.overlayWidth, this.overlayHeight);
          this.overlayHasContent = false;
        }
      } else if (this.overlayCtx && this.overlayHasContent) {
        this.overlayCtx.clearRect(0, 0, this.overlayWidth, this.overlayHeight);
        this.overlayHasContent = false;
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private syncVisualsNow(dt = 0): void {
    if (!this.session || !this.arena || !this.entityRenderer) return;
    let activeWeaponMask = 0;
    const weapons = this.session.player.weapons;
    for (let i = 0; i < weapons.length; i += 1) {
      const wid = weapons[i].weaponId;
      if (wid === 'thunder-arc') activeWeaponMask |= 1;
      else if (wid === 'rail-sniper') activeWeaponMask |= 2;
      else if (wid === 'frost-nova') activeWeaponMask |= 4;
    }
    this.arena.updatePlayerVisual(
      this.session.player.x,
      this.session.player.z,
      this.session.player.facingRad,
      this.session.player.isMoving,
      this.clock.simTimeSec,
      dt,
      this.session.player.hitFlashTimer > 0,
      this.session.comboTier,
      activeWeaponMask,
      this.session.player.equippedRelics.length
    );
    this.entityRenderer.sync(
      this.session.enemies,
      this.session.playerProjectiles,
      this.session.enemyProjectiles,
      this.session.drops,
      this.session.vfx,
      this.session.supply,
      this.session.bridgeGates,
      this.clock.simTimeSec,
      this.saveData.settings.language,
      this.session.beams,
      this.session.shockwaves
    );
  }

  private drawDamageOverlay(): void {
    const ctx = this.overlayCtx;
    if (!ctx) return;
    if (!this.saveData.settings.showDamageNumbers || !this.session) {
      if (this.overlayHasContent) {
        ctx.clearRect(0, 0, this.overlayWidth, this.overlayHeight);
        this.overlayHasContent = false;
      }
      return;
    }

    const popups = this.session.damagePopups;
    let hasAnyActive = false;
    for (let i = 0; i < popups.length; i += 1) {
      if (popups[i].active) {
        hasAnyActive = true;
        break;
      }
    }
    if (!hasAnyActive) {
      if (this.overlayHasContent) {
        ctx.clearRect(0, 0, this.overlayWidth, this.overlayHeight);
        this.overlayHasContent = false;
      }
      return;
    }

    ctx.clearRect(0, 0, this.overlayWidth, this.overlayHeight);
    this.overlayHasContent = true;

    const cam = this.cameraCtrl.camera;
    const hw = this.overlayWidth * 0.5;
    const hh = this.overlayHeight * 0.5;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';

    let lastBig = -1;
    for (let i = 0; i < popups.length; i += 1) {
      const dp = popups[i];
      if (!dp.active) continue;
      this.projScratch.set(dp.x, dp.y, dp.z).project(cam);
      if (this.projScratch.z > 1) continue;
      const sx = (this.projScratch.x + 1) * hw;
      const sy = (1 - this.projScratch.y) * hh;
      const alpha = Math.max(0, Math.min(1, dp.lifeSec / dp.maxLifeSec));

      ctx.globalAlpha = alpha;
      const bigFlag = dp.isCritOrBig ? 1 : 0;
      if (bigFlag !== lastBig) {
        ctx.font = dp.isCritOrBig
          ? '900 18px system-ui, sans-serif'
          : '800 14px system-ui, sans-serif';
        lastBig = bigFlag;
      }
      const label = dp.isHeal ? `+${dp.amount}` : `${dp.amount}`;
      ctx.strokeText(label, sx, sy);
      ctx.fillStyle = dp.isHeal ? '#4ade80' : dp.isCritOrBig ? '#fde047' : '#ffffff';
      ctx.fillText(label, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  private stepSimulation(session: GameSession, dt: number): void {
    const viewBounds = this.cameraCtrl.getGroundViewBounds();

    this.movement.updatePlayer(session, this.input, dt, this.sound);
    if (session.player.guardCooldown <= 0 && this.input.consumeGuard()) {
      this.combat.triggerAegisGuard(session, this.sound);
    }
    if (session.player.furyCharge >= 100 && this.input.consumeFury()) {
      this.combat.triggerFuryUltimate(session, this.sound);
    }
    this.input.tickBuffers(dt);
    this.enemyWave.update(session, dt, viewBounds, this.combat, this.sound);
    this.combat.update(session, dt, this.arena, this.sound);
    if (this.combat.pendingCameraShake > 0) {
      this.cameraCtrl.addShake(this.combat.pendingCameraShake);
      this.combat.pendingCameraShake = 0;
    }
    if (this.combat.pendingNotices.length > 0) {
      const notice = this.combat.pendingNotices.shift()!;
      this.events.emit('toast', { text: notice.text, tone: 'success' });
      if (notice.playSupplySfx) {
        this.sound.playSupply();
      }
    }
    this.experience.update(session, dt, this.sound);

    const outcome = this.progression.update(session, dt, this.combat, this.sound);
    if (outcome.terminal) {
      this.finishRun(session, outcome.victory, outcome.reason);
      return;
    }
    if (outcome.toastText) {
      this.events.emit('toast', { text: outcome.toastText, tone: 'success' });
    }

    if (session.pendingLevelUps > 0 && this.fsm.state === 'playing') {
      if (session.level.arenaShape === 'bridge') {
        // Bridge Defense uses direct non-blocking power-ups instead of modal popups
        const gained = session.pendingLevelUps;
        session.pendingLevelUps = 0;
        session.player.supplyDamageBonus += 0.1 * gained;
        session.player.hp = Math.min(session.player.maxHp, session.player.hp + 12 * gained);
        let gainedWeaponName: string | null = null;
        const prevLv = session.player.level - gained;
        for (let lv = prevLv + 1; lv <= session.player.level; lv += 1) {
          if (lv % 3 === 0) {
            const pool = this.upgradeSys.generateChoices(session, 8);
            const modChoice = pool.find((c) => c.category === 'weapon-upgrade');
            if (modChoice && this.upgradeSys.applyUpgrade(session, modChoice.upgradeId)) {
              gainedWeaponName = translateContent(
                this.saveData.settings.language,
                modChoice.upgradeId,
                'name',
                modChoice.name
              );
            }
          }
        }
        this.upgradeSys.recalculateStats(session);
        this.sound.playLevelUp();
        const pct = Math.round(10 * gained);
        this.events.emit('toast', {
          text: gainedWeaponName
            ? translateUi(this.saveData.settings.language, 'toast.bridgeLvUpWeapon', {
                lv: session.player.level,
                pct,
                weapon: gainedWeaponName,
              })
            : translateUi(this.saveData.settings.language, 'toast.bridgeLvUp', {
                lv: session.player.level,
                pct,
              }),
          tone: 'info',
        });
      } else {
        this.triggerNextLevelUp(session);
      }
    }
  }

  private triggerNextLevelUp(session: GameSession): void {
    session.pendingLevelUps -= 1;
    session.upgradeRequestSeq += 1;
    session.activeUpgradeRequestId = session.upgradeRequestSeq;
    session.activeUpgradeChoices = this.upgradeSys.generateChoices(session, 3);

    this.input.setEnabled(false);
    this.fsm.addPauseReason('level-up');
    this.sound.playLevelUp();

    this.emitStateAndHud();
    this.events.emit('levelUpRequest', {
      sessionId: session.sessionId,
      requestId: session.activeUpgradeRequestId,
      playerLevel: session.player.level,
      choices: session.activeUpgradeChoices,
    });
  }

  private handleChooseUpgrade(sessionId: number, requestId: number, upgradeId: string): void {
    const session = this.session;
    if (!session || session.sessionId !== sessionId) return;
    if (this.fsm.state !== 'level-up') return;
    if (session.activeUpgradeRequestId !== requestId) return;
    if (!session.activeUpgradeChoices.some((c) => c.upgradeId === upgradeId)) return;

    // Invalidate current request immediately to prevent double-click application
    session.activeUpgradeRequestId = 0;
    session.activeUpgradeChoices = [];

    this.upgradeSys.applyUpgrade(session, upgradeId);

    if (session.pendingLevelUps > 0) {
      this.triggerNextLevelUp(session);
      return;
    }

    this.resume('level-up');
  }

  private finishRun(session: GameSession, victory: boolean, reason: string): void {
    this.input.setEnabled(false);
    this.fsm.setState(victory ? 'victory' : 'game-over');

    if (victory) {
      this.sound.playVictory();
    } else {
      this.sound.playDefeat();
    }

    const levelId = session.level.id;
    const prevBestSurv = this.saveData.bestSurvivalSecByLevel[levelId] ?? 0;
    let isNewBest = false;
    if (session.elapsedSec > prevBestSurv) {
      this.saveData.bestSurvivalSecByLevel[levelId] = session.elapsedSec;
      isNewBest = true;
    }
    if (victory) {
      this.saveData.victories += 1;
      const prevFastest = this.saveData.bestVictorySecByLevel[levelId];
      if (prevFastest === undefined || session.elapsedSec < prevFastest) {
        this.saveData.bestVictorySecByLevel[levelId] = session.elapsedSec;
      }
    }
    this.storage.save(this.saveData);

    this.emitStateAndHud();
    const nextLvl = this.getNextLevelInMode(levelId);
    const result: ResultSnapshot = {
      sessionId: session.sessionId,
      victory,
      levelId,
      levelName: session.level.name,
      nextLevelId: nextLvl ? nextLvl.id : null,
      nextLevelName: nextLvl ? nextLvl.name : null,
      elapsedSec: session.elapsedSec,
      kills: session.player.kills,
      playerLevel: session.player.level,
      weapons: this.buildWeaponSnapshots(session),
      isNewBestTime: isNewBest,
      reason,
    };
    this.events.emit('result', result);
  }

  private emitStateAndHud(): void {
    const sid = this.session?.sessionId ?? 0;
    this.events.emit('stateChange', { state: this.fsm.state, sessionId: sid });
    if (this.session) {
      this.events.emit('hud', this.buildHudSnapshot(this.session));
    }
  }

  private fillWeaponSnapshots(session: GameSession, out: WeaponSlotSnapshot[]): WeaponSlotSnapshot[] {
    const weapons = session.player.weapons;
    out.length = Math.min(out.length, weapons.length);
    for (let i = 0; i < weapons.length; i += 1) {
      const w = weapons[i];
      const def = session.registries.weapons.get(w.weaponId);
      const maxCd = Math.max(0.05, (def?.cooldownSec ?? 1) * w.cooldownMult);
      const cdRatio = Math.max(0, Math.min(1, w.cooldownTimer / maxCd));
      const name = def?.name ?? w.weaponId;
      const evolved = w.mechanisms.size > 0;
      if (i < out.length) {
        const slot = out[i];
        slot.weaponId = w.weaponId;
        slot.name = name;
        slot.level = w.level;
        slot.cooldownRatio = cdRatio;
        slot.isEvolved = evolved;
      } else {
        out.push({
          weaponId: w.weaponId,
          name,
          level: w.level,
          cooldownRatio: cdRatio,
          isEvolved: evolved,
        });
      }
    }
    return out;
  }

  private buildWeaponSnapshots(session: GameSession): WeaponSlotSnapshot[] {
    return this.fillWeaponSnapshots(session, []);
  }

  private buildHudSnapshot(session: GameSession): HudSnapshot {
    this.hudBufferIdx ^= 1;
    const idx = this.hudBufferIdx;
    const snap = this.hudBuffers[idx];
    const p = session.player;
    const bossCfg = session.level.bossStage;
    const stage = session.level.stages[session.currentStageIndex];

    let stageId = stage?.id ?? 'stage-1-warmup';
    let stageLabel = stage?.label ?? '战斗阶段';
    let stageProgress = Math.min(1, session.elapsedSec / Math.max(1, bossCfg.triggerSec));
    if (session.elapsedSec >= bossCfg.triggerSec) {
      stageId = bossCfg.bossEnemyId;
      stageLabel = bossCfg.label;
      stageProgress = 1;
    }

    let boss: BossHudSnapshot | null = null;
    if (session.bossSpawned && !session.bossKilled) {
      const b = session.enemies.getIfValid(session.bossSlot, session.bossGen);
      if (b) {
        const phaseKey =
          b.bossShieldTimer > 0
            ? 'shield'
            : b.aiState === 'boss-slam-telegraph'
              ? 'slam'
              : b.aiState === 'boss-dash-telegraph'
                ? 'dash'
                : b.bossPhase >= 2
                  ? 'enrage'
                  : 'fight';
        const bossSnap = this.hudBossBuffers[idx];
        bossSnap.bossId = b.defId;
        bossSnap.name = b.name;
        bossSnap.hp = Math.ceil(b.hp);
        bossSnap.maxHp = b.maxHp;
        bossSnap.phaseKey = phaseKey;
        bossSnap.phaseLabel =
          phaseKey === 'slam'
            ? '蓄力重击!'
            : phaseKey === 'dash'
              ? '准备冲锋!'
              : '首领战';
        boss = bossSnap;
      }
    }

    let supply: SupplyIndicatorSnapshot | null = null;
    if (session.supply.active) {
      const dx = session.supply.x - p.x;
      const dz = session.supply.z - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      const supSnap = this.hudSupplyBuffers[idx];
      supSnap.active = true;
      supSnap.remainingSec = session.supply.remainingSec;
      supSnap.totalSec = session.supply.totalSec;
      supSnap.dirX = dx / dist;
      supSnap.dirZ = dz / dist;
      supSnap.distance = Math.round(dist);
      supSnap.rewardLabel = translateUi(this.saveData.settings.language, 'hud.supply');
      supply = supSnap;
    }

    const maxDashCd = Math.max(0.1, MovementSystem.DASH_COOLDOWN * p.dashCooldownMult);
    const maxGuardCd = Math.max(0.2, CombatSystem.GUARD_COOLDOWN * p.dashCooldownMult);

    snap.sessionId = session.sessionId;
    snap.levelId = session.level.id;
    snap.arenaShape = session.level.arenaShape ?? 'circle';
    snap.levelName = session.level.name;
    snap.state = this.fsm.state;
    snap.hp = Math.ceil(p.hp);
    snap.maxHp = p.maxHp;
    snap.shield = Math.ceil(p.shield);
    snap.maxShield = Math.ceil(p.maxShield);
    snap.relicCount = p.equippedRelics.length;
    snap.xp = p.xp;
    snap.xpToNext = p.xpToNext;
    snap.level = p.level;
    snap.elapsedSec = session.elapsedSec;
    snap.stageId = stageId;
    snap.stageLabel = stageLabel;
    snap.stageProgress = stageProgress;
    snap.kills = p.kills;
    snap.combo = session.combo;
    snap.comboTier = session.comboTier;
    snap.dashReadyRatio = Math.max(0, Math.min(1, 1 - p.dashCooldown / maxDashCd));
    snap.guardReadyRatio = Math.max(0, Math.min(1, 1 - p.guardCooldown / maxGuardCd));
    snap.furyRatio = Math.max(0, Math.min(1, p.furyCharge / 100));
    this.fillWeaponSnapshots(session, snap.weaponSlots);
    snap.maxWeaponSlots = session.level.weaponSlotCount;
    snap.boss = boss;
    snap.supply = supply;
    snap.activeEnemyCount = session.enemies.activeCount;
    return snap;
  }

  // =========================================================================
  // QA Debug Hooks (Zero overhead unless invoked by DebugBridge / DebugPanel)
  // =========================================================================

  public getDebugTelemetry() {
    const s = this.session;
    const p = s?.player;
    return {
      state: this.fsm.state,
      levelId: s?.level.id ?? '-',
      arenaShape: s?.level.arenaShape ?? 'circle',
      elapsedSec: s ? s.elapsedSec : 0,
      stageIndex: s ? s.currentStageIndex + 1 : 0,
      fps: Math.round(this.fpsSmoothed),
      activeEnemies: s ? s.enemies.activeCount : 0,
      activeProjectiles: s
        ? s.playerProjectiles.activeCount + s.enemyProjectiles.activeCount
        : 0,
      activeDrops: s ? s.drops.activeCount : 0,
      hp: p ? Math.ceil(p.hp) : 0,
      maxHp: p ? p.maxHp : 0,
      shield: p ? Math.ceil(p.shield) : 0,
      level: p ? p.level : 0,
      kills: p ? p.kills : 0,
      combo: s ? s.combo : 0,
      comboTier: s ? s.comboTier : 0,
      relicCount: p ? p.equippedRelics.length : 0,
      weaponCount: p ? p.weapons.length : 0,
      godMode: this.debugGodMode,
      timeScale: this.debugTimeScale,
      bossActive: Boolean(s && s.bossSpawned && !s.bossKilled),
    };
  }

  public setDebugGodMode(enabled: boolean): void {
    this.debugGodMode = enabled;
    if (this.session) {
      this.session.godMode = enabled;
      if (enabled) {
        this.session.player.hp = this.session.player.maxHp;
      }
      this.emitStateAndHud();
    }
  }

  public setDebugTimeScale(scale: 1 | 2 | 4): void {
    this.debugTimeScale = scale;
  }

  public debugJumpLevel(levelId: string): boolean {
    if (!this.loadLevel(levelId)) return false;
    this.start();
    return true;
  }

  public debugLevelUpNow(): boolean {
    const s = this.session;
    if (!s || this.fsm.state !== 'playing') return false;
    this.experience.grantXp(s, Math.max(1, s.player.xpToNext - s.player.xp), this.sound);
    if (s.pendingLevelUps > 0 && s.level.arenaShape !== 'bridge') {
      this.triggerNextLevelUp(s);
    }
    this.emitStateAndHud();
    return true;
  }

  public debugUnlockAllWeapons(): number {
    const s = this.session;
    if (!s) return 0;
    let added = 0;
    for (const wid of s.level.allowedWeaponIds) {
      if (!s.player.weapons.some((w) => w.weaponId === wid)) {
        s.player.weapons.push(s.createWeaponState(wid));
        added += 1;
      }
    }
    this.upgradeSys.recalculateStats(s);
    this.emitStateAndHud();
    return added;
  }

  public debugGrantRelic(grantAll = false): number {
    const s = this.session;
    if (!s) return 0;
    const lang = this.saveData.settings.language;
    if (!grantAll) {
      const granted = this.combat.grantNextRelic(s, translateUi(lang, 'debug.toast.relicPrefix'));
      if (this.combat.pendingNotices.length > 0) {
        const notice = this.combat.pendingNotices.shift()!;
        this.events.emit('toast', { text: notice.text, tone: 'success' });
      }
      this.syncVisualsNow(0);
      this.emitStateAndHud();
      return granted ? 1 : 0;
    }
    let count = 0;
    for (const eq of s.registries.equipment.list()) {
      if (!s.player.equippedRelics.includes(eq.id)) {
        this.upgradeSys.equipItemById(s, eq.id);
        count += 1;
      }
    }
    this.upgradeSys.recalculateStats(s);
    this.events.emit('toast', {
      text: translateUi(lang, 'debug.toast.allRelics', { count: s.player.equippedRelics.length }),
      tone: 'success',
    });
    this.emitStateAndHud();
    return count;
  }

  public debugSetCombo(combo: number): void {
    const s = this.session;
    if (!s) return;
    s.combo = Math.max(0, Math.floor(combo));
    this.upgradeSys.recalculateStats(s);
    if (s.comboTier >= 2) {
      this.sound.playComboFever(s.comboTier);
    }
    this.emitStateAndHud();
  }

  public debugFillFury(): void {
    const s = this.session;
    if (!s) return;
    s.player.furyCharge = 100;
    this.emitStateAndHud();
  }

  public debugTriggerFormation(): number {
    const s = this.session;
    if (!s) return 0;
    const stage = s.level.stages[s.currentStageIndex] ?? s.level.stages[0];
    if (!stage) return 0;
    const count = this.enemyWave.spawnWaveFormation(s, stage);
    this.events.emit('toast', {
      text: translateUi(this.saveData.settings.language, 'debug.toast.formation', { count }),
      tone: 'info',
    });
    this.syncVisualsNow(0);
    this.emitStateAndHud();
    return count;
  }

  public debugSpawnBridgeGates(corrupted: boolean): boolean {
    const s = this.session;
    if (!s) return false;
    const ok = this.progression.spawnBridgeGatesPair(s, corrupted);
    if (ok) {
      this.events.emit('toast', {
        text: translateUi(
          this.saveData.settings.language,
          corrupted ? 'debug.toast.gatesCorrupt' : 'debug.toast.gatesNormal'
        ),
        tone: 'info',
      });
      this.syncVisualsNow(0);
    }
    return ok;
  }

  public debugJumpToBoss(): boolean {
    const s = this.session;
    if (!s) return false;
    s.elapsedSec = Math.max(s.elapsedSec, s.level.bossStage.triggerSec);
    if (!s.bossSpawned) {
      this.enemyWave.update(s, 0.016, this.cameraCtrl.getGroundViewBounds(), this.combat, this.sound);
    }
    this.syncVisualsNow(0);
    this.emitStateAndHud();
    return s.bossSpawned;
  }

  public debugClearNormalEnemies(): number {
    const s = this.session;
    if (!s) return 0;
    let cleared = 0;
    s.enemies.forEachActive((e) => {
      if (!e.isBoss) {
        s.enemies.release(e);
        cleared += 1;
      }
    });
    this.syncVisualsNow(0);
    this.emitStateAndHud();
    return cleared;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loopRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    this.input.dispose();
    this.sound.dispose();
    this.disposeCurrentSession();

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onWindowBlur);
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('orientationchange', this.handleResize);
      window.visualViewport?.removeEventListener('resize', this.handleResize);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
      this.canvas = null;
    }

    this.entityRenderer?.dispose();
    this.entityRenderer = null;
    this.arena?.dispose();
    this.arena = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.events.clear();
  }
}
