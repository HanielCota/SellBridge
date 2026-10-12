/** Self-contained: rendered inline before module scripts, even if hydration cannot start. */
export function installAssetRecovery(): void {
  let scheduled = false;
  const recover = (): boolean => {
    if (scheduled) return true;
    if (!navigator.onLine) return false;
    try {
      const key = "sellbridge:asset-recovery";
      const lastAttempt = Number(sessionStorage.getItem(key));
      const now = Date.now();
      if (lastAttempt && now - lastAttempt < 60_000) return false;
      sessionStorage.setItem(key, String(now));
    } catch {
      // Without durable state, a persistent failure could cause a reload loop.
      return false;
    }
    scheduled = true;
    window.setTimeout(() => window.location.reload(), 1_000);
    return true;
  };
  window.addEventListener("vite:preloadError", (event) => {
    if (recover()) event.preventDefault();
  });
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      const resource =
        target instanceof HTMLScriptElement
          ? target.src
          : target instanceof HTMLLinkElement && target.rel === "modulepreload"
            ? target.href
            : "";
      if (!resource) return;
      const url = new URL(resource, window.location.href);
      if (url.origin === window.location.origin && url.pathname.startsWith("/assets/")) recover();
    },
    true,
  );
  window.addEventListener("unhandledrejection", (event) => {
    const message = event.reason instanceof Error ? event.reason.message : "";
    if (
      /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        message,
      )
    ) {
      if (recover()) event.preventDefault();
    }
  });
}

export const assetRecoveryScript = `(${installAssetRecovery.toString()})();`;
