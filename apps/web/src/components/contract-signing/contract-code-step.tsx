import {
  SIGNING_CODE_LENGTH,
  SIGNING_CODE_TTL_IN_MINUTES,
  typedSigningCode,
} from "@sellbridge/shared/contract-signing";
import { useId } from "react";
import { AuthSubmitButton } from "@/components/auth/auth-page";
import { submitHandler } from "@/components/form/form-bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ContractCodeStepProps {
  sentTo: string;
  code: string;
  error: string | null;
  isSigning: boolean;
  isResending: boolean;
  /** Seconds before another code may be asked; 0 when it may. */
  resendWaitInSeconds: number;
  onCodeChange: (code: string) => void;
  onSubmit: () => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
}

function resendLabel(props: Pick<ContractCodeStepProps, "isResending" | "resendWaitInSeconds">) {
  if (props.isResending) {
    return "Enviando outro código…";
  }
  if (props.resendWaitInSeconds > 0) {
    return `Enviar outro código em ${props.resendWaitInSeconds} s`;
  }
  return "Enviar outro código";
}

function CodeField(
  props: Pick<ContractCodeStepProps, "sentTo" | "code" | "error" | "onCodeChange">,
) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-subhead font-medium">
        Código do e-mail
      </label>
      <p id={hintId} className="text-footnote text-muted-foreground">
        Enviamos {SIGNING_CODE_LENGTH} números para <strong>{props.sentTo}</strong>. O código vale
        por {SIGNING_CODE_TTL_IN_MINUTES} minutos. Não chegou? Olhe a caixa de spam.
      </p>
      <Input
        id={inputId}
        value={props.code}
        onChange={(event) => props.onCodeChange(typedSigningCode(event.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="Exemplo: 123456"
        aria-invalid={props.error !== null}
        aria-describedby={props.error === null ? hintId : `${hintId} ${errorId}`}
        className="h-13 text-center text-2xl tracking-[0.4em] tabular-nums"
      />
      {props.error === null ? null : (
        <p id={errorId} role="alert" aria-live="polite" className="text-footnote text-destructive">
          {props.error}
        </p>
      )}
    </div>
  );
}

/** Step 2: the code from the e-mail, with the way out when it is wrong or late. */
export function ContractCodeStep(props: ContractCodeStepProps) {
  return (
    <form noValidate className="grid gap-4" onSubmit={submitHandler(props.onSubmit)}>
      <CodeField
        sentTo={props.sentTo}
        code={props.code}
        error={props.error}
        onCodeChange={props.onCodeChange}
      />
      <AuthSubmitButton
        isPending={props.isSigning}
        idleLabel="Assinar contrato"
        pendingLabel="Assinando…"
      />
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={props.onBack}>
          Voltar ao resumo
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={props.isResending || props.resendWaitInSeconds > 0}
          onClick={() => void props.onResend()}
        >
          {resendLabel(props)}
        </Button>
      </div>
    </form>
  );
}
