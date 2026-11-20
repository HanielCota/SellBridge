# 2026-11-19: Remover o Stripe

Segue [2026-11-19-mensalidade-pelo-asaas.md](2026-11-19-mensalidade-pelo-asaas.md): a mensalidade dos
planos passou a ser cobrada pelo Asaas, e o Stripe saiu do produto.

- **Decisão (Guilherme, pelo chat da Central):**
  - 19/11: "Sim, remove", num PR separado depois do da mensalidade.
  - 20/11: "N vamos usar de jeito nenhum o stripe somente asaas viu tem chat ainda achando e
    arrumando coisa de stripe é pra remover o stripe only asaas".
- **O que sai:**
  - o cliente do Stripe;
  - o webhook e a rota `/api/webhooks/stripe`;
  - as variáveis `STRIPE_*` (esquema de ambiente, `.env.example`, configuração dos testes de
    navegador);
  - as dependências `stripe` e `@stripe/cli` e o script `billing:listen`;
  - o caminho do Stripe na exclusão de conta;
  - o registro da validação em modo de teste (`docs/billing-validation.md`).
- **Banco:** a migração `0099_drop_stripe_billing` deixa sem plano as contas ainda ligadas ao Stripe
  e apaga a coluna `billing_accounts.provider`. Ela faz o mesmo que a exclusão faz com um cliente:
  apaga os vínculos, o plano volta a "sem plano" e a situação fica "cancelada". Só contas de teste
  têm esse vínculo. A produção nunca cobrou pelo Stripe: em 19/11 e de novo em 20/11, nenhuma
  variável `STRIPE_*` existia no Coolify (conferido só pelos nomes). Uma conta marcada como Stripe
  e sem vínculo (um plano dado à mão) fica como está.
- **Exclusão de conta:** só o Asaas é cancelado antes de apagar os dados.
- **Mantido:**
  - a tabela `billing_events`, que também evita aplicar duas vezes um aviso do Asaas;
  - o histórico em `docs/decisions.md` e nas revisões antigas, que contam o que foi feito na época.
- **Descartado:** manter o Stripe para contas antigas durante uma transição. Não há conta paga pelo
  Stripe para atender.
