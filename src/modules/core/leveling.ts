export const XP_TABLE: readonly number[] = [
  0, 200, 800, 2000, 6000, 12000, 20000, 30000, 44000, 62000, 82000, 104000, 128000, 158000, 194000,
  234000, 278000, 326000, 382000, 450000
];

export const MAX_LEVEL: number = XP_TABLE.length;

function clampLevel(level: unknown): number {
  const n = Math.floor(Number(level) || 1);
  return Math.min(MAX_LEVEL, Math.max(1, n));
}

export function xpMaxForLevel(level: unknown): number {
  return XP_TABLE[clampLevel(level) - 1];
}

export function xpNextMax(level: unknown): number | undefined {
  const l = clampLevel(level);
  return XP_TABLE[l];
}

export function xpProgress(
  xp: unknown,
  level: unknown
): { current: number; max: number; pct: number } {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  const l = clampLevel(level);
  const base = XP_TABLE[l - 1];
  const next = XP_TABLE[l];
  if (next === undefined) {
    return { current: total, max: base, pct: total >= base ? 1 : 0 };
  }
  const span = Math.max(1, next - base);
  const current = Math.max(0, total - base);
  return { current, max: span, pct: Math.min(1, current / span) };
}

export function canLevelUp(xp: unknown, level: unknown): boolean {
  const l = clampLevel(level);
  if (l >= MAX_LEVEL) return false;
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  return total >= XP_TABLE[l];
}
