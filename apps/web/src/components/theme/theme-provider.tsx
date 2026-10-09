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

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggleTheme = useCallback(() => {
    applyTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, []);
  return { theme, toggleTheme };
}
