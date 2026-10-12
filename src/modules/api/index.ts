import type {
  PowerData,
  HudMode,
  TrainerFlags,
  PokemonNpcFlags,
  InventoryItemView,
  Badge,
  TraitSlot
} from "../types";
import { addPower, getPowers, removePower, updatePower } from "../core/powers";
import {
  addActorItemFromSource,
  consumeActorItem,
  deleteActorItem,
  detectHudMode,
  getPokemonNpcFlags,
  getTrainerFlags,
  levelUpPokemon,
  listActorInventory,
  moveActorItem,
  removePartySlot,
  setBadges,
  setHudMode,
  setParty,
  setPartySlot,
  setPaths,
  setPokemonNpcFlags,
  setPokemonXp,
  setSpecializations,
  setTrainerFlags
} from "../core/hud-data";
import { initHudSocket, broadcastPowerUsage, type PowerUsePayload } from "../net/socket";

export interface PokemonHudApi {
  version: string;

  getPowers: (actor: Actor) => PowerData[];
  addPower: (actor: Actor, source: Partial<PowerData>) => Promise<PowerData[]>;
  updatePower: (actor: Actor, index: number, patch: Partial<PowerData>) => Promise<PowerData[]>;
  removePower: (actor: Actor, index: number) => Promise<PowerData[]>;

  detectHudMode: (actor: Actor) => HudMode;
  setHudMode: (actor: Actor, mode: HudMode) => Promise<void>;

  getTrainerFlags: (actor: Actor) => TrainerFlags;
  setTrainerFlags: (actor: Actor, flags: TrainerFlags) => Promise<void>;
  setPaths: (actor: Actor, paths: TraitSlot[]) => Promise<void>;
  setSpecializations: (actor: Actor, specs: TraitSlot[]) => Promise<void>;
  listInventory: (actor: Actor) => InventoryItemView[];
  consumeInventoryItem: (actor: Actor, itemId: string) => Promise<void>;
  deleteInventoryItem: (actor: Actor, itemId: string) => Promise<void>;
  addItemFromSource: (actor: Actor, source: Record<string, unknown>) => Promise<void>;
  moveInventoryItem: (actor: Actor, fromId: string, toId: string | null) => Promise<void>;
  setParty: (actor: Actor, partyIds: string[]) => Promise<void>;
  setPartySlot: (actor: Actor, index: number, actorId: string) => Promise<void>;
  removePartySlot: (actor: Actor, index: number) => Promise<void>;
  setBadges: (actor: Actor, badges: Badge[]) => Promise<void>;

  getPokemonNpcFlags: (actor: Actor) => PokemonNpcFlags;
  setPokemonNpcFlags: (actor: Actor, flags: PokemonNpcFlags) => Promise<void>;
  setPokemonXp: (actor: Actor, value: number) => Promise<void>;
  levelUpPokemon: (actor: Actor) => Promise<void>;

  broadcastPowerUsage: (payload: PowerUsePayload) => void;
  initSocket: () => void;
}

const api: PokemonHudApi = {
  version: "0.1.9",
  getPowers,
  addPower,
  updatePower,
  removePower,
  detectHudMode,
  setHudMode,
  getTrainerFlags,
  setTrainerFlags,
  setPaths,
  setSpecializations,
  listInventory: listActorInventory,
  consumeInventoryItem: consumeActorItem,
  deleteInventoryItem: deleteActorItem,
  addItemFromSource: addActorItemFromSource,
  moveInventoryItem: moveActorItem,
  setParty,
  setPartySlot,
  removePartySlot,
  setBadges,
  getPokemonNpcFlags,
  setPokemonNpcFlags,
  setPokemonXp,
  levelUpPokemon,
  broadcastPowerUsage,
  initSocket: initHudSocket
};

export function registerApi(): void {
  game.modules.get("pokemon-hud-like")!.api = api;
}

export { api };
