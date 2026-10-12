export type RollMode = "normal" | "advantage" | "disadvantage";

export interface ModifierKeys {
  ctrlKey?: boolean;
  altKey?: boolean;
}

/** Alt = advantage, Ctrl = disadvantage. Holding both cancels out. */
export function rollModeFromKeys(keys: ModifierKeys): RollMode {
  const advantage = Boolean(keys.altKey) && !keys.ctrlKey;
  const disadvantage = Boolean(keys.ctrlKey) && !keys.altKey;
  if (advantage) return "advantage";
  if (disadvantage) return "disadvantage";
  return "normal";
}

/** Foundry d20 formula for a roll mode (`kh` keeps highest, `kl` keeps lowest). */
export function d20Formula(mode: RollMode): string {
  if (mode === "advantage") return "2d20kh1";
  if (mode === "disadvantage") return "2d20kl1";
  return "1d20";
}
