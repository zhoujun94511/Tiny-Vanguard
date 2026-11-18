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
import { GameClock } from '../core/GameClock';
import { GameRuntime } from '../core/GameRuntime';
import { GameStateMachine } from '../core/GameStateMachine';
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
    expect(rt.getLevelsByMode('survival').map((l) => l.id)).toEqual(['meadow-arena', 'ember-canyon']);
    expect(rt.getLevelsByMode('defense').map((l) => l.id)).toEqual(['bridge-defense', 'frost-bridge']);
    expect(rt.getNextLevelInMode('meadow-arena')?.id).toBe('ember-canyon');
    expect(rt.getNextLevelInMode('ember-canyon')).toBeNull();
    expect(rt.getNextLevelInMode('bridge-defense')?.id).toBe('frost-bridge');
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

    // Arrow keys must NOT drive desktop movement
    const keysDown = (input as unknown as { keysDown: Set<string> }).keysDown;
    keysDown.add('ArrowUp');
    keysDown.add('ArrowLeft');
    input.getMoveVector(mv);
    expect(mv.x).toBe(0);
    expect(mv.y).toBe(0);

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

  it('clamps Bridge Defense hero within the visible 2.45m tactical defense bay', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(214, bridge, regs);
    const movement = new MovementSystem();
    const input = new InputController();
    const defZ = bridge.bridgeConfig!.defenseLineZ;

    session.player.z = 0; // way past front boundary
    movement.updatePlayer(session, input, 0.016);
    expect(session.player.z).toBeCloseTo(defZ - 3.3, 4);

    session.player.z = defZ + 2; // way past rear defense line
    movement.updatePlayer(session, input, 0.016);
    expect(session.player.z).toBeCloseTo(defZ - 0.85, 4);

    input.dispose();
    session.dispose();
  });
});
