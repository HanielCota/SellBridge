import { createFileRoute } from "@tanstack/react-router";
import { SignUpPage } from "@/components/auth/sign-up-page";
import { shareMeta } from "@/lib/share-meta";

/** Direct link for suppliers (campaigns, team invitations): the sign-up opens on "Quero fornecer". */
export const Route = createFileRoute("/_auth/cadastro_/fornecedor")({
  head: () => ({
    meta: shareMeta({
      title: "Seja fornecedor | SellBridge",
      description:
        "Cadastre seus produtos uma vez e venda por revendedores de todo o Brasil no Mercado Livre, na Shopee e no TikTok Shop.",
    }),
  }),
  component: SupplierSignUpPage,
});

function SupplierSignUpPage() {
  return <SignUpPage initialKind="supplier" />;
}
