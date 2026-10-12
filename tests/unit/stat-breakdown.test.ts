import { describe, it, expect } from "vitest";
import {
  ABILITY_KEYS,
  SKILL_KEYS,
  abilityModifier,
  formatModifier,
  readStatBreakdown
} from "../../src/modules/core/stat-breakdown";

describe("abilityModifier", () => {
  it("computes the standard 5e modifier", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(18)).toBe(4);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(30)).toBe(10);
  });
});

describe("formatModifier", () => {
  it("prefixes non-negative bonuses with +", () => {
    expect(formatModifier(3)).toBe("+3");
    expect(formatModifier(0)).toBe("+0");
  });
  it("keeps negative bonuses as-is", () => {
    expect(formatModifier(-1)).toBe("-1");
    expect(formatModifier(-5)).toBe("-5");
  });
});

describe("readStatBreakdown", () => {
  it("reads all six abilities in order with derived mods", () => {
    const system = {
      abilities: {
        str: { value: 18, mod: 4, save: 6 },
        dex: { value: 14 },
        con: { value: 12, mod: 1 },
        int: { value: 8 },
        wis: { value: 10 },
        cha: { value: 13 }
      }
    };
    const s = readStatBreakdown(system);
    expect(s.abilities.map((a) => a.key)).toEqual([...ABILITY_KEYS]);
    const str = s.abilities[0];
    expect(str.value).toBe(18);
    expect(str.mod).toBe(4);
    expect(str.save).toBe(6);
    expect(str.modText).toBe("+4");
    expect(str.saveText).toBe("+6");
    const dex = s.abilities[1];
    expect(dex.mod).toBe(2);
    expect(dex.save).toBe(2);
    const cha = s.abilities[5];
    expect(cha.value).toBe(13);
    expect(cha.mod).toBe(1);
  });

  it("falls back to computing the modifier when mod/save are missing", () => {
    const s = readStatBreakdown({ abilities: { con: { value: 1 } } });
    const con = s.abilities.find((a) => a.key === "con")!;
    expect(con.mod).toBe(-5);
    expect(con.save).toBe(-5);
  });

  it("reads all 18 skills with their total modifiers", () => {
    const system = {
      skills: {
        acr: { total: 4 },
        ath: { total: -1 },
        ins: { total: 0 },
        arc: { value: 2 }
      }
    };
    const s = readStatBreakdown(system);
    expect(s.skills.map((x) => x.key)).toEqual([...SKILL_KEYS]);
    const byKey = Object.fromEntries(s.skills.map((x) => [x.key, x]));
    expect(byKey.acr.total).toBe(4);
    expect(byKey.acr.totalText).toBe("+4");
    expect(byKey.ath.total).toBe(-1);
    expect(byKey.ath.totalText).toBe("-1");
    expect(byKey.ins.total).toBe(0);
    expect(byKey.arc.total).toBe(2);
    expect(byKey.ste.total).toBe(0);
  });

  it("returns safe defaults for empty/null system", () => {
    const s = readStatBreakdown(null);
    expect(s.abilities).toHaveLength(6);
    expect(s.skills).toHaveLength(18);
    for (const a of s.abilities) {
      expect(a.value).toBe(10);
      expect(a.mod).toBe(0);
      expect(a.save).toBe(0);
    }
    for (const sk of s.skills) expect(sk.total).toBe(0);
  });

  it("ignores non-finite values", () => {
    const s = readStatBreakdown({ abilities: { str: { value: "x", mod: NaN } } });
    const str = s.abilities[0];
    expect(str.value).toBe(10);
    expect(str.mod).toBe(0);
  });
});
