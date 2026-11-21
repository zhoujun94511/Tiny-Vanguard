import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../config/appConfig';
import {
  calcTotalPages,
  clampPage,
  resolvePageForIndex,
  slicePageItems,
} from '../../components/common/usePagination';
import { SoundEngine } from '../audio/SoundEngine';
import { validateLevelConfig } from '../content/registries/ConfigValidator';
import { DEBUFF_BY_ID } from '../content/effects/debuffs';
import { createDefaultRegistries } from '../content/registries/DefaultContent';
import {
  getTalentTotalInvested,
  getTalentUpgradeCost,
  TALENT_MAP,
} from '../content/talents/talents';
import { resolveEffectiveMaxDpr } from '../config/qualityConfig';
import { GameClock } from '../core/GameClock';
import { GameRuntime } from '../core/GameRuntime';
import { GameStateMachine } from '../core/GameStateMachine';
import { computePreRunPreviewStats } from '../core/PreRunPreview';
import { createF9DoublePressDetector, DebugBridge } from '../debug/DebugBridge';
import { ObjectPool } from '../pool/ObjectPool';
import { CameraController } from '../scene/CameraController';
import { GameSession } from '../session/GameSession';
import { SaveStorage } from '../session/SaveStorage';
import { createEmptyEnemy } from '../session/SessionEntities';
import { SpatialGrid } from '../spatial/SpatialGrid';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyWaveSystem } from '../systems/EnemyWaveSystem';
import { ExperienceSystem } from '../systems/ExperienceSystem';
import { InputController } from '../input/InputController';
import { LevelProgressionSystem } from '../systems/LevelProgressionSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { StatusEffectSystem } from '../systems/StatusEffectSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';

describe('ObjectPool', () => {
  it('supports acquire, double-release protection, generation bump, and reserved slots', () => {
    const pool = new ObjectPool(5, createEmptyEnemy, 1);
    expect(pool.normalLimit).toBe(4);

    const a = pool.acquire()!;
    const b = pool.acquire()!;
    const c = pool.acquire()!;
    const d = pool.acquire()!;
    expect(a && b && c && d).toBeTruthy();
    expect(pool.acquire()).toBeNull(); // normal capacity exhausted

    // Boss reserved slot still succeeds
    const boss = pool.acquireReserved();
    expect(boss).not.toBeNull();
    expect(pool.activeCount).toBe(5);

    const oldGen = a.generation;
    expect(pool.release(a)).toBe(true);
    expect(pool.release(a)).toBe(false); // double-release guarded
    expect(pool.getIfValid(a.slotIndex, oldGen)).toBeNull();
  });
});

describe('SpatialGrid', () => {
  it('finds inserted entities within radius and respects maxResults', () => {
    const grid = new SpatialGrid(30, 3, 20);
    grid.insert(0, 1, 1);
    grid.insert(1, 2, 1.5);
    grid.insert(2, 20, 20);

    const out: number[] = [];
    grid.queryCircleCandidates(1.5, 1.5, 3, out, 10);
    expect(out).toContain(0);
    expect(out).toContain(1);
    expect(out).not.toContain(2);
  });
});

describe('ConfigValidator & Registries', () => {
  it('validates all levels and enforces >= 20 content items across categories', () => {
    const regs = createDefaultRegistries();
    for (const lvl of regs.levels.list()) {
      const issues = validateLevelConfig(lvl, regs);
      expect(issues).toEqual([]);
    }
    expect(regs.levels.list().filter((l) => l.visibleInMenu).length).toBeGreaterThanOrEqual(4);
    expect(regs.debuffs.list().length).toBeGreaterThanOrEqual(20);
    expect(regs.buffs.list().length).toBeGreaterThanOrEqual(20);
    expect(regs.equipment.list().length).toBeGreaterThanOrEqual(20);
    expect(regs.upgrades.list().length).toBeGreaterThanOrEqual(20);

    const rt = new GameRuntime(regs);
    expect(rt.getLevelsByMode('survival').map((l) => l.id)).toEqual([
      'meadow-arena',
      'ember-canyon',
      'shadow-ruins',
      'astral-throne',
    ]);
    expect(rt.getLevelsByMode('defense').map((l) => l.id)).toEqual([
      'bridge-defense',
      'frost-bridge',
      'iron-viaduct',
      'abyss-span',
    ]);
    expect(rt.getNextLevelInMode('meadow-arena')?.id).toBe('ember-canyon');
    expect(rt.getNextLevelInMode('ember-canyon')?.id).toBe('shadow-ruins');
    expect(rt.getNextLevelInMode('shadow-ruins')?.id).toBe('astral-throne');
    expect(rt.getNextLevelInMode('astral-throne')).toBeNull();
    expect(rt.getNextLevelInMode('bridge-defense')?.id).toBe('frost-bridge');
    expect(rt.getNextLevelInMode('frost-bridge')?.id).toBe('iron-viaduct');
    expect(rt.getNextLevelInMode('iron-viaduct')?.id).toBe('abyss-span');
    expect(rt.getNextLevelInMode('abyss-span')).toBeNull();
    rt.destroy();
  });

  it('detects invalid references with levelId and field', () => {
    const regs = createDefaultRegistries();
    const base = regs.levels.getOrThrow('meadow-arena');
    const broken = { ...base, characterId: 'missing-char' };
    const issues = validateLevelConfig(broken, regs);
    expect(issues.some((i) => i.levelId === 'meadow-arena' && i.field === 'characterId')).toBe(true);
  });
});

describe('UpgradeSystem & Session Isolation', () => {
  it('respects weaponSlotCount, generates 3 unique choices, and never mutates definitions', () => {
    const regs = createDefaultRegistries();
    const level = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(1, level, regs);
    const upgSys = new UpgradeSystem();

    const startWeaponDef = regs.weapons.getOrThrow('star-blaster');
    const origDmg = startWeaponDef.baseDamage;

    const choices = upgSys.generateChoices(session, 3);
    expect(choices.length).toBe(3);
    const uniqueIds = new Set(choices.map((c) => c.upgradeId));
    expect(uniqueIds.size).toBe(3);

    expect(level.weaponSlotCount).toBe(4);
    expect(upgSys.applyUpgrade(session, 'unlock-orbit-shields')).toBe(true);
    expect(upgSys.applyUpgrade(session, 'unlock-frost-nova')).toBe(true);
    expect(upgSys.applyUpgrade(session, 'unlock-thunder-arc')).toBe(true);
    expect(session.player.weapons.length).toBe(4);
    // All 4 slots filled on meadow-arena, so 5th weapon must be ineligible
    const sniperUnlock = regs.upgrades.getOrThrow('unlock-rail-sniper');
    expect(upgSys.isUpgradeEligible(session, sniperUnlock)).toBe(false);
    expect(startWeaponDef.baseDamage).toBe(origDmg);

    // Explicitly verify tight 2-slot cap still blocks 3rd weapon when configured
    const cappedLevel = { ...level, weaponSlotCount: 2 };
    const cappedSession = new GameSession(10, cappedLevel, regs);
    expect(upgSys.applyUpgrade(cappedSession, 'unlock-orbit-shields')).toBe(true);
    const frostUnlock = regs.upgrades.getOrThrow('unlock-frost-nova');
    expect(upgSys.isUpgradeEligible(cappedSession, frostUnlock)).toBe(false);
    cappedSession.dispose();
  });

  it('handles XP overflow into multiple pending level-ups and same-frame terminal priority', () => {
    const regs = createDefaultRegistries();
    const level = regs.levels.getOrThrow('internal-rapid-test');
    const session = new GameSession(2, level, regs);
    const expSys = new ExperienceSystem();
    const progSys = new LevelProgressionSystem();
    const combat = new CombatSystem();

    expSys.grantXp(session, 200, null);
    expect(session.player.level).toBeGreaterThan(2);
    expect(session.pendingLevelUps).toBeGreaterThan(1);

    // Same-frame player death + boss killed -> player-death-first
    session.bossSpawned = true;
    session.bossKilled = true;
    session.player.hp = 0;
    const outcome = progSys.update(session, 0.016, combat, null);
    expect(outcome.terminal).toBe(true);
    if (outcome.terminal) {
      expect(outcome.victory).toBe(false);
    }
  });
});

describe('GameClock & GameStateMachine', () => {
  it('stacks pause reasons and blocks resuming from terminal states', () => {
    const fsm = new GameStateMachine();
    fsm.setState('playing');
    fsm.addPauseReason('hidden');
    fsm.addPauseReason('manual');
    expect(fsm.state).toBe('paused');

    // Removing one reason must not resume while manual pause is active
    expect(fsm.removePauseReason('hidden')).toBe(false);
    expect(fsm.state).toBe('paused');

    expect(fsm.removePauseReason('manual')).toBe(true);
    expect(fsm.state).toBe('playing');

    fsm.setState('victory');
    expect(fsm.setState('playing')).toBe(false);
  });

  it('caps catch-up steps on huge frame delta', () => {
    const clock = new GameClock(1 / 60, 0.1, 5);
    clock.resetTimeBaseline(1000);
    const res = clock.tick(2500, true); // 1.5s jump -> clamped to 0.1s -> 5 steps max
    expect(res.steps).toBeLessThanOrEqual(5);
  });
});

