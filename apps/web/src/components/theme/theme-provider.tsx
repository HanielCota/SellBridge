import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "sellbridge-theme";
const THEME_EVENT = "sellbridge-theme-change";

/**
 * Page background of each theme (`--background` in styles.css, as hex), painted by the mobile
 * browser around the page: status bar, overscroll and the address bar on Android.
 */
export const THEME_COLORS: Readonly<Record<Theme, string>> = { light: "#f4f5f6", dark: "#0e0e10" };

/** Runs before hydration to apply the saved theme and avoid a flash of the wrong colors. */
export const themeInitScript = [
  "(function(){try{",
  `var t=localStorage.getItem("${STORAGE_KEY}");`,
  'var d=t?t==="dark":true;',
  'document.documentElement.classList.toggle("dark",d);',
  "var m=document.querySelector('meta[name=\"theme-color\"]');",
  `if(m){m.setAttribute("content",d?"${THEME_COLORS.dark}":"${THEME_COLORS.light}");}`,
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

/**
 * Turns off every CSS transition while the theme class flips, so colors swap in one frame instead
 * of each component fading on its own and the page flickering. Returns the function that restores
 * them after the new colors are computed.
 */
function suspendTransitions(): () => void {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);
  return () => {
    // Reading a computed style forces the new colors to apply while transitions are still off.
    void window.getComputedStyle(document.body).backgroundColor;
    style.remove();
  };
}

function applyTheme(theme: Theme): void {
  if (theme === getSnapshot()) {
    return;
  }
  const restoreTransitions = suspendTransitions();
  document.documentElement.classList.toggle("dark", theme === "dark");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta !== null) {
    themeColorMeta.setAttribute("content", THEME_COLORS[theme]);
  }
  restoreTransitions();
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the theme still applies to this page.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
} {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
  }, []);
  const toggleTheme = useCallback(() => {
    applyTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, []);
  return { theme, setTheme, toggleTheme };
}
