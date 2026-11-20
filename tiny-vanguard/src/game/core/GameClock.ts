import { RUNTIME_CONFIG } from '../config/runtimeConfig';

export interface ClockTickResult {
  /** Wall-clock delta (clamped <= maxFrameDt), always advances even when paused/menu for BGM & FPS */
  wallDt: number;
  /** Simulation delta (0 when not simulating) */
  rawDt: number;
  /** Fixed simulation steps to run this frame */
  steps: number;
  /** Sub-step interpolation factor [0..1] for smooth high-refresh (120Hz/144Hz) rendering */
  alpha: number;
}

export class GameClock {
  private accumulator = 0;
  private lastTimestampMs = 0;
  private initialized = false;
  public simTimeSec = 0;

  public readonly fixedStep: number;
  public readonly maxFrameDt: number;
  public readonly maxSubSteps: number;

  // Reusable scratch object to guarantee zero per-frame allocations
  private readonly tickResult: ClockTickResult = {
    wallDt: 0,
    rawDt: 0,
    steps: 0,
    alpha: 0,
  };

  constructor(
    fixedStep = RUNTIME_CONFIG.fixedStepSec,
    maxFrameDt = RUNTIME_CONFIG.maxFrameDtSec,
    maxSubSteps = RUNTIME_CONFIG.maxSubStepsPerFrame
  ) {
    this.fixedStep = fixedStep;
    this.maxFrameDt = maxFrameDt;
    this.maxSubSteps = maxSubSteps;
  }

  public resetSession(): void {
    this.accumulator = 0;
    this.simTimeSec = 0;
    this.initialized = false;
  }

  public resetTimeBaseline(nowMs = performance.now()): void {
    this.lastTimestampMs = nowMs;
    this.accumulator = 0;
    this.initialized = true;
  }

  /**
   * Advances the clock and returns wallDt + fixed simulation steps.
   * Caps raw delta time and sub-steps to avoid spiral-of-death at low framerates.
   */
  public tick(nowMs: number, isSimulating: boolean): Readonly<ClockTickResult> {
    if (!this.initialized) {
      this.lastTimestampMs = nowMs;
      this.initialized = true;
      this.tickResult.wallDt = 0;
      this.tickResult.rawDt = 0;
      this.tickResult.steps = 0;
      this.tickResult.alpha = 0;
      return this.tickResult;
    }

    const deltaSec = Math.max(0, (nowMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = nowMs;
    const clampedDt = Math.min(deltaSec, this.maxFrameDt);
    this.tickResult.wallDt = clampedDt;

    if (!isSimulating) {
      this.accumulator = 0;
      this.tickResult.rawDt = 0;
      this.tickResult.steps = 0;
      this.tickResult.alpha = 0;
      return this.tickResult;
    }

    this.accumulator += clampedDt;

    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < this.maxSubSteps) {
      this.accumulator -= this.fixedStep;
      this.simTimeSec += this.fixedStep;
      steps += 1;
    }

    // If we hit the catch-up cap, discard excess backlog so simulation doesn't freeze or burst
    if (steps >= this.maxSubSteps && this.accumulator > this.fixedStep) {
      this.accumulator = this.fixedStep * 0.5;
    }

    this.tickResult.rawDt = clampedDt;
    this.tickResult.steps = steps;
    this.tickResult.alpha = Math.max(0, Math.min(1, this.accumulator / this.fixedStep));
    return this.tickResult;
  }
}
