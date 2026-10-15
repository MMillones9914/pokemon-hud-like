import { describe, it, expect } from "vitest";
import {
  readMoveUses,
  resolvePowerItem,
  embeddedItemIdFor
} from "../../src/modules/core/move-link";

describe("readMoveUses", () => {
  it("reads a dnd5e-style value/max pair", () => {
    expect(readMoveUses({ uses: { value: 4, max: 5 } })).toEqual({
      limited: true,
      value: 4,
      max: 5
    });
  });

  it("derives the value from max - spent when value is absent", () => {
    expect(readMoveUses({ uses: { max: 10, spent: 4 } })).toEqual({
      limited: true,
      value: 6,
      max: 10
    });
  });

  it("clamps value into 0..max and floors fractions", () => {
    expect(readMoveUses({ uses: { value: 99, max: 5 } })?.value).toBe(5);
    expect(readMoveUses({ uses: { value: -3, max: 5 } })?.value).toBe(0);
    expect(readMoveUses({ uses: { value: 2.7, max: 5 } })?.value).toBe(2);
  });

  it("treats an unresolved formula max as unlimited", () => {
    expect(readMoveUses({ uses: { value: 0, max: "@scale.monk.ki" } })).toEqual({
      limited: false,
      value: 0,
      max: 0
    });
  });

  it("treats an empty max (no charges) as unlimited", () => {
    expect(readMoveUses({ uses: { value: 0, max: "" } })).toEqual({
      limited: false,
      value: 0,
      max: 0
    });
  });

  it("returns null when the item does not track uses at all", () => {
    expect(readMoveUses(undefined)).toBeNull();
    expect(readMoveUses({})).toBeNull();
    expect(readMoveUses({ uses: null })).toBeNull();
    expect(readMoveUses("nope")).toBeNull();
  });
});

describe("resolvePowerItem", () => {
  const item = { id: "abc", documentName: "Item", system: { uses: { value: 2, max: 3 } } };
  const actor = { items: { get: (id: string) => (id === "abc" ? item : undefined) } };

  it("prefers the actor's own copy by itemId", () => {
    expect(resolvePowerItem(actor, { itemId: "abc" })).toBe(item);
  });

  it("falls back to the trailing id of a legacy embedded uuid", () => {
    expect(resolvePowerItem(actor, { uuid: "Actor.owner.Item.abc" })).toBe(item);
  });

  it("returns null without a reference or a match", () => {
    expect(resolvePowerItem(actor, {})).toBeNull();
    expect(resolvePowerItem(actor, null)).toBeNull();
    expect(resolvePowerItem(null, { itemId: "abc" })).toBeNull();
    expect(resolvePowerItem(actor, { itemId: "zzz" })).toBeNull();
  });
});

describe("embeddedItemIdFor", () => {
  it("accepts an item embedded in the same actor", () => {
    expect(embeddedItemIdFor("a1", { id: "i1", documentName: "Item", parent: { id: "a1" } })).toBe(
      "i1"
    );
  });

  it("rejects foreign parents, non-items and missing ids", () => {
    expect(embeddedItemIdFor("a1", { id: "i1", documentName: "Item", parent: { id: "a2" } })).toBe(
      undefined
    );
    expect(embeddedItemIdFor("a1", { id: "i1", documentName: "Actor", parent: { id: "a1" } })).toBe(
      undefined
    );
    expect(embeddedItemIdFor("a1", { documentName: "Item", parent: { id: "a1" } })).toBe(undefined);
    expect(embeddedItemIdFor(undefined, { id: "i1", documentName: "Item" })).toBe(undefined);
  });
});
