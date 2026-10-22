import { outOfHoursNotice } from "@/features/support/response-time";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

/**
 * "Estamos fora do horário…" on a line of its own, in the body colour: it is what changes the
 * customer's wait, so it does not hide at the end of the muted hours line. Nothing in the hours.
 */
export function OutOfHoursNotice({ className }: { className?: string }) {
  const notice = outOfHoursNotice(useNow());
  if (notice === null) {
    return null;
  }
  return <p className={cn("font-medium text-foreground", className)}>{notice}</p>;
}
