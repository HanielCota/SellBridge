import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { ResendConfirmationButton } from "@/components/auth/resend-confirmation-button";
import { readPendingConfirmation } from "@/features/auth/pending-confirmation";

export const Route = createFileRoute("/_auth/confirme-seu-email")({
  head: () => ({ meta: [{ title: "Confira seu e-mail | SellBridge" }] }),
  component: CheckEmailPage,
});

const LINK_CLASS_NAME = "font-medium text-brand-text underline-offset-4 hover:underline";

const STEPS = [
  <>
    Abra o e-mail <strong className="font-medium">“Confirme seu e-mail no SellBridge”</strong>.
  </>,
  <>
    Toque em <strong className="font-medium">Confirmar e-mail</strong>. Você entra direto no
    SellBridge.
  </>,
];

/** The tab's storage never changes under this page, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => undefined;
}

/** The server render has no access to this tab's storage: it renders the text without the address. */
function usePendingEmail(): string | null {
  return useSyncExternalStore(subscribeToNothing, readPendingConfirmation, () => null);
}

function CheckEmailHeader({ email }: { email: string | null }) {
  return (
    <div className="space-y-2 text-center">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-brand/15 text-brand-text">
        <EnvelopeSimpleIcon aria-hidden="true" className="size-7" />
      </div>
      <h1 className="text-3xl leading-tight font-semibold tracking-tight">Confira seu e-mail</h1>
      <p className="text-body text-balance text-muted-foreground">
        {email === null ? (
          "Enviamos um link de confirmação para o e-mail que você cadastrou."
        ) : (
          <>
            Enviamos um link de confirmação para{" "}
            <strong className="font-medium break-all text-foreground">{email}</strong>.
          </>
        )}
      </p>
    </div>
  );
}

function CheckEmailSteps() {
  return (
    <ol className="grid gap-3">
      {STEPS.map((step, index) => (
        <li key={index} className="flex items-start gap-3 text-foreground">
          <span className="grid size-7 flex-none place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {index + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** After an e-mail sign-up: the account opens only from the link, so this page says where it is. */
function CheckEmailPage() {
  const email = usePendingEmail();
  return (
    <div className="space-y-8">
      <CheckEmailHeader email={email} />
      <div className="grid gap-5">
        <CheckEmailSteps />
        <p className="text-subhead text-muted-foreground">
          Não chegou em 2 minutos? Olhe no spam ou na aba Promoções. O link vale por 1 hora.
        </p>
        {email === null ? null : (
          <ResendConfirmationButton email={email} variant="outline" className="h-13 w-full" />
        )}
        <p className="text-center text-subhead text-muted-foreground">
          E-mail errado?{" "}
          <Link to="/cadastro" className={LINK_CLASS_NAME}>
            Cadastrar com outro e-mail
          </Link>
        </p>
      </div>
      <p className="text-center text-subhead text-muted-foreground">
        Já confirmou?{" "}
        <Link to="/login" className={LINK_CLASS_NAME}>
          Entrar
        </Link>
      </p>
    </div>
  );
}
