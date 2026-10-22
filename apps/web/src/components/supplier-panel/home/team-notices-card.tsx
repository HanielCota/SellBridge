import {
  SUPPLIER_FLAG_LIMIT_WARNING,
  SUPPLIER_FLAG_REASON_EXPLANATIONS,
  SUPPLIER_FLAG_REASON_LABELS,
  supplierFlagCountLabel,
} from "@sellbridge/shared/supplier-flags";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BrokenRuleLine } from "@/components/golden-rules/golden-rules-list";
import { HintedText } from "@/components/ui/hint";
import { supplierNoticeDatesLine } from "@/features/admin-suppliers/supplier-flag-copy";
import type { SupplierHomeTeamNotice } from "@/features/supplier-panel/home/home-types";
import { contestTicketSearch } from "@/features/supplier-panel/home/team-notices-contest";
import { teamNoticesQueryOptions } from "@/features/supplier-panel/home/team-notices.queries";

const COUNTER_HINT =
  "Quantas flags valem agora. Cada flag vale 90 dias e depois some sozinha. Na 3ª flag a conta é desligada.";

const LINK_CLASS_NAME =
  "inline-block text-sm font-medium text-brand-text underline-offset-4 hover:underline";

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
    </li>
  );
}

/** With no flag: one short line about the 5 rules and the way to read them. */
function GoldenRulesTeaser() {
  return (
    <section
      aria-label="Regras de ouro"
      className="surface-card space-y-2 rounded-3xl bg-card p-5 sm:p-6"
    >
      <h2 className="text-lg font-semibold">Regras de ouro</h2>
      <p className="text-sm text-muted-foreground">
        São 5 regras para vender pela SellBridge sem problemas. Quebrar uma pode gerar uma flag, e{" "}
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
 * words, the golden rule each one breaks, and how to contest them. Without flags it shrinks to a
 * line about the golden rules; while loading it shows nothing, so the home never waits on it.
 */
export function TeamNoticesCard({ supplierId }: { supplierId: string }) {
  const query = useQuery(teamNoticesQueryOptions(supplierId));
  if (query.isPending) {
    return null;
  }
  const notices = query.data ?? [];
  if (notices.length === 0) {
    return <GoldenRulesTeaser />;
  }
  return (
    <section
      aria-label="Avisos da equipe"
      className="surface-card space-y-2 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Avisos da equipe</h2>
        <p className="text-sm text-muted-foreground">
          A equipe SellBridge registrou um problema na sua conta de fornecedor.{" "}
          <HintedText label={COUNTER_HINT} className="hinted-term">
            {supplierFlagCountLabel(notices.length)}
          </HintedText>
          . {SUPPLIER_FLAG_LIMIT_WARNING}
        </p>
      </div>
      <ul className="[&>li+li]:border-t [&>li+li]:border-border/60">
        {notices.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link to="/fornecedor/painel/regras" className={LINK_CLASS_NAME}>
          Ver as regras de ouro
        </Link>
        <Link
          to="/suporte/novo"
          search={contestTicketSearch(notices.map((notice) => notice.reason))}
          className={LINK_CLASS_NAME}
        >
          Discorda? Fale com o suporte
        </Link>
      </div>
    </section>
  );
}
