# 2026-11-23: Cancelamento, devolução e reembolso contam no mês em que aconteceram

**Decisão:** uma venda paga num mês e cancelada, devolvida ou reembolsada depois continua como venda no mês do pagamento. O mês em que o cancelamento aconteceu desconta a venda ("Cancelados de meses anteriores: −R$ 100"), como no extrato do Mercado Livre. O mês fecha à meia-noite do dia 1º, no horário de Brasília, e depois disso os números dele não mudam. Guilherme aprovou o plano em 18/11/2026 ("Aprovo todas", Margot#960) e escolheu a forma em 23/11/2026: "vamos de mercado livre".

**Substitui:** a opção A de 15/11 (`docs/decisions.md`, "A venda conta no mês em que foi paga"), em que cancelamento e reembolso ficavam no mês do pagamento da venda. A regra da data de pagamento continua igual.

- **Exemplo:** venda de R$ 100 paga em 28/10 e cancelada em 03/11. Outubro mostra a venda de R$ 100. Novembro mostra −R$ 100 na receita e tira do lucro o que ela tinha dado (receita menos produtos e taxas). Somando os dois meses, dá zero.
- **Venda paga e cancelada no mesmo mês** continua sem contar, como antes. Pedido nunca pago não conta em mês nenhum.
- **Data do cancelamento:** cada pedido ganhou `orders.reversed_at` (migração 0111), a primeira vez que o SellBridge vê uma venda paga como cancelada ou devolvida (`reversedAtOfKnownOrder` em `packages/shared/src/domain/sale-date.ts`). Pedido que já chega devolvido fica com a data do pagamento. Os pedidos antigos pegaram a primeira data de cancelado ou devolvido do histórico (`order_status_changes`) depois do pagamento ou, sem histórico, a própria data do pagamento, o que mantém a conta como estava.
- **Reembolso e devolução** contam pela data em que o ajuste foi gravado (`order_adjustments.created_at`). **Comissão** fica com a venda.
- **Onde vale (PR do revendedor):** Financeiro (totais, gráfico, lista e planilha), painel, relatório de vendas e o resumo financeiro da API pública, que leem as mesmas consultas (`packages/database/src/repositories/reports.ts`). A lista de pedidos da API pública continua mostrando só os pedidos do período (`filedInPeriodOnly`), para um pedido nunca aparecer em dois meses; o valor de cada pedido segue a regra nova. Na lista do Financeiro, a venda de outro mês aparece no dia do cancelamento, com valor negativo e "venda de 28/10"; a venda que foi cancelada depois aparece no mês dela, com "cancelado em 03/11". A planilha ganhou as colunas "Conta no período como" e "Cancelado ou devolvido em".
- **Relatório de vendas:** a linha "Cancelados de meses anteriores" sob a receita e a aba "De meses anteriores". "Pedidos do período" conta cada pedido pela situação que ele tinha quando o mês acabou.
- **Meses já guardados:** o relatório guardado passou para a versão 3 e é recalculado uma vez na próxima leitura.
- **Fica para o PR seguinte:** relatório do fornecedor (e as vendas do painel do fornecedor) e relatório da equipe, depois que o extrato do fornecedor entrar, para os dois PRs não mexerem nos mesmos arquivos.

## Limites conhecidos

- **Reembolso parcial num mês e devolução no outro:** o reembolso já descontado no primeiro mês não volta no mês da devolução, então o lucro somado dos dois meses fica menor pelo valor do reembolso. É raro e fica registrado aqui.
- **Valor do reembolso que muda depois:** o Mercado Livre manda o total reembolsado e o SellBridge guarda uma linha só por pedido, datada do primeiro reembolso. Se o valor aumentar num mês seguinte, o aumento conta no mês do primeiro reembolso.
- **Tarifa ou frete do Mercado Livre que chega atrasado** num mês já fechado continua como antes: o mês guardado fica como foi guardado.

## Descartado

- **Tirar a venda do mês do pagamento quando ela é cancelada** (a regra antiga): o mês fechado mudava depois, e o Financeiro e o relatório guardado deixavam de bater.
- **Fechar o mês com uma tarefa agendada no dia 1º:** com cada coisa no mês em que aconteceu, o número do mês já é o mesmo não importa quando alguém abre o relatório. O relatório guardado continua como proteção.
