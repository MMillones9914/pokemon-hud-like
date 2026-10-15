import type { PowerData } from "../types";

/** Structural view of an Item we only read data from (keeps this module free of
    Foundry class types so vitest can import it). */
export interface LinkedItemLike {
  id?: string;
  uuid?: string;
  documentName?: string;
  system?: unknown;
}

export interface MoveUses {
  /** The item tracks a real charge counter (`system.uses.max` is a formula). */
  limited: boolean;
  value: number;
  max: number;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Reads a dnd5e-style charge counter (`{ value, max, spent }`) from an item's
    `system`. Returns `null` when the item does not track uses at all, so callers
    can fall back to the legacy HUD counter. `max` is a formula resolved to a
    number during item preparation; an unresolved formula reads as unlimited. */
export function readMoveUses(system: unknown): MoveUses | null {
  if (!system || typeof system !== "object") return null;
  const uses = (system as { uses?: unknown }).uses;
  if (!uses || typeof uses !== "object") return null;

  const raw = uses as { value?: unknown; max?: unknown; spent?: unknown };
  const max = toNumber(raw.max);
  const value = toNumber(raw.value);
  const spent = toNumber(raw.spent);
  if (max === null || max <= 0) return { limited: false, value: 0, max: 0 };

  const current = value ?? (spent !== null ? max - spent : max);
  const cap = Math.floor(max);
  return {
    limited: true,
    value: Math.max(0, Math.min(cap, Math.floor(current))),
    max: cap
  };
}

interface ItemOwner {
  items?: { get?: (id: string) => unknown } | null;
}

/** The `_id` to remember for a dropped document, when it is embedded in `actor`. */
export function embeddedItemIdFor(
  actorId: string | null | undefined,
  doc: unknown
): string | undefined {
  const d = doc as { id?: unknown; documentName?: unknown; parent?: { id?: string } } | null;
  if (!d || d.documentName !== "Item") return undefined;
  if (typeof d.id !== "string" || !d.id) return undefined;
  if (!actorId || d.parent?.id !== actorId) return undefined;
  return d.id;
}

/** Resolves the real Item a stored move mirrors: the actor's own copy by id first
    (the id survives token replacement), then the stored uuid. */
export function resolvePowerItem(
  actor: ItemOwner | null | undefined,
  power: Pick<PowerData, "itemId" | "uuid"> | null | undefined
): LinkedItemLike | null {
  if (!actor || !power) return null;

  const byId = (id: string | undefined): LinkedItemLike | null => {
    if (!id) return null;
    const found = actor.items?.get?.(id);
    return found && typeof found === "object" ? (found as LinkedItemLike) : null;
  };

  const direct = byId(power.itemId);
  if (direct) return direct;

  const uuid = power.uuid;
  if (!uuid) return null;

  const embedded = byId(uuid.split(".").pop());
  if (embedded) return embedded;

  try {
    const fromUuidSync = (
      globalThis as { foundry?: { utils?: { fromUuidSync?: (u: string, o?: unknown) => unknown } } }
    ).foundry?.utils?.fromUuidSync;
    if (typeof fromUuidSync !== "function") return null;
    const doc = fromUuidSync(uuid, { strict: false });
    if (doc && (doc as LinkedItemLike).documentName === "Item") return doc as LinkedItemLike;
  } catch {
    /* unresolvable uuid → legacy fallback */
  }
  return null;
}
