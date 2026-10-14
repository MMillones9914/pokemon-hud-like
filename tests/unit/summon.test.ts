import { describe, expect, it } from "vitest";
import { SUMMON_RANGE_FEET, maxSummonCells, summonOffsets } from "../../src/modules/core/summon";

describe("maxSummonCells", () => {
  it("fits the range into 5 ft cells", () => {
    expect(SUMMON_RANGE_FEET).toBe(15);
    expect(maxSummonCells(5)).toBe(3);
    expect(maxSummonCells(10)).toBe(1);
  });

  it("falls back to 5 ft for invalid input and never returns 0", () => {
    expect(maxSummonCells(0)).toBe(3);
    expect(maxSummonCells(Number.NaN)).toBe(3);
    expect(maxSummonCells(50)).toBe(1);
  });
});

describe("summonOffsets", () => {
  it("excludes the origin and stays inside the Chebyshev box", () => {
    const offsets = summonOffsets(3);
    expect(offsets.some((o) => o.dx === 0 && o.dy === 0)).toBe(false);
    for (const { dx, dy } of offsets) {
      expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(3);
    }
    expect(offsets).toHaveLength(48);
  });

  it("orders candidates by ring, nearest first", () => {
    const offsets = summonOffsets(3);
    const rings = offsets.map((o) => Math.max(Math.abs(o.dx), Math.abs(o.dy)));
    expect(rings[0]).toBe(1);
    expect(rings[rings.length - 1]).toBe(3);
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i]).toBeGreaterThanOrEqual(rings[i - 1]);
    }
  });
});
