/** Summon range in grid units (feet on a standard dnd5e scene). */
export const SUMMON_RANGE_FEET = 15;

export interface SummonOffset {
  dx: number;
  dy: number;
}

/** How many grid cells fit inside the summon range (Chebyshev, matching dnd5e 5-5-5 diagonals). */
export function maxSummonCells(cellFeet: number): number {
  const step = Number.isFinite(cellFeet) && cellFeet > 0 ? cellFeet : 5;
  return Math.max(1, Math.floor(SUMMON_RANGE_FEET / step));
}

/** Candidate cell offsets around the trainer, nearest ring first, origin excluded. */
export function summonOffsets(maxCells: number): SummonOffset[] {
  const limit = Math.max(1, Math.floor(maxCells));
  const offsets: SummonOffset[] = [];
  for (let dy = -limit; dy <= limit; dy++) {
    for (let dx = -limit; dx <= limit; dx++) {
      if (dx === 0 && dy === 0) continue;
      offsets.push({ dx, dy });
    }
  }
  offsets.sort((a, b) => {
    const ringA = Math.max(Math.abs(a.dx), Math.abs(a.dy));
    const ringB = Math.max(Math.abs(b.dx), Math.abs(b.dy));
    if (ringA !== ringB) return ringA - ringB;
    if (a.dy !== b.dy) return a.dy - b.dy;
    return a.dx - b.dx;
  });
  return offsets;
}
