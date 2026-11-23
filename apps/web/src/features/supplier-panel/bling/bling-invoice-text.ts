import type { InvoiceModel } from "@sellbridge/shared/supplier-invoice";

const AFTER_ENABLING =
  "Pedidos que já chegaram não ganham nota aqui. Para desligar, é só voltar a chave.";

/** What turning on "Nota fiscal pelo Bling" does, in the words of the invoice model chosen. */
export function enableInvoicingDescription(model: InvoiceModel): string {
  if (model === "on_behalf") {
    return `A partir de agora, cada pedido novo seu gera notas fiscais de verdade no seu Bling, enviadas para a SEFAZ: a remessa, que vai na caixa, e a venda para o revendedor. Quando o revendedor vende como pessoa física, sai a nota direta, com o comprador como destinatário. ${AFTER_ENABLING}`;
  }
  return `A partir de agora, cada pedido novo seu gera uma nota fiscal de verdade no seu Bling, enviada para a SEFAZ, com o comprador como destinatário. ${AFTER_ENABLING}`;
}
