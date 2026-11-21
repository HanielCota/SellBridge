import { LockSimpleOpenIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TextareaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { releaseOnBehalfLabelFn } from "@/features/admin-shipments/shipments.functions";
import { staffOnBehalfLabelQueryOptions } from "@/features/admin-shipments/shipments.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

type LabelView = NonNullable<Awaited<ReturnType<typeof releaseOnBehalfLabelFn>>>;

function Released({ release }: { release: NonNullable<LabelView["release"]> }) {
  return (
    <div className="grid gap-1 rounded-2xl bg-muted/60 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <LockSimpleOpenIcon aria-hidden="true" className="size-4" />
        Etiqueta liberada pela equipe
      </p>
      <p className="text-muted-foreground">
        {release.byName ?? "Alguém da equipe"} · {formatAbsoluteTime(release.at)}
      </p>
      <p>Motivo: {release.reason}</p>
    </div>
  );
}

/** "Liberar etiqueta": the reason first, the consequence written out, then the button. */
function ReleaseForm({ shipmentId }: { shipmentId: string }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const release = useMutation({
    mutationFn: async () => await releaseOnBehalfLabelFn({ data: { shipmentId, reason } }),
    onSuccess: (fresh) =>
      queryClient.setQueryData(staffOnBehalfLabelQueryOptions(shipmentId).queryKey, fresh),
  });
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        release.mutate();
      }}
    >
      <TextareaField
        id={`release-label-${shipmentId}`}
        label="Motivo da liberação"
        value={reason}
        errors={release.error === null ? [] : [errorMessage(release.error)]}
        placeholder="Ex.: Bling do fornecedor fora do ar há 3 dias; remessa emitida à mão."
        rows={3}
        onValueChange={setReason}
      />
      <p className="text-sm text-muted-foreground">
        A etiqueta sai sem esperar a nota que falta. Fica registrado quem liberou, quando e o
        motivo.
      </p>
      <Button
        type="submit"
        variant="outline"
        className="min-h-11 w-full sm:w-fit"
        disabled={release.isPending}
      >
        <LockSimpleOpenIcon aria-hidden="true" />
        {release.isPending ? "Liberando…" : "Liberar etiqueta"}
      </Button>
    </form>
  );
}

/**
 * The venda à ordem label of the chosen parcel: why it waits for a note and, for supervisors and
 * admins, its release with a reason. Nothing for a parcel of direct notes.
 */
export function StaffOnBehalfLabel({ shipmentId }: { shipmentId: string }) {
  const query = useQuery(staffOnBehalfLabelQueryOptions(shipmentId));
  const view = query.data;
  if (view === undefined || view === null) {
    return null;
  }
  return (
    <section
      aria-label="Etiqueta da venda à ordem"
      className="surface-card grid gap-3 rounded-3xl bg-card p-5"
    >
      <h2 className="text-subhead font-semibold">Etiqueta da venda à ordem</h2>
      {view.release === null ? null : <Released release={view.release} />}
      {view.waiting === null ? null : (
        <p className="flex gap-2 text-sm">
          <WarningCircleIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          />
          {view.waiting}
        </p>
      )}
      {view.waiting !== null && view.release === null && view.ownHeld && view.canRelease ? (
        <ReleaseForm shipmentId={shipmentId} />
      ) : null}
      {view.waiting !== null && view.release === null && !view.ownHeld ? (
        <p className="text-sm text-muted-foreground">
          As notas desta parcela estão prontas: não há o que liberar aqui. A etiqueta espera outro
          pedido do carrinho.
        </p>
      ) : null}
      {view.waiting !== null && view.release === null && view.ownHeld && !view.canRelease ? (
        <p className="text-sm text-muted-foreground">
          Só supervisores e administradores liberam a etiqueta.
        </p>
      ) : null}
    </section>
  );
}
