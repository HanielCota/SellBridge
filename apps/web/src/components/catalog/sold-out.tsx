/** Diagonal sash across the photo's top-right corner, for a card with nothing else there. */
export function SoldOutRibbon() {
  return (
    <span className="pointer-events-none absolute top-5 -right-11 w-40 rotate-[35deg] bg-red-600 py-1 text-center text-xs font-semibold text-white">
      Esgotado
    </span>
  );
}

/**
 * The ribbon's word as a solid tag in the photo's bottom-right corner, for the listing card,
 * whose top-right corner holds the status button: its width changes with the status word, so no
 * diagonal there stays clear of it on a two-column phone grid.
 */
export function SoldOutBadge() {
  return (
    <span className="pointer-events-none absolute right-3 bottom-2.5 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
      Esgotado
    </span>
  );
}

/**
 * Replaces the card's status line while the supplier keeps the product off: sold out (the
 * ribbon already says it, this gives the context) or no longer offered, with what to do.
 */
export function SoldOutFooter({
  label = "Sem estoque no fornecedor",
  detail = null,
  action = null,
}: {
  label?: string;
  detail?: string | null;
  /** The one fix the reseller can make here, on the card instead of only inside the menu. */
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1 bg-destructive/12 px-4 py-3 text-destructive">
      <p className="text-footnote font-medium">{label}</p>
      {detail === null ? null : <p className="text-xs">{detail}</p>}
      {/* After the reason, so a narrow card still reads cause, explanation, then the fix. */}
      {action === null ? null : <div className="pt-1.5">{action}</div>}
    </div>
  );
}
