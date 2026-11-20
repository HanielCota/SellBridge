# 2026-11-19: XML da nota de venda do revendedor e trava da etiqueta

Na venda à ordem pelo Mercado Livre, o revendedor envia ao SellBridge o XML da nota de venda (nota 1), e o SellBridge passa esse XML ao Mercado Livre. Escolhido pelo Guilherme em 19/11/2026 ("Aceitar o XML").

- **Por quê:** o Mercado Livre só aceita a nota pelo XML completo (`POST /shipments/{id}/invoice_data`). A chave digitada não chega lá, e sem a nota no Mercado Livre a etiqueta não sai.
- **O que o SellBridge confere antes de enviar:**
  - o arquivo é uma NF-e autorizada (com `nfeProc` e protocolo, situação 100 ou 150);
  - a chave do protocolo é a mesma da nota;
  - a nota é da empresa do revendedor (o CNPJ da chave);
  - o pedido não tem outra nota de venda registrada.
  - O limite é de 1 MB.
- **Recusa do Mercado Livre:** os motivos conhecidos (CNPJ, CEP, estado de origem, situação da nota, nota repetida) aparecem em português no cartão. Nada fica salvo quando o Mercado Livre recusa.
- **Trava da etiqueta:** na venda à ordem, a etiqueta espera:
  - a nota de venda do revendedor;
  - no Mercado Livre, também essa nota no Mercado Livre;
  - a nota de remessa autorizada do fornecedor, que vai na caixa.
- **Fora dos outros marketplaces:** a chave digitada continua valendo.
- **Descartado:** só a chave digitada no Mercado Livre (não chega lá) e liberar a etiqueta sem a nota de venda (o pacote sairia sem a nota que o Mercado Livre cobra).
- **Fora desta etapa:** a emissão automática da nota 1 pelo Bling do revendedor (parte 6).
- **Antes de abrir para todos:** um pedido real de teste no Mercado Livre, porque o CEP de origem da nota pode não bater com o do envio (`wrong_sender_zipcode`).
