import type { SoundEngine } from '../audio/SoundEngine';
import { RUNTIME_CONFIG } from '../config/runtimeConfig';
import type { EnemyDefinition, LevelStageConfig } from '../content/definitions/ContentTypes';
import type { GroundViewBounds } from '../scene/CameraController';
import { translateUi } from '../i18n/i18n';
import type { EnemyEntity } from '../session/SessionEntities';
import type { GameSession } from '../session/GameSession';
import type { CombatSystem } from './CombatSystem';
import { StatusEffectSystem } from './StatusEffectSystem';

export class EnemyWaveSystem {
  private readonly sepScratch: number[] = [];
  private readonly spawnPosScratch = { x: 0, z: 0 };
  private readonly statusSys = new StatusEffectSystem();

  public update(
    session: GameSession,
    dt: number,
    viewBounds: Readonly<GroundViewBounds>,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): void {
    this.updateSpawning(session, dt, viewBounds, sound);
    this.rebuildSpatialGrid(session);
    this.updateEnemiesAI(session, dt, viewBounds, combat, sound);
    // Refresh SpatialGrid post-movement so CombatSystem queries exact current-frame coordinates
    this.rebuildSpatialGrid(session);
  }

  private getActiveStage(session: GameSession): LevelStageConfig | null {
    const t = session.elapsedSec;
    for (let i = 0; i < session.level.stages.length; i += 1) {
      const st = session.level.stages[i];
      if (t >= st.startSec && t < st.endSec) {
        if (session.currentStageIndex !== i) {
          session.currentStageIndex = i;
          session.eliteTimer = st.eliteIntervalSec ?? 45;
          session.formationTimer = st.formationIntervalSec ?? 28;
        }
        return st;
      }
    }
    return null;
  }

  private updateSpawning(
    session: GameSession,
    dt: number,
    viewBounds: Readonly<GroundViewBounds>,
    sound: SoundEngine | null
  ): void {
    const bossCfg = session.level.bossStage;

    // Boss transition (skipped once player enters Endless Mode)
    if (!session.endlessMode && session.elapsedSec >= bossCfg.triggerSec) {
      if (!session.bossSpawned) {
        const spawned = this.spawnBoss(session, viewBounds, sound);
        if (spawned) {
          session.bossSpawned = true;
          session.bossReinforceTimer = 2.0;
        }
      } else if (!session.bossKilled) {
        // Controlled boss reinforcements
        session.bossReinforceTimer -= dt;
        if (session.bossReinforceTimer <= 0) {
          session.bossReinforceTimer = bossCfg.reinforcementIntervalSec;
          if (
            session.enemies.activeCount - 1 < bossCfg.maxReinforcements &&
            bossCfg.reinforcementEnemyIds.length > 0
          ) {
            const rid =
              bossCfg.reinforcementEnemyIds[
                session.rng.int(0, bossCfg.reinforcementEnemyIds.length)
              ];
            this.spawnEnemyOutsideView(session, rid, viewBounds, 1.35, 1.05);
          }
        }
      }
      return;
    }

    let stage = session.endlessMode
      ? session.level.stages[session.level.stages.length - 1] ?? null
      : this.getActiveStage(session);
    if (!stage) return;

    let endlessHpScale = 1;
    let endlessSpdScale = 1;
    let endlessDmgScale = 1;
    if (session.endlessMode) {
      const endlessSec = Math.max(0, session.elapsedSec - session.endlessStartedAtSec);
      session.endlessWaveLevel = 1 + Math.floor(endlessSec / 45);
      endlessHpScale = 1 + (session.endlessWaveLevel - 1) * 0.28;
      endlessSpdScale = 1 + Math.min(0.45, (session.endlessWaveLevel - 1) * 0.05);
      endlessDmgScale = 1 + Math.min(2.0, (session.endlessWaveLevel - 1) * 0.04);

      if (!session.bossSpawned || session.bossKilled) {
        session.endlessBossTimer -= dt;
        if (session.endlessBossTimer <= 0) {
          session.endlessBossTimer = 55;
          if (this.spawnBoss(session, viewBounds, sound)) {
            session.bossSpawned = true;
            session.bossKilled = false;
          }
        }
      }
    }

    const modSpdMult = session.hasDoubleElites ? 1.12 : 1;
    const modEliteMult = session.hasDoubleElites ? 0.6 : 1;
    const modSpawnMult = session.hasHyperHorde ? 0.75 : 1;
    const effectiveHpMult = stage.hpMultiplier * endlessHpScale;
    const effectiveSpdMult = stage.speedMultiplier * endlessSpdScale * modSpdMult;

    // Elite timer
    if (stage.eliteIntervalSec && stage.eliteEnemyId) {
      session.eliteTimer -= dt;
      if (session.eliteTimer <= 0) {
        session.eliteTimer = Math.max(8, stage.eliteIntervalSec * modEliteMult);
        this.spawnEnemyOutsideView(
          session,
          stage.eliteEnemyId,
          viewBounds,
          effectiveHpMult,
          effectiveSpdMult,
          endlessDmgScale
        );
      }
    }

    // Formation Event Wave (Ring Surround in Survival / Lane Phalanx in Defense)
    if (stage.formationIntervalSec && stage.formationKind) {
      session.formationTimer -= dt;
      if (session.formationTimer <= 0) {
        session.formationTimer = stage.formationIntervalSec;
        this.spawnWaveFormation(session, stage, endlessHpScale, endlessSpdScale, endlessDmgScale);
      }
    }

    // Dynamic Wave Director density floor: accelerate refill when player clears fast
    const minFloor = stage.minConcurrentNormal ?? 0;
    if (minFloor > 0 && session.enemies.activeCount < minFloor && session.spawnTimer > 0.18) {
      session.spawnTimer = 0.18;
    }

    // Normal wave timer
    session.spawnTimer -= dt;
    if (session.spawnTimer <= 0) {
      const endlessCooldownScale = session.endlessMode
        ? Math.max(0.55, 1 - (session.endlessWaveLevel - 1) * 0.06)
        : 1;
      session.spawnTimer = Math.max(0.22, stage.spawnIntervalSec * modSpawnMult * endlessCooldownScale);
      const cap = Math.min(stage.maxConcurrentNormal, session.level.entityBudgets.maxEnemies);
      if (session.enemies.activeCount >= cap) return;

      const batch = session.rng.int(stage.spawnBatchMin, stage.spawnBatchMax + 1);
      for (let i = 0; i < batch; i += 1) {
        if (session.enemies.activeCount >= cap) break;
        const enemyId = this.pickStageEnemyId(session, stage);
        if (enemyId) {
          this.spawnEnemyOutsideView(
            session,
            enemyId,
            viewBounds,
            effectiveHpMult,
            effectiveSpdMult,
            endlessDmgScale
          );
        }
      }
    }
  }

