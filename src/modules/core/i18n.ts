import { logger } from "./logger";

const MODULE_ID = "pokemon-hud-like";

const LANG_FILES = [
  { lang: "en", path: "lang/en.json" },
  { lang: "es", path: "lang/es.json" }
];

/**
 * Re-fetch the module's own language file with a cache-busting query so a stale
 * browser/CDN copy cannot hide keys added in a newer version. The file is merged
 * over the already-loaded translations; failures are swallowed.
 */
export async function refreshModuleTranslations(): Promise<void> {
  try {
    const file = LANG_FILES.find((entry) => entry.lang === game.i18n.lang);
    if (!file) return;
    const url = `modules/${MODULE_ID}/${file.path}?v=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return;
    const json = (await response.json()) as Record<string, unknown>;
    if (json && typeof json === "object") {
      Object.assign(game.i18n.translations as unknown as Record<string, unknown>, json);
    }
  } catch (err) {
    logger.debug(`refreshModuleTranslations: ${String(err)}`);
  }
}
