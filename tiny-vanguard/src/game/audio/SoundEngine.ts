import { MusicSequencer, type BgmMode } from './MusicSequencer';

export type ShootSfxKind = 'blaster' | 'chain' | 'sniper' | 'axe' | 'missile';

const XP_SCALE_HZ = [440, 493.88, 554.37, 659.25, 739.99, 880];

/**
 * Componentized procedural Web Audio engine:
 * - Dedicated masterGain / bgmGain / sfxGain bus architecture
 * - Shared reusable noise buffer for percussion, frost, dash & impacts
 * - Dynamic mode- & pace-aware procedural BGM via MusicSequencer
 * - Zero external audio assets (100% single-HTML offline compliant)
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmFilter: BiquadFilterNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private sfxEnabled = true;
  private bgmEnabled = true;
  private ducked = false;

  private lastHitMs = 0;
  private lastShootMs = 0;
  private lastXpMs = 0;
  private lastGateMs = 0;
  private xpStep = 0;

  private readonly sequencer: MusicSequencer;

  constructor() {
    this.sequencer = new MusicSequencer(
      () => this.ctx,
      () => this.bgmFilter ?? this.bgmGain,
      () => this.ensureNoiseBuffer()
    );
  }

  public setEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
    this.syncBusGains();
  }

  public isEnabled(): boolean {
    return this.sfxEnabled;
  }

  public setBgmEnabled(enabled: boolean): void {
    this.bgmEnabled = enabled;
    this.sequencer.setEnabled(enabled);
    this.syncBusGains();
  }

  public isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  public setPausedDucking(ducked: boolean): void {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    this.syncBusGains();
  }

  public unlock(fromUserGesture = false): void {
    if (!this.sfxEnabled && !this.bgmEnabled) return;
    if (
      typeof navigator !== 'undefined' &&
      'userActivation' in navigator &&
      navigator.userActivation &&
      !navigator.userActivation.hasBeenActive
    ) {
      return;
    }
    if (!fromUserGesture && !this.ctx) {
      return;
    }
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    this.syncBusGains();
  }

  public suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  public updateBgm(
    dt: number,
    mode: BgmMode,
    stageIndex: number,
    comboTier: number,
    isBoss: boolean,
    paused: boolean,
    ducked = paused
  ): void {
    this.setPausedDucking(ducked);
    this.sequencer.setContext(mode, stageIndex, comboTier, isBoss, paused);
    this.sequencer.step(dt);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx) return this.ctx;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      const bgm = ctx.createGain();
      const bgmFilter = ctx.createBiquadFilter();
      bgmFilter.type = 'lowpass';
      bgmFilter.frequency.value = 1850;
      const sfx = ctx.createGain();

      bgmFilter.connect(bgm);
      bgm.connect(master);
      sfx.connect(master);

      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 18;
        comp.ratio.value = 6;
        comp.attack.value = 0.005;
        comp.release.value = 0.12;
        master.connect(comp);
        comp.connect(ctx.destination);
        this.compressor = comp;
      } else {
        master.connect(ctx.destination);
      }

      this.ctx = ctx;
      this.masterGain = master;
      this.bgmGain = bgm;
      this.bgmFilter = bgmFilter;
      this.sfxGain = sfx;
      this.syncBusGains();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private ensureNoiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.6));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private syncBusGains(): void {
    if (!this.ctx || !this.masterGain || !this.bgmGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const masterTarget = this.sfxEnabled || this.bgmEnabled ? 0.88 : 0.0001;
    const bgmTarget = this.bgmEnabled ? (this.ducked ? 0.22 : 0.56) : 0.0001;
    const sfxTarget = this.sfxEnabled ? 0.82 : 0.0001;

    this.masterGain.gain.setTargetAtTime(masterTarget, now, 0.03);
    this.bgmGain.gain.setTargetAtTime(bgmTarget, now, 0.04);
    this.sfxGain.gain.setTargetAtTime(sfxTarget, now, 0.02);
  }

  private getReadySfxBus(): { ctx: AudioContext; bus: GainNode } | null {
    if (!this.sfxEnabled) return null;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || ctx.state !== 'running') return null;
    return { ctx, bus: this.sfxGain };
  }

  private playTone(
    freq: number,
    durSec: number,
    type: OscillatorType,
    gainVal: number,
    slideToFreq?: number,
    delaySec = 0
  ): void {
    const ready = this.getReadySfxBus();
    if (!ready) return;
    const { ctx, bus } = ready;
    const now = ctx.currentTime + delaySec;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideToFreq), now + durSec);
    }

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gainVal, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

    osc.connect(g);
    g.connect(bus);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(now);
    osc.stop(now + durSec + 0.02);
  }

  private playFilteredNoise(
    durSec: number,
    gainVal: number,
    filterType: BiquadFilterType,
    startHz: number,
    endHz?: number,
    delaySec = 0
  ): void {
    const ready = this.getReadySfxBus();
    if (!ready) return;
    const buf = this.ensureNoiseBuffer();
    if (!buf) return;
    const { ctx, bus } = ready;
    const now = ctx.currentTime + delaySec;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(startHz, now);
    if (endHz !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, endHz), now + durSec);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    src.start(now);
    src.stop(now + durSec + 0.02);
  }

  public playUiClick(): void {
    this.playTone(620, 0.045, 'triangle', 0.06, 860);
  }

  public playReroll(): void {
    this.playTone(520, 0.06, 'triangle', 0.065, 780, 0);
    this.playTone(780, 0.08, 'sine', 0.06, 1040, 0.05);
  }

  public playExplosion(): void {
    this.playTone(125, 0.28, 'sine', 0.14, 42);
    this.playTone(210, 0.2, 'sawtooth', 0.08, 65);
    this.playFilteredNoise(0.26, 0.11, 'lowpass', 1100, 180);
  }

  public playShoot(kind: ShootSfxKind = 'blaster'): void {
    const nowMs = performance.now();
    const throttle = kind === 'sniper' ? 135 : kind === 'chain' ? 115 : 95;
    if (nowMs - this.lastShootMs < throttle) return;
    this.lastShootMs = nowMs;

    if (kind === 'sniper') {
      this.playTone(760, 0.14, 'triangle', 0.075, 180);
      this.playTone(140, 0.12, 'sine', 0.09, 55);
      this.playFilteredNoise(0.08, 0.05, 'highpass', 2400, 900);
      return;
    }
    if (kind === 'chain') {
      this.playTone(920, 0.07, 'triangle', 0.04, 440);
      this.playFilteredNoise(0.06, 0.04, 'bandpass', 3200, 1400);
      return;
    }
    if (kind === 'axe') {
      this.playTone(320, 0.11, 'triangle', 0.06, 150);
      this.playFilteredNoise(0.09, 0.045, 'bandpass', 1400, 620);
      return;
    }
    if (kind === 'missile') {
      this.playTone(880, 0.09, 'sine', 0.05, 1320);
      this.playFilteredNoise(0.07, 0.035, 'highpass', 2800, 1600);
      return;
    }
    this.playTone(580, 0.055, 'triangle', 0.036, 820);
  }

  public playHit(): void {
    const nowMs = performance.now();
    if (nowMs - this.lastHitMs < 85) return;
    this.lastHitMs = nowMs;
    const jitter = 165 + (nowMs % 30);
    this.playTone(jitter, 0.05, 'triangle', 0.028, 82);
  }

  public playPlayerHurt(): void {
    this.playTone(175, 0.19, 'sawtooth', 0.12, 62);
    this.playFilteredNoise(0.14, 0.09, 'lowpass', 900, 220);
  }

  public playDash(): void {
    this.playFilteredNoise(0.16, 0.085, 'bandpass', 750, 2600);
    this.playTone(340, 0.12, 'sine', 0.065, 760);
  }

  public playNova(): void {
    this.playTone(460, 0.24, 'sine', 0.085, 170);
    this.playTone(920, 0.18, 'triangle', 0.05, 1480);
    this.playFilteredNoise(0.22, 0.065, 'highpass', 2400, 6200);
  }

  public playFury(): void {
    this.playTone(130, 0.34, 'sine', 0.15, 42);
    this.playTone(440, 0.28, 'sawtooth', 0.075, 880);
    this.playTone(659.25, 0.32, 'triangle', 0.075, 1318.5, 0.04);
    this.playFilteredNoise(0.3, 0.11, 'bandpass', 1200, 4800);
  }

  public playGateHit(corrupted = false): void {
    const nowMs = performance.now();
    if (nowMs - this.lastGateMs < 55) return;
    this.lastGateMs = nowMs;
    if (corrupted) {
      this.playTone(290, 0.06, 'sawtooth', 0.055, 220);
    } else {
      this.playTone(840, 0.05, 'sine', 0.048, 1180);
    }
  }

  public playGatePurify(): void {
    this.playTone(523.25, 0.12, 'triangle', 0.085, undefined, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.085, undefined, 0.06);
    this.playTone(783.99, 0.14, 'triangle', 0.09, undefined, 0.12);
    this.playTone(1046.5, 0.24, 'sine', 0.1, undefined, 0.18);
  }

  public playComboFever(tier: number): void {
    const base = tier >= 3 ? 659.25 : 523.25;
    this.playTone(base, 0.12, 'triangle', 0.08, undefined, 0);
    this.playTone(base * 1.25, 0.14, 'triangle', 0.085, undefined, 0.07);
    this.playTone(base * 1.5, 0.24, 'sine', 0.095, undefined, 0.14);
  }

  public playXp(combo = 0): void {
    const nowMs = performance.now();
    if (nowMs - this.lastXpMs < 85) return;
    this.lastXpMs = nowMs;
    const idx = (this.xpStep + (combo > 25 ? 2 : 0)) % XP_SCALE_HZ.length;
    this.xpStep = (this.xpStep + 1) % XP_SCALE_HZ.length;
    const freq = XP_SCALE_HZ[idx];
    this.playTone(freq, 0.065, 'sine', 0.032, freq * 1.12);
  }

  public playLevelUp(): void {
    this.playTone(523.25, 0.12, 'triangle', 0.09, undefined, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.09, undefined, 0.08);
    this.playTone(783.99, 0.18, 'triangle', 0.095, undefined, 0.16);
    this.playTone(1046.5, 0.24, 'sine', 0.08, undefined, 0.24);
  }

  public playSupply(): void {
    this.playTone(587.33, 0.11, 'sine', 0.085, undefined, 0);
    this.playTone(880, 0.16, 'sine', 0.09, undefined, 0.07);
    this.playTone(1174.66, 0.2, 'triangle', 0.075, undefined, 0.14);
  }

  public playBossWarning(): void {
    this.playTone(150, 0.26, 'sawtooth', 0.11, 118, 0);
    this.playTone(150, 0.34, 'sawtooth', 0.12, 92, 0.28);
    this.playFilteredNoise(0.45, 0.08, 'lowpass', 620, 180, 0.05);
  }

  public playVictory(): void {
    this.playTone(523.25, 0.14, 'triangle', 0.095, undefined, 0);
    this.playTone(659.25, 0.14, 'triangle', 0.095, undefined, 0.11);
    this.playTone(783.99, 0.14, 'triangle', 0.095, undefined, 0.22);
    this.playTone(1046.5, 0.36, 'triangle', 0.11, undefined, 0.33);
  }

  public playDefeat(): void {
    this.playTone(320, 0.2, 'sawtooth', 0.09, 240, 0);
    this.playTone(230, 0.36, 'sawtooth', 0.095, 120, 0.2);
  }

  public dispose(): void {
    this.sequencer.reset();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.compressor = null;
      this.masterGain = null;
      this.bgmGain = null;
      this.bgmFilter = null;
      this.sfxGain = null;
      this.noiseBuffer = null;
    }
  }
}
