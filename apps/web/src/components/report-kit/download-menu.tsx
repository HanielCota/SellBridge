import {
  CaretDownIcon,
  ChartBarIcon,
  DownloadSimpleIcon,
  EnvelopeSimpleIcon,
  FilePdfIcon,
  TableIcon,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DownloadKind = "spreadsheet" | "report" | "pdf";

/** One choice of the "Baixar" menu: a file link, or an action (open the report, print it). */
export type DownloadOption = {
  kind: DownloadKind;
  label: string;
  description: string;
} & ({ href: string } | { onSelect: () => void });

const KIND_ICONS: Record<DownloadKind, ComponentType<{ className?: string }>> = {
  spreadsheet: TableIcon,
  report: ChartBarIcon,
  pdf: FilePdfIcon,
};

interface DownloadMenuProps {
  /** "Outubro de 2026" or "01/10 a 15/10": what will be downloaded, at the top. */
  periodLabel: string;
  options: readonly DownloadOption[];
  /** Admin only: whether the files name each person of the team. */
  teamNames?: { checked: boolean; onChange: (checked: boolean) => void } | undefined;
  /** Compact trigger (icon + "Baixar") for toolbars that already hold many controls. */
  size?: "default" | "lg";
}

function OptionContent({ option }: { option: DownloadOption }) {
  const Icon = KIND_ICONS[option.kind];
  return (
    <>
      <Icon className="mt-0.5 size-4 self-start text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{option.label}</span>
        <span className="text-xs text-muted-foreground">{option.description}</span>
      </span>
    </>
  );
}

function OptionItem({ option }: { option: DownloadOption }) {
  if ("href" in option) {
    return (
      <DropdownMenuItem asChild className="min-h-11 items-start">
        <a href={option.href} download>
          <OptionContent option={option} />
        </a>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem className="min-h-11 items-start" onSelect={option.onSelect}>
      <OptionContent option={option} />
    </DropdownMenuItem>
  );
}

/**
 * "Baixar": the period on top, then the files of this page (the traditional spreadsheet keeps
 * its place next to the report with charts). A feature still on the way shows as "em breve",
 * never as a button that does nothing.
 */
export function DownloadMenu({ periodLabel, options, teamNames, size = "lg" }: DownloadMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className="print:hidden">
          <DownloadSimpleIcon aria-hidden="true" />
          Baixar
          <CaretDownIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="px-2.5 py-2 text-xs font-normal text-muted-foreground">
          Período: <span className="font-medium text-foreground">{periodLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <OptionItem key={option.label} option={option} />
        ))}
        {teamNames ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={teamNames.checked}
              onCheckedChange={(checked) => teamNames.onChange(checked)}
              onSelect={(event) => event.preventDefault()}
              className="min-h-11"
            >
              Incluir os nomes da equipe
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <p className="flex min-h-11 items-center gap-1.5 px-2.5 text-sm text-muted-foreground">
          <EnvelopeSimpleIcon className="size-4" aria-hidden="true" />
          Envio automático por e-mail
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">em breve</span>
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
