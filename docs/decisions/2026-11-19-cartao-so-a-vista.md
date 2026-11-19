# Cartão só à vista por enquanto, sem parcelamento (19/11/2026)

**Decisão:** o revendedor paga o fornecedor com Pix ou com cartão à vista, como já funciona. O parcelamento no cartão fica para depois. Guilherme, 19/11/2026, no chat da Central: "Vamos seguir assim então".

Isso muda a decisão de 18/11/2026, que previa cartão parcelado com juros pagos por quem paga.

## Por quê

- **O fornecedor esperaria meses:** no cartão parcelado, o Asaas paga uma parcela a cada 32 dias. O cliente (StockShopp) é o fornecedor e receberia o valor do envio em vários meses. Para receber tudo de uma vez, precisaria antecipar, o que é pago à parte e depende de análise de crédito do Asaas.
- **O cliente não pediu parcelamento:** pediu "Pix ou cartão".
- **A falta de dinheiro do revendedor tem outra solução:** a carteira pré-paga, que está planejada.

## Se o parcelamento voltar

- **Números já combinados, todos editáveis no admin:**
  - até 3 parcelas;
  - parcela mínima de R$ 30,00;
  - juros de 2,99% ao mês, pagos pelo revendedor.
- **Como fazer:** o Asaas não tem campo para cobrar os juros do pagador. O SellBridge calcula os juros e cria a cobrança parcelada (`installmentCount` e `totalValue`) com o total já com juros. A taxa do SellBridge vai no split com `totalFixedValue`, para não ser cobrada uma vez por parcela.
- **A conferir no sandbox antes do código:**
  - se cada parcela tem guarda própria;
  - se a devolução pelo parcelamento (`POST /v3/installments/{id}/refund`) funciona com o dinheiro guardado.
- **Fontes:** a documentação do Asaas, lida em 19/11/2026:
  - "Criar uma cobrança parcelada"
  - "Criar parcelamento"
  - "Split em parcelamentos"
  - "Valores sob garantia da Conta Escrow"
