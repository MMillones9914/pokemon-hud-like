import { describe, it, expect } from "vitest";
import type { PowerData } from "../../src/modules/types";
import {
  normalizePower,
  withPowerReplaced,
  withoutIndex,
  isPowerValid,
  listFromFlag,
  clampPpPair
} from "../../src/modules/core/powers";

describe("normalizePower", () => {
  it("fills defaults for a null source", () => {
    const p = normalizePower(null);
    expect(p.name).toBe("");
    expect(p.type).toBe("normal");
    expect(p.pp).toBe(1);
    expect(p.maxPp).toBe(1);
    expect(p.requiresSave).toBe(false);
  });
  it("clamps pp to >=0 and maxPp >= pp", () => {
    const p = normalizePower({ pp: -5, maxPp: 2 });
    expect(p.pp).toBe(0);
    expect(p.maxPp).toBe(2);
  });
  it("normalizes type to lowercase", () => {
    const p = normalizePower({ type: "  FIRE " });
    expect(p.type).toBe("fire");
  });
  it("trims whitespace from name", () => {
    const p = normalizePower({ name: "  Fire Blast  " });
    expect(p.name).toBe("Fire Blast");
  });
  it("defaults empty type to 'normal'", () => {
    const p = normalizePower({ type: "   " });
    expect(p.type).toBe("normal");
  });
  it("coerces string pp to number", () => {
    const p = normalizePower({ pp: "8" as unknown as number });
    expect(p.pp).toBe(8);
  });
  it("handles NaN pp", () => {
    const p = normalizePower({ pp: NaN });
    expect(p.pp).toBe(1);
  });
});

describe("withPowerReplaced", () => {
  it("replaces the entry at index", () => {
    const list = [
      { name: "A", pp: 1, maxPp: 1 } as PowerData,
      { name: "B", pp: 2, maxPp: 2 } as PowerData
    ];
    const next = withPowerReplaced(list, 1, { name: "C" });
    expect(next[1].name).toBe("C");
    expect(next).toHaveLength(2);
  });
  it("returns a copy when index is out of range", () => {
    const list = [{ name: "X", pp: 1, maxPp: 1 }] as PowerData[];
    const next = withPowerReplaced(list, 5, { name: "Y" });
    expect(next[0].name).toBe("X");
  });
  it("does not mutate the original", () => {
    const list = [{ name: "A", pp: 1, maxPp: 1 }] as PowerData[];
    withPowerReplaced(list, 0, { name: "B" });
    expect(list[0].name).toBe("A");
  });
});

describe("withoutIndex", () => {
  it("removes the item at index", () => {
    expect(withoutIndex([1, 2, 3], 1)).toEqual([1, 3]);
  });
  it("returns a copy when index is out of range", () => {
    const a = [1, 2];
    expect(withoutIndex(a, 99)).toEqual([1, 2]);
    expect(withoutIndex(a, -1)).toEqual([1, 2]);
  });
});

describe("isPowerValid", () => {
  it("requires a non-blank name", () => {
    expect(isPowerValid(normalizePower({ name: "Flame Thrower" }))).toBe(true);
    expect(isPowerValid(normalizePower({ name: "" }))).toBe(false);
    expect(isPowerValid(normalizePower({ name: "   " }))).toBe(false);
  });
});

describe("listFromFlag", () => {
  it("returns [] for non-array", () => {
    expect(listFromFlag(null)).toEqual([]);
    expect(listFromFlag(undefined)).toEqual([]);
    expect(listFromFlag("bad")).toEqual([]);
  });
  it("normalizes each entry", () => {
    const result = listFromFlag([{ name: "Fire", pp: 5, maxPp: 10 }, null]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Fire");
    expect(result[1].pp).toBe(1);
  });
});

describe("clampPpPair", () => {
  it("ensures maxPp >= pp", () => {
    expect(clampPpPair(10, 5)).toEqual({ pp: 10, maxPp: 10 });
  });
  it("floors non-integer inputs", () => {
    expect(clampPpPair(5.9, 10.2)).toEqual({ pp: 5, maxPp: 10 });
  });
  it("clamps negative to 0", () => {
    expect(clampPpPair(-3, 5)).toEqual({ pp: 0, maxPp: 5 });
  });
});
