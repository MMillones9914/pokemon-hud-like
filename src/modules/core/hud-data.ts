import type {
  HudMode,
  TrainerFlags,
  PokemonNpcFlags,
  InventoryItem,
  InventoryItemView,
  Badge,
  PartySlot,
  TraitSlot,
  TraitSlotView,
  PowerData,
  TrainerHudContext,
  PokemonHudContext,
  HudBarContext,
  HpColor,
  InventoryCategory,
  TypeBadge
} from "../types";
import { DEFAULT_TRAINER_FLAGS, DEFAULT_POKEMON_FLAGS } from "../types";
import { clampedPct, hpColor, typeColor } from "./stats";
import { MAX_LEVEL, canLevelUp, xpMaxForLevel, xpNextMax } from "./leveling";
import { getPowerSlots, getPowers } from "./powers";
import { readStatBreakdown } from "./stat-breakdown";
import { getModuleFlag, setModuleFlag } from "./flags";
import { getKeyItemNames } from "./settings";
import { isKeyItem } from "./key-items";
import { formatChallengeRating, isNatureName, isPokedexName, type PokedexInfo } from "./pokedex";
import { normalizePokemonType, typeMatchups } from "./type-chart";
import { readChallengeRating } from "./capture";

const MODULE_ID = "pokemon-hud-like";

export const INV_COLS = 8;
export const INV_ROWS_DEFAULT = 2;
export const INV_ROWS_MIN = 2;
export const INV_ROWS_MAX = 12;

function getFlag(actor: Actor, key: string): unknown {
  return getModuleFlag(actor, key);
}

function setFlag(actor: Actor, key: string, value: unknown): Promise<unknown> {
  return setModuleFlag(actor, key, value);
}

export function detectHudMode(actor: Actor): HudMode {
  const explicit = getFlag(actor, "hudType");
  if (explicit === "trainer" || explicit === "pokemon") return explicit as HudMode;

  const type = String(actor.type);
  if (type === "character" || type === "pc") return "trainer";
  return "pokemon";
}

export async function setHudMode(actor: Actor, mode: HudMode): Promise<void> {
  await setFlag(actor, "hudType", mode);
}

export function getTrainerFlags(actor: Actor): TrainerFlags {
  const raw = getFlag(actor, "trainer") as Partial<TrainerFlags> | null | undefined;
  return {
    paths: Array.isArray(raw?.paths)
      ? raw.paths.map((p): TraitSlot => parseTraitSlot(p))
      : DEFAULT_TRAINER_FLAGS.paths,
    specializations: Array.isArray(raw?.specializations)
      ? raw.specializations.map((s): TraitSlot => parseTraitSlot(s))
      : DEFAULT_TRAINER_FLAGS.specializations,
    inventory: Array.isArray(raw?.inventory)
      ? raw.inventory.map((item): InventoryItem => ({
          name: String(item?.name ?? ""),
          category: validateCategory(item?.category),
          img: typeof item?.img === "string" ? item.img : undefined,
          qty: typeof item?.qty === "number" ? item.qty : 1,
          uuid: typeof item?.uuid === "string" ? item.uuid : undefined,
          description: typeof item?.description === "string" ? item.description : undefined,
          range: typeof item?.range === "string" ? item.range : undefined
        }))
      : DEFAULT_TRAINER_FLAGS.inventory,
    party: Array.isArray(raw?.party)
      ? raw.party.filter((id): id is string => typeof id === "string")
      : DEFAULT_TRAINER_FLAGS.party,
    badges: Array.isArray(raw?.badges)
      ? raw.badges.map((b): Badge => ({
          name: String(b?.name ?? ""),
          img: typeof b?.img === "string" ? b.img : undefined,
          unlocked: Boolean(b?.unlocked)
        }))
      : DEFAULT_TRAINER_FLAGS.badges,
    objectSlots: Array.isArray(raw?.objectSlots)
      ? raw.objectSlots.map((s): TraitSlot => parseTraitSlot(s))
      : DEFAULT_TRAINER_FLAGS.objectSlots
  };
}

export async function setTrainerFlags(actor: Actor, flags: TrainerFlags): Promise<void> {
  await setFlag(actor, "trainer", flags);
}

export async function setPaths(actor: Actor, paths: TraitSlot[]): Promise<void> {
  const tf = getTrainerFlags(actor);
  tf.paths = paths;
  await setTrainerFlags(actor, tf);
}

