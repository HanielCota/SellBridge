import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Where the confirmation link lands: the account opens on its setup. */
export const CONFIRMATION_CALLBACK_URL = "/onboarding";

/** Sends the confirmation link again without a session (the account has none until confirmed). */
export function ResendConfirmationButton({
  email,
  variant,
  className,
}: {
  email: string;
  variant: "outline" | "link";
  className?: string;
}) {
  const resend = useMutation({
    mutationFn: async () => {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: CONFIRMATION_CALLBACK_URL,
      });
      if (result.error) {
        throw new Error("Não foi possível reenviar o e-mail. Tente de novo em instantes.");
      }
    },
    onSuccess: () => toast.success("Enviamos um novo link. Confira sua caixa de entrada."),
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={resend.isPending}
      onClick={() => resend.mutate()}
    >
      {resend.isPending ? "Enviando…" : "Reenviar e-mail"}
    </Button>
  );
}
