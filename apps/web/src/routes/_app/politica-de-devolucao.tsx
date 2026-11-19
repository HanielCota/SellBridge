import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { ReturnPolicyText } from "@/components/returns/return-policy-text";

export const Route = createFileRoute("/_app/politica-de-devolucao")({
  head: () => ({ meta: [{ title: "Política de devolução | SellBridge" }] }),
  component: ReturnPolicyPage,
});

/** The same policy the suppliers read on their golden rules, for the reseller. */
function ReturnPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Política de devolução"
        description="Quem paga o quê quando o comprador devolve, e o que cada lado faz."
      />
      <section className="surface-card rounded-3xl bg-card p-5 sm:p-6">
        <ReturnPolicyText />
      </section>
    </div>
  );
}
