import { useState } from "react";
import { InlineFormError } from "@/components/form/inline-form-error";
import { authClient } from "@/lib/auth-client";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

/** "Continuar com Google" plus the "ou" divider that separates it from the e-mail form. */
export function GoogleSignIn({ callbackURL }: { callbackURL: string }) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    setError(null);
    setIsRedirecting(true);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      newUserCallbackURL: "/onboarding",
      errorCallbackURL: "/login",
    });
    if (result.error) {
      setIsRedirecting(false);
      setError("Não foi possível continuar com o Google. Tente novamente.");
    }
  }

  return (
    <div className="grid gap-5">
      <button
        type="button"
        onClick={() => void continueWithGoogle()}
        disabled={isRedirecting}
        className="flex h-[52px] w-full items-center justify-center gap-3 rounded-full border border-field-border bg-field text-[17px] font-medium transition-[transform,background-color] duration-100 outline-none hover:bg-muted focus-visible:ring-4 focus-visible:ring-brand/20 active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100"
      >
        <GoogleMark />
        Continuar com Google
      </button>
      <InlineFormError message={error} />
      <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
        <span className="h-px flex-1 bg-field-border" />
        ou
        <span className="h-px flex-1 bg-field-border" />
      </div>
    </div>
  );
}
