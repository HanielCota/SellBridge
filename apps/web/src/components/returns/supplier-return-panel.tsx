import type { ReturnPolicyDetails } from "@sellbridge/database/repositories";
import {
  CONDITION_MAX,
  CONDITION_MIN,
  REASON_WHEN_UNSTATED,
  resellableByDefault,
} from "@sellbridge/shared/return-policy";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmReturnReceivedFn,
  reportReturnNotReceivedFn,
} from "@/features/returns/returns.functions";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { deadlineText } from "./return-labels";
import { ClosedOutcome, StatedReason, SupplierFinding } from "./return-parts";
import { appendPhotos, ReturnPhotoPicker, useReturnPhotoPicker } from "./return-photos";

type Verdict = "as_described" | "not_as_described";

interface SupplierClaim {
  id: string;
  status: string;
  creditedCents: number | null;
  refusalReason: string | null;
  policy: ReturnPolicyDetails;
}

function useRefreshTicket() {
  const queryClient = useQueryClient();
  return async () => queryClient.invalidateQueries({ queryKey: ["tickets"] });
}

function Choice<TValue extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: TValue; label: string }[];
  value: TValue | null;
  onChange: (value: TValue) => void;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5 text-sm",
            value === option.value && "border-foreground bg-muted",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="size-4 accent-foreground"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

const VERDICT_OPTIONS = [
  { value: "as_described", label: "Está como o revendedor contou" },
  { value: "not_as_described", label: "Não está como o revendedor contou" },
] as const;

const RESELLABLE_OPTIONS = [
  { value: "yes", label: "Sim, volta para o meu estoque" },
  { value: "no", label: "Não" },
] as const;

/** Why the answer cannot be sent yet, or null when it can. */
function answerProblem(verdict: Verdict | null, condition: string, photos: number): string | null {
  if (verdict === null) {
    return "Diga se o produto está como o revendedor contou.";
  }
  if (verdict === "as_described") {
    return null;
  }
  if (condition.trim().length < CONDITION_MIN) {
    return "Conte em poucas palavras como o produto chegou.";
  }
  if (photos === 0) {
    return "Mande ao menos uma foto de como o produto chegou.";
  }
  return null;
}

function useSendAnswer(claim: SupplierClaim) {
  const refresh = useRefreshTicket();
  return useMutation({
    mutationFn: async (input: { formData: FormData; verdict: Verdict }) =>
      postMultipart(`/api/devolucoes/${claim.id}/resposta`, input.formData),
    onSuccess: async (_result, input) => {
      toast.success(
        input.verdict === "as_described"
          ? "Resposta enviada: devolução encerrada"
          : "Enviado à equipe SellBridge",
      );
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function ConditionField({
  condition,
  onChange,
}: {
  condition: string;
  onChange: (condition: string) => void;
}) {
  const conditionId = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={conditionId} className="text-sm font-medium">
        O que está diferente?
      </label>
      <Textarea
        id={conditionId}
        value={condition}
        maxLength={CONDITION_MAX}
        placeholder="Ex.: o produto voltou usado e sem a etiqueta."
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-20"
      />
    </div>
  );
}

/** What happens when the answer goes, or what is still missing. */
function answerFootnote(problem: string | null, disagrees: boolean): string {
  if (problem !== null) {
    return problem;
  }
  return disagrees
    ? "A equipe SellBridge olha as fotos dos dois lados e decide."
    : "A devolução se encerra: você devolve o custo do produto ao revendedor.";
}

function AnswerForm({ claim }: { claim: SupplierClaim }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [condition, setCondition] = useState("");
  const [resellable, setResellable] = useState<"yes" | "no">(
    resellableByDefault(claim.policy.reason ?? REASON_WHEN_UNSTATED) ? "yes" : "no",
  );
  const picker = useReturnPhotoPicker();
  const send = useSendAnswer(claim);
  const problem = answerProblem(verdict, condition, picker.files.length);
  const disagrees = verdict === "not_as_described";
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem !== null || verdict === null) {
          return;
        }
        const formData = new FormData();
        formData.set("verdict", verdict);
        formData.set("condition", condition);
        formData.set("resellable", resellable === "yes" ? "true" : "false");
        appendPhotos(formData, picker.files);
        send.mutate({ formData, verdict });
      }}
    >
      <Choice
        legend="Como o produto chegou?"
        options={VERDICT_OPTIONS}
        value={verdict}
        onChange={setVerdict}
      />
      {disagrees ? <ConditionField condition={condition} onChange={setCondition} /> : null}
      <Choice
        legend="Dá para vender de novo?"
        options={RESELLABLE_OPTIONS}
        value={resellable}
        onChange={setResellable}
      />
      <ReturnPhotoPicker
        picker={picker}
        label="Fotos do produto"
        hint="Mostre a embalagem, a etiqueta e o estado do produto."
        required={disagrees}
      />
      <div className="grid gap-1.5">
        <div>
          <Button type="submit" size="lg" disabled={problem !== null || send.isPending}>
            {send.isPending ? "Enviando…" : "Enviar resposta"}
          </Button>
        </div>
        <p className="text-footnote text-muted-foreground" aria-live="polite">
          {answerFootnote(problem, disagrees)}
        </p>
      </div>
    </form>
  );
}

