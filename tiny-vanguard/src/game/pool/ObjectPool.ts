export interface PoolItem {
  readonly slotIndex: number;
  active: boolean;
  generation: number;
}

/**
 * Fixed-capacity object pool with generation counters, double-release protection,
 * optional reserved slots (e.g. for Boss/objective entities), and allocation-free,
 * re-entrant snapshot iteration (immune to mid-loop spawn/release mutations).
 */
export class ObjectPool<T extends PoolItem> {
  private readonly items: T[];
  private readonly freeNormal: number[];
  private readonly freeReserved: number[];
  private readonly activeIndices: number[];
  private readonly activePosBySlot: Int32Array;
  private readonly normalCapacity: number;
  private readonly totalCapacity: number;

  // Pre-allocated re-entrant snapshot buffers (up to 3 nested forEachActive depths, zero GC)
  private readonly snapSlots: [Int32Array, Int32Array, Int32Array];
  private readonly snapGens: [Int32Array, Int32Array, Int32Array];
  private iterDepth = 0;

  constructor(capacity: number, factory: (slotIndex: number) => T, reservedSlots = 0) {
    if (capacity <= 0) throw new Error(`Pool capacity must be > 0, got ${capacity}`);
    if (reservedSlots < 0 || reservedSlots >= capacity) {
      throw new Error(`Invalid reservedSlots=${reservedSlots} for capacity=${capacity}`);
    }
    this.totalCapacity = capacity;
    this.normalCapacity = capacity - reservedSlots;
    this.items = new Array<T>(capacity);
    this.freeNormal = new Array<number>(this.normalCapacity);
    this.freeReserved = new Array<number>(reservedSlots);
    this.activeIndices = [];
    this.activePosBySlot = new Int32Array(capacity);
    this.activePosBySlot.fill(-1);

    this.snapSlots = [
      new Int32Array(capacity),
      new Int32Array(capacity),
      new Int32Array(capacity),
    ];
    this.snapGens = [
      new Int32Array(capacity),
      new Int32Array(capacity),
      new Int32Array(capacity),
    ];

    for (let i = 0; i < capacity; i += 1) {
      const item = factory(i);
      item.active = false;
      item.generation = 1;
      this.items[i] = item;
      if (i < this.normalCapacity) {
        this.freeNormal[this.normalCapacity - 1 - i] = i;
      } else {
        const rIdx = i - this.normalCapacity;
        this.freeReserved[reservedSlots - 1 - rIdx] = i;
      }
    }
  }

  public get capacity(): number {
    return this.totalCapacity;
  }

  public get normalLimit(): number {
    return this.normalCapacity;
  }

  public get activeCount(): number {
    return this.activeIndices.length;
  }

  public acquire(): T | null {
    const slot = this.freeNormal.pop();
    if (slot === undefined) return null;
    return this.activateSlot(slot);
  }

  /**
   * Acquires from reserved slots first, falling back to normal slots if needed.
   * Ensures critical entities like Bosses can spawn even when normal enemy pool is full.
   */
  public acquireReserved(): T | null {
    let slot = this.freeReserved.pop();
    if (slot === undefined) {
      slot = this.freeNormal.pop();
    }
    if (slot === undefined) return null;
    return this.activateSlot(slot);
  }

  private activateSlot(slot: number): T {
    const item = this.items[slot];
    item.active = true;
    this.activePosBySlot[slot] = this.activeIndices.length;
    this.activeIndices.push(slot);
    return item;
  }

  public release(item: T): boolean {
    const slot = item.slotIndex;
    if (slot < 0 || slot >= this.totalCapacity) return false;
    if (!item.active) return false; // Double-release protection

    item.active = false;
    item.generation = (item.generation + 1) | 0;
    if (item.generation <= 0) item.generation = 1;

    const pos = this.activePosBySlot[slot];
    const lastSlot = this.activeIndices.pop()!;
    if (pos !== this.activeIndices.length) {
      this.activeIndices[pos] = lastSlot;
      this.activePosBySlot[lastSlot] = pos;
    }
    this.activePosBySlot[slot] = -1;

    if (slot < this.normalCapacity) {
      this.freeNormal.push(slot);
    } else {
      this.freeReserved.push(slot);
    }
    return true;
  }

  public getIfValid(slotIndex: number, generation: number): T | null {
    if (slotIndex < 0 || slotIndex >= this.totalCapacity) return null;
    const item = this.items[slotIndex];
    if (!item.active || item.generation !== generation) return null;
    return item;
  }

  public getRaw(slotIndex: number): T {
    return this.items[slotIndex];
  }

  /**
   * Snapshot-safe zero-GC iteration over active items.
   * Immune to callbacks acquiring new items (e.g., split bolts) or releasing
   * arbitrary other items (e.g., AoE chain deaths) during traversal.
   */
  public forEachActive(cb: (item: T) => void): void {
    const count = this.activeIndices.length;
    if (count === 0) return;

    if (this.iterDepth < this.snapSlots.length) {
      const depth = this.iterDepth;
      this.iterDepth += 1;
      const slots = this.snapSlots[depth];
      const gens = this.snapGens[depth];
      for (let i = 0; i < count; i += 1) {
        const s = this.activeIndices[i];
        slots[i] = s;
        gens[i] = this.items[s].generation;
      }
      try {
        for (let i = 0; i < count; i += 1) {
          const item = this.items[slots[i]];
          if (item.active && item.generation === gens[i]) {
            cb(item);
          }
        }
      } finally {
        this.iterDepth -= 1;
      }
      return;
    }

    // Fallback for deeper recursion (>3 nested loops)
    for (let i = this.activeIndices.length - 1; i >= 0; i -= 1) {
      if (i >= this.activeIndices.length) continue;
      const item = this.items[this.activeIndices[i]];
      if (item.active) {
        cb(item);
      }
    }
  }

  public releaseAll(onRelease?: (item: T) => void): void {
    for (let i = this.activeIndices.length - 1; i >= 0; i -= 1) {
      const item = this.items[this.activeIndices[i]];
      if (onRelease) onRelease(item);
      this.release(item);
    }
  }
}