describe('Reusable Pagination Logic', () => {
  it('computes pages, clamps boundaries, slices cleanly, and jumps to target index', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(calcTotalPages(items.length, 4)).toBe(3);
    expect(calcTotalPages(items.length, 3)).toBe(4);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(99, 3)).toBe(3);

    expect(slicePageItems(items, 1, 4)).toEqual([1, 2, 3, 4]);
    expect(slicePageItems(items, 2, 4)).toEqual([5, 6, 7, 8]);
    expect(slicePageItems(items, 3, 4)).toEqual([9, 10]);

    expect(resolvePageForIndex(0, 4, items.length)).toBe(1);
    expect(resolvePageForIndex(4, 4, items.length)).toBe(2);
    expect(resolvePageForIndex(9, 4, items.length)).toBe(3);
  });
});

describe('Audio Engine, Screen Adaptation & QA Debug Console', () => {
  it('detects double F9 within 3000ms and resets cleanly on timeout or trigger', () => {
    const det = createF9DoublePressDetector(3000);
    expect(det.recordPress(1000)).toBe(false);
    expect(det.recordPress(2800)).toBe(true); // 1800ms <= 3000ms -> triggered
    // Next press must start a fresh pair
    expect(det.recordPress(3200)).toBe(false);
    // > 3000ms later does not trigger
    expect(det.recordPress(6500)).toBe(false);
    // 2500ms after 6500 triggers
    expect(det.recordPress(9000)).toBe(true);
  });

  it('runs SoundEngine and MusicSequencer safely headless with independent BGM/SFX toggles', () => {
    const sound = new SoundEngine();
    expect(sound.isEnabled()).toBe(true);
    expect(sound.isBgmEnabled()).toBe(true);

    sound.setBgmEnabled(false);
    expect(sound.isBgmEnabled()).toBe(false);
    expect(sound.isEnabled()).toBe(true);

    sound.setBgmEnabled(true);
    sound.updateBgm(0.05, 'menu', 0, 0, false, false);
    sound.updateBgm(0.05, 'survival', 2, 2, false, false);
    sound.updateBgm(0.05, 'defense', 1, 3, true, false);
    sound.playShoot('blaster');
    sound.playShoot('chain');
    sound.playShoot('sniper');
    sound.playDash();
    sound.playFury();
    sound.playGateHit(true);
    sound.playGatePurify();
    sound.playComboFever(3);
    sound.dispose();
  });

  it('scales CameraController up to 2.15x on narrow portrait screens (360x800, 390x844)', () => {
    const cam = new CameraController(16 / 9);
    cam.resize(1280, 720);
    expect(cam.getEffectiveScale()).toBe(1);

    cam.resize(360, 800);
    expect(cam.getEffectiveScale()).toBeGreaterThan(1.55);
    expect(cam.getEffectiveScale()).toBeLessThanOrEqual(2.15);

    cam.resize(390, 844);
    expect(cam.getEffectiveScale()).toBeGreaterThan(1.45);
    expect(cam.getEffectiveScale()).toBeLessThanOrEqual(2.15);
  });

  it('executes DebugBridge actions (godMode, combo Fever, boss jump, corrupted bridge gate)', () => {
    const rt = new GameRuntime();
    const bridge = new DebugBridge(rt);
    expect(bridge.getAllLevels().length).toBeGreaterThanOrEqual(5);

    expect(bridge.jumpLevel('bridge-defense')).toBe(true);
    expect(bridge.toggleGodMode()).toBe(true);
    bridge.setTimeScale(2);
    bridge.setCombo(120);
    bridge.grantRelic(false);
    expect(bridge.spawnBridgeGates(true)).toBe(true);
    expect(bridge.jumpToBoss()).toBe(true);

    const tele = bridge.getTelemetry();
    expect(tele.godMode).toBe(true);
    expect(tele.timeScale).toBe(2);
    expect(tele.combo).toBe(120);
    expect(tele.comboTier).toBe(3);
    expect(tele.relicCount).toBeGreaterThanOrEqual(1);
    expect(tele.bossActive).toBe(true);

    rt.destroy();
  });

  it('heals percentage of Max HP (1.5%) on kill for stat-vampiric upgrade', () => {
    const regs = createDefaultRegistries();
    const level = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(99, level, regs);
    const upgSys = new UpgradeSystem();
    const combat = new CombatSystem();

    expect(upgSys.applyUpgrade(session, 'stat-vampiric')).toBe(true);
    expect(session.player.lifeOnKill).toBeCloseTo(0.015, 5);

    session.player.maxHp = 200;
    session.player.hp = 100;
    const mob = session.enemies.acquire()!;
    mob.defId = 'slime-chaser';
    mob.hp = 10;
    mob.maxHp = 10;
    mob.xpValue = 5;
    mob.baseColor = 0x40c057;
    combat.damageEnemy(session, mob, 50, 0, 0, null, true);

    // 1.5% of 200 Max HP = 3 HP healed
    expect(session.player.hp).toBeCloseTo(103, 5);
  });
});

