import type { DeepPartial } from "fvtt-types/utils";
import type {
  HudBarContext,
  HudMode,
  InventoryCategory,
  InventoryItemView,
  PowerData,
  PowerSlotView
} from "../types";
import {
  addActorItemFromSource,
  addBadge,
  attrEscape,
  buildHudBarContext,
  consumeActorItem,
  deleteActorItem,
  detectHudMode,
  getPokemonNpcFlags,
  getTrainerFlags,
  hasPokedex,
  INV_COLS,
  INV_ROWS_DEFAULT,
  INV_ROWS_MAX,
  INV_ROWS_MIN,
  levelUpPokemon,
  moveActorItem,
  readPokemonLevel,
  readPokedexInfo,
  readPokedexItem,
  removePartySlot,
  resolvePartyActor,
  setObjectSlot,
  setParty,
  setPokemonSlot,
  setPokemonXp,
  setTraitSlot
} from "../core/hud-data";
import { canLevelUp } from "../core/leveling";
import { logger } from "../core/logger";
import { pokedexTier, type PokedexInfo, type PokedexTier } from "../core/pokedex";
import {
  captureDc,
  captureModifiers,
  captureSucceeded,
  finalCaptureDc,
  readChallengeRating,
  type CaptureContext
} from "../core/capture";
import {
  normalizePower,
  getPowerSlot,
  setPowerSlot,
  removePower,
  reorderPowerSlots,
  updatePower
} from "../core/powers";
import {
  embeddedItemIdFor,
  resolvePowerItem,
  readMoveUses,
  type LinkedItemLike
} from "../core/move-link";
import { loadMovePreview, movePreviewKey } from "../data/move-preview";
import { patchChildren } from "../core/dom-patch";
import { isMobileMode } from "../core/mobile";
import { getSettings } from "../core/settings";
import { readStatBreakdown } from "../core/stat-breakdown";
import { d20Formula, rollModeFromKeys, type RollMode } from "../core/roll-mode";
import { SUMMON_RANGE_FEET, maxSummonCells, summonOffsets } from "../core/summon";

const MODULE_ID = "pokemon-hud-like";

/** Drag payload type used to tell an internal power reorder from an item drop. */
const POWER_DRAG_TYPE = "application/x-pokemon-hud-power";

/** Foundry's Handlebars renderer, used to build the bar off-DOM for in-place patching. */
function renderBarTemplate(path: string, data: unknown): Promise<string> | null {
  const render = (
    globalThis as {
      foundry?: {
        applications?: {
          handlebars?: { renderTemplate?: (p: string, d: unknown) => Promise<string> };
        };
      };
    }
  ).foundry?.applications?.handlebars?.renderTemplate;
  return typeof render === "function" ? render(path, data) : null;
}

function escapePokedexHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pokedexSection(label: string, value: string): string {
  return (
    `<div class="ph-dex-section">` +
    `<div class="ph-dex-section-label">${escapePokedexHtml(label)}</div>` +
    `<div class="ph-dex-section-value">${value}</div>` +
    `</div>`
  );
}

const TEXT_FALLBACK: Record<string, { en: string; es: string }> = {
  "pokemon-hud-like.chat.pokedex": {
    en: "{actor} scans {target} with the Pokédex",
    es: "{actor} escanea a {target} con la Pokédex"
  },
  "pokemon-hud-like.chat.pokedexCr": { en: "CR {cr}", es: "CR {cr}" },
  "pokemon-hud-like.chat.pokedexTraits": {
    en: "Resistances & weaknesses",
    es: "Resistencias y debilidades"
  },
  "pokemon-hud-like.chat.pokedexWeaknesses": { en: "Weak to", es: "Débil contra" },
  "pokemon-hud-like.chat.pokedexResistances": { en: "Resists", es: "Resiste" },
  "pokemon-hud-like.chat.pokedexImmunities": { en: "Immune to", es: "Inmune a" },
  "pokemon-hud-like.chat.pokedexMoves": { en: "Current moves", es: "Movimientos actuales" },
  "pokemon-hud-like.chat.pokedexNature": { en: "Nature", es: "Naturaleza" },
  "pokemon-hud-like.chat.pokedexAbility": { en: "Ability", es: "Habilidad" },
  "pokemon-hud-like.chat.pokedexLow": {
    en: "The scan only revealed the basics (rolled {total}).",
    es: "El escaneo solo reveló lo básico (resultado {total})."
  },
  "pokemon-hud-like.chat.pokedexUnknown": { en: "—", es: "—" },
  "pokemon-hud-like.hud.summon": { en: "Summon Pokémon", es: "Invocar Pokémon" },
  "pokemon-hud-like.hud.withdraw": { en: "Withdraw Pokémon", es: "Retirar Pokémon" },
  "pokemon-hud-like.hud.summonNoSelection": {
    en: "Select a party Pokémon first.",
    es: "Selecciona primero un Pokémon del equipo."
  },
  "pokemon-hud-like.hud.summonNoSpace": {
    en: "No free space within 15 ft of the trainer.",
    es: "No hay espacio libre a 15 pies del entrenador."
  },
  "pokemon-hud-like.hud.summonPick": {
    en: "Click a free space within 15 ft to summon. Right-click or Escape to cancel.",
    es: "Haz clic en un espacio libre a 15 pies para invocar. Clic derecho o Escape para cancelar."
  },
  "pokemon-hud-like.hud.summonTooFar": {
    en: "The Pokémon must be summoned within 15 ft of the trainer.",
    es: "El Pokémon debe invocarse a 15 pies o menos del entrenador."
  },
  "pokemon-hud-like.hud.summonNoToken": {
    en: "Place the trainer token on the scene first.",
    es: "Coloca primero el token del entrenador en la escena."
  },
  "pokemon-hud-like.hud.summonFailed": {
    en: "Could not summon the Pokémon.",
    es: "No se pudo invocar al Pokémon."
  },
  "pokemon-hud-like.hud.summonWithdrawFailed": {
    en: "Could not withdraw the Pokémon.",
    es: "No se pudo retirar al Pokémon."
  }
};

/** Localize a key, falling back to bundled strings when a stale lang file is served. */
function phText(key: string, data?: Record<string, unknown>): string {
  if (game.i18n.has(key)) return game.i18n.format(key, data);
  const fallback = TEXT_FALLBACK[key];
  if (!fallback) return key;
  const template = String(game.i18n.lang ?? "en")
    .toLowerCase()
    .startsWith("es")
    ? fallback.es
    : fallback.en;
  return game.i18n.format(template, data);
}

