import * as THREE from 'three';
import { SoundEngine } from '../audio/SoundEngine';
import { QUALITY_PROFILES, resolveEffectiveMaxDpr } from '../config/qualityConfig';
import { RUNTIME_CONFIG } from '../config/runtimeConfig';
import type {
  CharacterDefinition,
  GameModeKey,
  LevelDefinition,
} from '../content/definitions/ContentTypes';
import { validateLevelConfig } from '../content/registries/ConfigValidator';
import type { ContentRegistries } from '../content/registries/ContentRegistry';
import { createDefaultRegistries } from '../content/registries/DefaultContent';
import {
  ACHIEVEMENTS,
  type AchievementDefinition,
} from '../content/achievements/achievements';
import { ENCHANTS, RELIC_ENCHANT_COST } from '../content/enchants/enchants';
import {
  GEMS,
  getRelicRefineCost,
  makeGemKey,
  MAX_RELIC_RANK,
  parseGemKey,
  RELIC_SOCKET_COST,
  type GemTypeId,
} from '../content/gems/gems';
import {
  CHALLENGE_MODIFIER_MAP,
  type ChallengeModifierId,
} from '../content/modifiers/modifiers';
import {
  getTalentTotalInvested,
  getTalentUpgradeCost,
  TALENT_MAP,
  type TalentId,
} from '../content/talents/talents';
import { translateContent, translateUi } from '../i18n/i18n';
import { InputController } from '../input/InputController';
import { CameraController } from '../scene/CameraController';
import { EntityRenderer } from '../scene/EntityRenderer';
import { setTerrainTextureAnisotropy } from '../scene/ProceduralTextures';
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
  private gpuRendererName: string | null = null;
  private maxHardwareAnisotropy = 1;

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
      endlessMode: false,
      hp: 0,
      maxHp: 1,
      shield: 0,
      maxShield: 0,
      relicCount: 0,
      relicIds: [],
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
      attackReadyRatio: 1,
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

  public getRelicCatalog() {
    return this.registries.equipment.list();
  }

  public getAchievements(): readonly AchievementDefinition[] {
    return ACHIEVEMENTS;
  }

  public upgradeTalent(talentId: TalentId): boolean {
    const def = TALENT_MAP.get(talentId);
    if (!def) return false;
    const cur = Math.max(0, Math.floor(this.saveData.talents[talentId] ?? 0));
    if (cur >= def.maxLevel) return false;
    const cost = getTalentUpgradeCost(def, cur);
    if (this.saveData.stars < cost) return false;
    this.saveData.stars -= cost;
    this.saveData.talents[talentId] = cur + 1;
    this.storage.save(this.saveData);
    return true;
  }

  public resetTalents(): boolean {
    const refund = getTalentTotalInvested(this.saveData.talents);
    if (refund <= 0) return false;
    this.saveData.stars += refund;
    this.saveData.talents = {};
    this.storage.save(this.saveData);
    return true;
  }

  public isLevelUnlocked(levelId: string, bypass = false): boolean {
    if (bypass) return true;
    const lvl = this.registries.levels.get(levelId);
    if (!lvl || !lvl.visibleInMenu) return Boolean(lvl);
    if ((this.saveData.bestVictorySecByLevel[levelId] ?? 0) > 0) return true;
    const mode: GameModeKey =
      lvl.modeGroup ?? (lvl.arenaShape === 'bridge' ? 'defense' : 'survival');
    const ordered = this.getLevelsByMode(mode);
    const idx = ordered.findIndex((l) => l.id === levelId);
    if (idx <= 0) return true;
    const prev = ordered[idx - 1];
    return (this.saveData.bestVictorySecByLevel[prev.id] ?? 0) > 0;
  }

  public getCharacters(): readonly CharacterDefinition[] {
    return this.registries.characters.list();
  }

  public selectCharacter(characterId: string): boolean {
    if (!this.registries.characters.get(characterId)) return false;
    if (!this.saveData.unlockedCharacters.includes(characterId)) return false;
    this.saveData.selectedCharacterId = characterId;
    this.storage.save(this.saveData);
    if (this.fsm.state === 'menu' && this.menuPreviewMode) {
      const mode = this.menuPreviewMode;
      this.menuPreviewMode = null;
      this.setMenuPreviewMode(mode);
    }
    return true;
  }

  public unlockCharacter(characterId: string): boolean {
    if (!this.registries.characters.get(characterId)) return false;
    if (this.saveData.unlockedCharacters.includes(characterId)) return false;
    const shards = this.saveData.characterShards[characterId] ?? 0;
    if (shards >= 20) {
      this.saveData.characterShards[characterId] = shards - 20;
    } else if (this.saveData.stars >= 25) {
      this.saveData.stars -= 25;
    } else {
      return false;
    }
    this.saveData.unlockedCharacters.push(characterId);
    this.saveData.characterStars[characterId] = Math.max(
      1,
      this.saveData.characterStars[characterId] ?? 1
    );
    this.saveData.selectedCharacterId = characterId;
    this.storage.save(this.saveData);
    return true;
  }

  public starUpCharacter(characterId: string): boolean {
    if (!this.saveData.unlockedCharacters.includes(characterId)) return false;
    const curStar = Math.max(1, Math.floor(this.saveData.characterStars[characterId] ?? 1));
    if (curStar >= 5) return false;
    const shardCost = curStar * 10;
    const starCost = curStar * 22;
    const ownedShards = this.saveData.characterShards[characterId] ?? 0;
    if (ownedShards >= shardCost) {
      this.saveData.characterShards[characterId] = ownedShards - shardCost;
    } else if (this.saveData.stars >= starCost) {
      this.saveData.stars -= starCost;
    } else {
      return false;
    }
    this.saveData.characterStars[characterId] = curStar + 1;
    this.storage.save(this.saveData);
    return true;
  }

  public unlockSecondLoadoutSlot(): boolean {
    if (this.saveData.loadoutSlotsUnlocked >= 2) return false;
    if (this.saveData.stars < 40) return false;
    this.saveData.stars -= 40;
    this.saveData.loadoutSlotsUnlocked = 2;
    this.storage.save(this.saveData);
    return true;
  }

  public toggleLoadoutRelic(relicId: string): boolean {
    if (!this.saveData.discoveredRelics.includes(relicId)) return false;
    const idx = this.saveData.loadoutRelicIds.indexOf(relicId);
    if (idx >= 0) {
      this.saveData.loadoutRelicIds.splice(idx, 1);
    } else {
      if (this.saveData.loadoutRelicIds.length >= this.saveData.loadoutSlotsUnlocked) {
        return false;
      }
      this.saveData.loadoutRelicIds.push(relicId);
    }
    this.storage.save(this.saveData);
    return true;
  }

  public refineRelic(relicId: string): boolean {
    if (!this.saveData.discoveredRelics.includes(relicId)) return false;
    const curRank = Math.max(0, Math.floor(this.saveData.relicRanks[relicId] ?? 0));
    if (curRank >= MAX_RELIC_RANK) return false;
    const cost = getRelicRefineCost(curRank);
    if (this.saveData.stars < cost) return false;
    this.saveData.stars -= cost;
    this.saveData.relicRanks[relicId] = curRank + 1;
    this.storage.save(this.saveData);
    return true;
  }

  public unlockRelicSocket(relicId: string): boolean {
    if (!this.saveData.discoveredRelics.includes(relicId)) return false;
    if (Object.prototype.hasOwnProperty.call(this.saveData.relicSockets, relicId)) return false;
    if (this.saveData.stars < RELIC_SOCKET_COST) return false;
    this.saveData.stars -= RELIC_SOCKET_COST;
    this.saveData.relicSockets[relicId] = null;
    this.storage.save(this.saveData);
    return true;
  }

  public socketGem(relicId: string, gemKey: string): boolean {
    if (!this.saveData.discoveredRelics.includes(relicId)) return false;
    if (!Object.prototype.hasOwnProperty.call(this.saveData.relicSockets, relicId)) return false;
    if (!parseGemKey(gemKey)) return false;
    const owned = this.saveData.gemInventory[gemKey] ?? 0;
    if (owned <= 0) return false;

    const prevKey = this.saveData.relicSockets[relicId];
    if (prevKey === gemKey) return false;
    if (prevKey) {
      this.saveData.gemInventory[prevKey] = (this.saveData.gemInventory[prevKey] ?? 0) + 1;
    }
    if (owned === 1) {
      delete this.saveData.gemInventory[gemKey];
    } else {
      this.saveData.gemInventory[gemKey] = owned - 1;
    }
    this.saveData.relicSockets[relicId] = gemKey;
    this.storage.save(this.saveData);
    return true;
  }

  public unsocketGem(relicId: string): boolean {
    const prevKey = this.saveData.relicSockets[relicId];
    if (!prevKey) return false;
    this.saveData.gemInventory[prevKey] = (this.saveData.gemInventory[prevKey] ?? 0) + 1;
    this.saveData.relicSockets[relicId] = null;
    this.storage.save(this.saveData);
    return true;
  }

  public fuseGem(type: GemTypeId, tier: 1 | 2): boolean {
    const srcKey = makeGemKey(type, tier);
    const owned = this.saveData.gemInventory[srcKey] ?? 0;
    if (owned < 3) return false;
    if (owned === 3) {
      delete this.saveData.gemInventory[srcKey];
    } else {
      this.saveData.gemInventory[srcKey] = owned - 3;
    }
    const nextKey = makeGemKey(type, (tier + 1) as 2 | 3);
    this.saveData.gemInventory[nextKey] = (this.saveData.gemInventory[nextKey] ?? 0) + 1;
    this.storage.save(this.saveData);
    return true;
  }

  public enchantRelic(relicId: string): boolean {
    if (!this.saveData.discoveredRelics.includes(relicId)) return false;
    if (this.saveData.stars < RELIC_ENCHANT_COST) return false;
    const current = this.saveData.relicEnchants[relicId];
    const pool = ENCHANTS.filter((e) => e.id !== current);
    const chosen = pool[Math.floor(Math.random() * pool.length)] ?? ENCHANTS[0];
    this.saveData.stars -= RELIC_ENCHANT_COST;
    this.saveData.relicEnchants[relicId] = chosen.id;
    this.storage.save(this.saveData);
    return true;
  }

  public toggleModifier(modifierId: ChallengeModifierId): boolean {
    if (!CHALLENGE_MODIFIER_MAP.has(modifierId)) return false;
    const idx = this.saveData.activeModifiers.indexOf(modifierId);
    if (idx >= 0) {
      this.saveData.activeModifiers.splice(idx, 1);
    } else {
      this.saveData.activeModifiers.push(modifierId);
    }
    this.storage.save(this.saveData);
    return true;
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
    this.maxHardwareAnisotropy = Math.max(1, this.renderer.capabilities.getMaxAnisotropy());
    try {
      const gl = this.renderer.getContext();
      const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbgExt) {
        const raw = gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL);
        if (typeof raw === 'string') {
          this.gpuRendererName = raw;
        }
      }
    } catch {
      this.gpuRendererName = null;
    }

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

    const maxDpr = resolveEffectiveMaxDpr(this.saveData.settings.quality, this.gpuRendererName);
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
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
    const desiredAniso = tier === 'high' ? 4 : tier === 'medium' ? 2 : 1;
    setTerrainTextureAnisotropy(Math.min(desiredAniso, this.maxHardwareAnisotropy));
    if (this.session) {
      this.session.vfxScale = profile.maxVfxMultiplier;
    }
    if (this.renderer) {
      this.renderer.shadowMap.enabled = profile.shadowsEnabled;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        resolveEffectiveMaxDpr(tier, this.gpuRendererName)
      );
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
    this.handleResize();
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
      case 'triggerAttack':
        this.input.queueAttack();
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

  public loadLevel(levelId: string, startEndless = false): boolean {
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
    this.session = new GameSession(
      this.sessionSeq,
      level,
      this.registries,
      this.saveData.selectedCharacterId
    );
    this.session.language = this.saveData.settings.language;
    this.session.godMode = this.debugGodMode;
    this.session.vfxScale = QUALITY_PROFILES[this.saveData.settings.quality].maxVfxMultiplier;
    this.session.setModifiers(this.saveData.activeModifiers);
    this.upgradeSys.applyMetaTalents(
      this.session,
      this.saveData.talents,
      this.saveData.characterStars,
      this.saveData.loadoutRelicIds,
      this.saveData.relicRanks,
      this.saveData.relicSockets,
      this.saveData.relicEnchants
    );
    if (startEndless) {
      this.session.endlessMode = true;
      this.session.endlessStartedAtSec = 0;
      this.session.endlessWaveLevel = 1;
      this.session.endlessBossTimer = 50;
      this.session.player.level = 5;
      this.session.player.xpToNext = this.session.computeXpToNext(5);
      this.session.player.directModifiers.damageBonus += 0.25;
      this.session.player.directModifiers.maxHpBonus += 40;
      if (level.arenaShape === 'bridge') {
        for (const wid of level.allowedWeaponIds) {
          if (this.session.player.weapons.length >= Math.min(3, level.weaponSlotCount)) break;
          if (!this.session.player.weapons.some((w) => w.weaponId === wid)) {
            this.session.player.weapons.push(this.session.createWeaponState(wid));
          }
        }
      } else {
        this.session.pendingLevelUps = 3;
      }
      this.upgradeSys.recalculateStats(this.session);
      this.session.player.hp = this.session.player.maxHp;
    }
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

  public enterEndlessMode(): boolean {
    const s = this.session;
    if (!s || (s.level.stageOrder ?? 0) < 4 || !this.fsm.enterEndlessFromVictory()) return false;
    s.endlessMode = true;
    s.endlessStartedAtSec = s.elapsedSec;
    s.endlessWaveLevel = 1;
    s.endlessBossTimer = 50;
    s.bossKilled = false;
    s.bossSpawned = false;
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + s.player.maxHp * 0.5);
    this.clock.resetTimeBaseline(performance.now());
    this.input.setEnabled(true);
    this.emitStateAndHud();
    return true;
  }

  public extractEndlessRun(): boolean {
    const s = this.session;
    if (!s || !s.endlessMode || this.fsm.isTerminal()) return false;
    this.finishRun(
      s,
      true,
      translateUi(this.saveData.settings.language, 'res.endlessExtractReason')
    );
    return true;
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
    const ch =
      this.registries.characters.get(this.saveData.selectedCharacterId) ??
      this.registries.characters.get(previewLevel.characterId);
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
      const { wallDt, rawDt, steps, alpha } = this.clock.tick(nowMs, simulating);
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
        const renderAlpha = this.debugTimeScale > 1 ? 1 : alpha;
        const p = this.session.player;
        const renderX = p.prevX + (p.x - p.prevX) * renderAlpha;
        const renderZ = p.prevZ + (p.z - p.prevZ) * renderAlpha;
        this.cameraCtrl.setTarget(renderX, renderZ);
        this.cameraCtrl.update(rawDt);
        this.syncVisualsNow(rawDt, renderAlpha);

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

  private syncVisualsNow(dt = 0, alpha = 1): void {
    if (!this.session || !this.arena || !this.entityRenderer) return;
    let activeWeaponMask = 0;
    const weapons = this.session.player.weapons;
    for (let i = 0; i < weapons.length; i += 1) {
      const wid = weapons[i].weaponId;
      if (wid === 'thunder-arc') activeWeaponMask |= 1;
      else if (wid === 'rail-sniper') activeWeaponMask |= 2;
      else if (wid === 'frost-nova') activeWeaponMask |= 4;
    }
    const p = this.session.player;
    const renderX = p.prevX + (p.x - p.prevX) * alpha;
    const renderZ = p.prevZ + (p.z - p.prevZ) * alpha;
    const renderTimeSec = this.clock.simTimeSec + alpha * this.clock.fixedStep;
    this.arena.updatePlayerVisual(
      renderX,
      renderZ,
      p.facingRad,
      p.isMoving,
      renderTimeSec,
      dt,
      p.hitFlashTimer > 0,
      this.session.comboTier,
      activeWeaponMask,
      p.equippedRelics.length
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
      this.session.shockwaves,
      this.session.bridgeBarrel,
      this.session.hazardZone,
      this.session.bridgeMeteor,
      renderX,
      renderZ
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
    session.player.prevX = session.player.x;
    session.player.prevZ = session.player.z;

    this.movement.updatePlayer(session, this.input, dt, this.sound);
    if (session.player.guardCooldown <= 0 && this.input.consumeGuard()) {
      this.combat.triggerAegisGuard(session, this.sound);
    }
    if (session.player.furyCharge >= 100 && this.input.consumeFury()) {
      this.combat.triggerFuryUltimate(session, this.sound);
    }
    if (session.player.attackCooldown <= 0 && this.input.consumeAttack()) {
      this.combat.triggerManualAttack(session, this.sound);
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
      rerollsRemaining: session.rerollsRemaining,
      choices: session.activeUpgradeChoices,
    });
  }

  public rerollLevelUp(requestId: number): boolean {
    const session = this.session;
    if (!session || this.fsm.state !== 'level-up') return false;
    if (session.activeUpgradeRequestId !== requestId) return false;
    if (session.rerollsRemaining <= 0) return false;

    session.rerollsRemaining -= 1;
    session.upgradeRequestSeq += 1;
    session.activeUpgradeRequestId = session.upgradeRequestSeq;
    session.activeUpgradeChoices = this.upgradeSys.generateChoices(session, 3);
    this.sound.playReroll();
    this.events.emit('levelUpRequest', {
      sessionId: session.sessionId,
      requestId: session.activeUpgradeRequestId,
      playerLevel: session.player.level,
      rerollsRemaining: session.rerollsRemaining,
      choices: session.activeUpgradeChoices,
    });
    return true;
  }

  public skipLevelUp(requestId: number): boolean {
    const session = this.session;
    if (!session || this.fsm.state !== 'level-up') return false;
    if (session.activeUpgradeRequestId !== requestId) return false;

    session.activeUpgradeRequestId = 0;
    session.activeUpgradeChoices = [];
    session.player.hp = Math.min(
      session.player.maxHp,
      session.player.hp + session.player.maxHp * 0.1
    );
    session.player.furyCharge = Math.min(100, session.player.furyCharge + 10);
    this.sound.playSupply();

    if (session.pendingLevelUps > 0) {
      this.triggerNextLevelUp(session);
      return true;
    }
    this.resume('level-up');
    return true;
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
    if (this.fsm.state === 'victory' || this.fsm.state === 'game-over') return;
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
    if (victory && !session.endlessMode) {
      this.saveData.victories += 1;
      const prevFastest = this.saveData.bestVictorySecByLevel[levelId];
      if (prevFastest === undefined || session.elapsedSec < prevFastest) {
        this.saveData.bestVictorySecByLevel[levelId] = session.elapsedSec;
      }
    }
    if (session.endlessMode) {
      const prevEndless = this.saveData.bestEndlessSecByLevel[levelId] ?? 0;
      if (session.elapsedSec > prevEndless) {
        this.saveData.bestEndlessSecByLevel[levelId] = session.elapsedSec;
      }
    }

    const greedLvl = Math.max(0, Math.floor(this.saveData.talents.greed ?? 0));
    let starBonusPct = greedLvl * 15;
    for (const mid of this.saveData.activeModifiers) {
      const mDef = CHALLENGE_MODIFIER_MAP.get(mid);
      if (mDef) starBonusPct += mDef.starBonusPct;
    }
    const starMult = 1 + starBonusPct / 100;
    const baseStars = Math.max(
      1,
      Math.floor(session.player.kills / 12) +
        Math.floor(session.elapsedSec / 35) +
        (victory ? 12 : 0) +
        (session.endlessMode ? session.endlessWaveLevel * 4 + session.endlessBossKills * 5 : 0)
    );
    const earnedStars = Math.max(1, Math.round(baseStars * starMult));
    this.saveData.stars += earnedStars;
    this.saveData.totalStarsEarned += earnedStars;

    // Grant hero shards based on run performance & stage tier
    const stageBonus = Math.max(0, (session.level.stageOrder ?? 1) - 1);
    const activeShards =
      1 + (victory ? 2 : 0) + stageBonus + (session.endlessMode ? session.endlessBossKills : 0);
    const activeCharId = session.character.id;
    const earnedShards: Record<string, number> = { [activeCharId]: activeShards };
    if (
      victory &&
      (session.level.stageOrder ?? 99) === 1 &&
      session.level.arenaShape !== 'bridge' &&
      !this.saveData.unlockedCharacters.includes('storm-ranger')
    ) {
      earnedShards['storm-ranger'] = (earnedShards['storm-ranger'] ?? 0) + 6;
    } else if (
      victory &&
      (session.level.stageOrder ?? 99) === 1 &&
      session.level.arenaShape === 'bridge' &&
      !this.saveData.unlockedCharacters.includes('iron-bastion')
    ) {
      earnedShards['iron-bastion'] = (earnedShards['iron-bastion'] ?? 0) + 6;
    }
    for (const [cid, amt] of Object.entries(earnedShards)) {
      this.saveData.characterShards[cid] = (this.saveData.characterShards[cid] ?? 0) + amt;
    }

    // Grant gem drops on victory or endless boss kills
    const earnedGems: Record<string, number> = {};
    const gemDrops = (victory ? 1 : 0) + Math.min(2, session.endlessBossKills);
    for (let i = 0; i < gemDrops; i += 1) {
      const gemDef = GEMS[session.rng.int(0, GEMS.length)];
      const gKey = makeGemKey(gemDef.id, 1);
      earnedGems[gKey] = (earnedGems[gKey] ?? 0) + 1;
      this.saveData.gemInventory[gKey] = (this.saveData.gemInventory[gKey] ?? 0) + 1;
    }

    // Record discovered relics & evolved weapons + evaluate milestone achievements
    const newlyDiscoveredRelicIds: string[] = [];
    for (const rid of session.player.equippedRelics) {
      if (!this.saveData.discoveredRelics.includes(rid)) {
        this.saveData.discoveredRelics.push(rid);
        newlyDiscoveredRelicIds.push(rid);
      }
    }
    for (const w of session.player.weapons) {
      if (w.mechanisms.size > 0 && !this.saveData.discoveredEvolvedWeapons.includes(w.weaponId)) {
        this.saveData.discoveredEvolvedWeapons.push(w.weaponId);
      }
    }
    this.evaluateAchievements(session, victory);

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
      relicIds: [...session.player.equippedRelics],
      newlyDiscoveredRelicIds,
      isNewBestTime: isNewBest,
      isEndless: session.endlessMode,
      earnedStars,
      earnedShards,
      earnedGems,
      reason,
    };
    this.events.emit('result', result);
  }

  private evaluateAchievements(session: GameSession, victory: boolean): void {
    const unlock = (id: string) => {
      if (this.saveData.unlockedAchievements.includes(id)) return;
      this.saveData.unlockedAchievements.push(id);
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) {
        this.saveData.stars += def.rewardStars;
        this.saveData.totalStarsEarned += def.rewardStars;
      }
    };

    if (victory || this.saveData.victories > 0) unlock('first-victory');
    if (session.player.kills >= 250) unlock('slayer-250');
    if (session.player.kills >= 600) unlock('slayer-600');
    if (this.saveData.discoveredRelics.length >= 10) unlock('relic-collector-10');
    if (this.saveData.discoveredRelics.length >= 20) unlock('relic-collector-20');
    if (this.saveData.discoveredEvolvedWeapons.length >= 3) unlock('synergy-master');
    if (session.endlessMode) unlock('endless-explorer');
    if (victory && this.saveData.activeModifiers.length > 0) unlock('challenge-victor');
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
    if (session.endlessMode) {
      stageId = 'endless-mode';
      stageLabel =
        session.language === 'en'
          ? `Endless Abyss · Tier ${session.endlessWaveLevel}`
          : `无尽深渊 · 第 ${session.endlessWaveLevel} 阶`;
      stageProgress = 1;
    } else if (session.elapsedSec >= bossCfg.triggerSec) {
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
    const maxAttackCd = Math.max(
      0.15,
      CombatSystem.MANUAL_ATTACK_COOLDOWN / Math.max(0.6, p.attackSpeedMult)
    );

    snap.sessionId = session.sessionId;
    snap.levelId = session.level.id;
    snap.arenaShape = session.level.arenaShape ?? 'circle';
    snap.levelName = session.level.name;
    snap.state = this.fsm.state;
    snap.endlessMode = session.endlessMode;
    snap.hp = Math.ceil(p.hp);
    snap.maxHp = p.maxHp;
    snap.shield = Math.ceil(p.shield);
    snap.maxShield = Math.ceil(p.maxShield);
    snap.relicCount = p.equippedRelics.length;
    snap.relicIds.length = 0;
    for (let i = 0; i < p.equippedRelics.length; i += 1) {
      snap.relicIds.push(p.equippedRelics[i]);
    }
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
    snap.attackReadyRatio = Math.max(0, Math.min(1, 1 - p.attackCooldown / maxAttackCd));
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
      isEndless: Boolean(s?.endlessMode),
      canInstantClear: Boolean(
        s &&
          !s.endlessMode &&
          !this.fsm.isTerminal() &&
          s.level.visibleInMenu &&
          (s.level.stageOrder ?? 0) >= 1 &&
          (s.level.stageOrder ?? 0) <= 4
      ),
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
    if (s.bossSpawned) {
      s.bridgeGates[0].active = false;
      s.bridgeGates[1].active = false;
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

  public debugInstantClear(): boolean {
    const s = this.session;
    if (!s || s.endlessMode || this.fsm.isTerminal()) return false;
    if (!s.level.visibleInMenu) return false;
    const order = s.level.stageOrder ?? 0;
    if (order < 1 || order > 4) return false;
    this.finishRun(s, true, `QA 快速通关 ${s.level.name}`);
    return true;
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
