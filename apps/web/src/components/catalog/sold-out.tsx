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

/** Replaces the card's status line when sold out; the ribbon already says it, this gives the context. */
export function SoldOutFooter() {
  return (
    <div className="bg-destructive/12 px-4 py-3 text-footnote font-medium text-destructive">
      Sem estoque no fornecedor
    </div>
  );
}
