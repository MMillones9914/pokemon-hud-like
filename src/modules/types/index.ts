export type HudMode = "trainer" | "pokemon";

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface AbilityStatView {
  key: AbilityKey;

  value: number;

  mod: number;

  save: number;

  modText: string;

  saveText: string;

  labelKey: string;
}

export interface SkillStatView {
  key: string;

  total: number;

  totalText: string;

  labelKey: string;
}

export interface StatBreakdownView {
  abilities: AbilityStatView[];
  skills: SkillStatView[];
}

export interface InventoryItem {
  name: string;
  img?: string;

  category: InventoryCategory;
  qty?: number;

  uuid?: string;

  description?: string;

  range?: string;
}

export interface InventoryItemView extends InventoryItem {
  id: string;

  tooltipHtml: string;

  /** Extra classes for Foundry's tooltip element (system rich preview). */
  tooltipClass: string;
}

export type InventoryCategory = "pokeball" | "object" | "key" | "tm" | "feature";

export interface Badge {
  name: string;
  img?: string;
  unlocked: boolean;
}

export interface PowerData {
  name: string;
  type: string;
  description: string;
  damage: string;
  pp: number;
  maxPp: number;
  effect: string;
  requiresSave: boolean;
  saveType: string;
  img?: string;

  uuid?: string;

  /** `_id` of the embedded Item this move mirrors, when it lives on the owner. */
  itemId?: string;
}

export type HpColor = "hp-high" | "hp-mid" | "hp-low";

export type HudPosition = "left" | "right" | "top" | "bottom";

export interface SystemHp {
  value: number;
  max: number;
}

export interface SystemXp {
  value: number;
  max: number;
}

export interface StatSnapshot {
  level: number;
  hp: { current: number; max: number; pct: number; color: HpColor };
  xp: { current: number; max: number; pct: number };
  type: string;
}

export interface PowerView extends PowerData {
  typeColor: string;

  depleted?: boolean;

  /** False for moves without a charge counter (unlimited or item-tracked). */
  showPp: boolean;

  /** Tooltip HTML, already escaped for a double-quoted attribute. */
  tooltipHtml: string;

  /** Extra classes for Foundry's tooltip element (system rich preview). */
  tooltipClass: string;
}

export interface TraitSlot {
  name: string;
  img?: string;
  uuid?: string;

  description?: string;
}

export interface TraitSlotView extends TraitSlot {
  tooltipHtml: string;
}

export interface TrainerFlags {
  paths: TraitSlot[];
  specializations: TraitSlot[];
  inventory: InventoryItem[];

  party: string[];
  badges: Badge[];

  objectSlots: TraitSlot[];
}

export interface PokemonNpcFlags {
  habilidad: TraitSlot;

  equipado: TraitSlot;

  xp?: number;
}

export interface TrainerHudContext {
  actorId: string;
  actorName: string;
  img: string;
  hp: { current: number; max: number; pct: number; color: HpColor };
  xp: { current: number; max: number; pct: number };
  level: string;
  type: string;
  typeColor: string;
  paths: (TraitSlotView | null)[];
  specializations: (TraitSlotView | null)[];
  inventory: InventoryItemView[];
  inventoryFilter: InventoryCategory;

  invCols: number;

  invRows: number;

  invCanEnlarge: boolean;

  invCanShrink: boolean;

  inventoryFill: number;
  party: PartySlot[];

  partyFill: number;
  badges: Badge[];

  badgesFill: number;

  objectSlots: (TraitSlotView | null)[];

  pokedexReady: boolean;
  pokedexImg: string | null;

  activePokemonImg: string | null;

  selectedPartyIndex: number | null;

  hasPartySelection: boolean;

  stats: StatBreakdownView;
}

export interface PowerSlotView {
  index: number;

  dmOnly: boolean;

  power: PowerView | null;
}

export interface PokemonHudContext {
  actorId: string;
  actorName: string;
  img: string;
  hp: { current: number; max: number; pct: number; color: HpColor };

  xp: { current: number; max: number; pct: number };

  xpTotal: number;

  xpLevelMax: number;

  canLevelUp: boolean;

  isMaxLevel: boolean;
  level: string;
  types: TypeBadge[];

  habilidad: TraitSlotView | null;

  equipado: TraitSlotView | null;

  powerSlots: PowerSlotView[];

  stats: StatBreakdownView;
}

export interface TypeBadge {
  name: string;
  color: string;
}

export interface PartySlot {
  actorId: string;
  name: string;
  img: string;
  hp: { current: number; max: number; pct: number; color: HpColor };
  type: string;
}

export interface HudBarContext {
  mode: HudMode;

  trainer?: TrainerHudContext;

  pokemon?: PokemonHudContext;
  isGM: boolean;
}

export const DEFAULT_TRAINER_FLAGS: TrainerFlags = {
  paths: [],
  specializations: [],
  inventory: [],
  party: [],
  badges: [],
  objectSlots: []
};

export const DEFAULT_POKEMON_FLAGS: PokemonNpcFlags = {
  habilidad: { name: "" },
  equipado: { name: "" }
};
