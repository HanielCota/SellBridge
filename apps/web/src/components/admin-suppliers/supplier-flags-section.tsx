import type { TeamSupplierFlag } from "@sellbridge/database/repositories";
import {
  SUPPLIER_FLAG_REASON_LABELS,
  supplierFlagCountLabel,
} from "@sellbridge/shared/supplier-flags";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { BrokenRuleLine, GoldenRulesList } from "@/components/golden-rules/golden-rules-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HintedText } from "@/components/ui/hint";
import { Skeleton } from "@/components/ui/skeleton";
import { teamFlagDatesLine } from "@/features/admin-suppliers/supplier-flag-copy";
import { supplierFlagsQueryOptions } from "@/features/admin-suppliers/supplier-flags.queries";
import { errorMessage } from "@/lib/errors";
import { ApplyFlagDialog, RevokeFlagDialog } from "./supplier-flag-dialogs";

const COUNTER_HINT =
  "Flags que ainda contam: cada uma vale 90 dias. Na 3ª flag ativa o fornecedor é desligado, depois que quem aplica confirma.";

function FlagRow({
  flag,
  onRevoke,
}: {
  flag: TeamSupplierFlag;
  onRevoke: ((flagId: string) => void) | null;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{SUPPLIER_FLAG_REASON_LABELS[flag.reason]}</p>
        <BrokenRuleLine reason={flag.reason} />
        {flag.note === "" ? null : (
          <p className="text-sm break-words text-muted-foreground">{flag.note}</p>
        )}
        <p className="text-footnote text-muted-foreground">{teamFlagDatesLine(flag)}</p>
        {flag.revokeNote === null ? null : (
          <p className="text-footnote break-words text-muted-foreground">
            Motivo da retirada: {flag.revokeNote}
          </p>
        )}
      </div>
      {onRevoke === null ? null : (
        <Button variant="ghost" size="sm" onClick={() => onRevoke(flag.id)}>
          Retirar flag
        </Button>
      )}
    </li>
  );
}

function FlagHistory({ flags }: { flags: readonly TeamSupplierFlag[] }) {
  if (flags.length === 0) {
    return null;
  }
  return (
    <details className="group border-t border-border/60 pt-3">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
        Histórico <span className="tabular-nums">({flags.length})</span>
        <CaretDownIcon
          className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <ul className="[&>li+li]:border-t [&>li+li]:border-border/60">
        {flags.map((flag) => (
          <FlagRow key={flag.id} flag={flag} onRevoke={null} />
        ))}
      </ul>
    </details>
  );
}

/** The 5 rules beside the flag form, folded like the history so the flags stay first. */
function GoldenRulesReference() {
  return (
    <details className="group border-t border-border/60 pt-3">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
        Regras de ouro do fornecedor
        <CaretDownIcon
          className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <GoldenRulesList />
    </details>
  );
}

/** Three strikes, as the team reads it: out at 3, or back in by an admin's hand. */
function FlagLimitAlert({
  activeCount,
  supplierActive,
}: {
  activeCount: number;
  supplierActive: boolean;
}) {
  if (!supplierActive) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Fornecedor desligado: chegou a {activeCount} flags ativas. Só um administrador reativa a
          conta, pela ficha do fornecedor.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Este fornecedor tem {activeCount} flags ativas e foi reativado. Uma nova flag desliga a
        conta de novo.
      </AlertDescription>
    </Alert>
  );
}

function FlagsHeader({
  activeCount,
  onApply,
}: {
  activeCount: number;
  onApply: (() => void) | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-subhead font-semibold">Flags</h2>
        <p className="text-sm text-muted-foreground">
          <HintedText label={COUNTER_HINT} className="hinted-term">
            {supplierFlagCountLabel(activeCount)}
          </HintedText>
        </p>
      </div>
      {onApply === null ? null : (
        <Button variant="outline" onClick={onApply}>
          Aplicar flag
        </Button>
      )}
    </div>
  );
}

/** What the server hands over for one supplier: its state, its flags and what the viewer may do. */
export interface SupplierFlagsData {
  flags: readonly TeamSupplierFlag[];
  activeCount: number;
  reachedLimit: boolean;
  supplierActive: boolean;
  canManage: boolean;
}

/**
 * The flags themselves, from data already loaded. "Aplicar flag" and "Retirar flag" only appear
 * with `canManage`; an agent gets a read-only list (and the server refuses the calls anyway).
 */
export function SupplierFlagsPanel({
  supplierId,
  data,
}: {
  supplierId: string;
  data: SupplierFlagsData;
}) {
  const [applying, setApplying] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const { flags, activeCount, reachedLimit, supplierActive, canManage } = data;
  const active = flags.filter((flag) => flag.status === "active");
  const past = flags.filter((flag) => flag.status !== "active");
  return (
    <section aria-label="Flags" className="surface-card space-y-4 rounded-3xl bg-card p-5 sm:p-6">
      <FlagsHeader activeCount={activeCount} onApply={canManage ? () => setApplying(true) : null} />
      {reachedLimit ? (
        <FlagLimitAlert activeCount={activeCount} supplierActive={supplierActive} />
      ) : null}
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma flag ativa.</p>
      ) : (
        <ul className="[&>li+li]:border-t [&>li+li]:border-border/60">
          {active.map((flag) => (
            <FlagRow key={flag.id} flag={flag} onRevoke={canManage ? setRevokingId : null} />
          ))}
        </ul>
      )}
      <FlagHistory flags={past} />
      <GoldenRulesReference />
      {canManage ? (
        <>
          <ApplyFlagDialog
            supplierId={supplierId}
            standing={{ activeCount, supplierActive }}
            open={applying}
            onClose={() => setApplying(false)}
          />
          <RevokeFlagDialog
            supplierId={supplierId}
            flagId={revokingId}
            onClose={() => setRevokingId(null)}
          />
        </>
      ) : null}
    </section>
  );
}

/**
 * MVP function 6: the supplier's flags, on its admin record and on the team's flags page
 * (`/admin/fornecedores/<id>/flags`). Loads them itself; see `SupplierFlagsPanel`.
 */
export function SupplierFlagsSection({ supplierId }: { supplierId: string }) {
  const query = useQuery(supplierFlagsQueryOptions(supplierId));
  if (query.isPending) {
    return <Skeleton className="h-32 rounded-3xl" aria-label="Carregando flags" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <SupplierFlagsPanel supplierId={supplierId} data={query.data} />;
}
