import type { GameStateId, PauseReason } from './GameTypes';

export class GameStateMachine {
  private _state: GameStateId = 'menu';
  private _pauseReasons = new Set<PauseReason>();

  public get state(): GameStateId {
    return this._state;
  }

  public get pauseReasons(): ReadonlySet<PauseReason> {
    return this._pauseReasons;
  }

  public isTerminal(): boolean {
    return this._state === 'victory' || this._state === 'game-over';
  }

  public isSimulating(): boolean {
    return this._state === 'playing' && this._pauseReasons.size === 0;
  }

  public setState(next: GameStateId): boolean {
    if (this._state === next) return false;
    // Terminal states cannot transition directly to playing or level-up without reset
    if (this.isTerminal() && (next === 'playing' || next === 'level-up' || next === 'paused')) {
      return false;
    }
    this._state = next;
    if (next === 'menu' || next === 'loading' || this.isTerminal()) {
      this._pauseReasons.clear();
    }
    return true;
  }

  public addPauseReason(reason: PauseReason): boolean {
    if (this.isTerminal() || this._state === 'menu' || this._state === 'loading' || this._state === 'error') {
      return false;
    }
    this._pauseReasons.add(reason);
    if (reason === 'level-up') {
      this._state = 'level-up';
    } else if (this._state === 'playing') {
      this._state = 'paused';
    }
    return true;
  }

  public removePauseReason(reason: PauseReason): boolean {
    if (!this._pauseReasons.has(reason)) return false;
    this._pauseReasons.delete(reason);
    if (this.isTerminal() || this._state === 'menu' || this._state === 'loading' || this._state === 'error') {
      return false;
    }
    if (this._pauseReasons.size === 0) {
      this._state = 'playing';
      return true;
    }
    // If level-up is still pending, stay in level-up; otherwise paused
    this._state = this._pauseReasons.has('level-up') ? 'level-up' : 'paused';
    return false;
  }

  public resetToMenu(): void {
    this._pauseReasons.clear();
    this._state = 'menu';
  }
}
