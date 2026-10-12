import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "../../src/modules/core/logger";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Logger", () => {
  it("info prepends the prefix", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const log = new Logger("Test");
    log.info("hello");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("Test");
    expect(spy.mock.calls[0][0]).toContain("hello");
  });

  it("warn prepends the prefix", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = new Logger("W");
    log.warn("issue");
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toContain("W");
  });

  it("error prepends the prefix", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = new Logger("E");
    log.error("boom");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("joins multiple arguments with spaces", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const log = new Logger("P");
    log.info("a", "b", "c");
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toContain("a b c");
  });

  it("stringifies non-string arguments", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const log = new Logger("P");
    log.info({ x: 1 });
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toContain('{"x":1}');
  });
});
