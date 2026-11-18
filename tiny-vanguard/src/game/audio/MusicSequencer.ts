export type BgmMode = 'menu' | 'survival' | 'defense';

// Precomputed MIDI-to-Hz helper for static note tables (never allocated in hot loops)
function m2f(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 16-step patterns (0 = rest) — spacious phrasing with musical breathing room
// Menu: Warm heroic D-major pentatonic overture
const MENU_BASS = [50, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0, 43, 0, 45, 0].map((n) => (n ? m2f(n) : 0));
const MENU_LEAD = [62, 0, 0, 66, 69, 0, 74, 0, 71, 0, 69, 0, 66, 0, 0, 0].map((n) => (n ? m2f(n) : 0));

// Survival: Wild Frontier D-Dorian adventure groove
const SURV_BASS = [50, 0, 0, 0, 53, 0, 50, 0, 48, 0, 0, 0, 55, 0, 53, 0].map((n) => (n ? m2f(n) : 0));
const SURV_LEAD = [62, 0, 65, 0, 69, 0, 72, 0, 67, 0, 65, 62, 64, 0, 0, 0].map((n) => (n ? m2f(n) : 0));
const SURV_ARP = [74, 0, 0, 77, 0, 0, 81, 0, 72, 0, 0, 76, 0, 0, 79, 0].map((n) => (n ? m2f(n) : 0));

// Defense: Iron Bridge E-minor steady tactical march
const DEF_BASS = [40, 0, 0, 40, 43, 0, 0, 0, 40, 0, 0, 40, 47, 0, 45, 0].map((n) => (n ? m2f(n) : 0));
const DEF_LEAD = [64, 0, 67, 0, 71, 0, 67, 0, 64, 0, 71, 0, 74, 0, 69, 0].map((n) => (n ? m2f(n) : 0));
const DEF_ARP = [76, 0, 0, 79, 0, 0, 83, 0, 76, 0, 0, 83, 0, 0, 79, 0].map((n) => (n ? m2f(n) : 0));

// Boss: Weighty Phrygian Titan Encounter (dramatic, never frantic)
const BOSS_BASS = [38, 0, 39, 0, 38, 0, 41, 0, 38, 0, 39, 0, 45, 0, 41, 0].map((n) => (n ? m2f(n) : 0));
const BOSS_LEAD = [62, 0, 63, 0, 69, 0, 68, 0, 62, 0, 65, 0, 70, 0, 65, 0].map((n) => (n ? m2f(n) : 0));

/**
 * Zero-asset procedural Web Audio BGM sequencer.
 * Adapts theme, tempo, percussion, and harmonic layers to mode (menu / survival / defense),
 * stage progression, Combo Fever tier, and Boss phase with zero hot-loop allocations.
 */
export class MusicSequencer {
  private readonly getContext: () => AudioContext | null;
  private readonly getBus: () => AudioNode | null;
  private readonly getNoiseBuffer: () => AudioBuffer | null;

  private mode: BgmMode = 'menu';
  private stageIndex = 0;
  private comboTier = 0;
  private isBoss = false;
  private paused = false;
  private enabled = true;

  private stepAcc = 0;
  private stepIndex = 0;

  constructor(
    getContext: () => AudioContext | null,
    getBus: () => AudioNode | null,
    getNoiseBuffer: () => AudioBuffer | null
  ) {
    this.getContext = getContext;
    this.getBus = getBus;
    this.getNoiseBuffer = getNoiseBuffer;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stepAcc = 0;
    }
  }

  public setContext(
    mode: BgmMode,
    stageIndex: number,
    comboTier: number,
    isBoss: boolean,
    paused: boolean
  ): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.stepIndex = 0;
      this.stepAcc = 0;
    }
    this.stageIndex = stageIndex;
    this.comboTier = comboTier;
    this.isBoss = isBoss;
    this.paused = paused;
  }

  public reset(): void {
    this.stepAcc = 0;
    this.stepIndex = 0;
  }

  public step(dt: number): void {
    if (!this.enabled || this.paused) return;
    const ctx = this.getContext();
    const bus = this.getBus();
    if (!ctx || !bus || ctx.state !== 'running') return;

    const safeDt = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
    const bpm = this.computeBpm();
    const stepDur = 60 / bpm / 4; // 16th note

    this.stepAcc += safeDt;
    if (this.stepAcc < stepDur) return;

    // Trigger at most 1 step per frame to prevent audio bursts after lag spikes
    this.stepAcc -= stepDur;
    if (this.stepAcc > stepDur) {
      this.stepAcc = 0;
    }

    const idx = this.stepIndex & 15;
    this.stepIndex = (this.stepIndex + 1) & 63;

    const now = ctx.currentTime + 0.015;
    this.triggerStep(ctx, bus, idx, now, stepDur);
  }

  private computeBpm(): number {
    if (this.mode === 'menu') return 82;
    if (this.isBoss) return 114;
    const base = this.mode === 'defense' ? 100 : 94;
    const stageBoost = Math.min(3, Math.max(0, this.stageIndex)) * 3;
    const feverBoost = this.comboTier >= 3 ? 6 : this.comboTier >= 2 ? 3 : 0;
    return base + stageBoost + feverBoost;
  }

  private triggerStep(
    ctx: AudioContext,
    bus: AudioNode,
    idx: number,
    now: number,
    stepDur: number
  ): void {
    if (this.mode === 'menu') {
      const bass = MENU_BASS[idx];
      if (bass > 0) this.playSynthNote(ctx, bus, bass, 'triangle', now, stepDur * 3.4, 0.085);
      const lead = MENU_LEAD[idx];
      if (lead > 0) this.playSynthNote(ctx, bus, lead, 'sine', now, stepDur * 2.1, 0.05);
      return;
    }

    if (this.isBoss) {
      const bass = BOSS_BASS[idx];
      if (bass > 0) this.playSynthNote(ctx, bus, bass, 'triangle', now, stepDur * 1.85, 0.11);
      const lead = BOSS_LEAD[idx];
      if (lead > 0) this.playSynthNote(ctx, bus, lead, 'triangle', now, stepDur * 1.7, 0.065);
      if (idx === 0 || idx === 8 || idx === 10) this.playKick(ctx, bus, now, 0.14);
      if (idx === 4 || idx === 12) this.playSnare(ctx, bus, now, 0.065);
      if (idx === 2 || idx === 6 || idx === 14) this.playHiHat(ctx, bus, now, 0.018);
      return;
    }

    if (this.mode === 'defense') {
      const bass = DEF_BASS[idx];
      if (bass > 0) this.playSynthNote(ctx, bus, bass, 'triangle', now, stepDur * 1.8, 0.095);
      const lead = DEF_LEAD[idx];
      if (lead > 0) this.playSynthNote(ctx, bus, lead, 'triangle', now, stepDur * 1.65, 0.055);
      if (this.stageIndex >= 1 || this.comboTier >= 2) {
        const arp = DEF_ARP[idx];
        if (arp > 0) {
          this.playSynthNote(ctx, bus, arp, 'sine', now, stepDur * 1.25, 0.028);
        }
      }
      if (idx === 0 || idx === 8) this.playKick(ctx, bus, now, 0.11);
      if (idx === 4 || idx === 12) this.playSnare(ctx, bus, now, 0.05);
      if ((idx === 2 || idx === 6 || idx === 10 || idx === 14) && (this.stageIndex >= 1 || this.comboTier >= 2)) {
        this.playHiHat(ctx, bus, now, 0.015);
      }
      return;
    }

    // Survival theme
    const bass = SURV_BASS[idx];
    if (bass > 0) this.playSynthNote(ctx, bus, bass, 'triangle', now, stepDur * 1.9, 0.095);
    const lead = SURV_LEAD[idx];
    if (lead > 0) this.playSynthNote(ctx, bus, lead, 'triangle', now, stepDur * 1.75, 0.055);
    if (this.stageIndex >= 1 || this.comboTier >= 2) {
      const arp = SURV_ARP[idx];
      if (arp > 0) {
        this.playSynthNote(ctx, bus, arp, 'sine', now, stepDur * 1.2, 0.028);
      }
    }
    if (idx === 0 || idx === 8) this.playKick(ctx, bus, now, 0.1);
    if (idx === 4 || idx === 12) {
      if (this.stageIndex >= 1 || this.comboTier >= 1) {
        this.playSnare(ctx, bus, now, 0.042);
      }
    }
    if ((idx === 2 || idx === 6 || idx === 10 || idx === 14) && (this.stageIndex >= 2 || this.comboTier >= 2)) {
      this.playHiHat(ctx, bus, now, 0.015);
    }
  }

  private playSynthNote(
    ctx: AudioContext,
    bus: AudioNode,
    freq: number,
    type: OscillatorType,
    now: number,
    dur: number,
    gainVal: number
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gainVal, now + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(g);
    g.connect(bus);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private playKick(ctx: AudioContext, bus: AudioNode, now: number, gainVal: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);

    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc.connect(g);
    g.connect(bus);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.12);
  }

  private playSnare(ctx: AudioContext, bus: AudioNode, now: number, gainVal: number): void {
    const buf = this.getNoiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1900, now);
    filter.Q.setValueAtTime(1.2, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    src.start(now);
    src.stop(now + 0.1);
  }

  private playHiHat(ctx: AudioContext, bus: AudioNode, now: number, gainVal: number): void {
    const buf = this.getNoiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6800, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    src.start(now);
    src.stop(now + 0.045);
  }
}
