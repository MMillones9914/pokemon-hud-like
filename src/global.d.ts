export {};

declare global {
  interface AssumeHookRan {
    ready: object;
  }

  interface SettingConfig {
    "pokemon-hud-like.enabled": boolean;
    "pokemon-hud-like.autoShow": boolean;
    "pokemon-hud-like.position": import("./modules/types").HudPosition;
    "pokemon-hud-like.offsetX": number;
    "pokemon-hud-like.offsetY": number;
    "pokemon-hud-like.accentColor": string;
    "pokemon-hud-like.hideMacroBar": boolean;
    "pokemon-hud-like.keyItems": string;
    "pokemon-hud-like.debug": boolean;
    "core.uiConfig": foundry.applications.settings.menus.UIConfig.GameUIConfiguration;
  }

  interface ModuleConfig {
    "pokemon-hud-like": {
      api: import("./modules/api").PokemonHudApi;
    };
  }
}
