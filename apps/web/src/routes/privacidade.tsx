import { createFileRoute } from "@tanstack/react-router";
import { type LegalSection, LegalPage } from "@/components/legal/legal-page";

// Versão preliminar escrita a partir dos dados que o produto trata hoje: precisa de revisão
// jurídica (LGPD) antes do lançamento.
const SECTIONS: readonly LegalSection[] = [
  {
    title: "1. Dados que coletamos",
    paragraphs: [
      "Dados da conta: nome, e-mail e senha (guardada apenas como hash, nunca em texto).",
      "Dados de uso do serviço: sua região, as lojas que você conecta, anúncios, pedidos, valores de vendas e chamados de suporte com seus anexos.",
      "Acessos aos marketplaces: os tokens de acesso das lojas conectadas, guardados criptografados.",
    ],
  },
  {
    title: "2. Para que usamos",
    paragraphs: [
      "Para operar o serviço: publicar seus anúncios, sincronizar estoque e preço, registrar pedidos, calcular lucro e financeiro e responder ao suporte.",
      "Para segurança da conta, como enviar o link de redefinição de senha.",
    ],
  },
  {
    title: "3. Com quem compartilhamos",
    paragraphs: [
      "Com os marketplaces que você conectar, apenas o necessário para executar as ações que você pediu.",
      "Com fornecedores de infraestrutura que nos ajudam a operar o serviço (hospedagem, banco de dados e envio de e-mail). Não vendemos seus dados.",
    ],
  },
  {
    title: "4. Seus direitos (LGPD)",
    paragraphs: [
      "Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados, e revogar consentimentos, pelo Suporte dentro do app.",
    ],
  },
  {
    title: "5. Por quanto tempo guardamos",
    paragraphs: [
      "Guardamos os dados enquanto sua conta estiver ativa. Depois do encerramento, mantemos apenas o que a lei exigir, pelo prazo exigido.",
    ],
  },
  {
    title: "6. Contato",
    paragraphs: ["Fale com a gente sobre privacidade pelo Suporte, dentro do app."],
  },
];

export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: "Política de Privacidade | SellBridge" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      updatedAt="9 de outubro de 2026"
      intro="Esta política explica quais dados o SellBridge trata, por que e quais são os seus direitos."
      sections={SECTIONS}
    />
  );
}
