import { CaretDownIcon, ChartBarIcon, TableIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/hint";

const ExportIcon = ACTION_ICONS.exportReport.icon;

function OptionText({
  icon: Icon,
  label,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: ReactNode;
}) {
  return (
    <>
      <Icon className="mt-0.5 size-4 self-start text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </>
  );
}

/**
 * "Baixar" on the chart toolbar: the period's orders as a spreadsheet (CSV, same filters as the
 * screen) or the monthly report with charts. The report link keeps the tab's `perfil` because
 * the app layout retains it on every navigation.
 */
export function ExportLink({
  href,
  reportTo = "/financeiro/relatorio",
}: {
  href: string;
  reportTo?: "/financeiro/relatorio" | "/fornecedor/painel/relatorio";
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <Hint label="Baixar a planilha dos pedidos ou o relatório com gráficos" openOnTap={false}>
        <DropdownMenuTrigger
          aria-label="Baixar planilha ou relatório"
          className="flex size-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border text-sm min-[1440px]:w-auto min-[1440px]:pr-3.5 min-[1440px]:pl-3.5 font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-foreground data-[state=open]:text-foreground"
        >
          <ExportIcon className="size-4" aria-hidden="true" />
          {/* Below 1440px the word pushed the store filter to a second row (1280) and cut the
            period track (768); the icon and its hint stand alone there. */}
          <span aria-hidden="true" className="hidden items-center gap-1 min-[1440px]:inline-flex">
            Baixar
            <CaretDownIcon className="size-3" />
          </span>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
        <DropdownMenuItem asChild className="min-h-11 items-start">
          <a href={href} download>
            <OptionText
              icon={TableIcon}
              label="Planilha dos pedidos"
              description="Os pedidos do período em CSV, com os filtros da tela"
            />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11 items-start"
          onSelect={() => void navigate({ to: reportTo })}
        >
          <OptionText
            icon={ChartBarIcon}
            label="Relatório com gráficos"
            description="O mês com indicadores, gráficos e o que precisa de atenção"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
