import { CaretDownIcon, CircleNotchIcon, TableIcon, type Icon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportDescription,
  type ProductExportFilters,
} from "@/features/supplier-panel/import/product-export-file";
import { useProductSpreadsheet } from "@/features/supplier-panel/import/use-product-spreadsheet";

// Each item keeps the icon of its function (docs/PLANO-UX-ICONES.md): exporting builds a file
// from the data, importing sends one, and the template is a ready file to save.
const ExportIcon = ACTION_ICONS.exportReport.icon;
const ImportIcon = ACTION_ICONS.importProducts.icon;
const TemplateIcon = ACTION_ICONS.downloadFile.icon;

function OptionContent({
  icon: OptionIcon,
  label,
  description,
}: {
  icon: Icon;
  label: string;
  description: string;
}) {
  return (
    <>
      <OptionIcon className="mt-0.5 size-4 self-start text-muted-foreground" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </>
  );
}

function TriggerContent({ isExporting }: { isExporting: boolean }): ReactNode {
  if (isExporting) {
    return (
      <>
        <CircleNotchIcon className="animate-spin" aria-hidden="true" />
        Preparando...
      </>
    );
  }
  return (
    <>
      <TableIcon aria-hidden="true" />
      Editar em planilha
      <CaretDownIcon data-icon="inline-end" aria-hidden="true" />
    </>
  );
}

interface ProductSpreadsheetMenuProps {
  supplierId: string;
  filters: ProductExportFilters;
  /** Products in the list as filtered; undefined while it loads. */
  productCount: number | undefined;
  /** A switched-off supplier may still download, but not import (the server refuses too). */
  canImport: boolean;
}

/**
 * Many products at once: download them in the import's format, send the edited file back, or
 * start from the empty template. One menu, so the three never drift apart on screen.
 */
export function ProductSpreadsheetMenu({
  supplierId,
  filters,
  productCount,
  canImport,
}: ProductSpreadsheetMenuProps) {
  const { isExporting, exportProducts, downloadTemplate } = useProductSpreadsheet(supplierId);
  const filtered =
    filters.status !== "all" || filters.query !== undefined || filters.fiscal !== "all";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isExporting}>
          <TriggerContent isExporting={isExporting} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="px-2.5 py-2 text-xs font-normal text-muted-foreground">
          Para mudar muitos produtos de uma vez
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11 items-start"
          disabled={productCount === 0}
          onSelect={() => exportProducts(filters)}
        >
          <OptionContent
            icon={ExportIcon}
            label="Baixar produtos"
            description={exportDescription(productCount, filtered)}
          />
        </DropdownMenuItem>
        {canImport ? (
          <DropdownMenuItem asChild className="min-h-11 items-start">
            <Link to="/fornecedor/painel/importar">
              <OptionContent
                icon={ImportIcon}
                label="Importar planilha"
                description="Envie a planilha preenchida; o código de cada produto diz qual atualizar"
              />
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="min-h-11 items-start" onSelect={downloadTemplate}>
          <OptionContent
            icon={TemplateIcon}
            label="Baixar planilha modelo"
            description="Vazia, com as colunas certas e um produto de exemplo"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
