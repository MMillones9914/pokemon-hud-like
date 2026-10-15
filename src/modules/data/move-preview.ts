import { logger } from "../core/logger";
import type { LinkedItemLike } from "../core/move-link";

interface RichPreview {
  html: string;
  classes: string[];
}

interface RichTooltipResult {
  content?: string;
  classes?: string[];
}

type RichTooltipFn = (
  options?: unknown
) => Promise<RichTooltipResult | null> | RichTooltipResult | null;

interface RichTooltipDoc {
  richTooltip?: RichTooltipFn;
  system?: { richTooltip?: RichTooltipFn } | unknown;
}

/** Rich tooltips are cached per actor+item; inventory grids can hold many items. */
const CACHE_LIMIT = 512;
const cache = new Map<string, RichPreview>();

/** Stable cache key for a move preview: one entry per item of one actor. */
export function movePreviewKey(
  actorId: string | null | undefined,
  ref: { itemId?: string; uuid?: string } | null | undefined
): string | null {
  if (!ref) return null;
  const id = ref.itemId || ref.uuid;
  if (!id) return null;
  return `${actorId ?? "?"}:${id}`;
}

export function invalidateMovePreview(key: string | null | undefined): void {
  if (key) cache.delete(key);
}

export function clearMovePreviews(): void {
  cache.clear();
}

/** Renders the system's own rich item tooltip ("the Foundry view" shown when
    hovering an item link in chat). Runtime only — reads `item.richTooltip()`,
    which dnd5e exposes on both the Item document and its system data model. */
export async function loadMovePreview(
  key: string,
  item: LinkedItemLike | null
): Promise<RichPreview | null> {
  const cached = cache.get(key);
  if (cached) return cached;
  if (!item) return null;

  try {
    const doc = item as unknown as RichTooltipDoc;
    const own = typeof doc.richTooltip === "function" ? await doc.richTooltip({}) : null;
    if (own?.content) return remember(key, own);

    const system = doc.system as { richTooltip?: RichTooltipFn } | undefined;
    if (system && typeof system.richTooltip === "function") {
      const sys = await system.richTooltip({});
      if (sys?.content) return remember(key, sys);
    }
  } catch (err) {
    logger.warn(`movePreview: ${String(err)}`);
  }
  return null;
}

function remember(key: string, result: RichTooltipResult): RichPreview {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  const preview: RichPreview = {
    html: String(result.content ?? ""),
    classes: Array.isArray(result.classes) ? result.classes.map(String) : []
  };
  cache.set(key, preview);
  return preview;
}
