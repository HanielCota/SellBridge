import { createFileRoute } from "@tanstack/react-router";
import { roleLabel } from "@/components/layout/user-menu";
import { AvatarEditor } from "@/components/profile/avatar-editor";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil | SellBridge" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session } = Route.useRouteContext();
  const { user } = session;
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 py-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">Sua foto aparece no topo do app.</p>
      </div>
      <Card>
        <CardContent className="space-y-6">
          <AvatarEditor name={user.name} image={user.image} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-border pt-5 text-sm">
            <dt className="text-muted-foreground">Nome</dt>
            <dd className="truncate font-medium">{user.name}</dd>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="truncate">{user.email}</dd>
            <dt className="text-muted-foreground">Perfil</dt>
            <dd>{roleLabel(user.role)}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
