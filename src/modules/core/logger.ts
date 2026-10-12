export class Logger {
  private readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private static fmt(...args: unknown[]): string {
    return args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  }

  info(...args: unknown[]): void {
    console.info(`${this.prefix} | ${Logger.fmt(...args)}`);
  }

  warn(...args: unknown[]): void {
    console.warn(`${this.prefix} | ${Logger.fmt(...args)}`);
  }

  error(...args: unknown[]): void {
    console.error(`${this.prefix} | ${Logger.fmt(...args)}`);
  }

  debug(...args: unknown[]): void {
    if (this.isDebugEnabled()) console.debug(`${this.prefix} | ${Logger.fmt(...args)}`);
  }

  private isDebugEnabled(): boolean {
    try {
      return Boolean(game.settings.get("pokemon-hud-like", "debug"));
    } catch {
      return false;
    }
  }
}

export const logger = new Logger("PokemonHud");
