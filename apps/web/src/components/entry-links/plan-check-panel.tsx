import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { PlanCheck } from "@/features/entry-links/entry-choice";
import type { PlanRoom } from "@/features/billing/plan-room";
import { pluralize } from "@/components/catalog/bulk-publish-parts";

function PlanNumber({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ChangePlanLink({ label }: { label: string }) {
  return (
    <Button asChild variant="outline" className="min-h-11">
      <Link to="/assinatura">{label}</Link>
    </Button>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
      {children}
    </p>
  );
}

function PlanVerdict({ check }: { check: PlanCheck }) {
  if (check.kind === "no_plan") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Warning>Para publicar anúncios, escolha um plano.</Warning>
        <ChangePlanLink label="Escolher plano" />
      </div>
    );
  }
  if (check.kind === "short") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Warning>
          Faltam {pluralize(check.short, "anúncio", "anúncios")} no seu plano. Desmarque{" "}
          {pluralize(check.productsToUntick, "produto", "produtos")} ou mude de plano.
        </Warning>
        <ChangePlanLink label="Mudar de plano" />
      </div>
    );
  }
  if (check.kind === "fits") {
    return (
      <p className="text-sm text-muted-foreground">
        Cabe no seu plano. Depois ainda sobram {pluralize(check.leftAfter, "anúncio", "anúncios")}.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">Seu plano não tem limite de anúncios agora.</p>
  );
}

/** What the plan allows, what is used and what the ticked products would use, before preparing. */
export function PlanCheckPanel({
  room,
  check,
  productCount,
  storeCount,
}: {
  room: PlanRoom;
  check: PlanCheck;
  productCount: number;
  storeCount: number;
}) {
  return (
    <section
      aria-labelledby="plan-check-title"
      className="space-y-3 rounded-2xl border bg-card p-4"
    >
      <h2 id="plan-check-title" className="font-semibold">
        {room.kind === "plan" ? `Seu plano: ${room.planName}` : "Seu plano"}
      </h2>
      {room.kind === "plan" ? (
        <div className="grid grid-cols-3 gap-2">
          <PlanNumber label="Permite" value={String(room.allowed.listings)} />
          <PlanNumber label="Você já tem" value={String(room.used.listings)} />
          <PlanNumber label="Esta escolha" value={String(check.listings)} />
        </div>
      ) : null}
      <p className="text-sm">
        {storeCount === 0
          ? "Nenhuma loja do Mercado Livre conectada vende este fornecedor ainda."
          : `${pluralize(productCount, "produto", "produtos")} em ${pluralize(storeCount, "loja", "lojas")} do Mercado Livre = ${pluralize(check.listings, "anúncio", "anúncios")}.`}
      </p>
      <PlanVerdict check={check} />
    </section>
  );
}
