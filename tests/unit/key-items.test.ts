import { describe, expect, it } from "vitest";
import { isKeyItem, parseKeyItemNames } from "../../src/modules/core/key-items";

describe("parseKeyItemNames", () => {
  it("splits on commas, semicolons and newlines", () => {
    expect(parseKeyItemNames("Bici, Pokédex\nMapa;Cuerda")).toEqual([
      "Bici",
      "Pokédex",
      "Mapa",
      "Cuerda"
    ]);
  });

  it("trims and drops empty entries", () => {
    expect(parseKeyItemNames("  Bici ,, \n\n Poción ")).toEqual(["Bici", "Poción"]);
  });

  it("handles non-string input", () => {
    expect(parseKeyItemNames(null)).toEqual([]);
    expect(parseKeyItemNames(undefined)).toEqual([]);
    expect(parseKeyItemNames(42)).toEqual([]);
  });
});

describe("isKeyItem", () => {
  const names = ["Bici", "Pokédex", "Llave Sótano"];

  it("matches ignoring case and accents", () => {
    expect(isKeyItem("Bici", names)).toBe(true);
    expect(isKeyItem("bici", names)).toBe(true);
    expect(isKeyItem("Pokedex", names)).toBe(true);
    expect(isKeyItem("llave sotano", names)).toBe(true);
  });

  it("requires an exact (normalized) name", () => {
    expect(isKeyItem("Bicicleta", names)).toBe(false);
    expect(isKeyItem("Poción", names)).toBe(false);
    expect(isKeyItem("", names)).toBe(false);
  });

  it("returns false without configured names", () => {
    expect(isKeyItem("Bici", [])).toBe(false);
  });
});
