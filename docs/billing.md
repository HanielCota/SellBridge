# Planos e cobrança do SaaS

A página `/assinatura`, acessível pelo menu da conta, apresenta os cinco planos pagos do plano
mestre do cliente (decisão de 18/11/2026): não há plano gratuito nem período de teste.

| Plano    | Preço de referência | Lojas | Anúncios | Extra                                     |
| -------- | ------------------- | ----- | -------- | ----------------------------------------- |
| Start    | R$ 97/mês           | 3     | 300      |                                           |
| Pro      | R$ 197/mês          | 5     | 1.000    |                                           |
| Business | R$ 397/mês          | 10    | 3.000    |                                           |
| Black    | R$ 697/mês          | 20    | 8.000    |                                           |
| Elite    | R$ 997/mês          | 40    | 20.000   | Atendimento prioritário (resposta em 8 h) |

Os limites ficam em `packages/shared/src/domain/billing.ts`; os preços exibidos e cobrados são os
cadastrados no Stripe. O resto do sistema é igual em todos os planos. A taxa da plataforma por venda
(configurada no admin) vale junto com a mensalidade e é citada na página.
A assinatura pertence à organização; somente seu proprietário pode contratar ou acessar
as faturas, atualizar o cartão, trocar de plano e cancelar.

## Sem plano e transição

- **Sem plano** (conta nova, assinatura cancelada ou pagamento não feito depois da carência): não
  conecta loja nova nem publica anúncio novo. Pedidos, anúncios já no ar, estoque, preço e
  reconexão de loja continuam. A tela de lojas e o início da conexão mandam para `/assinatura`
  antes da página de consentimento do marketplace.
- **Transição:** contas criadas antes de `BILLING_LAUNCHED_AT` continuam sem limites até
  `BILLING_TRANSITION_ENDS_AT` (30 dias recomendados). O painel ("Precisa de você") e a página
  avisam com o último dia; nos 7 dias finais o aviso fica vermelho.
- **Atendimento prioritário:** o chamado de uma conta Elite abre como prioridade alta (urgente
  continua urgente).

## Ativação

1. No Stripe (primeiro no modo de teste), crie os produtos Start, Pro, Business, Black e Elite,
   cada um com um preço fixo em BRL, recorrência mensal e quantidade unitária.
2. Customer Portal: atualização do cartão, faturas, cancelamento ao fim do período e troca entre
   os cinco preços. Em "Downgrades", agende a mudança para o fim do período (subir de plano vale na
   hora, com rateio). Ligue as novas tentativas e os e-mails de cobrança falha.
3. Cadastre `https://SEU_DOMINIO/api/webhooks/stripe` com os eventos
   `customer.subscription.created`, `updated`, `deleted`, `paused` e `resumed`, `invoice.paid`,
   `invoice.payment_failed`, `checkout.session.completed` e
   `checkout.session.async_payment_succeeded`. No desenvolvimento use `pnpm billing:listen`.
4. Defina no serviço web `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_START_PRICE_ID`,
   `STRIPE_PRO_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`, `STRIPE_BLACK_PRICE_ID`,
   `STRIPE_ELITE_PRICE_ID`, `BILLING_LAUNCHED_AT` e `BILLING_TRANSITION_ENDS_AT` (ISO 8601 em UTC,
   por exemplo `2026-12-01T03:00:00Z` para a meia-noite de Brasília), e retire `BILLING_UNLIMITED`.
   Opcional: `STRIPE_PORTAL_CONFIGURATION_ID`.

Sem a configuração completa, os planos aparecem como “Em breve”; não há checkout
nem limite sobre a operação. Em produção isso só é aceito de propósito: com
`NODE_ENV=production`, o serviço web não inicia se faltar alguma das variáveis acima, a menos que
`BILLING_UNLIMITED=true` diga que a operação roda sem limites. Não há cartão de crédito
armazenado pelo SellBridge. A coleta do cartão e a cobrança mensal ficam no Stripe.

## Fluxo e regras

O Checkout cria uma assinatura recorrente para um customer exclusivo da organização.
Quem já tem assinatura ativa e escolhe outro plano vai à confirmação do portal
(`subscription_update_confirm`), que mostra o novo valor antes de aceitar; o mesmo plano, ou uma
assinatura com pagamento pendente, abre o portal normal.
A criação do customer é idempotente; requisições de checkout são serializadas por
organização, sessões abertas anteriores são expiradas e uma assinatura existente abre
o portal em vez de criar outra. O retorno de sucesso nunca libera um plano: somente
um webhook assinado sincroniza o estado confirmado pelo provedor.

O endpoint valida a assinatura com o corpo original e tolerância de tempo do SDK.
Os eventos são deduplicados em transação; há bloqueio por customer e consulta ao
estado atual no Stripe para lidar com retentativas e eventos fora de ordem. Falhas
respondem 500 para que o Stripe reenvie o evento. Eventos de clientes externos ao
SellBridge não alteram dados locais.

Apenas `active`, `trialing` ou `past_due`, com período vigente e preço conhecido, liberam
os limites pagos. Na inadimplência (`past_due`), o período vigente termina
`BILLING_PAST_DUE_GRACE_DAYS` dias (padrão 7) depois da renovação que falhou: o webhook grava
essa data em `period_end`, e o cliente vê o aviso "Pagamento da assinatura pendente" no painel
e em `/assinatura`, com o último dia. Depois disso, ou com `unpaid`, pausa ou término, a conta fica sem plano ("Pagamento da
assinatura não realizado").
Cancelamento ao final do período preserva o plano até seu encerramento. Dados,
conexões e anúncios existentes não são removidos. Os limites impedem novas
conexões e novos anúncios; atualização de preço, reconexão de uma loja já ativa e
consulta de dados continuam disponíveis. A cota de anúncios conta **publicações vivas por loja
de destino**: um anúncio em duas lojas ocupa duas vagas; publicações com erro não contam (as de
lojas desconectadas continuam contando, porque voltam ao ar na reconexão). "Reprocessar"
pede vaga para cada publicação com erro que volta à fila. A criação via API e em lote usa a mesma
regra dos anúncios individuais. O bloqueio por organização evita ultrapassar limites
com requisições simultâneas.

Nenhuma chamada ao Stripe acontece com uma linha travada. O checkout cria o customer fora de
transação e serializa por organização com uma trava consultiva (`pg_try_advisory_xact_lock`),
que não segura linha: a publicação e a conexão de loja nunca esperam o Stripe; um segundo
clique enquanto o primeiro abre o pagamento recebe "Já estamos abrindo o pagamento". O webhook
lê o estado no Stripe antes da transação, e vale a leitura mais recente (`last_event_created`
guarda a hora da leitura em milissegundos). Toda chamada tem 5 s de limite e 1 retentativa.

## Validação antes de produção

No modo de teste do Stripe, contrate cada plano e confira a confirmação pelo webhook,
renovação, troca de plano, cartão recusado, recuperação do pagamento, faturas e
cancelamento ao fim do período. Reenvie eventos e altere a ordem das entregas.
Verifique também limites com requisições simultâneas e autorização com outro membro.
Os testes locais exercitam assinatura de webhook, estados de assinatura, isolamento,
deduplicação e limites; pagamentos reais dependem de uma conta Stripe configurada.

Referências: [Stripe Subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks),
[Checkout](https://docs.stripe.com/api/checkout/sessions/create) e
[Customer Portal](https://docs.stripe.com/customer-management).

## Validação realizada

O relatório de configuração e teste integrado está em [billing-validation.md](billing-validation.md).
Para desenvolvimento local, use `pnpm billing:listen` antes de iniciar o aplicativo.
