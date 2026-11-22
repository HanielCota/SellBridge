import { contractFor } from "@sellbridge/shared/contract-documents";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AuthPageHeader } from "@/components/auth/auth-page";
import { AuthShell } from "@/components/auth/auth-shell";
import { ContractDocumentPage } from "@/components/contract-signing/contract-document-page";
import { buttonVariants } from "@/components/ui/button";
import { getAppSession } from "@/features/auth/session.functions";
import { supplierContractAccess } from "@/features/contract-signing/contract-gate";

const CONTRACT = contractFor("supplier");

/** Only suppliers and the team read it: the text states SellBridge's fee (`supplierContractAccess`). */
export const Route = createFileRoute("/contrato/fornecedor")({
  head: () => ({ meta: [{ title: `${CONTRACT.title} | SellBridge` }] }),
  beforeLoad: async ({ location }) => {
    const access = supplierContractAccess(await getAppSession());
    if (access === "sign_in") {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { access };
  },
  component: SupplierContractPage,
});

function SupplierContractPage() {
  const { access } = Route.useRouteContext();
  if (access !== "allowed") {
    return <SupplierOnlyNotice />;
  }
  return <ContractDocumentPage contract={CONTRACT} />;
}

function SupplierOnlyNotice() {
  return (
    <AuthShell>
      <div className="space-y-8">
        <AuthPageHeader
          title="Este contrato é só para fornecedores"
          description="Ele vale para quem fornece os produtos. Quem revende segue o contrato de vendedor."
        />
        <div className="grid gap-2">
          <Link to="/dashboard" className={buttonVariants({ className: "min-h-11 w-full" })}>
            Voltar ao painel
          </Link>
          <Link
            to="/contrato/vendedor"
            className={buttonVariants({ variant: "ghost", className: "min-h-11 w-full" })}
          >
            Ler o contrato de vendedor
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
