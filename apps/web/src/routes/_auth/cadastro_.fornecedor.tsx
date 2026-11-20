import { internalPathSchema } from "@sellbridge/shared/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignUpPage } from "@/components/auth/sign-up-page";
import { shareMeta } from "@/lib/share-meta";

/** Only a path on this site: an invite sends the person back to itself after the sign-up. */
const supplierSignUpSearchSchema = z.object({ redirect: internalPathSchema });

/** Direct link for suppliers (campaigns, team invitations): the sign-up opens on "Quero fornecer". */
export const Route = createFileRoute("/_auth/cadastro_/fornecedor")({
  validateSearch: supplierSignUpSearchSchema,
  head: () => ({
    meta: shareMeta({
      title: "Seja fornecedor | SellBridge",
      description:
        "Cadastre seus produtos uma vez e venda por revendedores de todo o Brasil no Mercado Livre. Shopee e TikTok Shop em breve.",
    }),
  }),
  component: SupplierSignUpPage,
});

function SupplierSignUpPage() {
  const { redirect } = Route.useSearch();
  return <SignUpPage initialKind="supplier" redirect={redirect} />;
}
