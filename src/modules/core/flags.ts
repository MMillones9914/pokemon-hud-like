const SCOPE = "pokemon-hud-like";

interface TokenCapableActor {
  isToken?: boolean;
}

/**
 * Module flags live on the base (world) Actor. An unlinked token gets a
 * synthetic Actor per token whose flags are discarded with the token, so
 * reading/writing there makes abilities and powers vanish when the token is
 * deleted and re-placed.
 */
export function flagTarget(actor: Actor): Actor {
  if ((actor as unknown as TokenCapableActor).isToken) {
    const base = game.actors?.get(actor.id ?? "");
    if (base) return base;
  }
  return actor;
}

export function getModuleFlag(actor: Actor, key: string): unknown {
  return (flagTarget(actor) as unknown as { getFlag(scope: string, key: string): unknown }).getFlag(
    SCOPE,
    key
  );
}

export function setModuleFlag(actor: Actor, key: string, value: unknown): Promise<unknown> {
  return (
    flagTarget(actor) as unknown as {
      setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    }
  ).setFlag(SCOPE, key, value);
}
