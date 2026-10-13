import { describe, expect, it } from "vitest";
import { categorizeInventoryItem, categorizeItemName } from "../../src/modules/core/hud-data";

describe("categorizeItemName", () => {
  it("classifies pokéballs by name", () => {
    expect(categorizeItemName("Poké Ball")).toBe("pokeball");
    expect(categorizeItemName("Great Ball")).toBe("pokeball");
    expect(categorizeItemName("Pokeball")).toBe("pokeball");
  });

  it("classifies TMs and no longer treats Key/Clave prefixes as key items", () => {
    expect(categorizeItemName("Key: Bike")).toBe("object");
    expect(categorizeItemName("Clave: Bici")).toBe("object");
    expect(categorizeItemName("TM: Flamethrower")).toBe("tm");
  });

  it("falls back to object", () => {
    expect(categorizeItemName("Potion")).toBe("object");
  });
});

describe("categorizeInventoryItem", () => {
  it("classifies feat items as features regardless of name", () => {
    expect(categorizeInventoryItem("feat", "Second Wind")).toBe("feature");
    expect(categorizeInventoryItem("feat", "Poké Ball")).toBe("feature");
    expect(categorizeInventoryItem("Feat", "Darkvision")).toBe("feature");
  });

  it("delegates non-feat items to name/subtype classification", () => {
    expect(categorizeInventoryItem("consumable", "Potion")).toBe("object");
    expect(categorizeInventoryItem("equipment", "Key: Bike")).toBe("object");
    expect(categorizeInventoryItem("consumable", "TM: Flamethrower")).toBe("tm");
    expect(categorizeInventoryItem("loot", "Great Ball")).toBe("pokeball");
  });

  it("treats only configured names as key items", () => {
    const keyNames = ["Bici", "Pokédex"];
    expect(categorizeInventoryItem("equipment", "Bici", "", keyNames)).toBe("key");
    expect(categorizeInventoryItem("equipment", "bici", "", keyNames)).toBe("key");
    expect(categorizeInventoryItem("equipment", "Pokedex", "", keyNames)).toBe("key");
    expect(categorizeInventoryItem("equipment", "Key: Bike", "", keyNames)).toBe("object");
    expect(categorizeInventoryItem("consumable", "Potion", "", keyNames)).toBe("object");
  });
});
