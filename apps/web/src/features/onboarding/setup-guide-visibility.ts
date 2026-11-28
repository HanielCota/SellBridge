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

/**
 * How a page shows the setup strip: not at all, as the step the reseller is doing right now
 * (progress only, no button to the page they are on), or pointing at the next step.
 */
export type SetupStripMode = "hidden" | "current" | "next";

/** Pages that guide the setup themselves, or are not about the reseller's store. */
const NO_SETUP_STRIP_PATHS = ["/dashboard", "/onboarding", "/admin", "/perfil", "/suporte"];

function isUnder(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** The setup step each /onboarding editor saves. */
const ONBOARDING_STEP_KEYS = { details: "hasHolder", supplier: "hasSupplier" } as const;

type OnboardingStep = keyof typeof ONBOARDING_STEP_KEYS;

/**
 * Whether the onboarding page on screen is the step the strip would name. Without an open step
 * the first visit covers both the details and the supplier.
 */
function isOpenStepNext(openStep: OnboardingStep | undefined, nextStepKey: string): boolean {
  if (openStep === undefined) {
    return Object.values<string>(ONBOARDING_STEP_KEYS).includes(nextStepKey);
  }
  return ONBOARDING_STEP_KEYS[openStep] === nextStepKey;
}

export function setupStripMode({
  pathname,
  inSetupFlow,
  nextStep,
  openStep,
}: {
  pathname: string;
  inSetupFlow: boolean;
  nextStep: { key: string; to: string } | undefined;
  /** The /onboarding editor open on screen (its `step` search), if any. */
  openStep?: OnboardingStep | undefined;
}): SetupStripMode {
  if (nextStep === undefined) {
    return "hidden";
  }
  const nextStepPath = nextStep.to;
  if (inSetupFlow && isUnder(pathname, "/onboarding")) {
    // Another step opened early (a CNPJ from Integrações) must not read as the current one.
    return isOpenStepNext(openStep, nextStep.key) ? "current" : "hidden";
  }
  if (NO_SETUP_STRIP_PATHS.some((path) => isUnder(pathname, path))) {
    return "hidden";
  }
  return isUnder(pathname, nextStepPath) ? "current" : "next";
}
