import { describe, expect, it } from "vitest";
import {
  captureBallKind,
  captureDc,
  captureModifiers,
  captureSucceeded,
  finalCaptureDc,
  parseChallengeRating,
  readChallengeRating
} from "../../src/modules/core/capture";

describe("parseChallengeRating", () => {
  it("passes through finite numbers", () => {
    expect(parseChallengeRating(3)).toBe(3);
    expect(parseChallengeRating(0.5)).toBe(0.5);
  });

  it("parses numeric strings", () => {
    expect(parseChallengeRating("5")).toBe(5);
    expect(parseChallengeRating("0")).toBe(0);
  });

  it("parses fraction strings", () => {
    expect(parseChallengeRating("1/2")).toBe(0.5);
    expect(parseChallengeRating("1/4")).toBe(0.25);
    expect(parseChallengeRating("3/4")).toBe(0.75);
  });

  it("falls back to 0 for junk or missing values", () => {
    expect(parseChallengeRating(undefined)).toBe(0);
    expect(parseChallengeRating(null)).toBe(0);
    expect(parseChallengeRating("")).toBe(0);
    expect(parseChallengeRating("abc")).toBe(0);
    expect(parseChallengeRating("1/0")).toBe(0);
    expect(parseChallengeRating(Number.NaN)).toBe(0);
  });
});

describe("captureDc", () => {
  it("is 10 + floor(CR) + level", () => {
    expect(captureDc(3, 5)).toBe(18);
    expect(captureDc(2.9, 4)).toBe(16);
    expect(captureDc("1/2", 3)).toBe(13);
  });

  it("treats missing values as 0", () => {
    expect(captureDc(undefined, undefined)).toBe(10);
    expect(captureDc("abc", Number.NaN)).toBe(10);
  });
});

describe("captureSucceeded", () => {
  it("succeeds when the total meets or beats the DC", () => {
    expect(captureSucceeded(18, 18)).toBe(true);
    expect(captureSucceeded(19, 18)).toBe(true);
    expect(captureSucceeded(17, 18)).toBe(false);
  });

  it("rejects non-finite totals", () => {
    expect(captureSucceeded(Number.NaN, 10)).toBe(false);
  });
});

describe("readChallengeRating", () => {
  it("reads details.cr from a dnd5e-style system", () => {
    expect(readChallengeRating({ details: { cr: 7 } })).toBe(7);
  });

  it("defaults to 0 when absent", () => {
    expect(readChallengeRating({})).toBe(0);
    expect(readChallengeRating(undefined)).toBe(0);
  });
});

describe("captureBallKind", () => {
  it("classifies the basic and enhanced balls", () => {
    expect(captureBallKind("Poké Ball")).toBe("pokeball");
    expect(captureBallKind("Great Ball")).toBe("great");
    expect(captureBallKind("Ultra Ball")).toBe("ultra");
    expect(captureBallKind("Master Ball")).toBe("master");
  });

  it("classifies situational balls and Spanish aliases", () => {
    expect(captureBallKind("Level Ball")).toBe("level");
    expect(captureBallKind("Nivel Ball")).toBe("level");
    expect(captureBallKind("Net Ball")).toBe("net");
    expect(captureBallKind("Malla Ball")).toBe("net");
    expect(captureBallKind("Moon Ball")).toBe("moon");
    expect(captureBallKind("Luna Ball")).toBe("moon");
  });

  it("falls back to the plain pokéball", () => {
    expect(captureBallKind("Something Else")).toBe("pokeball");
  });
});

