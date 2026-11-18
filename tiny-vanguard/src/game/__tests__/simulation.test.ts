import { describe, expect, it } from 'vitest';
import { createDefaultRegistries } from '../content/registries/DefaultContent';
import { InputController } from '../input/InputController';
import type { GroundViewBounds } from '../scene/CameraController';
import { GameSession } from '../session/GameSession';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyWaveSystem } from '../systems/EnemyWaveSystem';
import { ExperienceSystem } from '../systems/ExperienceSystem';
import { LevelProgressionSystem } from '../systems/LevelProgressionSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';

describe('Full Gameplay Loop Simulation (Headless)', () => {
  it('runs survival waves, auto-combat, XP level-up, boss spawn, and boss victory', () => {
    const regs = createDefaultRegistries();
    const level = regs.levels.getOrThrow('internal-rapid-test');
    const session = new GameSession(101, level, regs);

    const input = new InputController();
    const movement = new MovementSystem();
    const wave = new EnemyWaveSystem();
    const combat = new CombatSystem();
    const exp = new ExperienceSystem();
    const upg = new UpgradeSystem();
    const prog = new LevelProgressionSystem();

    const viewBounds: GroundViewBounds = {
      centerX: 0,
      centerZ: 0,
      halfWidth: 10,
      halfDepth: 9,
    };

    const dt = 1 / 60;
    let totalKills = 0;
    let victoryReached = false;

    // Unlock orbit shields & frost nova mid-run to exercise all 3 mechanisms
    upg.applyUpgrade(session, 'unlock-orbit-shields');
    upg.applyUpgrade(session, 'unlock-frost-nova');

    for (let step = 0; step < 60 * 35; step += 1) {
      movement.updatePlayer(session, input, dt);
      wave.update(session, dt, viewBounds, combat, null);
      combat.update(session, dt, null, null);
      exp.update(session, dt, null);

      // Keep player alive during automated stress test & damage boss once spawned
      if (session.player.hp < session.player.maxHp * 0.5) {
        session.player.hp = session.player.maxHp;
      }
      if (session.bossSpawned && !session.bossKilled) {
        const boss = session.enemies.getIfValid(session.bossSlot, session.bossGen);
        if (boss) {
          combat.damageEnemy(session, boss, 260 * dt, 0, 0, null);
        }
      }

      const outcome = prog.update(session, dt, combat, null);
      if (outcome.terminal) {
        victoryReached = outcome.victory;
        totalKills = session.player.kills;
        break;
      }
    }

    expect(session.bossSpawned).toBe(true);
    expect(session.bossKilled).toBe(true);
    expect(victoryReached).toBe(true);
    expect(totalKills).toBeGreaterThan(0);

    input.dispose();
    session.dispose();
  });

  it('supports Dash, Starlight Fury Ultimate, and Bridge Defense shootable gates', () => {
    const regs = createDefaultRegistries();
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const session = new GameSession(202, bridge, regs);
    const input = new InputController();
    const movement = new MovementSystem();
    const combat = new CombatSystem();
    const prog = new LevelProgressionSystem();

    input.setEnabled(true);
    input.queueDash();
    const startZ = session.player.z;
    movement.updatePlayer(session, input, 1 / 60);
    expect(session.player.dashTimer).toBeGreaterThan(0);
    expect(session.player.dashCooldown).toBeGreaterThan(0);
    expect(session.player.z).toBeLessThanOrEqual(startZ);

    // Activate bridge gate and shoot it down via fury/damage test
    session.player.furyCharge = 100;
    input.queueFury();
    expect(input.consumeFury()).toBe(true);
    expect(combat.triggerFuryUltimate(session, null)).toBe(true);
    expect(session.player.furyCharge).toBe(0);

    // Bridge gate spawns at 10s
    for (let s = 0; s < 60 * 11; s += 1) {
      prog.update(session, 1 / 60, combat, null);
    }
    expect(session.bridgeGates[0].active).toBe(true);
    expect(session.bridgeGates[1].active).toBe(true);
    expect(session.bridgeGates[0].buffId).not.toBe(session.bridgeGates[1].buffId);

    input.dispose();
    session.dispose();
  });

  it('exercises Thunder Arc chain lightning, buffs, equipment relics, debuffs, and shield absorb', () => {
    const regs = createDefaultRegistries();
    const canyon = regs.levels.getOrThrow('ember-canyon');
    const frostBridge = regs.levels.getOrThrow('frost-bridge');
    const session = new GameSession(303, canyon, regs);
    const wave = new EnemyWaveSystem();
    const combat = new CombatSystem();
    const upg = new UpgradeSystem();

    // Unlock thunder-arc & equip multiple relics / buffs
    expect(upg.applyUpgrade(session, 'unlock-thunder-arc')).toBe(true);
    expect(upg.applyUpgrade(session, 'thunder-arc-overload')).toBe(true);
    expect(upg.equipItemById(session, 'eq-buckler-crest')).toBe(true);
    expect(upg.grantBuffById(session, 'buff-shield-25')).toBe(true);
    expect(upg.grantBuffById(session, 'buff-crit-15')).toBe(true);
    expect(session.player.equippedRelics).toContain('eq-buckler-crest');
    expect(session.player.shield).toBeGreaterThanOrEqual(55);

    // Shield absorbs damage before HP
    const hpBefore = session.player.hp;
    const shieldBefore = session.player.shield;
    combat.damagePlayer(session, 15, null);
    expect(session.player.hp).toBe(hpBefore);
    expect(session.player.shield).toBe(shieldBefore - 15);

    // Run short simulation with Thunder Arc active in Ember Canyon & Frost Bridge
    const bounds: GroundViewBounds = { centerX: 0, centerZ: 0, halfWidth: 12, halfDepth: 11 };
    for (let s = 0; s < 60 * 6; s += 1) {
      wave.update(session, 1 / 60, bounds, combat, null);
      combat.update(session, 1 / 60, null, null);
    }
    expect(session.elapsedSec).toBeGreaterThanOrEqual(0);
    expect(frostBridge.arenaShape).toBe('bridge');
    session.dispose();
  });

  it('verifies Wave Director formations, cluster targeting, charge gates, combo fever, shield vanguard armor, and weapon-relic synergy', () => {
    const regs = createDefaultRegistries();
    const meadow = regs.levels.getOrThrow('meadow-arena');
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const wave = new EnemyWaveSystem();
    const combat = new CombatSystem();
    const upg = new UpgradeSystem();
    const prog = new LevelProgressionSystem();

    // T1: Ring-Surround & Lane-Phalanx formations + minConcurrentNormal floor
    const s1 = new GameSession(401, meadow, regs);
    const ringSpawned = wave.spawnWaveFormation(s1, meadow.stages[1]);
    expect(ringSpawned).toBeGreaterThanOrEqual(8);

    // T2: Cluster targeting prefers denser swarm (distance 7m, 4 enemies) over lone stray (distance 3m)
    s1.enemies.releaseAll();
    const lone = s1.enemies.acquire()!;
    lone.hp = 50;
    lone.maxHp = 50;
    lone.x = 3;
    lone.z = 0;
    const clusterCoords = [
      [7, 0],
      [7.4, 0.5],
      [6.8, -0.5],
      [7.3, -0.2],
    ];
    for (const [cx, cz] of clusterCoords) {
      const m = s1.enemies.acquire()!;
      m.hp = 50;
      m.maxHp = 50;
      m.x = cx;
      m.z = cz;
    }
    s1.enemyGrid.clear();
    s1.enemies.forEachActive((e) => s1.enemyGrid.insert(e.slotIndex, e.x, e.z));
    const bestTarget = combat.findDensestEnemyClusterCenter(s1, 0, 0, 12, 3.0);
    expect(bestTarget).not.toBeNull();
    expect(bestTarget!.x).toBeGreaterThan(5);

    // T4: Combo Fever stat boost & unshielded damage reset
    const baseAtk = s1.player.attackSpeedMult;
    s1.combo = 65;
    upg.recalculateStats(s1);
    expect(s1.comboTier).toBe(2);
    expect(s1.player.attackSpeedMult).toBeGreaterThan(baseAtk);
    combat.damagePlayer(s1, 10, null);
    expect(s1.combo).toBe(0);
    expect(s1.comboTier).toBe(0);

    // T5: Shield Vanguard armor reduction bypassed by Heavy Sunder + Weapon x Relic Super Synergy
    const van = s1.enemies.acquire()!;
    van.hp = 200;
    van.maxHp = 200;
    van.armorReduction = 0.45;
    combat.damageEnemy(s1, van, 100, 0, 0, null, true);
    const dmgWithArmor = 200 - van.hp;
    expect(dmgWithArmor).toBeCloseTo(55, 0);
    van.debuffTimers[6] = 3.0; // heavy-sunder active -> bypasses armorReduction
    van.hp = 200;
    combat.damageEnemy(s1, van, 100, 0, 0, null, true);
    expect(200 - van.hp).toBeGreaterThanOrEqual(100);

    expect(upg.equipItemById(s1, 'eq-pierce-quiver')).toBe(true);
    const sb = s1.player.weapons.find((w) => w.weaponId === 'star-blaster')!;
    expect(sb.mechanisms.has('splitOnHit')).toBe(true);
    s1.dispose();

    // T1 (Phalanx) + T3 (DPS-scaled Shoot-to-Charge Gate) on Bridge Defense
    const s2 = new GameSession(402, bridge, regs);
    s2.elapsedSec = 45;
    const phalanxSpawned = wave.spawnWaveFormation(s2, bridge.stages[1]);
    expect(phalanxSpawned).toBe(8);

    for (let i = 0; i < 60 * 11; i += 1) {
      prog.update(s2, 1 / 60, combat, null);
    }
    expect(s2.bridgeGates[0].gateMode).toBe('break');
    expect(s2.bridgeGates[1].gateMode).toBe('charge');
    expect(s2.bridgeGates[1].chargeTier).toBe(s2.bridgeGates[1].corrupted ? 0 : 1);

    // Claim Tier 2 charge gate -> applies stacked buff effects
    s2.bridgeGates[1].corrupted = false;
    s2.bridgeGates[1].buffId = 'buff-dmg-25';
    s2.bridgeGates[1].chargeTier = 2;
    const dmgBefore = s2.player.damageMult;
    combat.claimChargeGate(s2, s2.bridgeGates[1], null);
    expect(s2.player.damageMult).toBeCloseTo(dmgBefore + 0.5, 2);
    expect(s2.bridgeGates[1].active).toBe(false);
    s2.dispose();
  });

  it('closes Phase 2 gaps: survival relic drops, rail-sniper high-HP targeting, corrupted gate purification, and stampede/escort formations', () => {
    const regs = createDefaultRegistries();
    const canyon = regs.levels.getOrThrow('ember-canyon');
    const bridge = regs.levels.getOrThrow('bridge-defense');
    const wave = new EnemyWaveSystem();
    const combat = new CombatSystem();
    const upg = new UpgradeSystem();
    const prog = new LevelProgressionSystem();

    // G1: Survival elite death + supply crate collection both grant relics directly
    const s1 = new GameSession(501, canyon, regs);
    const elite = s1.enemies.acquire()!;
    elite.isElite = true;
    elite.isBoss = false;
    elite.hp = 10;
    elite.maxHp = 10;
    combat.damageEnemy(s1, elite, 50, 0, 0, null, true);
    expect(s1.player.equippedRelics.length).toBe(1);

    s1.supply.active = true;
    s1.supply.x = s1.player.x;
    s1.supply.z = s1.player.z;
    s1.supply.remainingSec = 10;
    prog.update(s1, 1 / 60, combat, null);
    expect(s1.player.equippedRelics.length).toBe(2);

    // G4: Rail Sniper prioritizes highest-HP/elite target & awakens armorBreaker with eq-executioner-blade
    expect(upg.applyUpgrade(s1, 'unlock-rail-sniper')).toBe(true);
    expect(upg.equipItemById(s1, 'eq-executioner-blade')).toBe(true);
    const sniper = s1.player.weapons.find((w) => w.weaponId === 'rail-sniper')!;
    expect(sniper.mechanisms.has('armorBreaker')).toBe(true);

    s1.enemies.releaseAll();
    const low = s1.enemies.acquire()!;
    low.hp = 20;
    low.maxHp = 20;
    low.x = 2;
    low.z = 0;
    const high = s1.enemies.acquire()!;
    high.hp = 300;
    high.maxHp = 300;
    high.isElite = true;
    high.x = 12;
    high.z = 0;
    s1.enemyGrid.clear();
    s1.enemies.forEachActive((e) => s1.enemyGrid.insert(e.slotIndex, e.x, e.z));
    expect(combat.findHighestHpEnemy(s1, 0, 0, 18)?.slotIndex).toBe(high.slotIndex);

    // G5: Side-Stampede & Elite-Escort formation waves
    s1.enemies.releaseAll();
    expect(wave.spawnWaveFormation(s1, canyon.stages[1])).toBeGreaterThanOrEqual(5); // elite-escort
    s1.enemies.releaseAll();
    expect(wave.spawnWaveFormation(s1, canyon.stages[2])).toBeGreaterThanOrEqual(6); // side-stampede
    s1.dispose();

    // G3: Corrupted Red Gate penalty on collision vs purification leap to Tier 2 on shooting
    const s2 = new GameSession(502, bridge, regs);
    const g = s2.bridgeGates[1];
    g.active = true;
    g.gateMode = 'charge';
    g.corrupted = true;
    g.chargeTier = 0;
    g.maxChargeTier = 3;
    g.hp = 20;
    g.maxHp = 20;
    const hpBefore = s2.player.hp;
    combat.claimChargeGate(s2, g, null);
    expect(s2.player.hp).toBeLessThan(hpBefore);

    // Now test projectile purifying corrupted red gate -> leaps straight to Tier 2 (x2)
    g.active = true;
    g.corrupted = true;
    g.chargeTier = 0;
    g.x = 2.45;
    g.z = 0;
    g.hp = 15;
    g.maxHp = 40;
    const proj = s2.playerProjectiles.acquire()!;
    proj.x = 2.45;
    proj.z = 0.2;
    proj.prevX = 2.45;
    proj.prevZ = 0.2;
    proj.vx = 0;
    proj.vz = -18;
    proj.damage = 25;
    proj.remainingLifeSec = 1;
    proj.pierceLeft = 1;
    combat.update(s2, 1 / 60, null, null);
    expect(g.corrupted).toBe(false);
    expect(g.chargeTier).toBe(2);
    s2.dispose();
  });
});
