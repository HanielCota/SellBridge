import { useCallback, useSyncExternalStore } from "react";

/** Whether this browser minimized the setup guide; "unknown" until the page hydrates. */
export type SetupGuideChoice = "shown" | "hidden" | "unknown";

/**
 * How the dashboard draws the setup guide: the whole guide, the minimized strip, nothing once
 * the setup is done, or both while the choice is still unknown (CSS keeps only the stored one).
 */
export type SetupGuideView = "open" | "collapsed" | "pending" | "none";

const STORAGE_KEY = "sellbridge-setup-guide";
const HIDDEN_VALUE = "hidden";
const GUIDE_EVENT = "sellbridge-setup-guide-change";

/** The `<html>` attribute the CSS reads before hydration: `data-setup-guide="hidden"`. */
const HTML_DATA_KEY = "setupGuide";

/**
 * Runs before hydration, like the theme script: marks the page when the guide was hidden, so the
 * server's HTML shows the strip at once instead of the whole guide collapsing a moment later.
 */
export const setupGuideInitScript = [
  "(function(){try{",
  `if(localStorage.getItem("${STORAGE_KEY}")==="${HIDDEN_VALUE}"){`,
  `document.documentElement.dataset.${HTML_DATA_KEY}="${HIDDEN_VALUE}";}`,
  "}catch(e){}})();",
].join("");

export function setupGuideView(setupComplete: boolean, choice: SetupGuideChoice): SetupGuideView {
  if (setupComplete) {
    return "none";
  }
  if (choice === "unknown") {
    return "pending";
  }
  return choice === "hidden" ? "collapsed" : "open";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(GUIDE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(GUIDE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): SetupGuideChoice {
  try {
    return localStorage.getItem(STORAGE_KEY) === HIDDEN_VALUE ? "hidden" : "shown";
  } catch {
    // Storage may be unavailable (private mode); the guide opens, as for a first visit.
    return "shown";
  }
}

function getServerSnapshot(): SetupGuideChoice {
  return "unknown";
}

function writeChoice(hidden: boolean): void {
  if (hidden) {
    localStorage.setItem(STORAGE_KEY, HIDDEN_VALUE);
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}

/** Keeps the pre-hydration mark in step, for a later server render without a full reload. */
function markPage(hidden: boolean): void {
  if (hidden) {
    document.documentElement.dataset[HTML_DATA_KEY] = HIDDEN_VALUE;
    return;
  }
  delete document.documentElement.dataset[HTML_DATA_KEY];
}

function saveChoice(hidden: boolean): void {
  try {
    writeChoice(hidden);
  } catch {
    // Storage may be unavailable (private mode); the choice still applies to this page.
  }
  markPage(hidden);
  window.dispatchEvent(new Event(GUIDE_EVENT));
}

/** The reseller's choice to minimize the setup guide, remembered per browser. */
export function useSetupGuideChoice(): {
  choice: SetupGuideChoice;
  setHidden: (hidden: boolean) => void;
} {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setHidden = useCallback((hidden: boolean) => saveChoice(hidden), []);
  return { choice, setHidden };
}