  private pickStageEnemyId(session: GameSession, stage: LevelStageConfig): string | null {
    let totalWeight = 0;
    for (const e of stage.entries) {
      if (e.minStageSec !== undefined && session.elapsedSec < e.minStageSec) continue;
      totalWeight += e.weight;
    }
    if (totalWeight <= 0) return null;
    let roll = session.rng.next() * totalWeight;
    for (const e of stage.entries) {
      if (e.minStageSec !== undefined && session.elapsedSec < e.minStageSec) continue;
      roll -= e.weight;
      if (roll <= 0) return e.enemyId;
    }
    return stage.entries[0]?.enemyId ?? null;
  }

  public spawnWaveFormation(
    session: GameSession,
    stage: LevelStageConfig,
    hpScale = 1,
    speedScale = 1,
    dmgScale = 1
  ): number {
    const cap = Math.min(stage.maxConcurrentNormal + 10, session.level.entityBudgets.maxEnemies);
    const waveHpMult = stage.hpMultiplier * hpScale;
    const waveSpdMult = stage.speedMultiplier * speedScale;
    let spawned = 0;

    if (stage.formationKind === 'lane-phalanx' && session.level.bridgeConfig) {
      const b = session.level.bridgeConfig;
      const maxX = Math.max(1.2, b.halfWidth - 0.9);
      const frontId =
        session.elapsedSec >= 35 && session.level.allowedEnemyIds.includes('shield-vanguard')
          ? 'shield-vanguard'
          : stage.entries[0]?.enemyId ?? 'slime-chaser';
      const rearId = session.level.allowedEnemyIds.includes('swarm-mite')
        ? 'swarm-mite'
        : stage.entries[0]?.enemyId ?? 'slime-chaser';

      const frontDef = session.registries.enemies.get(frontId);
      const rearDef = session.registries.enemies.get(rearId);

      if (frontDef) {
        for (let i = -1; i <= 1; i += 1) {
          if (session.enemies.activeCount >= cap) break;
          const enemy = session.enemies.acquire();
          if (!enemy) break;
          const fx = Math.max(-maxX, Math.min(maxX, i * 2.6));
          this.initEnemyFromDef(enemy, frontDef, fx, b.minZ + 4.4, waveHpMult, waveSpdMult, dmgScale);
          spawned += 1;
        }
      }
      if (rearDef) {
        for (let i = -2; i <= 2; i += 1) {
          if (session.enemies.activeCount >= cap) break;
          const enemy = session.enemies.acquire();
          if (!enemy) break;
          const rx = Math.max(-maxX, Math.min(maxX, i * 1.75));
          this.initEnemyFromDef(enemy, rearDef, rx, b.minZ + 2.3, waveHpMult, waveSpdMult, dmgScale);
          spawned += 1;
        }
      }
      return spawned;
    }

    const p = session.player;
    const isBlocked = (sx: number, sz: number, radius: number): boolean => {
      for (const obs of session.level.obstacles) {
        const odx = sx - obs.x;
        const odz = sz - obs.z;
        const minD = obs.radius + radius + 0.3;
        if (odx * odx + odz * odz < minD * minD) return true;
      }
      return false;
    };

    if (stage.formationKind === 'side-stampede') {
      // Single-flank high-speed column stampede charging straight across the arena toward player
      const chargerId =
        stage.entries.find((e) => {
          const d = session.registries.enemies.get(e.enemyId);
          return d?.role === 'charger';
        })?.enemyId ??
        stage.entries[0]?.enemyId ??
        'slime-chaser';
      const swarmId = session.level.allowedEnemyIds.includes('swarm-mite')
        ? 'swarm-mite'
        : chargerId;
      const chargerDef = session.registries.enemies.get(chargerId);
      const swarmDef = session.registries.enemies.get(swarmId);
      if (!chargerDef || !swarmDef) return 0;

      const side = session.rng.next() < 0.5 ? -1 : 1;
      const arenaLimit = session.level.arenaRadius - 1.2;
      for (let i = -4; i <= 4; i += 1) {
        if (session.enemies.activeCount >= cap) break;
        const def = i % 3 === 0 ? chargerDef : swarmDef;
        let sx = p.x + side * 14.5;
        let sz = p.z + i * 1.45;
        const rSq = sx * sx + sz * sz;
        if (rSq > arenaLimit * arenaLimit) {
          const r = Math.sqrt(rSq) || 1;
          sx = (sx / r) * arenaLimit;
          sz = (sz / r) * arenaLimit;
        }
        if (isBlocked(sx, sz, def.radius)) continue;
        const enemy = session.enemies.acquire();
        if (!enemy) break;
        this.initEnemyFromDef(enemy, def, sx, sz, waveHpMult, waveSpdMult * 1.12, dmgScale);
        spawned += 1;
      }
      return spawned;
    }

    if (stage.formationKind === 'elite-escort') {
      // Escort squad: 1 stage elite guarded by 6 ring retainers (killing elite grants survival relic!)
      const eliteId = stage.eliteEnemyId ?? stage.entries[0]?.enemyId ?? 'elite-golem';
      const guardId = stage.entries[0]?.enemyId ?? 'slime-chaser';
      const eliteDef = session.registries.enemies.get(eliteId);
      const guardDef = session.registries.enemies.get(guardId);
      if (!eliteDef || !guardDef) return 0;

      const ang = session.rng.range(0, Math.PI * 2);
      const arenaLimit = session.level.arenaRadius - eliteDef.radius - 1.5;
      let cx = p.x + Math.cos(ang) * 14.0;
      let cz = p.z + Math.sin(ang) * 14.0;
      const crSq = cx * cx + cz * cz;
      if (crSq > arenaLimit * arenaLimit) {
        const cr = Math.sqrt(crSq) || 1;
        cx = (cx / cr) * arenaLimit;
        cz = (cz / cr) * arenaLimit;
      }
      if (!isBlocked(cx, cz, eliteDef.radius) && session.enemies.activeCount < cap) {
        const lead = session.enemies.acquire();
        if (lead) {
          this.initEnemyFromDef(lead, eliteDef, cx, cz, waveHpMult, waveSpdMult, dmgScale);
          spawned += 1;
        }
      }
      for (let i = 0; i < 6; i += 1) {
        if (session.enemies.activeCount >= cap) break;
        const ga = (i / 6) * Math.PI * 2;
        const gx = cx + Math.cos(ga) * 2.1;
        const gz = cz + Math.sin(ga) * 2.1;
        if (gx * gx + gz * gz > arenaLimit * arenaLimit || isBlocked(gx, gz, guardDef.radius)) continue;
        const g = session.enemies.acquire();
        if (!g) break;
        this.initEnemyFromDef(g, guardDef, gx, gz, waveHpMult, waveSpdMult, dmgScale);
        spawned += 1;
      }
      return spawned;
    }

    // Survival Ring Surround formation around player
    const ringId = session.level.allowedEnemyIds.includes('swarm-mite')
      ? 'swarm-mite'
      : stage.entries[0]?.enemyId ?? 'slime-chaser';
    const ringDef = session.registries.enemies.get(ringId);
    if (!ringDef) return 0;

    const arenaLimit = session.level.arenaRadius - ringDef.radius - 0.8;
    const ringRadius = 13.2;
    const ringCount = 12;

    for (let i = 0; i < ringCount; i += 1) {
      if (session.enemies.activeCount >= cap) break;
      const ang = (i / ringCount) * Math.PI * 2;
      let sx = p.x + Math.cos(ang) * ringRadius;
      let sz = p.z + Math.sin(ang) * ringRadius;
      const rSq = sx * sx + sz * sz;
      if (rSq > arenaLimit * arenaLimit) {
        const r = Math.sqrt(rSq) || 1;
        sx = (sx / r) * arenaLimit;
        sz = (sz / r) * arenaLimit;
      }
      if (isBlocked(sx, sz, ringDef.radius)) continue;

      const enemy = session.enemies.acquire();
      if (!enemy) break;
      this.initEnemyFromDef(enemy, ringDef, sx, sz, waveHpMult, waveSpdMult, dmgScale);
      spawned += 1;
    }
    return spawned;
  }

