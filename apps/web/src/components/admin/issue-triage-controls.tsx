import { SNOOZE_DAYS, type CustomerIssueKind } from "@sellbridge/shared/schemas";
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
import { Hint } from "@/components/ui/hint";
import { ACTION_ICONS } from "@/components/icons/action-icons";

interface TriageProps {
  userId: string;
  issue: CustomerIssueKind;
  triage: EntryTriage | null;
  adminId: string;
  snoozed: boolean;
}

/** Icon alone on phones; from lg the word sits beside it (admin section 1b, proposals A + C). */
const LABELED = "gap-1.5 lg:w-auto lg:px-2.5";

function ButtonWord({ children }: { children: string }) {
  return <span className="hidden lg:inline">{children}</span>;
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
  const action = isMine ? ACTION_ICONS.releaseIssue : ACTION_ICONS.assignIssue;
  const ActionIcon = action.icon;
  return (
    <Hint label={action.hint} openOnTap={false}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={LABELED}
        aria-label={label}
        disabled={assign.isPending}
        onClick={() => assign.mutate(undefined)}
      >
        <ActionIcon weight="duotone" />
        <ButtonWord>{isMine ? "Devolver" : "Assumir"}</ButtonWord>
      </Button>
    </Hint>
  );
}

const SnoozeIcon = ACTION_ICONS.snoozeIssue.icon;
const UnsnoozeIcon = ACTION_ICONS.unsnoozeIssue.icon;

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
      <Hint label={ACTION_ICONS.unsnoozeIssue.hint} openOnTap={false}>
        <Button
          variant="ghost"
          size="icon-sm"
          className={LABELED}
          aria-label="Trazer de volta à fila"
          disabled={snooze.isPending}
          onClick={() => snooze.mutate(null)}
        >
          <UnsnoozeIcon weight="duotone" />
          <ButtonWord>Trazer de volta</ButtonWord>
        </Button>
      </Hint>
    );
  }
  return (
    <DropdownMenu>
      <Hint label={ACTION_ICONS.snoozeIssue.hint} openOnTap={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={LABELED}
            aria-label="Adiar"
            disabled={snooze.isPending}
          >
            <SnoozeIcon weight="duotone" />
            <ButtonWord>Adiar</ButtonWord>
          </Button>
        </DropdownMenuTrigger>
      </Hint>
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
