import { contractFor } from "@sellbridge/shared/contract-documents";
import { internalPathSchema } from "@sellbridge/shared/schemas";
import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { AuthPageHeader } from "@/components/auth/auth-page";
import { AuthShell } from "@/components/auth/auth-shell";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { useSignOut } from "@/components/layout/user-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { ContractCodeStep } from "@/components/contract-signing/contract-code-step";
import { ContractSummaryStep } from "@/components/contract-signing/contract-summary-step";
import { getAppSession } from "@/features/auth/session.functions";
import { sessionMaySign } from "@/features/contract-signing/contract-gate";
import { useContractSigning } from "@/features/contract-signing/use-contract-signing";
import { needsTermsAcceptance } from "@/features/onboarding/terms-gate";
import { parseRequestedProfile } from "@/lib/profile-param";
import { formatAbsoluteTime } from "@/lib/relative-time";

const SupportIcon = ACTION_ICONS.support.icon;

const signContractSearchSchema = z.object({
  redirect: internalPathSchema,
  perfil: z
    .string()
    .optional()
    .transform((value) => parseRequestedProfile(value) ?? undefined),
});

/** Contracts, section 1: the tab profile's contract, summary first, signed with an e-mail code. */
export const Route = createFileRoute("/assinar-contrato")({
  validateSearch: signContractSearchSchema,
  head: () => ({ meta: [{ title: "Assinar contrato | SellBridge" }] }),
  beforeLoad: async ({ search, location }) => {
    const session = await getAppSession();
    if (session === null) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (needsTermsAcceptance(session)) {
      throw redirect({ to: "/aceitar-termos", search: { redirect: location.href } });
    }
    if (!sessionMaySign(session)) {
      throw redirect({ to: search.redirect ?? "/dashboard" });
    }
    // Within the 30 days the person may leave and sign later; past them only signing opens.
    return {
      profileKind: session.profileKind,
      canSignLater: session.contract.standing === "grace",
    };
  },
  component: SignContractPage,
});

function SignContractPage() {
  const { profileKind, canSignLater } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const contract = contractFor(profileKind);
  const signing = useContractSigning(contract, async (signedAt) => {
    toast.success(`Contrato assinado em ${formatAbsoluteTime(new Date(signedAt))}.`);
    await router.invalidate();
    await navigate({ to: search.redirect ?? "/dashboard" });
  });
  return (
    <AuthShell>
      <div className="space-y-8">
        <AuthPageHeader
          title={`Assine o ${contract.title.toLowerCase()}`}
          description={
            signing.step === "summary"
              ? "Etapa 1 de 2: leia os pontos principais e marque cada um."
              : "Etapa 2 de 2: digite o código que enviamos ao seu e-mail."
          }
        />
        {signing.step === "summary" ? (
          <ContractSummaryStep
            contract={contract}
            confirmed={signing.summary.confirmed}
            highlighted={signing.summary.highlighted}
            error={signing.summaryError}
            isPending={signing.request.isSending}
            onToggle={signing.summary.toggle}
            onSubmit={signing.submitSummary}
          />
        ) : (
          <ContractCodeStep
            sentTo={signing.request.sentTo}
            code={signing.entry.code}
            error={signing.entry.error}
            isSigning={signing.entry.isSigning}
            isResending={signing.request.isSending}
            resendWaitInSeconds={signing.request.resendWaitInSeconds}
            onCodeChange={signing.entry.setCode}
            onSubmit={signing.entry.sign}
            onResend={signing.resend}
            onBack={signing.backToSummary}
          />
        )}
        <SigningWayOut canSignLater={canSignLater} destination={search.redirect ?? "/dashboard"} />
      </div>
    </AuthShell>
  );
}

/**
 * The way out of the screen: back to the panel while the 30 days run, otherwise leaving the
 * account, so whoever cannot sign now is never stuck on a page without exits.
 */
function SigningWayOut({
  canSignLater,
  destination,
}: {
  canSignLater: boolean;
  destination: string;
}) {
  const signOut = useSignOut();
  return (
    <div className="grid gap-2">
      <Link
        to="/suporte"
        className={buttonVariants({ variant: "outline", className: "min-h-11 w-full" })}
      >
        <SupportIcon aria-hidden="true" />
        Falar com o suporte
      </Link>
      <WayBack
        canSignLater={canSignLater}
        destination={destination}
        onSignOut={() => void signOut()}
      />
    </div>
  );
}

function WayBack(props: { canSignLater: boolean; destination: string; onSignOut: () => void }) {
  if (props.canSignLater) {
    return (
      <Link
        to={props.destination}
        className={buttonVariants({ variant: "ghost", className: "min-h-11 w-full" })}
      >
        Assinar depois
      </Link>
    );
  }
  return (
    <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={props.onSignOut}>
      Sair da conta
    </Button>
  );
}
