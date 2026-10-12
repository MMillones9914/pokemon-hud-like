import { toggleHud } from "../apps/PokemonHudApp";
import { isMobileMode } from "./mobile";
import { logger } from "./logger";

const MODULE_ID = "pokemon-hud-like";

export function registerKeybindings(): void {
  game.keybindings.register(MODULE_ID, "open-hud", {
    name: "pokemon-hud-like.keybindings.open.name",
    hint: "pokemon-hud-like.keybindings.open.hint",
    editable: [{ key: "KeyP", modifiers: ["SHIFT"] }],
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    onDown: () => {
      try {
        if (isMobileMode()) {
          ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.keybindings.open.mobile"));
          return true;
        }
        const tokens = (canvas?.tokens?.controlled ?? []) as Token[];
        const actor = tokens[0]?.actor;
        if (actor) {
          void toggleHud(actor);
        } else {
          ui.notifications?.warn(game.i18n.localize("pokemon-hud-like.keybindings.open.noToken"));
        }
      } catch (err) {
        logger.error(
          "keybindings open-hud failed",
          err instanceof Error ? (err.stack ?? err.message) : String(err)
        );
      }
      return true;
    }
  });
}