  private findSpawnPositionOutsideView(
    session: GameSession,
    viewBounds: Readonly<GroundViewBounds>,
    enemyRadius: number
  ): { x: number; z: number } | null {
    if (session.level.arenaShape === 'bridge' && session.level.bridgeConfig) {
      const b = session.level.bridgeConfig;
      const maxX = Math.max(1, b.halfWidth - enemyRadius - 0.45);
      this.spawnPosScratch.x = session.rng.range(-maxX, maxX);
      this.spawnPosScratch.z = session.rng.range(b.minZ + 2.0, b.minZ + 5.0);
      return this.spawnPosScratch;
    }

    const p = session.player;
    const arenaLimit = session.level.arenaRadius - enemyRadius - 0.5;
    const margin = 3.2;
    const minPlayerDist = Math.max(10, Math.min(viewBounds.halfWidth, viewBounds.halfDepth) + 1.5);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const side = session.rng.int(0, 4);
      let x = 0;
      let z = 0;
      const spanX = viewBounds.halfWidth + margin;
      const spanZ = viewBounds.halfDepth + margin;

      if (side === 0) {
        x = viewBounds.centerX + session.rng.range(-spanX, spanX);
        z = viewBounds.centerZ - spanZ - session.rng.range(0, 3);
      } else if (side === 1) {
        x = viewBounds.centerX + session.rng.range(-spanX, spanX);
        z = viewBounds.centerZ + spanZ + session.rng.range(0, 3);
      } else if (side === 2) {
        x = viewBounds.centerX - spanX - session.rng.range(0, 3);
        z = viewBounds.centerZ + session.rng.range(-spanZ, spanZ);
      } else {
        x = viewBounds.centerX + spanX + session.rng.range(0, 3);
        z = viewBounds.centerZ + session.rng.range(-spanZ, spanZ);
      }

      // If outside arena circle, project inward along opposite side from player or clamp
      const rSq = x * x + z * z;
      if (rSq > arenaLimit * arenaLimit) {
        // Fallback: pick an angle opposite to player's offset from center so it stays far from player
        const ang = session.rng.range(0, Math.PI * 2);
        const r = Math.min(arenaLimit, minPlayerDist + session.rng.range(2, 8));
        x = Math.cos(ang) * r;
        z = Math.sin(ang) * r;
        if (x * x + z * z > arenaLimit * arenaLimit) {
          const d = Math.hypot(x, z) || 1;
          x = (x / d) * arenaLimit;
          z = (z / d) * arenaLimit;
        }
      }

      // Verify distance from player and outside visible rectangle
      const dxP = x - p.x;
      const dzP = z - p.z;
      if (dxP * dxP + dzP * dzP < minPlayerDist * minPlayerDist) {
        continue;
      }

      const insideView =
        Math.abs(x - viewBounds.centerX) < viewBounds.halfWidth + 1.0 &&
        Math.abs(z - viewBounds.centerZ) < viewBounds.halfDepth + 1.0;
      if (insideView) {
        continue;
      }

      // Verify not inside obstacle
      let blocked = false;
      for (const obs of session.level.obstacles) {
        const odx = x - obs.x;
        const odz = z - obs.z;
        const minD = obs.radius + enemyRadius + 0.3;
        if (odx * odx + odz * odz < minD * minD) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        this.spawnPosScratch.x = x;
        this.spawnPosScratch.z = z;
        return this.spawnPosScratch;
      }
    }
    return null;
  }

  private spawnEnemyOutsideView(
    session: GameSession,
    enemyId: string,
    viewBounds: Readonly<GroundViewBounds>,
    hpMult: number,
    speedMult: number,
    dmgMult = 1
  ): EnemyEntity | null {
    const def = session.registries.enemies.get(enemyId);
    if (!def) return null;

    const pos = this.findSpawnPositionOutsideView(session, viewBounds, def.radius);
    if (!pos) return null;

    const enemy = def.isBoss ? session.enemies.acquireReserved() : session.enemies.acquire();
    if (!enemy) return null;

    this.initEnemyFromDef(enemy, def, pos.x, pos.z, hpMult, speedMult, dmgMult);
    return enemy;
  }

  private spawnBoss(
    session: GameSession,
    viewBounds: Readonly<GroundViewBounds>,
    sound: SoundEngine | null
  ): boolean {
    const bossId = session.level.bossStage.bossEnemyId;
    const def = session.registries.enemies.get(bossId);
    if (!def) return false;

    const enemy = session.enemies.acquireReserved();
    if (!enemy) return false;

    const pos = this.findSpawnPositionOutsideView(session, viewBounds, def.radius) ?? {
      x: Math.max(-session.level.arenaRadius + 4, Math.min(session.level.arenaRadius - 4, session.player.x + 14)),
      z: session.player.z,
    };

    const p = session.player;
    const isBridge = session.level.arenaShape === 'bridge';
    const durationScale = isBridge
      ? 0.45
      : Math.min(1.25, Math.max(0.2, session.level.bossStage.triggerSec / 180));
    const playerPowerScale =
      1 +
      Math.max(0, p.level - 3) * 0.08 +
      Math.max(0, p.weapons.length - 1) * 0.14 +
      Math.max(0, p.damageMult - 1) * 0.45 +
      Math.min(10, p.equippedRelics.length) * 0.04;
    const endlessScale = session.endlessMode
      ? 1 + (session.endlessWaveLevel - 1) * 0.28
      : 1;
    const bossHpMult = durationScale * playerPowerScale * endlessScale;
    const bossSpeedMult = isBridge ? 0.68 : 1;
    const bossDmgMult = session.endlessMode
      ? 1 + Math.min(2.0, (session.endlessWaveLevel - 1) * 0.04)
      : 1;

    this.initEnemyFromDef(enemy, def, pos.x, pos.z, bossHpMult, bossSpeedMult, bossDmgMult);
    session.bossSlot = enemy.slotIndex;
    session.bossGen = enemy.generation;
    sound?.playBossWarning();
    return true;
  }

  private initEnemyFromDef(
    enemy: EnemyEntity,
    def: EnemyDefinition,
    x: number,
    z: number,
    hpMult: number,
    speedMult: number,
    dmgMult = 1
  ): void {
    enemy.defId = def.id;
    enemy.name = def.name;
    enemy.role = def.role;
    enemy.behaviorId = def.behaviorId;
    enemy.isElite = def.isElite;
    enemy.isBoss = def.isBoss;
    enemy.x = x;
    enemy.z = z;
    enemy.vx = 0;
    enemy.vz = 0;
    enemy.kbVx = 0;
    enemy.kbVz = 0;
    const safeHp = Math.round(def.maxHp * hpMult);
    enemy.maxHp = Number.isFinite(safeHp) ? Math.max(1, Math.min(1_000_000_000, safeHp)) : 1_000_000_000;
    enemy.hp = enemy.maxHp;
    enemy.speed = def.speed * speedMult;
    const safeDmg = Math.round(def.damage * dmgMult);
    enemy.damage = Number.isFinite(safeDmg) ? Math.max(1, Math.min(100_000, safeDmg)) : 100_000;
    enemy.radius = def.radius;
    enemy.xpValue = def.xpValue;
    enemy.baseColor = def.color;
    enemy.accentColor = def.accentColor;
    enemy.scale = def.scale;
    enemy.facingRad = 0;
    enemy.hitFlashTimer = 0;
    enemy.slowTimer = 0;
    enemy.slowFactor = 1;
    enemy.armorReduction = Number(def.params?.armorReduction ?? 0);
    enemy.lastOrbitHitSec = -999;
    this.statusSys.clearEnemyStatuses(enemy);
    enemy.aiState = 'chase';
    enemy.aiTimer = 0;
    enemy.aiCooldown = def.isBoss ? 2.6 : 1.4;
    enemy.dirX = 0;
    enemy.dirZ = 1;
    enemy.slamX = x;
    enemy.slamZ = z;
    enemy.slamRadius = Number(def.params?.slamRadius ?? 5.5);
    enemy.bossPhaseToggle = 0;
    enemy.bossPhase = 1;
    enemy.bossShieldTimer = 0;
  }

  private rebuildSpatialGrid(session: GameSession): void {
    session.enemyGrid.clear();
    session.enemies.forEachActive((e) => {
      session.enemyGrid.insert(e.slotIndex, e.x, e.z);
    });
  }

  private updateEnemiesAI(
    session: GameSession,
    dt: number,
    viewBounds: Readonly<GroundViewBounds>,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): void {
    const p = session.player;
    const maxRecycleDist =
      Math.max(viewBounds.halfWidth, viewBounds.halfDepth) + RUNTIME_CONFIG.farEnemyRecycleMargin;
    const maxRecycleDistSq = maxRecycleDist * maxRecycleDist;
    const arenaMax = session.level.arenaRadius;

    session.enemies.forEachActive((e) => {
      if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      if (e.bossShieldTimer > 0) e.bossShieldTimer = Math.max(0, e.bossShieldTimer - dt);
      if (e.slowTimer > 0) {
        e.slowTimer = Math.max(0, e.slowTimer - dt);
        if (e.slowTimer <= 0) e.slowFactor = 1;
      }

      const statusRes = this.statusSys.updateEnemyStatuses(session, e, dt);
      if (statusRes.dotDamage > 0) {
        combat.damageEnemy(session, e, statusRes.dotDamage, 0, 0, sound, true);
        if (!e.active || e.hp <= 0) return;
      }

      const toPx = p.x - e.x;
      const toPz = p.z - e.z;
      const distSq = toPx * toPx + toPz * toPz;

      // Far-distance recycle for normal enemies only (never Boss or Elite)
      if (!e.isBoss && !e.isElite && distSq > maxRecycleDistSq) {
        session.enemies.release(e);
        return;
      }

      const dist = Math.sqrt(distSq) || 0.0001;
      const nx = toPx / dist;
      const nz = toPz / dist;
      const rawSlowM = Math.min(e.slowTimer > 0 ? e.slowFactor : 1, e.debuffMoveMult);
      const bossSlowFloor = session.level.arenaShape === 'bridge' ? 0.38 : 0.55;
      const slowM = e.isBoss ? Math.max(bossSlowFloor, rawSlowM) : rawSlowM;
      const effSpeed = e.speed * slowM;

      this.stepBehavior(
        session,
        e,
        nx,
        nz,
        dist,
        effSpeed,
        statusRes.hasSlowWindup ? dt * (e.isBoss ? 0.85 : 0.65) : dt,
        combat,
        sound
      );

      // Local crowd separation via SpatialGrid (bounded to 10 neighbors)
      let sepX = 0;
      let sepZ = 0;
      if (!e.isBoss) {
        session.enemyGrid.queryCircleCandidates(e.x, e.z, e.radius * 2.4, this.sepScratch, 10);
        for (let i = 0; i < this.sepScratch.length; i += 1) {
          const otherIdx = this.sepScratch[i];
          if (otherIdx === e.slotIndex) continue;
          const other = session.enemies.getRaw(otherIdx);
          if (!other.active) continue;
          const dx = e.x - other.x;
          const dz = e.z - other.z;
          const minSep = e.radius + other.radius;
          const dSq = dx * dx + dz * dz;
          if (dSq < minSep * minSep) {
            if (dSq > 1e-6) {
              const d = Math.sqrt(dSq);
              const push = (minSep - d) * 3.8;
              sepX += (dx / d) * push;
              sepZ += (dz / d) * push;
            } else {
              // Deterministic tie-break when completely overlapping (zero division guard)
              const angle = ((e.slotIndex * 1.73) % (Math.PI * 2));
              sepX += Math.cos(angle) * 2.0;
              sepZ += Math.sin(angle) * 2.0;
            }
          }
        }
      }

      // Damp knockback
      e.kbVx *= Math.exp(-10 * dt);
      e.kbVz *= Math.exp(-10 * dt);

      e.x += (e.vx + sepX + e.kbVx) * dt;
      e.z += (e.vz + sepZ + e.kbVz) * dt;

      // Obstacle push-out
      for (const obs of session.level.obstacles) {
        const odx = e.x - obs.x;
        const odz = e.z - obs.z;
        const minD = obs.radius + e.radius;
        const odSq = odx * odx + odz * odz;
        if (odSq < minD * minD) {
          const od = Math.sqrt(odSq) || 0.0001;
          const push = minD - od;
          e.x += (odx / od) * push;
          e.z += (odz / od) * push;
        }
      }

      // Clamp to arena (bridge lane vs circle)
      if (session.level.arenaShape === 'bridge' && session.level.bridgeConfig) {
        const b = session.level.bridgeConfig;
        const maxX = Math.max(1, b.halfWidth - e.radius - 0.35);
        e.x = Math.max(-maxX, Math.min(maxX, e.x));
        e.z = Math.max(b.minZ + e.radius, e.z);

        // Red defense line breach check
        if (e.z >= b.defenseLineZ) {
          combat.resetCombo(session);
          session.spawnVfxBurst(e.x, 0.5, b.defenseLineZ, 0xff4757, 8);
          combat.damagePlayer(
            session,
            e.isBoss ? Math.round(session.player.maxHp * 0.45) : e.damage * 1.4,
            sound
          );
          if (!e.isBoss) {
            session.enemies.release(e);
            return;
          }
          combat.enqueueNotice(translateUi(session.language, 'toast.bossBreach'), false);
          e.z = b.defenseLineZ - 5.5;
        }
      } else {
        const lim = arenaMax - e.radius;
        const rSq = e.x * e.x + e.z * e.z;
        if (rSq > lim * lim) {
          const r = Math.sqrt(rSq);
          e.x = (e.x / r) * lim;
          e.z = (e.z / r) * lim;
        }
      }

      // Contact keepout + damage check against player (prevents Boss/elites from burying the hero)
      const cDx = p.x - e.x;
      const cDz = p.z - e.z;
      const distSqPlayer = cDx * cDx + cDz * cDz;
      const hitR = p.colliderRadius + e.radius * 0.92;
      if (distSqPlayer <= hitR * hitR) {
        const minKeepout = p.colliderRadius + e.radius * 0.72;
        if (distSqPlayer < minKeepout * minKeepout && session.level.arenaShape !== 'bridge') {
          const dP = Math.sqrt(distSqPlayer) || 0.001;
          const pushOut = minKeepout - dP;
          e.x -= (cDx / dP) * pushOut;
          e.z -= (cDz / dP) * pushOut;
        }
        combat.damagePlayer(session, e.damage * e.debuffEnemyDmgMult, sound);
      }
    });
  }

  private stepBehavior(
    session: GameSession,
    e: EnemyEntity,
    nx: number,
    nz: number,
    dist: number,
    effSpeed: number,
    dt: number,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): void {
    if (e.behaviorId === 'enemy-chaser') {
      e.vx = nx * effSpeed;
      e.vz = nz * effSpeed;
      e.facingRad = Math.atan2(nx, nz);
      return;
    }

    if (e.behaviorId === 'enemy-charger' || e.behaviorId === 'enemy-elite-warden') {
      const def = session.registries.enemies.get(e.defId);
      const triggerDist = Number(def?.params?.triggerDist ?? 8);
      const telegraphSec = Number(def?.params?.telegraphSec ?? 0.7);
      const dashSpeed = Number(def?.params?.dashSpeed ?? 11.5);
      const dashDur = Number(def?.params?.dashDurationSec ?? 0.5);
      const recoverSec = Number(def?.params?.recoverSec ?? 1.0);

      if (e.aiState === 'chase') {
        e.vx = nx * effSpeed;
        e.vz = nz * effSpeed;
        e.facingRad = Math.atan2(nx, nz);
        e.aiCooldown -= dt;
        if (e.aiCooldown <= 0 && dist <= triggerDist) {
          e.aiState = 'telegraph';
          e.aiTimer = telegraphSec;
          e.dirX = nx;
          e.dirZ = nz;
          e.vx = 0;
          e.vz = 0;
          e.facingRad = Math.atan2(e.dirX, e.dirZ);
        }
      } else if (e.aiState === 'telegraph') {
        e.vx = 0;
        e.vz = 0;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiState = 'dash';
          e.aiTimer = dashDur;
        }
      } else if (e.aiState === 'dash') {
        e.vx = e.dirX * dashSpeed;
        e.vz = e.dirZ * dashSpeed;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiState = 'recover';
          e.aiTimer = recoverSec;
          e.vx = 0;
          e.vz = 0;
        }
      } else {
        e.vx = 0;
        e.vz = 0;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiState = 'chase';
          e.aiCooldown = e.isElite ? 2.4 : 1.6;
        }
      }
      return;
    }

    if (e.behaviorId === 'enemy-ranged') {
      const def = session.registries.enemies.get(e.defId);
      const preferredDist = Number(def?.params?.preferredDist ?? 8.5);
      const retreatDist = Number(def?.params?.retreatDist ?? 5.5);
      const windupSec = Number(def?.params?.windupSec ?? 0.65);
      const cooldownSec = Number(def?.params?.cooldownSec ?? 2.5);
      const projSpd = Number(def?.params?.projectileSpeed ?? 7.4);
      const projRad = Number(def?.params?.projectileRadius ?? 0.32);
      const projLife = Number(def?.params?.projectileLifetimeSec ?? 2.4);

      e.facingRad = Math.atan2(nx, nz);
      if (e.aiState === 'windup') {
        e.vx = 0;
        e.vz = 0;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          this.spawnEnemyOrb(session, e.x, e.z, e.dirX * projSpd, e.dirZ * projSpd, projRad, e.damage, projLife);
          e.aiState = 'chase';
          e.aiCooldown = cooldownSec;
        }
        return;
      }

      if (session.level.arenaShape === 'bridge' && session.level.bridgeConfig) {
        // On narrow bridge lanes, advance steadily down-lane instead of circle-strafing into rails
        const stopZ = session.level.bridgeConfig.defenseLineZ - 7.8;
        if (e.z < stopZ) {
          e.vx = nx * effSpeed * 0.25;
          e.vz = effSpeed * 0.85;
        } else {
          e.vx = 0;
          e.vz = effSpeed * 0.22;
        }
      } else if (dist < retreatDist) {
        e.vx = -nx * effSpeed * 0.9;
        e.vz = -nz * effSpeed * 0.9;
      } else if (dist > preferredDist) {
        e.vx = nx * effSpeed;
        e.vz = nz * effSpeed;
      } else {
        // Gentle strafe
        e.vx = -nz * effSpeed * 0.45;
        e.vz = nx * effSpeed * 0.45;
      }

      e.aiCooldown -= dt;
      if (e.aiCooldown <= 0 && dist <= preferredDist + 4.5) {
        e.aiState = 'windup';
        e.aiTimer = windupSec;
        e.dirX = nx;
        e.dirZ = nz;
      }
      return;
    }

    if (e.behaviorId === 'enemy-boss-king') {
      const def = session.registries.enemies.get(e.defId);
      const isBridge = session.level.arenaShape === 'bridge';
      const slamRadius = Number(def?.params?.slamRadius ?? 5.8);
      const slamTelegraph = Number(def?.params?.slamTelegraphSec ?? 1.05);
      const slamDamage = Number(def?.params?.slamDamage ?? 28);
      const dashSpeed = Number(def?.params?.dashSpeed ?? 13.5);
      const dashTelegraph = Number(def?.params?.dashTelegraphSec ?? 0.85);
      const dashDur = Number(def?.params?.dashDurationSec ?? 0.55);
      const orbSpeed = Number(def?.params?.orbSpeed ?? 7.2);

      if (e.bossPhase === 1 && e.hp <= e.maxHp * 0.5) {
        e.bossPhase = 2;
        e.bossShieldTimer = isBridge ? 1.0 : 1.6;
        if (isBridge) {
          // Push siege Boss slightly back on narrow bridge instead of accelerating into the red line
          e.z = Math.max((session.level.bridgeConfig?.minZ ?? -36) + e.radius, e.z - 1.8);
        } else {
          e.speed *= 1.15;
        }
        e.aiCooldown = Math.min(e.aiCooldown, isBridge ? 1.4 : 0.9);
        session.spawnShockwave(2, e.x, e.z, 0.8, isBridge ? 4.5 : 7.5, 0xf97316, 0.55, true);
        session.spawnVfxBurst(e.x, 1.1, e.z, 0xf97316, 18);
        if (isBridge) {
          const baseAng = Math.atan2(nz, nx);
          for (let k = -2; k <= 2; k += 1) {
            const ang = baseAng + k * 0.22;
            this.spawnEnemyOrb(
              session,
              e.x,
              e.z,
              Math.cos(ang) * orbSpeed * 0.82,
              Math.sin(ang) * orbSpeed * 0.82,
              0.38,
              e.damage * 0.72,
              2.6
            );
          }
        } else {
          const phaseOrbs = 12;
          for (let k = 0; k < phaseOrbs; k += 1) {
            const ang = (k * Math.PI * 2) / phaseOrbs;
            this.spawnEnemyOrb(
              session,
              e.x,
              e.z,
              Math.cos(ang) * orbSpeed * 1.15,
              Math.sin(ang) * orbSpeed * 1.15,
              0.42,
              e.damage * 0.9,
              2.8
            );
          }
        }
      }

      if (e.aiState === 'chase') {
        e.vx = nx * effSpeed;
        e.vz = nz * effSpeed;
        e.facingRad = Math.atan2(nx, nz);
        e.aiCooldown -= dt;
        if (e.aiCooldown <= 0) {
          if (isBridge) {
            // Bridge mode: stationary fan-orb barrage only (never dash or full-bridge AoE slam)
            e.aiState = 'boss-slam-telegraph';
            e.aiTimer = slamTelegraph;
            e.slamX = e.x;
            e.slamZ = e.z;
            e.slamRadius = 0;
          } else {
            e.bossPhaseToggle = (e.bossPhaseToggle + 1) % 2;
            if (e.bossPhaseToggle === 1) {
              e.aiState = 'boss-slam-telegraph';
              e.aiTimer = slamTelegraph;
              e.slamX = e.x;
              e.slamZ = e.z;
              e.slamRadius = slamRadius;
            } else {
              e.aiState = 'boss-dash-telegraph';
              e.aiTimer = dashTelegraph;
              e.dirX = nx;
              e.dirZ = nz;
            }
          }
          e.vx = 0;
          e.vz = 0;
        }
      } else if (e.aiState === 'boss-slam-telegraph') {
        e.vx = 0;
        e.vz = 0;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          if (isBridge) {
            // Dodgeable forward fan volley down the bridge
            const halfFan = e.bossPhase >= 2 ? 2 : 1;
            const baseAng = Math.atan2(nz, nx);
            for (let k = -halfFan; k <= halfFan; k += 1) {
              const ang = baseAng + k * 0.24;
              this.spawnEnemyOrb(
                session,
                e.x,
                e.z,
                Math.cos(ang) * orbSpeed * 0.8,
                Math.sin(ang) * orbSpeed * 0.8,
                0.36,
                e.damage * 0.68,
                2.5
              );
            }
          } else {
            // Survival mode: full Slam AoE + radial orbs (8 in Phase 1, 12 in Phase 2)
            const p = session.player;
            const dx = p.x - e.slamX;
            const dz = p.z - e.slamZ;
            if (dx * dx + dz * dz <= (e.slamRadius + p.colliderRadius) ** 2) {
              combat.damagePlayer(session, slamDamage, sound);
            }
            const orbCount = e.bossPhase >= 2 ? 12 : 8;
            for (let k = 0; k < orbCount; k += 1) {
              const ang = (k * Math.PI * 2) / orbCount;
              this.spawnEnemyOrb(
                session,
                e.x,
                e.z,
                Math.cos(ang) * orbSpeed,
                Math.sin(ang) * orbSpeed,
                0.38,
                e.damage * 0.85,
                2.6
              );
            }
          }
          session.spawnVfxBurst(e.x, 0.8, e.z, 0xff4757, 12);
          e.aiState = 'recover';
          e.aiTimer = isBridge ? 0.9 : 0.75;
        }
      } else if (e.aiState === 'boss-dash-telegraph') {
        e.vx = 0;
        e.vz = 0;
        e.facingRad = Math.atan2(e.dirX, e.dirZ);
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiState = 'dash';
          e.aiTimer = dashDur;
        }
      } else if (e.aiState === 'dash') {
        const phaseDashSpeed = e.bossPhase >= 2 ? dashSpeed * 1.15 : dashSpeed;
        e.vx = e.dirX * phaseDashSpeed;
        e.vz = e.dirZ * phaseDashSpeed;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiState = 'recover';
          e.aiTimer = 0.75;
          e.vx = 0;
          e.vz = 0;
        }
      } else {
        e.vx = 0;
        e.vz = 0;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiState = 'chase';
          e.aiCooldown = isBridge ? (e.bossPhase >= 2 ? 2.1 : 2.8) : e.bossPhase >= 2 ? 1.55 : 2.4;
        }
      }
    }
  }

  private spawnEnemyOrb(
    session: GameSession,
    x: number,
    z: number,
    vx: number,
    vz: number,
    radius: number,
    damage: number,
    lifeSec: number
  ): void {
    const orb = session.enemyProjectiles.acquire();
    if (!orb) return;
    orb.isEnemy = true;
    orb.x = x;
    orb.z = z;
    orb.prevX = x;
    orb.prevZ = z;
    orb.vx = vx;
    orb.vz = vz;
    orb.radius = radius;
    orb.damage = damage;
    orb.knockback = 0;
    orb.remainingLifeSec = lifeSec;
    orb.pierceLeft = 1;
    orb.color = 0xff5e7e;
    orb.splitOnHit = false;
    orb.isSplitChild = false;
    orb.hitCount = 0;
  }
}
