const MOBILE_MEDIA = "(max-width: 768px), (pointer: coarse)";

function mobileQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia(MOBILE_MEDIA);
  } catch {
    return null;
  }
}

export function isSwipeMobileMode(): boolean {
  try {
    const body = typeof document !== "undefined" ? document.body : null;
    if (!body) return false;
    return body.classList.contains("swipe-vtt") && !body.classList.contains("swipe-vtt-foundry-ui");
  } catch {
    return false;
  }
}

export function isMobileMode(): boolean {
  return isSwipeMobileMode() || (mobileQuery()?.matches ?? false);
}

export function watchMobileMode(onChange: (mobile: boolean) => void): () => void {
  let last = isMobileMode();
  const emit = (): void => {
    const next = isMobileMode();
    if (next === last) return;
    last = next;
    onChange(next);
  };

  const mql = mobileQuery();
  const onMedia = (): void => emit();
  mql?.addEventListener("change", onMedia);

  const body = typeof document !== "undefined" ? document.body : null;
  let observer: MutationObserver | null = null;
  if (body && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(emit);
    observer.observe(body, { attributes: true, attributeFilter: ["class"] });
  }

  return () => {
    mql?.removeEventListener("change", onMedia);
    observer?.disconnect();
  };
}
