# 2026-11-20: A devolução que volta ao estoque lança a entrada no Bling

Muda o "Fora" do Passo 2 de [`2026-11-19-estoque-do-bling-automatico.md`](2026-11-19-estoque-do-bling-automatico.md) para a devolução. O cancelamento depois do envio continua de fora.

**Decisão:** quando o fornecedor põe uma devolução de volta à venda, o SellBridge lança no Bling uma entrada de estoque que desfaz a saída da venda. Guilherme, 20/11/2026, na lista de regressões de 18 e 19/11, repassada pela Central: "Aprovo os três".

## Por quê

Com o estoque do Bling automático, a conferência de 15 minutos grava no SellBridge o saldo do Bling. A peça devolvida voltava ao estoque do SellBridge, mas não ao Bling, e sumia na conferência seguinte.

## Como funciona

- **O que é lançado:** `POST /estoques` com a operação `E`, o mesmo produto do Bling e a mesma quantidade da saída da venda, no depósito padrão. A observação diz "SellBridge: devolução do pedido <número>".
- **Só desfaz o que o SellBridge lançou:** a entrada só sai quando a saída daquela venda foi lançada com certeza. Não há entrada automática quando:
  - a venda saiu com nota pelo SellBridge;
  - a saída ficou "incerta";
  - a saída "falhou".

  Nesses casos o estoque do Bling mexeu de outro jeito, e uma entrada poderia somar duas vezes.

- **Os mesmos cuidados da saída:**
  - a entrada fica na mesma tabela, `erp_stock_exits`, que ganhou a coluna `operation` ("exit" ou "entry");
  - a linha é reservada antes da chamada, uma por item e por operação;
  - resultado incerto ou recusado vai para Problemas e nunca é repetido;
  - roda na mesma rodada de 1 minuto das saídas.
- **Fonte:** OpenAPI oficial do Bling, `POST /estoques`, lida em 20/11/2026: `operacao` aceita `B` (Balanço), `E` (Entrada) e `S` (Saída).

## Descartado

- **Descontar a peça na conferência em vez de lançar no Bling:** o Bling do fornecedor ficaria errado para sempre.
- **Lançar a entrada de toda devolução, mesmo quando o SellBridge não lançou a saída:** pode contar a peça duas vezes no Bling.
