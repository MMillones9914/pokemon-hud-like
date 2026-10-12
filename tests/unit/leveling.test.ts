import { describe, expect, it } from "vitest";
import {
  MAX_LEVEL,
  XP_TABLE,
  canLevelUp,
  xpMaxForLevel,
  xpNextMax,
  xpProgress
} from "../../src/modules/core/leveling";

describe("XP_TABLE", () => {
  it("exposes the expected cumulative thresholds for levels 1-20", () => {
    expect(XP_TABLE).toHaveLength(MAX_LEVEL);
    expect(XP_TABLE).toEqual([
      0, 200, 800, 2000, 6000, 12000, 20000, 30000, 44000, 62000, 82000, 104000, 128000, 158000,
      194000, 234000, 278000, 326000, 382000, 450000
    ]);
  });

  it("escalates monotonically", () => {
    for (let i = 1; i < XP_TABLE.length; i++) {
      expect(XP_TABLE[i]).toBeGreaterThan(XP_TABLE[i - 1]);
    }
  });
});

describe("xpMaxForLevel", () => {
  it("returns the cumulative XP required for each level", () => {
    expect(xpMaxForLevel(1)).toBe(0);
    expect(xpMaxForLevel(4)).toBe(2000);
    expect(xpMaxForLevel(20)).toBe(450000);
  });

  it("clamps out-of-range levels to the safe bounds", () => {
    expect(xpMaxForLevel(-3)).toBe(0);
    expect(xpMaxForLevel(0)).toBe(0);
    expect(xpMaxForLevel(99)).toBe(450000);
  });
});

describe("xpNextMax", () => {
  it("returns the cumulative XP required for the next level", () => {
    expect(xpNextMax(1)).toBe(200);
    expect(xpNextMax(19)).toBe(450000);
  });

  it("returns undefined for the max level", () => {
    expect(xpNextMax(20)).toBeUndefined();
    expect(xpNextMax(99)).toBeUndefined();
  });
});

describe("xpProgress", () => {
  it("shows XP earned inside the level and its bar percentage", () => {
    expect(xpProgress(100, 1)).toEqual({ current: 100, max: 200, pct: 0.5 });
    expect(xpProgress(200, 1)).toEqual({ current: 200, max: 200, pct: 1 });
  });

  it("drops the previous level's XP once leveled up", () => {
    expect(xpProgress(6000, 4)).toEqual({ current: 4000, max: 4000, pct: 1 });
  });

  it("splits XP within a deep level", () => {
    const p = xpProgress(1200, 3);
    expect(p.max).toBe(1200);
    expect(p.pct).toBeCloseTo(1 / 3, 5);
  });

  it("fills the bar at the max level once its threshold is reached", () => {
    expect(xpProgress(450000, 20)).toEqual({ current: 450000, max: 450000, pct: 1 });
  });

  it("is empty below the current level threshold", () => {
    expect(xpProgress(500, 3)).toEqual({ current: 0, max: 1200, pct: 0 });
  });

  it("clamps negative XP to zero", () => {
    expect(xpProgress(-50, 2)).toEqual({ current: 0, max: 600, pct: 0 });
  });
});

describe("canLevelUp", () => {
  it("allows leveling when XP reaches the next threshold", () => {
    expect(canLevelUp(5999, 4)).toBe(false);
    expect(canLevelUp(6000, 4)).toBe(true);
    expect(canLevelUp(450000, 19)).toBe(true);
  });

  it("blocks leveling at the max level", () => {
    expect(canLevelUp(999999, 20)).toBe(false);
  });

  it("never levels below level 1", () => {
    expect(canLevelUp(0, 0)).toBe(false);
    expect(canLevelUp(200, 1)).toBe(true);
  });
});
