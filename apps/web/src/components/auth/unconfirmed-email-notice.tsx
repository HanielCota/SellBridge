import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { ResendConfirmationButton } from "@/components/auth/resend-confirmation-button";

/** The password was right but the e-mail is not confirmed: the server just sent a new link. */
export function UnconfirmedEmailNotice({ email }: { email: string }) {
  return (
    <output className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3.5 text-left text-card-foreground">
      <EnvelopeSimpleIcon aria-hidden="true" className="row-span-3 mt-0.5 size-5 text-brand-text" />
      <strong className="font-medium text-foreground">Falta confirmar seu e-mail</strong>
      <span className="text-sm text-muted-foreground">
        Acabamos de mandar um link novo para{" "}
        <strong className="font-medium wrap-anywhere text-foreground">{email}</strong>. Abra o
        e-mail e toque em Confirmar e-mail para entrar.
      </span>
      <span className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
        Não chegou?
        <ResendConfirmationButton email={email} variant="link" className="h-auto px-0 text-sm" />
      </span>
    </output>
  );
}
