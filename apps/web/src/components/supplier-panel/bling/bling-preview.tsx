import { DownloadSimpleIcon } from "@phosphor-icons/react";
import type { ErpImportRow } from "@sellbridge/shared/erp-catalog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BlingImportOutcome } from "@/features/supplier-panel/bling/bling-overview";
import { pricedImport, pricesFromDiscount } from "@/features/supplier-panel/bling/bling-prices";
import { supplierBlingNewProductsCsv } from "@/features/supplier-panel/bling/bling.functions";
import {
  useBlingActions,
  useBlingImport,
  useBlingReadRows,
} from "@/features/supplier-panel/bling/use-bling";
import { downloadCsv } from "@/features/supplier-panel/import/import-file";
import { errorMessage } from "@/lib/errors";
import { BlingDiscountRule } from "./bling-discount-rule";
import { BlingPriceRow } from "./bling-price-row";

/** New products shown at once; "Mostrar mais" adds the next ones. */
const ROWS_PER_PAGE = 50;

const integer = new Intl.NumberFormat("pt-BR");

function count(amount: number, singular: string, plural: string): string {
  return `${integer.format(amount)} ${amount === 1 ? singular : plural}`;
}

function Summary({
  rows,
  truncated,
  skipped,
}: {
  rows: readonly ErpImportRow[];
  truncated: boolean;
  skipped: number;
}) {
  const existing = rows.filter((row) => !row.needsCost).length;
  const fresh = rows.length - existing;
  return (
    <div className="grid gap-1.5">
      <h2 className="text-subhead font-medium">
        {count(rows.length, "produto encontrado", "produtos encontrados")} no Bling
      </h2>
      <p className="text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">{integer.format(existing)}</strong>{" "}
        {existing === 1 ? "já está" : "já estão"} no SellBridge: o preço para o revendedor continua
        o mesmo. <strong className="font-medium text-foreground">{integer.format(fresh)}</strong>{" "}
        {fresh === 1 ? "é novo e precisa" : "são novos e precisam"} do preço para o revendedor.
      </p>
      {skipped > 0 ? (
        <p className="text-sm text-muted-foreground">
          {count(skipped, "produto ficou de fora", "produtos ficaram de fora")} por não ter código
          no Bling.
        </p>
      ) : null}
      {truncated ? (
        <p className="text-sm text-muted-foreground">
          O seu Bling tem mais produtos do que cabem numa importação: estes são os primeiros.
        </p>
      ) : null}
    </div>
  );
}

function NewProductsCsvButton({ supplierId, readId }: { supplierId: string; readId: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const { csv } = await supplierBlingNewProductsCsv({ data: { supplierId, readId } });
      downloadCsv("produtos-novos-do-bling.csv", csv);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="lg" disabled={busy} onClick={() => void download()}>
      <DownloadSimpleIcon aria-hidden="true" />
      {busy ? "Baixando…" : "Baixar os novos em planilha"}
    </Button>
  );
}

interface PreviewBodyProps {
  readonly supplierId: string;
  readonly readId: string;
  readonly rows: ErpImportRow[];
  readonly skipped: number;
  readonly truncated: boolean;
  readonly savedTenths: number | null;
  readonly onImported: (outcome: BlingImportOutcome) => void;
}

function usePreviewPrices(rows: readonly ErpImportRow[], savedTenths: number | null) {
  const [typed, setTyped] = useState<ReadonlyMap<string, string>>(() =>
    savedTenths === null ? new Map() : pricesFromDiscount(rows, new Map(), savedTenths),
  );
  const [discount, setDiscount] = useState<number | null>(savedTenths);
  return {
    typed,
    discount,
    applyDiscount: (tenths: number) => {
      setDiscount(tenths);
      setTyped((current) => pricesFromDiscount(rows, current, tenths));
    },
    setPrice: (sku: string, value: string) =>
      setTyped((current) => new Map(current).set(sku, value)),
  };
}

function PreviewFooter(props: {
  missing: number;
  total: number;
  importing: boolean;
  onImport: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button
        size="lg"
        disabled={props.total === 0 || props.missing > 0 || props.importing}
        onClick={props.onImport}
      >
        {props.importing ? "Importando…" : `Importar ${count(props.total, "produto", "produtos")}`}
      </Button>
      <Button variant="outline" size="lg" disabled={props.importing} onClick={props.onCancel}>
        Cancelar
      </Button>
      {props.missing > 0 ? (
        <output className="text-sm font-semibold text-amber-700 dark:text-amber-500">
          {props.missing === 1 ? "Falta 1 preço" : `Faltam ${integer.format(props.missing)} preços`}{" "}
          para importar.
        </output>
      ) : null}
    </div>
  );
}

function PreviewBody(props: PreviewBodyProps) {
  const newRows = useMemo(() => props.rows.filter((row) => row.needsCost), [props.rows]);
  const prices = usePreviewPrices(props.rows, props.savedTenths);
  const [shown, setShown] = useState(ROWS_PER_PAGE);
  const importing = useBlingImport();
  const { discardRead } = useBlingActions(props.supplierId);
  const priced = pricedImport(props.rows, prices.typed);

  function startImport() {
    importing.mutate(
      {
        data: {
          supplierId: props.supplierId,
          readId: props.readId,
          costs: priced.costs,
          resellerDiscountTenths: prices.discount,
        },
      },
      { onSuccess: props.onImported, onError: (error) => toast.error(errorMessage(error)) },
    );
  }

  return (
    <section
      aria-label="Prévia do Bling"
      className="surface-card grid gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <Summary rows={props.rows} truncated={props.truncated} skipped={props.skipped} />
      {newRows.length > 0 ? (
        <>
          <BlingDiscountRule savedTenths={props.savedTenths} onApply={prices.applyDiscount} />
          <div>
            <NewProductsCsvButton supplierId={props.supplierId} readId={props.readId} />
          </div>
          <ul aria-label="Produtos novos">
            {newRows.slice(0, shown).map((row) => (
              <BlingPriceRow
                key={row.sku}
                row={row}
                value={prices.typed.get(row.sku) ?? ""}
                onChange={(value) => prices.setPrice(row.sku, value)}
              />
            ))}
          </ul>
          {shown < newRows.length ? (
            <Button variant="outline" size="lg" onClick={() => setShown(shown + ROWS_PER_PAGE)}>
              Mostrar mais {integer.format(Math.min(ROWS_PER_PAGE, newRows.length - shown))}
            </Button>
          ) : null}
        </>
      ) : null}
      <PreviewFooter
        missing={priced.missing}
        total={props.rows.length}
        importing={importing.isPending}
        onImport={startImport}
        onCancel={() => discardRead.mutate()}
      />
    </section>
  );
}

/** A finished Bling read, ready to import once every new product has its reseller price. */
export function BlingPreview(props: {
  supplierId: string;
  readId: string;
  savedTenths: number | null;
  onImported: (outcome: BlingImportOutcome) => void;
}) {
  const rows = useBlingReadRows(props.supplierId, props.readId);
  if (rows.isPending) {
    return (
      <Skeleton className="h-64 w-full rounded-3xl" aria-label="Abrindo os produtos do Bling" />
    );
  }
  if (rows.isError) {
    return <ErrorState message={errorMessage(rows.error)} />;
  }
  return (
    <PreviewBody
      supplierId={props.supplierId}
      readId={props.readId}
      rows={rows.data.rows}
      skipped={rows.data.skipped.length}
      truncated={rows.data.truncated}
      savedTenths={props.savedTenths}
      onImported={props.onImported}
    />
  );
}
