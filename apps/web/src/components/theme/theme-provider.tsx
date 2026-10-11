import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "sellbridge-theme";
const THEME_EVENT = "sellbridge-theme-change";

/** Runs before hydration to apply the saved theme and avoid a flash of the wrong colors. */
export const themeInitScript = [
  "(function(){try{",
  `var t=localStorage.getItem("${STORAGE_KEY}");`,
  'var d=t?t==="dark":true;',
  'document.documentElement.classList.toggle("dark",d);',
  "}catch(e){}})();",
].join("");

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Dark is the default look; a saved preference for light is applied before hydration. */
function getServerSnapshot(): Theme {
  return "dark";
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the theme still applies to this page.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Switches the theme with the new colors spreading as a circle from `origin` (the control that
 * was pressed), so the change reads as one cause and effect instead of a flash. Reduced motion
 * gets the browser's plain cross-fade; browsers without view transitions switch at once.
 */
async function revealTheme(theme: Theme, origin: HTMLElement): Promise<void> {
  if (theme === getSnapshot()) {
    return;
  }
  if (typeof document.startViewTransition !== "function") {
    applyTheme(theme);
    return;
  }
  const transition = document.startViewTransition(() => applyTheme(theme));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const root = document.documentElement;
  root.dataset.themeReveal = "";
  const box = origin.getBoundingClientRect();
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  const radius = Math.hypot(
    Math.max(centerX, window.innerWidth - centerX),
    Math.max(centerY, window.innerHeight - centerY),
  );
  try {
    await transition.ready;
    const reveal = root.animate(
      {
        clipPath: [
          `circle(0px at ${centerX}px ${centerY}px)`,
          `circle(${radius}px at ${centerX}px ${centerY}px)`,
        ],
      },
      {
        duration: 550,
        easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
    await reveal.finished;
  } catch (error) {
    // A skipped transition still applied the theme; only the reveal is lost.
    if (!(error instanceof DOMException)) {
      throw error;
    }
  } finally {
    delete root.dataset.themeReveal;
  }
}

export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme, origin?: HTMLElement) => void;
  toggleTheme: () => void;
} {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((next: Theme, origin?: HTMLElement) => {
    if (!origin) {
      applyTheme(next);
      return;
    }
    void revealTheme(next, origin);
  }, []);
  const toggleTheme = useCallback(() => {
    applyTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, []);
  return { theme, setTheme, toggleTheme };
}
