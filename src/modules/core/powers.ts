import type { PowerData } from "../types";

const SCOPE = "pokemon-hud-like";
const POWERS_FLAG = "powers";

export const DEFAULT_TYPE = "normal";

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function normalizePower(source: Partial<PowerData> | null | undefined): PowerData {
  const pp = toInt(source?.pp, 1);
  const maxPp = Math.max(pp, toInt(source?.maxPp, 1));
  const rawType = typeof source?.type === "string" ? source.type.trim().toLowerCase() : "";

  return {
    name: typeof source?.name === "string" ? source.name.trim() : "",
    type: rawType || DEFAULT_TYPE,
    description: typeof source?.description === "string" ? source.description : "",
    damage: typeof source?.damage === "string" ? source.damage : "",
    pp,
    maxPp,
    effect: typeof source?.effect === "string" ? source.effect : "",
    requiresSave: Boolean(source?.requiresSave),
    saveType: typeof source?.saveType === "string" ? source.saveType : "",
    img: typeof source?.img === "string" && source.img.trim() ? source.img : "icons/svg/d20.svg",
    ...(typeof source?.uuid === "string" && source.uuid ? { uuid: source.uuid } : {})
  };
}

export function withPowerReplaced(
  list: PowerData[],
  index: number,
  patch: Partial<PowerData>
): PowerData[] {
  const out = [...list];
  if (index >= 0 && index < out.length) out[index] = normalizePower({ ...out[index], ...patch });
  return out;
}

export function withoutIndex<T>(list: T[], index: number): T[] {
  if (index < 0 || index >= list.length) return [...list];
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

export function isPowerValid(power: PowerData): boolean {
  return power.name.trim().length > 0;
}

export function listFromFlag(flag: unknown): PowerData[] {
  if (!Array.isArray(flag)) return [];
  return flag.map((entry) => normalizePower(entry as Partial<PowerData> | null));
}

export function clampPpPair(pp: number, maxPp: number): { pp: number; maxPp: number } {
  const p = Math.max(0, Math.floor(pp));
  return { pp: p, maxPp: Math.max(p, Math.floor(maxPp)) };
}

function getActorFlag(actor: Actor, key: string): unknown {
  return (actor as unknown as { getFlag(scope: string, key: string): unknown }).getFlag(SCOPE, key);
}

function setActorFlag(actor: Actor, key: string, value: unknown): Promise<unknown> {
  return (
    actor as unknown as {
      setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    }
  ).setFlag(SCOPE, key, value);
}

export function getPowers(actor: Actor): PowerData[] {
  return getPowerSlots(actor).filter((p): p is PowerData => p !== null);
}

export const MAX_POWER_SLOTS = 6;

export function getPowerSlots(actor: Actor): (PowerData | null)[] {
  const raw = getActorFlag(actor, POWERS_FLAG);
  const out: (PowerData | null)[] = new Array<PowerData | null>(MAX_POWER_SLOTS).fill(null);
  if (Array.isArray(raw)) {
    for (let i = 0; i < MAX_POWER_SLOTS; i++) {
      out[i] = raw[i] ? normalizePower(raw[i] as Partial<PowerData>) : null;
    }
  }
  return out;
}

export function getPowerSlot(actor: Actor, index: number): PowerData | null {
  const slots = getPowerSlots(actor);
  return slots[index] ?? null;
}

export async function setPowerSlot(
  actor: Actor,
  index: number,
  power: PowerData | null
): Promise<void> {
  const slots = getPowerSlots(actor);
  if (index >= 0 && index < MAX_POWER_SLOTS) slots[index] = power ? normalizePower(power) : null;
  await setActorFlag(actor, POWERS_FLAG, slots);
}

export function firstFreePowerSlot(actor: Actor): number {
  const slots = getPowerSlots(actor);
  for (let i = 0; i < slots.length; i++) if (!slots[i]) return i;
  return -1;
}

export async function setPowers(actor: Actor, powers: PowerData[]): Promise<void> {
  const slots: (PowerData | null)[] = new Array<PowerData | null>(MAX_POWER_SLOTS).fill(null);
  powers.slice(0, MAX_POWER_SLOTS).forEach((p, i) => {
    slots[i] = normalizePower(p);
  });
  await setActorFlag(actor, POWERS_FLAG, slots);
}

export async function addPower(actor: Actor, source: Partial<PowerData>): Promise<PowerData[]> {
  const slot = firstFreePowerSlot(actor);
  if (slot >= 0) await setPowerSlot(actor, slot, normalizePower(source));
  return getPowers(actor);
}

export async function removePower(actor: Actor, index: number): Promise<PowerData[]> {
  await setPowerSlot(actor, index, null);
  return getPowers(actor);
}

export async function updatePower(
  actor: Actor,
  index: number,
  patch: Partial<PowerData>
): Promise<PowerData[]> {
  const current = getPowerSlot(actor, index);
  if (current) await setPowerSlot(actor, index, normalizePower({ ...current, ...patch }));
  return getPowers(actor);
}
