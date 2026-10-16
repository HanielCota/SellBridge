import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "sellbridge-notification-sound";
const SOUND_EVENT = "sellbridge-notification-sound-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SOUND_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SOUND_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Sound is on unless this browser turned it off. */
export function isNotificationSoundOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // Storage may be unavailable (private mode); the chime keeps its default.
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

function writePreference(on: boolean): void {
  if (on) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, "off");
}

function savePreference(on: boolean): void {
  try {
    writePreference(on);
  } catch {
    // Storage may be unavailable (private mode); nothing to remember the choice in.
  }
  window.dispatchEvent(new Event(SOUND_EVENT));
}

/** Whether the bell chimes for new notifications, remembered per browser. */
export function useNotificationSound(): { soundOn: boolean; setSoundOn: (on: boolean) => void } {
  const soundOn = useSyncExternalStore(subscribe, isNotificationSoundOn, getServerSnapshot);
  const setSoundOn = useCallback((on: boolean) => savePreference(on), []);
  return { soundOn, setSoundOn };
}
