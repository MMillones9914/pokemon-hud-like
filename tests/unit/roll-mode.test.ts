import { describe, expect, it } from "vitest";
import { d20Formula, rollModeFromKeys } from "../../src/modules/core/roll-mode";

describe("rollModeFromKeys", () => {
  it("is normal with no modifiers", () => {
    expect(rollModeFromKeys({})).toBe("normal");
    expect(rollModeFromKeys({ ctrlKey: false, altKey: false })).toBe("normal");
  });

  it("treats alt as advantage", () => {
    expect(rollModeFromKeys({ altKey: true })).toBe("advantage");
    expect(rollModeFromKeys({ altKey: true, ctrlKey: false })).toBe("advantage");
  });

  it("treats ctrl as disadvantage", () => {
    expect(rollModeFromKeys({ ctrlKey: true })).toBe("disadvantage");
    expect(rollModeFromKeys({ ctrlKey: true, altKey: false })).toBe("disadvantage");
  });

  it("cancels out when both are held", () => {
    expect(rollModeFromKeys({ ctrlKey: true, altKey: true })).toBe("normal");
  });
});

describe("d20Formula", () => {
  it("builds keep-highest / keep-lowest formulas", () => {
    expect(d20Formula("normal")).toBe("1d20");
    expect(d20Formula("advantage")).toBe("2d20kh1");
    expect(d20Formula("disadvantage")).toBe("2d20kl1");
  });
});
