import type { AbilityKey, AbilityStatView, SkillStatView, StatBreakdownView } from "../types";

export const ABILITY_KEYS: readonly AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export const SKILL_KEYS: readonly string[] = [
  "acr",
  "ani",
  "arc",
  "ath",
  "dec",
  "his",
  "ins",
  "int",
  "inv",
  "med",
  "nat",
  "per",
  "prc",
  "prf",
  "rel",
  "slt",
  "ste",
  "sur"
];

function toNumber(value: unknown): number | undefined {
  if (typeof value === "boolean" || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function readStatBreakdown(system: unknown): StatBreakdownView {
  const data = (system ?? {}) as Record<string, unknown>;
  const abilities = (data.abilities ?? {}) as Record<string, unknown>;
  const skills = (data.skills ?? {}) as Record<string, unknown>;

  const abilityViews: AbilityStatView[] = ABILITY_KEYS.map((key) => {
    const entry = (abilities[key] ?? {}) as Record<string, unknown>;
    const value = toNumber(entry.value) ?? 10;
    const mod = toNumber(entry.mod) ?? abilityModifier(value);
    const save = toNumber(entry.save) ?? mod;
    return {
      key,
      value,
      mod,
      save,
      modText: formatModifier(mod),
      saveText: formatModifier(save),
      labelKey: `pokemon-hud-like.hud.stats.ability.${key}`
    };
  });

  const skillViews: SkillStatView[] = SKILL_KEYS.map((key) => {
    const entry = (skills[key] ?? {}) as Record<string, unknown>;
    const total = toNumber(entry.total) ?? toNumber(entry.value) ?? 0;
    return {
      key,
      total,
      totalText: formatModifier(total),
      labelKey: `pokemon-hud-like.hud.stats.skill.${key}`
    };
  });

  return { abilities: abilityViews, skills: skillViews };
}
