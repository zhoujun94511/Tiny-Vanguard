/**
 * Fixed-bounds 2D spatial hash grid (XZ plane) using flat typed arrays (linked-list per cell)
 * for zero per-frame allocations and bounded center-outward ring queries.
 */
export class SpatialGrid {
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly halfWidth: number;
  private readonly halfDepth: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;

  constructor(worldHalfExtent: number, cellSize: number, maxEntities: number) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.halfWidth = worldHalfExtent;
    this.halfDepth = worldHalfExtent;
    this.cols = Math.max(1, Math.ceil((worldHalfExtent * 2) / cellSize));
    this.rows = Math.max(1, Math.ceil((worldHalfExtent * 2) / cellSize));
    this.head = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(maxEntities);
    this.clear();
  }

  public clear(): void {
    this.head.fill(-1);
  }

  private clampCol(x: number): number {
    const c = Math.floor((x + this.halfWidth) * this.invCellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private clampRow(z: number): number {
    const r = Math.floor((z + this.halfDepth) * this.invCellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  public insert(slotIndex: number, x: number, z: number): void {
    if (slotIndex < 0 || slotIndex >= this.next.length) return;
    const cell = this.clampRow(z) * this.cols + this.clampCol(x);
    this.next[slotIndex] = this.head[cell];
    this.head[cell] = slotIndex;
  }

  private pushCell(row: number, col: number, outSlots: number[], maxResults: number): boolean {
    let idx = this.head[row * this.cols + col];
    while (idx !== -1) {
      outSlots.push(idx);
      if (outSlots.length >= maxResults) {
        return true;
      }
      idx = this.next[idx];
    }
    return false;
  }

  /**
   * Appends candidate slot indices within the AABB of (x, z, radius) into outSlots,
   * expanding outward in concentric Chebyshev rings from the center cell so nearby
   * threats are NEVER truncated by far-corner crowding (eliminates NW bias).
   */
  public queryCircleCandidates(
    x: number,
    z: number,
    radius: number,
    outSlots: number[],
    maxResults = 48
  ): number {
    outSlots.length = 0;
    const minCol = this.clampCol(x - radius);
    const maxCol = this.clampCol(x + radius);
    const minRow = this.clampRow(z - radius);
    const maxRow = this.clampRow(z + radius);

    const centerCol = this.clampCol(x);
    const centerRow = this.clampRow(z);
    const maxRing = Math.max(
      centerCol - minCol,
      maxCol - centerCol,
      centerRow - minRow,
      maxRow - centerRow
    );

    // Ring 0: center cell first
    if (this.pushCell(centerRow, centerCol, outSlots, maxResults)) {
      return outSlots.length;
    }

    // Concentric Chebyshev rings 1..maxRing
    for (let ring = 1; ring <= maxRing; ring += 1) {
      const top = centerRow - ring;
      const bottom = centerRow + ring;
      const left = centerCol - ring;
      const right = centerCol + ring;

      // Top & bottom horizontal edges of the ring
      const cStart = left < minCol ? minCol : left;
      const cEnd = right > maxCol ? maxCol : right;
      if (top >= minRow) {
        for (let c = cStart; c <= cEnd; c += 1) {
          if (this.pushCell(top, c, outSlots, maxResults)) return outSlots.length;
        }
      }
      if (bottom <= maxRow) {
        for (let c = cStart; c <= cEnd; c += 1) {
          if (this.pushCell(bottom, c, outSlots, maxResults)) return outSlots.length;
        }
      }

      // Left & right vertical edges (excluding corners already scanned)
      const rStart = top + 1 < minRow ? minRow : top + 1;
      const rEnd = bottom - 1 > maxRow ? maxRow : bottom - 1;
      if (left >= minCol) {
        for (let r = rStart; r <= rEnd; r += 1) {
          if (this.pushCell(r, left, outSlots, maxResults)) return outSlots.length;
        }
      }
      if (right <= maxCol) {
        for (let r = rStart; r <= rEnd; r += 1) {
          if (this.pushCell(r, right, outSlots, maxResults)) return outSlots.length;
        }
      }
    }
    return outSlots.length;
  }
}
