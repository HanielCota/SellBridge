/**
 * Padding for a card that starts with `CardTopCap`: the top padding is tall enough to hold the
 * cap (the card's corner radius) on the phone too.
 */
export const CARD_WITH_TOP_CAP_PADDING = "px-5 pt-7 pb-5 sm:p-8";

/** Pinned rounded top edge for a long card; the margins undo `CARD_WITH_TOP_CAP_PADDING`. */
export function CardTopCap() {
  return (
    <div
      aria-hidden="true"
      className="surface-card-pinned-top -mx-5 -mt-7 mb-[calc(1.75rem-var(--radius-3xl))] sm:-mx-8 sm:-mt-8 sm:mb-[calc(2rem-var(--radius-3xl))]"
    />
  );
}
