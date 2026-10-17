import type { StaffMember } from "@sellbridge/database/repositories";
import { STAFF_ROLE_LABELS, staffRoleOf } from "@sellbridge/shared/staff-access";
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PaperPlaneTiltIcon, UserPlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus, type StatusTone } from "@/components/data/tone-status";
import { TeamInviteDialog } from "@/components/admin/team-invite-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminListTeam, adminResendTeamInvite } from "@/features/admin/team.functions";
import { errorMessage } from "@/lib/errors";
import { initials } from "@/lib/initials";
import { prefetchOnServer } from "@/lib/prefetch";

const teamQueryOptions = () => queryOptions({ queryKey: ["team"], queryFn: () => adminListTeam() });

export const Route = createFileRoute("/_app/admin/equipe")({
  loader: ({ context }) => prefetchOnServer(context.queryClient, teamQueryOptions()),
  head: () => ({ meta: [{ title: "Equipe | SellBridge" }] }),
  component: TeamPage,
});

type MemberState = "active" | "invited" | "blocked";

const STATE_TONE: Record<MemberState, { tone: StatusTone; label: string }> = {
  active: { tone: "success", label: "Ativa" },
  invited: { tone: "info", label: "Convite enviado" },
  blocked: { tone: "danger", label: "Bloqueada" },
};

function memberState(member: StaffMember): MemberState {
  if (member.banned) {
    return "blocked";
  }
  return member.lastSeenAt === null ? "invited" : "active";
}

function roleLabel(role: string): string {
  const staffRole = staffRoleOf(role);
  return staffRole === null ? role : STAFF_ROLE_LABELS[staffRole];
}

function MemberIdentity({ member }: { member: StaffMember }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium"
        aria-hidden="true"
      >
        {initials(member.name)}
      </span>
      <div className="min-w-0">
        <Link
          to="/admin/clientes/$userId"
          params={{ userId: member.id }}
          className="block truncate font-medium underline-offset-4 hover:underline"
        >
          {member.name}
        </Link>
        <p className="truncate text-footnote text-muted-foreground">{member.email}</p>
      </div>
    </div>
  );
}

function ResendInvite({ member, canInvite }: { member: StaffMember; canInvite: boolean }) {
  const resend = useMutation({
    mutationFn: async () => adminResendTeamInvite({ data: { userId: member.id } }),
    onSuccess: () => toast.success(`Convite reenviado para ${member.email}`),
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (!canInvite || memberState(member) !== "invited") {
    return null;
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={resend.isPending}
      onClick={() => resend.mutate()}
      aria-label={`Reenviar convite para ${member.name}`}
    >
      <PaperPlaneTiltIcon aria-hidden="true" />
      Reenviar convite
    </Button>
  );
}

const columnHelper = createServerColumnHelper<StaffMember & { canInvite: boolean }>();
const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Pessoa",
    cell: (info) => <MemberIdentity member={info.row.original} />,
  }),
  columnHelper.accessor("role", {
    header: "Cargo",
    cell: (info) => roleLabel(info.getValue()),
  }),
  columnHelper.display({
    id: "state",
    header: "Situação",
    cell: (info) => <ToneStatus {...STATE_TONE[memberState(info.row.original)]} />,
  }),
  columnHelper.accessor("lastSeenAt", {
    header: "Último acesso",
    cell: (info) => {
      const seen = info.getValue();
      return seen === null ? (
        <span className="text-muted-foreground">Ainda não entrou</span>
      ) : (
        <SmartDate date={seen} className="whitespace-nowrap text-muted-foreground" />
      );
    },
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Ações</span>,
    cell: (info) => (
      <ResendInvite member={info.row.original} canInvite={info.row.original.canInvite} />
    ),
  }),
]);

function MobileMemberRow({ member }: { member: StaffMember & { canInvite: boolean } }) {
  return (
    <div className="space-y-3">
      <MemberIdentity member={member} />
      <div className="flex flex-wrap items-center justify-between gap-2 pl-12">
        <p className="flex items-center gap-3 text-sm">
          {roleLabel(member.role)}
          <ToneStatus {...STATE_TONE[memberState(member)]} />
        </p>
        <ResendInvite member={member} canInvite={member.canInvite} />
      </div>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="surface-card space-y-4 rounded-3xl bg-card p-5" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-28 md:block" />
        </div>
      ))}
    </div>
  );
}

function InviteButton({ canInvite, onClick }: { canInvite: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={!canInvite}
      title={canInvite ? undefined : "Só um dono da plataforma convida pessoas para a equipe"}
    >
      <UserPlusIcon aria-hidden="true" />
      Convidar pessoa
    </Button>
  );
}

function TeamList({ onInvite }: { onInvite: () => void }) {
  const query = useQuery(teamQueryOptions());
  if (query.isPending) {
    return <TeamSkeleton />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const { members, canInvite } = query.data;
  if (members.length === 0) {
    return (
      <EmptyState
        icon={UsersThreeIcon}
        title="Ninguém na equipe ainda"
        description="Convide quem vai responder os chamados e cuidar dos clientes."
        action={<InviteButton canInvite={canInvite} onClick={onInvite} />}
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={members.map((member) => ({ ...member, canInvite }))}
      getRowId={(row) => row.id}
      caption="Equipe do SellBridge"
      renderMobileRow={(row) => <MobileMemberRow member={row} />}
    />
  );
}

function TeamPage() {
  const [inviting, setInviting] = useState(false);
  const query = useQuery(teamQueryOptions());
  const canInvite = query.data?.canInvite ?? false;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe"
        description="Quem atende os chamados e cuida dos clientes, com o cargo de cada pessoa."
        actions={<InviteButton canInvite={canInvite} onClick={() => setInviting(true)} />}
      />
      <TeamList onInvite={() => setInviting(true)} />
      <TeamInviteDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
