import type { SoundEngine } from '../audio/SoundEngine';
import { translateUi } from '../i18n/i18n';
import type { GameSession } from '../session/GameSession';
import type { CombatSystem } from './CombatSystem';
import { UpgradeSystem } from './UpgradeSystem';

export type TerminalOutcome =
  | { terminal: false; toastText?: string }
  | { terminal: true; victory: boolean; reason: string };

export class LevelProgressionSystem {
  private readonly upgSys = new UpgradeSystem();
  private readonly nonTerminalScratch: { terminal: false; toastText?: string } = {
    terminal: false,
    toastText: undefined,
  };

  public update(
    session: GameSession,
    dt: number,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): Readonly<TerminalOutcome> {
    session.elapsedSec += dt;

    // Same-frame terminal priority: player death checked before supply heals can revive
    if (session.player.hp <= 0) {
      return {
        terminal: true,
        victory: false,
        reason: '生命值归零，防线失守',
      };
    }

    // Update supply crate events (paused automatically when simulation is paused)
    const toastText = this.updateSupplyEvent(session, dt, combat, sound);
    this.updateBridgeGates(session, dt, combat, sound);
    this.updateBridgeBarrel(session, dt);
    this.updateHazardZone(session, dt, combat, sound);
    this.updateBridgeMeteor(session, dt, combat, sound);

    if (session.player.hp <= 0) {
      return {
        terminal: true,
        victory: false,
        reason: '生命值归零，防线失守',
      };
    }

    if (!session.endlessMode && session.level.victoryObjective.behaviorId === 'objective-defeat-boss') {
      if (session.bossSpawned && session.bossKilled) {
        return {
          terminal: true,
          victory: true,
          reason: `成功击败 ${session.level.bossStage.label}`,
        };
      }
    }

    let endlessToast: string | undefined;
    if (session.endlessMode && session.bossSpawned && session.bossKilled) {
      session.bossSpawned = false;
      session.bossKilled = false;
      session.endlessBossKills += 1;
      const dm = session.player.directModifiers;
      dm.damageBonus += 0.14;
      dm.critDamageBonus += 0.1;
      dm.maxHpBonus += 15;
      dm.attackSpeedBonus += 0.04;
      this.upgSys.recalculateStats(session);
      const healAmt = session.player.maxHp * 0.25;
      session.player.hp = Math.min(session.player.maxHp, session.player.hp + healAmt);
      session.spawnDamagePopup(session.player.x, 1.4, session.player.z, healAmt, true, true);
      sound?.playSupply();
      endlessToast = translateUi(session.language, 'toast.endlessBossBounty', {
        count: session.endlessBossKills,
      });
    }

    this.nonTerminalScratch.toastText = endlessToast ?? toastText;
    return this.nonTerminalScratch;
  }

  private updateSupplyEvent(
    session: GameSession,
    dt: number,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): string | undefined {
    const cfg = session.level.supplyEvents;
    if (!cfg.enabled) return undefined;

    const s = session.supply;
    if (s.active) {
      s.remainingSec -= dt;
      if (s.remainingSec <= 0) {
        s.active = false;
        return undefined;
      }

      const p = session.player;
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const collectR = p.colliderRadius + 1.15;
      if (dx * dx + dz * dz <= collectR * collectR) {
        s.active = false;
        const healAmt = p.maxHp * s.healRatio;
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        session.spawnDamagePopup(p.x, 1.4, p.z, healAmt, true, true);
        // Meadow Supply Crate also triggers an XP Vacuum Surge across the arena
        session.drops.forEachActive((drop) => {
          drop.magnetized = true;
        });
        let msg = `+${Math.round(healAmt)} HP`;
        if (session.level.arenaShape === 'bridge') {
          if (!p.weapons.some((w) => w.weaponId === 'orbit-shields')) {
            p.weapons.push(session.createWeaponState('orbit-shields'));
            msg = translateUi(session.language, 'toast.supplyOrbit');
          } else {
            if (p.directModifiers.bonusStarBlasterCount < 3) {
              p.directModifiers.bonusStarBlasterCount += 1;
              msg = translateUi(session.language, 'toast.supplyBlaster');
            } else {
              p.supplyDamageBonus += 0.25;
              msg = translateUi(session.language, 'toast.supplyDamage');
            }
          }
          this.upgSys.recalculateStats(session);
        }
        this.triggerSupplyShockwave(session, s.x, s.z, s.shockwaveRadius, s.shockwaveDamage, combat, sound);
        session.spawnShockwave(2, s.x, s.z, 0.6, s.shockwaveRadius, 0x5eead4, 0.55, true);
        if (session.level.arenaShape !== 'bridge') {
          combat.grantNextRelic(session, translateUi(session.language, 'toast.supplyRelicPrefix'));
        }
        session.spawnVfxBurst(s.x, 0.8, s.z, 0x80ffdb, 16);
        sound?.playSupply();
        return msg;
      }
      return undefined;
    }

    session.supplySpawnTimer -= dt;
    if (session.supplySpawnTimer <= 0) {
      session.supplySpawnTimer = cfg.intervalSec;
      this.spawnSupplyCrate(session);
    }
    return undefined;
  }

