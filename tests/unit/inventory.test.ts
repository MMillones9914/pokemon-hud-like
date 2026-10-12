import { describe, expect, it } from "vitest";
import { categorizeInventoryItem, categorizeItemName } from "../../src/modules/core/hud-data";

describe("categorizeItemName", () => {
  it("classifies pokéballs by name", () => {
    expect(categorizeItemName("Poké Ball")).toBe("pokeball");
    expect(categorizeItemName("Great Ball")).toBe("pokeball");
    expect(categorizeItemName("Pokeball")).toBe("pokeball");
  });

  it("classifies key items and TMs", () => {
    expect(categorizeItemName("Key: Bike")).toBe("key");
    expect(categorizeItemName("Clave: Bici")).toBe("key");
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
    expect(categorizeInventoryItem("equipment", "Key: Bike")).toBe("key");
    expect(categorizeInventoryItem("consumable", "TM: Flamethrower")).toBe("tm");
    expect(categorizeInventoryItem("loot", "Great Ball")).toBe("pokeball");
  });
});
