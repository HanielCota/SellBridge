import { createFileRoute } from "@tanstack/react-router";
import { SectionCard } from "@/components/layout/section-card";
import { roleLabel } from "@/components/layout/user-menu";
import { AvatarEditor } from "@/components/profile/avatar-editor";
import { PasswordSection } from "@/components/profile/password-form";
import { ProfileNameForm } from "@/components/profile/profile-name-form";
import { SessionsList } from "@/components/profile/sessions-list";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil | SellBridge" }] }),
  component: ProfilePage,
});

const memberSince = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  // Fixed zone so the server render and the browser agree on the month.
  timeZone: "America/Sao_Paulo",
});

interface ProfileHeaderProps {
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

function ProfileHeader({ name, email, role, createdAt }: ProfileHeaderProps) {
  return (
    <div className="min-w-0 space-y-1.5 text-center sm:text-left">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        <h1 className="truncate text-2xl leading-tight font-semibold tracking-tight">{name}</h1>
        <Badge variant="secondary">{roleLabel(role)}</Badge>
      </div>
      <p className="truncate text-sm text-muted-foreground">{email}</p>
      <p className="text-footnote text-muted-foreground">
        Membro desde {memberSince.format(new Date(createdAt))}
      </p>
    </div>
  );
}

function ProfilePage() {
  const { session } = Route.useRouteContext();
  const { user } = session;
  const isImpersonating = session.impersonatedBy !== null;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <section className="surface-card rounded-3xl bg-card p-5 sm:p-6">
        <AvatarEditor name={user.name} image={user.image}>
          <ProfileHeader
            name={user.name}
            email={user.email}
            role={user.role}
            createdAt={user.createdAt}
          />
        </AvatarEditor>
      </section>

      <SectionCard title="Dados pessoais" description="Como você aparece no app.">
        {/* Keyed by name so the field resets when the saved value changes elsewhere. */}
        <ProfileNameForm key={user.name} name={user.name} email={user.email} />
      </SectionCard>

      {isImpersonating ? (
        <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
          Senha e dispositivos conectados ficam ocultos enquanto você usa o app como este cliente.
        </p>
      ) : (
        <>
          <SectionCard
            title="Senha"
            description="Use uma senha longa que você não usa em outros sites."
          >
            <PasswordSection />
          </SectionCard>
          <SectionCard
            title="Dispositivos conectados"
            description="Onde sua conta está aberta. Desconecte o que você não reconhecer."
          >
            <SessionsList />
          </SectionCard>
        </>
      )}
    </div>
  );
}