function damageTypeLabel(key: string): string {
  try {
    const config = (
      globalThis as unknown as {
        CONFIG?: { DND5E?: { damageTypes?: Record<string, { label?: string }> } };
      }
    ).CONFIG;
    const label = config?.DND5E?.damageTypes?.[key]?.label;
    if (label) return game.i18n.localize(label);
  } catch {
    // fall through to a plain label
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

interface BarRenderContext
  extends
    foundry.applications.api.HandlebarsApplicationMixin.RenderContext,
    foundry.applications.api.ApplicationV2.RenderContext {
  mode: HudMode;
  isTrainer: boolean;
  isPokemon: boolean;
  isGM: boolean;
  trainer: HudBarContext["trainer"];
  pokemon: HudBarContext["pokemon"];

  invFilter: string;

  selectedPokeballId: string | null;
  selectedPokeballName: string | null;
  selectedPokeballImg: string | null;

  showBadges: boolean;
}

interface BarConfiguration
  extends
    foundry.applications.api.HandlebarsApplicationMixin.Configuration,
    foundry.applications.api.ApplicationV2.Configuration {}

interface BarRenderOptions
  extends
    foundry.applications.api.HandlebarsApplicationMixin.RenderOptions,
    foundry.applications.api.ApplicationV2.RenderOptions {}

interface TokenDocumentLike {
  id?: string;
  actorId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  hidden?: boolean;
  delete?: () => Promise<unknown>;
  flags?: Record<string, Record<string, unknown> | undefined>;
  toObject?: () => Record<string, unknown>;
}

interface TokenPlaceableLike {
  document?: TokenDocumentLike | null;
  actor?: Actor | null;
  controlled?: boolean;
  control?: (options?: Record<string, unknown>) => unknown;
}

interface GridLike {
  size?: number;
  distance?: number;
  measurePath?: (waypoints: { x: number; y: number }[]) => { distance?: number } | undefined;
}

interface SceneLike {
  createEmbeddedDocuments?: (
    type: string,
    data: unknown[],
    options?: Record<string, unknown>
  ) => Promise<unknown>;
}

interface TokenLayerLike {
  placeables?: unknown;
  placeTokens?: (data: unknown[], options?: Record<string, unknown>) => Promise<unknown>;
  _cancelPlacement?: () => void;
}

interface CanvasLike {
  ready?: boolean;
  scene?: SceneLike | null;
  grid?: GridLike | null;
  tokens?: TokenLayerLike;
}

/** Actor surface used to build a summon Token document from its prototype Token. */
interface SummonActorLike {
  isOwner?: boolean;
  getTokenDocument?: (data?: object, options?: object) => Promise<TokenDocumentLike>;
}

interface PlacementConfirmArgs {
  document: TokenDocumentLike;
}

export class PokemonHudApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
)<BarRenderContext, BarConfiguration, BarRenderOptions> {
  static override DEFAULT_OPTIONS: DeepPartial<BarConfiguration> = {
    id: `${MODULE_ID}.bar`,
    tag: "section",
    classes: [MODULE_ID, "ph-bottom-bar", "ph-bar"],
    window: {
      title: "",
      resizable: false,
      frame: false
    },
    position: {
      width: 1200,
      height: "auto"
    }
  };

  static override PARTS: Record<
    string,
    foundry.applications.api.HandlebarsApplicationMixin.HandlebarsTemplatePart
  > = {
    bar: {
      template: `modules/${MODULE_ID}/templates/apps/pokemon-hud-0.2.1.hbs`,
      id: `${MODULE_ID}-bar`,
      root: true
    }
  };

  #actor: Actor | null = null;
  #mode: HudMode = "trainer";
  #invFilter: InventoryCategory = "object";
  #invRows = INV_ROWS_DEFAULT;
  #showBadges = false;
  #showStats = false;
  #minimized = false;
  #diceHideTimer: number | null = null;

  /** Actor id whose GM XP-editor popup is open (null = closed). Keyed per
      actor so every Pokémon has its own popup instance; cleared on actor switch. */
  #xpEditorOpenFor: string | null = null;

  #selectedPokeballId: string | null = null;

  #selectedPartyIndex: number | null = null;

  /** Power card currently highlighted as a reorder drop target. */
  #powerDropTarget: HTMLElement | null = null;

  /** True while Foundry's own token placement workflow is waiting for a click. */
  #placingSummon = false;

  #captureTimer: number | null = null;
  #onResizeBound?: () => void;
  #resizeObserver?: ResizeObserver;
  #sidebarObserver?: MutationObserver;
  #observedSidebar?: HTMLElement;

  #onDiceOver = (event: Event): void => {
    const wrap = this.#diceWrapFor(event);
    if (!wrap) return;
    const btn = wrap.querySelector<HTMLElement>(".ph-dice-btn");
    if (!btn) return;
    if (this.#diceHideTimer !== null) {
      window.clearTimeout(this.#diceHideTimer);
      this.#diceHideTimer = null;
    }
    btn.classList.add("ph-dice-visible");
  };

  #onDiceOut = (event: Event): void => {
    const wrap = this.#diceWrapFor(event);
    if (!wrap) return;
    const related = (event as MouseEvent).relatedTarget as Node | null;
    if (related && wrap.contains(related)) return;
    const btn = wrap.querySelector<HTMLElement>(".ph-dice-btn");
    if (!btn) return;
    if (this.#diceHideTimer !== null) window.clearTimeout(this.#diceHideTimer);
    this.#diceHideTimer = window.setTimeout(() => {
      btn.classList.remove("ph-dice-visible");
      this.#diceHideTimer = null;
    }, 3000);
  };

  #diceWrapFor(event: Event): HTMLElement | null {
    const root = this.element;
    if (!root) return null;
    const target = event.target as HTMLElement | null;
    const wrap = target?.closest<HTMLElement>(".ph-portrait-img-wrap") ?? null;
    return wrap && root.contains(wrap) ? wrap : null;
  }

  #onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;
    const mode = rollModeFromKeys(event as MouseEvent);
    if (action === "use-power") void this.#onUsePower(button);
    else if (action === "use-pokemon-slot") void this.#onUsePokemonSlot(button);
    else if (action === "open-sheet") this.#onOpenSheet();
    else if (action === "open-party-sheet") this.#onOpenPartySheet(button);
    else if (action === "select-party") this.#onSelectParty(button);
    else if (action === "toggle-summon") void this.#onToggleSummon();
    else if (action === "use-item") void this.#onUseItem(button);
    else if (action === "select-pokeball") this.#onSelectPokeball(button);
    else if (action === "throw-pokeball") void this.#onThrowPokeball();
    else if (action === "open-pokedex") void this.#onOpenPokedex(mode);
    else if (action === "use-trait") void this.#onUseTrait(button);
    else if (action === "set-inv-filter") this.#onSetInvFilter(button);
    else if (action === "inv-enlarge") this.#onAddRow();
    else if (action === "inv-shrink") this.#onRemoveRow();
    else if (action === "toggle-badges") this.#onToggleBadges();
    else if (action === "toggle-minimize") this.#onToggleMinimize();
    else if (action === "level-up") void this.#onLevelUp();
    else if (action === "toggle-xp-editor") void this.#onToggleXpEditor();
    else if (action === "toggle-stats") this.#onToggleStats();
    else if (action === "roll-ability") void this.#onRollAbility(button, mode);
    else if (action === "roll-skill") void this.#onRollSkill(button, mode);
  };

  #onDblClick = (event: Event): void => {
    const slot = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".ph-party-slot[data-actor-id]"
    );
    if (!slot || this.#mode !== "trainer") return;
    this.#onOpenPartySheet(slot);
  };

  #onChange = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.matches("[data-action='set-xp']")) return;
    const actor = this.#actor;
    if (!actor || this.#mode !== "pokemon" || !game.user?.isGM) return;
    const input = target as HTMLInputElement;
    const raw = Number(input.value);
    const value = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    input.value = String(value);
    void this.#mutateAndPatch(setPokemonXp(actor, value));
  };

  #onSubmit = (event: Event): void => {
    event.preventDefault();
  };

  constructor(options?: DeepPartial<BarConfiguration>) {
    super(options);
  }

  get currentActor(): Actor | null {
    return this.#actor;
  }

  get currentMode(): HudMode {
    return this.#mode;
  }

  /** True while Foundry's token placement workflow is waiting for a click. */
  get placingSummon(): boolean {
    return this.#placingSummon;
  }

  async refreshParty(): Promise<void> {
    if (!this.#actor || this.#mode !== "trainer") return;
    await this.#patchBar([".ph-party-grid"]);
  }

  async refreshPartyIfMember(actorId: string): Promise<void> {
    if (!this.#actor || this.#mode !== "trainer" || !actorId) return;
    if (this.#actor.id === actorId) return;
    if (!getTrainerFlags(this.#actor).party.includes(actorId)) return;
    await this.refreshParty();
  }

  override async _prepareContext(
    _options: DeepPartial<BarRenderOptions> & { isFirstRender: boolean }
  ): Promise<BarRenderContext> {
    if (!this.#actor) {
      return {
        mode: "trainer",
        isTrainer: true,
        isPokemon: false,
        isGM: false,
        trainer: undefined,
        pokemon: undefined,
        invFilter: this.#invFilter,
        selectedPokeballId: null,
        selectedPokeballName: null,
        selectedPokeballImg: null,
        showBadges: this.#showBadges
      };
    }
    const ctx = buildHudBarContext(this.#actor, this.#invFilter, this.#invRows);
    if (ctx.trainer) {
      ctx.trainer.selectedPartyIndex = this.#selectedPartyIndex;
      ctx.trainer.hasPartySelection = this.#selectedPartyIndex !== null;
    }
    if (ctx.trainer && this.#actor) {
      await this.#applyInventoryPreviews(this.#actor, ctx.trainer.inventory);
    }
    if (ctx.pokemon) await this.#applyMovePreviews(ctx.pokemon.powerSlots);
    if (ctx.pokemon) {
      ctx.pokemon.xpEditorOpen = ctx.isGM && this.#xpEditorOpenFor === ctx.pokemon.actorId;
    }
    return {
      mode: ctx.mode,
      isTrainer: ctx.mode === "trainer",
      isPokemon: ctx.mode === "pokemon",
      isGM: ctx.isGM,
      trainer: ctx.trainer,
      pokemon: ctx.pokemon,
      invFilter: this.#invFilter,
      selectedPokeballId: this.#selectedPokeballId,
      selectedPokeballName: this.#selectedPokeballItem()?.name ?? null,
      selectedPokeballImg: this.#selectedPokeballItem()?.img ?? null,
      showBadges: this.#showBadges
    };
  }

  /** Swaps the basic tooltip for the system's own rich item preview (the same
      card Foundry shows when hovering an item link in chat). */
  async #applyMovePreviews(slots: PowerSlotView[]): Promise<void> {
    const actor = this.#actor;
    if (!actor) return;
    await Promise.all(
      slots.map(async (slot) => {
        const power = slot.power;
        if (!power) return;
        const preview = await this.#richPreview(actor, power);
        if (!preview) return;
        power.tooltipHtml = preview.html;
        power.tooltipClass = preview.classes;
      })
    );
  }

  /** Inventory slots are the actor's real Items: show Foundry's own item card so
      every property (description, activities, uses, …) is visible on hover. */
  async #applyInventoryPreviews(actor: Actor, items: InventoryItemView[]): Promise<void> {
    await Promise.all(
      items.map(async (item) => {
        const preview = await this.#richPreview(actor, { itemId: item.id, uuid: item.uuid });
        if (!preview) return;
        item.tooltipHtml = preview.html;
        item.tooltipClass = preview.classes;
      })
    );
  }

  /** Resolves an item link to its rich tooltip, escaped for a double-quoted attribute. */
  async #richPreview(
    actor: Actor,
    ref: { itemId?: string; uuid?: string }
  ): Promise<{ html: string; classes: string } | null> {
    const key = movePreviewKey(actor.id, ref);
    if (!key) return null;
    const preview = await loadMovePreview(key, resolvePowerItem(actor, ref));
    if (!preview) return null;
    return { html: attrEscape(preview.html), classes: preview.classes.join(" ") };
  }

  override render(options?: DeepPartial<BarRenderOptions>): Promise<this>;
  override render(options: boolean, _options?: DeepPartial<BarRenderOptions>): Promise<this>;
  override render(
    options?: DeepPartial<BarRenderOptions> | boolean,
    _options?: DeepPartial<BarRenderOptions>
  ): Promise<this> {
    const promise =
      typeof options === "boolean" ? super.render(options, _options) : super.render(options);
    return promise.catch((err) => {
      logger.error(`PokemonHudApp.render: ${String(err)}`);
      return this;
    });
  }

  protected override async _onFirstRender(
    _context: DeepPartial<BarRenderContext>,
    _options: DeepPartial<BarRenderOptions>
  ): Promise<void> {
    try {
      await super._onFirstRender(_context, _options);
    } catch (err) {
      this.#handleError("_onFirstRender", err);
    }
    try {
      this.element.addEventListener("click", this.#onClick);
      this.element.addEventListener("dblclick", this.#onDblClick);
      this.element.addEventListener("change", this.#onChange);
      this.element.addEventListener("submit", this.#onSubmit);
      this.element.addEventListener("contextmenu", this.#onContextMenu);
      this.element.addEventListener("dragstart", this.#onDragStart);
      this.element.addEventListener("dragover", this.#onDragOver);
      this.element.addEventListener("dragend", this.#onDragEnd);
      this.element.addEventListener("drop", this.#onDrop);
      this.element.addEventListener("mouseover", this.#onDiceOver);
      this.element.addEventListener("mouseout", this.#onDiceOut);
      document.addEventListener("click", this.#onDocumentClick);
      this.#bindPositioning();
    } catch (err) {
      this.#handleError("bind events", err);
    }
  }

  protected override async _onRender(
    _context: DeepPartial<BarRenderContext>,
    _options: DeepPartial<BarRenderOptions>
  ): Promise<void> {
    try {
      await super._onRender(_context, _options);
      this.#applyRenderEffects();
    } catch (err) {
      this.#handleError("_onRender", err);
    }
  }

  override _onClose(options: DeepPartial<BarRenderOptions>): void {
    if (this.#placingSummon) {
      this.#placingSummon = false;
      this.#canvas()?.tokens?._cancelPlacement?.();
    }
    if (this.#diceHideTimer !== null) {
      window.clearTimeout(this.#diceHideTimer);
      this.#diceHideTimer = null;
    }
    this.#xpEditorOpenFor = null;
    document.removeEventListener("click", this.#onDocumentClick);
    this.#removeCaptureOverlay();
    applyMacroBarPreference();
    this.#unbindPositioning();
    super._onClose(options);
  }

  async setActor(actor: Actor): Promise<void> {
    const changed = this.#actor?.id !== actor.id;
    this.#actor = actor;
    this.#mode = detectHudMode(actor);
    if (changed) {
      this.#selectedPartyIndex = null;
      this.#xpEditorOpenFor = null;
    }
    if (this.rendered) await this.#patchBar([]);
    else await this.render({ force: true });
  }

  async clearActor(): Promise<void> {
    this.#actor = null;
    await this.close();
  }

  #applyThemeClass(): void {
    if (this.element.classList.contains("themed")) return;
    let raw = "";
    try {
      const scheme = game.settings.get("core", "uiConfig").colorScheme;
      raw = scheme.applications || scheme.interface || "";
    } catch {
      raw = "";
    }
    const dark =
      raw === "dark"
        ? true
        : raw === "light"
          ? false
          : matchMedia("(prefers-color-scheme: dark)").matches;
    this.element.classList.toggle("theme-dark", dark);
    this.element.classList.toggle("theme-light", !dark);
  }

  #applyBarState(): void {
    this.element.dataset.mode = this.#mode;
    this.element.classList.toggle("ph-show-badges", this.#showBadges);
    this.element.classList.toggle("ph-show-stats", this.#showStats);
    this.element.classList.toggle("ph-minimized", this.#minimized);
    this.element.style.setProperty("--ph-hud-accent", getSettings().accentColor);
  }

  #handleError(where: string, err: unknown): void {
    const detail = err instanceof Error ? err.message || err.stack : String(err);
    logger.error(`${where}: ${detail}`);
  }

  /** Fixed bottom bar (not token-anchored). `left`/`transform` are pinned inline
      with `!important` so AppV2 window-pose logic can't re-position it.
      Horizontal alignment follows the client `position` setting (left/center/right)
      and is computed against the AVAILABLE area — the viewport minus the sidebar —
      so the bar never sits behind the chat/roll panel, whatever tab is open. */
  #positionBar(): void {
    const el = this.element;
    if (!el.isConnected) return;
    this.#observeSidebar();
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const vw = window.innerWidth;
    let available = vw;
    const sidebar = this.#observedSidebar;
    if (sidebar && sidebar.offsetWidth > 0) {
      const side = sidebar.getBoundingClientRect();
      if (side.left > margin) available = side.left;
    }
    const align = getSettings().position;
    let left: number;
    if (align === "left") left = margin;
    else if (align === "right") left = Math.max(margin, available - rect.width - margin);
    else left = Math.max(margin, (available - rect.width) / 2);
    el.style.setProperty("left", `${left}px`, "important");
    el.style.setProperty("transform", "none", "important");
  }

  #repositionAfterRender(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          this.#positionBar();
        } catch (err) {
          this.#handleError("repositionAfterRender", err);
        }
      });
    });
  }

  #bindPositioning(): void {
    try {
      this.#onResizeBound = () => this.#positionBar();
      window.addEventListener("resize", this.#onResizeBound);
      this.#resizeObserver = new ResizeObserver(this.#onResizeBound);
      this.#resizeObserver.observe(this.element);
      this.#observeSidebar();
    } catch (err) {
      this.#handleError("bind positioning", err);
    }
  }

  /** Watch `#sidebar`: size changes (collapse/expand) hit the ResizeObserver and
      class/style toggles (chat tab, dice tray, any right-side panel opening)
      hit the MutationObserver — both recalculate the bar position. Re-acquired
      lazily from `#positionBar` because the sidebar may not exist yet on the
      first render. */
  #observeSidebar(): void {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar || sidebar === this.#observedSidebar) return;
    if (this.#observedSidebar) {
      this.#resizeObserver?.unobserve(this.#observedSidebar);
      this.#sidebarObserver?.disconnect();
    }
    this.#observedSidebar = sidebar;
    this.#resizeObserver?.observe(sidebar);
    this.#sidebarObserver = new MutationObserver(() => this.#positionBar());
    this.#sidebarObserver.observe(sidebar, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class", "style"]
    });
  }

  #unbindPositioning(): void {
    if (this.#onResizeBound) window.removeEventListener("resize", this.#onResizeBound);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#onResizeBound = undefined;
    this.#sidebarObserver?.disconnect();
    this.#sidebarObserver = undefined;
    this.#observedSidebar = undefined;
  }

  /** Public entry for the `position` module-setting onChange hook. */
  reposition(): void {
    if (!this.rendered) return;
    this.#positionBar();
    this.#repositionAfterRender();
  }

  #onOpenSheet(): void {
    this.#actor?.sheet?.render(true);
  }

  #onOpenPartySheet(element: HTMLElement): void {
    const actorId = element.dataset.actorId;
    if (!actorId) return;
    resolvePartyActor(actorId)?.sheet?.render(true);
  }

  #onSelectParty(element: HTMLElement): void {
    if (this.#mode !== "trainer") return;
    const index = Number(element.dataset.partySlot ?? NaN);
    if (!Number.isInteger(index) || index < 0) return;
    const actor = this.#actor;
    if (!actor || !getTrainerFlags(actor).party[index]) return;
    this.#selectedPartyIndex = index;
    void this.#patchBar([".ph-party-grid", ".ph-obj-column"]);
  }

  #canvas(): CanvasLike | null {
    return (globalThis as unknown as { canvas?: CanvasLike }).canvas ?? null;
  }

  #sceneTokens(): TokenPlaceableLike[] {
    const placeables = this.#canvas()?.tokens?.placeables;
    return Array.isArray(placeables) ? (placeables as TokenPlaceableLike[]) : [];
  }

  #tokenForActor(actorId: string): TokenPlaceableLike | null {
    if (!actorId) return null;
    for (const placeable of this.#sceneTokens()) {
      if (placeable.document?.actorId === actorId) return placeable;
    }
    return null;
  }

  #summonedToken(trainerId: string): TokenPlaceableLike | null {
    if (!trainerId) return null;
    for (const placeable of this.#sceneTokens()) {
      if (placeable.document?.flags?.[MODULE_ID]?.summoner === trainerId) return placeable;
    }
    return null;
  }

  /** Distance in grid units (feet) between two points, preferring the scene's own measure. */
  #distanceFeet(
    grid: GridLike,
    from: { x: number; y: number },
    to: { x: number; y: number },
    cellFeet: number,
    gridSize: number
  ): number {
    try {
      if (typeof grid.measurePath === "function") {
        const measured = Number(grid.measurePath([from, to])?.distance);
        if (Number.isFinite(measured)) return measured;
      }
    } catch {
      // fall through to a Chebyshev approximation (dnd5e 5-5-5 diagonals)
    }
    const cells = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) / gridSize;
    return cells * cellFeet;
  }

  /** Center of a token document in canvas coordinates. */
  #docCenter(doc: TokenDocumentLike, gridSize: number): { x: number; y: number } {
    return {
      x: (Number(doc.x) || 0) + ((Number(doc.width) || 1) * gridSize) / 2,
      y: (Number(doc.y) || 0) + ((Number(doc.height) || 1) * gridSize) / 2
    };
  }

  #cellOccupied(doc: TokenDocumentLike, x: number, y: number, gridSize: number): boolean {
    const ox = Number(doc.x) || 0;
    const oy = Number(doc.y) || 0;
    const width = (Number(doc.width) || 1) * gridSize;
    const height = (Number(doc.height) || 1) * gridSize;
    return !(x + gridSize <= ox || x >= ox + width || y + gridSize <= oy || y >= oy + height);
  }

  /** Build the Token data from the actor's prototype Token so the summon keeps the
      Pokémon's own token art, size and disposition: creating a Token with only an
      actorId yields the default placeholder art instead. */
  async #summonTokenData(
    pokemon: Actor,
    trainerId: string
  ): Promise<Record<string, unknown> | null> {
    const getTokenDocument = (pokemon as unknown as SummonActorLike).getTokenDocument;
    if (typeof getTokenDocument !== "function") return null;
    const scene = this.#canvas()?.scene;
    let doc: TokenDocumentLike | null;
    try {
      doc = await getTokenDocument.call(pokemon, {}, scene ? { parent: scene } : {});
    } catch (err) {
      logger.warn(`HUD summon document: ${String(err)}`);
      return null;
    }
    if (!doc || typeof doc.toObject !== "function") return null;
    const data = doc.toObject();
    delete data._id;
    // The summoned Token MUST be linked to the real Pokemon Actor: an unlinked Token
    // keeps HP/status changes in its own ActorDelta, which is discarded on withdraw,
    // silently healing the Pokemon back to full.
    delete data.delta;
    data.actorLink = true;
    const flags = (data.flags as Record<string, Record<string, unknown>> | undefined) ?? {};
    flags[MODULE_ID] = { ...(flags[MODULE_ID] ?? {}), summoner: trainerId };
    data.flags = flags;
    return data;
  }

  async #onToggleSummon(): Promise<void> {
    const trainer = this.#actor;
    if (!trainer || this.#mode !== "trainer") return;
    if (this.#placingSummon) {
      this.#canvas()?.tokens?._cancelPlacement?.();
      return;
    }
    const existing = this.#summonedToken(trainer.id ?? "");
    if (existing) {
      await this.#withdrawSummon(existing);
      return;
    }
    const { party } = getTrainerFlags(trainer);
    const index = this.#selectedPartyIndex;
    if (index === null || index < 0 || index >= party.length || !party[index]) {
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonNoSelection"));
      return;
    }
    const pokemon = resolvePartyActor(party[index]);
    if (!pokemon) {
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonNoSelection"));
      return;
    }
    await this.#summonPokemon(trainer, pokemon);
  }

  async #summonPokemon(trainer: Actor, pokemon: Actor): Promise<void> {
    const canvas = this.#canvas();
    const scene = canvas?.scene;
    const grid = canvas?.grid;
    const trainerToken = this.#tokenForActor(trainer.id ?? "");
    if (!scene || !grid || !trainerToken?.document) {
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonNoToken"));
      return;
    }

    const data = await this.#summonTokenData(pokemon, trainer.id ?? "");
    if (!data) {
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonFailed"));
      return;
    }

    const gridSize = Number(grid.size) > 0 ? Number(grid.size) : 100;
    const cellFeet = Number(grid.distance) > 0 ? Number(grid.distance) : 5;

    if (await this.#placeSummon(canvas, pokemon, trainerToken, data, grid, gridSize)) return;
    await this.#autoPlaceSummon(scene, trainerToken.document, data, grid, gridSize, cellFeet);
  }

  /** Hand placement to Foundry's own workflow so the player picks the cell; every
      click further than the summon range from the trainer is refused. */
  async #placeSummon(
    canvas: CanvasLike,
    pokemon: Actor,
    trainerToken: TokenPlaceableLike,
    data: Record<string, unknown>,
    grid: GridLike,
    gridSize: number
  ): Promise<boolean> {
    const placeTokens = canvas.tokens?.placeTokens;
    const trainerDoc = trainerToken.document;
    if (canvas.ready !== true || typeof placeTokens !== "function" || !trainerDoc) return false;
    // Foundry's placement workflow refuses Token documents the user does not own.
    if ((pokemon as unknown as SummonActorLike).isOwner === false) return false;

    const cellFeet = Number(grid.distance) > 0 ? Number(grid.distance) : 5;
    const inRange = (target: TokenDocumentLike): boolean => {
      const feet = this.#distanceFeet(
        grid,
        this.#docCenter(trainerDoc, gridSize),
        this.#docCenter(target, gridSize),
        cellFeet,
        gridSize
      );
      return !Number.isFinite(feet) || feet <= SUMMON_RANGE_FEET;
    };

    ui.notifications?.info(phText("pokemon-hud-like.hud.summonPick"));
    this.#placingSummon = true;
    beginAutoRenderSuppression();
    try {
      await placeTokens.call(canvas.tokens, [data], {
        createOptions: { controlObject: false },
        preConfirm: ({ document: target }: PlacementConfirmArgs) => {
          if (inRange(target)) return true;
          ui.notifications?.warn(phText("pokemon-hud-like.hud.summonTooFar"));
          return false;
        }
      });
    } catch (err) {
      logger.warn(`HUD summon: ${String(err)}`);
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonFailed"));
    } finally {
      this.#placingSummon = false;
      endAutoRenderSuppression();
    }
    // The placement workflow releases every controlled token: give control back to
    // the trainer so the HUD and the canvas selection survive the summon.
    this.#restoreTrainerControl(trainerToken);
    if (this.rendered) await this.#patchBar([]);
    return true;
  }

  #restoreTrainerControl(token: TokenPlaceableLike): void {
    if (token.controlled) return;
    try {
      token.control?.({ releaseOthers: false });
    } catch (err) {
      logger.warn(`HUD summon control: ${String(err)}`);
    }
  }

  /** Fallback for canvases without a placement workflow: drop the Pokémon on the
      nearest free cell inside the summon range. */
  async #autoPlaceSummon(
    scene: SceneLike,
    trainerDoc: TokenDocumentLike,
    data: Record<string, unknown>,
    grid: GridLike,
    gridSize: number,
    cellFeet: number
  ): Promise<void> {
    const create = scene.createEmbeddedDocuments;
    if (typeof create !== "function") {
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonNoToken"));
      return;
    }

    const originX = Number(trainerDoc.x) || 0;
    const originY = Number(trainerDoc.y) || 0;
    const trainerCenter = this.#docCenter(trainerDoc, gridSize);
    const placed = this.#sceneTokens()
      .map((placeable) => placeable.document)
      .filter((doc): doc is TokenDocumentLike => Boolean(doc));

    const spot = summonOffsets(maxSummonCells(cellFeet)).find(({ dx, dy }) => {
      const x = originX + dx * gridSize;
      const y = originY + dy * gridSize;
      const center = { x: x + gridSize / 2, y: y + gridSize / 2 };
      const feet = this.#distanceFeet(grid, trainerCenter, center, cellFeet, gridSize);
      if (!Number.isFinite(feet) || feet > SUMMON_RANGE_FEET) return false;
      return !placed.some((doc) => this.#cellOccupied(doc, x, y, gridSize));
    });

    if (!spot) {
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonNoSpace"));
      return;
    }

    beginAutoRenderSuppression();
    try {
      await create.call(scene, "Token", [
        { ...data, x: originX + spot.dx * gridSize, y: originY + spot.dy * gridSize }
      ]);
    } catch (err) {
      logger.warn(`HUD summon: ${String(err)}`);
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonFailed"));
      return;
    } finally {
      endAutoRenderSuppression();
    }
    if (this.rendered) await this.#patchBar([]);
  }

  async #withdrawSummon(token: TokenPlaceableLike): Promise<void> {
    const doc = token.document;
    if (!doc || typeof doc.delete !== "function") return;
    beginAutoRenderSuppression();
    try {
      await doc.delete();
    } catch (err) {
      logger.warn(`HUD withdraw: ${String(err)}`);
      ui.notifications?.warn(phText("pokemon-hud-like.hud.summonWithdrawFailed"));
      return;
    } finally {
      endAutoRenderSuppression();
    }
    await this.#patchBar([]);
  }

  async #onUseItem(element: HTMLElement): Promise<void> {
    const actor = this.#actor;
    if (!actor || this.#mode !== "trainer") return;
    const itemId = element.dataset.itemId;
    if (!itemId) return;
    const item = (actor as unknown as { items?: { get: (id: string) => unknown } }).items?.get(
      itemId
    ) as
      | {
          use?: (config?: unknown, dialog?: unknown, message?: unknown) => Promise<unknown>;
          displayCard?: (message?: unknown) => Promise<unknown>;
          name?: unknown;
        }
      | undefined;
    if (!item) return;
    try {
      if (typeof item.use === "function") {
        await item.use();
        return;
      }
      if (typeof item.displayCard === "function") {
        await item.displayCard();
        return;
      }
      const itemName = String(item.name ?? "?");
      const content = game.i18n.format("pokemon-hud-like.chat.itemUsed", {
        actor: actor.name,
        item: itemName
      });
      const speaker = ChatMessage.getSpeaker({ actor: actor as never });
      await ChatMessage.create({ content, speaker });
    } catch (err) {
      logger.warn(`useItem: ${String(err)}`);
    }
  }

  #selectedPokeballItem(): Item | null {
    const actor = this.#actor;
    const id = this.#selectedPokeballId;
    if (!actor || !id) return null;
    const items = (actor as unknown as { items?: { get: (itemId: string) => Item | undefined } })
      .items;
    return items?.get(id) ?? null;
  }

  #onSelectPokeball(element: HTMLElement): void {
    if (this.#mode !== "trainer") return;
    const itemId = element.dataset.itemId;
    if (!itemId) return;
    this.#selectedPokeballId = this.#selectedPokeballId === itemId ? null : itemId;
    void this.#patchBar([".ph-obj-column", ".ph-inv-grid"]);
  }

  async #onThrowPokeball(): Promise<void> {
    const actor = this.#actor;
    if (!actor || this.#mode !== "trainer") return;

    const item = this.#selectedPokeballItem();
    if (!item) {
      ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.hud.noPokeballSelected"));
      return;
    }

    const targetToken = Array.from(game.user?.targets ?? [])[0] as
      { actor?: Actor | null } | undefined;
    const targetActor = targetToken?.actor ?? null;
    if (!targetActor) {
      ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.hud.noCaptureTarget"));
      return;
    }

    const ballName = String(item.name ?? "");
    const ballImg = typeof item.img === "string" ? item.img : undefined;
    const targetName = String(targetActor.name ?? "");

    const baseDc = captureDc(
      readChallengeRating(targetActor.system),
      readPokemonLevel(targetActor.system)
    );
    const modifiers = captureModifiers(ballName, this.#captureContext(actor, targetActor));
    const dc = finalCaptureDc(baseDc, modifiers.reduction);

    const animalHandling = readStatBreakdown(actor.system).skills.find((s) => s.key === "ani");
    const mod = animalHandling?.total ?? 0;

    let flavor = game.i18n.format("pokemon-hud-like.chat.captureThrow", {
      actor: actor.name,
      ball: ballName,
      target: targetName,
      dc: String(dc)
    });
    if (!modifiers.autoSuccess && modifiers.reduction !== 0) {
      const modText =
        modifiers.reduction > 0 ? `−${modifiers.reduction}` : `+${Math.abs(modifiers.reduction)}`;
      flavor += ` ${game.i18n.format("pokemon-hud-like.chat.captureModifier", {
        base: String(baseDc),
        mod: modText
      })}`;
    }

    let success = false;
    if (modifiers.autoSuccess) {
      success = true;
      try {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: actor as never }),
          content: game.i18n.format("pokemon-hud-like.capture.masterBall", {
            actor: actor.name,
            ball: ballName,
            target: targetName
          })
        });
      } catch (err) {
        logger.warn(`masterBallChat: ${String(err)}`);
      }
    } else {
      let total = 0;
      try {
        const roll = new Roll(`1d20 + ${mod}`, { mod });
        await roll.evaluate();
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor as never }),
          flavor
        });
        total = Number(roll.total ?? 0);
      } catch (err) {
        logger.warn(`captureRoll: ${String(err)}`);
      }
      success = captureSucceeded(total, dc);
    }

    try {
      await consumeActorItem(actor, item.id ?? "");
    } catch (err) {
      logger.warn(`consumePokeball: ${String(err)}`);
    }
    if (!this.#selectedPokeballItem()) this.#selectedPokeballId = null;
    await this.#patchBar([".ph-obj-column", ".ph-inv-grid"]);

    this.#showCaptureAnimation({ success, ballImg, ballName, target: targetName });
  }

  #captureContext(trainer: Actor, target: Actor): CaptureContext {
    const targetSystem = (target.system ?? {}) as Record<string, unknown>;
    const attributes = (targetSystem.attributes ?? {}) as Record<string, unknown>;
    const hp = (attributes.hp ?? {}) as Record<string, unknown>;
    const hpValue = Number(hp.value);
    const hpMax = Number(hp.max);
    const hpPct =
      Number.isFinite(hpValue) && Number.isFinite(hpMax) && hpMax > 0 ? hpValue / hpMax : undefined;

    const rawTypes = attributes.type;
    const targetTypes = Array.isArray(rawTypes)
      ? rawTypes.map((type) => String(type).toLowerCase())
      : typeof rawTypes === "string"
        ? [rawTypes.toLowerCase()]
        : [];

    const traits = (targetSystem.traits ?? {}) as Record<string, unknown>;
    const targetSize = typeof traits.size === "string" ? traits.size : undefined;

    const skillMods: Record<string, number> = {};
    for (const skill of readStatBreakdown(trainer.system).skills) {
      skillMods[skill.key] = skill.total;
    }

    let activeChaMod: number | undefined;
    const party = getTrainerFlags(trainer).party;
    const activePokemon = party.length ? resolvePartyActor(party[0]) : null;
    if (activePokemon) {
      const cha = readStatBreakdown(activePokemon.system).abilities.find((a) => a.key === "cha");
      activeChaMod = cha?.mod;
    }

    const statuses = (target as unknown as { statuses?: Set<string> }).statuses;
    const asleep = Boolean(statuses?.has("sleep") || statuses?.has("unconscious"));

    let dark = false;
    try {
      const scene = (
        globalThis as unknown as {
          canvas?: { scene?: { environment?: { darknessLevel?: unknown }; darkness?: unknown } };
        }
      ).canvas?.scene;
      const darkness = Number(scene?.environment?.darknessLevel ?? scene?.darkness ?? NaN);
      dark = Number.isFinite(darkness) && darkness >= 0.5;
    } catch {
      dark = false;
    }

    const firstRound = Number(game.combat?.round) === 1;

    return {
      hpPct,
      targetLevel: readPokemonLevel(target.system),
      trainerLevel: readPokemonLevel(trainer.system),
      targetTypes,
      targetSize,
      skillMods,
      activeChaMod,
      asleep,
      dark,
      firstRound
    };
  }

  #showCaptureAnimation(opts: {
    success: boolean;
    ballImg?: string;
    ballName: string;
    target: string;
  }): void {
    this.#removeCaptureOverlay();
    try {
      const overlay = document.createElement("div");
      overlay.className = "ph-capture-overlay";
      const ball = opts.ballImg
        ? `<img class="ph-capture-ball-img" src="${opts.ballImg}" alt="" />`
        : `<span class="ph-capture-ball-css"></span>`;
      overlay.innerHTML = `
        <div class="ph-capture-stage">
          <div class="ph-capture-ball">${ball}</div>
          <div class="ph-capture-message"></div>
        </div>`;
      document.body.appendChild(overlay);

      const ballEl = overlay.querySelector<HTMLElement>(".ph-capture-ball");
      const message = overlay.querySelector<HTMLElement>(".ph-capture-message");
      this.#captureTimer = window.setTimeout(() => {
        ballEl?.classList.add(opts.success ? "ph-capture-ball--success" : "ph-capture-ball--fail");
        if (message) {
          message.textContent = game.i18n.format(
            opts.success ? "pokemon-hud-like.capture.success" : "pokemon-hud-like.capture.fail",
            { target: opts.target, ball: opts.ballName }
          );
          message.classList.add(opts.success ? "is-success" : "is-fail");
        }
        this.#captureTimer = window.setTimeout(() => this.#removeCaptureOverlay(), 2800);
      }, 1600);

      overlay.addEventListener("click", () => this.#removeCaptureOverlay());
    } catch (err) {
      this.#handleError("showCaptureAnimation", err);
    }
  }

  #removeCaptureOverlay(): void {
    if (this.#captureTimer !== null) {
      window.clearTimeout(this.#captureTimer);
      this.#captureTimer = null;
    }
    document.querySelectorAll(".ph-capture-overlay").forEach((el) => el.remove());
  }

  async #onUseTrait(element: HTMLElement): Promise<void> {
    const actor = this.#actor;
    if (!actor || this.#mode !== "trainer") return;
    const trait = element.dataset.trait;
    const index = Number(element.dataset.slot ?? NaN);
    if (!Number.isInteger(index) || (trait !== "paths" && trait !== "specializations")) return;
    const slot = (
      trait === "paths" ? getTrainerFlags(actor).paths : getTrainerFlags(actor).specializations
    )[index];
    const uuid = slot?.uuid;
    if (!uuid) return;
    const doc = await foundry.utils.fromUuid(uuid);
    if (!doc) return;
    const anyDoc = doc as unknown as {
      use?: (config?: unknown, dialog?: unknown, message?: unknown) => Promise<unknown>;
      displayCard?: (message?: unknown) => Promise<unknown>;
      name?: unknown;
    };
    const name = String(anyDoc.name ?? slot.name ?? "?");
    let handled = false;
    try {
      if (typeof anyDoc.use === "function") {
        await anyDoc.use();
        handled = true;
      } else if (typeof anyDoc.displayCard === "function") {
        await anyDoc.displayCard();
        handled = true;
      }
    } catch (err) {
      logger.warn(`useTrait: ${String(err)}`);
    }
    if (!handled) {
      const content = game.i18n.format("pokemon-hud-like.chat.itemUsed", {
        actor: actor.name,
        item: name
      });
      const speaker = ChatMessage.getSpeaker({ actor: actor as never });
      await ChatMessage.create({ content, speaker }).catch((err) =>
        logger.warn(`useTrait chat: ${String(err)}`)
      );
    }
  }

  async #onUsePower(element: HTMLElement): Promise<void> {
    const actor = this.#actor;
    if (!actor || this.#mode !== "pokemon") return;
    const index = Number(element.dataset.powerIndex ?? NaN);
    const power = Number.isInteger(index) ? getPowerSlot(actor, index) : null;
    if (!power?.name.trim()) return;
    // Always act on the actor's own item copy: it is the one the HUD counts.
    const linked = resolvePowerItem(actor, power);
    const before = readMoveUses(linked?.system);
    if (power.uuid) await this.#activateByUuid(power.uuid, power.name, linked);
    else await this.#chatItemFallback(actor, power.name);
    const after = readMoveUses(linked?.system);
    // Cancelling the item's own usage dialog spends nothing, so nothing is logged.
    if (!before || !after || !before.limited || before.value !== after.value) {
      await this.#postPowerToChat(power, actor);
    }
    // A move that mirrors an item keeps its charges there — never mirror them here.
    if (before || after) await this.#mutateAndPatch(Promise.resolve());
    else await this.#mutateAndPatch(updatePower(actor, index, { pp: Math.max(0, power.pp - 1) }));
  }

  async #postPowerToChat(power: PowerData, actor: Actor): Promise<void> {
    const header = game.i18n.format("pokemon-hud-like.chat.powerUsed", { name: power.name });
    const content = `<div class="pokemon-hud-chat pokemon-hud-chat--power">
      <div class="ph-chat-header">${header}</div>
      <div class="ph-chat-row">
        <img class="ph-chat-img" src="${power.img || actor.img || ""}" alt="${power.name}" />
        <span class="ph-power-pp">${power.pp}</span>
      </div>
    </div>`;
    const speaker = ChatMessage.getSpeaker({ actor: actor as never });
    await ChatMessage.create({ content, speaker }).catch((err) =>
      logger.warn(`postPowerToChat: ${String(err)}`)
    );
  }

  async #onUsePokemonSlot(element: HTMLElement): Promise<void> {
    const actor = this.#actor;
    if (!actor || this.#mode !== "pokemon") return;
    const key = element.dataset.pokemonSlot as "habilidad" | "equipado";
    if (key !== "habilidad" && key !== "equipado") return;
    const slot = getPokemonNpcFlags(actor)[key];
    if (!slot?.name) return;
    if (!slot.uuid) {
      await this.#chatItemFallback(actor, slot.name);
      return;
    }
    const doc = await this.#activateByUuid(slot.uuid, slot.name);
    if (key === "equipado" && doc) {
      await this.#mutateAndPatch(this.#consumeEquipado(doc));
    }
  }

  async #activateByUuid(uuid: string, fallbackName: string, preferred?: unknown): Promise<unknown> {
    const actor = this.#actor;
    if (!actor) return null;
    const doc = preferred ?? (await foundry.utils.fromUuid(uuid));
    if (!doc) {
      await this.#chatItemFallback(actor, fallbackName);
      return null;
    }
    const anyDoc = doc as unknown as {
      use?: (config?: unknown, dialog?: unknown, message?: unknown) => Promise<unknown>;
      displayCard?: (message?: unknown) => Promise<unknown>;
    };
    let handled = false;
    try {
      if (typeof anyDoc.use === "function") {
        await anyDoc.use();
        handled = true;
      } else if (typeof anyDoc.displayCard === "function") {
        await anyDoc.displayCard();
        handled = true;
      }
    } catch (err) {
      logger.warn(`activateByUuid: ${String(err)}`);
    }
    if (!handled) await this.#chatItemFallback(actor, fallbackName);
    return doc;
  }

  async #chatItemFallback(actor: Actor, itemName: string): Promise<void> {
    const content = game.i18n.format("pokemon-hud-like.chat.itemUsed", {
      actor: actor.name,
      item: itemName
    });
    const speaker = ChatMessage.getSpeaker({ actor: actor as never });
    await ChatMessage.create({ content, speaker }).catch((err) =>
      logger.warn(`chatItemFallback: ${String(err)}`)
    );
  }

  async #consumeEquipado(doc: unknown): Promise<void> {
    const actor = this.#actor;
    if (!actor) return;
    try {
      const d = doc as unknown as {
        parent?: unknown;
        delete?: () => Promise<unknown>;
        update?: (data: Record<string, unknown>) => Promise<unknown>;
        system?: { quantity?: unknown; uses?: { value?: unknown } | unknown };
      };

      if (!d.parent) return;
      const sys = d.system ?? {};
      const quantity = Number((sys.quantity as number) ?? NaN);
      const usesRaw =
        typeof sys.uses === "object" && sys.uses !== null
          ? (sys.uses as { value?: unknown }).value
          : undefined;
      const uses = Number(usesRaw ?? NaN);
      if (Number.isFinite(quantity)) {
        if (typeof d.delete === "function") {
          await d.delete();
          await setPokemonSlot(actor, "equipado", { name: "" });
        } else if (quantity > 1 && typeof d.update === "function") {
          await d.update({ "system.quantity": quantity - 1 });
        }
      } else if (Number.isFinite(uses) && typeof d.update === "function") {
        const next = uses - 1;
        await d.update({ "system.uses.value": Math.max(0, next) });
        if (next <= 0 && typeof d.delete === "function") {
          await d.delete();
          await setPokemonSlot(actor, "equipado", { name: "" });
        }
      }
    } catch (err) {
      logger.warn(`consumeEquipado: ${String(err)}`);
    }
  }

  #onSetInvFilter(button: HTMLButtonElement): void {
    const value = button.dataset.filter;
    this.#invFilter =
      value === "pokeball" ||
      value === "object" ||
      value === "key" ||
      value === "tm" ||
      value === "feature"
        ? value
        : "object";
    void this.#patchBar([".ph-inv-filters", ".ph-inv-grid"]);
  }

  #onAddRow(): void {
    if (this.#invRows >= INV_ROWS_MAX) return;
    this.#invRows += 1;
    this.#updateInvGrid();
    this.#updateInvRowButtons();
  }

  #onRemoveRow(): void {
    if (this.#invRows <= INV_ROWS_MIN) return;
    this.#invRows -= 1;
    this.#updateInvGrid();
    this.#updateInvRowButtons();
  }

  #updateInvGrid(): void {
    const grid = this.element.querySelector<HTMLElement>(".ph-inv-grid");
    if (!grid) return;
    const capacity = INV_COLS * this.#invRows;
    const itemCount = grid.querySelectorAll<HTMLElement>("[data-item-id]").length;
    const target = Math.max(itemCount, capacity);
    const diff = target - grid.children.length;
    if (diff > 0) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < diff; i++) {
        const slot = document.createElement("div");
        slot.className = "ph-inv-slot ph-inv-slot--empty";
        frag.appendChild(slot);
      }
      grid.appendChild(frag);
    } else if (diff < 0) {
      for (let i = 0; i < -diff; i++) grid.removeChild(grid.lastElementChild as HTMLElement);
    }
  }

  #updateInvRowButtons(): void {
    const shrink = this.element.querySelector<HTMLButtonElement>('[data-action="inv-shrink"]');
    const enlarge = this.element.querySelector<HTMLButtonElement>('[data-action="inv-enlarge"]');
    if (shrink) shrink.disabled = this.#invRows <= INV_ROWS_MIN;
    if (enlarge) enlarge.disabled = this.#invRows >= INV_ROWS_MAX;
  }

  /** Update the bar in place, touching only the nodes that actually changed. A
      full AppV2 render repaints the whole bar (reloading the menu background and
      every image), which makes it flicker, so `selectors` are only a fallback for
      when the bar cannot be diffed (e.g. its mode changed). */
  async #patchBar(selectors: string[]): Promise<void> {
    if (await this.#patchBarInPlace()) return;

    const html = await renderBarTemplate(
      PokemonHudApp.PARTS.bar.template,
      await this._prepareContext({ isFirstRender: false })
    );
    if (!html || selectors.length === 0) {
      await this.render({ force: true });
      return;
    }
    const parsed = new DOMParser().parseFromString(html, "text/html");
    for (const selector of selectors) {
      const fresh = parsed.querySelector(selector);
      const live = this.element.querySelector(selector);
      if (fresh && live) live.replaceChildren(...Array.from(fresh.childNodes));
    }
    this.#applyRenderEffects();
  }

  /** Renders the bar off-DOM and diffs it into the live element. Returns false
      when it cannot (not rendered, or no Handlebars renderer available). */
  async #patchBarInPlace(): Promise<boolean> {
    if (!this.rendered || !this.element?.isConnected) return false;
    let html: string | null;
    try {
      html = await renderBarTemplate(
        PokemonHudApp.PARTS.bar.template,
        await this._prepareContext({ isFirstRender: false })
      );
    } catch (err) {
      logger.warn(`HUD patch: ${String(err)}`);
      return false;
    }
    if (!html) return false;
    const freshRoot = new DOMParser().parseFromString(html, "text/html").body.firstElementChild;
    if (!freshRoot) return false;
    patchChildren(this.element, freshRoot);
    this.#applyRenderEffects();
    return true;
  }

  /** Everything `_onRender` does after the markup is in place; patch updates need
      the same treatment without a full re-render. */
  #applyRenderEffects(): void {
    try {
      this.#applyThemeClass();
      this.#applyBarState();
      applyMacroBarPreference();
      this.#positionBar();
      this.#repositionAfterRender();
    } catch (err) {
      this.#handleError("applyRenderEffects", err);
    }
  }

  /** Re-read the actor and update the bar in place; used by the external
      update hooks. Never flashes. */
  async refreshInPlace(): Promise<void> {
    if (!this.#actor) return;
    this.#mode = detectHudMode(this.#actor);
    await this.#patchBar([]);
  }

  /** Mutate a flag then update the bar in place, suppressing the external
      updateActor render so nothing flashes. `selectors` hint which regions changed
      and are only used for the fallback path. */
  async #mutateAndPatch(mutator: Promise<unknown>, selectors: string[] = []): Promise<void> {
    beginAutoRenderSuppression();
    try {
      await mutator;
      await this.#patchBar(selectors);
    } catch (err) {
      logger.warn(`HUD mutate+patch: ${String(err)}`);
    } finally {
      endAutoRenderSuppression();
    }
  }

  #nextPartyIndex(): number {
    if (!this.#actor) return 0;
    const { party } = getTrainerFlags(this.#actor);
    return Math.min(party.length, 5);
  }

  #onToggleBadges(): void {
    this.#showBadges = !this.#showBadges;

    this.element.classList.toggle("ph-show-badges", this.#showBadges);
  }

  #onToggleMinimize(): void {
    this.#minimized = !this.#minimized;
    this.element.classList.toggle("ph-minimized", this.#minimized);
  }

  async #onLevelUp(): Promise<void> {
    const actor = this.#actor;
    if (!actor || this.#mode !== "pokemon" || !game.user?.isGM) return;
    const flags = getPokemonNpcFlags(actor);
    if (!canLevelUp(flags.xp ?? 0, readPokemonLevel(actor.system))) return;
    await this.#mutateAndPatch(levelUpPokemon(actor));
  }

  /** GM-only XP popup: clicking the XP bar toggles it for the CURRENT actor only;
      each Pokémon keeps its own state (reset when the HUD switches actor). */
  async #onToggleXpEditor(): Promise<void> {
    const actor = this.#actor;
    if (!actor || this.#mode !== "pokemon" || !game.user?.isGM) return;
    const id = actor.id;
    this.#xpEditorOpenFor = this.#xpEditorOpenFor === id ? null : id;
    await this.#patchBar([".ph-menu-bars"]);
    if (this.#xpEditorOpenFor === id) {
      this.element?.querySelector<HTMLInputElement>(".ph-xp-popup input")?.focus();
    }
  }

  /** Closes the XP popup when the user clicks anything that is neither the
      popup itself nor the XP bar (canvas, other HUD controls, sheets...). */
  #onDocumentClick = (event: Event): void => {
    if (!this.#xpEditorOpenFor || !this.rendered) return;
    const target = event.target as HTMLElement | null;
    if (!target?.isConnected) return;
    if (target.closest(".ph-xp-popup, .ph-xp-bar-top")) return;
    this.#xpEditorOpenFor = null;
    void this.#patchBar([".ph-menu-bars"]);
  };

  #onToggleStats(): void {
    this.#showStats = !this.#showStats;
    this.element.classList.toggle("ph-show-stats", this.#showStats);
  }

  #onRollAbility(button: HTMLButtonElement, mode: RollMode = "normal"): void {
    const key = button.dataset.ability;
    if (key) void this.#rollAbility(key, "check", mode);
  }

  #onRollSkill(button: HTMLButtonElement, mode: RollMode = "normal"): void {
    const key = button.dataset.skill;
    if (key) void this.#rollSkill(key, mode);
  }

  async #rollAbility(
    key: string,
    kind: "check" | "save",
    mode: RollMode = "normal"
  ): Promise<void> {
    const actor = this.#actor;
    if (!actor) return;
    const ability = readStatBreakdown(actor.system).abilities.find((a) => a.key === key);
    if (!ability) return;
    const mod = kind === "save" ? ability.save : ability.mod;
    const label = game.i18n.localize(ability.labelKey);
    const flavor = game.i18n.format(
      kind === "save" ? "pokemon-hud-like.chat.abilitySave" : "pokemon-hud-like.chat.abilityCheck",
      { actor: actor.name, ability: label }
    );
    await this.#rollD20(mod, flavor, actor, mode);
  }

  async #rollSkill(key: string, mode: RollMode = "normal"): Promise<void> {
    const actor = this.#actor;
    if (!actor) return;
    const skill = readStatBreakdown(actor.system).skills.find((s) => s.key === key);
    if (!skill) return;
    const label = game.i18n.localize(skill.labelKey);
    const flavor = game.i18n.format("pokemon-hud-like.chat.skillCheck", {
      actor: actor.name,
      skill: label
    });
    await this.#rollD20(skill.total, flavor, actor, mode);
  }

  #rollModeLabel(mode: RollMode): string {
    if (mode === "advantage") return game.i18n.localize("pokemon-hud-like.hud.stats.advantage");
    if (mode === "disadvantage") {
      return game.i18n.localize("pokemon-hud-like.hud.stats.disadvantage");
    }
    return "";
  }

  async #rollD20(
    mod: number,
    flavor: string,
    actor: Actor,
    mode: RollMode = "normal"
  ): Promise<void> {
    try {
      const roll = new Roll(`${d20Formula(mode)} + ${mod}`, { mod });
      await roll.evaluate();
      const modeLabel = this.#rollModeLabel(mode);
      const text = modeLabel ? `${flavor} (${modeLabel})` : flavor;
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: actor as never }),
        flavor: text
      });
    } catch (err) {
      logger.warn(`rollD20: ${String(err)}`);
    }
  }

  async #onOpenPokedex(mode: RollMode = "normal"): Promise<void> {
    const actor = this.#actor;
    if (!actor || this.#mode !== "trainer") return;
    if (!hasPokedex(actor)) {
      ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.hud.pokedexNoItem"));
      return;
    }
    const targets = Array.from((game.user?.targets ?? []) as Iterable<{ actor?: Actor | null }>);
    const targetActor = targets[0]?.actor ?? null;
    if (!targetActor) {
      ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.hud.noPokedexTarget"));
      return;
    }
    const info = readPokedexInfo(targetActor);
    const dex = readPokedexItem(actor);
    let roll: Roll | null = null;
    let total = 0;
    try {
      roll = new Roll(d20Formula(mode));
      await roll.evaluate();
      total = Number(roll.total ?? 0);
    } catch (err) {
      logger.warn(`pokedexRoll: ${String(err)}`);
    }
    const tier = pokedexTier(total);
    const content = await this.#buildPokedexContent({
      actor,
      target: targetActor,
      info,
      roll,
      total,
      tier,
      mode,
      dexImg: dex?.img ?? "",
      dexName: dex?.name ?? ""
    });
    const messageData: Record<string, unknown> = {
      speaker: ChatMessage.getSpeaker({ actor: actor as never }),
      content
    };
    if (roll) messageData.rolls = [roll];
    try {
      await ChatMessage.create(messageData as never);
    } catch (err) {
      logger.warn(`pokedexChat: ${String(err)}`);
    }
  }

  async #buildPokedexContent(opts: {
    actor: Actor;
    target: Actor;
    info: PokedexInfo;
    roll: Roll | null;
    total: number;
    tier: PokedexTier;
    mode: RollMode;
    dexImg: string;
    dexName: string;
  }): Promise<string> {
    const { actor, target, info, roll, total, tier, mode, dexImg, dexName } = opts;
    const unknown = phText("pokemon-hud-like.chat.pokedexUnknown");
    const header = phText("pokemon-hud-like.chat.pokedex", {
      actor: actor.name,
      target: info.name || target.name
    });
    const modeLabel = this.#rollModeLabel(mode);
    const rollHtml = roll ? await roll.render() : "";
    const icon = dexImg
      ? `<img class="ph-dex-icon" src="${escapePokedexHtml(dexImg)}" alt="${escapePokedexHtml(
          dexName || unknown
        )}" />`
      : "";
    const parts: string[] = [
      `<div class="ph-dex-base"><span class="ph-dex-name">${escapePokedexHtml(info.name)}</span>` +
        `<span class="ph-dex-cr">${phText("pokemon-hud-like.chat.pokedexCr", {
          cr: escapePokedexHtml(info.cr)
        })}</span></div>`
    ];
    if (tier >= 1) {
      const lines: string[] = [];
      const damageLine = (labelKey: string, entries: string[]): void => {
        if (!entries.length) return;
        lines.push(
          `${phText(labelKey)}: ${entries
            .map((entry) => escapePokedexHtml(damageTypeLabel(entry)))
            .join(", ")}`
        );
      };
      damageLine("pokemon-hud-like.chat.pokedexWeaknesses", info.weaknesses);
      damageLine("pokemon-hud-like.chat.pokedexResistances", info.resistances);
      damageLine("pokemon-hud-like.chat.pokedexImmunities", info.immunities);
      parts.push(
        pokedexSection(
          phText("pokemon-hud-like.chat.pokedexTraits"),
          lines.length ? lines.join("<br>") : unknown
        )
      );
    }
    if (tier >= 2) {
      const moves = info.moves.length
        ? `<div class="ph-dex-list">${info.moves
            .map((move) => `<div class="ph-dex-move">- ${escapePokedexHtml(move)}</div>`)
            .join("")}</div>`
        : unknown;
      parts.push(pokedexSection(phText("pokemon-hud-like.chat.pokedexMoves"), moves));
    }
    if (tier >= 3) {
      parts.push(
        pokedexSection(
          phText("pokemon-hud-like.chat.pokedexNature"),
          info.nature ? escapePokedexHtml(info.nature) : unknown
        )
      );
      parts.push(
        pokedexSection(
          phText("pokemon-hud-like.chat.pokedexAbility"),
          info.ability ? escapePokedexHtml(info.ability) : unknown
        )
      );
    }
    const low =
      tier === 0
        ? `<div class="ph-dex-hint">${phText("pokemon-hud-like.chat.pokedexLow", {
            total
          })}</div>`
        : "";
    return (
      `<div class="pokemon-hud-chat pokemon-hud-chat--pokedex">` +
      `<div class="ph-chat-header">${icon}${escapePokedexHtml(header)}${
        modeLabel ? ` (${escapePokedexHtml(modeLabel)})` : ""
      }</div>` +
      (rollHtml ? `<div class="ph-dex-roll">${rollHtml}</div>` : "") +
      parts.join("") +
      low +
      `</div>`
    );
  }

  #onContextMenu = (event: MouseEvent): void => {
    const actor = this.#actor;
    if (!actor) return;
    const isGM = game.user?.isGM ?? false;

    const abilityCell = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".ph-stat-ability"
    );
    if (abilityCell && this.#showStats) {
      const key = abilityCell.dataset.ability;
      if (key) {
        event.preventDefault();
        void this.#rollAbility(key, "save", rollModeFromKeys(event));
      }
      return;
    }

    const powerCard = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".ph-power-card[data-power-slot]"
    );
    if (powerCard && this.#mode === "pokemon") {
      const index = Number(powerCard.dataset.powerSlot ?? NaN);
      if (!Number.isInteger(index)) return;
      // Rightmost power column (index % 3 === 2) is GM-only.
      if (!isGM && index % 3 === 2) {
        event.preventDefault();
        ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.hud.dmColumnOnly"));
        return;
      }
      event.preventDefault();
      void this.#mutateAndPatch(removePower(actor, index));
      return;
    }

    const partySlot = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".ph-party-slot[data-party-slot]"
    );
    if (partySlot && this.#mode === "trainer") {
      const index = Number(partySlot.dataset.partySlot ?? NaN);
      if (!Number.isInteger(index)) return;
      const party = getTrainerFlags(actor).party;
      if (index < 0 || index >= party.length || !party[index]) return;
      event.preventDefault();
      this.#selectedPartyIndex = null;
      void this.#mutateAndPatch(removePartySlot(actor, index), [".ph-party-grid"]);
      return;
    }

    const invSlot = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".ph-inv-slot[data-item-id]"
    );
    if (invSlot && this.#mode === "trainer" && this.#invFilter === "feature") {
      const itemId = invSlot.dataset.itemId;
      if (!itemId) return;
      event.preventDefault();
      void this.#mutateAndPatch(deleteActorItem(actor, itemId), [".ph-inv-grid"]);
      return;
    }

    if (!isGM) return;

    const pokemonSlot = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-pokemon-slot]"
    );
    if (pokemonSlot && this.#mode === "pokemon") {
      const key = pokemonSlot.dataset.pokemonSlot as "habilidad" | "equipado";
      if (key !== "habilidad" && key !== "equipado") return;
      event.preventDefault();
      void this.#mutateAndPatch(setPokemonSlot(actor, key, { name: "" }));
      return;
    }

    const objSlot = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".ph-obj-slot[data-obj-slot]"
    );
    if (objSlot && this.#mode === "trainer") {
      const objIndex = Number(objSlot.dataset.objSlot ?? NaN);
      if (!Number.isInteger(objIndex)) return;
      event.preventDefault();
      void this.#mutateAndPatch(setObjectSlot(actor, objIndex, { name: "" }), [".ph-obj-list"]);
      return;
    }

    const slot = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".ph-traits-slot[data-trait]"
    );
    if (!slot) return;
    event.preventDefault();
    const trait = slot.dataset.trait;
    const index = Number(slot.dataset.slot ?? NaN);
    if (
      this.#mode === "trainer" &&
      (trait === "paths" || trait === "specializations") &&
      Number.isInteger(index)
    ) {
      void this.#mutateAndPatch(setTraitSlot(actor, trait, index, { name: "" }), [
        ".ph-traits-overlay"
      ]);
    }
  };

  #onDragStart = (event: DragEvent): void => {
    if (!this.#actor) return;

    // Reordering is an internal drag: the card carries its own slot index.
    const powerCard = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '.ph-power-card[data-power-slot][data-action="use-power"]'
    );
    if (powerCard && this.#mode === "pokemon") {
      const from = Number(powerCard.dataset.powerSlot ?? NaN);
      if (!Number.isInteger(from)) return;
      event.dataTransfer?.setData(
        "text/plain",
        JSON.stringify({ type: "pokemon-hud-power", from })
      );
      // Custom type so `dragover` can tell a reorder apart from an item drop.
      event.dataTransfer?.setData(POWER_DRAG_TYPE, String(from));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      powerCard.classList.add("ph-power-card--dragging");
      return;
    }

    if (this.#mode !== "trainer") return;

    const partySlot = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".ph-party-slot[data-actor-id]"
    );
    if (partySlot) {
      const actorId = partySlot.dataset.actorId;
      const actor = actorId ? game.actors?.get(actorId) : null;
      if (actor) {
        event.dataTransfer?.setData(
          "text/plain",
          JSON.stringify({ type: "Actor", uuid: actor.uuid ?? actor.id })
        );
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      }
      return;
    }

    const slot = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-item-id]");
    if (!slot) return;
    const id = slot.dataset.itemId;
    if (!id) return;
    event.dataTransfer?.setData("text/plain", JSON.stringify({ type: "pokemon-hud-inv", id }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  #onDragOver = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    const reorder = event.dataTransfer?.types.includes(POWER_DRAG_TYPE) ?? false;
    if (reorder)
      this.#markPowerDropTarget(target?.closest<HTMLElement>(".ph-power-card[data-power-slot]"));
    if (
      !target?.closest(".ph-inv-slot") &&
      !target?.closest(".ph-traits-slot") &&
      !target?.closest(".ph-badges-panel") &&
      !target?.closest("[data-pokemon-slot]") &&
      !target?.closest(".ph-power-card[data-power-slot]") &&
      !target?.closest(".ph-obj-slot[data-obj-slot]") &&
      !target?.closest(".ph-party-slot")
    )
      return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  #onDragEnd = (): void => {
    this.#clearPowerDragState();
  };

  #markPowerDropTarget(card: HTMLElement | null | undefined): void {
    if (this.#powerDropTarget === card) return;
    this.#clearPowerDragState();
    if (card) {
      card.classList.add("ph-power-card--drop");
      this.#powerDropTarget = card;
    }
  }

  #clearPowerDragState(): void {
    this.#powerDropTarget?.classList.remove("ph-power-card--drop");
    this.#powerDropTarget = null;
    this.element?.querySelectorAll(".ph-power-card--dragging").forEach((el) => {
      el.classList.remove("ph-power-card--dragging");
    });
  }

  #onDrop = async (event: DragEvent): Promise<void> => {
    const target = event.target as HTMLElement | null;

    const pokemonSlotEl = target?.closest<HTMLElement>("[data-pokemon-slot]");
    if (pokemonSlotEl && this.#actor && this.#mode === "pokemon") {
      event.preventDefault();
      if (!game.user?.isGM) return;
      const key = pokemonSlotEl.dataset.pokemonSlot as "habilidad" | "equipado";
      if (key !== "habilidad" && key !== "equipado") return;
      const raw = event.dataTransfer?.getData("text/plain") ?? "";
      let parsed: { uuid?: string } | null = null;
      try {
        parsed = JSON.parse(raw) as { uuid?: string };
      } catch {
        parsed = null;
      }
      const uuid = typeof parsed?.uuid === "string" ? parsed.uuid : undefined;
      if (!uuid) return;
      const doc = await foundry.utils.fromUuid(uuid);
      const d = doc as unknown as {
        name?: unknown;
        img?: unknown;
        system?: { description?: { value?: unknown } | unknown };
      } | null;
      const name = d ? String(d.name ?? "") : "";
      const img = d && typeof d.img === "string" ? d.img : undefined;
      const rawDesc = d?.system?.description;
      const descValue =
        typeof rawDesc === "object" && rawDesc !== null && "value" in rawDesc
          ? (rawDesc as { value?: unknown }).value
          : rawDesc;
      const description = String(descValue ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!name) return;
      await this.#mutateAndPatch(
        setPokemonSlot(this.#actor, key, { name, img, uuid, description })
      );
      return;
    }

    const powerCard = target?.closest<HTMLElement>(".ph-power-card[data-power-slot]");
    if (powerCard && this.#actor && this.#mode === "pokemon") {
      event.preventDefault();
      const index = Number(powerCard.dataset.powerSlot ?? NaN);
      if (!Number.isInteger(index)) return;
      this.#clearPowerDragState();
      // Rightmost power column (index % 3 === 2) is GM-only.
      if (!game.user?.isGM && index % 3 === 2) {
        ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.hud.dmColumnOnly"));
        return;
      }
      const raw = event.dataTransfer?.getData("text/plain") ?? "";
      let parsed: { type?: string; from?: number; uuid?: string } | null = null;
      try {
        parsed = JSON.parse(raw) as { type?: string; from?: number; uuid?: string };
      } catch {
        parsed = null;
      }

      // Rearrangement: dropping onto an occupied slot swaps both moves.
      if (parsed?.type === "pokemon-hud-power" && Number.isInteger(parsed.from)) {
        const from = Number(parsed.from);
        if (!game.user?.isGM && from % 3 === 2) {
          ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.hud.dmColumnOnly"));
          return;
        }
        await this.#mutateAndPatch(reorderPowerSlots(this.#actor, from, index));
        return;
      }

      const uuid = typeof parsed?.uuid === "string" ? parsed.uuid : undefined;
      if (!uuid) return;
      const doc = await foundry.utils.fromUuid(uuid);
      if (!doc || (doc as { documentName?: string }).documentName !== "Item") return;
      const d = doc as unknown as {
        name?: unknown;
        img?: unknown;
        system?: {
          description?: { value?: unknown } | unknown;
          uses?: { value?: unknown; max?: unknown } | unknown;
        };
      } | null;
      const name = d ? String(d.name ?? "") : "";
      if (!name) return;
      const img = d && typeof d.img === "string" ? d.img : undefined;
      const rawDesc = d?.system?.description;
      const descValue =
        typeof rawDesc === "object" && rawDesc !== null && "value" in rawDesc
          ? (rawDesc as { value?: unknown }).value
          : rawDesc;
      const description = String(descValue ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const usesRaw =
        typeof d?.system?.uses === "object" && d?.system?.uses !== null
          ? (d.system.uses as { value?: unknown; max?: unknown })
          : undefined;
      const usesVal = Number(usesRaw?.value ?? NaN);
      const usesMax = Number(usesRaw?.max ?? NaN);
      const pp = Number.isFinite(usesVal) ? Math.max(0, Math.floor(usesVal)) : 1;
      const maxPp = Number.isFinite(usesMax) ? Math.max(pp, Math.floor(usesMax)) : pp;
      const itemId = embeddedItemIdFor(this.#actor.id, doc);
      const slot = normalizePower({
        name,
        img,
        description,
        uuid,
        itemId,
        type: "normal",
        pp,
        maxPp,
        damage: ""
      });
      const key = movePreviewKey(this.#actor.id, slot);
      if (key) await loadMovePreview(key, doc as LinkedItemLike | null);
      await this.#mutateAndPatch(setPowerSlot(this.#actor, index, slot));
      return;
    }

    if (!this.#actor || this.#mode !== "trainer") return;

    const partySlot = target?.closest<HTMLElement>(".ph-party-slot[data-party-slot]");
    if (partySlot) {
      event.preventDefault();
      const rawIndex = Number(partySlot.dataset.partySlot ?? NaN);
      const index =
        Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < 6
          ? rawIndex
          : this.#nextPartyIndex();
      const raw = event.dataTransfer?.getData("text/plain") ?? "";
      let parsed: { uuid?: string } | null = null;
      try {
        parsed = JSON.parse(raw) as { uuid?: string };
      } catch {
        parsed = null;
      }
      const uuid = typeof parsed?.uuid === "string" ? parsed.uuid : undefined;
      if (!uuid) return;
      const doc = await foundry.utils.fromUuid(uuid);
      if (!doc || (doc as { documentName?: string }).documentName !== "Actor") return;
      const droppedActor = doc as Actor;
      if (detectHudMode(droppedActor) !== "pokemon") return;
      const id = droppedActor.id ?? uuid;
      const cur = getTrainerFlags(this.#actor).party.filter((p) => p !== id);
      const insertAt = Math.min(index, cur.length);
      cur.splice(insertAt, 0, id);
      this.#selectedPartyIndex = null;
      await this.#mutateAndPatch(setParty(this.#actor, cur.slice(0, 6)), [".ph-party-grid"]);
      return;
    }

    const objSlot = target?.closest<HTMLElement>(".ph-obj-slot[data-obj-slot]");
    if (objSlot) {
      event.preventDefault();
      if (!game.user?.isGM) return;
      const objIndex = Number(objSlot.dataset.objSlot ?? NaN);
      if (!Number.isInteger(objIndex)) return;
      const raw = event.dataTransfer?.getData("text/plain") ?? "";
      let parsed: { uuid?: string } | null = null;
      try {
        parsed = JSON.parse(raw) as { uuid?: string };
      } catch {
        parsed = null;
      }
      const uuid = typeof parsed?.uuid === "string" ? parsed.uuid : undefined;
      if (!uuid) return;
      const doc = await foundry.utils.fromUuid(uuid);
      const d = doc as unknown as {
        name?: unknown;
        img?: unknown;
        system?: { description?: { value?: unknown } | unknown };
      } | null;
      const name = d ? String(d.name ?? "") : "";
      if (!name) return;
      const img = d && typeof d.img === "string" ? d.img : undefined;
      const rawDesc = d?.system?.description;
      const descValue =
        typeof rawDesc === "object" && rawDesc !== null && "value" in rawDesc
          ? (rawDesc as { value?: unknown }).value
          : rawDesc;
      const description = String(descValue ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      await this.#mutateAndPatch(
        setObjectSlot(this.#actor, objIndex, { name, img, uuid, description }),
        [".ph-obj-list"]
      );
      return;
    }

    const traitSlot = target?.closest<HTMLElement>(".ph-traits-slot");
    if (traitSlot) {
      event.preventDefault();
      if (!game.user?.isGM) return;
      const raw = event.dataTransfer?.getData("text/plain") ?? "";
      let parsed: { uuid?: string } | null = null;
      try {
        parsed = JSON.parse(raw) as { uuid?: string };
      } catch {
        parsed = null;
      }
      const uuid = typeof parsed?.uuid === "string" ? parsed.uuid : undefined;
      if (!uuid) return;
      const doc = await foundry.utils.fromUuid(uuid);
      const d = doc as unknown as {
        name?: unknown;
        img?: unknown;
        system?: { description?: { value?: unknown } | unknown };
      } | null;
      const name = d ? String(d.name ?? "") : "";
      const img = d && typeof d.img === "string" ? d.img : undefined;
      const rawDesc = d?.system?.description;
      const descValue =
        typeof rawDesc === "object" && rawDesc !== null && "value" in rawDesc
          ? (rawDesc as { value?: unknown }).value
          : rawDesc;
      const description = String(descValue ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!name) return;
      const trait = traitSlot.dataset.trait;
      const index = Number(traitSlot.dataset.slot ?? NaN);
      if ((trait === "paths" || trait === "specializations") && Number.isInteger(index)) {
        await this.#mutateAndPatch(
          setTraitSlot(this.#actor, trait, index, { name, img, uuid, description }),
          [".ph-traits-overlay"]
        );
      }
      return;
    }

    const badgesPanel = target?.closest<HTMLElement>(".ph-badges-panel");
    if (badgesPanel) {
      event.preventDefault();
      if (!game.user?.isGM) return;
      const raw = event.dataTransfer?.getData("text/plain") ?? "";
      let parsed: { uuid?: string } | null = null;
      try {
        parsed = JSON.parse(raw) as { uuid?: string };
      } catch {
        parsed = null;
      }
      const uuid = typeof parsed?.uuid === "string" ? parsed.uuid : undefined;
      if (!uuid) return;
      const doc = await foundry.utils.fromUuid(uuid);
      const d = doc as unknown as { name?: unknown; img?: unknown } | null;
      const name = d ? String(d.name ?? "") : "";
      const img = d && typeof d.img === "string" ? d.img : undefined;
      if (name) {
        await this.#mutateAndPatch(addBadge(this.#actor, { name, img, unlocked: true }), [
          ".ph-badges-panel"
        ]);
      }
      return;
    }

    const slot = target?.closest<HTMLElement>(".ph-inv-slot");
    if (!slot) return;
    event.preventDefault();

    const raw = event.dataTransfer?.getData("text/plain") ?? "";
    let parsed: { type?: string; id?: string; uuid?: string } | null = null;
    try {
      parsed = JSON.parse(raw) as { type?: string; id?: string; uuid?: string };
    } catch {
      parsed = null;
    }

    if (parsed?.type === "pokemon-hud-inv" && typeof parsed.id === "string") {
      const targetId = slot.dataset.itemId ?? null;
      await this.#mutateAndPatch(moveActorItem(this.#actor, parsed.id, targetId), [".ph-inv-grid"]);
      return;
    }

    const uuid = typeof parsed?.uuid === "string" && parsed.uuid ? parsed.uuid : undefined;
    if (uuid) {
      const doc = await foundry.utils.fromUuid(uuid);
      if (doc) {
        const source = (doc as unknown as { toObject: () => Record<string, unknown> }).toObject();
        delete source._id;
        delete source.sort;
        await this.#mutateAndPatch(addActorItemFromSource(this.#actor, source), [".ph-inv-grid"]);
      }
    }
  };
}

/** Show/hide Foundry's macro bar. V14 renders it as `#hotbar` (its Hotbar app
    id); `#macro-bar` is kept as a fallback. */
export function applyMacroBarPreference(): void {
  const hidden = getSettings().hideMacroBar || visibleActor() !== null;
  for (const selector of ["#hotbar", "#macro-bar"]) {
    const bar = document.querySelector<HTMLElement>(selector);
    if (bar) bar.classList.toggle("ph-hidden", hidden);
  }
}

/** Recalculate the bar placement without touching its content; wired to the
    client `position` setting (left/center/right) onChange hook. */
export function repositionHud(): void {
  activeInstance?.reposition();
}

let autoRenderSuppressions = 0;

export function beginAutoRenderSuppression(): void {
  autoRenderSuppressions += 1;
}

export function endAutoRenderSuppression(): void {
  autoRenderSuppressions = Math.max(0, autoRenderSuppressions - 1);
}

export function isAutoRenderSuppressed(): boolean {
  return autoRenderSuppressions > 0;
}

let activeInstance: PokemonHudApp | null = null;

export function visibleActor(): Actor | null {
  return activeInstance?.currentActor ?? null;
}

/** True while a summon placement awaits a click. Foundry's placement workflow
    releases every controlled token, and the HUD must survive that release. */
export function isSummonPlacementActive(): boolean {
  return activeInstance?.placingSummon ?? false;
}

export async function refreshPartyForActor(actor: Actor): Promise<void> {
  const app = activeInstance;
  if (!app) return;
  const baseId =
    (actor as { token?: { document?: { actorId?: string } } }).token?.document?.actorId ??
    actor.id ??
    "";
  await app.refreshPartyIfMember(baseId);
}

let scheduledFlush: number | null = null;
let scheduledActor: Actor | null = null;
let scheduledHide = false;
let scheduledRefresh = false;

async function activateHud(actor: Actor): Promise<void> {
  if (isMobileMode()) return;
  if (!activeInstance) {
    activeInstance = new PokemonHudApp();
  }
  await activeInstance.setActor(actor);
}

async function deactivateHud(): Promise<void> {
  if (!activeInstance) return;
  const app = activeInstance;
  activeInstance = null;
  await app.close();
}

function flushHudSchedule(): void {
  scheduledFlush = null;
  const actor = scheduledActor;
  const hide = scheduledHide;
  const refresh = scheduledRefresh;
  scheduledActor = null;
  scheduledHide = false;
  scheduledRefresh = false;
  if (actor) {
    void activateHud(actor);
    return;
  }
  if (hide) {
    void deactivateHud();
    return;
  }
  if (refresh) void activeInstance?.refreshInPlace();
}

function ensureHudFlush(): void {
  if (scheduledFlush !== null) return;
  scheduledFlush = requestAnimationFrame(flushHudSchedule);
}

function cancelHudFlush(): void {
  if (scheduledFlush !== null) {
    cancelAnimationFrame(scheduledFlush);
    scheduledFlush = null;
  }
  scheduledActor = null;
  scheduledHide = false;
  scheduledRefresh = false;
}

/** Coalesce control/update bursts into a single render per frame so the bar no
    longer flashes several times while switching tokens or applying flag changes. */
export function showHud(actor: Actor): void {
  scheduledActor = actor;
  scheduledHide = false;
  scheduledRefresh = false;
  ensureHudFlush();
}

export function hideHud(): void {
  if (!scheduledActor) {
    scheduledHide = true;
    scheduledRefresh = false;
  }
  ensureHudFlush();
}

export function refreshHud(): void {
  if (scheduledActor || scheduledHide) return;
  scheduledRefresh = true;
  ensureHudFlush();
}

export async function toggleHud(actor: Actor): Promise<void> {
  cancelHudFlush();
  if (activeInstance && activeInstance.currentActor?.id === actor.id) return deactivateHud();
  return activateHud(actor);
}
