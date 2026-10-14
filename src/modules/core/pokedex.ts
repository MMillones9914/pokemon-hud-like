export const POKEDEX_DC_TRAITS = 10;
export const POKEDEX_DC_MOVES = 15;
export const POKEDEX_DC_NATURE = 20;

/** 0 = only the basics, 1 ≥ 10, 2 ≥ 15, 3 ≥ 20. */
export type PokedexTier = 0 | 1 | 2 | 3;

export interface PokedexInfo {
  name: string;
  cr: string;
  weaknesses: string[];
  resistances: string[];
  immunities: string[];
  moves: string[];
  nature: string;
  ability: string;
}

export function pokedexTier(total: number): PokedexTier {
  if (!Number.isFinite(total)) return 0;
  if (total >= POKEDEX_DC_NATURE) return 3;
  if (total >= POKEDEX_DC_MOVES) return 2;
  if (total >= POKEDEX_DC_TRAITS) return 1;
  return 0;
}

const CR_FRACTIONS: Record<string, string> = {
  "0.125": "1/8",
  "0.25": "1/4",
  "0.5": "1/2"
};

export function formatChallengeRating(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "?";
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return trimmed;
    return CR_FRACTIONS[String(numeric)] ?? trimmed;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return "?";
  return CR_FRACTIONS[String(n)] ?? String(n);
}

function stripAccents(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** A Pokédex is detected by item name (accent-insensitive). */
export function isPokedexName(name: string): boolean {
  return stripAccents(name).includes("pokedex");
}

const NATURE_NAMES = new Set(
  [
    // English
    "hardy",
    "lonely",
    "brave",
    "adamant",
    "naughty",
    "bold",
    "docile",
    "relaxed",
    "impish",
    "lax",
    "timid",
    "hasty",
    "serious",
    "jolly",
    "naive",
    "modest",
    "mild",
    "quiet",
    "bashful",
    "rash",
    "calm",
    "gentle",
    "sassy",
    "careful",
    "quirky",
    // Spanish
    "fuerte",
    "hurana",
    "audaz",
    "firme",
    "picara",
    "osada",
    "docil",
    "placida",
    "agitada",
    "floja",
    "miedosa",
    "activa",
    "seria",
    "alegre",
    "ingenua",
    "modesta",
    "afable",
    "quieta",
    "timida",
    "alocada",
    "serena",
    "amable",
    "grosera",
    "cauta",
    "rara"
  ].map(stripAccents)
);

/** Whether a feature/item name is one of the 25 Pokémon natures. */
export function isNatureName(name: string): boolean {
  return NATURE_NAMES.has(stripAccents(name));
}
