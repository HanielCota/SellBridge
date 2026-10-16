import { SNOOZE_DAYS, type CustomerIssueKind } from "@sellbridge/shared/schemas";
import {
  ArrowCounterClockwiseIcon,
  ClockCountdownIcon,
  UserCheckIcon,
  UserMinusIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  adminAssignCustomerIssue,
  adminSnoozeCustomerIssue,
} from "@/features/admin/customers.functions";
import type { EntryTriage } from "@/features/admin/customer-ranking";
import { useAdminAction } from "@/features/admin/use-admin-action";

interface TriageProps {
  userId: string;
  issue: CustomerIssueKind;
  triage: EntryTriage | null;
  adminId: string;
  snoozed: boolean;
}

function plural(days: number): string {
  return `${days} ${days === 1 ? "dia" : "dias"}`;
}

function AssignButton({ userId, issue, triage, adminId }: Omit<TriageProps, "snoozed">) {
  const isMine = triage?.assigneeId === adminId;
  const assign = useAdminAction(
    () => adminAssignCustomerIssue({ data: { userId, issue, take: !isMine } }),
    isMine ? "Pendência devolvida para a equipe" : "Pendência atribuída a você",
  );
  const label = isMine ? "Devolver para a equipe" : "Assumir";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={assign.isPending}
      onClick={() => assign.mutate(undefined)}
    >
      {isMine ? <UserMinusIcon weight="duotone" /> : <UserCheckIcon weight="duotone" />}
    </Button>
  );
}

function SnoozeControl({
  userId,
  issue,
  snoozed,
}: Pick<TriageProps, "userId" | "issue" | "snoozed">) {
  const snooze = useAdminAction(
    (days: number | null) => adminSnoozeCustomerIssue({ data: { userId, issue, days } }),
    snoozed ? "Pendência de volta à fila" : "Pendência adiada",
  );
  if (snoozed) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Trazer de volta à fila"
        title="Trazer de volta à fila"
        disabled={snooze.isPending}
        onClick={() => snooze.mutate(null)}
      >
        <ArrowCounterClockwiseIcon weight="duotone" />
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Adiar"
          title="Adiar"
          disabled={snooze.isPending}
        >
          <ClockCountdownIcon weight="duotone" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Adiar por</DropdownMenuLabel>
        {SNOOZE_DAYS.map((days) => (
          <DropdownMenuItem
            key={days}
            className="text-foreground"
            onSelect={() => snooze.mutate(days)}
          >
            {plural(days)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * How the team handles an issue in the shared queue: take it so nobody else works on it, or
 * snooze it for a few days when it is waiting on the customer.
 */
export function IssueTriageControls(props: TriageProps) {
  return (
    <span className="flex shrink-0 items-center">
      <AssignButton
        userId={props.userId}
        issue={props.issue}
        triage={props.triage}
        adminId={props.adminId}
      />
      <SnoozeControl userId={props.userId} issue={props.issue} snoozed={props.snoozed} />
    </span>
  );
}
