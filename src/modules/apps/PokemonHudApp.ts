import type { DeepPartial } from "fvtt-types/utils";
import type { HudBarContext, HudMode, InventoryCategory, PowerData } from "../types";
import {
  addActorItemFromSource,
  addBadge,
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
  updatePower
} from "../core/powers";
import { isMobileMode } from "../core/mobile";
import { getSettings } from "../core/settings";
import { readStatBreakdown } from "../core/stat-breakdown";
import { d20Formula, rollModeFromKeys, type RollMode } from "../core/roll-mode";

const MODULE_ID = "pokemon-hud-like";

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

const POKEDEX_FALLBACK: Record<string, { en: string; es: string }> = {
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
  "pokemon-hud-like.chat.pokedexUnknown": { en: "—", es: "—" }
};

/** Localize a key, falling back to bundled strings when a stale lang file is served. */
function phText(key: string, data?: Record<string, unknown>): string {
  if (game.i18n.has(key)) return game.i18n.format(key, data);
  const fallback = POKEDEX_FALLBACK[key];
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
      template: `modules/${MODULE_ID}/templates/apps/pokemon-hud-0.1.12.hbs`,
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

  #selectedPokeballId: string | null = null;

  #captureTimer: number | null = null;
  #onResizeBound?: () => void;
  #resizeObserver?: ResizeObserver;

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
    else if (action === "toggle-stats") this.#onToggleStats();
    else if (action === "roll-ability") void this.#onRollAbility(button, mode);
    else if (action === "roll-skill") void this.#onRollSkill(button, mode);
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
    void this.#mutateAndRender(setPokemonXp(actor, value));
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
      this.element.addEventListener("change", this.#onChange);
      this.element.addEventListener("submit", this.#onSubmit);
      this.element.addEventListener("contextmenu", this.#onContextMenu);
      this.element.addEventListener("dragstart", this.#onDragStart);
      this.element.addEventListener("dragover", this.#onDragOver);
      this.element.addEventListener("drop", this.#onDrop);
      this.element.addEventListener("mouseover", this.#onDiceOver);
      this.element.addEventListener("mouseout", this.#onDiceOut);
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
      this.#applyThemeClass();
      this.#applyBarState();
      applyMacroBarPreference();
      this.#positionBar();
      this.#repositionAfterRender();
    } catch (err) {
      this.#handleError("_onRender", err);
    }
  }

  override _onClose(options: DeepPartial<BarRenderOptions>): void {
    if (this.#diceHideTimer !== null) {
      window.clearTimeout(this.#diceHideTimer);
      this.#diceHideTimer = null;
    }
    this.#removeCaptureOverlay();
    applyMacroBarPreference();
    this.#unbindPositioning();
    super._onClose(options);
  }

  async setActor(actor: Actor): Promise<void> {
    this.#actor = actor;
    this.#mode = detectHudMode(actor);
    await this.render({ force: true });
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
      with `!important` so AppV2 window-pose logic can't re-position it. */
  #positionBar(): void {
    const el = this.element;
    if (!el.isConnected) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const vw = window.innerWidth;

    if (vw <= 1380) {
      el.style.setProperty("left", `${margin}px`, "important");
      el.style.setProperty("transform", "none", "important");
      return;
    }

    let left = Math.max(margin, (vw - rect.width) / 2);
    const sidebar = document.getElementById("sidebar");
    if (sidebar && sidebar.offsetWidth > 0) {
      const side = sidebar.getBoundingClientRect();
      left = Math.min(left, Math.max(margin, side.left - rect.width - margin));
    }
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
      const sidebar = document.getElementById("sidebar");
      if (sidebar) this.#resizeObserver.observe(sidebar);
    } catch (err) {
      this.#handleError("bind positioning", err);
    }
  }

  #unbindPositioning(): void {
    if (this.#onResizeBound) window.removeEventListener("resize", this.#onResizeBound);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#onResizeBound = undefined;
  }

  #onOpenSheet(): void {
    this.#actor?.sheet?.render(true);
  }

  #onOpenPartySheet(element: HTMLElement): void {
    const actorId = element.dataset.actorId;
    if (!actorId) return;
    resolvePartyActor(actorId)?.sheet?.render(true);
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
    if (power.uuid) await this.#activateByUuid(power.uuid, power.name);
    else await this.#chatItemFallback(actor, power.name);
    await this.#postPowerToChat(power, actor);
    await this.#mutateAndRender(updatePower(actor, index, { pp: Math.max(0, power.pp - 1) }));
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
      await this.#mutateAndRender(this.#consumeEquipado(doc));
    }
  }

  async #activateByUuid(uuid: string, fallbackName: string): Promise<unknown> {
    const actor = this.#actor;
    if (!actor) return null;
    const doc = await foundry.utils.fromUuid(uuid);
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

  /** Swap only the given sections instead of a full render: an AppV2 re-render
      repaints the whole bar and makes it flicker. */
  async #patchBar(selectors: string[]): Promise<void> {
    const renderTemplate = (
      foundry as unknown as {
        applications?: {
          handlebars?: { renderTemplate?: (path: string, data: unknown) => Promise<string> };
        };
      }
    ).applications?.handlebars?.renderTemplate as
      ((path: string, data: unknown) => Promise<string>) | undefined;
    if (!renderTemplate) {
      await this.render({ force: true });
      return;
    }
    const context = (await this._prepareContext({ isFirstRender: false })) as unknown as Record<
      string,
      unknown
    >;
    const html = await renderTemplate(PokemonHudApp.PARTS.bar.template, context);
    const parsed = new DOMParser().parseFromString(html, "text/html");
    for (const selector of selectors) {
      const fresh = parsed.querySelector(selector);
      const live = this.element.querySelector(selector);
      if (fresh && live) live.replaceChildren(...Array.from(fresh.childNodes));
    }
    this.#positionBar();
  }

  /** Mutate a flag then patch the affected sections, suppressing the external
      updateActor full render so the bar never flashes. */
  async #mutateAndPatch(mutator: Promise<unknown>, selectors: string[]): Promise<void> {
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

  /** Mutate a flag that changes the bar structurally, then do a single full
      render while suppressing the updateActor render it would otherwise trigger. */
  async #mutateAndRender(mutator: Promise<unknown>): Promise<void> {
    beginAutoRenderSuppression();
    try {
      await mutator;
      await this.render({ force: true });
    } catch (err) {
      logger.warn(`HUD mutate+render: ${String(err)}`);
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
    await this.#mutateAndRender(levelUpPokemon(actor));
  }

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
      void this.#mutateAndRender(removePower(actor, index));
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
      void this.#mutateAndRender(setPokemonSlot(actor, key, { name: "" }));
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
    if (!this.#actor || this.#mode !== "trainer") return;

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
      await this.#mutateAndRender(
        setPokemonSlot(this.#actor, key, { name, img, uuid, description })
      );
      return;
    }

    const powerCard = target?.closest<HTMLElement>(".ph-power-card[data-power-slot]");
    if (powerCard && this.#actor && this.#mode === "pokemon") {
      event.preventDefault();
      const index = Number(powerCard.dataset.powerSlot ?? NaN);
      if (!Number.isInteger(index)) return;
      // Rightmost power column (index % 3 === 2) is GM-only.
      if (!game.user?.isGM && index % 3 === 2) {
        ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.hud.dmColumnOnly"));
        return;
      }
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
      await this.#mutateAndRender(
        setPowerSlot(
          this.#actor,
          index,
          normalizePower({ name, img, description, uuid, type: "normal", pp, maxPp, damage: "" })
        )
      );
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
  if (refresh) void activeInstance?.render({ force: true });
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
