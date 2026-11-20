import type { BlingOperation } from "@sellbridge/marketplaces/bling";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TonePill } from "@/components/data/tone-status";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { SUPPLIER_PANEL_BASE_PATH } from "@/features/supplier-panel/home/attention-links";
import {
  supplierBlingOnBehalfOperations,
  supplierBlingSaveOnBehalfOperations,
} from "@/features/supplier-panel/bling/bling.functions";
import { errorMessage } from "@/lib/errors";
import { useTabProfileLink } from "@/lib/tab-profile";

type OnBehalfOperationsView = Awaited<ReturnType<typeof supplierBlingOnBehalfOperations>>;

/** What each operation is called in most Bling accounts: the likely pick before any choice. */
const LIKELY_NAMES = {
  shipment: /remessa.*ordem/i,
  sale: /venda.*ordem/i,
} as const;

function operationsKey(supplierId: string) {
  return ["supplier-panel", "bling", supplierId, "on-behalf-operations"] as const;
}

function likelyOperation(
  operations: readonly BlingOperation[],
  chosen: number | null,
  pattern: RegExp,
): string {
  if (chosen !== null) {
    return String(chosen);
  }
  const found = operations.find((operation) => pattern.test(operation.name));
  return found === undefined ? "" : String(found.id);
}

function NotConnected() {
  const withProfile = useTabProfileLink();
  return (
    <p className="text-sm text-muted-foreground">
      A venda à ordem sai pelo seu Bling. Conecte o Bling em{" "}
      <Button asChild variant="link" className="h-auto px-0">
        <a href={withProfile(`${SUPPLIER_PANEL_BASE_PATH}/importar`)}>Importar planilha</a>
      </Button>{" "}
      e volte aqui para escolher as naturezas de operação.
    </p>
  );
}

function SaveState(props: {
  saved: boolean;
  canSave: boolean;
  isPending: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {props.saved ? (
        <TonePill tone="success" label="Naturezas salvas" />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!props.canSave || props.isPending}
          onClick={props.onSave}
        >
          {props.isPending ? "Salvando…" : "Salvar naturezas"}
        </Button>
      )}
      {props.error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {props.error}
        </p>
      )}
    </div>
  );
}

/** The two picks, started with the likely ones (by their usual names), and their save. */
function useOperationChoice(supplierId: string, view: OnBehalfOperationsView) {
  const queryClient = useQueryClient();
  const [shipment, setShipment] = useState(() =>
    likelyOperation(view.operations, view.shipmentOperationId, LIKELY_NAMES.shipment),
  );
  const [sale, setSale] = useState(() =>
    likelyOperation(view.operations, view.saleOperationId, LIKELY_NAMES.sale),
  );
  const save = useMutation({
    mutationFn: async (choice: { shipment: string; sale: string }) =>
      await supplierBlingSaveOnBehalfOperations({
        data: {
          supplierId,
          shipmentOperationId: Number(choice.shipment),
          saleOperationId: Number(choice.sale),
        },
      }),
    onSuccess: (saved) => queryClient.setQueryData(operationsKey(supplierId), saved),
  });
  const sameChoice = shipment !== "" && shipment === sale;
  const saved =
    view.shipmentOperationId !== null &&
    String(view.shipmentOperationId) === shipment &&
    String(view.saleOperationId) === sale;
  return {
    shipment,
    sale,
    setShipment,
    setSale,
    save,
    sameChoice,
    canSave: shipment !== "" && sale !== "" && !sameChoice,
    saved,
  };
}

/**
 * The two choices, saved with their own button: they belong to the Bling account, not to the
 * brand's save bar.
 */
function OperationChoices({
  supplierId,
  view,
}: {
  supplierId: string;
  view: OnBehalfOperationsView;
}) {
  const { shipment, sale, setShipment, setSale, save, sameChoice, canSave, saved } =
    useOperationChoice(supplierId, view);
  const options = view.operations.map((operation) => ({
    value: String(operation.id),
    label: operation.name,
  }));
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="on-behalf-shipment-operation"
          label="Natureza da remessa (a nota que vai na caixa)"
          value={shipment}
          error={null}
          options={options}
          placeholder="Escolha a natureza"
          hint="No Bling, costuma se chamar “Remessa por conta e ordem de terceiros”."
          onValueChange={setShipment}
        />
        <SelectField
          id="on-behalf-sale-operation"
          label="Natureza da venda para o revendedor"
          value={sale}
          error={sameChoice ? "Escolha uma natureza diferente da remessa." : null}
          options={options}
          placeholder="Escolha a natureza"
          hint="No Bling, costuma se chamar “Venda à ordem”."
          onValueChange={setSale}
        />
      </div>
      <SaveState
        saved={saved && !save.isPending}
        canSave={canSave}
        isPending={save.isPending}
        error={save.error === null ? null : errorMessage(save.error)}
        onSave={() => save.mutate({ shipment, sale })}
      />
      <p className="text-footnote text-muted-foreground">
        Não achou a natureza? Crie no Bling, nas naturezas de operação, e atualize esta página.
      </p>
    </div>
  );
}

/**
 * "No seu Bling": the venda à ordem operations of the supplier's Bling. They are saved on their
 * own, apart from the brand's save bar, since they belong to the Bling account.
 */
export function OnBehalfOperations({ supplierId }: { supplierId: string }) {
  const query = useQuery({
    queryKey: operationsKey(supplierId),
    queryFn: async () => await supplierBlingOnBehalfOperations({ data: { supplierId } }),
  });
  return (
    <section
      aria-label="Naturezas de operação no Bling"
      className="grid gap-3 rounded-2xl bg-muted/50 p-4"
    >
      <h3 className="text-sm font-semibold">No seu Bling</h3>
      {query.isPending ? <p className="text-sm text-muted-foreground">Lendo o seu Bling…</p> : null}
      {query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não deu para ler as naturezas do seu Bling. {errorMessage(query.error)}
        </p>
      ) : null}
      {query.data?.connected === false ? <NotConnected /> : null}
      {query.data?.connected === true ? (
        <OperationChoices supplierId={supplierId} view={query.data} />
      ) : null}
    </section>
  );
}