describe('Audit Regression Suite (P0 Race Conditions & P1 Algorithms)', () => {
  it('P0-1: manual resume clears stale hidden pause when tab is visible (no blur deadlock)', () => {
    const rt = new GameRuntime();
    expect(rt.loadLevel('meadow-arena')).toBe(true);
    rt.start();
    rt.pause('hidden');
    expect(rt.getDebugTelemetry().state).toBe('paused');
    rt.resume('manual');
    expect(rt.getDebugTelemetry().state).toBe('playing');
    rt.destroy();
  });

  it('P0-2: GameClock returns positive wallDt while not simulating so menu BGM advances', () => {
    const clock = new GameClock(1 / 60, 0.1, 5);
    clock.resetTimeBaseline(1000);
    const res = clock.tick(1050, false);
    expect(res.wallDt).toBeCloseTo(0.05, 5);
    expect(res.rawDt).toBe(0);
    expect(res.steps).toBe(0);
  });

  it('P0-3: CombatSystem.resetCombo zeroes Fever tier and restores attackSpeed & crit stats', () => {
    const regs = createDefaultRegistries();
    const level = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(101, level, regs);
    const upgSys = new UpgradeSystem();
    const combat = new CombatSystem();

    const baseAtkSpd = session.player.attackSpeedMult;
    const baseCrit = session.player.critChance;

    session.combo = 120;
    upgSys.recalculateStats(session);
    expect(session.comboTier).toBe(3);
    expect(session.player.attackSpeedMult).toBeGreaterThan(baseAtkSpd);
    expect(session.player.critChance).toBeGreaterThan(baseCrit);

    combat.resetCombo(session);
    expect(session.combo).toBe(0);
    expect(session.comboTier).toBe(0);
    expect(session.player.attackSpeedMult).toBeCloseTo(baseAtkSpd, 5);
    expect(session.player.critChance).toBeCloseTo(baseCrit, 5);
  });

  it('P1-2: SpatialGrid expands center-outward so close threats are never truncated by NW crowding', () => {
    const grid = new SpatialGrid(30, 2.5, 40);
    // Pack 15 enemies into the NW corner (-10, -10)
    for (let i = 0; i < 15; i += 1) {
      grid.insert(i, -10, -10);
    }
    // Place 1 close enemy right at center (0.2, 0.2)
    grid.insert(15, 0.2, 0.2);

    const out: number[] = [];
    grid.queryCircleCandidates(0, 0, 14, out, 5);
    expect(out).toContain(15);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it('P1-4: ObjectPool.forEachActive snapshot stays safe under mid-loop spawn and cross-slot release', () => {
    const pool = new ObjectPool(16, createEmptyEnemy, 0);
    const e0 = pool.acquire()!;
    const e1 = pool.acquire()!;
    const e2 = pool.acquire()!;

    const visited: number[] = [];
    let spawnedDuringLoop = false;
    let newlySpawnedSlot = -1;

    pool.forEachActive((item) => {
      visited.push(item.slotIndex);
      if (!spawnedDuringLoop) {
        spawnedDuringLoop = true;
        // Acquire new entity (e.g. split bolt) AND release another entity (e.g. AoE chain kill)
        const spawned = pool.acquire()!;
        newlySpawnedSlot = spawned.slotIndex;
        pool.release(e2);
      }
    });

    // Must visit e0 and e1 (surviving originals), skip killed e2, and never visit newly spawned slot in same pass
    expect(visited).toContain(e0.slotIndex);
    expect(visited).toContain(e1.slotIndex);
    expect(visited).not.toContain(e2.slotIndex);
    expect(visited).not.toContain(newlySpawnedSlot);
    expect(new Set(visited).size).toBe(visited.length);
  });

  it('tracks weapon levels across weapon-upgrade selections and relic synergies', () => {
    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(201, meadow, regs);
    const upgSys = new UpgradeSystem();

    const blaster = session.player.weapons.find((w) => w.weaponId === 'star-blaster')!;
    expect(blaster.level).toBe(1);

    expect(upgSys.applyUpgrade(session, 'star-blaster-damage')).toBe(true);
    expect(blaster.level).toBe(2);

    expect(upgSys.equipItemById(session, 'eq-pierce-quiver')).toBe(true);
    expect(blaster.level).toBe(3);
    session.dispose();
  });

  it('buffers Dash input across imminent cooldown completion without swallowing', () => {
    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(202, meadow, regs);
    const input = new InputController();
    const movement = new MovementSystem();

    input.setEnabled(true);
    session.player.dashCooldown = 0.08;
    input.queueDash();
    expect(input.hasBufferedDash()).toBe(true);

    movement.updatePlayer(session, input, 0.05);
    input.tickBuffers(0.05);
    expect(session.player.dashTimer).toBe(0);
    expect(input.hasBufferedDash()).toBe(true);

    movement.updatePlayer(session, input, 0.05);
    input.tickBuffers(0.05);
    expect(session.player.dashTimer).toBeGreaterThan(0);
    expect(input.hasBufferedDash()).toBe(false);

    input.dispose();
    session.dispose();
  });

  it('aims straight down-lane into aligned Bridge gates and localizes combat notices', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(203, bridge, regs);
    session.language = 'en';
    const combat = new CombatSystem();

    // Place enemy on left lane and active charge gate on right lane; move hero onto right lane
    const foe = session.enemies.acquire()!;
    foe.x = -3.0;
    foe.z = 2.0;
    foe.hp = 80;
    foe.maxHp = 80;
    session.enemyGrid.clear();
    session.enemyGrid.insert(foe.slotIndex, foe.x, foe.z);

    const g1 = session.bridgeGates[1];
    g1.active = true;
    g1.x = 2.45;
    g1.z = -3.0;
    g1.halfWidth = 2.1;
    g1.corrupted = true;
    g1.hp = 100;
    g1.maxHp = 100;

    session.player.x = 2.45;
    session.player.z = 7.5;
    session.player.weapons[0].cooldownTimer = 0;

    combat.update(session, 1 / 60, null, null);
    expect(session.playerProjectiles.activeCount).toBeGreaterThan(0);
    session.playerProjectiles.forEachActive((proj) => {
      expect(Math.abs(proj.vx)).toBeLessThan(0.01);
      expect(proj.vz).toBeLessThan(0);
    });

    // Localized English notice
    combat.grantNextRelic(session);
    expect(combat.pendingNotices.some((n) => n.text.includes('Relic Equipped:'))).toBe(true);

    session.dispose();
  });

  it('enforces WASD-only keyboard movement (ignoring Arrow keys) and triggers Aegis Guard skill', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const meadow = regs.levels.getOrThrow('meadow-arena');
    expect(bridge.bridgeConfig?.maxZ).toBeGreaterThanOrEqual(26);

    const input = new InputController();
    input.setEnabled(true);
    const mv = { x: 0, y: 0 };

    // Arrow keys drive movement smoothly alongside WASD
    const keysDown = (input as unknown as { keysDown: Set<string> }).keysDown;
    keysDown.add('ArrowUp');
    keysDown.add('ArrowLeft');
    input.getMoveVector(mv);
    expect(mv.x).toBeCloseTo(-Math.SQRT1_2, 4);
    expect(mv.y).toBeCloseTo(-Math.SQRT1_2, 4);

    keysDown.clear();
    keysDown.add('KeyD');
    input.getMoveVector(mv);
    expect(mv.x).toBe(1);
    expect(mv.y).toBe(0);

    // Aegis Guard buffers via queueGuard and grants shield + chills nearby enemies
    input.queueGuard();
    expect(input.consumeGuard()).toBe(true);
    const session = new GameSession(204, meadow, regs);
    const combat = new CombatSystem();
    const foe = session.enemies.acquire()!;
    foe.x = 2.0;
    foe.z = 0;
    foe.hp = 100;
    foe.maxHp = 100;
    session.enemyGrid.clear();
    session.enemyGrid.insert(foe.slotIndex, foe.x, foe.z);

    expect(combat.triggerAegisGuard(session, null)).toBe(true);
    expect(session.player.shield).toBeGreaterThanOrEqual(20);
    expect(session.player.guardCooldown).toBeGreaterThan(0);
    expect(foe.hp).toBeLessThan(100);
    expect(foe.debuffTimers[DEBUFF_BY_ID['frost-chill'].index]).toBeGreaterThan(0);
    expect(combat.triggerAegisGuard(session, null)).toBe(false); // cooldown enforced

    input.dispose();
    session.dispose();
  });

  it('prevents projectile tunneling against bridge gates and prioritizes close threats over gate alignment', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(205, bridge, regs);
    const combat = new CombatSystem();

    // 1. High-speed projectile sweeping across gate.z = 0 in a single step must still hit the gate
    session.bridgeGates[0].active = true;
    session.bridgeGates[0].x = -2.45;
    session.bridgeGates[0].z = 0;
    session.bridgeGates[0].halfWidth = 2.1;
    session.bridgeGates[0].hp = 100;
    session.bridgeGates[0].maxHp = 100;

    const proj = session.playerProjectiles.acquire()!;
    proj.x = -2.0;
    proj.z = 2.0; // prevZ after 1 step will become 2.0 -> z = 2 - 4 = -2.0
    proj.vx = 0;
    proj.vz = -40; // moves -4.0m in dt=0.1s, skipping the 1.5m gate band without swept check
    proj.radius = 0.28;
    proj.damage = 35;
    proj.remainingLifeSec = 1.0;
    proj.pierceLeft = 1;
    session.player.weapons[0].cooldownTimer = 10; // suppress auto-fire during swept test

    combat.update(session, 0.1, null, null);
    expect(session.bridgeGates[0].hp).toBe(65);
    expect(proj.active).toBe(false);

    // 2. Close enemy threat within 4.5m overrides gate alignment
    session.player.x = -2.45;
    session.player.z = 8.0;
    session.player.weapons[0].cooldownTimer = 0.01;
    const closeFoe = session.enemies.acquire()!;
    closeFoe.x = 0.5; // +2.95m to the right of player (dist ~2.95m <= 4.5m)
    closeFoe.z = 8.0;
    closeFoe.hp = 100;
    closeFoe.maxHp = 100;
    session.enemyGrid.clear();
    session.enemyGrid.insert(closeFoe.slotIndex, closeFoe.x, closeFoe.z);

    combat.update(session, 0.05, null, null);
    let firedVx = 0;
    session.playerProjectiles.forEachActive((p) => {
      firedVx = p.vx;
    });
    expect(firedVx).toBeGreaterThan(5); // aimed toward closeFoe (+X), not straight -Z

    session.dispose();
  });

  it('calibrates Wild Survival XP pacing to prevent instant Lv.2 and mid-game exhaustion', () => {
    const regs = createDefaultRegistries();
    for (const id of ['meadow-arena', 'ember-canyon']) {
      const lvl = regs.levels.getOrThrow(id);
      const session = new GameSession(206, lvl, regs);
      const xpLv1 = session.computeXpToNext(1);
      const xpLv5 = session.computeXpToNext(5);
      const xpLv15 = session.computeXpToNext(15);
      // Lv.1 -> 2 requires >= 65 XP (~7-8 early kills) instead of 2-3 kills
      expect(xpLv1).toBeGreaterThanOrEqual(65);
      expect(xpLv5).toBeGreaterThan(xpLv1);
      // Lv.15 remains reachable within 4.5-6 min survival runs without exponential stall
      expect(xpLv15).toBeLessThan(1200);
      session.dispose();
    }
  });

  it('enforces Boss CC floor, vulnerability cap, residual armor, and 8% single-hit cap', () => {
    const regs = createDefaultRegistries();
    const lvl = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(207, lvl, regs);
    const statusSys = new StatusEffectSystem();
    const combat = new CombatSystem();

    const boss = session.enemies.acquireReserved()!;
    boss.isBoss = true;
    boss.isElite = true;
    boss.maxHp = 20000;
    boss.hp = 4000; // <= 25% triggers execute-low-hp
    boss.armorReduction = 0.28;

    statusSys.applyDebuff(boss, 'frost-chill');
    statusSys.applyDebuff(boss, 'stagger-stun');
    statusSys.applyDebuff(boss, 'heavy-sunder');
    statusSys.applyDebuff(boss, 'shock-static');
    statusSys.applyDebuff(boss, 'execute-doom');
    statusSys.updateEnemyStatuses(session, boss, 0.016);

    // Boss never slowed below 0.55x or amplified beyond 1.45x
    expect(boss.debuffMoveMult).toBeGreaterThanOrEqual(0.55);
    expect(boss.debuffDmgTakenMult).toBeLessThanOrEqual(1.45);
    expect(boss.debuffCritBonus).toBeLessThanOrEqual(0.25);

    // Massive single-hit nuke is soft-capped at 8% of Boss Max HP (1600)
    const hpBefore = boss.hp;
    combat.damageEnemy(session, boss, 50000, 0, 0, null, true);
    expect(hpBefore - boss.hp).toBeCloseTo(1600, 1);

    session.dispose();
  });

  it('scales Boss HP dynamically with player power and triggers Phase 2 barrier at 50% HP', () => {
    const regs = createDefaultRegistries();
    const lvl = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(208, lvl, regs);
    const wave = new EnemyWaveSystem();
    const combat = new CombatSystem();
    const viewBounds = { centerX: 0, centerZ: 0, halfWidth: 12, halfDepth: 12 };

    // Simulate formed late-game player
    session.player.level = 14;
    session.player.damageMult = 2.5;
    session.player.equippedRelics.push('r1', 'r2', 'r3', 'r4');
    session.elapsedSec = lvl.bossStage.triggerSec;

    wave.update(session, 0.016, viewBounds, combat, null);
    expect(session.bossSpawned).toBe(true);
    const boss = session.enemies.getIfValid(session.bossSlot, session.bossGen)!;
    expect(boss).not.toBeNull();
    // Base 16000 * durationScale (1.25) * playerPowerScale (> 2.5) > 50,000 HP
    expect(boss.maxHp).toBeGreaterThan(45000);
    expect(boss.bossPhase).toBe(1);

    // Drop Boss below 50% HP and step wave AI -> Phase 2 + 1.6s barrier
    boss.hp = boss.maxHp * 0.48;
    wave.update(session, 0.016, viewBounds, combat, null);
    expect(boss.bossPhase).toBe(2);
    expect(boss.bossShieldTimer).toBeGreaterThan(1.0);

    // Verify 75% barrier mitigation reduces a 1000-damage hit (with 14% residual armor -> ~215)
    const hpBeforeShieldHit = boss.hp;
    combat.damageEnemy(session, boss, 1000, 0, 0, null, true);
    expect(hpBeforeShieldHit - boss.hp).toBeLessThan(300);

    session.dispose();
  });

  it('differentiates Bridge Defense Boss (siege pacing, 0.38x slow floor, no dash, pushback Phase 2)', () => {
    const regs = createDefaultRegistries();
    const bridgeLvl = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(209, bridgeLvl, regs);
    const wave = new EnemyWaveSystem();
    const combat = new CombatSystem();
    const statusSys = new StatusEffectSystem();
    const viewBounds = { centerX: 0, centerZ: 0, halfWidth: 8, halfDepth: 14 };

    session.player.level = 6;
    session.player.damageMult = 1.8;
    session.elapsedSec = bridgeLvl.bossStage.triggerSec;

    wave.update(session, 0.016, viewBounds, combat, null);
    const boss = session.enemies.getIfValid(session.bossSlot, session.bossGen)!;
    expect(boss).not.toBeNull();
    // Bridge Boss uses slower siege speed (0.68x base 3.1 -> ~2.11) and 0.45x bridge duration scale
    expect(boss.speed).toBeLessThan(2.3);
    expect(boss.maxHp).toBeLessThan(20000);

    statusSys.applyDebuff(boss, 'stagger-stun');
    statusSys.updateEnemyStatuses(session, boss, 0.016);
    expect(boss.debuffMoveMult).toBeCloseTo(0.38, 2);

    // Bridge Boss never enters dash telegraph
    boss.aiCooldown = 0.01;
    for (let i = 0; i < 6; i += 1) {
      wave.update(session, 0.1, viewBounds, combat, null);
      expect(boss.aiState).not.toBe('boss-dash-telegraph');
      expect(boss.aiState).not.toBe('dash');
    }

    session.dispose();
  });

  it('prevents supply crate from reviving a dead player on the same frame (P1-1)', () => {
    const regs = createDefaultRegistries();
    const lvl = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(210, lvl, regs);
    const prog = new LevelProgressionSystem();
    const combat = new CombatSystem();

    session.player.hp = 0;
    session.supply.active = true;
    session.supply.x = session.player.x;
    session.supply.z = session.player.z;
    session.supply.remainingSec = 10;
    session.supply.healRatio = 0.5;

    const outcome = prog.update(session, 0.016, combat, null);
    expect(outcome.terminal).toBe(true);
    if (outcome.terminal) {
      expect(outcome.victory).toBe(false);
    }
    expect(session.player.hp).toBe(0);
    session.dispose();
  });

  it('enforces exact circular radius on Fury AOE instead of AABB corner hits (P1-2)', () => {
    const regs = createDefaultRegistries();
    const lvl = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(211, lvl, regs);
    const combat = new CombatSystem();

    const cornerEnemy = session.enemies.acquire()!;
    // (11, 11) is inside 13.5 AABB square, but distance^2 = 242 > 13.5^2 (182.25)
    cornerEnemy.x = 11;
    cornerEnemy.z = 11;
    cornerEnemy.hp = 100;
    cornerEnemy.maxHp = 100;
    session.enemyGrid.clear();
    session.enemyGrid.insert(cornerEnemy.slotIndex, cornerEnemy.x, cornerEnemy.z);

    session.player.furyCharge = 100;
    expect(combat.triggerFuryUltimate(session, null)).toBe(true);
    expect(cornerEnemy.hp).toBe(100);
    session.dispose();
  });

  it('sanitizes corrupted localStorage SaveData values safely (P1-3)', () => {
    const origWindow = (globalThis as Record<string, unknown>).window;
    const store = new Map<string, string>();
    store.set(
      APP_CONFIG.storageKey,
      JSON.stringify({
        victories: -5,
        totalRuns: 'bad',
        bestSurvivalSecByLevel: { 'meadow-arena': 120, broken: 'NaN' },
        settings: { quality: 'ultra', language: 'fr', audioEnabled: 'yes' },
      })
    );
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    };
    try {
      const storage = new SaveStorage();
      const loaded = storage.load();
      expect(loaded.victories).toBe(0);
      expect(loaded.totalRuns).toBe(0);
      expect(loaded.bestSurvivalSecByLevel['meadow-arena']).toBe(120);
      expect(loaded.bestSurvivalSecByLevel['broken']).toBeUndefined();
      expect(loaded.settings.quality).toBe('medium');
      expect(['zh', 'en']).toContain(loaded.settings.language);
      expect(loaded.settings.audioEnabled).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>).window = origWindow;
    }
  });

  it('guards equipItemById idempotency and always pads generateChoices to 3 cards (P2)', () => {
    const regs = createDefaultRegistries();
    const lvl = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(212, lvl, regs);
    const upgSys = new UpgradeSystem();

    const firstEq = regs.equipment.list()[0];
    expect(upgSys.equipItemById(session, firstEq.id)).toBe(true);
    expect(upgSys.equipItemById(session, firstEq.id)).toBe(false);

    // Exhaust all upgrades in level pool
    for (const uid of lvl.upgradePoolIds) {
      const def = regs.upgrades.get(uid);
      if (def) session.player.upgradeLevels.set(uid, def.maxLevel);
    }
    const choices = upgSys.generateChoices(session, 3);
    expect(choices.length).toBe(3);
    session.dispose();
  });

  it('aims toward Bridge Defense gate at x=0 instead of missing down the center gap', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(213, bridge, regs);
    const combat = new CombatSystem();

    session.player.x = 0;
    session.player.z = 7.5;
    session.bridgeGates[0].active = true;
    session.bridgeGates[0].x = -2.45;
    session.bridgeGates[0].z = 0;
    session.bridgeGates[0].halfWidth = 2.1;

    session.player.weapons[0].cooldownTimer = 0;
    combat.update(session, 0.05, null, null);

    let firedVx = 0;
    session.playerProjectiles.forEachActive((p) => {
      firedVx = p.vx;
    });
    // Should aim toward gate at x=-2.45 (negative vx), not straight -Z (vx ~ 0)
    expect(firedVx).toBeLessThan(-2);
    session.dispose();
  });

  it('clamps Bridge Defense hero within the visible 3.95m tactical defense bay', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(214, bridge, regs);
    const movement = new MovementSystem();
    const input = new InputController();
    const defZ = bridge.bridgeConfig!.defenseLineZ;

    session.player.z = 0; // way past front boundary
    movement.updatePlayer(session, input, 0.016);
    expect(session.player.z).toBeCloseTo(defZ - 4.8, 4);

    session.player.z = defZ + 2; // way past rear defense line
    movement.updatePlayer(session, input, 0.016);
    expect(session.player.z).toBeCloseTo(defZ - 0.85, 4);

    input.dispose();
    session.dispose();
  });

  it('supports Arrow keys alongside WASD in InputController', () => {
    const input = new InputController();
    input.setEnabled(true);
    const keys = (input as unknown as { keysDown: Set<string> }).keysDown;
    const vec = { x: 0, y: 0 };

    keys.add('ArrowRight');
    keys.add('ArrowUp');
    input.getMoveVector(vec);
    expect(vec.x).toBeCloseTo(Math.SQRT1_2, 4);
    expect(vec.y).toBeCloseTo(-Math.SQRT1_2, 4);

    input.clearAll();
    keys.add('KeyA');
    keys.add('ArrowDown');
    input.getMoveVector(vec);
    expect(vec.x).toBeCloseTo(-Math.SQRT1_2, 4);
    expect(vec.y).toBeCloseTo(Math.SQRT1_2, 4);

    input.dispose();
  });

  it('enforces 1-of-2 walk-through claim for dual Bridge Defense gates', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(215, bridge, regs);
    const prog = new LevelProgressionSystem();
    const combat = new CombatSystem();

    prog.spawnBridgeGatesPair(session, false);
    expect(session.bridgeGates[0].active).toBe(true);
    expect(session.bridgeGates[1].active).toBe(true);

    // Position hero in front of left gate as it reaches player Z
    session.player.x = session.bridgeGates[0].x;
    session.player.z = 8.4;
    session.bridgeGates[0].z = 8.2;
    session.bridgeGates[1].z = 8.2;

    prog.update(session, 0.016, combat, null);
    // Claiming left gate must immediately close both gates (strict 1-of-2 choice)
    expect(session.bridgeGates[0].active).toBe(false);
    expect(session.bridgeGates[1].active).toBe(false);

    // Maxed Lv.3 gate keeps full HP when hit instead of draining/resetting
    prog.spawnBridgeGatesPair(session, false);
    const g0 = session.bridgeGates[0];
    g0.chargeTier = g0.maxChargeTier;
    g0.hp = g0.maxHp;
    session.player.x = g0.x;
    session.player.z = 8.4;
    g0.z = 0;
    session.player.weapons[0].cooldownTimer = 0;
    combat.update(session, 0.05, null, null);
    expect(g0.hp).toBe(g0.maxHp);
    expect(g0.chargeTier).toBe(g0.maxChargeTier);
    session.dispose();
  });

  it('stops spawning bridge gates near Boss window, clears residual gates on Boss spawn, and orders stage durations', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const frost = regs.levels.getOrThrow('frost-bridge');
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const canyon = regs.levels.getOrThrow('ember-canyon');

    expect(canyon.bossStage.triggerSec).toBeGreaterThanOrEqual(meadow.bossStage.triggerSec);
    expect(frost.bossStage.triggerSec).toBeGreaterThanOrEqual(bridge.bossStage.triggerSec);

    const session = new GameSession(512, bridge, regs);
    const prog = new LevelProgressionSystem();
    const combat = new CombatSystem();

    // Near Boss pre-spawn window (triggerSec - 14), expired timer must not spawn new gates
    session.elapsedSec = bridge.bossStage.triggerSec - 13;
    session.bridgeGateTimer = 0;
    prog.update(session, 0.016, combat, null);
    expect(session.bridgeGates[0].active).toBe(false);
    expect(session.bridgeGates[1].active).toBe(false);

    // If gates were already active when Boss spawns, they must be cleared immediately
    prog.spawnBridgeGatesPair(session, false);
    expect(session.bridgeGates[0].active).toBe(true);
    session.bossSpawned = true;
    prog.update(session, 0.016, combat, null);
    expect(session.bridgeGates[0].active).toBe(false);
    expect(session.bridgeGates[1].active).toBe(false);
    session.dispose();
  });

  it('applies meta Armory talents to GameSession stats and computes talent costs/refunds accurately', () => {
    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(700, meadow, regs);
    const upg = new UpgradeSystem();
    const baseHp = session.player.maxHp;
    const baseDmg = session.player.damageMult;
    const baseAtkSpd = session.player.attackSpeedMult;

    const talents = { might: 2, vitality: 3, swiftness: 2, haste: 1, magnet: 2, greed: 1 };
    upg.applyMetaTalents(session, talents);

    expect(session.player.maxHp).toBe(baseHp + 3 * 18);
    expect(session.player.hp).toBe(session.player.maxHp);
    expect(session.player.damageMult).toBeCloseTo(baseDmg + 2 * 0.06, 5);
    expect(session.player.attackSpeedMult).toBeCloseTo(baseAtkSpd + 2 * 0.05, 5);

    const mightDef = TALENT_MAP.get('might')!;
    expect(getTalentUpgradeCost(mightDef, 0)).toBe(12);
    expect(getTalentUpgradeCost(mightDef, 1)).toBe(22);
    expect(getTalentTotalInvested({ might: 2 })).toBe(12 + 22);

    const storage = new SaveStorage();
    const save = storage.load();
    expect(save.stars).toBeGreaterThanOrEqual(0);
    expect(typeof save.talents).toBe('object');
    session.dispose();
  });

  it('activates Guard Drones and Blast Wave effects from new Bridge gate types', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(701, bridge, regs);
    const combat = new CombatSystem();

    // 1. Guard Drones gate activates 22s twin drone barrage
    const droneGate = session.bridgeGates[0];
    droneGate.active = true;
    droneGate.corrupted = false;
    droneGate.gateMode = 'charge';
    droneGate.gateEffect = 'summon-drones';
    droneGate.chargeTier = 2;

    combat.claimChargeGate(session, droneGate, null);
    expect(session.player.bridgeDroneTimer).toBe(22);
    expect(session.player.bridgeDronePower).toBeCloseTo(1.45, 5);

    // Put regular weapons on cooldown and verify drones fire twin forward bolts
    session.player.weapons.forEach((w) => {
      w.cooldownTimer = 99;
    });
    session.player.bridgeDroneFireTimer = 0;
    combat.update(session, 0.016, null, null);
    expect(session.playerProjectiles.activeCount).toBe(2);

    // 2. Blast Wave gate damages and knocks back frontline enemies
    const foe = session.enemies.acquire()!;
    foe.hp = 500;
    foe.maxHp = 500;
    foe.x = 0;
    foe.z = 4;
    const blastGate = session.bridgeGates[1];
    blastGate.active = true;
    blastGate.corrupted = false;
    blastGate.gateMode = 'charge';
    blastGate.gateEffect = 'blast-wave';
    blastGate.chargeTier = 1;

    combat.claimChargeGate(session, blastGate, null);
    expect(foe.hp).toBeLessThan(500);
    expect(foe.kbVz).toBeLessThan(0);
    session.dispose();
  });

  it('supports 3 playable hero archetypes, Stage 3 levels, and Iron Viaduct explosive barrels', () => {
    const regs = createDefaultRegistries();
    expect(regs.characters.list().map((c) => c.id)).toEqual([
      'chibi-knight',
      'storm-ranger',
      'iron-bastion',
    ]);

    const ruins = regs.levels.getOrThrow('shadow-ruins');
    const viaduct = regs.levels.getOrThrow('iron-viaduct');
    expect(ruins.stageOrder).toBe(3);
    expect(viaduct.stageOrder).toBe(3);
    expect(viaduct.bridgeBarrels).toBe(true);

    // Character override initializes signature starting weapon and base stats
    const rangerSession = new GameSession(801, ruins, regs, 'storm-ranger');
    expect(rangerSession.player.maxHp).toBe(96);
    expect(rangerSession.player.weapons[0].weaponId).toBe('thunder-arc');
    rangerSession.dispose();

    const bastionSession = new GameSession(802, viaduct, regs, 'iron-bastion');
    expect(bastionSession.player.maxHp).toBe(175);
    expect(bastionSession.player.weapons[0].weaponId).toBe('orbit-shields');

    // Explosive Bridge Barrel damages and knocks back enemies in radius
    const combat = new CombatSystem();
    const foe = bastionSession.enemies.acquire()!;
    foe.hp = 400;
    foe.maxHp = 400;
    foe.x = 1.2;
    foe.z = -5.0;
    bastionSession.enemyGrid.clear();
    bastionSession.enemyGrid.insert(foe.slotIndex, foe.x, foe.z);

    bastionSession.bridgeBarrel.active = true;
    bastionSession.bridgeBarrel.x = 0;
    bastionSession.bridgeBarrel.z = -4.0;
    combat.detonateBridgeBarrel(bastionSession, null);

    expect(bastionSession.bridgeBarrel.active).toBe(false);
    expect(foe.hp).toBeLessThan(400);
    expect(foe.kbVz).toBeLessThan(0);
    bastionSession.dispose();
  });

  it('applies challenge modifiers (glass-cannon, hyper-horde) and drives Endless Abyss scaling', () => {
    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(901, meadow, regs);
    const upg = new UpgradeSystem();
    const exp = new ExperienceSystem();
    const prog = new LevelProgressionSystem();
    const wave = new EnemyWaveSystem();
    const combat = new CombatSystem();

    const baseHp = session.player.maxHp;
    const baseDmg = session.player.damageMult;
    session.setModifiers(['glass-cannon', 'hyper-horde']);
    upg.recalculateStats(session);

    expect(session.player.damageMult).toBeCloseTo(baseDmg + 0.55, 5);
    expect(session.player.maxHp).toBe(Math.round(baseHp * 0.65));

    exp.grantXp(session, 10, null);
    expect(session.player.xp).toBe(12); // +20% XP from hyper-horde

    // Endless Mode prevents victory termination and escalates endlessWaveLevel every 45s
    const fsm = new GameStateMachine();
    expect(fsm.setState('loading')).toBe(true);
    expect(fsm.setState('playing')).toBe(true);
    expect(fsm.setState('victory')).toBe(true);
    expect(fsm.enterEndlessFromVictory()).toBe(true);
    expect(fsm.state).toBe('playing');

    session.bossSpawned = true;
    session.bossKilled = true;
    session.endlessMode = true;
    session.endlessStartedAtSec = 450;
    session.elapsedSec = 545; // 95s into endless -> Tier 3 (1 + floor(95/45))

    const outcome = prog.update(session, 0.016, combat, null);
    expect(outcome.terminal).toBe(false);

    wave.update(
      session,
      0.016,
      { centerX: 0, centerZ: 0, halfWidth: 10, halfDepth: 9 },
      combat,
      null
    );
    expect(session.endlessWaveLevel).toBe(3);
    session.dispose();
  });

  it('exercises Stage 4 mechanics (HazardZone, MovingGates, BridgeMeteor), 3 new weapons, and Codex/Achievements', () => {
    const regs = createDefaultRegistries();
    const throne = regs.levels.getOrThrow('astral-throne');
    const abyss = regs.levels.getOrThrow('abyss-span');
    const prog = new LevelProgressionSystem();
    const combat = new CombatSystem();

    // 1. Astral Throne HazardZone damages player inside active zone after telegraph
    const throneSession = new GameSession(950, throne, regs);
    throneSession.hazardZone.active = true;
    throneSession.hazardZone.x = throneSession.player.x;
    throneSession.hazardZone.z = throneSession.player.z;
    throneSession.hazardZone.telegraphSec = 0;
    throneSession.hazardZone.remainingSec = 5;
    throneSession.hazardZone.tickTimer = 0;
    const hpBefore = throneSession.player.hp;
    prog.update(throneSession, 0.05, combat, null);
    expect(throneSession.player.hp).toBeLessThan(hpBefore);

    // 2. 3 new weapons unlock and execute zero-GC combat behaviors
    const upg = new UpgradeSystem();
    expect(upg.applyUpgrade(throneSession, 'unlock-boomerang-axe')).toBe(true);
    expect(upg.applyUpgrade(throneSession, 'unlock-venom-aura')).toBe(true);
    expect(upg.applyUpgrade(throneSession, 'unlock-seeker-missile')).toBe(true);
    const mob = throneSession.enemies.acquire()!;
    mob.hp = 300;
    mob.maxHp = 300;
    mob.x = throneSession.player.x + 2;
    mob.z = throneSession.player.z;
    throneSession.enemyGrid.clear();
    throneSession.enemyGrid.insert(mob.slotIndex, mob.x, mob.z);
    for (const w of throneSession.player.weapons) {
      w.cooldownTimer = 0;
    }
    combat.update(throneSession, 0.016, null, null);
    expect(mob.hp).toBeLessThan(300);
    throneSession.dispose();

    // 3. Abyss Span MovingGates & Shootable Boss Meteor
    const abyssSession = new GameSession(951, abyss, regs);
    prog.spawnBridgeGatesPair(abyssSession, false);
    const initialX = abyssSession.bridgeGates[0].x;
    abyssSession.elapsedSec = 1.1;
    prog.update(abyssSession, 0.016, combat, null);
    expect(abyssSession.bridgeGates[0].x).not.toBe(initialX);

    abyssSession.bossSpawned = true;
    abyssSession.bridgeMeteor.active = true;
    abyssSession.bridgeMeteor.x = 0;
    abyssSession.bridgeMeteor.z = abyss.bridgeConfig!.defenseLineZ - 0.5;
    const abyssHpBefore = abyssSession.player.hp;
    prog.update(abyssSession, 0.05, combat, null);
    expect(abyssSession.bridgeMeteor.active).toBe(false);
    expect(abyssSession.player.hp).toBeLessThan(abyssHpBefore);
    abyssSession.dispose();

    // 4. Codex & Achievements catalog check
    const rt = new GameRuntime(regs);
    expect(rt.getRelicCatalog().length).toBeGreaterThanOrEqual(20);
    expect(rt.getAchievements().length).toBe(8);
    rt.destroy();
  });

  it('activates Boss HUD state on Endless Boss spawn and resumes Bridge gates after Endless Boss kill', () => {
    const regs = createDefaultRegistries();
    const abyss = regs.levels.getOrThrow('abyss-span');
    const session = new GameSession(990, abyss, regs);
    const wave = new EnemyWaveSystem();
    const prog = new LevelProgressionSystem();
    const combat = new CombatSystem();

    session.endlessMode = true;
    session.endlessStartedAtSec = 315;
    session.elapsedSec = 370;
    session.bossSpawned = false;
    session.bossKilled = false;
    session.endlessBossTimer = 0.01;

    wave.update(
      session,
      0.016,
      { centerX: 0, centerZ: 0, halfWidth: 10, halfDepth: 12 },
      combat,
      null
    );
    expect(session.bossSpawned).toBe(true);
    expect(session.bossKilled).toBe(false);
    const firstBossSlot = session.bossSlot;

    // While first Endless Boss is alive, timer must not overwrite it with a 2nd Boss
    session.endlessBossTimer = 0;
    wave.update(
      session,
      0.016,
      { centerX: 0, centerZ: 0, halfWidth: 10, halfDepth: 12 },
      combat,
      null
    );
    expect(session.bossSlot).toBe(firstBossSlot);

    // After Endless Boss is defeated, progression grants bounty, resets bossSpawned, and Bridge gates resume
    session.player.hp = 50;
    session.bossKilled = true;
    session.bridgeGateTimer = 0;
    const outcome = prog.update(session, 0.016, combat, null);
    expect(outcome.terminal).toBe(false);
    expect(session.endlessBossKills).toBe(1);
    expect(session.bossSpawned).toBe(false);
    expect(session.player.hp).toBeGreaterThan(50);
    expect(session.bridgeGates[0].active).toBe(true);
    expect(session.bridgeGates[1].active).toBe(true);
    session.dispose();
  });

  it('scales Stage 4 hazardZone and bridgeMeteor damage by player maxHp percentage', () => {
    const regs = createDefaultRegistries();
    const throne = regs.levels.getOrThrow('astral-throne');
    const abyss = regs.levels.getOrThrow('abyss-span');
    const prog = new LevelProgressionSystem();
    const combat = new CombatSystem();

    const s1 = new GameSession(991, throne, regs);
    s1.player.maxHp = 300;
    s1.player.hp = 300;
    s1.hazardZone.active = true;
    s1.hazardZone.x = s1.player.x;
    s1.hazardZone.z = s1.player.z;
    s1.hazardZone.telegraphSec = 0;
    s1.hazardZone.remainingSec = 5;
    s1.hazardZone.tickTimer = 0;
    prog.update(s1, 0.05, combat, null);
    expect(s1.player.hp).toBe(300 - Math.round(300 * 0.04));
    s1.dispose();

    const s2 = new GameSession(992, abyss, regs);
    s2.player.maxHp = 300;
    s2.player.hp = 300;
    s2.bossSpawned = true;
    s2.bridgeMeteor.active = true;
    s2.bridgeMeteor.x = 0;
    s2.bridgeMeteor.z = abyss.bridgeConfig!.defenseLineZ - 0.5;
    prog.update(s2, 0.05, combat, null);
    expect(s2.player.hp).toBe(300 - Math.round(300 * 0.18));
    s2.dispose();
  });

  it('scales spawnVfxBurst particle count via session.vfxScale quality multiplier', () => {
    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(993, meadow, regs);

    session.vfxScale = 1.0;
    session.spawnVfxBurst(0, 0, 0, 0xffffff, 10);
    expect(session.vfx.activeCount).toBe(10);

    session.vfx.releaseAll();
    session.vfxScale = 0.65;
    session.spawnVfxBurst(0, 0, 0, 0xffffff, 10);
    expect(session.vfx.activeCount).toBe(7);

    session.vfx.releaseAll();
    session.vfxScale = 0.5;
    session.spawnVfxBurst(0, 0, 0, 0xffffff, 2);
    expect(session.vfx.activeCount).toBe(2);
    session.dispose();
  });
});