  private estimatePlayerDps(session: GameSession): number {
    const p = session.player;
    const basePerWeapon = 30;
    const weaponFactor = 1 + Math.max(0, p.weapons.length - 1) * 0.45;
    const sb = p.weapons.find((w) => w.weaponId === 'star-blaster');
    const boltFactor = 1 + (sb ? sb.bonusCount * 0.35 : 0);
    return Math.max(24, basePerWeapon * p.damageMult * p.attackSpeedMult * weaponFactor * boltFactor);
  }

  private updateBridgeGates(
    session: GameSession,
    dt: number,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): void {
    if (session.level.arenaShape !== 'bridge' || !session.level.bridgeConfig) return;
    const b = session.level.bridgeConfig;
    const g0 = session.bridgeGates[0];
    const g1 = session.bridgeGates[1];

    // Clear any residual gates while a Boss is active so projectiles/aim stay unobstructed
    if (session.bossSpawned && !session.bossKilled) {
      if (g0.active) g0.active = false;
      if (g1.active) g1.active = false;
      return;
    }

    if (g0.active || g1.active) {
      const driftSpeed = 2.1;
      const p = session.player;
      const isMovingGates = Boolean(session.level.movingGates);
      for (let idx = 0; idx < 2; idx += 1) {
        const g = session.bridgeGates[idx];
        if (!g.active) continue;
        g.z += driftSpeed * dt;
        if (isMovingGates) {
          const baseX = idx === 0 ? -2.2 : 2.2;
          g.x = baseX + Math.sin(session.elapsedSec * 1.45 + idx * Math.PI) * 0.85;
        }

        // Both gates use walk-through 1-of-2 claim when drifting into hero defense line
        if (
          Math.abs(p.z - g.z) <= 1.0 &&
          Math.abs(p.x - g.x) <= g.halfWidth + 0.55
        ) {
          combat.claimChargeGate(session, g, sound);
          break;
        }

        if (g.z >= b.defenseLineZ - 0.5) {
          g.active = false;
        }
      }
      return;
    }

    // Stop spawning new gates inside the final pre-Boss drift window (~14s) in normal runs
    if (!session.endlessMode && session.elapsedSec >= session.level.bossStage.triggerSec - 14) {
      return;
    }

    session.bridgeGateTimer -= dt;
    if (session.bridgeGateTimer <= 0) {
      session.bridgeGateTimer = 18;
      this.spawnBridgeGatesPair(session);
    }
  }

  private updateBridgeBarrel(session: GameSession, dt: number): void {
    if (!session.level.bridgeBarrels || session.level.arenaShape !== 'bridge' || !session.level.bridgeConfig) {
      return;
    }
    const bar = session.bridgeBarrel;
    if (bar.active) {
      bar.z += 1.85 * dt;
      if (bar.z >= session.level.bridgeConfig.defenseLineZ - 0.8) {
        bar.active = false;
      }
      return;
    }
    session.bridgeBarrelTimer -= dt;
    if (session.bridgeBarrelTimer <= 0) {
      session.bridgeBarrelTimer = 14;
      const b = session.level.bridgeConfig;
      bar.active = true;
      bar.x = session.rng.range(-b.halfWidth + 1.4, b.halfWidth - 1.4);
      bar.z = b.minZ + 11.5;
      bar.maxHp = Math.max(35, Math.round(this.estimatePlayerDps(session) * 0.75));
      bar.hp = bar.maxHp;
    }
  }

