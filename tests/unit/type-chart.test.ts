import { describe, expect, it } from "vitest";
import { normalizePokemonType, typeMatchups } from "../../src/modules/core/type-chart";

describe("normalizePokemonType", () => {
  it("resolves English and Spanish type names", () => {
    expect(normalizePokemonType("Ice")).toBe("ice");
    expect(normalizePokemonType("Hielo")).toBe("ice");
    expect(normalizePokemonType("Ice Type")).toBe("ice");
    expect(normalizePokemonType("Fuego")).toBe("fire");
    expect(normalizePokemonType("Eléctrico")).toBe("electric");
  });

  it("returns null for unknown names", () => {
    expect(normalizePokemonType("Cosmic")).toBeNull();
    expect(normalizePokemonType("")).toBeNull();
  });
});

describe("typeMatchups", () => {
  it("returns nothing without types", () => {
    expect(typeMatchups([])).toEqual({ weaknesses: [], resistances: [], immunities: [] });
  });

  it("computes mono-type Ice", () => {
    const result = typeMatchups(["Ice"]);
    expect(result.weaknesses).toEqual(["fire", "fighting", "rock", "steel"]);
    expect(result.resistances).toEqual(["ice"]);
    expect(result.immunities).toEqual([]);
  });

  it("computes the Ice/Fairy dual type with combined multipliers", () => {
    const result = typeMatchups(["ice", "fairy"]);
    // Fire is doubled against Ice and neutral against Fairy -> weak.
    expect(result.weaknesses).toContain("fire");
    // Dragon is neutral vs Ice, immune vs Fairy -> immune.
    expect(result.immunities).toContain("dragon");
    // Ice resists itself and Fairy is neutral -> resist.
    expect(result.resistances).toContain("ice");
  });

  it("detects immunities such as Ground vs Flying", () => {
    const result = typeMatchups(["Flying"]);
    expect(result.immunities).toContain("ground");
  });
});
