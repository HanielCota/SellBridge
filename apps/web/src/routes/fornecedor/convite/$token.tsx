import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { SupplierPageFrame } from "@/components/fulfillment/supplier-page-frame";
import { InlineFormError } from "@/components/form/inline-form-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import type { InviteState } from "@/features/supplier-invite/invite-state";
import {
  acceptSupplierInviteFn,
  getSupplierInviteFn,
} from "@/features/supplier-invite/supplier-invite.functions";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/errors";
import { SHARE_IMAGES, shareMeta } from "@/lib/share-meta";
import { addProfileToHref, forgetTabProfile } from "@/lib/tab-profile";

export const Route = createFileRoute("/fornecedor/convite/$token")({
  head: () => ({
    meta: [
      ...shareMeta({
        title: "Convite para o painel do fornecedor | SellBridge",
        description: "Ative o painel do fornecedor para receber e responder os pedidos.",
        image: SHARE_IMAGES.symbol,
      }),
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SupplierInvitePage,
});

const PANEL_ORDERS_PATH = `${SUPPLIER_PANEL_PATH}/pedidos`;

function InviteCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="surface-card space-y-4 rounded-2xl bg-card p-5" aria-labelledby="invite">
      <h1 id="invite" className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      {actions === undefined ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">{actions}</div>
      )}
    </section>
  );
}

function InviteSkeleton() {
  return (
    <output
      className="block surface-card space-y-4 rounded-2xl bg-card p-5"
      aria-busy="true"
      aria-label="Carregando convite"
    >
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-11 w-48 rounded-full" />
    </output>
  );
}

function SignedOutInvite({
  invitePath,
  supplierName,
  maskedEmail,
}: {
  invitePath: string;
  supplierName: string;
  maskedEmail: string;
}) {
  const redirect = encodeURIComponent(invitePath);
  return (
    <InviteCard
      title={`Ative o painel da ${supplierName}`}
      actions={
        <>
          <Button asChild size="lg">
            <a href={`/cadastro/fornecedor?redirect=${redirect}`}>Criar minha conta</a>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <a href={`/login?redirect=${redirect}`}>Já tenho conta: entrar</a>
          </Button>
        </>
      }
    >
      <p>
        Os pedidos dos revendedores passam a ficar no painel do SellBridge. Lá você aceita, separa e
        informa o envio de todos eles num lugar só.
      </p>
      <p>
        Use o e-mail de pedidos <strong className="text-foreground">{maskedEmail}</strong> para
        criar a conta ou entrar.
      </p>
    </InviteCard>
  );
}