  private updateHazardZone(
    session: GameSession,
    dt: number,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): void {
    if (!session.level.hazardZones || session.level.arenaShape === 'bridge') return;
    const hz = session.hazardZone;
    if (hz.active) {
      if (hz.telegraphSec > 0) {
        hz.telegraphSec = Math.max(0, hz.telegraphSec - dt);
        return;
      }
      hz.remainingSec -= dt;
      if (hz.remainingSec <= 0) {
        hz.active = false;
        return;
      }
      hz.tickTimer -= dt;
      if (hz.tickTimer <= 0) {
        hz.tickTimer = 0.5;
        const p = session.player;
        const dx = p.x - hz.x;
        const dz = p.z - hz.z;
        if (dx * dx + dz * dz <= hz.radius * hz.radius) {
          const hzDmg = Math.max(5, Math.round(p.maxHp * 0.04));
          combat.damagePlayer(session, hzDmg, sound);
        }
      }
      return;
    }

    session.hazardSpawnTimer -= dt;
    if (session.hazardSpawnTimer <= 0) {
      session.hazardSpawnTimer = 24;
      const p = session.player;
      const ang = session.rng.range(0, Math.PI * 2);
      const dist = session.rng.range(1.2, 4.2);
      const maxR = Math.max(4, session.level.arenaRadius - 5);
      hz.active = true;
      hz.x = Math.max(-maxR, Math.min(maxR, p.x + Math.cos(ang) * dist));
      hz.z = Math.max(-maxR, Math.min(maxR, p.z + Math.sin(ang) * dist));
      hz.radius = 4.2;
      hz.telegraphSec = 1.8;
      hz.remainingSec = 9.0;
      hz.tickTimer = 0.2;
      combat.enqueueNotice(translateUi(session.language, 'toast.hazardWarn'), false);
    }
  }

  private updateBridgeMeteor(
    session: GameSession,
    dt: number,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): void {
    if (!session.level.bridgeMeteors || !session.bossSpawned || session.bossKilled || !session.level.bridgeConfig) {
      return;
    }
    const met = session.bridgeMeteor;
    const b = session.level.bridgeConfig;
    if (met.active) {
      met.z += 2.6 * dt;
      if (met.z >= b.defenseLineZ - 0.6) {
        met.active = false;
        session.spawnShockwave(1, met.x, met.z, 0.5, 5.5, 0xef4444, 0.4, true);
        session.spawnVfxBurst(met.x, 1.0, met.z, 0xef4444, 18);
        const metDmg = Math.max(22, Math.round(session.player.maxHp * 0.18));
        combat.damagePlayer(session, metDmg, sound);
        sound?.playExplosion();
        combat.enqueueNotice(translateUi(session.language, 'toast.meteorImpact'), false);
      }
      return;
    }

    session.bridgeMeteorTimer -= dt;
    if (session.bridgeMeteorTimer <= 0) {
      session.bridgeMeteorTimer = 9;
      met.active = true;
      met.x = session.rng.range(-b.halfWidth + 1.4, b.halfWidth - 1.4);
      met.z = b.minZ + 11.0;
      met.maxHp = Math.max(45, Math.round(this.estimatePlayerDps(session) * 0.95));
      met.hp = met.maxHp;
    }
  }