function NotReceived({ claim }: { claim: SupplierClaim }) {
  const refresh = useRefreshTicket();
  const report = useMutation({
    mutationFn: async () => reportReturnNotReceivedFn({ data: { claimId: claim.id } }),
    onSuccess: async () => {
      toast.success("Avisado: a equipe SellBridge vai conferir o rastreio");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="grid gap-1.5 border-t border-border pt-4">
      <p className="text-sm font-medium">O pacote não chegou até você?</p>
      <p className="text-sm text-muted-foreground">
        Avise aqui. A equipe SellBridge confere o rastreio com o revendedor.
      </p>
      <div>
        <Button
          variant="outline"
          className="h-11"
          disabled={report.isPending}
          onClick={() => report.mutate()}
        >
          {report.isPending ? "Enviando…" : "O pacote não chegou aqui"}
        </Button>
      </div>
    </div>
  );
}

function ReceivedForward({ claim }: { claim: SupplierClaim }) {
  const refresh = useRefreshTicket();
  const received = useMutation({
    mutationFn: async () => confirmReturnReceivedFn({ data: { claimId: claim.id } }),
    onSuccess: async () => {
      toast.success("Recebimento anotado: confira o produto");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        O pacote voltou ao revendedor, que o reenviou para você com o código{" "}
        <span className="font-medium">{claim.policy.forwardTrackingCode ?? ""}</span>. Quando
        chegar, avise aqui e confira o produto.
      </p>
      <div>
        <Button size="lg" disabled={received.isPending} onClick={() => received.mutate()}>
          {received.isPending ? "Salvando…" : "Recebi o pacote"}
        </Button>
      </div>
    </div>
  );
}

function AwaitingAnswer({ claim }: { claim: SupplierClaim }) {
  const { policy } = claim;
  return (
    <>
      <div className="grid gap-1 rounded-2xl bg-amber-500/15 px-4 py-3 text-amber-900 dark:text-amber-200">
        <p className="text-sm font-semibold">
          Confira o produto e responda{" "}
          {policy.supplierDueAt === null ? "" : deadlineText(policy.supplierDueAt)}
        </p>
        <p className="text-sm">Sem resposta no prazo, vale o que o revendedor contou.</p>
      </div>
      {policy.reason === null ? (
        <p className="text-sm text-muted-foreground">
          O revendedor ainda não contou o motivo. Sem motivo, a devolução conta como desistência do
          comprador.
        </p>
      ) : (
        <StatedReason policy={policy} title="O que o revendedor contou" />
      )}
      <AnswerForm claim={claim} />
      {policy.destination === "supplier" ? <NotReceived claim={claim} /> : null}
    </>
  );
}

function PolicyStepBody({ claim }: { claim: SupplierClaim }) {
  const { policy } = claim;
  if (policy.step === "awaiting_supplier") {
    return <AwaitingAnswer claim={claim} />;
  }
  if (policy.step === "forwarded") {
    return <ReceivedForward claim={claim} />;
  }
  if (policy.step === "awaiting_forward") {
    return (
      <p className="text-sm">
        O pacote voltou ao endereço do revendedor. Ele tem{" "}
        {policy.forwardDueAt === null ? "7 dias" : deadlineText(policy.forwardDueAt)} para reenviar
        a você; o seu prazo começa quando o pacote chegar.
      </p>
    );
  }
  return (
    <>
      {policy.step === "disputed" ? (
        <p className="text-sm">A equipe SellBridge está olhando as fotos e vai decidir.</p>
      ) : null}
      <ClosedOutcome
        policy={policy}
        status={claim.status}
        creditedCents={claim.creditedCents}
        refusalReason={claim.refusalReason}
      />
      <SupplierFinding policy={policy} viewer="supplier" />
      <StatedReason policy={policy} title="O que o revendedor contou" />
    </>
  );
}

/** The supplier's part of a return under the policy, on the return's ticket. */
export function SupplierReturnPanel({ claim }: { claim: SupplierClaim }) {
  return (
    <div className="grid gap-4">
      <PolicyStepBody claim={claim} />
      <p className="text-footnote text-muted-foreground">
        <Link
          to="/fornecedor/painel/regras"
          hash="devolucoes"
          className="underline underline-offset-2"
        >
          Regras de devolução
        </Link>
      </p>
    </div>
  );
}
