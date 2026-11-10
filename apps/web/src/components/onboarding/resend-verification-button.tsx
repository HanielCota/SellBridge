import { ArrowRightIcon } from "@phosphor-icons/react";
import { getRouteApi } from "@tanstack/react-router";
import { useResendConfirmation } from "@/components/auth/resend-confirmation-button";
import { Button } from "@/components/ui/button";

const appRoute = getRouteApi("/_app");

/** Sends the confirmation link again to the signed-in e-mail (item 26.b). */
export function ResendVerificationButton({
  label,
  className = "w-fit",
}: {
  label: string;
  className?: string;
}) {
  const { session } = appRoute.useRouteContext();
  const resend = useResendConfirmation(
    session.user.email,
    "/dashboard",
    "Enviamos o link de confirmação para o seu e-mail.",
  );
  return (
    <Button className={className} disabled={resend.isPending} onClick={() => resend.mutate()}>
      {resend.isPending ? "Enviando…" : label}
      <ArrowRightIcon aria-hidden="true" />
    </Button>
  );
}
