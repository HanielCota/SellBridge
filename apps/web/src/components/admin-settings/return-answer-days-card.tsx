import {
  ANSWER_BUSINESS_DAYS_MAX,
  ANSWER_BUSINESS_DAYS_MIN,
} from "@sellbridge/shared/return-policy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { saveReturnAnswerDaysFn } from "@/features/returns/returns.functions";
import { returnAnswerDaysQueryOptions } from "@/features/returns/returns.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const DAY_CHOICES = Array.from(
  { length: ANSWER_BUSINESS_DAYS_MAX - ANSWER_BUSINESS_DAYS_MIN + 1 },
  (_, index) => ANSWER_BUSINESS_DAYS_MIN + index,
);

function daysLabel(days: number): string {
  return days === 1 ? "1 dia útil" : `${days} dias úteis`;
}

function DaysForm({ saved }: { saved: number }) {
  const name = useId();
  const queryClient = useQueryClient();
  const [days, setDays] = useState(saved);
  const save = useMutation({
    mutationFn: (businessDays: number) => saveReturnAnswerDaysFn({ data: { businessDays } }),
    onSuccess: async (result) => {
      toast.success(`Prazo salvo: ${daysLabel(result.businessDays)} para as próximas devoluções.`);
      await queryClient.invalidateQueries({ queryKey: returnAnswerDaysQueryOptions().queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Prazo do fornecedor</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_CHOICES.map((choice) => (
            <label
              key={choice}
              className={cn(
                "flex h-11 min-w-24 cursor-pointer items-center justify-center rounded-xl border border-border px-3 text-sm focus-within:ring-4 focus-within:ring-brand/30",
                days === choice && "border-foreground bg-muted font-medium",
              )}
            >
              <input
                type="radio"
                name={name}
                value={choice}
                checked={days === choice}
                onChange={() => setDays(choice)}
                className="sr-only"
              />
              {daysLabel(choice)}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Button
          size="lg"
          disabled={days === saved || save.isPending}
          onClick={() => save.mutate(days)}
        >
          {save.isPending ? "Salvando…" : "Salvar prazo"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Admin: how long a supplier has to check a returned product when the marketplace gives no
 * review date. With one, the supplier always answers a day before it.
 */
export function ReturnAnswerDaysCard() {
  const query = useQuery(returnAnswerDaysQueryOptions());
  return (
    <section
      aria-labelledby="return-answer-days-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1.5">
        <h2 id="return-answer-days-title" className="text-subhead font-medium">
          Prazo para o fornecedor conferir uma devolução
        </h2>
        <p className="text-sm text-muted-foreground">
          Vale quando o marketplace não dá data (venda manual e outros canais) e quando o pacote
          volta pelo revendedor. Com a data do Mercado Livre, o fornecedor responde até 1 dia antes
          dela. Sem resposta no prazo, vale o que o revendedor contou. Feriados ainda contam como
          dia útil.
        </p>
      </div>
      {query.isPending ? <Skeleton className="h-24 rounded-2xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data === undefined ? null : (
        <DaysForm key={query.data.businessDays} saved={query.data.businessDays} />
      )}
    </section>
  );
}
