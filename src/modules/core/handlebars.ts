const HandlebarsGlobal = globalThis.Handlebars as
  { registerHelper(name: string, fn: (...args: unknown[]) => unknown): void } | undefined;

export function registerHandlebarsHelpers(): void {
  if (!HandlebarsGlobal) return;
  HandlebarsGlobal.registerHelper("phRange", (n: unknown) => {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    return Array.from({ length: count }, (_, i) => i);
  });
  HandlebarsGlobal.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  HandlebarsGlobal.registerHelper("sum", (a: unknown, b: unknown) => Number(a) + Number(b));
}
