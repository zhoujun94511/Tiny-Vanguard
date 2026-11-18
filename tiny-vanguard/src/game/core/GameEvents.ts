import type { GameStateId, HudSnapshot, LevelUpRequest, ResultSnapshot } from './GameTypes';

export interface GameEventMap {
  hud: HudSnapshot;
  stateChange: { state: GameStateId; sessionId: number };
  levelUpRequest: LevelUpRequest;
  result: ResultSnapshot;
  error: { message: string; fatal: boolean };
  toast: { text: string; tone?: 'info' | 'warn' | 'success' };
}

type Listener<T> = (payload: T) => void;

export class GameEventBus {
  private listeners: { [K in keyof GameEventMap]?: Set<Listener<GameEventMap[K]>> } = {};

  public on<K extends keyof GameEventMap>(event: K, listener: Listener<GameEventMap[K]>): () => void {
    let set = this.listeners[event] as Set<Listener<GameEventMap[K]>> | undefined;
    if (!set) {
      set = new Set();
      this.listeners[event] = set as never;
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  public emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.listeners[event] as Set<Listener<GameEventMap[K]>> | undefined;
    if (!set || set.size === 0) return;
    for (const fn of set) {
      fn(payload);
    }
  }

  public clear(): void {
    for (const key of Object.keys(this.listeners) as (keyof GameEventMap)[]) {
      this.listeners[key]?.clear();
    }
  }
}
