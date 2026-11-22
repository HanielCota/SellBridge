import { dispatchCutoffSettingsSchema } from "@sellbridge/shared/dispatch-cutoff";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  type CutoffChoice,
  cutoffConsequence,
} from "@/features/dispatch-cutoff/cutoff-consequence";
import { saveDispatchCutoffFn } from "@/features/dispatch-cutoff/dispatch-cutoff.functions";
import { dispatchCutoffQueryOptions } from "@/features/dispatch-cutoff/dispatch-cutoff.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

type CutoffView = Awaited<
  ReturnType<
    typeof import("@/features/dispatch-cutoff/dispatch-cutoff.functions").getDispatchCutoffFn
  >
>;

type TimeField = "mercadoLivre" | "shopee" | "tiktokShop";

const TIME_FIELDS: readonly { key: TimeField; label: string }[] = [
  { key: "mercadoLivre", label: "Mercado Livre" },
  { key: "shopee", label: "Shopee" },
  { key: "tiktokShop", label: "TikTok Shop" },
];

function choiceOf(view: CutoffView): CutoffChoice {
  return {
    enabled: view.enabled,
    mercadoLivre: view.mercadoLivre,
    shopee: view.shopee,
    tiktokShop: view.tiktokShop,
  };
}

function sameChoice(first: CutoffChoice, second: CutoffChoice): boolean {
  return (
    first.enabled === second.enabled &&
    TIME_FIELDS.every((field) => first[field.key] === second[field.key])
  );
}

/** What is wrong with each typed time, said next to it; empty when all are fine. */
function timeErrors(choice: CutoffChoice): Partial<Record<TimeField, string>> {
  const result = dispatchCutoffSettingsSchema.safeParse(choice);
  if (result.success) {
    return {};
  }
  return Object.fromEntries(
    result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
  );
}

function useSaveCutoff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choice: CutoffChoice) => saveDispatchCutoffFn({ data: choice }),
    onSuccess: async (saved) => {
      toast.success(
        saved.enabled
          ? "Salvo: o prazo pelo horário de corte está ligado."
          : "Salvo: o prazo pelo horário de corte está desligado.",
      );
      await queryClient.invalidateQueries({ queryKey: dispatchCutoffQueryOptions().queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function CutoffStatus({ view }: { view: CutoffView }) {
  if (view.since === null) {
    return <PaymentPill tone="neutral">Desligado</PaymentPill>;
  }
  return (
    <PaymentPill tone="success">{`Ligado desde ${formatAbsoluteTime(new Date(view.since))}`}</PaymentPill>
  );
}

/** What saving changes, written before the click (only when something changes). */
function Consequence({ view, choice }: { view: CutoffView; choice: CutoffChoice }) {
  const consequence = cutoffConsequence(choiceOf(view), choice);
  if (consequence === null) {
    return null;
  }
  return (
    <p className="rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
      {consequence}
    </p>
  );
}

function TimeInput(props: {
  label: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {props.label}
      </label>
      <Input
        id={inputId}
        type="time"
        className="h-11 sm:max-w-40"
        value={props.value}
        aria-invalid={props.error === undefined ? undefined : true}
        aria-describedby={props.error === undefined ? undefined : errorId}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.error === undefined ? null : (
        <p id={errorId} role="alert" className="text-footnote text-destructive">
          {props.error}
        </p>
      )}
    </div>
  );
}

function CutoffForm({ view }: { view: CutoffView }) {
  const switchId = useId();
  const [choice, setChoice] = useState<CutoffChoice>(() => choiceOf(view));
  const save = useSaveCutoff();
  const errors = timeErrors(choice);
  const hasErrors = Object.keys(errors).length > 0;
  const changed = !sameChoice(choice, choiceOf(view));
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex min-h-11 items-center gap-3">
          <Switch
            id={switchId}
            checked={choice.enabled}
            aria-describedby={`${switchId}-hint`}
            onCheckedChange={(checked) => setChoice({ ...choice, enabled: checked })}
          />
          <label htmlFor={switchId} className="text-sm font-medium">
            Dar prazo de postagem pelo horário de corte
          </label>
        </div>
        <p id={`${switchId}-hint`} className="pl-14 text-footnote text-muted-foreground">
          Venda que chega ao fornecedor antes do horário é postada até o fim daquele dia útil.
          Depois do horário, até o fim do próximo dia útil. Sábado, domingo e feriado nacional não
          contam. Exemplo: com o corte às 14:30, a venda de sexta às 15:00 é postada até segunda.
        </p>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Horário de corte de cada marketplace</legend>
        {TIME_FIELDS.map((field) => (
          <TimeInput
            key={field.key}
            label={field.label}
            value={choice[field.key]}
            error={errors[field.key]}
            onChange={(value) => setChoice({ ...choice, [field.key]: value })}
          />
        ))}
      </fieldset>
      {changed ? <Consequence view={view} choice={choice} /> : null}
      <div>
        <Button
          size="lg"
          disabled={!changed || hasErrors || save.isPending}
          onClick={() => save.mutate(choice)}
        >
          {save.isPending ? "Salvando…" : "Salvar horários"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Admin: the cutoff time of each marketplace (contracts, 20/11/2026). It dates the posting of a
 * parcel the marketplace sent no date for; off until Guilherme turns it on.
 */
export function DispatchCutoffCard() {
  const query = useQuery(dispatchCutoffQueryOptions());
  return (
    <section
      aria-labelledby="dispatch-cutoff-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="dispatch-cutoff-title" className="text-subhead font-medium">
            Prazo de postagem pelo horário de corte
          </h2>
          {query.data === undefined ? null : <CutoffStatus view={query.data} />}
        </div>
        <p className="text-sm text-muted-foreground">
          Quando o marketplace manda a data de postagem, vale a dele: o Mercado Livre já conta o
          horário de corte da loja. Este horário vale para o pedido que chega sem essa data.
        </p>
      </div>
      {query.isPending ? <Skeleton className="h-40 rounded-2xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data === undefined ? null : (
        <CutoffForm
          key={`${query.data.enabled}-${query.data.mercadoLivre}-${query.data.shopee}-${query.data.tiktokShop}`}
          view={query.data}
        />
      )}
    </section>
  );
}