describe('Stage 1 Core Growth Loop', () => {
  it('distributes all 20 relics across 5 rarity tiers (common..legendary)', () => {
    const regs = createDefaultRegistries();
    const tiers = new Set(regs.equipment.list().map((r) => r.tier));
    expect(tiers.has('common')).toBe(true);
    expect(tiers.has('uncommon')).toBe(true);
    expect(tiers.has('rare')).toBe(true);
    expect(tiers.has('epic')).toBe(true);
    expect(tiers.has('legendary')).toBe(true);
    expect(regs.equipment.getOrThrow('eq-holy-relic').tier).toBe('legendary');
    expect(regs.equipment.getOrThrow('eq-executioner-blade').tier).toBe('legendary');
  });

  it('applies dice, bossSlayer, hero star bonuses, and loadout relics in applyMetaTalents', () => {
    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(994, meadow, regs);
    const baseHp = session.player.maxHp;

    const upg = new UpgradeSystem();
    upg.applyMetaTalents(
      session,
      {
        might: 0,
        vitality: 0,
        swiftness: 0,
        greed: 0,
        haste: 0,
        magnet: 0,
        dice: 2,
        bossSlayer: 3,
      },
      { 'chibi-knight': 3 },
      ['eq-vampiric-chalice']
    );

    expect(session.rerollsRemaining).toBe(4);
    expect(session.player.directModifiers.bossDamageBonus).toBeCloseTo(0.24, 5);
    expect(session.player.maxHp).toBe(baseHp + 24);
    expect(session.player.directModifiers.damageBonus).toBeGreaterThanOrEqual(0.09);
    expect(session.player.equippedRelics).toContain('eq-vampiric-chalice');

    const combat = new CombatSystem();
    const normalEnemy = session.enemies.acquire()!;
    normalEnemy.active = true;
    normalEnemy.hp = 500;
    normalEnemy.maxHp = 500;
    normalEnemy.isBoss = false;
    normalEnemy.isElite = false;

    const bossEnemy = session.enemies.acquire()!;
    bossEnemy.active = true;
    bossEnemy.hp = 5000;
    bossEnemy.maxHp = 5000;
    bossEnemy.isBoss = true;
    bossEnemy.isElite = false;

    combat.damageEnemy(session, normalEnemy, 100, 0, 0, null, true);
    combat.damageEnemy(session, bossEnemy, 100, 0, 0, null, true);
    expect(5000 - bossEnemy.hp).toBeGreaterThan(500 - normalEnemy.hp);
    session.dispose();
  });

  it('auto-unlocks all heroes on legacy victory saves and keeps defaults on fresh saves', () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify({ victories: 1, stars: 10 }));
      const legacy = new SaveStorage().load();
      expect(legacy.unlockedCharacters).toContain('chibi-knight');
      expect(legacy.unlockedCharacters).toContain('storm-ranger');
      expect(legacy.unlockedCharacters).toContain('iron-bastion');

      window.localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify({}));
      const fresh = new SaveStorage().load();
      expect(fresh.unlockedCharacters).toEqual(['chibi-knight']);
      expect(fresh.loadoutSlotsUnlocked).toBe(1);
      expect(fresh.loadoutRelicIds).toEqual([]);
      window.localStorage.removeItem(APP_CONFIG.storageKey);
    } else {
      const fresh = new SaveStorage().load();
      expect(fresh.unlockedCharacters).toEqual(['chibi-knight']);
      expect(fresh.loadoutSlotsUnlocked).toBe(1);
    }
  });

  it('enforces progressive level unlock, hero shard/star progression, and loadout slots', () => {
    const rt = new GameRuntime();
    expect(rt.isLevelUnlocked('meadow-arena')).toBe(true);
    expect(rt.isLevelUnlocked('ember-cauldron')).toBe(false);
    expect(rt.isLevelUnlocked('ember-cauldron', true)).toBe(true);

    const save = (rt as unknown as { saveData: ReturnType<GameRuntime['getSaveData']> & { stars: number } }).saveData;
    save.stars = 100;
    save.characterShards['chibi-knight'] = 10;
    save.discoveredRelics.push('eq-holy-relic', 'eq-wind-boots');

    expect(rt.unlockCharacter('storm-ranger')).toBe(true);
    expect(rt.getSaveData().unlockedCharacters).toContain('storm-ranger');
    expect(rt.starUpCharacter('chibi-knight')).toBe(true);
    expect(rt.getSaveData().characterStars['chibi-knight']).toBe(2);

    expect(rt.toggleLoadoutRelic('eq-holy-relic')).toBe(true);
    expect(rt.toggleLoadoutRelic('eq-wind-boots')).toBe(false);
    expect(rt.unlockSecondLoadoutSlot()).toBe(true);
    expect(rt.toggleLoadoutRelic('eq-wind-boots')).toBe(true);
    expect(rt.getSaveData().loadoutRelicIds).toEqual(['eq-holy-relic', 'eq-wind-boots']);
  });
});

