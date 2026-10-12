import { describe, expect, it } from "vitest";
import { isMobileMode, isSwipeMobileMode, watchMobileMode } from "../../src/modules/core/mobile";

describe("core/mobile", () => {
  it("degrades to non-mobile outside a browser", () => {
    expect(isMobileMode()).toBe(false);
    expect(isSwipeMobileMode()).toBe(false);
  });

  it("watchMobileMode is a safe no-op outside a browser", () => {
    expect(typeof watchMobileMode(() => {})).toBe("function");
  });
});
