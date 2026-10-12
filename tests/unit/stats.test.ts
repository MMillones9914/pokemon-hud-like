import { describe, it, expect } from "vitest";
import { hpColor, clampedPct, typeColor, readCoreStats } from "../../src/modules/core/stats";

describe("hpColor", () => {
  it("returns hp-high above 50%", () => {
    expect(hpColor(0.6)).toBe("hp-high");
    expect(hpColor(1)).toBe("hp-high");
  });
  it("returns hp-mid between 25% and 50%", () => {
    expect(hpColor(0.5)).toBe("hp-mid");
    expect(hpColor(0.3)).toBe("hp-mid");
  });
  it("returns hp-low at or below 25%", () => {
    expect(hpColor(0.25)).toBe("hp-low");
    expect(hpColor(0)).toBe("hp-low");
    expect(hpColor(-0.1)).toBe("hp-low");
  });
});

describe("clampedPct", () => {
  it("returns 0 when max is 0", () => {
    expect(clampedPct(0, 0)).toBe(0);
    expect(clampedPct(5, 0)).toBe(0);
  });
  it("returns 0 when max is negative", () => {
    expect(clampedPct(5, -10)).toBe(0);
  });
  it("clamps to [0,1]", () => {
    expect(clampedPct(20, 10)).toBe(1);
    expect(clampedPct(-5, 10)).toBe(0);
  });
  it("handles NaN", () => {
    expect(clampedPct(NaN, 10)).toBe(0);
    expect(clampedPct(5, NaN)).toBe(0);
    expect(clampedPct(Infinity, Infinity)).toBe(0);
  });
  it("computes normal ratio", () => {
    expect(clampedPct(3, 10)).toBeCloseTo(0.3);
  });
});

describe("typeColor", () => {
  it("returns a hex color for known types", () => {
    expect(typeColor("fire")).toMatch(/^#[0-9A-F]{6}$/i);
    expect(typeColor("water")).toMatch(/^#[0-9A-F]{6}$/i);
  });
  it("falls back for unknown type", () => {
    expect(typeColor("mystery")).toBe("#68A090");
    expect(typeColor("")).toBe("#68A090");
  });
  it("is case-insensitive", () => {
    expect(typeColor("FIRE")).toBe(typeColor("fire"));
  });
});

describe("readCoreStats", () => {
  it("reads hp, xp, level, type from a standard system object", () => {
    const system = {
      attributes: { hp: { value: 20, max: 30 }, xp: { value: 50, max: 100 }, type: "fire" },
      details: { level: 5 }
    };
    const s = readCoreStats(system);
    expect(s.level).toBe(5);
    expect(s.hp.current).toBe(20);
    expect(s.hp.max).toBe(30);
    expect(s.hp.color).toBe("hp-high");
    expect(s.xp.pct).toBeCloseTo(0.5);
    expect(s.type).toBe("fire");
  });
  it("returns sane defaults for empty system", () => {
    const s = readCoreStats(null);
    expect(s.level).toBe(1);
    expect(s.hp.current).toBe(0);
    expect(s.hp.max).toBe(1);
    expect(s.hp.pct).toBe(0);
    expect(s.type).toBe("normal");
  });
  it("handles missing nested objects", () => {
    const s = readCoreStats({});
    expect(s.level).toBe(1);
    expect(s.hp.max).toBe(1);
  });
});