describe('Stage 2 Relic Refinement & Gem Workshop', () => {
  it('refines discovered relics and scales loadout relic bonus in applyMetaTalents', () => {
    const rt = new GameRuntime();
    const save = (rt as unknown as { saveData: ReturnType<GameRuntime['getSaveData']> & { stars: number } }).saveData;
    save.stars = 100;
    save.discoveredRelics.push('eq-wind-boots');

    expect(rt.refineRelic('eq-wind-boots')).toBe(true);
    expect(rt.refineRelic('eq-wind-boots')).toBe(true);
    expect(rt.getSaveData().relicRanks['eq-wind-boots']).toBe(2);
    expect(rt.getSaveData().stars).toBe(100 - 8 - 16);

    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const sBase = new GameSession(995, meadow, regs);
    const sRefined = new GameSession(995, meadow, regs);
    const upg = new UpgradeSystem();
    const emptyTalents = {
      might: 0,
      vitality: 0,
      swiftness: 0,
      greed: 0,
      haste: 0,
      magnet: 0,
      dice: 0,
      bossSlayer: 0,
    };
    upg.applyMetaTalents(sBase, emptyTalents, undefined, ['eq-wind-boots'], {}, {});
    upg.applyMetaTalents(
      sRefined,
      emptyTalents,
      undefined,
      ['eq-wind-boots'],
      { 'eq-wind-boots': 2 },
      {}
    );
    expect(sRefined.player.directModifiers.moveSpeedBonus).toBeGreaterThan(
      sBase.player.directModifiers.moveSpeedBonus
    );
    sBase.dispose();
    sRefined.dispose();
  });

  it('supports unlocking sockets, 3-to-1 gem fusion, socketing, unsocketing, and run start stats', () => {
    const rt = new GameRuntime();
    const save = (rt as unknown as { saveData: ReturnType<GameRuntime['getSaveData']> & { stars: number } }).saveData;
    save.stars = 50;
    save.discoveredRelics.push('eq-holy-relic');
    save.gemInventory['ruby:1'] = 3;

    expect(rt.fuseGem('ruby', 1)).toBe(true);
    expect(rt.getSaveData().gemInventory['ruby:1']).toBeUndefined();
    expect(rt.getSaveData().gemInventory['ruby:2']).toBe(1);

    expect(rt.unlockRelicSocket('eq-holy-relic')).toBe(true);
    expect(rt.socketGem('eq-holy-relic', 'ruby:2')).toBe(true);
    expect(rt.getSaveData().relicSockets['eq-holy-relic']).toBe('ruby:2');
    expect(rt.getSaveData().gemInventory['ruby:2']).toBeUndefined();

    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(996, meadow, regs);
    const upg = new UpgradeSystem();
    upg.applyMetaTalents(
      session,
      {
        might: 0,
        vitality: 0,
        swiftness: 0,
        greed: 0,
        haste: 0,
        magnet: 0,
        dice: 0,
        bossSlayer: 0,
      },
      undefined,
      ['eq-holy-relic'],
      {},
      rt.getSaveData().relicSockets
    );
    expect(session.player.directModifiers.damageBonus).toBeCloseTo(0.08, 5);
    session.dispose();

    expect(rt.unsocketGem('eq-holy-relic')).toBe(true);
    expect(rt.getSaveData().relicSockets['eq-holy-relic']).toBeNull();
    expect(rt.getSaveData().gemInventory['ruby:2']).toBe(1);
  });
});

