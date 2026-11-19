import type { SoundEngine } from '../audio/SoundEngine';
import type { GameSession } from '../session/GameSession';

export class ExperienceSystem {
  public update(session: GameSession, dt: number, sound: SoundEngine | null): void {
    const p = session.player;
    const pickupSq = p.pickupRadius * p.pickupRadius;
    const collectSq = (p.colliderRadius + 0.55) ** 2;

    const isBridge = session.level.arenaShape === 'bridge';
    session.drops.forEachActive((drop) => {
      const dx = p.x - drop.x;
      const dz = p.z - drop.z;
      const dSq = dx * dx + dz * dz;

      if (isBridge || dSq <= pickupSq) {
        drop.magnetized = true;
      }

      if (drop.magnetized) {
        const d = Math.sqrt(dSq) || 0.0001;
        const pullSpeed = 14.5;
        drop.x += (dx / d) * pullSpeed * dt;
        drop.z += (dz / d) * pullSpeed * dt;

        const ndx = p.x - drop.x;
        const ndz = p.z - drop.z;
        if (ndx * ndx + ndz * ndz <= collectSq) {
          this.grantXp(session, drop.xpValue, sound);
          session.drops.release(drop);
        }
      } else if (dSq <= collectSq) {
        this.grantXp(session, drop.xpValue, sound);
        session.drops.release(drop);
      }
    });
  }

  public grantXp(session: GameSession, amount: number, sound: SoundEngine | null): void {
    const p = session.player;
    const xpGain = session.hasHyperHorde ? Math.max(1, Math.round(amount * 1.2)) : amount;
    p.xp += xpGain;
    sound?.playXp(session.combo);

    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level += 1;
      session.pendingLevelUps += 1;
      p.xpToNext = session.computeXpToNext(p.level);
    }
  }
}
