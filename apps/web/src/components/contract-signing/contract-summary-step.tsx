import type { ContractDocument } from "@sellbridge/shared/contract-documents";
import { PROVISIONAL_CONTRACT_NOTICE } from "@sellbridge/shared/contract-documents";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { AuthSubmitButton } from "@/components/auth/auth-page";
import { submitHandler } from "@/components/form/form-bindings";
import { InlineFormError } from "@/components/form/inline-form-error";
import { Checkbox } from "@/components/ui/checkbox";
import { summaryItemElementId } from "@/features/contract-signing/use-contract-signing";
import { cn } from "@/lib/utils";

interface ContractSummaryStepProps {
  contract: ContractDocument;
  confirmed: ReadonlySet<string>;
  /** Lines to highlight after a send with something unticked. */
  highlighted: ReadonlySet<string>;
  error: string | null;
  isPending: boolean;
  onToggle: (itemId: string, checked: boolean) => void;
  onSubmit: () => Promise<void>;
}

/** Step 1: one box per summary line, the full contract a tap away, then the code by e-mail. */
export function ContractSummaryStep(props: ContractSummaryStepProps) {
  const { contract } = props;
  return (
    <form noValidate className="grid gap-4" onSubmit={submitHandler(props.onSubmit)}>
      {contract.provisional ? (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-footnote text-amber-900 dark:text-amber-200">
          {PROVISIONAL_CONTRACT_NOTICE}
        </p>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-subhead font-medium">
          Marque cada ponto para confirmar que leu:
        </legend>
        {contract.summary.map((item) => (
          <SummaryLine
            key={item.id}
            id={summaryItemElementId(item.id)}
            text={item.text}
            checked={props.confirmed.has(item.id)}
            invalid={props.highlighted.has(item.id)}
            onCheckedChange={(checked) => props.onToggle(item.id, checked)}
          />
        ))}
      </fieldset>
      <Link
        to={contract.path}
        target="_blank"
        className="inline-flex min-h-11 items-center gap-2 text-subhead font-medium text-brand-text underline underline-offset-2"
      >
        <ArrowSquareOutIcon aria-hidden="true" className="size-4" />
        Ler o contrato completo
      </Link>
      <AuthSubmitButton
        isPending={props.isPending}
        idleLabel="Enviar código para o meu e-mail"
        pendingLabel="Enviando código…"
      />
      <InlineFormError message={props.error} />
    </form>
  );
}

function SummaryLine(props: {
  id: string;
  text: string;
  checked: boolean;
  invalid: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-start gap-3 rounded-2xl bg-card px-4 py-3",
        props.invalid && "ring-2 ring-destructive/40",
      )}
    >
      <Checkbox
        id={props.id}
        checked={props.checked}
        aria-invalid={props.invalid}
        onCheckedChange={(state) => props.onCheckedChange(state === true)}
        className="mt-0.5"
      />
      <label htmlFor={props.id} className="text-subhead leading-relaxed">
        {props.text}
      </label>
    </div>
  );
}