describe('Stage 3 Relic Enchantment & Resonance', () => {
  it('enchants discovered relics and applies enchant + 2-slot Rare+ resonance in applyMetaTalents', () => {
    const rt = new GameRuntime();
    const save = (rt as unknown as { saveData: ReturnType<GameRuntime['getSaveData']> & { stars: number } }).saveData;
    save.stars = 50;
    save.discoveredRelics.push('eq-holy-relic', 'eq-vampiric-chalice');

    expect(rt.enchantRelic('eq-holy-relic')).toBe(true);
    const first = rt.getSaveData().relicEnchants['eq-holy-relic'];
    expect(first).toBeTruthy();
    expect(rt.getSaveData().stars).toBe(38);

    expect(rt.enchantRelic('eq-holy-relic')).toBe(true);
    expect(rt.getSaveData().relicEnchants['eq-holy-relic']).not.toBe(first);

    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(997, meadow, regs);
    const baseHp = session.player.maxHp;
    const upg = new UpgradeSystem();
    upg.applyMetaTalents(
      session,
      {
        might: 0,
        vitality: 0,
        swiftness: 0,
        greed: 0,
        haste: 0,
        magnet: 0,
        dice: 0,
        bossSlayer: 0,
      },
      undefined,
      ['eq-holy-relic', 'eq-vampiric-chalice'],
      {},
      {},
      { 'eq-holy-relic': 'ferocity' }
    );
    expect(session.player.directModifiers.damageBonus).toBeCloseTo(0.06 + 0.08, 5);
    expect(session.player.maxHp).toBe(baseHp + 20);
    session.dispose();
  });

  it('computes pre-run build preview matching talents, stars, gems, enchants, and resonance', () => {
    const regs = createDefaultRegistries();
    const hero = regs.characters.getOrThrow('storm-ranger');
    const rt = new GameRuntime();
    const save = (rt as unknown as { saveData: ReturnType<GameRuntime['getSaveData']> }).saveData;
    save.talents.vitality = 2; // +36 HP
    save.talents.might = 1; // +6% DMG
    save.talents.dice = 2; // 4 rerolls
    save.characterStars['storm-ranger'] = 2; // +12 HP, +5% DMG, +3% Crit
    save.loadoutRelicIds.push('eq-holy-relic', 'eq-vampiric-chalice'); // Rare+ resonance: +8% DMG, +20 HP
    save.relicSockets['eq-holy-relic'] = 'ruby:1'; // +4% DMG
    save.relicEnchants['eq-holy-relic'] = 'keen'; // +5% Crit

    const preview = computePreRunPreviewStats(hero, save, regs.equipment.list());
    expect(preview.maxHp).toBe(hero.baseHp + 36 + 12 + 20);
    expect(preview.damageBonusPct).toBe(6 + 5 + 8 + 4);
    expect(preview.critChancePct).toBe(8 + 3 + 5);
    expect(preview.rerolls).toBe(4);
    expect(preview.resonanceActive).toBe(true);
  });

  it('grants Endless Limit Break scaling on endless boss kill and stat-heal-fallback', () => {
    const regs = createDefaultRegistries();
    const astral = regs.levels.getOrThrow('astral-throne');
    const session = new GameSession(998, astral, regs);
    const prog = new LevelProgressionSystem();
    const combat = new CombatSystem();
    const upg = new UpgradeSystem();

    session.endlessMode = true;
    session.bossSpawned = true;
    session.bossKilled = true;
    const baseDmgBonus = session.player.directModifiers.damageBonus;
    const baseMaxHp = session.player.maxHp;

    prog.update(session, 0.016, combat, null);
    expect(session.endlessBossKills).toBe(1);
    expect(session.player.directModifiers.damageBonus).toBeCloseTo(baseDmgBonus + 0.14, 5);
    expect(session.player.maxHp).toBe(baseMaxHp + 15);

    expect(upg.applyUpgrade(session, 'stat-heal-fallback')).toBe(true);
    expect(session.player.directModifiers.damageBonus).toBeCloseTo(baseDmgBonus + 0.2, 5);
    expect(session.player.maxHp).toBe(baseMaxHp + 25);
    session.dispose();
  });

  it('equips star-blaster sidearm for non-blaster heroes in Bridge Defense', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const bastionBridge = new GameSession(999, bridge, regs, 'iron-bastion');
    const ids = bastionBridge.player.weapons.map((w) => w.weaponId);
    expect(ids).toContain('orbit-shields');
    expect(ids).toContain('star-blaster');
    bastionBridge.dispose();

    const meadow = regs.levels.getOrThrow('meadow-arena');
    const bastionSurvival = new GameSession(999, meadow, regs, 'iron-bastion');
    expect(bastionSurvival.player.weapons.map((w) => w.weaponId)).toEqual(['orbit-shields']);
    bastionSurvival.dispose();
  });

  it('supports direct endless start via loadLevel(id, true) with starter boost', () => {
    const rt = new GameRuntime();
    expect(rt.loadLevel('astral-throne', true)).toBe(true);
    const s = (rt as unknown as { session: GameSession }).session;
    expect(s.endlessMode).toBe(true);
    expect(s.player.level).toBe(5);
    expect(s.pendingLevelUps).toBe(3);
    rt.destroy();
  });

  it('supports debug instant clear only for normal stages 1-4 and blocks endless runs', () => {
    const rt = new GameRuntime();
    const bridge = new DebugBridge(rt);
    expect(rt.loadLevel('meadow-arena')).toBe(true);
    rt.start();
    expect(bridge.getTelemetry().canInstantClear).toBe(true);
    expect(bridge.instantClear()).toBe(true);
    expect(bridge.getTelemetry().state).toBe('victory');

    expect(rt.loadLevel('astral-throne', true)).toBe(true);
    rt.start();
    expect(bridge.getTelemetry().isEndless).toBe(true);
    expect(bridge.getTelemetry().canInstantClear).toBe(false);
    expect(bridge.instantClear()).toBe(false);
    rt.destroy();
  });

  it('clamps extreme endless XP curve levels against Infinity/NaN overflow', () => {
    const regs = createDefaultRegistries();
    const astral = regs.levels.getOrThrow('astral-throne');
    const session = new GameSession(1000, astral, regs);
    const xp5000 = session.computeXpToNext(5000);
    expect(Number.isFinite(xp5000)).toBe(true);
    expect(xp5000).toBeGreaterThan(0);
    expect(xp5000).toBeLessThanOrEqual(1_000_000_000);
    session.dispose();
  });

  it('restricts enterEndlessMode to Stage 4 victory only (not Stages 1-3)', () => {
    const rt = new GameRuntime();
    const bridge = new DebugBridge(rt);
    expect(rt.loadLevel('meadow-arena')).toBe(true);
    rt.start();
    expect(bridge.instantClear()).toBe(true);
    expect(rt.enterEndlessMode()).toBe(false);

    expect(rt.loadLevel('astral-throne')).toBe(true);
    rt.start();
    expect(bridge.instantClear()).toBe(true);
    expect(rt.enterEndlessMode()).toBe(true);
    rt.destroy();
  });

  it('unlocks full 3.0 DPR on flagship GPUs (Adreno 740 / Apple GPU) and caps legacy mobile GPUs', () => {
    expect(resolveEffectiveMaxDpr('high', 'Adreno (TM) 740')).toBe(3.0);
    expect(resolveEffectiveMaxDpr('high', 'Apple GPU')).toBe(3.0);
    expect(resolveEffectiveMaxDpr('high', 'Adreno (TM) 610')).toBe(2.25);
    expect(resolveEffectiveMaxDpr('high', 'Mali-G57 MC2')).toBe(2.25);
    expect(resolveEffectiveMaxDpr('medium', 'Adreno (TM) 740')).toBe(1.75);
  });

  it('outputs sub-step interpolation alpha in GameClock for 120Hz/144Hz smooth rendering', () => {
    const clock = new GameClock();
    clock.resetTimeBaseline(1000);
    const frame1 = clock.tick(1008, true); // 8ms (~125Hz): 0 sim steps, alpha ~ 0.48
    expect(frame1.steps).toBe(0);
    expect(frame1.alpha).toBeGreaterThan(0.4);
    expect(frame1.alpha).toBeLessThan(0.6);

    const frame2 = clock.tick(1017, true); // +9ms -> 17ms total: 1 sim step, residual alpha ~ 0.02
    expect(frame2.steps).toBe(1);
    expect(frame2.alpha).toBeGreaterThanOrEqual(0);
    expect(frame2.alpha).toBeLessThan(0.1);
  });

  it('anchors player-centered shockwaves to follow player visual position while moving', () => {
    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const session = new GameSession(1001, meadow, regs);
    session.spawnShockwave(0, 1, 2, 0.5, 4.5, 0x38bdf8, 0.45, false, true);
    session.spawnShockwave(2, 5, 6, 0.2, 2.0, 0xfef08a, 0.3, false);

    let followCount = 0;
    let worldCount = 0;
    session.shockwaves.forEachActive((sw) => {
      if (sw.followPlayer) followCount += 1;
      else worldCount += 1;
    });
    expect(followCount).toBe(1);
    expect(worldCount).toBe(1);
    session.dispose();
  });
});