export async function setSpecializations(actor: Actor, specs: TraitSlot[]): Promise<void> {
  const tf = getTrainerFlags(actor);
  tf.specializations = specs;
  await setTrainerFlags(actor, tf);
}

export async function setTraitSlot(
  actor: Actor,
  key: "paths" | "specializations",
  index: number,
  slot: TraitSlot
): Promise<void> {
  if (index < 0 || index >= 4) return;
  const tf = getTrainerFlags(actor);
  const list = key === "paths" ? tf.paths : tf.specializations;
  while (list.length <= index) list.push({ name: "" });
  list[index] = slot;
  await setTrainerFlags(actor, tf);
}

export async function setObjectSlot(actor: Actor, index: number, slot: TraitSlot): Promise<void> {
  if (index < 0 || index >= 3) return;
  const tf = getTrainerFlags(actor);
  while (tf.objectSlots.length <= index) tf.objectSlots.push({ name: "" });
  tf.objectSlots[index] = slot;
  await setTrainerFlags(actor, tf);
}

function actorItems(actor: Actor): Item[] {
  const collection = (actor as unknown as { items?: { contents?: Item[] } }).items;
  return collection?.contents ?? [];
}

const OBJECT_ITEM_TYPES = new Set(["equipment", "consumable", "tool", "loot", "backpack"]);

/** dnd5e class / species / origin features are embedded `feat` items. */
const FEAT_ITEM_TYPE = "feat";

function isObjectItemType(type: string): boolean {
  return OBJECT_ITEM_TYPES.has(type);
}

function isInventoryItemType(type: string): boolean {
  return isObjectItemType(type) || type === FEAT_ITEM_TYPE;
}

export function listActorInventory(actor: Actor): InventoryItemView[] {
  const keyNames = getKeyItemNames();
  return actorItems(actor)
    .filter((item) => isInventoryItemType(String(item.type ?? "")))
    .map((item): InventoryItemView => {
      const sys = (item.system ?? {}) as Record<string, unknown>;
      const name = String(item.name ?? "");
      const itemType = String(item.type ?? "");
      const isFeat = itemType === FEAT_ITEM_TYPE;
      const data: InventoryItem = {
        name,
        img: typeof item.img === "string" ? item.img : undefined,
        category: categorizeInventoryItem(itemType, name, itemSubtypeValue(sys), keyNames),
        qty: isFeat ? undefined : itemQuantity(sys),
        uuid: typeof item.uuid === "string" ? item.uuid : undefined,
        description: itemDescription(sys),
        range: itemRange(sys)
      };
      return {
        ...data,
        id: typeof item.id === "string" ? item.id : "",
        tooltipHtml: buildInventoryTooltip(data)
      };
    });
}

export async function deleteActorItem(actor: Actor, itemId: string): Promise<void> {
  const item = (
    actor as unknown as {
      items?: { get: (id: string) => { delete?: () => Promise<unknown> } | undefined };
    }
  ).items?.get(itemId);
  if (!item?.delete) return;
  await item.delete();
}

export async function consumeActorItem(actor: Actor, itemId: string): Promise<void> {
  const item = (
    actor as unknown as { items?: { get: (id: string) => Item | undefined } }
  ).items?.get(itemId);
  if (!item) return;
  const sys = (item.system ?? {}) as Record<string, unknown>;
  const qty = itemQuantity(sys);
  if (qty <= 1) await item.delete();
  else await item.update({ "system.quantity": qty - 1 } as never);
}

export async function addActorItemFromSource(
  actor: Actor,
  source: Record<string, unknown>
): Promise<void> {
  const name = String(source.name ?? "");
  const isFeat = String(source.type ?? "") === FEAT_ITEM_TYPE;
  if (!isFeat) {
    const existing = actorItems(actor).find((i) => i.name === name);
    if (existing) {
      const sys = (existing.system ?? {}) as Record<string, unknown>;
      const qty = Number(sys.quantity ?? 1);
      await existing.update({ "system.quantity": qty + 1 } as never);
      return;
    }
    const sys = (source.system ?? {}) as Record<string, unknown>;
    if (sys.quantity === undefined) sys.quantity = 1;
  }
  await (
    actor as unknown as { createEmbeddedDocuments: (t: string, d: unknown[]) => Promise<unknown> }
  ).createEmbeddedDocuments("Item", [source]);
}

