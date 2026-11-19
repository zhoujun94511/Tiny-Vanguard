export interface MoveVector2D {
  x: number;
  y: number;
}

const INPUT_BUFFER_SEC = 0.16;

export class InputController {
  private readonly keysDown = new Set<string>();
  private joystickX = 0;
  private joystickY = 0;
  private dashBufferSec = 0;
  private furyBufferSec = 0;
  private guardBufferSec = 0;
  private attackBufferSec = 0;
  private enabled = false;
  private disposed = false;

  private readonly keyDownHandler = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const code = e.code;
    if (code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.dashBufferSec = INPUT_BUFFER_SEC;
      return;
    }
    if (code === 'KeyE') {
      if (!e.repeat) this.guardBufferSec = INPUT_BUFFER_SEC;
      return;
    }
    if (code === 'KeyQ') {
      if (!e.repeat) this.furyBufferSec = INPUT_BUFFER_SEC;
      return;
    }
    if (code === 'KeyJ') {
      if (!e.repeat) this.attackBufferSec = INPUT_BUFFER_SEC;
      return;
    }
    if (code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD') {
      this.keysDown.add(code);
      return;
    }
    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      e.preventDefault();
      this.keysDown.add(code);
    }
  };

  private readonly keyUpHandler = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
  };

  private readonly blurHandler = () => {
    this.clearAll();
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keyDownHandler);
      window.addEventListener('keyup', this.keyUpHandler);
      window.addEventListener('blur', this.blurHandler);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearAll();
    }
  }

  public setJoystickVector(x: number, y: number): void {
    if (!this.enabled) {
      this.joystickX = 0;
      this.joystickY = 0;
      return;
    }
    const lenSq = x * x + y * y;
    if (lenSq > 1) {
      const inv = 1 / Math.sqrt(lenSq);
      this.joystickX = x * inv;
      this.joystickY = y * inv;
    } else {
      this.joystickX = x;
      this.joystickY = y;
    }
  }

  public clearAll(): void {
    this.keysDown.clear();
    this.joystickX = 0;
    this.joystickY = 0;
    this.dashBufferSec = 0;
    this.furyBufferSec = 0;
    this.guardBufferSec = 0;
    this.attackBufferSec = 0;
  }

  public queueDash(): void {
    if (this.enabled) this.dashBufferSec = INPUT_BUFFER_SEC;
  }

  public queueFury(): void {
    if (this.enabled) this.furyBufferSec = INPUT_BUFFER_SEC;
  }

  public queueGuard(): void {
    if (this.enabled) this.guardBufferSec = INPUT_BUFFER_SEC;
  }

  public queueAttack(): void {
    if (this.enabled) this.attackBufferSec = INPUT_BUFFER_SEC;
  }

  public hasBufferedDash(): boolean {
    return this.dashBufferSec > 0;
  }

  public hasBufferedFury(): boolean {
    return this.furyBufferSec > 0;
  }

  public hasBufferedGuard(): boolean {
    return this.guardBufferSec > 0;
  }

  public consumeDash(): boolean {
    if (this.dashBufferSec <= 0) return false;
    this.dashBufferSec = 0;
    return true;
  }

  public consumeFury(): boolean {
    if (this.furyBufferSec <= 0) return false;
    this.furyBufferSec = 0;
    return true;
  }

  public consumeGuard(): boolean {
    if (this.guardBufferSec <= 0) return false;
    this.guardBufferSec = 0;
    return true;
  }

  public consumeAttack(): boolean {
    if (this.attackBufferSec <= 0) return false;
    this.attackBufferSec = 0;
    return true;
  }

  public tickBuffers(dt: number): void {
    if (this.dashBufferSec > 0) this.dashBufferSec = Math.max(0, this.dashBufferSec - dt);
    if (this.furyBufferSec > 0) this.furyBufferSec = Math.max(0, this.furyBufferSec - dt);
    if (this.guardBufferSec > 0) this.guardBufferSec = Math.max(0, this.guardBufferSec - dt);
    if (this.attackBufferSec > 0) this.attackBufferSec = Math.max(0, this.attackBufferSec - dt);
  }

  /**
   * Returns a 2D input vector with length <= 1.
   * Joystick takes priority when active (> 0.05), otherwise normalized WASD axes.
   */
  public getMoveVector(out: MoveVector2D): MoveVector2D {
    if (!this.enabled) {
      out.x = 0;
      out.y = 0;
      return out;
    }

    const jLenSq = this.joystickX * this.joystickX + this.joystickY * this.joystickY;
    if (jLenSq > 0.0025) {
      out.x = this.joystickX;
      out.y = this.joystickY;
      return out;
    }

    let kx = 0;
    let ky = 0;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) kx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) kx += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) ky -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) ky += 1;

    if (kx !== 0 && ky !== 0) {
      const invSqrt2 = 0.70710678;
      kx *= invSqrt2;
      ky *= invSqrt2;
    }
    out.x = kx;
    out.y = ky;
    return out;
  }

  public static isCoarsePointer(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  }

  public static detectTouchCapable(): boolean {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const maxTouch = navigator.maxTouchPoints ?? 0;
    return coarse || maxTouch > 0 || 'ontouchstart' in window;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearAll();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyDownHandler);
      window.removeEventListener('keyup', this.keyUpHandler);
      window.removeEventListener('blur', this.blurHandler);
    }
  }
}
