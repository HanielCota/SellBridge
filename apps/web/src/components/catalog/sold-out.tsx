import { cn } from "@/lib/utils";

/**
 * Diagonal sash across the photo's top-right corner. `corner` hugs the corner (the catalog card
 * has nothing there); `clearOfMenu` runs further in, below the listing card's actions button.
 */
export function SoldOutRibbon({ placement = "corner" }: { placement?: "corner" | "clearOfMenu" }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute bg-red-600 py-1 text-center text-xs font-semibold text-white",
        placement === "corner" && "top-5 -right-11 w-40 rotate-[35deg]",
        placement === "clearOfMenu" && "top-[46px] -right-[54px] w-56 rotate-45",
      )}
    >
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
  /** The one fix the reseller can make here, beside the cause instead of inside the menu. */
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1 bg-destructive/12 px-4 py-3 text-destructive">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <p className="text-footnote font-medium">{label}</p>
        {action}
      </div>
      {detail === null ? null : <p className="text-xs">{detail}</p>}
    </div>
  );
}
