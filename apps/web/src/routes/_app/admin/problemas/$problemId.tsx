import { PROBLEM_AREA_LABELS, PROBLEM_SERVICE_LABELS } from "@sellbridge/shared/problem-areas";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { TonePill } from "@/components/data/tone-status";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { occurrencesLabel, problemWhenLabel } from "@/features/admin-problems/problem-copy";
import {
  type adminGetProblem,
  adminSetProblemResolved,
} from "@/features/admin-problems/problems.functions";
import {
  PROBLEMS_QUERY_KEY,
  problemQueryOptions,
} from "@/features/admin-problems/problems.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { prefetchOnServer } from "@/lib/prefetch";

type ProblemDetail = Awaited<ReturnType<typeof adminGetProblem>>;

export const Route = createFileRoute("/_app/admin/problemas/$problemId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, problemQueryOptions(params.problemId)),
  head: () => ({ meta: [{ title: "Problema (admin) | SellBridge" }] }),
  component: ProblemPage,
});

/** Resolving is one click with "Desfazer" on the notice: it changes nothing outside this list. */
function useResolveProblem(problemId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (resolved: boolean) => adminSetProblemResolved({ data: { problemId, resolved } }),
    onSuccess: async (_result, resolved) => {
      if (resolved) {
        toast.success("Problema marcado como resolvido", {
          action: { label: "Desfazer", onClick: () => mutation.mutate(false) },
        });
      }
      if (!resolved) {
        toast.success("Problema reaberto");
      }
      await queryClient.invalidateQueries({ queryKey: PROBLEMS_QUERY_KEY });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return mutation;
}

function StatusPill({ problem }: { problem: ProblemDetail }) {
  if (problem.resolvedAt === null) {
    return <TonePill tone="warning" label="Em aberto" />;
  }
  const who = problem.resolvedByName === null ? "" : ` por ${problem.resolvedByName}`;
  const when = formatAbsoluteTime(new Date(problem.resolvedAt));
  return <TonePill tone="success" label={`Resolvido em ${when}${who}`} />;
}

function ResolveButton({ problem }: { problem: ProblemDetail }) {
  const mutation = useResolveProblem(problem.id);
  if (problem.resolvedAt !== null) {
    return (
      <Button
        variant="outline"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(false)}
      >
        {mutation.isPending ? "Reabrindo..." : "Reabrir problema"}
      </Button>
    );
  }
  return (
    <Button disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
      <CheckIcon aria-hidden="true" />
      {mutation.isPending ? "Salvando..." : "Marcar como resolvido"}
    </Button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function AccountFact({ problem }: { problem: ProblemDetail }) {
  if (problem.accountName === null) {
    return <span className="font-normal text-muted-foreground">Sem conta ligada</span>;
  }
  if (problem.accountUserId === null) {
    return problem.accountName;
  }
  return (
    <Link
      to="/admin/clientes/$userId"
      params={{ userId: problem.accountUserId }}
      className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
    >
      {problem.accountName}
    </Link>
  );
}

function ProblemFacts({ problem }: { problem: ProblemDetail }) {
  return (
    <dl className="surface-card grid gap-4 rounded-3xl bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Fact label="Última vez">{problemWhenLabel(new Date(problem.lastSeenAt))}</Fact>
      <Fact label="Primeira vez">{problemWhenLabel(new Date(problem.firstSeenAt))}</Fact>
      <Fact label="Repetições">{occurrencesLabel(problem.occurrences)}</Fact>
      <Fact label="Onde aconteceu">{PROBLEM_SERVICE_LABELS[problem.service]}</Fact>
      <Fact label="Conta">
        <AccountFact problem={problem} />
      </Fact>
      <Fact label="Loja">{problem.storeName ?? "Sem loja ligada"}</Fact>
    </dl>
  );
}

/** For the developer: the log event and its fields, already without personal data or secrets. */
function TechnicalDetails({ problem }: { problem: ProblemDetail }) {
  const details = problem.technicalDetails;
  async function copy() {
    try {
      await navigator.clipboard.writeText(details);
      toast.success("Detalhes copiados");
    } catch {
      toast.error("Não deu para copiar. Selecione o texto e copie à mão.");
    }
  }
  return (
    <section className="surface-card space-y-3 rounded-3xl bg-card p-5" aria-labelledby="tech">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h2 id="tech" className="text-subhead font-medium">
            Detalhes técnicos
          </h2>
          <p className="text-sm text-muted-foreground">
            O registro como o sistema gravou, sem dados pessoais nem senhas. Para quem vai corrigir.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          <CopyIcon aria-hidden="true" />
          Copiar detalhes
        </Button>
      </div>
      <pre className="max-h-[28rem] overflow-auto rounded-2xl bg-muted p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
        {details}
      </pre>
    </section>
  );
}

function ProblemSkeleton() {
  return (
    <output className="block space-y-4" aria-label="Carregando problema">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-32 w-full rounded-3xl" />
      <Skeleton className="h-64 w-full rounded-3xl" />
    </output>
  );
}

function ProblemBody({ problem }: { problem: ProblemDetail }) {
  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TonePill tone="muted" showDot={false} label={PROBLEM_AREA_LABELS[problem.area]} />
          <StatusPill problem={problem} />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight break-words">
            {problem.message}
          </h1>
          <ResolveButton problem={problem} />
        </div>
      </div>
      <ProblemFacts problem={problem} />
      <TechnicalDetails problem={problem} />
    </>
  );
}

function ProblemPage() {
  const { problemId } = Route.useParams();
  const query = useQuery(problemQueryOptions(problemId));
  return (
    <>
      <BackLink to="/admin/problemas" label="Problemas" />
      {query.isPending ? <ProblemSkeleton /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess ? <ProblemBody problem={query.data} /> : null}
    </>
  );
}
