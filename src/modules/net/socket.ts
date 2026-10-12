import type { PowerData } from "../types";

const SCOPE = "pokemon-hud-like";

export interface PowerUsePayload {
  actorName: string;
  power: PowerData;
  speakerId: string;
}

interface SocketModule {
  register(name: string, handler: (payload: PowerUsePayload) => void): void;
  execute(name: string, ...args: unknown[]): void;
}

interface SocketLibLike {
  registerModule(id: string): SocketModule;
  getModule(id: string): SocketModule;
}

function socketLib(): SocketLibLike | null {
  return (
    ((globalThis as unknown as Record<string, unknown>)["socketlib"] as
      SocketLibLike | undefined) ?? null
  );
}

export function initHudSocket(): void {
  const socketlib = socketLib();
  if (!socketlib) {
    console.debug("PokemonHud | socketlib not found — skipping broadcast support.");
    return;
  }
  const socket = socketlib.registerModule(SCOPE);
  socket.register("powerUsed", (payload: PowerUsePayload) => {
    const name = payload.power?.name ?? "?";
    void ui.notifications?.info(game.i18n.format("pokemon-hud-like.chat.powerUsed", { name }), {
      console: false
    });
  });
}

export function broadcastPowerUsage(payload: PowerUsePayload): void {
  socketLib()?.getModule(SCOPE).execute("powerUsed", payload);
}
