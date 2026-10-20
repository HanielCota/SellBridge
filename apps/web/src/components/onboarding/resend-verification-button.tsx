import { ArrowRightIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

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
  const resend = useMutation({
    mutationFn: async () => {
      const result = await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: "/dashboard",
      });
      if (result.error) {
        throw new Error("Não foi possível reenviar o e-mail. Tente de novo em instantes.");
      }
    },
    onSuccess: () => toast.success("Enviamos o link de confirmação para o seu e-mail."),
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button className={className} disabled={resend.isPending} onClick={() => resend.mutate()}>
      {resend.isPending ? "Enviando…" : label}
      <ArrowRightIcon aria-hidden="true" />
    </Button>
  );
}
