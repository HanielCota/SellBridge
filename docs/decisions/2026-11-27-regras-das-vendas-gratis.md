# 2026-11-27: Regras das 20 vendas grátis

**Decisão:** três regras de negócio para a oferta das 20 vendas grátis e do plano Essencial.

- **Pago sempre vai.** Pedido que o comprador já pagou vai sempre para o fornecedor, no envio automático e quando o revendedor encaminha, mesmo sem plano (vendas grátis acabaram, mensalidade atrasada além da carência ou plano cancelado). A falta de plano só bloqueia o que é novo: venda lançada à mão, loja nova e anúncio novo. O revendedor vê o aviso para escolher um plano.
- **Devolve a vaga.** Venda paga que depois é cancelada ou devolvida devolve a vaga grátis; a próxima venda paga usa a vaga livre.
- **Zera e ganham 20.** Contas criadas antes da oferta (até 26/11/2026) começam do zero, como conta nova. A contagem começa no dia em que o conserto entra em produção (migração `0121_free_sales_restart`); a partir daí, toda venda paga conta, inclusive na fase de lançamento.

Também: conta que já pagou alguma mensalidade (assinatura ligada ou mês pré-pago) não volta para as vendas grátis, mesmo antes de a data do primeiro pagamento ser gravada.

**Quem decidiu.** Guilherme, 27/11/2026, depois da revisão do PR #393: "Pago sempre vai", "Devolve a vaga" e "Zera e ganham 20". Sobre o início da contagem das contas antigas: "B: dia do conserto".

## Descartado

- **Bloquear o pedido pago sem plano** e só avisar o revendedor: o comprador ficaria sem receber.
- **Começar a contagem das contas antigas no fim da fase de lançamento** (opção A): escolhida a data do conserto.
- **Manter a vaga gasta** em venda cancelada ou devolvida.