function ReadyInvite({ token, supplierName }: { token: string; supplierName: string }) {
  const [isActivating, setIsActivating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function activate() {
    setIsActivating(true);
    setFailure(null);
    try {
      const { profileSlug } = await acceptSupplierInviteFn({ data: { token } });
      // A full load, so the panel opens on the profile that now runs the supplier.
      window.location.assign(addProfileToHref(PANEL_ORDERS_PATH, profileSlug));
    } catch (error) {
      setFailure(errorMessage(error));
      setIsActivating(false);
    }
  }

  return (
    <InviteCard
      title={`Ative o painel da ${supplierName}`}
      actions={
        <Button size="lg" disabled={isActivating} onClick={() => void activate()}>
          {isActivating ? "Ativando..." : "Ativar meu painel"}
        </Button>
      }
    >
      <p>
        Os pedidos, os produtos e o histórico da {supplierName} passam a ficar no painel desta
        conta. Depois disso, os pedidos novos chegam só pelo painel.
      </p>
      <InlineFormError message={failure} />
    </InviteCard>
  );
}

function WrongEmailInvite({
  invitePath,
  maskedEmail,
}: {
  invitePath: string;
  maskedEmail: string;
}) {
  const [isLeaving, setIsLeaving] = useState(false);

  async function switchAccount() {
    setIsLeaving(true);
    await authClient.signOut();
    forgetTabProfile();
    window.location.assign(`/login?redirect=${encodeURIComponent(invitePath)}`);
  }

  return (
    <InviteCard
      title={`Este convite é para ${maskedEmail}`}
      actions={
        <Button size="lg" disabled={isLeaving} onClick={() => void switchAccount()}>
          {isLeaving ? "Saindo..." : "Sair e entrar com o e-mail certo"}
        </Button>
      }
    >
      <p>
        Você entrou com outra conta. Só a conta com o e-mail de pedidos do fornecedor pode ativar o
        painel.
      </p>
    </InviteCard>
  );
}

type SettledInvite = Exclude<InviteState, { status: "signed_out" | "ready" | "wrong_email" }>;

/** Invites with nothing left to do here but read why, or go to the panel. */
function SettledInviteCard({ state }: { state: SettledInvite }) {
  if (state.status === "unconfirmed") {
    return (
      <InviteCard title="Confirme o seu e-mail">
        <p>
          Abra o e-mail de confirmação que enviamos para {state.maskedEmail} e depois volte a este
          convite.
        </p>
      </InviteCard>
    );
  }
  if (state.status === "claimed") {
    return (
      <InviteCard
        title="Este fornecedor já tem painel"
        actions={
          <Button asChild size="lg">
            <a href={PANEL_ORDERS_PATH}>Ir para o painel</a>
          </Button>
        }
      >
        <p>Os pedidos ficam no painel. Entre com a conta do fornecedor.</p>
      </InviteCard>
    );
  }
  const copy = SETTLED_COPY[state.status];
  return (
    <InviteCard title={copy.title}>
      <p>{copy.text}</p>
    </InviteCard>
  );
}

const SETTLED_COPY: Record<
  "inactive" | "no_email" | "expired" | "invalid",
  { title: string; text: string }
> = {
  inactive: {
    title: "Este fornecedor está desativado",
    text: "O painel só pode ser ativado para um fornecedor ativo. Fale com a equipe SellBridge pelo contato que você já usa.",
  },
  no_email: {
    title: "Falta o e-mail de pedidos",
    text: "Para ativar o painel, a equipe SellBridge precisa cadastrar o e-mail de pedidos deste fornecedor. Fale com a equipe pelo contato que você já usa.",
  },
  expired: {
    title: "Este convite venceu",
    text: "Os convites valem 14 dias. Abra o último pedido que você recebeu por e-mail: lá tem o botão para criar o acesso. Ou peça um convite novo à equipe SellBridge.",
  },
  invalid: {
    title: "Convite não encontrado",
    text: "Confira se o endereço foi copiado inteiro. Se continuar, peça um convite novo à equipe SellBridge.",
  },
};

function InviteContent({ token, state }: { token: string; state: InviteState }) {
  const invitePath = `/fornecedor/convite/${token}`;
  if (state.status === "signed_out") {
    return (
      <SignedOutInvite
        invitePath={invitePath}
        supplierName={state.supplierName}
        maskedEmail={state.maskedEmail}
      />
    );
  }
  if (state.status === "ready") {
    return <ReadyInvite token={token} supplierName={state.supplierName} />;
  }
  if (state.status === "wrong_email") {
    return <WrongEmailInvite invitePath={invitePath} maskedEmail={state.maskedEmail} />;
  }
  return <SettledInviteCard state={state} />;
}

function SupplierInvitePage() {
  const { token } = Route.useParams();
  const query = useQuery({
    queryKey: ["supplier-invite", token],
    queryFn: () => getSupplierInviteFn({ data: { token } }),
    retry: false,
  });
  if (query.isPending) {
    return (
      <SupplierPageFrame>
        <InviteSkeleton />
      </SupplierPageFrame>
    );
  }
  if (query.isError) {
    return (
      <SupplierPageFrame>
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </SupplierPageFrame>
    );
  }
  return (
    <SupplierPageFrame>
      <InviteContent token={token} state={query.data} />
    </SupplierPageFrame>
  );
}
