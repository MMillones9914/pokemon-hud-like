/** Canonical Pokémon type keys, used as the ordering for matchup output. */
export const POKEMON_TYPE_ORDER = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy"
] as const;

export type PokemonTypeKey = (typeof POKEMON_TYPE_ORDER)[number];

interface Matchup {
  weak: string[];
  resist: string[];
  immune: string[];
}

/** Gen 6+ defensive chart: for each defending type, which attacking types do what. */
const CHART: Record<string, Matchup> = {
  normal: { weak: ["fighting"], resist: [], immune: ["ghost"] },
  fire: {
    weak: ["water", "ground", "rock"],
    resist: ["fire", "grass", "ice", "bug", "steel", "fairy"],
    immune: []
  },
  water: { weak: ["electric", "grass"], resist: ["fire", "water", "ice", "steel"], immune: [] },
  electric: { weak: ["ground"], resist: ["electric", "flying", "steel"], immune: [] },
  grass: {
    weak: ["fire", "ice", "poison", "flying", "bug"],
    resist: ["water", "electric", "grass", "ground"],
    immune: []
  },
  ice: { weak: ["fire", "fighting", "rock", "steel"], resist: ["ice"], immune: [] },
  fighting: { weak: ["flying", "psychic", "fairy"], resist: ["bug", "rock", "dark"], immune: [] },
  poison: {
    weak: ["ground", "psychic"],
    resist: ["grass", "fighting", "poison", "bug", "fairy"],
    immune: []
  },
  ground: { weak: ["water", "grass", "ice"], resist: ["poison", "rock"], immune: ["electric"] },
  flying: {
    weak: ["electric", "ice", "rock"],
    resist: ["grass", "fighting", "bug"],
    immune: ["ground"]
  },
  psychic: { weak: ["bug", "ghost", "dark"], resist: ["fighting", "psychic"], immune: [] },
  bug: { weak: ["fire", "flying", "rock"], resist: ["grass", "fighting", "ground"], immune: [] },
  rock: {
    weak: ["water", "grass", "fighting", "ground", "steel"],
    resist: ["normal", "fire", "poison", "flying"],
    immune: []
  },
  ghost: { weak: ["ghost", "dark"], resist: ["poison", "bug"], immune: ["normal", "fighting"] },
  dragon: {
    weak: ["ice", "dragon", "fairy"],
    resist: ["fire", "water", "electric", "grass"],
    immune: []
  },
  dark: { weak: ["fighting", "bug", "fairy"], resist: ["ghost", "dark"], immune: ["psychic"] },
  steel: {
    weak: ["fire", "fighting", "ground"],
    resist: [
      "normal",
      "grass",
      "ice",
      "flying",
      "psychic",
      "bug",
      "rock",
      "dragon",
      "steel",
      "fairy"
    ],
    immune: ["poison"]
  },
  fairy: { weak: ["poison", "steel"], resist: ["fighting", "bug", "dark"], immune: ["dragon"] }
};

const TYPE_ALIASES: Record<string, PokemonTypeKey> = {
  // English
  normal: "normal",
  fire: "fire",
  water: "water",
  electric: "electric",
  grass: "grass",
  ice: "ice",
  fighting: "fighting",
  combat: "fighting",
  poison: "poison",
  ground: "ground",
  flying: "flying",
  psychic: "psychic",
  bug: "bug",
  rock: "rock",
  ghost: "ghost",
  dragon: "dragon",
  dark: "dark",
  steel: "steel",
  fairy: "fairy",
  // Spanish
  fuego: "fire",
  agua: "water",
  electrico: "electric",
  planta: "grass",
  hielo: "ice",
  lucha: "fighting",
  luchador: "fighting",
  veneno: "poison",
  tierra: "ground",
  volador: "flying",
  psiquico: "psychic",
  bicho: "bug",
  roca: "rock",
  fantasma: "ghost",
  siniestro: "dark",
  acero: "steel",
  hada: "fairy"
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*-?\s*type$/i, "")
    .replace(/\s*(tipo)$/i, "")
    .trim();
}

/** Resolve a localized type name ("Ice", "Hielo", "Ice Type") to its chart key. */
export function normalizePokemonType(name: string): PokemonTypeKey | null {
  const key = normalize(name);
  if (!key) return null;
  return TYPE_ALIASES[key] ?? null;
}

export interface TypeMatchups {
  weaknesses: PokemonTypeKey[];
  resistances: PokemonTypeKey[];
  immunities: PokemonTypeKey[];
}

/** Defensive matchups for a (mono- or dual-type) Pokémon. Multipliers are combined. */
export function typeMatchups(types: readonly string[]): TypeMatchups {
  const keys = types
    .map((entry) => normalizePokemonType(entry))
    .filter((entry): entry is PokemonTypeKey => entry !== null);
  const result: TypeMatchups = { weaknesses: [], resistances: [], immunities: [] };
  if (!keys.length) return result;

  for (const attack of POKEMON_TYPE_ORDER) {
    let multiplier = 1;
    for (const defend of keys) {
      const matchup = CHART[defend];
      if (!matchup) continue;
      if (matchup.immune.includes(attack)) multiplier = 0;
      else if (multiplier === 0) continue;
      else if (matchup.weak.includes(attack)) multiplier *= 2;
      else if (matchup.resist.includes(attack)) multiplier *= 0.5;
    }
    if (multiplier === 0) result.immunities.push(attack);
    else if (multiplier > 1) result.weaknesses.push(attack);
    else if (multiplier < 1) result.resistances.push(attack);
  }
  return result;
}
