import type { SoundEngine } from '../audio/SoundEngine';
import { RUNTIME_CONFIG } from '../config/runtimeConfig';
import type { WeaponDefinition } from '../content/definitions/ContentTypes';
import { DEBUFF_BY_ID } from '../content/effects/debuffs';
import { translateContent, translateUi } from '../i18n/i18n';
import type { SceneArena } from '../scene/SceneArena';
import type {
  BridgeGateState,
  EnemyEntity,
  ProjectileEntity,
  WeaponRuntimeState,
} from '../session/SessionEntities';
import type { GameSession } from '../session/GameSession';
import { StatusEffectSystem } from './StatusEffectSystem';
import { UpgradeSystem } from './UpgradeSystem';

function distSqPointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq <= 1e-8) {
    return apx * apx + apz * apz;
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

const IDX_ARMOR_SHRED = DEBUFF_BY_ID['armor-shred'].index;
const IDX_HEAVY_SUNDER = DEBUFF_BY_ID['heavy-sunder'].index;
const IDX_SHOCK_STATIC = DEBUFF_BY_ID['shock-static'].index;
const IDX_HOLY_BRAND = DEBUFF_BY_ID['holy-brand'].index;
const IDX_PLAGUE_SPREAD = DEBUFF_BY_ID['plague-spread'].index;

function segmentIntersectsGate(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  gateX: number,
  gateZ: number,
  halfWidth: number,
  halfThickness: number
): boolean {
  const minZ = Math.min(az, bz);
  const maxZ = Math.max(az, bz);
  if (maxZ < gateZ - halfThickness || minZ > gateZ + halfThickness) {
    return false;
  }
  const dz = bz - az;
  if (Math.abs(dz) <= 1e-6) {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    return maxX >= gateX - halfWidth && minX <= gateX + halfWidth;
  }
  const t = Math.max(0, Math.min(1, (gateZ - az) / dz));
  const ix = ax + (bx - ax) * t;
  return Math.abs(ix - gateX) <= halfWidth;
}

export interface CombatNotice {
  text: string;
  playSupplySfx: boolean;
}

export class CombatSystem {
  public static readonly GUARD_COOLDOWN = 8.0;

  private readonly statusSys = new StatusEffectSystem();
  private readonly upgSys = new UpgradeSystem();
  private readonly chainVisitedSlots = new Int32Array(32);
  private readonly chainVisitedGens = new Int32Array(32);
  private readonly targetQueryScratch: number[] = [];
  private readonly projQueryScratch: number[] = [];
  private readonly aoeQueryScratch: number[] = [];
  private readonly clusterScratch: number[] = [];
  private readonly deathAoEScratch: number[] = [];
  private deathEffectDepth = 0;

  private novaVisualTimer = 0;
  private novaVisualMaxRange = 4.4;
  private echoVisualTimer = 0;
  private echoVisualMaxRange = 5.4;
  public readonly pendingNotices: CombatNotice[] = [];
  public pendingCameraShake = 0;

  public enqueueNotice(text: string, playSupplySfx = false): void {
    if (this.pendingNotices.length >= 3) {
      this.pendingNotices.shift();
    }
    this.pendingNotices.push({ text, playSupplySfx });
  }

  public resetCombo(session: GameSession): void {
    if (session.combo === 0 && session.comboTier === 0) return;
    session.combo = 0;
    this.upgSys.recalculateStats(session);
  }

  public resetVisuals(arena: SceneArena | null): void {
    this.novaVisualTimer = 0;
    this.echoVisualTimer = 0;
    const pv = arena?.playerVisual;
    if (!pv) return;
    for (const m of pv.shieldMeshes) {
      m.visible = false;
    }
    pv.orbitTrackRing.visible = false;
    pv.novaRing.visible = false;
    pv.novaEchoRing.visible = false;
  }

  public update(
    session: GameSession,
    dt: number,
    arena: SceneArena | null,
    sound: SoundEngine | null
  ): void {
    this.updateWeapons(session, dt, arena, sound);
    this.updatePlayerProjectiles(session, dt, sound);
    this.updateEnemyProjectiles(session, dt, sound);
    this.updateVfx(session, dt);
    this.updateNovaVisuals(dt, arena);
  }

  private updateWeapons(
    session: GameSession,
    dt: number,
    arena: SceneArena | null,
    sound: SoundEngine | null
  ): void {
    const p = session.player;
    let hasOrbit = false;

    for (const wState of p.weapons) {
      const def = session.registries.weapons.get(wState.weaponId);
      if (!def) continue;

      if (def.behaviorId === 'weapon-projectile-auto') {
        this.updateAutoProjectileWeapon(session, wState, def, dt, sound);
      } else if (def.behaviorId === 'weapon-orbit-guard') {
        hasOrbit = true;
        this.updateOrbitWeapon(session, wState, def, dt, arena, sound);
      } else if (def.behaviorId === 'weapon-nova-pulse') {
        this.updateNovaWeapon(session, wState, def, dt, sound);
      } else if (def.behaviorId === 'weapon-chain-lightning') {
        this.updateChainWeapon(session, wState, def, dt, sound);
      } else if (def.behaviorId === 'weapon-sniper-high-hp') {
        this.updateSniperWeapon(session, wState, def, dt, sound);
      }
    }

    if (!hasOrbit && arena?.playerVisual) {
      for (const m of arena.playerVisual.shieldMeshes) {
        m.visible = false;
      }
      arena.playerVisual.orbitTrackRing.visible = false;
    }
  }

  private findNearestEnemy(
    session: GameSession,
    x: number,
    z: number,
    range: number
  ): EnemyEntity | null {
    const candidates = this.targetQueryScratch;
    session.enemyGrid.queryCircleCandidates(x, z, range, candidates, 64);
    const rangeSq = range * range;
    const isBridge = session.level.arenaShape === 'bridge';
    let best: EnemyEntity | null = null;
    let bestScore = isBridge ? -Infinity : rangeSq;

    for (let i = 0; i < candidates.length; i += 1) {
      const e = session.enemies.getRaw(candidates[i]);
      if (!e.active || e.hp <= 0) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq > rangeSq) continue;

      if (isBridge) {
        // In Bridge Defense, balance urgency (closest to defense line) with horizontal lane alignment
        const laneScore = e.z - Math.abs(e.x - x) * 1.45;
        if (laneScore > bestScore || (laneScore === bestScore && best && e.slotIndex < best.slotIndex)) {
          bestScore = laneScore;
          best = e;
        }
      } else if (dSq < bestScore || (dSq === bestScore && best && e.slotIndex < best.slotIndex)) {
        bestScore = dSq;
        best = e;
      }
    }
    return best;
  }

  /**
   * Zero-GC density-aware targeting: finds the active enemy inside `range` that has the most
   * active neighbors within `clusterRadius`, ideal for chain lightning & AoE starters.
   */
  public findDensestEnemyClusterCenter(
    session: GameSession,
    x: number,
    z: number,
    range: number,
    clusterRadius: number
  ): EnemyEntity | null {
    const candidates = this.targetQueryScratch;
    session.enemyGrid.queryCircleCandidates(x, z, range, candidates, 36);
    const rangeSq = range * range;
    const clRadSq = clusterRadius * clusterRadius;

    let best: EnemyEntity | null = null;
    let bestDensity = -1;
    let bestDistSq = rangeSq;

    for (let i = 0; i < candidates.length; i += 1) {
      const e = session.enemies.getRaw(candidates[i]);
      if (!e.active || e.hp <= 0) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq > rangeSq) continue;

      session.enemyGrid.queryCircleCandidates(e.x, e.z, clusterRadius, this.clusterScratch, 16);
      let density = 0;
      for (let j = 0; j < this.clusterScratch.length; j += 1) {
        const nb = session.enemies.getRaw(this.clusterScratch[j]);
        if (!nb.active || nb.hp <= 0) continue;
        const ndx = nb.x - e.x;
        const ndz = nb.z - e.z;
        if (ndx * ndx + ndz * ndz <= clRadSq) {
          density += 1;
        }
      }

      if (
        density > bestDensity ||
        (density === bestDensity && dSq < bestDistSq) ||
        (density === bestDensity && dSq === bestDistSq && best && e.slotIndex < best.slotIndex)
      ) {
        bestDensity = density;
        bestDistSq = dSq;
        best = e;
      }
    }
    return best;
  }

  /**
   * Zero-GC high-value target selector: prioritizes Boss > Elite > Armored Vanguard > Highest HP.
   */
  public findHighestHpEnemy(
    session: GameSession,
    x: number,
    z: number,
    range: number
  ): EnemyEntity | null {
    const candidates = this.targetQueryScratch;
    session.enemyGrid.queryCircleCandidates(x, z, range, candidates, 48);
    const rangeSq = range * range;

    let best: EnemyEntity | null = null;
    let bestPriority = -1;

    for (let i = 0; i < candidates.length; i += 1) {
      const e = session.enemies.getRaw(candidates[i]);
      if (!e.active || e.hp <= 0) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      if (dx * dx + dz * dz > rangeSq) continue;

      const prio =
        (e.isBoss ? 1_000_000_000 : e.isElite ? 1_000_000 : 0) +
        (e.armorReduction > 0 ? 500 : 0) +
        e.hp;
      if (prio > bestPriority || (prio === bestPriority && best && e.slotIndex < best.slotIndex)) {
        bestPriority = prio;
        best = e;
      }
    }
    return best;
  }

  public triggerAegisGuard(session: GameSession, sound: SoundEngine | null): boolean {
    const p = session.player;
    if (p.guardCooldown > 0) return false;
    p.guardCooldown = CombatSystem.GUARD_COOLDOWN * p.dashCooldownMult;

    const shieldGain = Math.max(20, Math.round(p.maxHp * 0.22));
    p.maxShield = Math.max(p.maxShield, p.shield + shieldGain);
    p.shield = Math.min(p.maxShield, p.shield + shieldGain);
    p.invulnTimer = Math.max(p.invulnTimer, 0.3);

    const candidates = this.aoeQueryScratch;
    session.enemyGrid.queryCircleCandidates(p.x, p.z, 4.8, candidates, 32);
    const dmg = 18 * p.damageMult;
    for (let i = 0; i < candidates.length; i += 1) {
      const e = session.enemies.getRaw(candidates[i]);
      if (!e.active || e.hp <= 0) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > 4.8 * 4.8) continue;
      const d = Math.sqrt(dSq) || 1;
      this.statusSys.applyDebuff(e, 'frost-chill');
      this.damageEnemy(session, e, dmg, (dx / d) * 8.5, (dz / d) * 8.5, sound, true);
    }

    session.spawnShockwave(0, p.x, p.z, 0.5, 4.8, 0x38bdf8, 0.38, false);
    session.spawnVfxBurst(p.x, 0.9, p.z, 0x38bdf8, 12);
    sound?.playNova();
    return true;
  }

  public triggerFuryUltimate(session: GameSession, sound: SoundEngine | null): boolean {
    const p = session.player;
    if (p.furyCharge < 100) return false;
    p.furyCharge = 0;
    this.pendingCameraShake = Math.max(this.pendingCameraShake, 0.24);
    this.novaVisualTimer = 0.4;
    this.novaVisualMaxRange = 12.5;

    const candidates = this.aoeQueryScratch;
    session.enemyGrid.queryCircleCandidates(p.x, p.z, 13.5, candidates, 96);
    const dmg = 68 * p.damageMult;
    for (let i = 0; i < candidates.length; i += 1) {
      const e = session.enemies.getRaw(candidates[i]);
      if (!e.active || e.hp <= 0) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > 13.5 * 13.5) continue;
      const d = Math.sqrt(dSq) || 1;
      this.damageEnemy(session, e, dmg, (dx / d) * 7, (dz / d) * 7, sound);
    }
    session.spawnShockwave(1, p.x, p.z, 1.0, 12.8, 0xfbbf24, 0.65, true);
    session.spawnShockwave(1, p.x, p.z, 0.6, 8.6, 0xf97316, 0.45, false);
    session.spawnVfxBurst(p.x, 1.0, p.z, 0xfbbf24, 24);
    sound?.playFury();
    return true;
  }

  private updateAutoProjectileWeapon(
    session: GameSession,
    wState: WeaponRuntimeState,
    def: WeaponDefinition,
    dt: number,
    sound: SoundEngine | null
  ): void {
    wState.cooldownTimer -= dt * session.player.attackSpeedMult;
    if (wState.cooldownTimer > 0) return;

    const p = session.player;
    const range = def.range * wState.rangeMult;
    const target = this.findNearestEnemy(session, p.x, p.z, range);
    const targetDistSq = target ? (target.x - p.x) ** 2 + (target.z - p.z) ** 2 : Infinity;
    const hasCloseThreat = targetDistSq <= 4.5 * 4.5;

    let alignedGate: BridgeGateState | null = null;
    let nearestGate: BridgeGateState | null = null;
    let bestGateDx = Infinity;
    if (session.level.arenaShape === 'bridge') {
      for (let gIdx = 0; gIdx < 2; gIdx += 1) {
        const gate = session.bridgeGates[gIdx];
        if (!gate.active) continue;
        if (gate.z < p.z && p.z - gate.z <= range) {
          const dx = Math.abs(gate.x - p.x);
          if (dx <= gate.halfWidth - 0.15 && !alignedGate) {
            alignedGate = gate;
          }
          if (dx < bestGateDx) {
            bestGateDx = dx;
            nearestGate = gate;
          }
        }
      }
    }

    const preferAlignedGate = Boolean(!hasCloseThreat && alignedGate);
    const fallbackGateTarget = Boolean(!target && !preferAlignedGate && nearestGate);

    if (!target && !preferAlignedGate && !fallbackGateTarget) {
      // Do not queue up infinite attacks when no target or gate is in range
      wState.cooldownTimer = 0.05;
      return;
    }

    wState.cooldownTimer = def.cooldownSec * wState.cooldownMult;

    const baseAngle =
      preferAlignedGate && alignedGate
        ? Math.atan2(alignedGate.z - p.z, alignedGate.x - p.x)
        : fallbackGateTarget && nearestGate
          ? Math.atan2(nearestGate.z - p.z, nearestGate.x - p.x)
          : Math.atan2(target!.z - p.z, target!.x - p.x);
    const totalCount = def.count + wState.bonusCount;
    const totalDamage = def.baseDamage * wState.damageMult * p.damageMult;
    const totalPierce = def.pierce + wState.bonusPierce;
    const splitOnHit = wState.mechanisms.has('splitOnHit');

    for (let i = 0; i < totalCount; i += 1) {
      const offset = totalCount === 1 ? 0 : (i - (totalCount - 1) * 0.5) * def.spreadRad;
      const ang = baseAngle + offset;
      this.spawnPlayerProjectile(
        session,
        p.x,
        p.z,
        Math.cos(ang) * def.projectileSpeed,
        Math.sin(ang) * def.projectileSpeed,
        def.projectileRadius,
        totalDamage,
        def.knockback,
        def.projectileLifetimeSec,
        totalPierce,
        def.color,
        splitOnHit,
        false
      );
    }
    sound?.playShoot('blaster');
  }

  private spawnPlayerProjectile(
    session: GameSession,
    x: number,
    z: number,
    vx: number,
    vz: number,
    radius: number,
    damage: number,
    knockback: number,
    lifeSec: number,
    pierce: number,
    color: number,
    splitOnHit: boolean,
    isSplitChild: boolean
  ): void {
    const proj = session.playerProjectiles.acquire();
    if (!proj) return;
    proj.isEnemy = false;
    proj.x = x;
    proj.z = z;
    proj.prevX = x;
    proj.prevZ = z;
    proj.vx = vx;
    proj.vz = vz;
    proj.radius = radius;
    proj.damage = damage;
    proj.knockback = knockback;
    proj.remainingLifeSec = lifeSec;
    proj.pierceLeft = Math.max(1, pierce);
    proj.color = color;
    proj.splitOnHit = splitOnHit;
    proj.isSplitChild = isSplitChild;
    proj.hitCount = 0;
  }

  private updateOrbitWeapon(
    session: GameSession,
    wState: WeaponRuntimeState,
    def: WeaponDefinition,
    dt: number,
    arena: SceneArena | null,
    sound: SoundEngine | null
  ): void {
    const p = session.player;
    const breathing = wState.mechanisms.has('breathingOrbit');
    const angularSpeed = def.projectileSpeed * (breathing ? 1.35 : 1.0) * p.attackSpeedMult;
    wState.orbitAngle = (wState.orbitAngle + angularSpeed * dt) % (Math.PI * 2);

    const count = Math.min(6, def.count + wState.bonusCount);
    const baseRadius = def.range * wState.rangeMult;
    const orbitRadius = breathing
      ? baseRadius * (1 + 0.35 * Math.sin(session.elapsedSec * 3.2))
      : baseRadius;

    const damage = def.baseDamage * wState.damageMult * p.damageMult;
    const hitR = def.projectileRadius;
    const candidates = this.aoeQueryScratch;

    for (let i = 0; i < count; i += 1) {
      const ang = wState.orbitAngle + (i * Math.PI * 2) / count;
      const sx = p.x + Math.cos(ang) * orbitRadius;
      const sz = p.z + Math.sin(ang) * orbitRadius;

      if (arena?.playerVisual && i < arena.playerVisual.shieldMeshes.length) {
        const mesh = arena.playerVisual.shieldMeshes[i];
        mesh.visible = true;
        // Convert world offset into playerVisual.root local space (accounting for root rotation)
        const localCos = Math.cos(-p.facingRad);
        const localSin = Math.sin(-p.facingRad);
        const rx = sx - p.x;
        const rz = sz - p.z;
        mesh.position.set(
          rx * localCos - rz * localSin,
          0.74,
          rx * localSin + rz * localCos
        );
        // Orient plasma crescent blade along orbital tangent
        mesh.rotation.y = -ang + p.facingRad;
      }

      session.enemyGrid.queryCircleCandidates(sx, sz, hitR + 1.6, candidates, 24);
      for (let c = 0; c < candidates.length; c += 1) {
        const e = session.enemies.getRaw(candidates[c]);
        if (!e.active || e.hp <= 0) continue;
        if (session.elapsedSec - e.lastOrbitHitSec < def.contactIntervalSec) continue;

        const dx = e.x - sx;
        const dz = e.z - sz;
        const sumR = hitR + e.radius;
        if (dx * dx + dz * dz <= sumR * sumR) {
          e.lastOrbitHitSec = session.elapsedSec;
          const kdx = e.x - p.x;
          const kdz = e.z - p.z;
          const kLen = Math.hypot(kdx, kdz) || 1;
          this.damageEnemy(
            session,
            e,
            damage,
            (kdx / kLen) * def.knockback,
            (kdz / kLen) * def.knockback,
            sound
          );
        }
      }
    }

    if (arena?.playerVisual) {
      for (let i = count; i < arena.playerVisual.shieldMeshes.length; i += 1) {
        arena.playerVisual.shieldMeshes[i].visible = false;
      }
      const track = arena.playerVisual.orbitTrackRing;
      track.visible = true;
      track.scale.setScalar(orbitRadius * 1.12);
      const trackMat = track.material as { uniforms?: { uTime?: { value: number }; uIntensity?: { value: number } } };
      if (trackMat.uniforms?.uTime) trackMat.uniforms.uTime.value = session.elapsedSec;
      if (trackMat.uniforms?.uIntensity) trackMat.uniforms.uIntensity.value = breathing ? 1.15 : 0.82;
    }
  }

  private updateNovaWeapon(
    session: GameSession,
    wState: WeaponRuntimeState,
    def: WeaponDefinition,
    dt: number,
    sound: SoundEngine | null
  ): void {
    if (wState.echoPending) {
      wState.echoTimer -= dt;
      if (wState.echoTimer <= 0) {
        wState.echoPending = false;
        const echoRange = def.range * wState.rangeMult * 1.28;
        const echoDmg = def.baseDamage * wState.damageMult * session.player.damageMult * 0.85;
        this.triggerNovaPulse(session, def, echoRange, echoDmg, true, sound);
      }
    }

    wState.cooldownTimer -= dt * session.player.attackSpeedMult;
    if (wState.cooldownTimer > 0) return;
    wState.cooldownTimer = def.cooldownSec * wState.cooldownMult;

    const range = def.range * wState.rangeMult;
    const damage = def.baseDamage * wState.damageMult * session.player.damageMult;
    this.triggerNovaPulse(session, def, range, damage, false, sound);

    if (wState.mechanisms.has('echoWave')) {
      wState.echoPending = true;
      wState.echoTimer = 0.35;
    }
  }

  private triggerNovaPulse(
    session: GameSession,
    def: WeaponDefinition,
    range: number,
    damage: number,
    isEcho: boolean,
    sound: SoundEngine | null
  ): void {
    const p = session.player;
    const candidates = this.aoeQueryScratch;
    session.enemyGrid.queryCircleCandidates(p.x, p.z, range + 1.5, candidates, 64);

    const slowFactor = Number(def.params?.slowFactor ?? 0.6);
    const slowDur = Number(def.params?.slowDurationSec ?? 1.2);
    const rangeSq = range * range;

    for (let i = 0; i < candidates.length; i += 1) {
      const e = session.enemies.getRaw(candidates[i]);
      if (!e.active || e.hp <= 0) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const dSq = dx * dx + dz * dz;
      const effR = range + e.radius;
      if (dSq <= effR * effR && dSq <= rangeSq + e.radius * range * 2 + e.radius * e.radius) {
        const d = Math.sqrt(dSq) || 1;
        e.slowTimer = Math.max(e.slowTimer, slowDur);
        e.slowFactor = Math.min(e.slowFactor, slowFactor);
        this.statusSys.applyDebuff(e, 'frost-chill');
        this.damageEnemy(
          session,
          e,
          damage,
          (dx / d) * def.knockback,
          (dz / d) * def.knockback,
          sound
        );
      }
    }

    session.spawnShockwave(0, p.x, p.z, 0.5, range, isEcho ? 0xa5f3fc : 0x38bdf8, 0.46, false);
    session.spawnVfxBurst(p.x, 0.65, p.z, isEcho ? 0xe0f2fe : 0x67e8f9, 12);
    if (isEcho) {
      this.echoVisualTimer = 0.34;
      this.echoVisualMaxRange = range;
    } else {
      this.novaVisualTimer = 0.34;
      this.novaVisualMaxRange = range;
    }
    sound?.playNova();
  }

  private updateChainWeapon(
    session: GameSession,
    wState: WeaponRuntimeState,
    def: WeaponDefinition,
    dt: number,
    sound: SoundEngine | null
  ): void {
    const p = session.player;
    wState.cooldownTimer -= dt * p.attackSpeedMult;
    if (wState.cooldownTimer > 0) return;

    const range = def.range * wState.rangeMult;
    const chainRadius = Number(def.params?.chainRadius ?? 5.2) * wState.rangeMult;
    const first = this.findDensestEnemyClusterCenter(session, p.x, p.z, range, chainRadius);
    if (!first) {
      wState.cooldownTimer = 0.08;
      return;
    }

    wState.cooldownTimer = def.cooldownSec * wState.cooldownMult;

    const maxJumps = Math.min(32, Math.max(1, def.count + wState.bonusCount));
    const chainRadSq = chainRadius * chainRadius;
    const baseDmg = def.baseDamage * wState.damageMult * p.damageMult;
    const applyOverload = wState.mechanisms.has('overloadShock');
    const candidates = this.aoeQueryScratch;

    let visitedCount = 0;
    let cur: EnemyEntity | null = first;
    let prevX = p.x;
    let prevZ = p.z;

    for (let j = 0; j < maxJumps && cur; j += 1) {
      const tx = cur.x;
      const tz = cur.z;
      this.chainVisitedSlots[visitedCount] = cur.slotIndex;
      this.chainVisitedGens[visitedCount] = cur.generation;
      visitedCount += 1;

      session.spawnBeam(
        'lightning',
        prevX,
        0.95,
        prevZ,
        tx,
        0.95,
        tz,
        applyOverload ? 0.54 : 0.42,
        applyOverload ? 0xa5f3fc : 0x60a5fa,
        0.22
      );
      if (j === 0 || j === maxJumps - 1) {
        session.spawnShockwave(2, tx, tz, 0.25, 1.85, 0x7dd3fc, 0.24, false);
      }
      session.spawnVfxBurst(tx, 0.9, tz, def.color, 4);

      if (applyOverload) {
        this.statusSys.applyDebuff(cur, 'shock-static');
      }

      const jumpDmg = baseDmg * Math.max(0.55, 1 - j * 0.06);
      const dx = tx - prevX;
      const dz = tz - prevZ;
      const d = Math.hypot(dx, dz) || 1;
      this.damageEnemy(
        session,
        cur,
        jumpDmg,
        (dx / d) * def.knockback,
        (dz / d) * def.knockback,
        sound
      );

      prevX = tx;
      prevZ = tz;

      if (j + 1 >= maxJumps) break;

      session.enemyGrid.queryCircleCandidates(tx, tz, chainRadius, candidates, 48);
      let next: EnemyEntity | null = null;
      let bestDistSq = chainRadSq;
      for (let c = 0; c < candidates.length; c += 1) {
        const cand = session.enemies.getRaw(candidates[c]);
        if (!cand.active || cand.hp <= 0) continue;

        let alreadyVisited = false;
        for (let v = 0; v < visitedCount; v += 1) {
          if (
            this.chainVisitedSlots[v] === cand.slotIndex &&
            this.chainVisitedGens[v] === cand.generation
          ) {
            alreadyVisited = true;
            break;
          }
        }
        if (alreadyVisited) continue;

        const ndx = cand.x - tx;
        const ndz = cand.z - tz;
        const nDistSq = ndx * ndx + ndz * ndz;
        if (nDistSq < bestDistSq) {
          bestDistSq = nDistSq;
          next = cand;
        }
      }
      cur = next;
    }

    sound?.playShoot('chain');
  }

  private updateSniperWeapon(
    session: GameSession,
    wState: WeaponRuntimeState,
    def: WeaponDefinition,
    dt: number,
    sound: SoundEngine | null
  ): void {
    const p = session.player;
    wState.cooldownTimer -= dt * p.attackSpeedMult;
    if (wState.cooldownTimer > 0) return;

    const range = def.range * wState.rangeMult;
    const target = this.findHighestHpEnemy(session, p.x, p.z, range);
    if (!target) {
      wState.cooldownTimer = 0.08;
      return;
    }

    wState.cooldownTimer = def.cooldownSec * wState.cooldownMult;
    const ang = Math.atan2(target.z - p.z, target.x - p.x);
    const totalDamage = def.baseDamage * wState.damageMult * p.damageMult;
    const totalPierce = def.pierce + wState.bonusPierce;
    const hasBreaker = wState.mechanisms.has('armorBreaker');

    if (hasBreaker) {
      this.statusSys.applyDebuff(target, 'heavy-sunder');
    }

    this.spawnPlayerProjectile(
      session,
      p.x,
      p.z,
      Math.cos(ang) * def.projectileSpeed,
      Math.sin(ang) * def.projectileSpeed,
      def.projectileRadius,
      totalDamage,
      def.knockback,
      def.projectileLifetimeSec,
      totalPierce,
      def.color,
      false,
      false
    );
    const beamEndX = p.x + Math.cos(ang) * Math.max(12, Math.min(22, range));
    const beamEndZ = p.z + Math.sin(ang) * Math.max(12, Math.min(22, range));
    session.spawnBeam(
      'laser',
      p.x + Math.cos(ang) * 0.65,
      1.02,
      p.z + Math.sin(ang) * 0.65,
      beamEndX,
      1.02,
      beamEndZ,
      hasBreaker ? 0.54 : 0.38,
      hasBreaker ? 0xfbbf24 : 0xf43f5e,
      0.26
    );
    session.spawnShockwave(2, target.x, target.z, 0.2, 2.2, 0xfb7185, 0.25, false);
    session.spawnVfxBurst(p.x + Math.cos(ang) * 0.8, 0.9, p.z + Math.sin(ang) * 0.8, def.color, 5);
    sound?.playShoot('sniper');
  }

  private updateNovaVisuals(dt: number, arena: SceneArena | null): void {
    const pv = arena?.playerVisual;
    if (!pv) return;
    const ring = pv.novaRing;
    if (this.novaVisualTimer > 0) {
      this.novaVisualTimer = Math.max(0, this.novaVisualTimer - dt);
      const t = 1 - this.novaVisualTimer / 0.34;
      ring.visible = true;
      ring.scale.setScalar(Math.max(0.2, this.novaVisualMaxRange * t));
      (ring.material as { opacity: number }).opacity = (1 - t) * 0.75;
    } else {
      ring.visible = false;
    }

    const echo = pv.novaEchoRing;
    if (this.echoVisualTimer > 0) {
      this.echoVisualTimer = Math.max(0, this.echoVisualTimer - dt);
      const t = 1 - this.echoVisualTimer / 0.34;
      echo.visible = true;
      echo.scale.setScalar(Math.max(0.2, this.echoVisualMaxRange * t));
      (echo.material as { opacity: number }).opacity = (1 - t) * 0.75;
    } else {
      echo.visible = false;
    }
  }

  private hasProjectileHit(proj: ProjectileEntity, enemy: EnemyEntity): boolean {
    for (let i = 0; i < proj.hitCount; i += 1) {
      if (proj.hitSlots[i] === enemy.slotIndex && proj.hitGens[i] === enemy.generation) {
        return true;
      }
    }
    return false;
  }

  private recordProjectileHit(proj: ProjectileEntity, enemy: EnemyEntity): void {
    if (proj.hitCount < proj.hitSlots.length) {
      proj.hitSlots[proj.hitCount] = enemy.slotIndex;
      proj.hitGens[proj.hitCount] = enemy.generation;
      proj.hitCount += 1;
    }
  }

  private updatePlayerProjectiles(
    session: GameSession,
    dt: number,
    sound: SoundEngine | null
  ): void {
    const candidates = this.projQueryScratch;

    session.playerProjectiles.forEachActive((proj) => {
      proj.remainingLifeSec -= dt;
      if (proj.remainingLifeSec <= 0) {
        session.playerProjectiles.release(proj);
        return;
      }

      proj.prevX = proj.x;
      proj.prevZ = proj.z;
      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;

      // Out of arena bounds
      const maxR = session.level.arenaRadius + 6;
      if (proj.x * proj.x + proj.z * proj.z > maxR * maxR) {
        session.playerProjectiles.release(proj);
        return;
      }

      // Check shootable Bridge Reward Gates (swept segment to prevent high-speed tunneling)
      if (session.level.arenaShape === 'bridge') {
        for (let gIdx = 0; gIdx < 2; gIdx += 1) {
          const gate = session.bridgeGates[gIdx];
          if (!gate.active) continue;
          if (
            segmentIntersectsGate(
              proj.prevX,
              proj.prevZ,
              proj.x,
              proj.z,
              gate.x,
              gate.z,
              gate.halfWidth + proj.radius * 0.5,
              0.75
            )
          ) {
            gate.hp -= proj.damage;
            sound?.playGateHit(gate.corrupted);
            if (gate.gateMode === 'charge') {
              session.spawnVfxBurst(proj.x, 0.9, gate.z, gate.corrupted ? 0xef4444 : 0xfbbf24, 3);
              if (gate.hp <= 0) {
                if (gate.corrupted) {
                  // Purifying a red corrupted gate leaps straight to Tier 2 (double buff!)
                  gate.corrupted = false;
                  gate.chargeTier = 2;
                  gate.hp = gate.maxHp;
                  session.spawnVfxBurst(gate.x, 1.35, gate.z, 0xe879f9, 14);
                  this.enqueueNotice(
                    translateUi(session.language, 'toast.gatePurified', {
                      label: session.language === 'en' ? gate.labelEn || gate.label : gate.label,
                    }),
                    false
                  );
                  sound?.playGatePurify();
                } else if (gate.chargeTier < gate.maxChargeTier) {
                  gate.chargeTier += 1;
                  gate.hp = gate.maxHp;
                  session.spawnVfxBurst(gate.x, 1.3, gate.z, 0xe879f9, 10);
                  sound?.playLevelUp();
                } else {
                  this.claimChargeGate(session, gate, sound);
                }
              }
            } else {
              session.spawnVfxBurst(proj.x, 0.9, gate.z, 0x38bdf8, 3);
              if (gate.hp <= 0) {
                const localizedLabel = session.language === 'en' ? gate.labelEn || gate.label : gate.label;
                this.applyGateReward(session, gate.buffId, gate.rewardKind, localizedLabel);
                session.bridgeGates[0].active = false;
                session.bridgeGates[1].active = false;
                sound?.playSupply();
              }
            }
            session.playerProjectiles.release(proj);
            return;
          }
        }
      }

      const midX = (proj.prevX + proj.x) * 0.5;
      const midZ = (proj.prevZ + proj.z) * 0.5;
      const sweepRadius = Math.hypot(proj.x - proj.prevX, proj.z - proj.prevZ) * 0.5 + proj.radius + 1.5;

      session.enemyGrid.queryCircleCandidates(midX, midZ, sweepRadius, candidates, 32);

      for (let i = 0; i < candidates.length; i += 1) {
        const e = session.enemies.getRaw(candidates[i]);
        if (!e.active || e.hp <= 0) continue;
        if (this.hasProjectileHit(proj, e)) continue;

        const sumR = proj.radius + e.radius;
        const dSq = distSqPointToSegment(e.x, e.z, proj.prevX, proj.prevZ, proj.x, proj.z);
        if (dSq <= sumR * sumR) {
          this.recordProjectileHit(proj, e);
          const vLen = Math.hypot(proj.vx, proj.vz) || 1;
          this.damageEnemy(
            session,
            e,
            proj.damage,
            (proj.vx / vLen) * proj.knockback,
            (proj.vz / vLen) * proj.knockback,
            sound
          );

          if (proj.splitOnHit && !proj.isSplitChild) {
            const baseAng = Math.atan2(proj.vz, proj.vx);
            const spd = vLen * 0.9;
            for (const delta of [-0.55, 0.55]) {
              const a = baseAng + delta;
              this.spawnPlayerProjectile(
                session,
                proj.x,
                proj.z,
                Math.cos(a) * spd,
                Math.sin(a) * spd,
                proj.radius * 0.72,
                proj.damage * 0.55,
                proj.knockback * 0.4,
                0.55,
                1,
                0xfff3b0,
                false,
                true
              );
            }
            proj.splitOnHit = false;
          }

          proj.pierceLeft -= 1;
          if (proj.pierceLeft <= 0) {
            session.playerProjectiles.release(proj);
            return;
          }
        }
      }
    });
  }

  private updateEnemyProjectiles(
    session: GameSession,
    dt: number,
    sound: SoundEngine | null
  ): void {
    const p = session.player;
    session.enemyProjectiles.forEachActive((proj) => {
      proj.remainingLifeSec -= dt;
      if (proj.remainingLifeSec <= 0) {
        session.enemyProjectiles.release(proj);
        return;
      }

      proj.prevX = proj.x;
      proj.prevZ = proj.z;
      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;

      const sumR = proj.radius + p.colliderRadius;
      const dSq = distSqPointToSegment(p.x, p.z, proj.prevX, proj.prevZ, proj.x, proj.z);
      if (dSq <= sumR * sumR) {
        this.damagePlayer(session, proj.damage, sound);
        session.enemyProjectiles.release(proj);
      }
    });
  }

  public damageEnemy(
    session: GameSession,
    enemy: EnemyEntity,
    amount: number,
    kbX: number,
    kbZ: number,
    sound: SoundEngine | null,
    skipMods = false
  ): void {
    if (!enemy.active || enemy.hp <= 0) return;

    const p = session.player;
    let finalDmg = amount * enemy.debuffDmgTakenMult;
    let isCrit = false;

    if (enemy.armorReduction > 0) {
      const isArmorBroken =
        enemy.debuffTimers[IDX_ARMOR_SHRED] > 0 ||
        enemy.debuffTimers[IDX_HEAVY_SUNDER] > 0 ||
        enemy.debuffTimers[IDX_SHOCK_STATIC] > 0;
      if (!isArmorBroken) {
        finalDmg *= Math.max(0.2, 1 - enemy.armorReduction);
      } else if (enemy.isBoss) {
        // Boss retains residual armor even when sundered/shocked
        finalDmg *= Math.max(0.2, 1 - Math.max(0.12, enemy.armorReduction * 0.5));
      }
    }

    if (!skipMods) {
      const effCrit = Math.min(0.9, p.critChance + enemy.debuffCritBonus);
      if (effCrit > 0 && session.rng.next() < effCrit) {
        isCrit = true;
        finalDmg *= p.critDamageMult;
      }
      for (let i = 0; i < p.imbuedDebuffs.length; i += 1) {
        this.statusSys.applyDebuff(enemy, p.imbuedDebuffs[i]);
      }
    }

    if (enemy.isBoss) {
      if (enemy.bossShieldTimer > 0) {
        finalDmg *= 0.25;
      }
      finalDmg = Math.min(finalDmg, enemy.maxHp * 0.08);
    }

    enemy.hp -= finalDmg;
    enemy.hitFlashTimer = 0.09;
    session.spawnDamagePopup(
      enemy.x,
      1.15 * enemy.scale,
      enemy.z,
      finalDmg,
      isCrit || enemy.isBoss || enemy.isElite,
      false
    );

    const kbResist = enemy.isBoss ? 0.08 : enemy.isElite ? 0.35 : 1.0;
    enemy.kbVx = Math.max(
      -RUNTIME_CONFIG.maxKnockbackImpulse,
      Math.min(RUNTIME_CONFIG.maxKnockbackImpulse, enemy.kbVx + kbX * kbResist)
    );
    enemy.kbVz = Math.max(
      -RUNTIME_CONFIG.maxKnockbackImpulse,
      Math.min(RUNTIME_CONFIG.maxKnockbackImpulse, enemy.kbVz + kbZ * kbResist)
    );

    sound?.playHit();

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      this.handleEnemyDeath(session, enemy, sound);
    }
  }

  private handleEnemyDeath(
    session: GameSession,
    enemy: EnemyEntity,
    sound: SoundEngine | null
  ): void {
    if (!enemy.active) return;

    const p = session.player;
    p.kills += 1;
    session.combo += 1;
    const newComboTier = UpgradeSystem.computeComboTier(session.combo);
    if (newComboTier !== session.comboTier) {
      this.upgSys.recalculateStats(session);
      if (newComboTier >= 2) {
        sound?.playComboFever(newComboTier);
        this.enqueueNotice(
          translateUi(session.language, newComboTier === 3 ? 'toast.comboLv3' : 'toast.comboLv2'),
          false
        );
      }
    }
    if (session.combo > 0 && session.combo % 100 === 0 && this.deathEffectDepth === 0) {
      session.drops.forEachActive((drop) => {
        drop.magnetized = true;
      });
      this.deathEffectDepth += 1;
      session.enemyGrid.queryCircleCandidates(p.x, p.z, 9.5, this.deathAoEScratch, 40);
      const pulseDmg = 45 * p.damageMult;
      const pulseRadSq = 9.5 * 9.5;
      for (let i = 0; i < this.deathAoEScratch.length; i += 1) {
        const target = session.enemies.getRaw(this.deathAoEScratch[i]);
        if (!target.active || target.hp <= 0) continue;
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        if (dx * dx + dz * dz > pulseRadSq) continue;
        this.damageEnemy(session, target, pulseDmg, 0, 0, sound, true);
      }
      this.deathEffectDepth -= 1;
      session.spawnShockwave(1, p.x, p.z, 0.8, 9.8, 0xfde047, 0.54, true);
      session.spawnVfxBurst(p.x, 1.0, p.z, 0xfde047, 18);
      this.enqueueNotice(
        translateUi(session.language, 'toast.centuryBlast', { combo: session.combo }),
        true
      );
    }
    p.furyCharge = Math.min(100, p.furyCharge + (enemy.isElite ? 15 : 4) * p.furyGainMult);
    if (p.lifeOnKill > 0 && p.hp > 0) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.lifeOnKill);
    }
    if (enemy.isBoss && enemy.slotIndex === session.bossSlot && enemy.generation === session.bossGen) {
      session.bossKilled = true;
    }

    // In Bridge lanes, kills directly grant equipment & gear buffs straight onto the hero (no ground chests).
    // In Survival arenas, killing elites directly equips a relic onto the hero!
    if (
      session.level.arenaShape === 'bridge' &&
      (enemy.isElite || p.kills % 6 === 0)
    ) {
      this.grantDirectBridgeGear(session);
    } else if (session.level.arenaShape !== 'bridge' && enemy.isElite && !enemy.isBoss) {
      this.grantNextRelic(session, translateUi(session.language, 'toast.eliteRelicPrefix'));
    }

    const ex = enemy.x;
    const ez = enemy.z;
    const eMaxHp = enemy.maxHp;
    const hasHolyBrand = enemy.debuffTimers[IDX_HOLY_BRAND] > 0;
    const hasPlagueSpread = enemy.debuffTimers[IDX_PLAGUE_SPREAD] > 0;

    session.spawnVfxBurst(ex, 0.6, ez, enemy.baseColor, enemy.isBoss ? 18 : 5);
    this.spawnXpDrop(session, ex, ez, enemy.xpValue, enemy.isElite || enemy.isBoss);
    session.enemies.release(enemy);

    if ((hasHolyBrand || hasPlagueSpread) && this.deathEffectDepth === 0) {
      this.deathEffectDepth += 1;
      session.enemyGrid.queryCircleCandidates(ex, ez, 4.2, this.deathAoEScratch, 24);
      if (hasHolyBrand) {
        const blastDmg = Math.max(24, eMaxHp * 0.28);
        const blastRadSq = 3.5 * 3.5;
        session.spawnShockwave(2, ex, ez, 0.3, 3.8, 0xfef08a, 0.34, false);
        session.spawnVfxBurst(ex, 0.85, ez, 0xfef08a, 8);
        for (let i = 0; i < this.deathAoEScratch.length; i += 1) {
          const target = session.enemies.getRaw(this.deathAoEScratch[i]);
          if (!target.active || target.hp <= 0) continue;
          const dx = target.x - ex;
          const dz = target.z - ez;
          if (dx * dx + dz * dz <= blastRadSq) {
            this.damageEnemy(session, target, blastDmg, 0, 0, sound, true);
          }
        }
      }
      if (hasPlagueSpread) {
        let spreadCount = 0;
        const spreadRadSq = 4.2 * 4.2;
        session.spawnVfxBurst(ex, 0.75, ez, 0x4ade80, 6);
        for (let i = 0; i < this.deathAoEScratch.length && spreadCount < 3; i += 1) {
          const target = session.enemies.getRaw(this.deathAoEScratch[i]);
          if (!target.active || target.hp <= 0) continue;
          const dx = target.x - ex;
          const dz = target.z - ez;
          if (dx * dx + dz * dz > spreadRadSq) continue;
          this.statusSys.applyDebuff(target, 'plague-spread');
          this.statusSys.applyDebuff(target, 'venom-poison');
          spreadCount += 1;
        }
      }
      this.deathEffectDepth -= 1;
    }
  }

  public grantNextRelic(session: GameSession, prefixLabel?: string): boolean {
    const p = session.player;
    const prefix = prefixLabel ?? translateUi(session.language, 'toast.relicPrefix');
    const allEq = session.registries.equipment.list();
    let unownedCount = 0;
    for (let i = 0; i < allEq.length; i += 1) {
      if (!p.equippedRelics.includes(allEq[i].id)) unownedCount += 1;
    }
    if (unownedCount > 0) {
      let pickIdx = session.rng.int(0, unownedCount);
      for (let i = 0; i < allEq.length; i += 1) {
        const eq = allEq[i];
        if (p.equippedRelics.includes(eq.id)) continue;
        if (pickIdx === 0) {
          this.upgSys.equipItemById(session, eq.id);
          session.spawnVfxBurst(p.x, 1.05, p.z, 0xffd166, 10);
          const eqName = session.language === 'en' ? eq.nameEn : eq.name;
          const eqDesc = session.language === 'en' ? eq.descriptionEn : eq.description;
          const notice =
            session.language === 'en'
              ? `${prefix}: ${eqName} (${eqDesc})`
              : `${prefix}：${eqName}（${eqDesc}）`;
          this.enqueueNotice(notice, true);
          return true;
        }
        pickIdx -= 1;
      }
    }

    p.supplyDamageBonus += 0.15;
    this.upgSys.recalculateStats(session);
    session.spawnVfxBurst(p.x, 1.05, p.z, 0xffd166, 8);
    this.enqueueNotice(translateUi(session.language, 'toast.relicResonance'), true);
    return false;
  }

  private grantDirectBridgeGear(session: GameSession): void {
    const p = session.player;
    p.hp = Math.min(p.maxHp, p.hp + 15);
    session.spawnVfxBurst(p.x, 1.0, p.z, 0xffd166, 10);

    // Interleave weapon unlocks and equipment relics onto the hero
    if (
      p.weapons.length < session.level.weaponSlotCount &&
      p.equippedRelics.length >= p.weapons.length
    ) {
      const allowed = session.level.allowedWeaponIds;
      for (let i = 0; i < allowed.length; i += 1) {
        const wid = allowed[i];
        if (!p.weapons.some((w) => w.weaponId === wid)) {
          p.weapons.push(session.createWeaponState(wid));
          this.upgSys.recalculateStats(session);
          const wDef = session.registries.weapons.get(wid);
          const wName = translateContent(session.language, wid, 'name', wDef ? wDef.name : wid);
          this.enqueueNotice(
            translateUi(session.language, 'toast.weaponGained', { name: wName }),
            true
          );
          return;
        }
      }
    }

    this.grantNextRelic(session, translateUi(session.language, 'toast.relicPrefix'));
  }

  public claimChargeGate(
    session: GameSession,
    gate: BridgeGateState,
    sound: SoundEngine | null
  ): void {
    const p = session.player;
    if (gate.corrupted) {
      session.bridgeGates[0].active = false;
      session.bridgeGates[1].active = false;
      this.damagePlayer(session, 12, sound);
      this.enqueueNotice(translateUi(session.language, 'toast.gateCorruptedHit'), false);
      return;
    }

    const stacks = Math.max(1, gate.chargeTier);
    session.spawnVfxBurst(p.x, 1.15, p.z, 0xe879f9, 14);
    for (let i = 0; i < stacks; i += 1) {
      if (!gate.buffId || !this.upgSys.grantBuffById(session, gate.buffId)) {
        p.supplyDamageBonus += 0.15;
        this.upgSys.recalculateStats(session);
      }
    }
    session.bridgeGates[0].active = false;
    session.bridgeGates[1].active = false;
    const gateLabel = session.language === 'en' ? gate.labelEn || gate.label : gate.label;
    this.enqueueNotice(
      translateUi(session.language, 'toast.gateCharged', { lv: stacks, label: gateLabel }),
      false
    );
    sound?.playSupply();
  }

  private applyGateReward(
    session: GameSession,
    buffId: string,
    _kind: string,
    label: string
  ): void {
    const p = session.player;
    session.spawnVfxBurst(p.x, 1.1, p.z, 0xfbbf24, 12);
    if (!buffId || !this.upgSys.grantBuffById(session, buffId)) {
      p.supplyDamageBonus += 0.2;
      this.upgSys.recalculateStats(session);
    }
    this.enqueueNotice(translateUi(session.language, 'toast.gateBreak', { label }), false);
  }

  private spawnXpDrop(
    session: GameSession,
    x: number,
    z: number,
    xpValue: number,
    isBig: boolean
  ): void {
    const drop = session.drops.acquire();
    if (drop) {
      drop.x = x;
      drop.z = z;
      drop.xpValue = xpValue;
      drop.magnetized = false;
      drop.color = isBig ? 0xfbbf24 : 0x38bdf8;
      return;
    }

    // Pool full fallback: prefer an unmagnetized drop first, otherwise merge into any active drop
    let merged = false;
    session.drops.forEachActive((existing) => {
      if (merged || existing.magnetized) return;
      existing.xpValue += xpValue;
      existing.color = 0xfbbf24;
      merged = true;
    });
    if (!merged) {
      session.drops.forEachActive((existing) => {
        if (merged) return;
        existing.xpValue += xpValue;
        existing.color = 0xfbbf24;
        merged = true;
      });
    }
  }

  public damagePlayer(session: GameSession, amount: number, sound: SoundEngine | null): void {
    const p = session.player;
    if (session.godMode || p.hp <= 0 || p.invulnTimer > 0) return;

    let rem = amount;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, rem);
      p.shield -= absorbed;
      rem -= absorbed;
    }
    if (rem > 0) {
      p.hp = Math.max(0, p.hp - rem);
      this.resetCombo(session);
    }
    p.invulnTimer = RUNTIME_CONFIG.playerInvulnSec;
    p.hitFlashTimer = 0.16;
    this.pendingCameraShake = Math.max(this.pendingCameraShake, 0.18);
    session.spawnVfxBurst(p.x, 0.7, p.z, rem > 0 ? 0xff4757 : 0x60a5fa, 6);
    sound?.playPlayerHurt();
  }

  private updateVfx(session: GameSession, dt: number): void {
    session.vfx.forEachActive((v) => {
      v.lifeSec -= dt;
      if (v.lifeSec <= 0) {
        session.vfx.release(v);
        return;
      }
      v.x += v.vx * dt;
      v.y = Math.max(0.05, v.y + v.vy * dt);
      v.z += v.vz * dt;
      v.vy -= 9.5 * dt;
    });

    session.beams.forEachActive((b) => {
      b.lifeSec -= dt;
      if (b.lifeSec <= 0) {
        session.beams.release(b);
      }
    });

    session.shockwaves.forEachActive((sw) => {
      sw.lifeSec -= dt;
      if (sw.lifeSec <= 0) {
        session.shockwaves.release(sw);
      }
    });

    for (let i = 0; i < session.damagePopups.length; i += 1) {
      const dp = session.damagePopups[i];
      if (!dp.active) continue;
      dp.lifeSec -= dt;
      if (dp.lifeSec <= 0) {
        dp.active = false;
      } else {
        dp.y += dp.vy * dt;
        dp.vy *= Math.exp(-3.5 * dt);
      }
    }
  }
}
