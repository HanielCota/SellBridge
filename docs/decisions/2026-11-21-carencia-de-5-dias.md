# 2026-11-21: Carência da mensalidade de 5 dias

**Decisão:** quando a mensalidade do revendedor vence sem pagamento, o plano continua por 5 dias a partir do vencimento (antes, 7). Vem do contrato do Vendedor (texto do cliente de 20/11/2026, seção 9: "Revendedor: 5 dias de tolerância na assinatura, depois bloqueio"). Guilherme, 21/11/2026, na Central, sobre o plano: "Aprovo os quatro".

## Como ficou

- `BILLING_PAST_DUE_GRACE_DAYS` passa a ter padrão 5. Continua mudando pela variável, de 0 a 60.
- A contagem não mudou: o plano vale até o fim do dia do vencimento mais os dias de carência, no horário de Brasília. Mensalidade que vence em 19/12: com 5 dias, o plano vale até 23/12 às 23h59 e some em 24/12.
- **Quem já estava atrasado não perde dias.** O estado da assinatura é recalculado a cada leitura do Asaas, então trocar o número cortaria na hora quem estivesse no 6º ou 7º dia, e a tela de assinatura já tinha mostrado a essa pessoa o último dia com 7. Mensalidade vencida antes de 01/12/2026 fica com pelo menos 7 dias (`SHORTER_GRACE_FROM_DUE_DATE` em `packages/payments/src/asaas/subscription-state.ts`). A data é a do lançamento das cobranças dos planos; se esta mudança entrar no ar depois dela, uma mensalidade vencida entre 01/12 e o dia da mudança passa a ter 5 dias.
- Conferido em 21/11/2026 (só os nomes das variáveis do site no Coolify): a produção não define `BILLING_PAST_DUE_GRACE_DAYS`, então o padrão novo vale lá; e as cobranças dos planos ainda estão desligadas (`BILLING_UNLIMITED`), então ninguém está em carência hoje. Se alguém definir a variável à mão, o padrão deixa de valer.

## Descartado

- **Guardar por mensalidade a carência prometida.** Resolveria qualquer data de entrada no ar, mas exigiria uma coluna nova e uma regra a mais em todo recálculo, para um caso que só existe na semana da troca.