  public spawnBridgeGatesPair(session: GameSession, forceCorrupted?: boolean): boolean {
    if (session.level.arenaShape !== 'bridge' || !session.level.bridgeConfig) return false;
    const b = session.level.bridgeConfig;
    const g0 = session.bridgeGates[0];
    const g1 = session.bridgeGates[1];
    const estDps = this.estimatePlayerDps(session);
    const buffs = session.registries.buffs.list();
    const idx0 = buffs.length > 0 ? session.rng.int(0, buffs.length) : -1;
    const idx1 =
      buffs.length > 1
        ? (idx0 + 1 + session.rng.int(0, buffs.length - 1)) % buffs.length
        : idx0;
    const b0 = idx0 >= 0 ? buffs[idx0] : null;
    const b1 = idx1 >= 0 ? buffs[idx1] : null;
    const chargeStepHp = Math.max(32, Math.min(1100, Math.round(estDps * 1.45)));

    const spawnZ =
      session.bossSpawned && !session.bossKilled ? b.minZ + 11.2 : b.minZ + 9.8;

    g0.active = true;
    g0.x = -2.45;
    g0.z = spawnZ;
    g0.hp = chargeStepHp;
    g0.maxHp = chargeStepHp;
    g0.gateMode = 'charge';
    g0.gateEffect = 'buff';
    g0.corrupted = false;
    g0.chargeTier = 1;
    g0.maxChargeTier = 3;
    g0.buffId = b0 ? b0.id : 'buff-dmg-25';
    g0.rewardKind = b0 ? b0.id : 'buff-dmg-25';
    g0.label = b0 ? b0.shortLabel : '+25% 伤害';
    g0.labelEn = b0 ? b0.shortLabelEn : '+25% DMG';

    if (forceCorrupted === undefined && session.elapsedSec >= 20) {
      const specialRoll = session.rng.next();
      if (specialRoll < 0.28) {
        g0.gateEffect = 'summon-drones';
        g0.buffId = '';
        g0.rewardKind = 'summon-drones';
        g0.label = '护卫浮游炮';
        g0.labelEn = 'Guard Drones';
      } else if (specialRoll < 0.5) {
        g0.gateEffect = 'blast-wave';
        g0.buffId = '';
        g0.rewardKind = 'blast-wave';
        g0.label = '爆破清场波';
        g0.labelEn = 'Blast Wave';
      }
    }

    const spawnCorrupted =
      forceCorrupted !== undefined
        ? forceCorrupted
        : session.elapsedSec >= 35 && session.rng.next() < 0.55;
    const g1Hp = spawnCorrupted ? Math.max(30, Math.round(chargeStepHp * 0.9)) : chargeStepHp;
    g1.active = true;
    g1.x = 2.45;
    g1.z = spawnZ;
    g1.hp = g1Hp;
    g1.maxHp = g1Hp;
    g1.gateMode = 'charge';
    g1.gateEffect = 'buff';
    g1.corrupted = spawnCorrupted;
    g1.chargeTier = spawnCorrupted ? 0 : 1;
    g1.maxChargeTier = 3;
    g1.buffId = b1 ? b1.id : 'buff-rate-20';
    g1.rewardKind = b1 ? b1.id : 'buff-rate-20';
    g1.label = b1 ? b1.shortLabel : '+20% 攻速';
    g1.labelEn = b1 ? b1.shortLabelEn : '+20% SPD';
    return true;
  }

  private triggerSupplyShockwave(
    session: GameSession,
    x: number,
    z: number,
    radius: number,
    damage: number,
    combat: CombatSystem,
    sound: SoundEngine | null
  ): void {
    const rSq = radius * radius;
    session.enemies.forEachActive((e) => {
      if (e.isBoss) return;
      const dx = e.x - x;
      const dz = e.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= rSq) {
        const d = Math.sqrt(dSq) || 1;
        combat.damageEnemy(session, e, damage, (dx / d) * 8, (dz / d) * 8, sound);
      }
    });
  }

  private spawnSupplyCrate(session: GameSession): void {
    const cfg = session.level.supplyEvents;
    if (session.level.arenaShape === 'bridge' && session.level.bridgeConfig) {
      const b = session.level.bridgeConfig;
      session.supply.active = true;
      session.supply.x = session.rng.range(-b.halfWidth + 1.4, b.halfWidth - 1.4);
      session.supply.z = session.rng.range(b.defenseLineZ - 4.6, b.defenseLineZ - 1.4);
      session.supply.totalSec = cfg.durationSec;
      session.supply.remainingSec = cfg.durationSec;
      session.supply.healRatio = cfg.healRatio;
      session.supply.shockwaveRadius = cfg.shockwaveRadius;
      session.supply.shockwaveDamage = cfg.shockwaveDamage;
      return;
    }

    const p = session.player;
    const arenaLimit = session.level.arenaRadius - 2.5;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const ang = session.rng.range(0, Math.PI * 2);
      const dist = session.rng.range(cfg.minSpawnDist, cfg.maxSpawnDist);
      let x = p.x + Math.cos(ang) * dist;
      let z = p.z + Math.sin(ang) * dist;

      const rSq = x * x + z * z;
      if (rSq > arenaLimit * arenaLimit) {
        const r = Math.sqrt(rSq);
        x = (x / r) * arenaLimit;
        z = (z / r) * arenaLimit;
      }

      let blocked = false;
      for (const obs of session.level.obstacles) {
        const dx = x - obs.x;
        const dz = z - obs.z;
        if (dx * dx + dz * dz < (obs.radius + 1.4) ** 2) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        session.supply.active = true;
        session.supply.x = x;
        session.supply.z = z;
        session.supply.totalSec = cfg.durationSec;
        session.supply.remainingSec = cfg.durationSec;
        session.supply.healRatio = cfg.healRatio;
        session.supply.shockwaveRadius = cfg.shockwaveRadius;
        session.supply.shockwaveDamage = cfg.shockwaveDamage;
        return;
      }
    }
  }
}
