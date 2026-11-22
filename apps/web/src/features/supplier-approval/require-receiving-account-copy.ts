/**
 * What saving "Exigir conta de recebimento para aprovar" changes, written before the click; null
 * when the switch is as saved, so there is nothing to save.
 */
export function requireReceivingAccountConsequence(input: {
  saved: boolean;
  chosen: boolean;
}): string | null {
  if (input.saved === input.chosen) {
    return null;
  }
  if (input.chosen) {
    return "Quem se cadastrar sozinho como fornecedor só é aprovado depois que a conta de recebimento dele for aprovada no Asaas. Fornecedores já aprovados continuam como estão.";
  }
  return "Quem se cadastrar sozinho como fornecedor volta a ser aprovado só com o CNPJ ativo na Receita, mesmo sem a conta de recebimento.";
}
