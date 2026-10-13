import { describe, expect, it } from "vitest";
import {
  formatChallengeRating,
  isPokedexName,
  pokedexTier
} from "../../src/modules/core/pokedex";

describe("pokedexTier", () => {
  it("reveals nothing below 10", () => {
    expect(pokedexTier(0)).toBe(0);
    expect(pokedexTier(9)).toBe(0);
  });

  it("reveals traits from 10", () => {
    expect(pokedexTier(10)).toBe(1);
    expect(pokedexTier(14)).toBe(1);
  });

  it("reveals moves from 15", () => {
    expect(pokedexTier(15)).toBe(2);
    expect(pokedexTier(19)).toBe(2);
  });

  it("reveals nature and ability at 20+", () => {
    expect(pokedexTier(20)).toBe(3);
    expect(pokedexTier(27)).toBe(3);
  });

  it("treats invalid totals as nothing", () => {
    expect(pokedexTier(Number.NaN)).toBe(0);
    expect(pokedexTier(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("formatChallengeRating", () => {
  it("formats fractions", () => {
    expect(formatChallengeRating(0.5)).toBe("1/2");
    expect(formatChallengeRating(0.25)).toBe("1/4");
    expect(formatChallengeRating(0.125)).toBe("1/8");
  });

  it("formats integers and passes through strings", () => {
    expect(formatChallengeRating(3)).toBe("3");
    expect(formatChallengeRating("1/2")).toBe("1/2");
  });

  it("falls back to ? for junk", () => {
    expect(formatChallengeRating(undefined)).toBe("?");
    expect(formatChallengeRating("")).toBe("?");
  });
});

describe("isPokedexName", () => {
  it("detects pokédex items accent-insensitively", () => {
    expect(isPokedexName("Pokédex")).toBe(true);
    expect(isPokedexName("Pokedex Kanto")).toBe(true);
    expect(isPokedexName("POKÉDEX")).toBe(true);
    expect(isPokedexName("Potion")).toBe(false);
  });
});
