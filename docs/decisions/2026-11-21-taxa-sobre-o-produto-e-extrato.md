# 2026-11-21: Taxa do SellBridge só sobre o produto, fora da vista do revendedor, e extrato do fornecedor

**Decisão:** a taxa do SellBridge em cada pagamento ao fornecedor é calculada só sobre o preço dos produtos, nunca sobre o frete, e não aparece em nenhuma tela, mensagem ou texto do revendedor. O fornecedor ganha um extrato no painel com o valor de cada pedido, a taxa e o que sobra para ele. Guilherme, 21/11/2026, na Central, sobre o plano em três partes: "Aprovo os quatro".

Vem da lista do que os contratos de Fornecedor e de Vendedor exigem da plataforma (texto do cliente de 20/11/2026, seção 4): "4% calculados só sobre o preço do produto, sem frete" e "os 4% não aparecem para o revendedor". Os contratos ainda esperam o advogado e o contador; o valor da taxa continua no admin (Configurações), 4% no lançamento.

## Parte 1 (este registro): a base da taxa e o que o revendedor vê

- **A base já era só o produto.** O revendedor paga ao fornecedor o custo de cada item vezes a quantidade (`findPayableShipment`, `packages/database/src/repositories/supplier-payments.ts`). O frete do pedido (`orders.total_cents` com o frete do comprador e `orders.seller_shipping_cents`, o que o revendedor paga ao Mercado Livre) nunca entra nesse valor, e a taxa sai dele (`platformFeeCents`, `packages/shared/src/domain/shipment-payments.ts`). Nada mudou no cálculo: a regra ficou escrita no código e coberta por testes (produto só, pedido com frete, frete grátis, arredondamento de centavos e o mesmo pagamento no Asaas simulado).
- **Arredondamento:** para o centavo mais próximo, com meio centavo subindo (4% de R$ 59,90 = R$ 2,40; 4% de R$ 12,34 = R$ 0,49). Pagamento de 1 centavo não tem taxa.
- **Pedidos antigos não mudam.** Cada pagamento guarda a taxa com que foi cobrado (`platform_fee_cents` e `platform_fee_basis_points`). Um pagamento pago, em análise ou devolvido não é refeito quando o admin muda a taxa; um pendente cuja cobrança expirou usa a taxa nova na próxima cobrança, como antes.
- **O que o revendedor deixou de ver:** a frase "a plataforma cobra X% de cada venda" na tela do plano (e o número deixou de ir para essa tela); a menção à tarifa do SellBridge nas dicas de "Taxas" do Financeiro e na regra de lucro do relatório; a menção na descrição da API pública (`platformFeeCents` continua, sempre 0, e o preço mínimo da publicação fala só das taxas do marketplace). O total que ele paga ao fornecedor continua aparecendo igual.
- **Trava:** o teste `apps/web/src/features/supplier-payments/reseller-fee-silence.test.ts` lê os textos do site, do worker e do pacote compartilhado e falha se algum, fora das telas do fornecedor e da equipe, falar da taxa do SellBridge.
- **Fica de fora, de propósito:** os termos de uso (`/termos`, seção 5) falam de taxa da plataforma e ficam como estão até o advogado entregar o texto dos contratos (Guilherme, 21/11). Também não muda quando o dinheiro é liberado: o contrato fala em "direto ao fornecedor no momento do pagamento", o sistema guarda até a entrega (pedido anterior do cliente, contra golpe), e isso está com o advogado.

## Descartado

- **Cobrar a taxa sobre o total do pedido no marketplace.** O revendedor não paga ao fornecedor o preço de venda nem o frete; a taxa sobre o total cobraria do fornecedor um valor que não passa por ele.
- **Esconder a taxa só na tela do plano.** Ela também aparecia no Financeiro, no relatório e na API; o teste que procura impede que volte por outro texto.
