function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Split the comma / semicolon / newline separated setting into item names. */
export function parseKeyItemNames(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Case/accent-insensitive exact match against the configured key item names. */
export function isKeyItem(name: string, keyNames: readonly string[]): boolean {
  const target = normalizeName(name);
  if (!target || keyNames.length === 0) return false;
  return keyNames.some((candidate) => normalizeName(candidate) === target);
}