export async function moveActorItem(
  actor: Actor,
  fromId: string,
  toId: string | null
): Promise<void> {
  const items = actorItems(actor);
  const from = items.findIndex((i) => i.id === fromId);
  if (from < 0) return;
  const [moved] = items.splice(from, 1);
  const to = toId ? items.findIndex((i) => i.id === toId) : items.length;
  const insertAt = to < 0 ? items.length : Math.min(to, items.length);
  items.splice(insertAt, 0, moved);
  const updates = items.map((item, i) => ({ _id: item.id, sort: i * 10000 }));
  if (updates.length) {
    await (
      actor as unknown as { updateEmbeddedDocuments: (t: string, d: unknown[]) => Promise<unknown> }
    ).updateEmbeddedDocuments("Item", updates);
  }
}

export async function setParty(actor: Actor, partyIds: string[]): Promise<void> {
  const tf = getTrainerFlags(actor);
  tf.party = partyIds.slice(0, 6);
  await setTrainerFlags(actor, tf);
}

export async function setPartySlot(actor: Actor, index: number, actorId: string): Promise<void> {
  if (index < 0 || index >= 6) return;
  const tf = getTrainerFlags(actor);
  while (tf.party.length <= index) tf.party.push("");
  tf.party[index] = actorId;
  await setTrainerFlags(actor, tf);
}

export async function removePartySlot(actor: Actor, index: number): Promise<void> {
  const tf = getTrainerFlags(actor);
  if (index < 0 || index >= tf.party.length) return;
  tf.party.splice(index, 1);
  await setTrainerFlags(actor, tf);
}

export async function setBadges(actor: Actor, badges: Badge[]): Promise<void> {
  const tf = getTrainerFlags(actor);
  tf.badges = badges;
  await setTrainerFlags(actor, tf);
}

export async function addBadge(actor: Actor, badge: Badge): Promise<void> {
  const tf = getTrainerFlags(actor);
  if (tf.badges.length >= 8) return;
  tf.badges.push(badge);
  await setTrainerFlags(actor, tf);
}

export function getPokemonNpcFlags(actor: Actor): PokemonNpcFlags {
  const raw = getFlag(actor, "pokemonNpc") as Partial<PokemonNpcFlags> | null | undefined;
  return {
    habilidad: raw?.habilidad ? parseTraitSlot(raw.habilidad) : DEFAULT_POKEMON_FLAGS.habilidad,
    equipado: raw?.equipado ? parseTraitSlot(raw.equipado) : DEFAULT_POKEMON_FLAGS.equipado,
    xp: typeof raw?.xp === "number" && Number.isFinite(raw.xp) ? Math.max(0, raw.xp) : 0
  };
}

function pokemonTypes(actor: Actor): TypeBadge[] {
  const items = (actor as unknown as { items?: { contents?: Item[] } }).items?.contents ?? [];
  const result: TypeBadge[] = [];
  for (const item of items) {
    const itemType = String(item.type);
    if (itemType !== "feat") continue;
    const sys = (item.system ?? {}) as Record<string, unknown>;
    const typeInfo = sys.type as Record<string, unknown> | undefined;
    if (typeInfo?.value !== "pokemon" || typeInfo?.subtype !== "type") continue;

    const rawName = String(item.name ?? "").trim();
    const displayName = rawName.replace(/\s*-?\s*type$/i, "").trim() || rawName;
    if (!displayName) continue;
    const identifier = typeof sys.identifier === "string" ? sys.identifier : "";
    const key = identifier.endsWith("-type") ? identifier.slice(0, -5) : displayName.toLowerCase();
    result.push({ name: displayName, color: typeColor(key) });
  }
  return result;
}

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function featType(item: Item): { value: string; subtype: string } {
  const sys = (item.system ?? {}) as Record<string, unknown>;
  const typeInfo = (sys.type ?? {}) as Record<string, unknown>;
  return { value: normalizeToken(typeInfo.value), subtype: normalizeToken(typeInfo.subtype) };
}

/** Names of feat items whose feature type/subtype mentions the given kind ("ability", "move", "nature"). */
function pokemonFeatNames(actor: Actor, kind: string): string[] {
  const names: string[] = [];
  for (const item of actorItems(actor)) {
    if (String(item.type) !== FEAT_ITEM_TYPE) continue;
    const { value, subtype } = featType(item);
    if (!value.includes(kind) && !subtype.includes(kind)) continue;
    const name = String(item.name ?? "").trim();
    if (name) names.push(name);
  }
  return names;
}

