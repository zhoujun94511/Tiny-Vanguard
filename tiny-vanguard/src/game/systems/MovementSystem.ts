import type { SoundEngine } from '../audio/SoundEngine';
import type { InputController, MoveVector2D } from '../input/InputController';
import type { GameSession } from '../session/GameSession';

const DASH_COOLDOWN_SEC = 2.4;
const DASH_DURATION_SEC = 0.16;
const DASH_SPEED = 20.0;

export class MovementSystem {
  private readonly moveScratch: MoveVector2D = { x: 0, y: 0 };

  public static readonly DASH_COOLDOWN = DASH_COOLDOWN_SEC;

  public updatePlayer(
    session: GameSession,
    input: InputController,
    dt: number,
    sound: SoundEngine | null = null
  ): void {
    const p = session.player;
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.hitFlashTimer > 0) p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (p.guardCooldown > 0) p.guardCooldown = Math.max(0, p.guardCooldown - dt);
    if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);

    const vec = input.getMoveVector(this.moveScratch);
    const magSq = vec.x * vec.x + vec.y * vec.y;

    if (p.dashCooldown <= 0 && input.consumeDash()) {
      p.dashCooldown = DASH_COOLDOWN_SEC * p.dashCooldownMult;
      p.dashTimer = DASH_DURATION_SEC;
      p.invulnTimer = Math.max(p.invulnTimer, 0.22);
      if (magSq > 0.0004) {
        const mag = Math.sqrt(magSq);
        p.dashDirX = vec.x / mag;
        p.dashDirZ = vec.y / mag;
      } else if (session.level.arenaShape === 'bridge') {
        p.dashDirX = 0;
        p.dashDirZ = -1;
      } else {
        p.dashDirX = Math.sin(p.facingRad);
        p.dashDirZ = Math.cos(p.facingRad);
      }
      session.spawnShockwave(2, p.x, p.z, 0.3, 2.3, 0x38bdf8, 0.28, false);
      session.spawnBeam(
        'dash-trail',
        p.x,
        0.72,
        p.z,
        p.x + p.dashDirX * 3.5,
        0.72,
        p.z + p.dashDirZ * 3.5,
        0.88,
        0x38bdf8,
        0.26
      );
      session.spawnVfxBurst(p.x, 0.5, p.z, 0x38bdf8, 10);
      sound?.playDash();
    }

    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      p.x += p.dashDirX * DASH_SPEED * dt;
      p.z += p.dashDirZ * DASH_SPEED * dt;
      p.isMoving = true;
    } else if (magSq > 0.0004) {
      const spd = p.baseSpeed * p.moveSpeedMult;
      p.x += vec.x * spd * dt;
      p.z += vec.y * spd * dt;
      p.facingRad =
        session.level.arenaShape === 'bridge' ? Math.PI : Math.atan2(vec.x, vec.y);
      p.isMoving = true;
    } else {
      if (session.level.arenaShape === 'bridge') {
        p.facingRad = Math.PI;
      }
      p.isMoving = false;
    }

    // Resolve obstacle collisions
    for (const obs of session.level.obstacles) {
      const dx = p.x - obs.x;
      const dz = p.z - obs.z;
      const minDist = obs.radius + p.colliderRadius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = minDist - dist;
          p.x += (dx / dist) * push;
          p.z += (dz / dist) * push;
        } else {
          p.x += minDist;
        }
      }
    }

    // Clamp to arena bounds (bridge defense lane vs open circle)
    if (session.level.arenaShape === 'bridge' && session.level.bridgeConfig) {
      const b = session.level.bridgeConfig;
      const maxX = Math.max(1, b.halfWidth - p.colliderRadius - 0.38);
      p.x = Math.max(-maxX, Math.min(maxX, p.x));
      p.z = Math.max(b.defenseLineZ - 4.8, Math.min(b.defenseLineZ - 0.85, p.z));
    } else {
      const maxR = Math.max(2, session.level.arenaRadius - p.colliderRadius);
      const rSq = p.x * p.x + p.z * p.z;
      if (rSq > maxR * maxR) {
        const r = Math.sqrt(rSq);
        p.x = (p.x / r) * maxR;
        p.z = (p.z / r) * maxR;
      }
    }
  }
}
