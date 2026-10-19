import { useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The app's tooltip in place of a native `title`: it shows after the provider's short delay, in the
 * theme, and is announced as the element's description. Without a label it renders the child alone.
 */
export function Hint({
  label,
  openOnTap = true,
  children,
}: {
  label: string | undefined;
  /**
   * False on controls whose tap already does the job (a tab, a button that opens a panel): on touch
   * the tap runs it and the legend stays shut instead of covering what just opened.
   */
  openOnTap?: boolean;
  children: ReactElement;
}) {
  if (label === undefined) {
    return children;
  }
  if (!openOnTap) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }
  return <TappableTooltip label={label}>{children}</TappableTooltip>;
}

/**
 * Radix tooltips never open on touch, so a tap toggles this one and a tap outside closes it. The
 * trigger closes itself on pointer down and click; those closes are skipped while a tap is landing.
 */
function TappableTooltip({ label, children }: { label: string; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const tapLandingRef = useRef(false);
  const handleOpenChange = (next: boolean) => {
    if (!next && tapLandingRef.current) {
      return;
    }
    setOpen(next);
  };
  const handlePointerDown = (event: PointerEvent) => {
    tapLandingRef.current = event.pointerType === "touch";
  };
  const handleClick = () => {
    if (!tapLandingRef.current) {
      return;
    }
    setOpen((current) => !current);
    // The trigger's own close runs right after this handler; let later closes through again.
    queueMicrotask(() => {
      tapLandingRef.current = false;
    });
  };
  return (
    <Tooltip open={open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild onPointerDown={handlePointerDown} onClick={handleClick}>
        {children}
      </TooltipTrigger>
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

/**
 * Text with a legend. It takes focus so keyboard users reach the legend, except inside a card
 * that is already a link or an option: a focusable span there would be a control inside a control.
 */
export function HintedText({
  label,
  className,
  focusable = true,
  children,
}: {
  label: string;
  className?: string;
  focusable?: boolean;
  children: ReactNode;
}) {
  return (
    <Hint label={label}>
      <span
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the legend explains a term, so it must be reachable by keyboard
        tabIndex={focusable ? 0 : undefined}
        className={cn(
          "rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        {children}
      </span>
    </Hint>
  );
}
