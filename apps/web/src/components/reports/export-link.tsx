import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";

const ExportIcon = ACTION_ICONS.exportReport.icon;

/** Downloads the period's orders as a spreadsheet (CSV), from the chart toolbar. */
export function ExportLink({ href }: { href: string }) {
  return (
    <Hint label={ACTION_ICONS.exportReport.hint} openOnTap={false}>
      <a
        href={href}
        download
        aria-label="Exportar CSV do período"
        className="flex size-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border text-sm min-[1440px]:w-auto min-[1440px]:pr-4 min-[1440px]:pl-3.5 font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ExportIcon className="size-4" aria-hidden="true" />
        {/* Below 1440px the word pushed the store filter to a second row (1280) and cut the period
          track (768); the icon and its hint stand alone there. */}
        <span aria-hidden="true" className="hidden min-[1440px]:inline">
          Exportar
        </span>
      </a>
    </Hint>
  );
}
