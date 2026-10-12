export function parseChallengeRating(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) {
      const numerator = Number(fraction[1]);
      const denominator = Number(fraction[2]);
      return denominator > 0 ? numerator / denominator : 0;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function captureDc(cr: unknown, level: unknown): number {
  const crValue = parseChallengeRating(cr);
  const levelValue = Math.floor(Number(level));
  const safeLevel = Number.isFinite(levelValue) ? levelValue : 0;
  return 10 + Math.floor(crValue) + safeLevel;
}

export function captureSucceeded(total: number, dc: number): boolean {
  return Number.isFinite(total) && Number.isFinite(dc) && total >= dc;
}

export function readChallengeRating(system: unknown): unknown {
  const details = (system as { details?: unknown } | null | undefined)?.details;
  if (!details || typeof details !== "object") return 0;
  return (details as { cr?: unknown }).cr ?? 0;
}

export type CaptureBallKind =
  | "pokeball"
  | "great"
  | "ultra"
  | "master"
  | "safari"
  | "fast"
  | "level"
  | "lure"
  | "heavy"
  | "love"
  | "friend"
  | "moon"
  | "sport"
  | "net"
  | "dive"
  | "nest"
  | "repeat"
  | "timer"
  | "luxury"
  | "premier"
  | "dusk"
  | "heal"
  | "quick"
  | "dream";

const BALL_KEYWORDS: ReadonlyArray<readonly [CaptureBallKind, readonly string[]]> = [
  ["master", ["master"]],
  ["great", ["great ball", "super ball", "superball"]],
  ["ultra", ["ultra ball"]],
  ["safari", ["safari"]],
  ["level", ["level ball", "nivel ball"]],
  ["heavy", ["heavy ball", "peso ball"]],
  ["love", ["love ball"]],
  ["friend", ["friend ball", "amistad ball", "amigo ball"]],
  ["moon", ["moon ball", "luna ball"]],
  ["sport", ["sport ball"]],
  ["net", ["net ball", "malla ball"]],
  ["dive", ["dive ball", "buceo ball"]],
  ["nest", ["nest ball", "nido ball"]],
  ["repeat", ["repeat ball", "repetir ball", "repet ball"]],
  ["timer", ["timer ball"]],
  ["luxury", ["luxury ball", "lujo ball"]],
  ["premier", ["premier ball", "honor ball"]],
  ["dusk", ["dusk ball", "ocaso ball"]],
  ["heal", ["heal ball", "sanadora ball", "sana ball"]],
  ["quick", ["quick ball"]],
  ["dream", ["dream ball", "sueno ball"]],
  ["fast", ["fast ball"]],
  ["lure", ["lure ball", "cana ball"]]
];

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function captureBallKind(name: string): CaptureBallKind {
  const haystack = normalizeName(name);
  for (const [kind, keywords] of BALL_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(normalizeName(keyword)))) return kind;
  }
  return "pokeball";
}

export interface CaptureContext {
  hpPct?: number;
  targetLevel?: number;
  trainerLevel?: number;

  targetTypes?: string[];

  targetSize?: string;

  skillMods?: Record<string, number>;

  activeChaMod?: number;
  asleep?: boolean;

  dark?: boolean;

  firstRound?: boolean;

  fishing?: boolean;
  underwater?: boolean;
  moonStone?: boolean;
  caughtBefore?: boolean;
  concentrationTurns?: number;
}

export interface CaptureModifier {
  ball: CaptureBallKind;

  ballReduction: number;

  hpReduction: number;

  reduction: number;

  autoSuccess: boolean;
}

const SIZE_MEDIUM_PLUS = new Set(["med", "medium", "lg", "large", "huge", "grg", "gargantuan"]);

function skillMod(ctx: CaptureContext, key: string): number {
  const value = ctx.skillMods?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function captureModifiers(ballName: string, ctx: CaptureContext = {}): CaptureModifier {
  const ball = captureBallKind(ballName);
  const targetLevel = Number.isFinite(Number(ctx.targetLevel))
    ? Math.floor(Number(ctx.targetLevel))
    : 0;
  const trainerLevel = Number.isFinite(Number(ctx.trainerLevel))
    ? Math.floor(Number(ctx.trainerLevel))
    : 0;
  const types = (ctx.targetTypes ?? []).map((type) => type.toLowerCase());
  const size = (ctx.targetSize ?? "").toLowerCase();

  let ballReduction = 0;
  let autoSuccess = false;

  switch (ball) {
    case "master":
      autoSuccess = true;
      break;
    case "great":
      ballReduction = 5;
      break;
    case "ultra":
      ballReduction = 10;
      break;
    case "safari":
      ballReduction = skillMod(ctx, "nat");
      break;
    case "level":
      ballReduction = trainerLevel > targetLevel ? 5 : 0;
      break;
    case "heavy":
      ballReduction = SIZE_MEDIUM_PLUS.has(size) ? 10 : 0;
      break;
    case "love":
      ballReduction =
        2 * (Number.isFinite(Number(ctx.activeChaMod)) ? Number(ctx.activeChaMod) : 0);
      break;
    case "friend":
      ballReduction = skillMod(ctx, "per");
      break;
    case "sport":
      ballReduction = skillMod(ctx, "ath");
      break;
    case "net":
      ballReduction = types.includes("water") || types.includes("bug") ? 10 : 0;
      break;
    case "nest":
      ballReduction = targetLevel > 0 && targetLevel <= 5 ? 5 : 0;
      break;
    case "dusk":
      ballReduction = ctx.dark ? 10 : 0;
      break;
    case "quick":
      ballReduction = ctx.firstRound ? 15 : 0;
      break;
    case "dream":
      ballReduction = ctx.asleep ? 5 : 0;
      break;
    case "lure":
      ballReduction = ctx.fishing ? 10 : 0;
      break;
    case "dive":
      ballReduction = ctx.underwater ? 10 : 0;
      break;
    case "moon":
      ballReduction = ctx.moonStone ? 10 : 0;
      break;
    case "repeat":
      ballReduction = ctx.caughtBefore ? 10 : 0;
      break;
    case "timer": {
      const turns = Math.max(0, Math.floor(Number(ctx.concentrationTurns) || 0));
      ballReduction = Math.min(10, turns);
      break;
    }
    default:
      ballReduction = 0;
  }

  const hpPct = Number(ctx.hpPct);
  let hpReduction = 0;
  if (Number.isFinite(hpPct)) {
    if (hpPct < 0.5) hpReduction += 5;
    if (hpPct <= 0.1) hpReduction += 5;
  }

  const reduction = autoSuccess ? 0 : ballReduction + hpReduction;
  return { ball, ballReduction, hpReduction, reduction, autoSuccess };
}

export function finalCaptureDc(baseDc: number, reduction: number): number {
  const base = Number.isFinite(baseDc) ? Math.floor(baseDc) : 0;
  const red = Number.isFinite(reduction) ? reduction : 0;
  return Math.max(0, base - red);
}
