import type { LevelDefinition } from '../content/definitions/ContentTypes';
import type { GameRuntime } from '../core/GameRuntime';

export type DebugTelemetry = ReturnType<GameRuntime['getDebugTelemetry']>;

export interface F9DoublePressDetector {
  /**
   * Records an F9 press at timestamp `nowMs`.
   * Returns `true` when pressed twice within `windowMs` (default 3000ms),
   * and immediately resets the sequence so a 3rd press starts a fresh window.
   */
  recordPress(nowMs: number): boolean;
  reset(): void;
}

/**
 * Pure, testable double-F9 detector (QA trigger: 2× F9 within 3s).
 */
export function createF9DoublePressDetector(windowMs = 3000): F9DoublePressDetector {
  let lastPressMs = -Infinity;
  return {
    recordPress(nowMs: number): boolean {
      if (nowMs >= lastPressMs && nowMs - lastPressMs <= windowMs) {
        lastPressMs = -Infinity;
        return true;
      }
      lastPressMs = nowMs;
      return false;
    },
    reset(): void {
      lastPressMs = -Infinity;
    },
  };
}

export function hasDebugUrlFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1' || params.get('qa') === '1';
  } catch {
    return false;
  }
}

/**
 * Clean facade bridging DebugPanel.vue to GameRuntime without hardcoding any level IDs.
 */
export class DebugBridge {
  private readonly runtime: GameRuntime;

  constructor(runtime: GameRuntime) {
    this.runtime = runtime;
  }

  public getAllLevels(): readonly LevelDefinition[] {
    return this.runtime.registries.levels.list();
  }

  public getTelemetry(): DebugTelemetry {
    return this.runtime.getDebugTelemetry();
  }

  public toggleGodMode(): boolean {
    const next = !this.runtime.getDebugTelemetry().godMode;
    this.runtime.setDebugGodMode(next);
    return next;
  }

  public setTimeScale(scale: 1 | 2 | 4): void {
    this.runtime.setDebugTimeScale(scale);
  }

  public jumpLevel(levelId: string): boolean {
    return this.runtime.debugJumpLevel(levelId);
  }

  public levelUpNow(): boolean {
    return this.runtime.debugLevelUpNow();
  }

  public unlockAllWeapons(): number {
    return this.runtime.debugUnlockAllWeapons();
  }

  public grantRelic(all = false): number {
    return this.runtime.debugGrantRelic(all);
  }

  public setCombo(combo: number): void {
    this.runtime.debugSetCombo(combo);
  }

  public fillFury(): void {
    this.runtime.debugFillFury();
  }

  public triggerFormation(): number {
    return this.runtime.debugTriggerFormation();
  }

  public spawnBridgeGates(corrupted: boolean): boolean {
    return this.runtime.debugSpawnBridgeGates(corrupted);
  }

  public jumpToBoss(): boolean {
    return this.runtime.debugJumpToBoss();
  }

  public clearNormalEnemies(): number {
    return this.runtime.debugClearNormalEnemies();
  }

  public instantClear(): boolean {
    return this.runtime.debugInstantClear();
  }

  public testAudioCue(kind: 'boss' | 'purify' | 'fever'): void {
    this.runtime.sound.unlock();
    if (kind === 'boss') {
      this.runtime.sound.playBossWarning();
    } else if (kind === 'purify') {
      this.runtime.sound.playGatePurify();
    } else {
      this.runtime.sound.playComboFever(3);
    }
  }
}
