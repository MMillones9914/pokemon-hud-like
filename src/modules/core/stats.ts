const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD"
};

export function typeColor(type: string): string {
  if (typeof type !== "string") return "#68A090";
  return TYPE_COLORS[type.toLowerCase()] ?? "#68A090";
}

export function hpColor(pct: number): "hp-high" | "hp-mid" | "hp-low" {
  if (pct > 0.5) return "hp-high";
  if (pct > 0.25) return "hp-mid";
  return "hp-low";
}

export function clampedPct(current: number, max: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, current / max));
}

export function readCoreStats(system: unknown): {
  level: number;
  hp: { current: number; max: number; pct: number; color: import("../types").HpColor };
  xp: { current: number; max: number; pct: number };
  type: string;
} {
  const data = (system ?? {}) as Record<string, unknown>;
  const attributes = (data.attributes ?? {}) as Record<string, unknown>;
  const details = (data.details ?? {}) as Record<string, unknown>;

  const hpRaw = (attributes.hp ?? {}) as Record<string, number>;
  const xpRaw = (attributes.xp ?? {}) as Record<string, number>;

  const hpCurrent = typeof hpRaw.value === "number" ? hpRaw.value : 0;
  const hpMax = typeof hpRaw.max === "number" ? hpRaw.max : 1;
  const xpCurrent = typeof xpRaw.value === "number" ? xpRaw.value : 0;
  const xpMax = typeof xpRaw.max === "number" ? xpRaw.max : 1;

  const hpPct = clampedPct(hpCurrent, hpMax);
  const xpPct = clampedPct(xpCurrent, xpMax);

  const level = typeof details.level === "number" ? details.level : 1;
  const type = typeof attributes.type === "string" ? attributes.type : "normal";

  return {
    level,
    hp: { current: hpCurrent, max: hpMax, pct: hpPct, color: hpColor(hpPct) },
    xp: { current: xpCurrent, max: xpMax, pct: xpPct },
    type
  };
}
