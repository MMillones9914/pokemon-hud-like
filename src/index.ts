import "./styles/module.scss";
import { registerApi } from "./modules/api";
import { registerKeybindings } from "./modules/core/keybindings";
import { registerSettings, getSettings } from "./modules/core/settings";
import { registerHandlebarsHelpers } from "./modules/core/handlebars";
import { refreshModuleTranslations } from "./modules/core/i18n";
import { isMobileMode, watchMobileMode } from "./modules/core/mobile";
import { logger } from "./modules/core/logger";
import { initHudSocket } from "./modules/net/socket";
import { invalidateMovePreview, movePreviewKey } from "./modules/data/move-preview";
import {
  hideHud,
  isAutoRenderSuppressed,
  isSummonPlacementActive,
  refreshHud,
  refreshPartyForActor,
  showHud,
  visibleActor,
  applyMacroBarPreference,
  repositionHud
} from "./modules/apps/PokemonHudApp";

Hooks.once("init", () => {
  registerSettings({
    onHideMacroBarChange: applyMacroBarPreference,
    onPositionChange: repositionHud
  });
  registerKeybindings();
  registerHandlebarsHelpers();
});

Hooks.once("ready", () => {
  const version = game.modules.get("pokemon-hud-like")?.version ?? "?";
  logger.info(`Pokémon HUD-like v${version} ready`);
  initHudSocket();
  registerApi();

  void refreshModuleTranslations();

  applyMacroBarPreference();

  watchMobileMode((mobile) => {
    if (mobile && visibleActor()) void hideHud();
  });
});

Hooks.on("controlToken", (token: Token, controlled: boolean) => {
  if (isMobileMode()) return;
  const { autoShow } = getSettings();
  if (!autoShow) return;
  if (controlled && token.actor) {
    void showHud(token.actor);
    return;
  }
  if (!controlled) {
    // Summon placement releases every controlled token; keep the HUD up until
    // the player either places the Pokémon or cancels.
    if (isSummonPlacementActive()) return;
    const remaining = ((canvas?.tokens?.controlled ?? []) as Token[]).length;
    if (remaining === 0) void hideHud();
  }
});

Hooks.on("updateActor", (actor: Actor, _changes: unknown, _options: unknown, userId: string) => {
  const visible = visibleActor();
  if (!visible) return;
  if (visible.id === actor.id) {
    if (userId === game.user?.id && !isAutoRenderSuppressed()) void refreshHud();
    return;
  }

  void refreshPartyForActor(actor);
});

Hooks.on("updateToken", (token: TokenDocument, change: unknown) => {
  const hp = (change as { delta?: { system?: { attributes?: { hp?: unknown } } } })?.delta?.system
    ?.attributes?.hp;
  if (hp === undefined) return;
  const actor = token.actor;
  if (actor) void refreshPartyForActor(actor);
});

/** Moves are linked to real Items: a charge spent (or refunded) on the sheet must
    be reflected by the HUD, and its cached tooltip preview is now stale. */
function onItemChanged(item: Item): void {
  const actor = item.parent as Actor | null;
  if (!actor?.id) return;
  invalidateMovePreview(movePreviewKey(actor.id, { itemId: item.id ?? undefined }));
  invalidateMovePreview(movePreviewKey(actor.id, { uuid: item.uuid ?? undefined }));
  const visible = visibleActor();
  if (!visible || visible.id !== actor.id) return;
  if (isAutoRenderSuppressed()) return;
  refreshHud();
}

Hooks.on("updateItem", (item: Item) => onItemChanged(item));
Hooks.on("createItem", (item: Item) => onItemChanged(item));
Hooks.on("deleteItem", (item: Item) => onItemChanged(item));

// Keep the summon button/party highlight in sync when tokens are added or removed.
Hooks.on("createToken", () => {
  if (!isAutoRenderSuppressed()) refreshHud();
});

Hooks.on("deleteToken", () => {
  if (!isAutoRenderSuppressed()) refreshHud();
});
