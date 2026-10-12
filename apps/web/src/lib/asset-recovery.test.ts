import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { assetRecoveryScript } from "./asset-recovery";

function browser(storage = new Map<string, string>(), online = true) {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  // Callback APIs below deliberately emulate the browser timer and event interfaces.
  const reload = vi.fn<() => void>();
  const timers: (() => void)[] = [];
  const context = {
    window: {
      addEventListener: (name: string, listener: (event: Record<string, unknown>) => void) =>
        listeners.set(name, listener),
      location: {
        href: "https://app.example/dashboard?period=30d",
        origin: "https://app.example",
        reload,
      },
      // oxlint-disable-next-line promise/prefer-await-to-callbacks
      setTimeout: (callback: () => void) => timers.push(callback),
    },
    navigator: { onLine: online },
    sessionStorage: {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    HTMLScriptElement: class {
      src = "";
    },
    HTMLLinkElement: class {
      href = "";
      rel = "modulepreload";
    },
    URL,
    Error,
  };
  runInNewContext(assetRecoveryScript, context);
  return { listeners, reload, timers, context };
}

describe("inline asset recovery before hydration", () => {
  it("coalesces failed imports and permits only one automatic reload within a minute", () => {
    const storage = new Map<string, string>();
    const first = browser(storage);
    const event = { preventDefault: vi.fn<() => void>() };
    first.listeners.get("vite:preloadError")?.(event);
    first.listeners.get("vite:preloadError")?.(event);
    expect(first.timers).toHaveLength(1);
    first.timers[0]?.();
    expect(first.reload).toHaveBeenCalledOnce();
    const second = browser(storage);
    const persistentError = { preventDefault: vi.fn<() => void>() };
    second.listeners.get("vite:preloadError")?.(persistentError);
    expect(second.timers).toHaveLength(0);
    expect(persistentError.preventDefault).not.toHaveBeenCalled();
  });

  it("recovers an entry module failure before the app JavaScript has loaded", () => {
    const result = browser();
    const script = Object.assign(new result.context.HTMLScriptElement(), {
      src: "https://app.example/assets/index-111.js",
    });
    result.listeners.get("error")?.({ target: script });
    expect(result.timers).toHaveLength(1);
  });

  it("does not reload for offline, third-party, or application errors", () => {
    const offline = browser(new Map(), false);
    offline.listeners.get("vite:preloadError")?.({ preventDefault: vi.fn<() => void>() });
    expect(offline.timers).toHaveLength(0);
    const result = browser();
    const script = Object.assign(new result.context.HTMLScriptElement(), {
      src: "https://external.example/assets/index.js",
    });
    result.listeners.get("error")?.({ target: script });
    result.listeners.get("unhandledrejection")?.({ reason: new Error("Invalid user input") });
    expect(result.timers).toHaveLength(0);
  });
});
