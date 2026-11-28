/**
 * Where the bubble sits, as fractions of the room beside the sidebar (0 = start or top, 1 = end
 * or bottom). Fractions, not pixels, so a spot saved on a wide screen still lands inside a
 * narrow one and never over the sidebar.
 */
export interface SupportPosition {
  readonly inline: number;
  readonly vertical: number;
}

export const DEFAULT_SUPPORT_POSITION: SupportPosition = { inline: 1, vertical: 1 };

const STORAGE_KEY = "sellbridge:support-bubble-position";

function isFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** The saved spot, or null when nothing valid was saved (it then starts in the corner). */
export function parseSupportPosition(raw: string | null): SupportPosition | null {
  if (raw === null || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A value that is not JSON was not written by this code: start in the corner.
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const inline: unknown = Reflect.get(parsed, "inline");
  const vertical: unknown = Reflect.get(parsed, "vertical");
  if (!isFraction(inline) || !isFraction(vertical)) return null;
  return { inline, vertical };
}

/** Private windows and blocked site data throw on storage access: the corner is the fallback. */
export function readSupportPosition(): SupportPosition {
  try {
    return (
      parseSupportPosition(window.localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_SUPPORT_POSITION
    );
  } catch {
    // Storage may be unavailable (private mode, blocked site data); the bubble starts in the corner.
    return DEFAULT_SUPPORT_POSITION;
  }
}

export function saveSupportPosition(position: SupportPosition): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Storage may be unavailable; the bubble keeps its spot for this page only.
  }
}
