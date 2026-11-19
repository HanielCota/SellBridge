import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { saveReceivingRulesFn } from "@/features/supplier-payments/receiving-rules.functions";
import { receivingRulesQueryOptions } from "@/features/supplier-payments/receiving-rules.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

type ReceivingRulesView = Awaited<
  ReturnType<
    typeof import("@/features/supplier-payments/receiving-rules.functions").getReceivingRulesFn
  >
>;

interface Choice {
  requireReceivingAccount: boolean;
  paymentBeforePreparing: boolean;
}

function useSaveRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choice: Choice) => saveReceivingRulesFn({ data: choice }),
    onSuccess: async (saved) => {
      toast.success(
        saved.requireReceivingAccount
          ? "Salvo: só vende quem tem a conta de recebimento aprovada."
          : "Salvo: as duas regras estão desligadas.",
      );
      await queryClient.invalidateQueries({ queryKey: receivingRulesQueryOptions().queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function suppliersPhrase(total: number): string {
  if (total === 1) {
    return "1 fornecedor ainda não tem";
  }
  return `${total} fornecedores ainda não têm`;
}

/** What saving changes, written before the click (only when something changes). */
function Consequence({ view, choice }: { view: ReceivingRulesView; choice: Choice }) {
  const lines: string[] = [];
  if (choice.requireReceivingAccount && !view.requireReceivingAccount) {
    lines.push(
      `${suppliersPhrase(view.suppliersWithoutAccount)} a conta aprovada: os produtos somem do catálogo e os pedidos novos esperam a conta. Os anúncios que já estão no ar continuam.`,
    );
  }
  if (choice.paymentBeforePreparing && !view.paymentBeforePreparing) {
    lines.push(
      "Pedidos novos só são aceitos depois que o revendedor paga o fornecedor pelo Asaas.",
    );
  }
  if (!choice.requireReceivingAccount && view.requireReceivingAccount) {
    lines.push("Fornecedores sem conta voltam ao catálogo e os pedidos parados seguem.");
  }
  if (!choice.paymentBeforePreparing && view.paymentBeforePreparing) {
    lines.push("Os fornecedores voltam a aceitar pedidos antes do pagamento.");
  }
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
      <p className="font-medium">Ao salvar:</p>
      <ul className="grid list-disc gap-1 pl-5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function RuleSwitch(props: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const switchId = useId();
  return (
    <div className="grid gap-1">
      <div className="flex min-h-11 items-center gap-3">
        <Switch
          id={switchId}
          checked={props.checked}
          disabled={props.disabled}
          aria-describedby={`${switchId}-hint`}
          onCheckedChange={props.onChange}
        />
        <label htmlFor={switchId} className="text-sm font-medium">
          {props.label}
        </label>
      </div>
      <p id={`${switchId}-hint`} className="pl-14 text-footnote text-muted-foreground">
        {props.hint}
      </p>
    </div>
  );
}

function RulesForm({ view }: { view: ReceivingRulesView }) {
  const [choice, setChoice] = useState<Choice>({
    requireReceivingAccount: view.requireReceivingAccount,
    paymentBeforePreparing: view.paymentBeforePreparing,
  });
  const save = useSaveRules();
  const changed =
    choice.requireReceivingAccount !== view.requireReceivingAccount ||
    choice.paymentBeforePreparing !== view.paymentBeforePreparing;
  // Turning off always works; turning on needs Asaas configured on the server.
  const cannotTurnOn = !view.asaasAvailable;
  return (
    <div className="grid gap-4">
      {cannotTurnOn ? (
        <p className="text-sm">
          O Asaas ainda não está ligado no SellBridge. As regras só podem ser ligadas depois disso.
        </p>
      ) : null}
      <RuleSwitch
        label="Exigir conta de recebimento para vender"
        hint="Só vende quem tem a conta Asaas aprovada. Sem ela, os produtos do fornecedor não aparecem e os pedidos novos esperam."
        checked={choice.requireReceivingAccount}
        disabled={cannotTurnOn && !choice.requireReceivingAccount}
        onChange={(checked) =>
          setChoice({
            requireReceivingAccount: checked,
            paymentBeforePreparing: checked && choice.paymentBeforePreparing,
          })
        }
      />
      <RuleSwitch
        label="Pagamento antes de preparar"
        hint={
          choice.requireReceivingAccount
            ? "O fornecedor só aceita, separa e despacha depois que o revendedor paga pelo Asaas. Os prazos dele contam a partir do pagamento."
            : "Ligue antes “Exigir conta de recebimento para vender”: sem a conta, o revendedor não tem como pagar."
        }
        checked={choice.paymentBeforePreparing}
        disabled={
          !choice.requireReceivingAccount || (cannotTurnOn && !choice.paymentBeforePreparing)
        }
        onChange={(checked) => setChoice({ ...choice, paymentBeforePreparing: checked })}
      />
      {changed ? <Consequence view={view} choice={choice} /> : null}
      <div>
        <Button size="lg" disabled={!changed || save.isPending} onClick={() => save.mutate(choice)}>
          {save.isPending ? "Salvando…" : "Salvar regras"}
        </Button>
      </div>
    </div>
  );
}

function RulesStatus({ view }: { view: ReceivingRulesView }) {
  if (view.paymentBeforePreparing && view.paymentBeforePreparingSince !== null) {
    return (
      <PaymentPill tone="success">
        {`Pagamento antes de preparar · desde ${formatAbsoluteTime(new Date(view.paymentBeforePreparingSince))}`}
      </PaymentPill>
    );
  }
  if (view.requireReceivingAccount && view.receivingAccountSince !== null) {
    return (
      <PaymentPill tone="success">
        {`Conta exigida · desde ${formatAbsoluteTime(new Date(view.receivingAccountSince))}`}
      </PaymentPill>
    );
  }
  return <PaymentPill tone="neutral">Desligadas</PaymentPill>;
}

/**
 * Admin: the two switches that make suppliers receive only through SellBridge (Guilherme,
 * 18/11/2026). Off until Asaas runs in production.
 */
export function ReceivingRulesCard() {
  const query = useQuery(receivingRulesQueryOptions());
  return (
    <section
      aria-labelledby="receiving-rules-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="receiving-rules-title" className="text-subhead font-medium">
            Recebimento pelo SellBridge
          </h2>
          {query.data === undefined ? null : <RulesStatus view={query.data} />}
        </div>
        <p className="text-sm text-muted-foreground">
          O fornecedor recebe pelo Asaas, com o dinheiro guardado até a entrega. Ligue as regras
          quando o Asaas estiver funcionando; pedidos encaminhados antes de ligar seguem como
          estavam.
        </p>
        <p className="text-sm text-muted-foreground">
          Não é a mesma chave de “Exigir conta de recebimento para aprovar”: aquela só segura a
          aprovação de quem se cadastra sozinho. Estas valem para todos os fornecedores: tiram do
          catálogo quem não tem a conta e seguram o preparo do pedido até o pagamento.
        </p>
      </div>
      {query.isPending ? <Skeleton className="h-40 rounded-2xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data === undefined ? null : (
        <RulesForm
          key={`${query.data.requireReceivingAccount}-${query.data.paymentBeforePreparing}`}
          view={query.data}
        />
      )}
    </section>
  );
}
