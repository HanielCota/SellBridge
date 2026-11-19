# 2026-11-19: Exclusão de conta travada enquanto houver pedido ou dinheiro em aberto

- **Decisão (dono do produto, "Pode fazer assim então" e "Aprovo o plano pode começar", chat da Central):** nenhuma conta, de revendedor ou de fornecedor, é excluída enquanto tiver pedido em andamento ou dinheiro a receber ou retido.
  - A tela mostra o que falta resolver.
  - O servidor recusa a exclusão antes de cancelar a assinatura ou apagar qualquer dado.
  - É o que o Mercado Livre, a Shopee e o próprio Asaas fazem ao fechar uma conta.
- **Muda a entrada de 2026-10-16 "Exportar e excluir os próprios dados" (item 30.a):** a exclusão continua igual (assinatura, lojas, organização e arquivos, nessa ordem), mas só começa sem pendência.
- **Contam só as contas que vão embora com a pessoa**, aquelas de que ela é a única dona. Conta com outro dono fica com ele e não trava nada.

## O que trava

- **Pedido pago e ainda não enviado**, ou enviado e ainda não entregue (`orders.status` `paid` ou `shipped`).
  - Pedido "aguardando pagamento" não trava: o comprador não pagou e o marketplace cancela sozinho.
- **Pacote do fornecedor** para enviar (encaminhado, aceito, separando, pronto) ou a caminho (enviado).
- **Pagamento ao fornecedor em andamento:** em análise, ou com o checkout ainda aceitando pagamento. Um checkout abandonado e vencido não trava.
- **Dinheiro ainda em jogo:**
  - pago e retido no Asaas, até ele liberar ao fornecedor;
  - reembolso pedido e ainda não concluído;
  - reembolso parado com a equipe ou recusado pelo provedor.
  - O revendedor vê esse dinheiro como "pagos a fornecedores e ainda retidos"; o fornecedor vê a parte dele (o valor menos a taxa da SellBridge) como "a receber", com a data em que libera ou "7 dias depois da entrega".
  - No Mercado Pago, o dinheiro aprovado já está na conta do fornecedor e não trava.
- **Devolução em análise**, dos dois lados.

## Pedido parado

- Pedido ou pacote sem movimento há mais de **60 dias** não trava.
- Sem esse prazo, uma loja desconectada que nunca mais atualiza prenderia a conta para sempre.
- A conta vai até o dia 60: o pedido do dia 60 trava, e o do dia 61 não.
  - O pedido conta da data do pagamento, ou da data da compra quando não há pagamento.
  - O pacote conta da última mudança de situação.
- Dinheiro e devolução em análise travam sempre, sem prazo.

## O fornecedor que sai

- O catálogo continua existindo (só perde o vínculo com a conta, como antes).
- A loja do fornecedor fica **fechada para vendas**, o mesmo estado de férias: os anúncios dos revendedores vão para estoque zero, e a sincronização é pedida na hora.
- A equipe pode reabrir a loja se assumir o catálogo.
- Antes, os revendedores continuavam vendendo um produto que ninguém enviava e ninguém conseguia pagar.

## Descartado

- **Exclusão agendada** (excluir sozinha quando tudo fechasse): a pessoa não sabe quando a conta some, e algo novo pode entrar no meio.
- **Contar o prazo de devolução depois da entrega:** só trava a devolução já aberta.
