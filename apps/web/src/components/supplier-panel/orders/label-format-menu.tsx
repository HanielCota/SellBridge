import { CaretDownIcon } from "@phosphor-icons/react";
import type { LabelFormat } from "@sellbridge/shared/schemas";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** The printer the supplier has decides the file: a sheet printer or a thermal one. */
const LABEL_FORMAT_OPTIONS: readonly { format: LabelFormat; title: string; detail: string }[] = [
  { format: "pdf", title: "Em PDF", detail: "Impressora comum, folha A4" },
  { format: "zpl", title: "Em ZPL", detail: "Impressora térmica Zebra" },
];

/**
 * The print button with its two files, as Mercado Livre's own panel offers them: PDF for a
 * regular printer, ZPL for a thermal one. Choosing one prints at once.
 */
export function LabelFormatMenu({
  children,
  ariaLabel,
  disabled = false,
  size = "sm",
  className,
  onChoose,
}: {
  children: ReactNode;
  ariaLabel?: string | undefined;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  onChoose: (format: LabelFormat) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          size={size}
          variant="outline"
          className={cn("gap-1", className)}
          aria-label={ariaLabel}
        >
          {children}
          <CaretDownIcon aria-hidden="true" weight="bold" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel className="text-footnote text-muted-foreground">
          Qual impressora você usa?
        </DropdownMenuLabel>
        {LABEL_FORMAT_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.format} onSelect={() => onChoose(option.format)}>
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">{option.title}</span>
              <span className="text-footnote">{option.detail}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
