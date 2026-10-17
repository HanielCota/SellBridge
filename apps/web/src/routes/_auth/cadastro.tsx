import { createFileRoute } from "@tanstack/react-router";
import { SignUpPage } from "@/components/auth/sign-up-page";
import { shareMeta } from "@/lib/share-meta";

export const Route = createFileRoute("/_auth/cadastro")({
  head: () => ({
    meta: shareMeta({
      title: "Criar conta | SellBridge",
      description:
        "Crie sua conta, escolha atacadistas de todo o Brasil e venda sem estoque no Mercado Livre, na Shopee e no TikTok Shop.",
    }),
  }),
  component: SellerSignUpPage,
});

function SellerSignUpPage() {
  return <SignUpPage initialKind="seller" />;
}
