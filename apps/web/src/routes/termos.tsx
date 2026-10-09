import { createFileRoute } from "@tanstack/react-router";
import { type LegalSection, LegalPage } from "@/components/legal/legal-page";

// Versão preliminar escrita a partir do que o produto faz hoje: precisa de revisão jurídica
// antes do lançamento.
const SECTIONS: readonly LegalSection[] = [
  {
    title: "1. O serviço",
    paragraphs: [
      "O SellBridge é uma plataforma que permite a revendedores encontrar fornecedores da sua região, publicar os produtos deles em marketplaces (como Mercado Livre, Shopee e TikTok Shop) e acompanhar vendas, lucro e financeiro em um só lugar.",
    ],
  },
  {
    title: "2. Sua conta",
    paragraphs: [
      "Para usar o SellBridge você precisa criar uma conta com informações verdadeiras. Você é responsável por manter sua senha em segurança e por toda atividade feita com a sua conta.",
    ],
  },
  {
    title: "3. Lojas conectadas",
    paragraphs: [
      "Ao conectar uma loja de marketplace, você autoriza o SellBridge a acessar essa loja em seu nome para publicar anúncios, atualizar estoque e preço e consultar pedidos. Você pode desconectar uma loja a qualquer momento.",
      "Você continua responsável por seguir as regras de cada marketplace, inclusive sobre os produtos anunciados, preços e prazos.",
    ],
  },
  {
    title: "4. Uso adequado",
    paragraphs: [
      "Não é permitido usar o SellBridge para anunciar produtos ilegais ou proibidos, violar direitos de terceiros ou tentar acessar dados de outras contas.",
    ],
  },
  {
    title: "5. Taxas",
    paragraphs: [
      "Quando houver taxa da plataforma sobre as vendas, ela será informada no app antes de ser aplicada e aparecerá separada no financeiro.",
    ],
  },
  {
    title: "6. Encerramento",
    paragraphs: [
      "Você pode encerrar sua conta pelo Suporte. Podemos suspender contas que violem estes termos.",
    ],
  },
  {
    title: "7. Contato",
    paragraphs: ["Dúvidas sobre estes termos podem ser enviadas pelo Suporte, dentro do app."],
  },
];

export const Route = createFileRoute("/termos")({
  head: () => ({ meta: [{ title: "Termos de Uso | SellBridge" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      updatedAt="9 de outubro de 2026"
      intro="Estes termos explicam as regras para usar o SellBridge. Ao criar uma conta, você concorda com eles."
      sections={SECTIONS}
    />
  );
}
