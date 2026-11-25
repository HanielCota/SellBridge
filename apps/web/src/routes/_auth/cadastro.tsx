import { internalPathSchema } from "@sellbridge/shared/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignUpPage } from "@/components/auth/sign-up-page";
import { shareMeta } from "@/lib/share-meta";

/** Only a path on this site: an entry link brings the new reseller back to its products. */
const sellerSignUpSearchSchema = z.object({ redirect: internalPathSchema });

export const Route = createFileRoute("/_auth/cadastro")({
  validateSearch: sellerSignUpSearchSchema,
  head: () => ({
    meta: shareMeta({
      title: "Criar conta | SellBridge",
      description:
        "Crie sua conta, escolha atacadistas de todo o Brasil e venda sem estoque no Mercado Livre. Shopee e TikTok Shop em breve.",
    }),
  }),
  component: SellerSignUpPage,
});

function SellerSignUpPage() {
  const { redirect } = Route.useSearch();
  return <SignUpPage initialKind="seller" redirect={redirect} />;
}
