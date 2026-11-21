import { SUPPLIER_REFUSAL_REASON_MAX_LENGTH } from "@sellbridge/shared/supplier-approval";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { adminDecideSupplierApproval } from "@/features/supplier-approval/approval.functions";
import { supplierApprovalKey } from "@/features/supplier-approval/approval.queries";
import { errorMessage } from "@/lib/errors";

const MIN_REASON_LENGTH = 10;

/** Why the typed reason cannot be sent yet, with what to do; null when it can. */
function reasonProblem(typed: string): string | null {
  const length = typed.trim().length;
  if (length < MIN_REASON_LENGTH) {
    return `Escreva o motivo com pelo menos ${MIN_REASON_LENGTH} letras (agora: ${length}). O fornecedor vai ler.`;
  }
  if (length > SUPPLIER_REFUSAL_REASON_MAX_LENGTH) {
    return `Use até ${SUPPLIER_REFUSAL_REASON_MAX_LENGTH} caracteres (agora: ${length}).`;
  }
  return null;
}

function useDecision(supplierName: string, onDecided?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminDecideSupplierApproval,
    onSuccess: async (status) => {
      toast.success(
        status === "approved"
          ? `${supplierName} aprovado: os produtos publicados já aparecem para os revendedores.`
          : `Cadastro de ${supplierName} recusado. O motivo aparece no painel dele.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: supplierApprovalKey }),
        queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] }),
      ]);
      onDecided?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function RefusalReasonField(props: {
  typed: string;
  problem: string | null;
  showProblem: boolean;
  onChange: (typed: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        Motivo para o fornecedor
      </label>
      <Textarea
        id={fieldId}
        value={props.typed}
        rows={4}
        maxLength={SUPPLIER_REFUSAL_REASON_MAX_LENGTH + 50}
        placeholder="Exemplo: o CNPJ informado está baixado na Receita. Cadastre o CNPJ ativo da empresa e fale com o suporte."
        aria-invalid={props.showProblem && props.problem !== null ? true : undefined}
        aria-describedby={`${fieldId}-hint`}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <p
        id={`${fieldId}-hint`}
        aria-live="polite"
        className={
          props.showProblem && props.problem !== null
            ? "text-footnote text-destructive"
            : "text-footnote text-muted-foreground"
        }
      >
        {props.showProblem && props.problem !== null
          ? props.problem
          : `De ${MIN_REASON_LENGTH} a ${SUPPLIER_REFUSAL_REASON_MAX_LENGTH} caracteres. Escreva em palavras simples o que ele precisa corrigir.`}
      </p>
    </div>
  );
}

/** "Aprovar" asks first, saying what approving opens to the resellers. */
function ApproveButton(props: {
  decision: ReturnType<typeof useDecision>;
  supplierId: string;
  supplierName: string;
  quiet: boolean;
}) {
  const { decision, supplierId, supplierName } = props;
  const [approving, setApproving] = useState(false);
  return (
    <>
      <Button
        size="lg"
        variant={props.quiet ? "outline" : "default"}
        disabled={decision.isPending}
        onClick={() => setApproving(true)}
      >
        <CheckIcon aria-hidden="true" />
        Aprovar
      </Button>
      <ConfirmDialog
        open={approving}
        onOpenChange={setApproving}
        title={`Aprovar ${supplierName}?`}
        description="Os produtos que ele publicar passam a aparecer para os revendedores, que já podem vender. Para voltar atrás depois, desative o fornecedor na ficha dele."
        confirmLabel="Aprovar fornecedor"
        pendingLabel="Aprovando…"
        cancelLabel="Voltar"
        isPending={decision.isPending}
        onConfirm={() =>
          decision.mutate(
            { data: { supplierId, decision: "approve" } },
            { onSuccess: () => setApproving(false) },
          )
        }
      />
    </>
  );
}

interface ApprovalDecisionProps {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly onDecided?: () => void;
  /** In a list of several suppliers no "Aprovar" is the one colored button of the page. */
  readonly quiet?: boolean;
}

/**
 * The team's two answers to a pending supplier: approve after reading what it opens (it can be
 * switched off later, as any supplier), or refuse with a reason the supplier reads on its panel.
 */
export function ApprovalDecision(props: ApprovalDecisionProps) {
  const { supplierId, supplierName, onDecided } = props;
  const decision = useDecision(supplierName, onDecided);
  const [refusing, setRefusing] = useState(false);
  const [typed, setTyped] = useState("");
  const [showProblem, setShowProblem] = useState(false);
  const problem = reasonProblem(typed);
  return (
    <div className="flex flex-wrap gap-2">
      <ApproveButton
        decision={decision}
        supplierId={supplierId}
        supplierName={supplierName}
        quiet={props.quiet ?? false}
      />
      <Button
        size="lg"
        variant="outline"
        disabled={decision.isPending}
        onClick={() => setRefusing(true)}
      >
        <XIcon aria-hidden="true" />
        Recusar
      </Button>
      <ConfirmDialog
        open={refusing}
        onOpenChange={(open) => {
          setRefusing(open);
          setShowProblem(false);
        }}
        title={`Recusar o cadastro de ${supplierName}?`}
        description="Ele continua com o painel, mas não aparece para os revendedores e não cadastra produtos novos. O motivo abaixo aparece no painel dele."
        confirmLabel="Recusar cadastro"
        pendingLabel="Recusando…"
        cancelLabel="Voltar"
        destructive
        isPending={decision.isPending}
        onConfirm={() => {
          setShowProblem(true);
          if (problem !== null) {
            return;
          }
          decision.mutate(
            { data: { supplierId, decision: "refuse", reason: typed.trim() } },
            { onSuccess: () => setRefusing(false) },
          );
        }}
      >
        <RefusalReasonField
          typed={typed}
          problem={problem}
          showProblem={showProblem}
          onChange={setTyped}
        />
      </ConfirmDialog>
    </div>
  );
}
