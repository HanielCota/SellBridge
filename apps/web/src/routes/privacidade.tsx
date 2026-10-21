import { createFileRoute } from "@tanstack/react-router";
import { type LegalSection, LegalPage } from "@/components/legal/legal-page";

// Versão preliminar escrita a partir dos dados que o produto trata hoje: precisa de revisão
// jurídica (LGPD) antes do lançamento.
const SECTIONS: readonly LegalSection[] = [
  {
    title: "1. Dados que coletamos",
    paragraphs: [
      "Dados da conta: nome, e-mail e senha (guardada apenas como hash, nunca em texto).",
      "Dados do titular: nome completo e CPF, usados nas notas fiscais e nas cobranças da assinatura. O CPF fica restrito a esse uso e não aparece para a nossa equipe de suporte.",
      "Dados de uso do serviço: as lojas que você conecta e o fornecedor de cada uma, anúncios, pedidos, valores de vendas e chamados de suporte com seus anexos.",
      "Acessos aos marketplaces: os tokens de acesso das lojas conectadas, guardados criptografados.",
    ],
  },
  {
    title: "2. Para que usamos",
    paragraphs: [
      "Para operar o serviço: publicar seus anúncios, sincronizar estoque e preço, registrar pedidos, calcular lucro e financeiro e responder ao suporte.",
      "Para segurança da conta, como enviar o link de redefinição de senha.",
      "Para emitir notas fiscais e cobranças em nome do titular da conta, como exige a lei.",
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
      "Em Meu perfil › Seus dados, você baixa uma cópia dos seus dados e exclui a conta. Correções e outros pedidos, como revogar consentimentos, são feitos pelo Suporte dentro do app.",
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
  head: () => ({ meta: [{ title: "Política de privacidade | SellBridge" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidade"
      updatedAt="9 de outubro de 2026"
      intro="Esta política explica quais dados o SellBridge trata, por que e quais são os seus direitos."
      sections={SECTIONS}
    />
  );
}