describe("captureModifiers", () => {
  it("applies the flat ball reductions", () => {
    expect(captureModifiers("Great Ball").reduction).toBe(5);
    expect(captureModifiers("Ultra Ball").reduction).toBe(10);
    expect(captureModifiers("Poké Ball").reduction).toBe(0);
  });

  it("flags the Master Ball as an automatic success", () => {
    const mods = captureModifiers("Master Ball", { hpPct: 0.2 });
    expect(mods.autoSuccess).toBe(true);
    expect(mods.reduction).toBe(0);
  });

  it("adds the HP reductions (below half, then at 10% or less)", () => {
    expect(captureModifiers("Poké Ball", { hpPct: 0.51 }).hpReduction).toBe(0);
    expect(captureModifiers("Poké Ball", { hpPct: 0.5 }).hpReduction).toBe(0);
    expect(captureModifiers("Poké Ball", { hpPct: 0.4 }).hpReduction).toBe(5);
    expect(captureModifiers("Poké Ball", { hpPct: 0.11 }).hpReduction).toBe(5);
    expect(captureModifiers("Poké Ball", { hpPct: 0.1 }).hpReduction).toBe(10);
    expect(captureModifiers("Poké Ball", { hpPct: 0.02 }).hpReduction).toBe(10);
  });

  it("stacks the ball and HP reductions", () => {
    expect(captureModifiers("Ultra Ball", { hpPct: 0.05 }).reduction).toBe(20);
  });

  it("handles type / level / size / condition balls", () => {
    expect(captureModifiers("Net Ball", { targetTypes: ["water"] }).reduction).toBe(10);
    expect(captureModifiers("Net Ball", { targetTypes: ["Bug"] }).reduction).toBe(10);
    expect(captureModifiers("Net Ball", { targetTypes: ["fire"] }).reduction).toBe(0);
    expect(captureModifiers("Level Ball", { trainerLevel: 5, targetLevel: 3 }).reduction).toBe(5);
    expect(captureModifiers("Level Ball", { trainerLevel: 3, targetLevel: 3 }).reduction).toBe(0);
    expect(captureModifiers("Heavy Ball", { targetSize: "lg" }).reduction).toBe(10);
    expect(captureModifiers("Heavy Ball", { targetSize: "sm" }).reduction).toBe(0);
    expect(captureModifiers("Nest Ball", { targetLevel: 5 }).reduction).toBe(5);
    expect(captureModifiers("Nest Ball", { targetLevel: 6 }).reduction).toBe(0);
    expect(captureModifiers("Quick Ball", { firstRound: true }).reduction).toBe(15);
    expect(captureModifiers("Dusk Ball", { dark: true }).reduction).toBe(10);
    expect(captureModifiers("Dream Ball", { asleep: true }).reduction).toBe(5);
  });

  it("uses skill / Charisma modifiers", () => {
    expect(captureModifiers("Friend Ball", { skillMods: { per: 7 } }).reduction).toBe(7);
    expect(captureModifiers("Sport Ball", { skillMods: { ath: 3 } }).reduction).toBe(3);
    expect(captureModifiers("Safari Ball", { skillMods: { nat: -2 } }).reduction).toBe(-2);
    expect(captureModifiers("Love Ball", { activeChaMod: 3 }).reduction).toBe(6);
  });

  it("keeps undetectable conditions at 0 by default", () => {
    expect(captureModifiers("Lure Ball").reduction).toBe(0);
    expect(captureModifiers("Dive Ball").reduction).toBe(0);
    expect(captureModifiers("Moon Ball").reduction).toBe(0);
    expect(captureModifiers("Repeat Ball").reduction).toBe(0);
    expect(captureModifiers("Timer Ball").reduction).toBe(0);
  });

  it("caps the Timer Ball concentration bonus at 10", () => {
    expect(captureModifiers("Timer Ball", { concentrationTurns: 4 }).reduction).toBe(4);
    expect(captureModifiers("Timer Ball", { concentrationTurns: 99 }).reduction).toBe(10);
  });
});

describe("finalCaptureDc", () => {
  it("subtracts the reduction and clamps at 0", () => {
    expect(finalCaptureDc(20, 10)).toBe(10);
    expect(finalCaptureDc(15, 25)).toBe(0);
  });

  it("increases the DC when the reduction is negative", () => {
    expect(finalCaptureDc(12, -3)).toBe(15);
  });
});
