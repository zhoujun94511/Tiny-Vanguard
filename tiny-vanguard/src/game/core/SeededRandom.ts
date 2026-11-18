/**
 * Mulberry32 deterministic PRNG for per-session wave/spawn/upgrade rolls.
 * Note: Reproducible within the same JS engine for a given seed and call sequence;
 * cross-browser floating-point physics determinism is not claimed.
 */
export class SeededRandom {
  private state: number;

  constructor(seed = 0x51a7f00d) {
    this.state = seed >>> 0 || 1;
  }

  public reseed(seed: number): void {
    this.state = seed >>> 0 || 1;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  public int(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }
}
