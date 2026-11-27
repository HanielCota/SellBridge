import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, type MouseEvent, type PointerEvent } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A refused listing as a short notice; the marketplace's reason opens on hover, focus or tap.
 * It is drawn as a button so it invites the pointer, and a click keeps the reason open
 * instead of closing it, as a plain tooltip would.
 */
export function FailedNotice({ label, reason }: { label: string; reason: string }) {
  const [open, setOpen] = useState(false);
  // Radix closes a tooltip on its trigger's pointer down and click; here both must open it.
  const keepOpen = (event: PointerEvent | MouseEvent) => {
    event.preventDefault();
    setOpen(true);
  };
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild onPointerDown={keepOpen} onClick={keepOpen}>
        <button
          type="button"
          className="group/notice flex w-full cursor-pointer flex-col items-start gap-1 rounded-xl bg-destructive/10 px-3 py-2 text-left text-xs transition-colors outline-none hover:bg-destructive/15 focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=delayed-open]:bg-destructive/15 data-[state=instant-open]:bg-destructive/15"
        >
          <span className="flex items-center gap-1.5 font-medium text-destructive">
            <WarningCircleIcon weight="fill" className="size-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground underline decoration-dotted underline-offset-3 group-hover/notice:text-foreground">
            <InfoIcon weight="bold" className="size-3.5 shrink-0" aria-hidden="true" />
            Ver o motivo
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="text-pretty">{reason}</TooltipContent>
    </Tooltip>
  );
}
