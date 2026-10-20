import type { HudPosition } from "../types";
import { parseKeyItemNames } from "./key-items";

const SCOPE = "pokemon-hud-like";

export const SETTINGS = {
  enabled: "enabled",
  autoShow: "autoShow",
  position: "position",
  offsetX: "offsetX",
  offsetY: "offsetY",
  accentColor: "accentColor",
  hideMacroBar: "hideMacroBar",
  keyItems: "keyItems",
  debug: "debug"
} as const;

export const DEFAULT_ACCENT = "#ee1515";

export interface SettingsHooks {
  onHideMacroBarChange?: () => void;
  onPositionChange?: () => void;
}

export function registerSettings(hooks?: SettingsHooks): void {
  game.settings.register(SCOPE, SETTINGS.enabled, {
    name: "pokemon-hud-like.settings.enabled.name",
    hint: "pokemon-hud-like.settings.enabled.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SCOPE, SETTINGS.autoShow, {
    name: "pokemon-hud-like.settings.autoShow.name",
    hint: "pokemon-hud-like.settings.autoShow.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SCOPE, SETTINGS.position, {
    name: "pokemon-hud-like.settings.position.name",
    hint: "pokemon-hud-like.settings.position.hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      left: "pokemon-hud-like.settings.position.left",
      center: "pokemon-hud-like.settings.position.center",
      right: "pokemon-hud-like.settings.position.right"
    },
    default: "center",
    onChange: () => hooks?.onPositionChange?.()
  });

  game.settings.register(SCOPE, SETTINGS.offsetX, {
    name: "pokemon-hud-like.settings.offsetX.name",
    hint: "pokemon-hud-like.settings.offsetX.hint",
    scope: "client",
    config: true,
    type: Number,
    default: 24
  });

  game.settings.register(SCOPE, SETTINGS.offsetY, {
    name: "pokemon-hud-like.settings.offsetY.name",
    hint: "pokemon-hud-like.settings.offsetY.hint",
    scope: "client",
    config: true,
    type: Number,
    default: 10
  });

  game.settings.register(SCOPE, SETTINGS.accentColor, {
    name: "pokemon-hud-like.settings.accentColor.name",
    hint: "pokemon-hud-like.settings.accentColor.hint",
    scope: "client",
    config: true,
    type: new foundry.data.fields.ColorField({
      initial: DEFAULT_ACCENT,
      nullable: false,
      blank: false
    }) as unknown as typeof String,
    default: DEFAULT_ACCENT
  });

  game.settings.register(SCOPE, SETTINGS.hideMacroBar, {
    name: "pokemon-hud-like.settings.hideMacroBar.name",
    hint: "pokemon-hud-like.settings.hideMacroBar.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => hooks?.onHideMacroBarChange?.()
  });

  game.settings.register(SCOPE, SETTINGS.keyItems, {
    name: "pokemon-hud-like.settings.keyItems.name",
    hint: "pokemon-hud-like.settings.keyItems.hint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(SCOPE, SETTINGS.debug, {
    name: "pokemon-hud-like.settings.debug.name",
    hint: "pokemon-hud-like.settings.debug.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

/** Item names configured as "key items" (comma / newline separated). */
export function getKeyItemNames(): string[] {
  try {
    return parseKeyItemNames(game.settings.get(SCOPE, SETTINGS.keyItems));
  } catch {
    return [];
  }
}

export function getSettings(): {
  enabled: boolean;
  autoShow: boolean;
  position: HudPosition;
  offsetX: number;
  offsetY: number;
  accentColor: string;
  hideMacroBar: boolean;
  debug: boolean;
} {
  return {
    enabled: game.settings.get(SCOPE, SETTINGS.enabled) as boolean,
    autoShow: game.settings.get(SCOPE, SETTINGS.autoShow) as boolean,
    position: readHudPosition(),
    offsetX: game.settings.get(SCOPE, SETTINGS.offsetX) as number,
    offsetY: game.settings.get(SCOPE, SETTINGS.offsetY) as number,
    accentColor: toCssColor(game.settings.get(SCOPE, SETTINGS.accentColor)),
    hideMacroBar: game.settings.get(SCOPE, SETTINGS.hideMacroBar) as boolean,
    debug: game.settings.get(SCOPE, SETTINGS.debug) as boolean
  };
}

/** The stored value may predate the left/center/right choices (old top/bottom
    values); anything unexpected falls back to center. */
function readHudPosition(): HudPosition {
  const raw = game.settings.get(SCOPE, SETTINGS.position) as string;
  return raw === "left" || raw === "right" ? raw : "center";
}

function toCssColor(value: unknown): string {
  if (typeof value === "string" && value) return value;
  const s = String(value);
  return s && s !== "NaN" && s !== "null" ? s : DEFAULT_ACCENT;
}

export function isDebug(): boolean {
  return getSettings().debug;
}
