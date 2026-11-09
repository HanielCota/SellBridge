import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CONFIRMATION_CALLBACK_URL } from "@/features/auth/sign-in-error";
import { authClient } from "@/lib/auth-client";

/** Sends the confirmation link to `email` again; shared by the sign-up, the login and the setup. */
export function useResendConfirmation(email: string, callbackURL: string, successMessage: string) {
  return useMutation({
    mutationFn: async () => {
      const result = await authClient.sendVerificationEmail({ email, callbackURL });
      if (result.error) {
        throw new Error("Não foi possível reenviar o e-mail. Tente de novo em instantes.");
      }
    },
    onSuccess: () => toast.success(successMessage),
    onError: (error) => toast.error(error.message),
  });
}

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
  const resend = useResendConfirmation(
    email,
    CONFIRMATION_CALLBACK_URL,
    "Enviamos um novo link. Confira sua caixa de entrada.",
  );
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
