import "./styles/module.scss";
import { registerApi } from "./modules/api";
import { registerKeybindings } from "./modules/core/keybindings";
import { registerSettings, getSettings } from "./modules/core/settings";
import { registerHandlebarsHelpers } from "./modules/core/handlebars";
import { isMobileMode, watchMobileMode } from "./modules/core/mobile";
import { logger } from "./modules/core/logger";
import { initHudSocket } from "./modules/net/socket";
import {
  hideHud,
  isAutoRenderSuppressed,
  refreshPartyForActor,
  showHud,
  visibleActor,
  applyMacroBarPreference
} from "./modules/apps/PokemonHudApp";

Hooks.once("init", () => {
  registerSettings({ onHideMacroBarChange: applyMacroBarPreference });
  registerKeybindings();
  registerHandlebarsHelpers();
});

Hooks.once("ready", () => {
  const version = game.modules.get("pokemon-hud-like")?.version ?? "?";
  logger.info(`Pokémon HUD-like v${version} ready`);
  initHudSocket();
  registerApi();

  applyMacroBarPreference();

  watchMobileMode((mobile) => {
    if (mobile && visibleActor()) void hideHud();
  });
});

Hooks.on("controlToken", (token: Token, controlled: boolean) => {
  if (isMobileMode()) return;
  const { autoShow } = getSettings();
  if (!autoShow) return;
  if (controlled && token.actor) void showHud(token.actor);
  else if (!controlled && visibleActor()?.id === token.id) void hideHud();
});

Hooks.on("updateActor", (actor: Actor, _changes: unknown, _options: unknown, userId: string) => {
  const visible = visibleActor();
  if (!visible) return;
  if (visible.id === actor.id) {
    if (userId === game.user?.id && !isAutoRenderSuppressed()) void showHud(actor);
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