function traitValues(raw: unknown): string[] {
  const out: string[] = [];
  const push = (entry: unknown): void => {
    if (typeof entry !== "string") return;
    const value = entry.trim();
    if (value) out.push(value);
  };
  if (Array.isArray(raw)) {
    raw.forEach(push);
  } else if (raw && typeof raw === "object") {
    const obj = raw as { value?: unknown; custom?: unknown };
    if (Array.isArray(obj.value)) obj.value.forEach(push);
    else push(obj.value);
    if (typeof obj.custom === "string") obj.custom.split(/[;,|]/).forEach(push);
  } else if (typeof raw === "string") {
    raw.split(/[;,|]/).forEach(push);
  }
  return out;
}

/** Resistances/weaknesses/immunities carried by the Pokémon's feature items. */
function featTraitValues(actor: Actor, key: "dr" | "dv" | "di"): string[] {
  const out: string[] = [];
  for (const item of actorItems(actor)) {
    if (String(item.type) !== FEAT_ITEM_TYPE) continue;
    const sys = (item.system ?? {}) as Record<string, unknown>;
    const traits = sys.traits as Record<string, unknown> | undefined;
    if (!traits) continue;
    out.push(...traitValues(traits[key]));
  }
  return out;
}

function dedupe(entries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    const key = normalizeToken(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function drawTypes(actor: Actor): string[] {
  const keys: string[] = [];
  for (const badge of pokemonTypes(actor)) {
    const key = normalizePokemonType(badge.name);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Nature is usually a "Monster Feature" or a feature/item named after one of the 25 natures. */
function pokemonNature(actor: Actor): string {
  const named = pokemonFeatNames(actor, "nature")[0];
  if (named) return named;
  let monster = "";
  for (const item of actorItems(actor)) {
    if (String(item.type) !== FEAT_ITEM_TYPE) continue;
    if (featType(item).value !== "monster") continue;
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    if (isNatureName(name)) return name;
    monster = monster || name;
  }
  for (const item of actorItems(actor)) {
    const name = String(item.name ?? "").trim();
    if (name && isNatureName(name)) return name;
  }
  return monster || readPokemonField(actor, "nature");
}

function pokemonAbility(actor: Actor): string {
  return (
    getPokemonNpcFlags(actor).habilidad.name.trim() ||
    pokemonFeatNames(actor, "ability")[0] ||
    readPokemonField(actor, "ability")
  );
}

export function readPokemonField(actor: Actor, key: string): string {
  const fromFeat = pokemonFeatNames(actor, key)[0];
  if (fromFeat) return fromFeat;
  const sys = (actor.system ?? {}) as Record<string, unknown>;
  const details = (sys.details ?? {}) as Record<string, unknown>;
  const traits = (sys.traits ?? {}) as Record<string, unknown>;
  for (const source of [details[key], traits[key], sys[key]]) {
    if (typeof source === "string" && source.trim()) return source.trim();
  }
  return "";
}

export function readPokedexItem(actor: Actor): { name: string; img: string } | null {
  for (const item of actorItems(actor)) {
    const name = String(item.name ?? "").trim();
    if (!isPokedexName(name)) continue;
    return { name, img: String((item as { img?: unknown }).img ?? "") };
  }
  return null;
}

export function hasPokedex(actor: Actor): boolean {
  return readPokedexItem(actor) !== null;
}

export function readPokedexInfo(actor: Actor): PokedexInfo {
  const sys = (actor.system ?? {}) as Record<string, unknown>;
  const traits = (sys.traits ?? {}) as Record<string, unknown>;
  let moves = getPowers(actor)
    .map((power) => power.name)
    .filter((name) => name.trim().length > 0);
  if (moves.length === 0) moves = pokemonFeatNames(actor, "move");

  let weaknesses = dedupe([...traitValues(traits.dv), ...featTraitValues(actor, "dv")]);
  let resistances = dedupe([...traitValues(traits.dr), ...featTraitValues(actor, "dr")]);
  let immunities = dedupe([...traitValues(traits.di), ...featTraitValues(actor, "di")]);
  if (!weaknesses.length && !resistances.length && !immunities.length) {
    const matchups = typeMatchups(drawTypes(actor));
    weaknesses = [...matchups.weaknesses];
    resistances = [...matchups.resistances];
    immunities = [...matchups.immunities];
  }

  return {
    name: String(actor.name ?? ""),
    cr: formatChallengeRating(readChallengeRating(sys)),
    weaknesses,
    resistances,
    immunities,
    moves,
    nature: pokemonNature(actor),
    ability: pokemonAbility(actor)
  };
}

export async function setPokemonNpcFlags(actor: Actor, flags: PokemonNpcFlags): Promise<void> {
  await setFlag(actor, "pokemonNpc", flags);
}

export async function setPokemonXp(actor: Actor, value: number): Promise<void> {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const pf = getPokemonNpcFlags(actor);
  pf.xp = clamped;
  await setPokemonNpcFlags(actor, pf);
}

export async function setPokemonSlot(
  actor: Actor,
  key: "habilidad" | "equipado",
  slot: TraitSlot
): Promise<void> {
  const pf = getPokemonNpcFlags(actor);
  pf[key] = slot;
  await setPokemonNpcFlags(actor, pf);
}

export function readPokemonLevel(system: unknown): number {
  const data = (system ?? {}) as Record<string, unknown>;
  const classes = data.classes as Record<string, unknown> | undefined;
  if (classes && typeof classes === "object") {
    let total = 0;
    for (const key of Object.keys(classes)) {
      const entry = classes[key] as Record<string, unknown> | null | undefined;
      total += typeof entry?.levels === "number" ? entry.levels : 0;
    }
    if (total > 0) return total;
  }
  const details = (data.details ?? {}) as Record<string, unknown>;
  const level = details.level;
  return typeof level === "number" && level > 0 ? level : 1;
}

export async function levelUpPokemon(actor: Actor): Promise<void> {
  const sys = actor.system as Record<string, unknown>;
  const classes = sys?.classes as Record<string, unknown> | undefined;
  let updated = false;
  if (classes && typeof classes === "object") {
    let bestId: string | null = null;
    let bestLevels = -1;
    for (const key of Object.keys(classes)) {
      const entry = classes[key] as Record<string, unknown> | null | undefined;
      const levels = typeof entry?.levels === "number" ? entry.levels : 0;
      if (levels > bestLevels) {
        bestLevels = levels;
        bestId = key;
      }
    }
    if (bestId) {
      await actor.update({ [`system.classes.${bestId}.levels`]: bestLevels + 1 } as never);
      updated = true;
    }
  }
  if (!updated) {
    const level = readPokemonLevel(sys);
    await actor.update({ "system.details.level": level + 1 } as never);
  }
}

function actorHp(actor: Actor): { current: number; max: number; pct: number; color: HpColor } {
  const sys = actor.system as Record<string, unknown>;
  const attrs = (sys?.attributes ?? {}) as Record<string, unknown>;
  const hpRaw = (attrs.hp ?? {}) as Record<string, number>;
  const current = typeof hpRaw.value === "number" ? hpRaw.value : 0;
  const max = typeof hpRaw.max === "number" ? hpRaw.max : 1;
  const pct = clampedPct(current, max);
  return { current, max, pct, color: hpColor(pct) };
}

function actorXp(actor: Actor): { current: number; max: number; pct: number } {
  const sys = actor.system as Record<string, unknown>;
  const attrs = (sys?.attributes ?? {}) as Record<string, unknown>;
  const xpRaw = (attrs.xp ?? {}) as Record<string, number>;
  const current = typeof xpRaw.value === "number" ? xpRaw.value : 0;
  const max = typeof xpRaw.max === "number" ? xpRaw.max : 1;
  return { current, max, pct: clampedPct(current, max) };
}

function actorLevel(actor: Actor): string {
  const sys = actor.system as Record<string, unknown>;
  const details = (sys?.details ?? {}) as Record<string, unknown>;
  return String(typeof details.level === "number" ? details.level : 1);
}

function actorType(actor: Actor): string {
  const sys = actor.system as Record<string, unknown>;
  const attrs = (sys?.attributes ?? {}) as Record<string, unknown>;
  return typeof attrs.type === "string" ? attrs.type : "normal";
}

export function resolvePartyActor(id: string): Actor | null {
  const tokens = (
    globalThis as unknown as {
      canvas?: { tokens?: { placeables?: unknown } };
    }
  ).canvas?.tokens?.placeables;
  if (Array.isArray(tokens)) {
    for (const placeable of tokens) {
      const doc = (placeable as { document?: { actorId?: string } }).document;
      const actor = (placeable as { actor?: Actor | null }).actor;
      if (doc?.actorId === id && actor) return actor;
    }
  }
  return game.actors?.get(id) ?? null;
}

export interface ActiveSummon {
  tokenId: string;
  actorId: string;
  name: string;
  img: string;
}

interface SummonTokenDocumentLike {
  id?: string;
  actorId?: string;
  flags?: Record<string, Record<string, unknown> | undefined>;
}

/** The token currently summoned by a trainer, tracked by the module's `summoner` token flag. */
export function activeSummon(trainerId: string): ActiveSummon | null {
  if (!trainerId) return null;
  const tokens = (
    globalThis as unknown as {
      canvas?: { tokens?: { placeables?: unknown } };
    }
  ).canvas?.tokens?.placeables;
  if (!Array.isArray(tokens)) return null;
  for (const placeable of tokens) {
    const doc = (placeable as { document?: SummonTokenDocumentLike }).document;
    if (doc?.flags?.[MODULE_ID]?.summoner !== trainerId) continue;
    const actor = (placeable as { actor?: Actor | null }).actor;
    return {
      tokenId: doc.id ?? "",
      actorId: doc.actorId ?? "",
      name: actor?.name ?? doc.actorId ?? "",
      img: actor?.img ?? "icons/svg/mystery-man.svg"
    };
  }
  return null;
}

function resolvePartySlots(partyIds: string[]): PartySlot[] {
  const slots: PartySlot[] = [];
  for (const id of partyIds) {
    const actor = resolvePartyActor(id);
    if (!actor) {
      slots.push({
        actorId: id,
        name: id,
        img: "icons/svg/mystery-man.svg",
        hp: { current: 0, max: 1, pct: 0, color: "hp-low" },
        type: "normal"
      });
      continue;
    }
    const hp = actorHp(actor);
    slots.push({
      actorId: actor.id ?? id,
      name: actor.name ?? id,
      img: actor.img ?? "icons/svg/mystery-man.svg",
      hp,
      type: actorType(actor)
    });
  }
  return slots;
}

export function buildTrainerContext(
  actor: Actor,
  filter: InventoryCategory = "object",
  rows = INV_ROWS_DEFAULT
): TrainerHudContext {
  const tf = getTrainerFlags(actor);
  const rowCount = Math.min(INV_ROWS_MAX, Math.max(INV_ROWS_MIN, rows));
  const capacity = INV_COLS * rowCount;
  const inventory = listActorInventory(actor).filter((i) => i.category === filter);
  const shown = inventory;
  const summon = activeSummon(actor.id ?? "");
  return {
    actorId: actor.id ?? "",
    actorName: actor.name ?? "Unknown",
    img: actor.img ?? "icons/svg/mystery-man.svg",
    hp: actorHp(actor),
    xp: actorXp(actor),
    level: actorLevel(actor),
    type: actorType(actor),
    typeColor: typeColor(actorType(actor)),
    paths: padTraits(
      tf.paths.map((s): TraitSlotView => ({ ...s, tooltipHtml: buildTraitTooltip(s) }))
    ),
    specializations: padTraits(
      tf.specializations.map((s): TraitSlotView => ({ ...s, tooltipHtml: buildTraitTooltip(s) }))
    ),
    inventory: shown,
    inventoryFilter: filter,
    invCols: INV_COLS,
    invRows: rowCount,
    invCanEnlarge: rowCount < INV_ROWS_MAX,
    invCanShrink: rowCount > INV_ROWS_MIN,
    inventoryFill: Math.max(0, capacity - shown.length),
    party: resolvePartySlots(tf.party),
    partyFill: Math.max(0, 6 - tf.party.length),
    badges: tf.badges,
    badgesFill: Math.max(0, 8 - tf.badges.length),
    objectSlots: Array.from({ length: 3 }, (_, i) => {
      const s = tf.objectSlots[i];
      return s?.name ? { ...s, tooltipHtml: buildTraitTooltip(s) } : null;
    }),
    pokedexReady: hasPokedex(actor),
    pokedexImg: readPokedexItem(actor)?.img ?? null,
    activePartyId: summon?.actorId ?? null,
    activePokemonImg: summon?.img ?? null,
    selectedPartyIndex: null,
    hasPartySelection: false,
    stats: readStatBreakdown(actor.system)
  };
}

export function buildPokemonContext(actor: Actor): PokemonHudContext {
  const pf = getPokemonNpcFlags(actor);
  const powerSlots = getPowerSlots(actor).map((p, i) => ({
    index: i,
    dmOnly: i % 3 === 2,
    power: p
      ? {
          ...p,
          typeColor: typeColor(p.type),
          depleted: p.pp <= 0,
          tooltipHtml: buildPowerTooltip(p)
        }
      : null
  }));
  const level = readPokemonLevel(actor.system);
  const xpTotal = Math.max(0, Math.floor(pf.xp ?? 0));
  const xpMax = xpNextMax(level) ?? xpMaxForLevel(level);
  const xp = { current: xpTotal, max: xpMax, pct: clampedPct(xpTotal, xpMax) };
  return {
    actorId: actor.id ?? "",
    actorName: actor.name ?? "Unknown",
    img: actor.img ?? "icons/svg/mystery-man.svg",
    hp: actorHp(actor),
    xp,
    xpTotal,
    xpLevelMax: xpNextMax(level) ?? xpMaxForLevel(level),
    canLevelUp: canLevelUp(xpTotal, level),
    isMaxLevel: level >= MAX_LEVEL,
    level: String(level),
    types: pokemonTypes(actor),
    habilidad: pf.habilidad.name
      ? { ...pf.habilidad, tooltipHtml: buildTraitTooltip(pf.habilidad) }
      : null,
    equipado: pf.equipado.name
      ? { ...pf.equipado, tooltipHtml: buildTraitTooltip(pf.equipado) }
      : null,
    powerSlots,
    stats: readStatBreakdown(actor.system)
  };
}

export function buildHudBarContext(
  actor: Actor,
  filter: InventoryCategory = "object",
  invRows = INV_ROWS_DEFAULT
): HudBarContext {
  const mode = detectHudMode(actor);
  return {
    mode,
    trainer: mode === "trainer" ? buildTrainerContext(actor, filter, invRows) : undefined,
    pokemon: mode === "pokemon" ? buildPokemonContext(actor) : undefined,
    isGM: Boolean(game.user?.isGM)
  };
}

function validateCategory(raw: unknown): InventoryCategory {
  if (
    raw === "pokeball" ||
    raw === "object" ||
    raw === "key" ||
    raw === "tm" ||
    raw === "feature"
  ) {
    return raw;
  }
  return "object";
}

function parseTraitSlot(value: unknown): TraitSlot {
  if (typeof value === "string") return { name: value };
  const name =
    typeof (value as { name?: unknown } | null)?.name === "string"
      ? (value as { name: string }).name
      : String((value as { name?: unknown } | null)?.name ?? "");
  const img =
    typeof (value as { img?: unknown } | null)?.img === "string"
      ? (value as { img: string }).img
      : undefined;
  const uuid =
    typeof (value as { uuid?: unknown } | null)?.uuid === "string"
      ? (value as { uuid: string }).uuid
      : undefined;
  const description =
    typeof (value as { description?: unknown } | null)?.description === "string"
      ? (value as { description: string }).description
      : undefined;
  return { name, img, uuid, description };
}

function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function categorizeItemName(name: string, subtype?: string): InventoryCategory {
  const normalized = normalizeItemName(name);
  if (normalized.includes(" ball") || normalized.includes("pokeball")) return "pokeball";
  const haystack = `${name} ${subtype ?? ""}`.toLowerCase();
  if (haystack.includes("tm:")) return "tm";
  return "object";
}

export function categorizeInventoryItem(
  type: string,
  name: string,
  subtype?: string,
  keyNames: readonly string[] = []
): InventoryCategory {
  if (String(type ?? "").toLowerCase() === FEAT_ITEM_TYPE) return "feature";
  if (isKeyItem(name, keyNames)) return "key";
  return categorizeItemName(name, subtype);
}

function itemSubtypeValue(sys: Record<string, unknown>): string {
  const type = sys.type as Record<string, unknown> | undefined;
  return typeof type?.value === "string" ? type.value : "";
}

function itemQuantity(sys: Record<string, unknown>): number {
  const q = sys.quantity;
  return typeof q === "number" ? q : 1;
}

function itemDescription(sys: Record<string, unknown>): string | undefined {
  const desc = sys.description as Record<string, unknown> | undefined;
  const value = desc?.value ?? desc ?? "";
  const text = String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function itemRange(sys: Record<string, unknown>): string | undefined {
  const range = sys.range as Record<string, unknown> | undefined;
  if (!range) return undefined;
  const value = Number(range.value);
  const long = Number(range.long);
  if (!value && !long) return undefined;
  const units = typeof range.units === "string" ? range.units : "";
  const base = long && value !== long ? `${value}/${long}` : `${value}`;
  return `${base}${units ? ` ${units}` : ""}`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function categoryLabel(category: InventoryCategory): string {
  const labels: Record<InventoryCategory, string> = {
    pokeball: "pokemon-hud-like.hud.filterPokeball",
    object: "pokemon-hud-like.hud.filterObjects",
    key: "pokemon-hud-like.hud.filterKey",
    tm: "pokemon-hud-like.hud.filterTms",
    feature: "pokemon-hud-like.hud.filterFeatures"
  };
  try {
    return game.i18n.localize(labels[category]);
  } catch {
    return category;
  }
}

function localizeOr(key: string, fallback = ""): string {
  try {
    return game.i18n.localize(key) || fallback;
  } catch {
    return fallback;
  }
}

function buildInventoryTooltip(item: InventoryItem): string {
  const img = item.img ? `<img class='ph-tooltip-img' src='${escapeHtml(item.img)}' alt='' />` : "";
  const name = escapeHtml(item.name || "—");
  const type = escapeHtml(categoryLabel(item.category));
  const range = item.range ? `<div class='ph-tooltip-range'>${escapeHtml(item.range)}</div>` : "";
  const desc = item.description
    ? `<div class='ph-tooltip-desc'>${escapeHtml(item.description)}</div>`
    : "";
  const hint =
    item.category === "feature" ? localizeOr("pokemon-hud-like.hud.featureHint", "") : "";
  const hintHtml = hint ? `<div class='ph-tooltip-hint'>${escapeHtml(hint)}</div>` : "";
  return (
    `<div class='ph-tooltip'>` +
    `<div class='ph-tooltip-head'>${img}<div class='ph-tooltip-meta'>` +
    `<div class='ph-tooltip-name'>${name}</div>` +
    `<div class='ph-tooltip-type'>${type}</div>` +
    `</div></div>${range}${desc}${hintHtml}</div>`
  );
}

function buildTraitTooltip(slot: TraitSlot): string {
  const img = slot.img ? `<img class='ph-tooltip-img' src='${escapeHtml(slot.img)}' alt='' />` : "";
  const name = escapeHtml(slot.name || "—");
  const desc = slot.description
    ? `<div class='ph-tooltip-desc'>${escapeHtml(slot.description)}</div>`
    : "";
  return (
    `<div class='ph-tooltip'>` +
    `<div class='ph-tooltip-head'>${img}<div class='ph-tooltip-meta'>` +
    `<div class='ph-tooltip-name'>${name}</div>` +
    `</div></div>${desc}</div>`
  );
}

function buildPowerTooltip(power: PowerData): string {
  const img = power.img
    ? `<img class='ph-tooltip-img' src='${escapeHtml(power.img)}' alt='' />`
    : "";
  const name = escapeHtml(power.name || "—");
  const metaParts = [power.type, `PP ${power.pp}/${power.maxPp}`, power.damage]
    .map((part) => String(part ?? "").trim())
    .filter((part) => part.length > 0);
  const meta = metaParts.length
    ? `<div class='ph-tooltip-type'>${metaParts.map((part) => escapeHtml(part)).join(" · ")}</div>`
    : "";
  const desc = power.description
    ? `<div class='ph-tooltip-desc'>${escapeHtml(power.description)}</div>`
    : "";
  let hint = "";
  try {
    hint = game.i18n.localize("pokemon-hud-like.hud.usePower");
  } catch {
    hint = "";
  }
  const hintLine = hint ? `<div class='ph-tooltip-hint'>${escapeHtml(hint)}</div>` : "";
  return (
    `<div class='ph-tooltip'>` +
    `<div class='ph-tooltip-head'>${img}<div class='ph-tooltip-meta'>` +
    `<div class='ph-tooltip-name'>${name}</div>${meta}` +
    `</div></div>${desc}${hintLine}</div>`
  );
}

function padTraits(slots: TraitSlotView[]): (TraitSlotView | null)[] {
  const out: (TraitSlotView | null)[] = slots.slice(0, 4);
  while (out.length < 4) out.push(null);
  return out;
}
