import type { ReturnPolicyDetails } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import {
  obligationText,
  RETURN_REASON_LABELS,
  type SupplierVerdict,
} from "@sellbridge/shared/return-policy";
import type { ReactNode } from "react";
import { TonePill } from "@/components/data/tone-status";
import { closeReasonText, returnStepBadge } from "./return-labels";
import { ReturnPhotoList } from "./return-photos";

export type ReturnViewer = "seller" | "supplier" | "team";

/** The supplier's answer, worded for whoever reads it. */
const VERDICT_TEXT: Record<ReturnViewer, Record<SupplierVerdict, string>> = {
  seller: {
    as_described: "Está como você contou",
    not_as_described: "Não está como você contou",
    not_received: "O pacote não chegou ao fornecedor",
  },
  supplier: {
    as_described: "Você confirmou: está como o revendedor contou",
    not_as_described: "Você respondeu: não está como o revendedor contou",
    not_received: "Você avisou que o pacote não chegou",
  },
  team: {
    as_described: "Fornecedor confirmou o que o revendedor contou",
    not_as_described: "Fornecedor discorda do revendedor",
    not_received: "Fornecedor diz que o pacote não chegou",
  },
};

export function ReturnStepPill({ policy }: { policy: ReturnPolicyDetails }) {
  const badge = returnStepBadge(policy);
  return <TonePill tone={badge.tone} label={badge.label} timeBased />;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-footnote text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** What the reseller said: the reason, the buyer's words, the label cost and the photos. */
export function StatedReason({ policy, title }: { policy: ReturnPolicyDetails; title: string }) {
  if (policy.reason === null) {
    return null;
  }
  return (
    <section className="grid gap-2 rounded-2xl bg-muted px-4 py-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <dl className="grid gap-2">
        <Fact label="Motivo">{RETURN_REASON_LABELS[policy.reason]}</Fact>
        {policy.reasonNote === null || policy.reasonNote === "" ? null : (
          <Fact label="O que o comprador disse">{policy.reasonNote}</Fact>
        )}
        {policy.returnShippingCents === null ? null : (
          <Fact label="Frete de volta cobrado pelo Mercado Livre">
            {formatCents(policy.returnShippingCents)}
          </Fact>
        )}
      </dl>
      <ReturnPhotoList
        photos={policy.photos.filter((photo) => photo.side === "seller")}
        label="Fotos do revendedor"
      />
    </section>
  );
}

/** What the supplier found when the parcel arrived, with its photos. */
export function SupplierFinding({
  policy,
  viewer,
}: {
  policy: ReturnPolicyDetails;
  viewer: ReturnViewer;
}) {
  if (policy.supplierVerdict === null) {
    return null;
  }
  return (
    <section className="grid gap-2 rounded-2xl bg-muted px-4 py-3">
      <h4 className="text-sm font-semibold">{VERDICT_TEXT[viewer][policy.supplierVerdict]}</h4>
      <dl className="grid gap-2">
        {policy.supplierCondition === null || policy.supplierCondition === "" ? null : (
          <Fact label="Como o produto chegou">{policy.supplierCondition}</Fact>
        )}
        {policy.supplierResellable === null ? null : (
          <Fact label="Dá para vender de novo?">{policy.supplierResellable ? "Sim" : "Não"}</Fact>
        )}
      </dl>
      <ReturnPhotoList
        photos={policy.photos.filter((photo) => photo.side === "supplier")}
        label="Fotos do fornecedor"
      />
    </section>
  );
}

/**
 * How a closed return ended: what the supplier owes (recorded, not paid yet) or why nothing is
 * owed, and whether the units went back on the shelf.
 */
export function ClosedOutcome({
  policy,
  status,
  creditedCents,
  refusalReason,
}: {
  policy: ReturnPolicyDetails;
  status: string;
  creditedCents: number | null;
  refusalReason: string | null;
}) {
  if (policy.step !== "closed") {
    return null;
  }
  const owed =
    status === "credited"
      ? `${obligationText({
          costCents: creditedCents ?? 0,
          shippingCents: policy.supplierOwesShippingCents ?? 0,
        })}. Valor anotado; o acerto do dinheiro é feito depois.`
      : `Fornecedor não deve nada${refusalReason === null ? "" : `: ${refusalReason}`}.`;
  return (
    <section className="grid gap-1 rounded-2xl border border-border px-4 py-3 text-sm">
      <p className="font-semibold">{closeReasonText(policy.closeReason)}</p>
      <p>{owed}</p>
      {policy.stockReturnedAt === null ? null : (
        <p className="text-muted-foreground">O estoque do fornecedor voltou para venda.</p>
      )}
    </section>
  );
}
