import { CheckCircleIcon, WarningIcon } from "@phosphor-icons/react";
import {
  SUPPLIER_FLAG_LIMIT,
  SUPPLIER_FLAG_LIMIT_WARNING,
  SUPPLIER_FLAG_REASON_EXPLANATIONS,
  SUPPLIER_FLAG_REASON_LABELS,
  supplierFlagCountLabel,
} from "@sellbridge/shared/supplier-flags";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BrokenRuleLine } from "@/components/golden-rules/golden-rules-list";
import { HighlightBadge } from "@/components/suppliers/reputation";
import { HintedText } from "@/components/ui/hint";
import { supplierNoticeDatesLine } from "@/features/admin-suppliers/supplier-flag-copy";
import type { SupplierHomeTeamNotice } from "@/features/supplier-panel/home/home-types";
import { contestTicketSearch } from "@/features/supplier-panel/home/team-notices-contest";
import { teamNoticesQueryOptions } from "@/features/supplier-panel/home/team-notices.queries";
import { cn } from "@/lib/utils";

const COUNTER_HINT =
  "Quantas flags valem agora. Cada flag vale 90 dias e depois some sozinha. Na 3ª flag a conta é desligada.";

const LINK_CLASS_NAME =
  "inline-block text-sm font-medium text-brand-text underline-offset-4 hover:underline";

/** Amber while flags count, red once the account is off: 1 of 3 and 3 of 3 must not look alike. */
function noticesTone(active: boolean) {
  if (!active) {
    return { card: "border border-destructive/30", text: "text-destructive" };
  }
  return { card: "border border-amber-500/30", text: "text-amber-700 dark:text-amber-300" };
}

/** What is left before the account is switched off, said only when it is one flag away. */
function remainingLine(count: number, active: boolean): string | null {
  if (!active) {
    return "A conta está desligada.";
  }
  if (SUPPLIER_FLAG_LIMIT - count === 1) {
    return "Falta 1 flag para a conta ser desligada.";
  }
  return null;
}

function NoticeRow({ notice }: { notice: SupplierHomeTeamNotice }) {
  return (
    <li className="space-y-1 py-3">
      <p className="text-sm font-medium">{SUPPLIER_FLAG_REASON_LABELS[notice.reason]}</p>
      <BrokenRuleLine reason={notice.reason} />
      <p className="text-sm text-muted-foreground">
        {SUPPLIER_FLAG_REASON_EXPLANATIONS[notice.reason]}
      </p>
      {notice.note === "" ? null : (
        <p className="text-sm break-words">
          <span className="font-medium">Observação da equipe:</span> {notice.note}
        </p>
      )}
      <p className="text-footnote text-muted-foreground">{supplierNoticeDatesLine(notice)}</p>
      <Link to="/suporte/novo" search={contestTicketSearch(notice)} className={LINK_CLASS_NAME}>
        Contestar esta flag
      </Link>
    </li>
  );
}

/** With no flag: the account is in good standing, the badge when it has one, and the 5 rules. */
function GoodStandingCard({ highlighted }: { highlighted: boolean }) {
  return (
    <section
      aria-label="Sua conta"
      className="surface-card space-y-2 rounded-3xl border border-emerald-500/25 bg-card p-5 sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CheckCircleIcon
          weight="fill"
          aria-hidden="true"
          className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
        />
        Nenhuma flag: sua conta está em dia
      </h2>
      {highlighted ? <HighlightBadge /> : null}
      <p className="text-sm text-muted-foreground">
        Continue seguindo as 5 regras de ouro. Quebrar uma pode gerar uma flag, e{" "}
        {SUPPLIER_FLAG_LIMIT_WARNING.toLowerCase()}
      </p>
      <Link to="/fornecedor/painel/regras" className={LINK_CLASS_NAME}>
        Ver as 5 regras
      </Link>
    </section>
  );
}

/**
 * "Avisos da equipe" on the supplier's home (MVP function 6): the flags that count now, in plain
 * words, the golden rule each one breaks and a way to contest each. Without flags it turns into
 * a green "em dia" card; while loading or on an error it shows nothing, so the home never waits
 * on it.
 */
export function TeamNoticesCard({
  supplierId,
  active,
  highlighted,
}: {
  supplierId: string;
  active: boolean;
  highlighted: boolean;
}) {
  const query = useQuery(teamNoticesQueryOptions(supplierId));
  // Loading or failed: nothing, never the green card, which would tell a flagged supplier it has none.
  const notices = query.data;
  if (notices === undefined) {
    return null;
  }
  if (notices.length === 0 && active) {
    return <GoodStandingCard highlighted={highlighted} />;
  }
  const tone = noticesTone(active);
  const remaining = remainingLine(notices.length, active);
  return (
    <section
      aria-label="Avisos da equipe"
      className={cn("surface-card space-y-2 rounded-3xl bg-card p-5 sm:p-6", tone.card)}
    >
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <WarningIcon
            weight="fill"
            aria-hidden="true"
            className={cn("size-5 shrink-0", tone.text)}
          />
          Avisos da equipe
        </h2>
        <p className="text-sm text-muted-foreground">
          A equipe SellBridge registrou um problema na sua conta de fornecedor.{" "}
          <HintedText label={COUNTER_HINT} className="hinted-term">
            {supplierFlagCountLabel(notices.length)}
          </HintedText>
          . {SUPPLIER_FLAG_LIMIT_WARNING}
        </p>
        {remaining === null ? null : (
          <p className={cn("text-sm font-semibold", tone.text)}>{remaining}</p>
        )}
      </div>
      <ul className="[&>li+li]:border-t [&>li+li]:border-border/60">
        {notices.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} />
        ))}
      </ul>
      <Link to="/fornecedor/painel/regras" className={LINK_CLASS_NAME}>
        Ver as regras de ouro
      </Link>
    </section>
  );
}
