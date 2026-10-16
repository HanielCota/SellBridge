import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The app's tooltip in place of a native `title`: it shows at once, in the theme, and is announced
 * as the element's description. Without a label it renders the child alone.
 */
export function Hint({ label, children }: { label: string | undefined; children: ReactElement }) {
  if (label === undefined) {
    return children;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Explains why a control is disabled. A disabled button gets no pointer or focus events, so the
 * tooltip hangs on a focusable wrapper instead; while enabled, the button renders alone.
 */
export function DisabledHint({
  reason,
  className,
  children,
}: {
  reason: string | undefined;
  /** Placement classes the button had in its parent (e.g. `self-start`), now on the wrapper. */
  className?: string;
  children: ReactElement;
}) {
  if (reason === undefined) {
    return children;
  }
  return (
    <Hint label={reason}>
      <span
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a disabled button takes no focus, so its reason hangs on a focusable wrapper keyboard users can reach
        tabIndex={0}
        className={cn(
          "inline-flex w-fit rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/30",
          className,
        )}
      >
        {children}
      </span>
    </Hint>
  );
}
