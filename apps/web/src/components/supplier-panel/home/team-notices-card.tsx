import {
  SUPPLIER_FLAG_REASON_EXPLANATIONS,
  SUPPLIER_FLAG_REASON_LABELS,
  supplierFlagCountLabel,
} from "@sellbridge/shared/supplier-flags";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HintedText } from "@/components/ui/hint";
import { supplierNoticeDatesLine } from "@/features/admin-suppliers/supplier-flag-copy";
import type { SupplierHomeTeamNotice } from "@/features/supplier-panel/home/home-types";
import { contestTicketSearch } from "@/features/supplier-panel/home/team-notices-contest";
import { teamNoticesQueryOptions } from "@/features/supplier-panel/home/team-notices.queries";

const COUNTER_HINT =
  "Quantos avisos valem agora. Cada aviso vale 90 dias e depois some sozinho. Nada muda na sua conta por causa deles.";

function NoticeRow({ notice }: { notice: SupplierHomeTeamNotice }) {
  return (
    <li className="space-y-1 py-3">
      <p className="text-sm font-medium">{SUPPLIER_FLAG_REASON_LABELS[notice.reason]}</p>
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

/**
 * "Avisos da equipe" on the supplier's home (MVP function 6): the flags that count now, in plain
 * words, and how to contest them. Hidden when there is none, and while loading or on an error,
 * so the rest of the home never waits on it.
 */
export function TeamNoticesCard({ supplierId }: { supplierId: string }) {
  const query = useQuery(teamNoticesQueryOptions(supplierId));
  const notices = query.data ?? [];
  if (notices.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Avisos da equipe"
      className="surface-card space-y-2 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Avisos da equipe</h2>
        <p className="text-sm text-muted-foreground">
          A equipe SellBridge registrou um problema com a sua loja.{" "}
          <HintedText label={COUNTER_HINT} className="hinted-term">
            {supplierFlagCountLabel(notices.length)}
          </HintedText>
          .
        </p>
      </div>
      <ul className="[&>li+li]:border-t [&>li+li]:border-border/60">
        {notices.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} />
        ))}
      </ul>
      <Link
        to="/suporte/novo"
        search={contestTicketSearch(notices.map((notice) => notice.reason))}
        className="inline-block text-sm font-medium text-brand-text underline-offset-4 hover:underline"
      >
        Discorda? Fale com o suporte
      </Link>
    </section>
  );
}
